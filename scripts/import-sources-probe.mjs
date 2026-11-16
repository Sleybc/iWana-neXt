#!/usr/bin/env node
/**
 * Sonda de solo lectura de la fase FD de la importación multi-fuente (ADR-111 D4; referencia de
 * APIs §6, V1–V9). La ejecuta el ISP con sus credenciales en variables de entorno.
 *
 * - Un único punto de salida HTTP (`probeRequest`) valida método y ruta contra `ALLOWLIST` antes
 *   de abrir el socket: solo GET, más `POST /auth` de Siigo. Sin redirecciones.
 * - AdminOLT: sin HTTP; solo lee el CSV exportado.
 * - El informe guarda la forma de las respuestas (rutas de claves, tipos, % de nulos), patrones de
 *   campos de formato y valores solo de una lista blanca de enumerados no personales. Antes de
 *   escribirlo se verifica que no contenga ninguna credencial ni el token de Siigo.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { connect as tlsConnect } from 'node:tls';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_OPTIONS = Object.freeze({
  timeoutMs: 30_000,
  siigoTimeoutMs: 120_000,
  siigoIntervalMs: 700,
  siigoMaxErrorStreak: 5,
  maxCallsPerSource: 30,
  maxBytes: 25 * 1024 * 1024,
});

export class ProbeError extends Error {
  constructor(code, fatal = false) {
    super(code);
    this.name = 'ProbeError';
    this.code = code;
    this.fatal = fatal;
  }
}

// ---------------------------------------------------------------- lista de salida permitida
const ID = '[A-Za-z0-9_-]{1,64}';
const rule = (method, pattern) => [method, new RegExp(`^${pattern}$`, 'u')];
export const ALLOWLIST = Object.freeze({
  wisphub: [
    rule('GET', '/clientes/'),
    rule('GET', `/clientes/${ID}/`),
    rule('GET', `/clientes/${ID}/perfil/`),
    rule('GET', `/clientes/${ID}/saldo/`),
    rule('GET', '/plan-internet/'),
    rule('GET', `/plan-internet/queue/${ID}/`),
    rule('GET', `/plan-internet/pppoe/${ID}/`),
    rule('GET', '/facturas/'),
    rule('GET', '/facturas/sigma/'),
    rule('GET', `/facturas/${ID}/`),
    rule('GET', '/router/'),
  ],
  uisp: [
    rule('GET', '/crm/api/v1\\.0/version'),
    rule('GET', '/crm/api/v1\\.0/scheduling/jobs'),
    rule('GET', '/crm/api/v1\\.0/scheduling/jobs/attachments'),
    rule('GET', '/crm/api/v1\\.0/scheduling/jobs/tasks'),
    rule('GET', `/crm/api/v1\\.0/scheduling/jobs/[0-9]{1,18}`),
    rule('GET', '/crm/api/v1\\.0/custom-attributes'),
    rule('GET', '/crm/api/v1\\.0/clients'),
    rule('GET', '/nms/api/v2\\.1/sites'),
    rule('GET', '/nms/api/v2\\.1/devices'),
  ],
  siigo: [
    rule('POST', '/auth'),
    rule('GET', '/v1/users'),
    rule('GET', '/v1/document-types'),
    rule('GET', '/v1/customers'),
    rule('GET', '/v1/invoices'),
    rule('GET', `/v1/invoices/${ID}`),
  ],
});
const QUERY_KEYS = new Set([
  'limit',
  'offset',
  'estado',
  'fecha_emision__range_0',
  'fecha_emision__range_1',
  'attributeType',
  'jobId',
  'page',
  'page_size',
  'active',
  'type',
  'date_start',
  'date_end',
]);
/** Parámetros cuyo valor fijamos nosotros y se pueden copiar al informe; el resto se anota `{id}`. */
const SAFE_QUERY_VALUES = new Set([...QUERY_KEYS].filter((k) => k !== 'jobId'));

/** Valida (fuente, método, URL) contra la lista fija. Se llama antes de cualquier socket. */
export function assertAllowed(source, method, base, url) {
  const rules = ALLOWLIST[source];
  if (!rules) throw new ProbeError('FUENTE_NO_PERMITIDA');
  if (url.origin !== base.origin || url.username || url.password || url.hash) {
    throw new ProbeError('DESTINO_NO_PERMITIDO');
  }
  const basePath = base.pathname.replace(/\/+$/u, '');
  if (!url.pathname.startsWith(`${basePath}/`) || /%2e|%2f|%5c|\\/iu.test(url.pathname)) {
    throw new ProbeError('RUTA_NO_PERMITIDA');
  }
  const rel = url.pathname.slice(basePath.length);
  if (!rules.some(([m]) => m === method)) throw new ProbeError('METODO_NO_PERMITIDO');
  if (!rules.some(([m, re]) => m === method && re.test(rel)))
    throw new ProbeError('RUTA_NO_PERMITIDA');
  for (const key of url.searchParams.keys()) {
    if (!QUERY_KEYS.has(key)) throw new ProbeError('PARAMETRO_NO_PERMITIDO');
  }
  if (method !== 'GET' && url.search) throw new ProbeError('PARAMETRO_NO_PERMITIDO');
}

const SENSITIVE_HEADER = /^(authorization|x-auth-app-key|x-auth-token|cookie)$/iu;
export function redactHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, SENSITIVE_HEADER.test(k) ? '[REDACTADO]' : v]),
  );
}

