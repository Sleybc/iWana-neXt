import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { RejectClientStratumEvidenceGuard } from './reject-client-stratum-evidence.guard';

describe('RejectClientStratumEvidenceGuard', () => {
  const guard = new RejectClientStratumEvidenceGuard();

  const contextWithBody = (body: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ body }) }),
    }) as ExecutionContext;

  it.each([undefined, null, 'texto', 12, {}])(
    'permite cuerpos que no intentan asignar el soporte desde el cliente: %s',
    (body) => {
      expect(guard.canActivate(contextWithBody(body))).toBe(true);
    },
  );

  it('rechaza un id del soporte incluso cuando el valor enviado es null', () => {
    expect(() => guard.canActivate(contextWithBody({ stratumEvidenceMediaId: null }))).toThrow(
      BadRequestException,
    );
  });
});
