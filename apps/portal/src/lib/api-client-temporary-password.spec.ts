import { authApi } from './api-client';

const json = (status: number, body: unknown) =>
  ({
    ok: status < 400,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

describe('contraseña temporal (ADR-117)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  const login = async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { data: { accessToken: 'limitado', passwordResetRequired: true } }),
    );
    return authApi.tenantLogin('a@demo.co', 'Temporal1!', 'isp-demo');
  };

  it('cambia la contraseña con el token limitado, que no queda en almacenamiento y sirve una vez', async () => {
    expect((await login()).passwordResetRequired).toBe(true);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('limitado');

    fetchMock.mockResolvedValueOnce(json(200, { data: { message: 'ok' } }));
    await authApi.changeTemporaryPassword('Temporal1!', 'Definitiva1!', 'isp-demo');

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toMatch(/\/auth\/change-password$/);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer limitado');

    await expect(
      authApi.changeTemporaryPassword('Temporal1!', 'Definitiva1!', 'isp-demo'),
    ).rejects.toMatchObject({ code: 'PASSWORD_CHANGE_TOKEN_MISSING' });
  });

  it('un error no intenta renovar la sesión y permite reintentar', async () => {
    await login();
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(json(401, { message: 'La contraseña actual no coincide' }));
    await expect(
      authApi.changeTemporaryPassword('mal', 'Definitiva1!', 'isp-demo'),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(json(200, { data: {} }));
    await authApi.changeTemporaryPassword('Temporal1!', 'Definitiva1!', 'isp-demo');
  });
});