// ---------------------------------------------------------------- transporte (solo vía probeRequest)
const normFp = (fp) => fp.replaceAll(':', '').toLowerCase();

async function readCapped(iterable, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of iterable) {
    size += chunk.length;
    if (size > maxBytes) throw new ProbeError('RESPUESTA_DEMASIADO_GRANDE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function fetchErrorCode(error) {
  if (error instanceof ProbeError) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
    return new ProbeError('TIEMPO_AGOTADO');
  const code = String(error?.cause?.code ?? error?.code ?? '');
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/u.test(code))
    return new ProbeError('CERTIFICADO_NO_CONFIABLE');
  return new ProbeError('RED');
}

async function fetchTransport(url, method, headers, body, timeoutMs, maxBytes) {
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const buffer = res.body ? await readCapped(res.body, maxBytes) : Buffer.alloc(0);
    return { status: res.status, headers: Object.fromEntries(res.headers), body: buffer };
  } catch (error) {
    throw fetchErrorCode(error);
  }
}

/** UISP con certificado autofirmado: el socket acepta solo la huella fijada y se verifica antes de enviar. */
function pinnedTransport(url, method, headers, timeoutMs, maxBytes, pin) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let socket;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      if (error) reject(error);
      else resolvePromise(value);
    };
    const timer = setTimeout(() => finish(new ProbeError('TIEMPO_AGOTADO')), timeoutMs);
    const host = url.hostname.replace(/^\[|\]$/gu, '');
    const port = Number(url.port || 443);
    socket = tlsConnect({
      host,
      port,
      servername: isIP(host) ? undefined : host,
      rejectUnauthorized: false, // la huella sustituye a la CA solo en este socket
      minVersion: 'TLSv1.2',
      ALPNProtocols: ['http/1.1'],
    });
    socket.once('error', () => finish(new ProbeError('RED')));
    socket.once('secureConnect', () => {
      const fp = socket.getPeerCertificate()?.fingerprint256;
      if (!fp || normFp(fp) !== pin) return finish(new ProbeError('CERTIFICADO_NO_COINCIDE'));
      const req = httpsRequest({
        method,
        host,
        port,
        path: `${url.pathname}${url.search}`,
        headers: { ...headers, Connection: 'close' },
        createConnection: () => socket,
      });
      req.once('error', () => finish(new ProbeError('RED')));
      req.once('response', (res) => {
        readCapped(res, maxBytes).then(
          (buffer) =>
            finish(null, { status: res.statusCode ?? 0, headers: res.headers, body: buffer }),
          (error) => finish(error instanceof ProbeError ? error : new ProbeError('RED')),
        );
      });
      req.end();
    });
  });
}

