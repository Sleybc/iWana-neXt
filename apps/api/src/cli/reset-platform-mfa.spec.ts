import { parseResetPlatformMfaArgs } from './reset-platform-mfa';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('parseResetPlatformMfaArgs', () => {
  it('acepta cuenta, actor y motivo de la lista', () => {
    expect(
      parseResetPlatformMfaArgs([`--account=${A}`, `--actor=${B}`, '--reason=RELOJ_DESFASADO']),
    ).toEqual({ account: A, actor: B, reason: 'RELOJ_DESFASADO' });
  });

  it.each([
    ['sin actor', [`--account=${A}`, '--reason=RELOJ_DESFASADO']],
    ['con motivo libre', [`--account=${A}`, `--actor=${B}`, '--reason=me llamó']],
    ['con correo', ['--account=a@b.co', `--actor=${B}`, '--reason=RELOJ_DESFASADO']],
    ['con argumento repetido', [`--account=${A}`, `--account=${B}`]],
    ['con argumento desconocido', ['--force']],
  ])('rechaza %s', (_caso, argv) => {
    expect(() => parseResetPlatformMfaArgs(argv)).toThrow();
  });
});
