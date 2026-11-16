import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { summarizeErrorForLog } from '@iwana/db';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import type { IncomingMessage } from 'node:http';

/**
 * Cliente HTTP de solo lectura de la API de UISP (ADR-110 D15; spec 2026-11-15 «usuarios»
 * §2.1, §4).
 *
 * - Solo `GET`, con `X-Auth-App-Key`. La clave nunca se registra ni viaja en un error.
 * - Tiempo de espera total por intento y reintentos acotados solo ante red, tiempo agotado o 5xx.
 * - TLS: cada petición abre su propio socket TLS y verifica antes de enviar un solo byte.
 *   Sin huella fijada, la verificación es la normal de Node (cadena y nombre). Con huella
 *   (`trustedCertificateSha256`), el socket de esa petición acepta SOLO el certificado cuya
 *   SHA-256 coincide; la verificación por CA se omite únicamente en ese socket dedicado, porque
 *   un certificado autofirmado nunca la superaría, y la huella la sustituye. Nunca se relaja la
 *   verificación global del proceso.
 * - La respuesta se acota en tamaño y se devuelve como JSON sin registrar su contenido (PII).
 * - SSRF (S-1): nunca conecta a direcciones internas, de enlace local, multidifusión o
 *   reservadas (`isBlockedUispAddress`). Una IP literal se valida antes de conectar; un nombre
 *   se resuelve DENTRO del propio connect (`lookup` del socket) y se rechaza si CUALQUIERA de
 *   sus direcciones está bloqueada, así un DNS que cambia entre la validación y la conexión
 *   (rebinding) no la esquiva. Motivo `DESTINO_NO_PERMITIDO`, no reintentable. La única
 *   excepción es `allowedPrivateHosts` (lista exacta, solo pruebas; prohibida en producción).
 * - TLS mínimo 1.2 en el socket dedicado.
 */
export interface UispApiConnection {
  baseUrl: string;
  appKey: string;
  /** SHA-256 hex en minúsculas del certificado del servidor, o `null` para verificar por CA. */
  trustedCertificateSha256: string | null;
}

export type UispApiErrorKind = 'UNAUTHORIZED' | 'UNREACHABLE';

/** Motivo técnico sin PII ni la clave; se devuelve al administrador para orientar el arreglo. */
export type UispApiErrorReason =
  | 'CREDENCIAL_RECHAZADA'
  | 'CERTIFICADO_NO_COINCIDE'
  | 'CERTIFICADO_NO_CONFIABLE'
  | 'TIEMPO_AGOTADO'
  | 'RED'
  | 'RESPUESTA_INVALIDA'
  | 'RESPUESTA_DEMASIADO_GRANDE'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'DESTINO_NO_PERMITIDO';

export class UispApiError extends Error {
  /** Código de dominio sin PII (`UISP_<tipo>_<motivo>`); lo recoge `summarizeErrorForLog`. */
  readonly code: string;

  constructor(
    readonly kind: UispApiErrorKind,
    readonly reason: UispApiErrorReason,
    readonly retryable: boolean,
  ) {
    super(`UISP ${kind} (${reason})`);
    this.name = 'UispApiError';
    this.code = `UISP_${kind}_${reason}`;
  }
}

export interface UispApiClientOptions {
  /** Tiempo máximo por intento (conexión, TLS, respuesta completa). */
  timeoutMs: number;
  /** Reintentos adicionales ante red, tiempo agotado o 5xx. */
  retries: number;
  retryDelayMs: number;
  /** Tope del cuerpo de la respuesta. */
  maxResponseBytes: number;
  /**
   * Hosts exactos (como quedan en la URL: `127.0.0.1`, `::1`, `uisp.local`) exentos del filtro
   * SSRF. Solo pruebas y desarrollo (`MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS`, prohibida en
   * producción por app.config).
   */
  allowedPrivateHosts: readonly string[];
  /** Resolución de nombres (todas las direcciones). Inyectable solo para pruebas. */
  lookupAll: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

export const UISP_API_CLIENT_OPTIONS = Symbol('UISP_API_CLIENT_OPTIONS');

function systemLookupAll(hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    ),
  );
}