/** Huella del certificado que presenta el servidor; no envía ningún byte de aplicación. */
export function presentedFingerprint(url, timeoutMs = 10_000) {
  return new Promise((resolvePromise) => {
    const host = url.hostname.replace(/^\[|\]$/gu, '');
    const socket = tlsConnect({
      host,
      port: Number(url.port || 443),
      servername: isIP(host) ? undefined : host,
      rejectUnauthorized: false,
    });
    const done = (value) => {
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    socket.once('error', () => done(null));
    socket.once('secureConnect', () => {
      const fp = socket.getPeerCertificate()?.fingerprint256;
      done(fp ? normFp(fp) : null);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ÚNICO punto de salida HTTP de la sonda. `conn`: { source, base (URL), headers, timeoutMs,
 * maxBytes, pin, budget: { calls, max }, minIntervalMs, maxErrorStreak, state }.
 */
export async function probeRequest(conn, method, path, query = {}, body) {
  const url = new URL(`${conn.base.pathname.replace(/\/+$/u, '')}${path}`, conn.base.origin);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  assertAllowed(conn.source, method, conn.base, url);
  if (body !== undefined && !(conn.source === 'siigo' && method === 'POST'))
    throw new ProbeError('CUERPO_NO_PERMITIDO');
  if (conn.state.aborted) throw new ProbeError('FUENTE_ABORTADA', true);
  if (conn.budget.calls >= conn.budget.max) throw new ProbeError('TOPE_DE_LLAMADAS', true);
  conn.budget.calls += 1;
  if (conn.minIntervalMs) {
    const wait = conn.state.lastAt + conn.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    conn.state.lastAt = Date.now();
  }
  const headers = { Accept: 'application/json', ...conn.headers };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = conn.pin
      ? await pinnedTransport(url, method, headers, conn.timeoutMs, conn.maxBytes, conn.pin)
      : await fetchTransport(url, method, headers, body, conn.timeoutMs, conn.maxBytes);
  } catch (error) {
    noteOutcome(conn, false);
    throw error;
  }
  noteOutcome(conn, res.status >= 200 && res.status < 300);
  return { ...res, sentHeaders: redactHeaders(headers) };
}

function noteOutcome(conn, ok) {
  if (!conn.maxErrorStreak) return;
  conn.state.errorStreak = ok ? 0 : conn.state.errorStreak + 1;
  if (conn.state.errorStreak >= conn.maxErrorStreak) conn.state.aborted = true;
}

// ---------------------------------------------------------------- anonimización
const DISCARD_KEY = /password|contrase|token|secret|access_key/iu;
const FORMAT_KEY = /fecha|date|created|updated|ultimo_cambio|coordenadas/iu;
const ENUM_PATHS = [
  'estado',
  'stamp.status',
  'type',
  'id_type.code',
  'person_type',
  'tipo_persona',
  'prefix',
  'active',
  'version',
  'attributeType',
  'status',
];
const COUNT_PATHS = [
  'count',
  'pagination.total_results',
  'pagination.page',
  'pagination.page_size',
];
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u;
const MAX_DISTINCT = 20;
const MAX_PATHS = 2000;

const endsWithPath = (norm, p) => norm === p || norm.endsWith(`.${p}`);

/** Patrón de forma: dígito → d, letras → a (rachas colapsadas), resto literal. */
export function patternOf(value) {
  return String(value)
    .replace(/\p{L}+/gu, 'a')
    .replace(/\d/gu, 'd')
    .slice(0, 40);
}

/** Valor enumerado copiable al informe, o null si podría ser personal. */
export function safeEnumValue(value, maxLen = 32) {
  if (typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  if (
    text.length > maxLen ||
    /@|\d{6,}|\d{1,3}(?:\.\d{1,3}){3}|(?:[0-9a-f]{2}[:-]){5}|[0-9a-f]{32,}/iu.test(text)
  )
    return null;
  return text;
}

function bump(map, key) {
  if (key in map) map[key] += 1;
  else if (Object.keys(map).length < MAX_DISTINCT) map[key] = 1;
  else map['(otros)'] = (map['(otros)'] ?? 0) + 1;
}

/** Forma de un JSON sin valores: por ruta de claves, tipos, nulos y, según lista blanca, patrón o valor. */
export function describeShape(json, { extraEnum = [] } = {}) {
  const campos = {};
  let descartados = 0;
  const enumPaths = [...ENUM_PATHS, ...extraEnum];
  const visit = (node, path) => {
    const norm = path.replaceAll('[]', '').replace(/^\./u, '');
    if (!(path in campos)) {
      if (Object.keys(campos).length >= MAX_PATHS) return;
      campos[path] = { total: 0, nulos: 0, tipos: {} };
    }
    const f = campos[path];
    f.total += 1;
    const type = node === null ? 'null' : Array.isArray(node) ? 'array' : typeof node;
    bump(f.tipos, type);
    if (node === null || node === undefined || node === '') f.nulos += 1;
    if (Array.isArray(node)) {
      f.longitudMax = Math.max(f.longitudMax ?? 0, node.length);
      for (const item of node) visit(item, `${path}[]`);
      return;
    }
    if (type === 'object') {
      const keys = Object.keys(node);
      const asMap = keys.length > 200;
      for (const key of keys) {
        if (DISCARD_KEY.test(key)) {
          descartados += 1;
          continue;
        }
        const safe = !asMap && SAFE_KEY.test(key) ? key : /^\d+$/u.test(key) ? '{n}' : '{clave}';
        visit(node[key], path ? `${path}.${safe}` : safe);
      }
      return;
    }
    if (node === null || node === '') return;
    const leaf = norm.split('.').pop() ?? '';
    const isEnum = enumPaths.some((p) => endsWithPath(norm, p));
    if (COUNT_PATHS.includes(norm) && typeof node === 'number') {
      f.valores ??= {};
      bump(f.valores, String(node));
    } else if (isEnum) {
      const v = safeEnumValue(node, extraEnum.some((p) => endsWithPath(norm, p)) ? 64 : 32);
      f.valores ??= {};
      if (v === null) f.valoresOmitidos = (f.valoresOmitidos ?? 0) + 1;
      else bump(f.valores, v);
    }
    if (isEnum || FORMAT_KEY.test(leaf)) {
      f.patrones ??= {};
      bump(f.patrones, patternOf(node));
    }
  };
  visit(json, '');
  delete campos[''];
  return { campos, descartados };
}

const RESPONSE_HEADER =
  /^(x-)?(rate-?limit|ratelimit)|^retry-after$|^x-total-count$|^link$|^x-pagination|^x-result-count/iu;
function interestingHeaders(headers) {
  const out = {};
  for (const [name, raw] of Object.entries(headers ?? {})) {
    if (!RESPONSE_HEADER.test(name)) continue;
    const value = Array.isArray(raw) ? raw.join(',') : String(raw);
    out[name.toLowerCase()] =
      name.toLowerCase() !== 'link' && /^[0-9a-z .,;=_-]{1,64}$/iu.test(value) ? value : 'presente';
  }
  return out;
}

const hmacIds = (salt, list, key) =>
  (Array.isArray(list) ? list : []).map((r) =>
    createHmac('sha256', salt)
      .update(String(r?.[key] ?? ''))
      .digest('hex'),
  );

/** Estabilidad entre dos lecturas por HMAC con sal de la corrida (la sal no se guarda). */
export function compareReads(salt, a, b, key) {
  const ha = hmacIds(salt, a, key);
  const hb = hmacIds(salt, b, key);
  const sb = new Set(hb);
  const common = ha.filter((h) => sb.has(h)).length;
  return {
    lectura1: ha.length,
    lectura2: hb.length,
    enComun: common,
    mismoConjunto: common === ha.length && ha.length === hb.length,
    mismoOrden: ha.length === hb.length && ha.every((h, i) => h === hb[i]),
  };
}

// ---------------------------------------------------------------- configuración
const SYSTEMS = {
  V1: 'WispHub',
  V2: 'WispHub',
  V3: 'WispHub',
  V4: 'WispHub',
  V5: 'UISP',
  V6: 'UISP',
  V7: 'UISP',
  V8: 'AdminOLT',
  V9: 'Siigo',
};
const SOURCES = ['wisphub', 'uisp', 'adminolt', 'siigo'];

function parseBaseUrl(raw, name) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ProbeError(`URL_INVALIDA:${name}`);
  }
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ProbeError(`URL_INVALIDA:${name}`);
  }
  return url;
}

export function parseArgs(argv) {
  const args = { only: null, out: null, adminoltCsv: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new ProbeError(`FALTA_VALOR:${a}`);
      return v;
    };
    if (a === '--only')
      args.only = next()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--out') args.out = next();
    else if (a === '--adminolt-csv') args.adminoltCsv = next();
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new ProbeError('ARGUMENTO_DESCONOCIDO'); // sin eco: podría ser una credencial
  }
  if (args.only?.some((s) => !SOURCES.includes(s))) throw new ProbeError('FUENTE_DESCONOCIDA');
  return args;
}

/** Directorio del informe: nuevo en el temp del sistema, o `--out` fuera del repo y vacío. */
export function resolveOutDir(out, repoRoot = REPO_ROOT) {
  if (!out) return mkdtempSync(join(tmpdir(), 'iwana-sonda-fuentes-'));
  const abs = resolve(out);
  const real = existsSync(abs) ? realpathSync(abs) : abs;
  for (const candidate of [abs, real]) {
    const rel = relative(realpathSync(repoRoot), candidate);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)))
      throw new ProbeError('SALIDA_DENTRO_DEL_REPO');
  }
  if (existsSync(abs) && readdirSync(abs).length > 0) throw new ProbeError('SALIDA_NO_VACIA');
  mkdirSync(abs, { recursive: true, mode: 0o700 });
  return abs;
}

