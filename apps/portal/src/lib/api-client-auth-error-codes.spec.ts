import { authApi } from './api-client';

const json = (status: number, body: unknown) =>
  ({
    ok: status < 400,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  }) as Response;

describe('código de los 401 de autenticación', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  it.each(['AUTH_MFA_CODE_INVALID', 'AUTH_ACCOUNT_LOCKED'])(
    'el ingreso propaga %s sin renovar la sesión',
    async (code) => {
      fetchMock.mockResolvedValueOnce(json(401, { code, message: 'motivo' }));
      await expect(
        authApi.tenantLogin('a@demo.co', 'Clave1!', 'isp-demo', '123456'),
      ).rejects.toMatchObject({ status: 401, code, message: 'motivo' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['AUTH_SESSION_NOT_CURRENT', 'AUTH_SESSION_NOT_CURRENT'],
    ['AUTH_MFA_SETUP_NOT_PENDING', 'AUTH_MFA_SETUP_NOT_PENDING'],
    [undefined, 'UNKNOWN'],
  ])('la configuración propaga %s como %s', async (code, expected) => {
    fetchMock.mockResolvedValueOnce(
      json(200, { data: { mfaSetupRequired: true, accessToken: 'limitado' } }),
    );
    await authApi.tenantLogin('a@demo.co', 'Clave1!', 'isp-demo');

    fetchMock.mockResolvedValue(json(401, { code, message: 'motivo' }));
    await expect(authApi.mfaSetup('isp-demo')).rejects.toMatchObject({ code: expected });
    await expect(authApi.mfaVerifySetup('123456', 'isp-demo')).rejects.toMatchObject({
      code: expected,
    });
  });
});
