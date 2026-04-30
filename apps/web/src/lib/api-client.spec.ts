import { authApi, persistAccessToken } from './api-client';

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

    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith('/auth/me')) {
        authMeCalls += 1;
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
    });

    await Promise.all([authApi.me(), authApi.me()]);

    expect(refreshCalls).toBe(1);
    expect(authMeCalls).toBe(4);
    expect(window.localStorage.getItem('iwana.web.access-token')).toBe('renewed-token');
  });
});