// ---------------------------------------------------------------- ejecución
function newContext(options) {
  const report = {
    sonda: 'import-sources-probe',
    version: 1,
    generado: new Date().toISOString(),
    fuentes: {},
    verificaciones: Object.fromEntries(
      Object.entries(SYSTEMS).map(([v, sistema]) => [
        v,
        { sistema, estado: 'NO EJECUTADO', notas: [], hallazgos: {} },
      ]),
    ),
    llamadas: [],
  };
  return { options, report, salt: randomBytes(32), secrets: [], track: {} };
}

function makeConn(ctx, source, base, headers, extra = {}) {
  const o = ctx.options;
  return {
    source,
    base,
    headers,
    timeoutMs: source === 'siigo' ? o.siigoTimeoutMs : o.timeoutMs,
    maxBytes: o.maxBytes,
    pin: null,
    budget: { calls: 0, max: o.maxCallsPerSource },
    state: { lastAt: 0, errorStreak: 0, aborted: false },
    minIntervalMs: source === 'siigo' ? o.siigoIntervalMs : 0,
    maxErrorStreak: source === 'siigo' ? o.siigoMaxErrorStreak : 0,
    ...extra,
  };
}

const vtrack = (ctx, v) => (ctx.track[v] ??= { executed: false, failures: [] });
const finding = (ctx, v) => ctx.report.verificaciones[v].hallazgos;
const note = (ctx, v, text) => ctx.report.verificaciones[v].notas.push(text);

/** Llama a `probeRequest`, registra la llamada anonimizada y devuelve el JSON solo en memoria. */
async function call(
  ctx,
  conn,
  v,
  label,
  method,
  template,
  { params = {}, query = {}, body, required = true, extraEnum } = {},
) {
  const t = vtrack(ctx, v);
  t.executed = true;
  const record = {
    fuente: conn.source,
    v,
    etiqueta: label,
    metodo: method,
    ruta: template,
    consulta: Object.fromEntries(
      Object.entries(query).map(([k, val]) => [k, SAFE_QUERY_VALUES.has(k) ? String(val) : '{id}']),
    ),
    requerida: required,
  };
  ctx.report.llamadas.push(record);
  const started = Date.now();
  try {
    const path = template.replace(/\{(\w+)\}/gu, (_, k) => {
      const val = String(params[k] ?? '');
      if (!/^[A-Za-z0-9_-]{1,64}$/u.test(val)) throw new ProbeError('ID_NO_VALIDO');
      return val;
    });
    const res = await probeRequest(conn, method, path, query, body);
    record.estado = res.status;
    record.ms = Date.now() - started;
    record.bytes = res.body.length;
    record.cabeceras = interestingHeaders(res.headers);
    record.cabecerasEnviadas = res.sentHeaders;
    let json;
    try {
      json = res.body.length ? JSON.parse(res.body.toString('utf8')) : null;
    } catch {
      record.forma = { tipo: 'no-json' };
    }
    if (json !== undefined && json !== null) record.forma = describeShape(json, { extraEnum });
    const ok = res.status >= 200 && res.status < 300;
    if (!ok && required) t.failures.push(`${label}: HTTP ${res.status}`);
    if (conn.state.aborted) throw new ProbeError('RACHA_DE_ERRORES', true);
    return { ok, status: res.status, json: ok ? json : undefined };
  } catch (error) {
    const e = error instanceof ProbeError ? error : new ProbeError('ERROR_INTERNO');
    record.ms ??= Date.now() - started;
    record.error ??= e.code;
    if (required || e.fatal) t.failures.push(`${label}: ${e.code}`);
    if (e.fatal) throw e;
    return { ok: false, status: null, error: e.code, json: undefined };
  }
}