export const DEFAULT_UISP_API_CLIENT_OPTIONS: UispApiClientOptions = {
  timeoutMs: 15_000,
  retries: 2,
  retryDelayMs: 500,
  maxResponseBytes: 5 * 1024 * 1024,
  allowedPrivateHosts: [],
  lookupAll: systemLookupAll,
};

/** Variable de entorno de la excepción SSRF (lista separada por comas); solo pruebas. */
export const MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS_ENV = 'MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS';

/** `127.0.0.1, [::1]` → `['127.0.0.1', '::1']` (minúsculas, sin corchetes ni vacíos). */
export function normalizeUispHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/u, '$1');
}

export function parseAllowedPrivateHosts(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map(normalizeUispHost)
    .filter((host) => host.length > 0);
}

/** Opciones del proveedor `UISP_API_CLIENT_OPTIONS` a partir de la configuración. */
export function uispApiClientOptionsFromConfig(config: {
  get<T = string>(key: string): T | undefined;
}): Partial<UispApiClientOptions> {
  return {
    allowedPrivateHosts: parseAllowedPrivateHosts(
      config.get<string>(MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS_ENV),
    ),
  };
}

// ── Lista de bloqueo SSRF (S-1) ─────────────────────────────────────────────────────────
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const BLOCKED_V6: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
const BLOCKLIST_V4 = new BlockList();
for (const [network, prefix] of BLOCKED_V4) BLOCKLIST_V4.addSubnet(network, prefix, 'ipv4');
const BLOCKLIST_V6 = new BlockList();
for (const [network, prefix] of BLOCKED_V6) BLOCKLIST_V6.addSubnet(network, prefix, 'ipv6');

/**
 * IPv4 de una dirección mapeada (`::ffff:0:0/96`), en cualquier escritura (`::ffff:127.0.0.1`,
 * `::ffff:7f00:1`, `0:0:0:0:0:ffff:…`); `null` si no lo es. El parser WHATWG la normaliza.
 */
