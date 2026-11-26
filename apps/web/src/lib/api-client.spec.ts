import { ApiError, authApi, healthApi, persistAccessToken, tenantApi } from './api-client';

const buildJsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('api-client', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reutiliza un solo refresh token cuando dos requests reciben 401 en paralelo', async () => {
    persistAccessToken('expired-token');
    let authMeCalls = 0;
    let refreshCalls = 0;
    const authMeAuthHeaders: Array<string | null> = [];

    (global.fetch as jest.Mock).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/auth/me')) {
          authMeCalls += 1;
          authMeAuthHeaders.push(new Headers(init?.headers).get('Authorization'));
          if (authMeCalls <= 2) {
            return buildJsonResponse({ code: 'UNAUTHORIZED', message: 'Token vencido' }, 401);
          }

          return buildJsonResponse({
            data: {
              sub: 'platform-user-1',
              email: 'admin@example.test',
              role: 'SYSTEM_ADMIN',
              tenantId: null,
              schemaName: null,
              jti: 'jti-1',
              type: 'platform',
            },
          });
        }

        if (url.endsWith('/auth/refresh')) {
          refreshCalls += 1;
          return buildJsonResponse({ data: { accessToken: 'renewed-token' } });
        }

        throw new Error(`URL no esperada: ${url}`);
      },
    );

    await Promise.all([authApi.me(), authApi.me()]);

    expect(refreshCalls).toBe(1);
    expect(authMeCalls).toBe(4);
    // El token renovado se re-adjunta en memoria (ADR-081): el reintento viaja
    // con el Bearer renovado; ya no se persiste en localStorage.
    expect(authMeAuthHeaders).toContain('Bearer renewed-token');
  });

  it('declara la superficie de consola en la petición y en el refresh', async () => {
    persistAccessToken('');
    const audiences: Record<string, string | null> = {};
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      const path = url.split('/').pop() as string;
      const retried = path in audiences;
      audiences[path] = new Headers(init?.headers).get('X-Session-Audience');
      if (path === 'refresh') return buildJsonResponse({ data: { accessToken: 'nuevo' } });
      return retried ? buildJsonResponse({ data: {} }) : buildJsonResponse({}, 401);
    });

    await authApi.me();

    expect(audiences).toEqual({ me: 'platform', refresh: 'platform' });
  });

  it.each([
    ['verificar MFA', () => authApi.verifyPlatformSelfMfa('reto', '000000')],
    ['cambiar la contraseña', () => authApi.changePassword('Clave12345!', 'OtraClave12345!')],
  ])('un 401 al %s no renueva la sesión ni repite el intento', async (_action, attempt) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      buildJsonResponse({ code: 'AUTH_MFA_CODE_INVALID', message: 'Codigo MFA invalido.' }, 401),
    );

    await expect(attempt()).rejects.toMatchObject({
      status: 401,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('normaliza arrays de validación y expone un mensaje legible', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      buildJsonResponse(
        {
          statusCode: 400,
          message: [
            'Ingresa un correo de acceso válido.',
            'La contraseña actual debe tener entre 10 y 128 caracteres.',
          ],
          error: 'Bad Request',
        },
        400,
      ),
    );

    await expect(authApi.me()).rejects.toMatchObject({
      message:
        'Ingresa un correo de acceso válido. La contraseña actual debe tener entre 10 y 128 caracteres.',
    });
  });

  describe('healthApi.get (PublicHealth v1.0)', () => {
    const healthBody = {
      status: 'ok',
      db: 'ok',
      redis: 'ok',
      timestamp: '2026-11-21T10:00:00.000Z',
    } as const;

    it('devuelve la lectura con 200', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(buildJsonResponse(healthBody));

      await expect(healthApi.get()).resolves.toEqual(healthBody);
    });

    it('trata el 503 con cuerpo de salud como lectura degradada, no como error', async () => {
      const degraded = { ...healthBody, status: 'degraded', redis: 'error' };
      (global.fetch as jest.Mock).mockResolvedValue(buildJsonResponse(degraded, 503));

      await expect(healthApi.get()).resolves.toEqual(degraded);
    });

    it('descarta campos fuera del contrato, como relay', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildJsonResponse({ ...healthBody, relay: { outboxDepth: 3 } }),
      );

      const result = await healthApi.get();
      expect(result).toEqual(healthBody);
      expect(result).not.toHaveProperty('relay');
    });

    it('lanza ApiError si el 503 no trae un cuerpo de salud', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildJsonResponse({ code: 'SERVICE_UNAVAILABLE', message: 'Sin lectura' }, 503),
      );

      const error = await healthApi.get().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    });

    it('lanza ApiError ante un 429 con cuerpo HTML', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
      } as unknown as Response);

      const error = await healthApi.get().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 429 });
    });

    it('lanza ApiError ante un 500 aunque el cuerpo cumpla PublicHealth', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        buildJsonResponse({ ...healthBody, status: 'degraded', db: 'error' }, 500),
      );

      const error = await healthApi.get().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 500 });
    });

    it('propaga el error de red', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(healthApi.get()).rejects.toThrow('Failed to fetch');
    });
  });

  it('F2-D2: summary envía `months` del contrato v1.2 y sin periodo no añade query', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(buildJsonResponse({ data: {} }));
    await tenantApi.summary({ months: 24 });
    await tenantApi.summary();
    const urls = (global.fetch as jest.Mock).mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toMatch(/\/tenants\/summary\?months=24$/);
    expect(urls[1]).toMatch(/\/tenants\/summary$/);
  });
});