const results = (json) =>
  Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : [];
const firstId = (json, keys) => {
  for (const item of results(json))
    for (const k of keys)
      if (/^[A-Za-z0-9_-]{1,64}$/u.test(String(item?.[k] ?? ''))) return String(item[k]);
  return null;
};
const countOf = (json) =>
  typeof json?.count === 'number'
    ? json.count
    : typeof json?.pagination?.total_results === 'number'
      ? json.pagination.total_results
      : null;

async function probeWispHub(ctx, env) {
  const base = parseBaseUrl(env.WISPHUB_BASE_URL, 'WISPHUB_BASE_URL');
  ctx.secrets.push(env.WISPHUB_API_KEY);
  const conn = makeConn(ctx, 'wisphub', base, { Authorization: `Api-Key ${env.WISPHUB_API_KEY}` });

  const two = await call(ctx, conn, 'V2', 'clientes limit=2', 'GET', '/clientes/', {
    query: { limit: 2 },
  });
  const big = await call(ctx, conn, 'V2', 'clientes limit=500', 'GET', '/clientes/', {
    query: { limit: 500 },
    required: false,
  });
  const a = await call(ctx, conn, 'V2', 'clientes limit=300 lectura 1', 'GET', '/clientes/', {
    query: { limit: 300 },
  });
  const b = await call(ctx, conn, 'V2', 'clientes limit=300 lectura 2', 'GET', '/clientes/', {
    query: { limit: 300 },
  });
  Object.assign(finding(ctx, 'V2'), {
    totalClientes: countOf(two.json),
    devueltosConLimit500: big.ok ? results(big.json).length : null,
    estadoConLimit500: big.status ?? big.error,
    estabilidadLimit300: compareReads(ctx.salt, results(a.json), results(b.json), 'id_servicio'),
  });
  const id = firstId(two.json, ['id_servicio']);
  if (id) {
    for (const [label, tpl] of [
      ['cliente detalle', '/clientes/{id}/'],
      ['cliente perfil', '/clientes/{id}/perfil/'],
      ['cliente saldo', '/clientes/{id}/saldo/'],
    ]) {
      await call(ctx, conn, 'V2', label, 'GET', tpl, { params: { id } });
    }
  } else
    note(ctx, 'V2', 'Sin id_servicio en la primera página: no se probó detalle, perfil ni saldo.');
  const suspended = await call(ctx, conn, 'V2', 'clientes estado=2', 'GET', '/clientes/', {
    query: { estado: 2, limit: 5 },
  });
  finding(ctx, 'V2').suspendidos = countOf(suspended.json);

  const plans = await call(ctx, conn, 'V3', 'planes', 'GET', '/plan-internet/', {
    query: { limit: 2 },
  });
  const planId = firstId(plans.json, ['id', 'id_plan', 'id_plan_internet']);
  if (planId) {
    const q = await call(ctx, conn, 'V3', 'plan queue', 'GET', '/plan-internet/queue/{id}/', {
      params: { id: planId },
      required: false,
    });
    const p = await call(ctx, conn, 'V3', 'plan pppoe', 'GET', '/plan-internet/pppoe/{id}/', {
      params: { id: planId },
      required: false,
    });
    Object.assign(finding(ctx, 'V3'), {
      queue: q.status ?? q.error,
      pppoe: p.status ?? p.error,
      algunoDa403: q.status === 403 || p.status === 403,
    });
  } else note(ctx, 'V3', 'Sin id de plan en la primera página.');

  const ranged = await call(ctx, conn, 'V4', 'facturas rango 2015-2026', 'GET', '/facturas/', {
    query: { fecha_emision__range_0: '2015-01-01', fecha_emision__range_1: '2026-12-31', limit: 2 },
  });
  const plain = await call(ctx, conn, 'V4', 'facturas sin rango', 'GET', '/facturas/', {
    query: { limit: 2 },
    required: false,
  });
  Object.assign(finding(ctx, 'V4'), {
    facturasConRango: countOf(ranged.json),
    facturasSinRango: countOf(plain.json),
  });
  const invoiceId = firstId(ranged.json, ['id_factura', 'id']);
  if (invoiceId)
    await call(ctx, conn, 'V4', 'factura detalle', 'GET', '/facturas/{id}/', {
      params: { id: invoiceId },
    });
  const sigma = await call(ctx, conn, 'V4', 'facturas sigma', 'GET', '/facturas/sigma/', {
    query: { limit: 2 },
  });
  const router = await call(ctx, conn, 'V4', 'router', 'GET', '/router/');
  Object.assign(finding(ctx, 'V4'), {
    facturasSigma: countOf(sigma.json),
    routers: router.ok ? results(router.json).length : null,
  });
}

const CATEGORY = [
  [
    'loopback',
    [
      ['127.0.0.0', 8, 'ipv4'],
      ['::1', 128, 'ipv6'],
    ],
  ],
  [
    'privada',
    [
      ['10.0.0.0', 8, 'ipv4'],
      ['172.16.0.0', 12, 'ipv4'],
      ['192.168.0.0', 16, 'ipv4'],
      ['fc00::', 7, 'ipv6'],
    ],
  ],
  ['cgnat', [['100.64.0.0', 10, 'ipv4']]],
  [
    'enlace_local',
    [
      ['169.254.0.0', 16, 'ipv4'],
      ['fe80::', 10, 'ipv6'],
    ],
  ],
].map(([name, subnets]) => {
  const list = new BlockList();
  for (const [net, prefix, fam] of subnets) list.addSubnet(net, prefix, fam);
  return [name, list];
});
/** Categoría de una IP para la guardia SSRF; la IP nunca se guarda. */
export function classifyAddress(address) {
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
  return CATEGORY.find(([, list]) => list.check(address, family))?.[0] ?? 'publica';
}