function mappedIpv4(address: string): string | null {
  let normalized: string;
  try {
    normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(normalized);
  if (!hex) return null;
  const high = Number.parseInt(hex[1]!, 16);
  const low = Number.parseInt(hex[2]!, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

/**
 * ¿La dirección (IPv4 o IPv6, con o sin corchetes) es interna, de enlace local, multidifusión o
 * reservada? A una IPv4 mapeada en IPv6 se le aplican las reglas IPv4. Un texto que no es IP
 * cuenta como bloqueado.
 */
export function isBlockedUispAddress(address: string): boolean {
  const plain = normalizeUispHost(address).split('%')[0]!;
  const version = isIP(plain);
  if (version === 4) return BLOCKLIST_V4.check(plain, 'ipv4');
  if (version !== 6) return true;
  const mapped = mappedIpv4(plain);
  if (mapped !== null) return BLOCKLIST_V4.check(mapped, 'ipv4');
  return BLOCKLIST_V6.check(plain, 'ipv6');
}

/** Código del error del `lookup` propio; el socket lo propaga y se traduce a DESTINO_NO_PERMITIDO. */
const DESTINATION_BLOCKED_CODE = 'ERR_UISP_DESTINATION_BLOCKED';

function destinationBlocked(): UispApiError {
  return new UispApiError('UNREACHABLE', 'DESTINO_NO_PERMITIDO', false);
}

export const UISP_VERSION_PATH = '/crm/api/v1.0/version';
export const UISP_ADMINS_PATH = '/crm/api/v1.0/users/admins';

/** Huella `AB:CD:…` de Node → hex en minúsculas sin separadores. */
export function normalizeFingerprint(value: string): string {
  return value.replaceAll(':', '').toLowerCase();
}

/** Une la dirección base (con o sin prefijo de ruta) y una ruta absoluta de la API. */
export function uispUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password) {
    // El contrato y el CHECK de la 211 ya lo impiden; defensa en profundidad.
    throw new UispApiError('UNREACHABLE', 'RED', false);
  }
  const prefix = base.pathname.replace(/\/+$/u, '');
  return new URL(`${prefix}${path}`, `${base.protocol}//${base.host}`);
}

@Injectable()
export class UispApiClient {
  private readonly logger = new Logger(UispApiClient.name);
  private readonly options: UispApiClientOptions;

  private readonly allowedHosts: ReadonlySet<string>;

  constructor(
    @Optional() @Inject(UISP_API_CLIENT_OPTIONS) options?: Partial<UispApiClientOptions>,
  ) {
    this.options = { ...DEFAULT_UISP_API_CLIENT_OPTIONS, ...(options ?? {}) };
    this.allowedHosts = new Set(this.options.allowedPrivateHosts.map(normalizeUispHost));
    if (this.allowedHosts.size > 0) {
      // Excepción SSRF activa (solo pruebas): aviso explícito al arrancar.
      this.logger.warn(
        `[migration] Excepción SSRF de UISP activa para: ${[...this.allowedHosts].join(', ')}. Solo para pruebas.`,
      );
    }
  }

  /** `GET /crm/api/v1.0/version`: valida dirección, certificado y clave. */
  async checkVersion(connection: UispApiConnection): Promise<void> {
    const body = await this.getJson(connection, UISP_VERSION_PATH);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new UispApiError('UNREACHABLE', 'RESPUESTA_INVALIDA', false);
    }
  }

  /** `GET /crm/api/v1.0/users/admins`: lista cruda; la valida quien la consume. */
  async listAdmins(connection: UispApiConnection): Promise<unknown> {
    return this.getJson(connection, UISP_ADMINS_PATH);
  }

  async getJson(connection: UispApiConnection, path: string): Promise<unknown> {
    const url = uispUrl(connection.baseUrl, path);
    let attempt = 0;
    for (;;) {
      try {
        return await this.once(connection, url);
      } catch (error) {
        const failure =
          error instanceof UispApiError ? error : new UispApiError('UNREACHABLE', 'RED', true);
        if (!failure.retryable || attempt >= this.options.retries) {
          // Solo host, ruta y resumen saneado: nunca la clave ni el cuerpo.
          this.logger.warn(
            `[migration] UISP ${url.host}${url.pathname} falló: ${summarizeErrorForLog(failure)} (intentos=${attempt + 1}).`,
          );
          throw failure;
        }
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs * attempt));
      }
    }
  }

  private once(connection: UispApiConnection, url: URL): Promise<unknown> {
    const pinned = connection.trustedCertificateSha256
      ? normalizeFingerprint(connection.trustedCertificateSha256)
      : null;
    const port = url.port ? Number(url.port) : 443;
    // `new URL` ya normalizó formas raras de IP (`2130706433`, `0x7f.1` → `127.0.0.1`).
    const host = url.hostname.replace(/^\[(.*)\]$/u, '$1');
    const exempt = this.allowedHosts.has(normalizeUispHost(host));
    const literal = isIP(host) !== 0;
    if (!exempt && literal && isBlockedUispAddress(host)) {
      return Promise.reject(destinationBlocked());
    }
    const lookupAll = this.options.lookupAll;
    // Resolución dentro del connect: se valida exactamente lo que el socket va a usar.
    const guardedLookup = (
      hostname: string,
      options: { all?: boolean } | undefined,
      callback: (...args: unknown[]) => void,
    ): void => {
      lookupAll(hostname).then(
        (addresses) => {
          if (addresses.length === 0) {
            callback(Object.assign(new Error('Sin direcciones'), { code: 'ENOTFOUND' }));
            return;
          }
          if (!exempt && addresses.some((entry) => isBlockedUispAddress(entry.address))) {
            callback(
              Object.assign(new Error('Destino no permitido'), { code: DESTINATION_BLOCKED_CODE }),
            );
            return;
          }
          if (options?.all) callback(null, addresses);
          else callback(null, addresses[0]!.address, addresses[0]!.family);
        },
        (error: unknown) => callback(error),
      );
    };

    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      let socket: TLSSocket | undefined;
      const finish = (error: UispApiError | null, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          socket?.destroy();
          reject(error);
        } else {
          resolve(value);
        }
      };
      const timer = setTimeout(
        () => finish(new UispApiError('UNREACHABLE', 'TIEMPO_AGOTADO', true)),
        this.options.timeoutMs,
      );

      socket = tlsConnect({
        host,
        port,
        // SNI = nombre del host (nunca una IP); la verificación del certificado usa el mismo.
        servername: literal ? undefined : host,
        // Verificación normal salvo en el socket dedicado con huella fijada (ver JSDoc).
        rejectUnauthorized: pinned === null,
        minVersion: 'TLSv1.2',
        ALPNProtocols: ['http/1.1'],
        ...(literal ? {} : { lookup: guardedLookup as never }),
      });
      socket.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === DESTINATION_BLOCKED_CODE) {
          finish(destinationBlocked());
          return;
        }
        const untrusted =
          typeof error.code === 'string' &&
          /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS_CERT_ALTNAME/u.test(error.code);
        finish(
          untrusted
            ? new UispApiError('UNREACHABLE', 'CERTIFICADO_NO_CONFIABLE', false)
            : new UispApiError('UNREACHABLE', 'RED', true),
        );
      });
      socket.once('secureConnect', () => {
        const tls = socket!;
        if (pinned !== null) {
          const fingerprint = tls.getPeerCertificate()?.fingerprint256;
          if (!fingerprint || normalizeFingerprint(fingerprint) !== pinned) {
            // Se corta antes de enviar la petición: la clave nunca sale hacia ese servidor.
            finish(new UispApiError('UNREACHABLE', 'CERTIFICADO_NO_COINCIDE', false));
            return;
          }
        } else if (!tls.authorized) {
          finish(new UispApiError('UNREACHABLE', 'CERTIFICADO_NO_CONFIABLE', false));
          return;
        }
        this.send(tls, url, connection.appKey, finish);
      });
    });
  }

  /** Envía el `GET` sobre el socket ya verificado y lee la respuesta acotada. */
  private send(
    socket: TLSSocket,
    url: URL,
    appKey: string,
    finish: (error: UispApiError | null, value?: unknown) => void,
  ): void {
    const req = httpsRequest({
      method: 'GET',
      host: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'application/json',
        'X-Auth-App-Key': appKey,
        Connection: 'close',
      },
      createConnection: () => socket,
    });
    req.once('error', () => finish(new UispApiError('UNREACHABLE', 'RED', true)));
    req.once('response', (res: IncomingMessage) => {
      const status = res.statusCode ?? 0;
      if (status === 401 || status === 403) {
        res.resume();
        finish(new UispApiError('UNAUTHORIZED', 'CREDENCIAL_RECHAZADA', false));
        return;
      }
      if (status >= 500) {
        res.resume();
        finish(new UispApiError('UNREACHABLE', 'HTTP_5XX', true));
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        finish(new UispApiError('UNREACHABLE', 'HTTP_4XX', false));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > this.options.maxResponseBytes) {
          finish(new UispApiError('UNREACHABLE', 'RESPUESTA_DEMASIADO_GRANDE', false));
          return;
        }
        chunks.push(chunk);
      });
      res.once('error', () => finish(new UispApiError('UNREACHABLE', 'RED', true)));
      res.once('end', () => {
        try {
          finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
        } catch {
          finish(new UispApiError('UNREACHABLE', 'RESPUESTA_INVALIDA', false));
        }
      });
    });
    req.end();
  }
}
