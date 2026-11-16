import { Logger } from '@nestjs/common';
import { FAKE_UISP_APP_KEY, startFakeUisp, type FakeUispServer } from '../test/fake-uisp-server';
import {
  UISP_ADMINS_PATH,
  UISP_VERSION_PATH,
  UispApiClient,
  UispApiError,
  isBlockedUispAddress,
  normalizeFingerprint,
  uispApiClientOptionsFromConfig,
  uispUrl,
} from './uisp-api.client';

/**
 * Cliente de UISP contra un servidor https local con certificado autofirmado generado en la
 * prueba (spec 2026-11-15 «usuarios» §2.1, §6): huella fijada, 401, tiempo de espera,
 * reintentos acotados y la clave fuera de los logs.
 */
describe('UispApiClient', () => {
  let server: FakeUispServer;
  const logs: string[] = [];

  beforeAll(async () => {
    server = await startFakeUisp();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.routes.clear();
    server.requests.length = 0;
    logs.length = 0;
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => void logs.push(String(message)));
  });

  afterEach(() => jest.restoreAllMocks());

  const client = (overrides = {}) =>
    new UispApiClient({
      timeoutMs: 2_000,
      retries: 2,
      retryDelayMs: 5,
      // El UISP falso escucha en 127.0.0.1: excepción explícita solo de pruebas (S-1).
      allowedPrivateHosts: ['127.0.0.1'],
      ...overrides,
    });

  const pinned = () => ({
    baseUrl: server.baseUrl,
    appKey: FAKE_UISP_APP_KEY,
    trustedCertificateSha256: server.sha256,
  });

  async function failure(promise: Promise<unknown>): Promise<UispApiError> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof UispApiError) return error;
      throw error;
    }
    throw new Error('Se esperaba un error de UISP.');
  }

  it('con la huella correcta acepta el certificado y envía solo GET con la clave', async () => {
    server.routes.set(UISP_VERSION_PATH, { status: 200, body: { version: '2.4.0' } });

    await client().checkVersion(pinned());

    expect(server.requests).toEqual([
      { method: 'GET', path: UISP_VERSION_PATH, appKey: FAKE_UISP_APP_KEY },
    ]);
  });

  it('acepta la huella en mayúsculas o con separadores', async () => {
    server.routes.set(UISP_ADMINS_PATH, { status: 200, body: [{ id: 1 }] });
    const upper = server.sha256.toUpperCase().match(/.{2}/gu)!.join(':');

    await expect(
      client().listAdmins({ ...pinned(), trustedCertificateSha256: upper }),
    ).resolves.toEqual([{ id: 1 }]);
  });

  it('con una huella distinta rechaza el certificado sin enviar la petición', async () => {
    server.routes.set(UISP_VERSION_PATH, { status: 200, body: { version: '2.4.0' } });

    const error = await failure(
      client().checkVersion({ ...pinned(), trustedCertificateSha256: 'ab'.repeat(32) }),
    );

    expect(error).toMatchObject({ kind: 'UNREACHABLE', reason: 'CERTIFICADO_NO_COINCIDE' });
    expect(server.requests).toHaveLength(0);
  });

  it('sin huella fijada aplica la verificación normal: el autofirmado se rechaza', async () => {
    server.routes.set(UISP_VERSION_PATH, { status: 200, body: { version: '2.4.0' } });

    const error = await failure(
      client().checkVersion({ ...pinned(), trustedCertificateSha256: null }),
    );

    expect(error).toMatchObject({ kind: 'UNREACHABLE', reason: 'CERTIFICADO_NO_CONFIABLE' });
    expect(server.requests).toHaveLength(0);
  });

  it.each([401, 403])('%i → UNAUTHORIZED, sin reintentos', async (status) => {
    server.routes.set(UISP_VERSION_PATH, { status, body: { code: status } });

    const error = await failure(client().checkVersion(pinned()));

    expect(error).toMatchObject({ kind: 'UNAUTHORIZED', reason: 'CREDENCIAL_RECHAZADA' });
    expect(server.requests).toHaveLength(1);
  });

  it('tiempo agotado → UNREACHABLE tras los reintentos acotados', async () => {
    server.routes.set(UISP_VERSION_PATH, { status: 200, body: {}, delayMs: 500 });

    const error = await failure(client({ timeoutMs: 100, retries: 2 }).checkVersion(pinned()));

    expect(error).toMatchObject({ kind: 'UNREACHABLE', reason: 'TIEMPO_AGOTADO' });
    expect(server.requests).toHaveLength(3);
  });

  it('reintenta un 5xx y devuelve la respuesta cuando se recupera', async () => {
    server.routes.set(UISP_ADMINS_PATH, [
      { status: 502 },
      { status: 503 },
      { status: 200, body: [{ id: 7 }] },
    ]);

    await expect(client().listAdmins(pinned())).resolves.toEqual([{ id: 7 }]);
    expect(server.requests).toHaveLength(3);
  });

  it('un 5xx persistente agota 2 reintentos (3 intentos)', async () => {
    server.routes.set(UISP_ADMINS_PATH, { status: 500 });

    const error = await failure(client().listAdmins(pinned()));

    expect(error).toMatchObject({ kind: 'UNREACHABLE', reason: 'HTTP_5XX' });
    expect(server.requests).toHaveLength(3);
  });

  it('un 404 no se reintenta (la dirección no es una API de UISP)', async () => {
    const error = await failure(client().checkVersion(pinned()));

    expect(error).toMatchObject({ kind: 'UNREACHABLE', reason: 'HTTP_4XX' });
    expect(server.requests).toHaveLength(1);
  });

  it('una respuesta que no es JSON o excede el tope es inválida', async () => {
    server.routes.set(UISP_ADMINS_PATH, { status: 200 });
    await expect(failure(client().listAdmins(pinned()))).resolves.toMatchObject({
      reason: 'RESPUESTA_INVALIDA',
    });

    server.routes.set(UISP_ADMINS_PATH, { status: 200, body: Array(500).fill({ id: 1 }) });
    await expect(
      failure(client({ maxResponseBytes: 100 }).listAdmins(pinned())),
    ).resolves.toMatchObject({ reason: 'RESPUESTA_DEMASIADO_GRANDE' });
  });

  it('/version debe devolver un objeto JSON', async () => {
    server.routes.set(UISP_VERSION_PATH, { status: 200, body: ['no-es-objeto'] });

    await expect(failure(client().checkVersion(pinned()))).resolves.toMatchObject({
      reason: 'RESPUESTA_INVALIDA',
    });
  });

  it('red caída → UNREACHABLE', async () => {
    const error = await failure(
      client({ retries: 0 }).checkVersion({ ...pinned(), baseUrl: 'https://127.0.0.1:1' }),
    );

    expect(error).toMatchObject({ kind: 'UNREACHABLE', reason: 'RED' });
  });

  it('nunca registra la clave en logs ni en el mensaje del error', async () => {
    server.routes.set(UISP_VERSION_PATH, { status: 401 });

    const error = await failure(client().checkVersion(pinned()));

    expect(logs.join('\n')).toContain('code=UISP_UNAUTHORIZED_CREDENCIAL_RECHAZADA');
    expect(logs.join('\n')).not.toContain(FAKE_UISP_APP_KEY);
    expect(`${error.message} ${error.stack ?? ''}`).not.toContain(FAKE_UISP_APP_KEY);
  });

  describe('S-1: destinos no permitidos (SSRF)', () => {
    const strict = (
      lookupAll?: (host: string) => Promise<Array<{ address: string; family: number }>>,
    ) =>
      new UispApiClient({
        timeoutMs: 2_000,
        retries: 2,
        retryDelayMs: 5,
        ...(lookupAll ? { lookupAll } : {}),
      });
    const at = (baseUrl: string) => ({ ...pinned(), baseUrl });

    it.each([
      'https://127.0.0.1',
      'https://[::1]',
      'https://[::ffff:127.0.0.1]',
      'https://169.254.169.254',
      'https://10.0.0.1',
      'https://2130706433',
      'https://0x7f.1',
      'https://[fe80::1]',
      'https://[fd00::1]',
      'https://100.64.0.1',
      'https://0.0.0.0',
    ])('IP literal %s → DESTINO_NO_PERMITIDO sin conectar ni reintentar', async (baseUrl) => {
      const before = server.requests.length;
      const error = await failure(strict().checkVersion(at(baseUrl)));
      expect(error).toMatchObject({
        kind: 'UNREACHABLE',
        reason: 'DESTINO_NO_PERMITIDO',
        retryable: false,
      });
      expect(server.requests.length).toBe(before);
    });

    it('un nombre que resuelve a 127.0.0.1 se rechaza en el lookup del propio connect', async () => {
      const lookupAll = jest.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      const error = await failure(strict(lookupAll).checkVersion(at('https://uisp.example.test')));
      expect(error.reason).toBe('DESTINO_NO_PERMITIDO');
      expect(lookupAll).toHaveBeenCalledWith('uisp.example.test');
      expect(lookupAll).toHaveBeenCalledTimes(1);
    });

    it('localhost real (DNS del sistema) también se rechaza', async () => {
      const error = await failure(strict().checkVersion(at('https://localhost:1')));
      expect(error.reason).toBe('DESTINO_NO_PERMITIDO');
    });

    it('un nombre con A pública y privada mezcladas se rechaza (cierra rebinding)', async () => {
      const lookupAll = jest.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.10', family: 4 },
      ]);
      const error = await failure(strict(lookupAll).checkVersion(at('https://uisp.example.test')));
      expect(error.reason).toBe('DESTINO_NO_PERMITIDO');
    });

    it('un host de la excepción de pruebas se acepta', async () => {
      server.routes.set(UISP_VERSION_PATH, { status: 200, body: { version: '2.4.0' } });
      await expect(
        new UispApiClient({ allowedPrivateHosts: ['127.0.0.1'] }).checkVersion(pinned()),
      ).resolves.toBeUndefined();
    });

    it('un nombre con solo direcciones públicas pasa el filtro (y conecta a la resuelta)', async () => {
      // Resuelve a una IP pública de documentación inalcanzable: el fallo es de red, no de destino.
      const lookupAll = jest.fn().mockResolvedValue([{ address: '192.0.2.1', family: 4 }]);
      const error = await failure(
        new UispApiClient({ timeoutMs: 300, retries: 0, lookupAll }).checkVersion(
          at('https://uisp.example.test'),
        ),
      );
      expect(lookupAll).toHaveBeenCalled();
      expect(error.reason).not.toBe('DESTINO_NO_PERMITIDO');
    });

    it('la excepción sale de MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS (lista exacta)', () => {
      const get = (value: string | undefined) => ({ get: () => value as never });
      expect(uispApiClientOptionsFromConfig(get(' 127.0.0.1, [::1] ,,'))).toEqual({
        allowedPrivateHosts: ['127.0.0.1', '::1'],
      });
      expect(uispApiClientOptionsFromConfig(get(undefined))).toEqual({ allowedPrivateHosts: [] });
    });

    it('lista de bloqueo IPv4, IPv6 y mapeadas', () => {
      for (const blocked of [
        '0.1.2.3',
        '10.1.1.1',
        '100.127.255.255',
        '127.0.0.2',
        '169.254.1.1',
        '172.31.0.1',
        '192.0.0.8',
        '192.168.0.1',
        '198.19.0.1',
        '224.0.0.1',
        '255.255.255.255',
        '::',
        '::1',
        'fc00::1',
        'fe80::abcd',
        'ff02::1',
        '::ffff:10.0.0.1',
        '::ffff:7f00:1',
      ]) {
        expect([blocked, isBlockedUispAddress(blocked)]).toEqual([blocked, true]);
      }
      for (const allowed of [
        '8.8.8.8',
        '190.0.241.109',
        '2001:4860:4860::8888',
        '::ffff:8.8.8.8',
      ]) {
        expect([allowed, isBlockedUispAddress(allowed)]).toEqual([allowed, false]);
      }
    });
  });

  describe('utilidades', () => {
    it('normaliza la huella de Node', () => {
      expect(normalizeFingerprint('AB:CD:01')).toBe('abcd01');
    });

    it('conserva el prefijo de ruta de la dirección base', () => {
      expect(uispUrl('https://uisp.example.test/base/', UISP_VERSION_PATH).toString()).toBe(
        'https://uisp.example.test/base/crm/api/v1.0/version',
      );
      expect(uispUrl('https://uisp.example.test', UISP_ADMINS_PATH).pathname).toBe(
        UISP_ADMINS_PATH,
      );
    });

    it('rechaza http o credenciales en la dirección', () => {
      expect(() => uispUrl('http://uisp.example.test', UISP_VERSION_PATH)).toThrow(UispApiError);
      expect(() => uispUrl('https://u:p@uisp.example.test', UISP_VERSION_PATH)).toThrow(
        UispApiError,
      );
    });
  });
});