async function probeUisp(ctx, env) {
  const base = parseBaseUrl(env.UISP_BASE_URL, 'UISP_BASE_URL');
  ctx.secrets.push(env.UISP_APP_KEY, env.UISP_NMS_TOKEN);
  let pin = null;
  if (env.UISP_TLS_SHA256) {
    pin = normFp(env.UISP_TLS_SHA256.trim());
    if (!/^[0-9a-f]{64}$/u.test(pin)) throw new ProbeError('UISP_TLS_SHA256_INVALIDA');
  }
  const budget = { calls: 0, max: ctx.options.maxCallsPerSource };
  const crm = makeConn(
    ctx,
    'uisp',
    base,
    { 'X-Auth-App-Key': env.UISP_APP_KEY },
    { pin: base.protocol === 'https:' ? pin : null, budget },
  );

  // V5: resolución del host (sin guardar el nombre ni las IP) y alcance.
  const host = base.hostname.replace(/^\[|\]$/gu, '');
  const v5 = finding(ctx, 'V5');
  Object.assign(v5, {
    esquema: base.protocol.replace(':', ''),
    hostEsIpLiteral: isIP(host) !== 0,
    huellaFijada: pin !== null,
  });
  vtrack(ctx, 'V5').executed = true;
  try {
    const addresses = isIP(host)
      ? [host]
      : (await lookup(host, { all: true })).map((r) => r.address);
    const categories = [...new Set(addresses.map(classifyAddress))];
    Object.assign(v5, {
      direccionesResueltas: addresses.length,
      categorias: categories,
      bloqueadaPorGuardiaSsrf: categories.some((c) => c !== 'publica'),
    });
    if (v5.bloqueadaPorGuardiaSsrf)
      note(
        ctx,
        'V5',
        'El host resuelve a IP privada, CGNAT o local: la guardia SSRF lo bloquea en producción (spec R6).',
      );
  } catch {
    vtrack(ctx, 'V5').failures.push('DNS_NO_RESUELVE');
  }
  const version = await call(ctx, crm, 'V5', 'version', 'GET', '/crm/api/v1.0/version');
  if (version.error === 'CERTIFICADO_NO_CONFIABLE' && base.protocol === 'https:') {
    v5.huellaPresentada = await presentedFingerprint(base);
    note(
      ctx,
      'V5',
      'Certificado no confiable por CA: verificar la huella presentada por otro canal y fijarla en UISP_TLS_SHA256.',
    );
    return;
  }
  if (version.error === 'CERTIFICADO_NO_COINCIDE') return;

  const jobs = await call(ctx, crm, 'V6', 'jobs limit=5', 'GET', '/crm/api/v1.0/scheduling/jobs', {
    query: { limit: 5 },
  });
  const jobId = firstId(jobs.json, ['id']);
  const v6 = finding(ctx, 'V6');
  v6.jobs = jobs.ok ? results(jobs.json).length : null;
  if (jobId && /^\d+$/u.test(jobId)) {
    const detail = await call(
      ctx,
      crm,
      'V6',
      'job detalle',
      'GET',
      '/crm/api/v1.0/scheduling/jobs/{id}',
      { params: { id: jobId } },
    );
    v6.ticketIdEnJob = detail.ok
      ? detail.json?.ticketId !== undefined && detail.json?.ticketId !== null
      : null;
    const att = await call(
      ctx,
      crm,
      'V6',
      'job adjuntos (metadatos)',
      'GET',
      '/crm/api/v1.0/scheduling/jobs/attachments',
      { query: { jobId }, required: false },
    );
    await call(ctx, crm, 'V6', 'job tareas', 'GET', '/crm/api/v1.0/scheduling/jobs/tasks', {
      query: { jobId },
      required: false,
    });
    v6.adjuntosDelJob = att.ok ? results(att.json).length : null;
  } else note(ctx, 'V6', 'Sin jobs: no se probó detalle, adjuntos ni tareas.');
  const attrs = await call(
    ctx,
    crm,
    'V6',
    'atributos de cliente',
    'GET',
    '/crm/api/v1.0/custom-attributes',
    {
      query: { attributeType: 'client' },
      extraEnum: ['name', 'key'],
    },
  );
  v6.atributosDeCliente = attrs.ok
    ? results(attrs.json).map((r) => ({
        nombre: safeEnumValue(r?.name, 64),
        clave: safeEnumValue(r?.key, 64),
      }))
    : null;
  const clients = await call(
    ctx,
    crm,
    'V6',
    'clientes limit=1000',
    'GET',
    '/crm/api/v1.0/clients',
    { query: { limit: 1000 } },
  );
  v6.devueltosConLimit1000 = clients.ok ? results(clients.json).length : null;

  note(
    ctx,
    'V7',
    'Pantallas de webhooks (ticket.*, job.*) y de tokens NMS: revisión manual del ISP.',
  );
  if (!env.UISP_NMS_TOKEN) {
    note(ctx, 'V7', 'Sin UISP_NMS_TOKEN: NMS no probado.');
    return;
  }
  const nms = makeConn(
    ctx,
    'uisp',
    base,
    { 'x-auth-token': env.UISP_NMS_TOKEN },
    { pin: crm.pin, budget },
  );
  const sites = await call(ctx, nms, 'V7', 'nms sites', 'GET', '/nms/api/v2.1/sites');
  const devices = await call(ctx, nms, 'V7', 'nms devices', 'GET', '/nms/api/v2.1/devices');
  Object.assign(finding(ctx, 'V7'), {
    sitios: sites.ok ? results(sites.json).length : null,
    equipos: devices.ok ? results(devices.json).length : null,
  });
}

async function probeSiigo(ctx, env) {
  const base = parseBaseUrl(env.SIIGO_BASE_URL || 'https://api.siigo.com', 'SIIGO_BASE_URL');
  ctx.secrets.push(env.SIIGO_USERNAME, env.SIIGO_ACCESS_KEY);
  const conn = makeConn(ctx, 'siigo', base, { 'Partner-Id': 'iWanaNeXt' });
  const v9 = finding(ctx, 'V9');
  const auth = await call(ctx, conn, 'V9', 'auth', 'POST', '/auth', {
    body: { username: env.SIIGO_USERNAME, access_key: env.SIIGO_ACCESS_KEY },
  });
  const token = typeof auth.json?.access_token === 'string' ? auth.json.access_token : null;
  if (!token) {
    if (auth.ok) vtrack(ctx, 'V9').failures.push('auth: sin access_token');
    return;
  }
  ctx.secrets.push(token);
  conn.headers = { ...conn.headers, Authorization: `Bearer ${token}` };
  const users = await call(ctx, conn, 'V9', 'users', 'GET', '/v1/users');
  v9.usuarios = users.ok ? results(users.json).length : null;
  const types = await call(ctx, conn, 'V9', 'document-types FV', 'GET', '/v1/document-types', {
    query: { type: 'FV' },
    extraEnum: ['code', 'name'],
  });
  v9.prefijosFV = types.ok
    ? [
        ...new Set(
          results(types.json)
            .map((r) => safeEnumValue(r?.prefix))
            .filter(Boolean),
        ),
      ]
    : null;
  const c100 = await call(ctx, conn, 'V9', 'customers page_size=100', 'GET', '/v1/customers', {
    query: { page_size: 100 },
  });
  const c101 = await call(ctx, conn, 'V9', 'customers page_size=101', 'GET', '/v1/customers', {
    query: { page_size: 101 },
    required: false,
  });
  const inactive = await call(ctx, conn, 'V9', 'customers active=false', 'GET', '/v1/customers', {
    query: { active: 'false' },
  });
  Object.assign(v9, {
    terceros: countOf(c100.json),
    devueltosConPageSize100: c100.ok ? results(c100.json).length : null,
    pageSize101: {
      estado: c101.status ?? c101.error,
      devueltos: c101.ok ? results(c101.json).length : null,
    },
    tercerosInactivos: countOf(inactive.json),
  });
  const inv = await call(ctx, conn, 'V9', 'invoices 2018', 'GET', '/v1/invoices', {
    query: { date_start: '2018-01-01', date_end: '2018-12-31', page_size: 5 },
  });
  const years = results(inv.json)
    .map((r) => /^(\d{4})-/u.exec(String(r?.date ?? ''))?.[1])
    .filter(Boolean)
    .map(Number);
  Object.assign(v9, {
    facturas2018: countOf(inv.json),
    anioMasAntiguoEncontrado: years.length ? Math.min(...years) : null,
  });
  const invoiceId = firstId(inv.json, ['id']);
  if (invoiceId) {
    const detail = await call(ctx, conn, 'V9', 'invoice detalle', 'GET', '/v1/invoices/{id}', {
      params: { id: invoiceId },
    });
    v9.facturaTieneCufe = detail.ok
      ? typeof detail.json?.stamp?.cufe === 'string' && detail.json.stamp.cufe.length > 0
      : null;
  } else note(ctx, 'V9', 'Sin facturas de 2018: no se probó el detalle ni el CUFE.');
}

/** CSV RFC 4180 mínimo con detección de separador (`,` `;` tab). */
export function parseCsv(text) {
  const clean = text.replace(/^﻿/u, '');
  const firstLine = clean.split(/\r?\n/u, 1)[0] ?? '';
  const sep = [';', '\t', ','].reduce(
    (best, c) => (firstLine.split(c).length > firstLine.split(best).length ? c : best),
    ',',
  );
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

const normHeader = (h) => h.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
function probeAdminOlt(ctx, csvPath) {
  vtrack(ctx, 'V8').executed = true;
  let rows;
  try {
    rows = parseCsv(readFileSync(csvPath, 'utf8'));
  } catch {
    vtrack(ctx, 'V8').failures.push('CSV_NO_LEGIBLE');
    return;
  }
  const [header = [], ...data] = rows;
  // Un encabezado que parezca dato (correo, número largo, muy largo) no se copia.
  const names = header.map((h, i) =>
    h.length <= 40 && safeEnumValue(h.trim(), 40) !== null ? h.trim() : `columna_${i + 1}`,
  );
  const has = (re) => header.some((h) => re.test(normHeader(h)));
  Object.assign(finding(ctx, 'V8'), {
    filas: data.length,
    columnas: names.map((name, i) => ({
      nombre: name,
      vaciosPct: data.length
        ? Math.round((data.filter((r) => !(r[i] ?? '').trim()).length / data.length) * 1000) / 10
        : null,
    })),
    tiene: {
      chasis: has(/^(chasis|chassis)$/u),
      slot: has(/^slot$/u),
      puerto: has(/^(puerto|port|puerto pon|pon port)$/u),
      onuId: has(/^onu ?id$/u),
      senal: has(/senal|signal|potencia|rx/u),
      externalId: has(/^external ?id$/u),
      sn: has(/^(sn|serial)$/u),
    },
  });
  if (!data.length) vtrack(ctx, 'V8').failures.push('CSV_SIN_FILAS');
}

/** Ejecuta las fuentes configuradas. No escribe nada: devuelve el informe y los secretos a vigilar. */
export async function runProbe({
  env = process.env,
  only = null,
  adminoltCsv = null,
  options = {},
} = {}) {
  const ctx = newContext({ ...DEFAULT_OPTIONS, ...options });
  const wanted = (s) => !only || only.includes(s);
  note(
    ctx,
    'V1',
    'Acción manual del ISP: confirmar si ya hay una APIKey en uso y crear el staff de lectura.',
  );
  const plan = [
    [
      'wisphub',
      ['WISPHUB_BASE_URL', 'WISPHUB_API_KEY'],
      () => probeWispHub(ctx, env),
      ['V2', 'V3', 'V4'],
    ],
    ['uisp', ['UISP_BASE_URL', 'UISP_APP_KEY'], () => probeUisp(ctx, env), ['V5', 'V6', 'V7']],
    ['siigo', ['SIIGO_USERNAME', 'SIIGO_ACCESS_KEY'], () => probeSiigo(ctx, env), ['V9']],
  ];
  for (const [source, vars, run, vs] of plan) {
    if (!wanted(source)) {
      ctx.report.fuentes[source] = 'omitida (--only)';
      continue;
    }
    const missing = vars.filter((v) => !env[v]);
    if (missing.length) {
      ctx.report.fuentes[source] = `omitida: faltan ${missing.join(', ')}`;
      continue;
    }
    ctx.report.fuentes[source] = 'ejecutada';
    try {
      await run();
    } catch (error) {
      const code = error instanceof ProbeError ? error.code : 'ERROR_INTERNO';
      ctx.report.fuentes[source] = `interrumpida: ${code}`;
      for (const v of vs)
        if (vtrack(ctx, v).executed || v === vs[0]) vtrack(ctx, v).failures.push(code);
    }
  }
  if (!wanted('adminolt')) ctx.report.fuentes.adminolt = 'omitida (--only)';
  else if (!adminoltCsv) ctx.report.fuentes.adminolt = 'omitida: falta --adminolt-csv';
  else {
    ctx.report.fuentes.adminolt = 'ejecutada (CSV, sin HTTP)';
    probeAdminOlt(ctx, adminoltCsv);
  }

  for (const [v, entry] of Object.entries(ctx.report.verificaciones)) {
    const t = ctx.track[v];
    if (!t?.executed && !t?.failures.length) continue;
    entry.estado = t.failures.length ? 'FALLA' : 'OK';
    if (t.failures.length) entry.fallas = t.failures;
  }
  return {
    report: ctx.report,
    secrets: ctx.secrets.filter((s) => typeof s === 'string' && s.length >= 4),
  };
}

/** Escribe el informe tras comprobar que no contiene ninguna credencial ni token. */
export function writeReport(report, outDir, secrets) {
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (secrets.some((s) => text.includes(s))) throw new ProbeError('FUGA_DE_SECRETO_EN_INFORME');
  const file = join(outDir, 'informe-sonda-fuentes.json');
  writeFileSync(file, text, { mode: 0o600, flag: 'wx' });
  return file;
}

export function summaryTable(report, file) {
  const lines = ['V   Sistema    Estado        Nota', '--  ---------  ------------  ----'];
  for (const [v, e] of Object.entries(report.verificaciones)) {
    lines.push(
      `${v.padEnd(3)} ${e.sistema.padEnd(10)} ${e.estado.padEnd(13)} ${(e.fallas?.[0] ?? e.notas[0] ?? '').slice(0, 90)}`,
    );
  }
  lines.push('', `Informe: ${file}`);
  return lines.join('\n');
}

const HELP = `Uso: pnpm probe:import-sources [--only wisphub,uisp,adminolt,siigo] [--out <dir>] [--adminolt-csv <ruta>]
Credenciales solo por entorno: WISPHUB_BASE_URL WISPHUB_API_KEY UISP_BASE_URL UISP_APP_KEY
[UISP_NMS_TOKEN] [UISP_TLS_SHA256] SIIGO_USERNAME SIIGO_ACCESS_KEY [SIIGO_BASE_URL]`;

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(HELP);
      return 0;
    }
    const outDir = resolveOutDir(args.out);
    const { report, secrets } = await runProbe({
      env: process.env,
      only: args.only,
      adminoltCsv: args.adminoltCsv,
    });
    const file = writeReport(report, outDir, secrets);
    console.log(summaryTable(report, file));
    return Object.values(report.verificaciones).some((e) => e.estado === 'FALLA') ? 1 : 0;
  } catch (error) {
    console.error(`Sonda detenida: ${error instanceof ProbeError ? error.code : 'ERROR_INTERNO'}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
