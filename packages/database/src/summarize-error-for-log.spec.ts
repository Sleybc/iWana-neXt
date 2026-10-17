import { QueryFailedError } from 'typeorm';
import { summarizeErrorForLog } from './summarize-error-for-log';

describe('summarizeErrorForLog', () => {
  it('conserva solo clase, SQLSTATE y nombres de constraint/tabla de un error SQL', () => {
    const sentinel = 'CENTINELA-PII-0001';
    const driverError = Object.assign(new Error(`duplicate key ${sentinel}`), {
      code: '23505',
      constraint: 'users_email_hmac_key',
      table: 'users',
      detail: `Key (email_hmac)=(${sentinel}) already exists`,
    });
    const error = new QueryFailedError(
      `INSERT INTO users (email_hmac) VALUES ('${sentinel}')`,
      [sentinel],
      driverError,
    );

    const summary = summarizeErrorForLog(error);

    expect(summary).toBe(
      'class=QueryFailedError sqlstate=23505 constraint=users_email_hmac_key table=users',
    );
    expect(summary).not.toContain(sentinel);
    expect(summary).not.toContain('INSERT');
    expect(summary).not.toContain('duplicate key');
  });

  it('incluye solo un código de dominio validado para errores no SQL', () => {
    expect(
      summarizeErrorForLog(Object.assign(new Error('mensaje'), { code: 'ASSET_WRITE_FAILED' })),
    ).toBe('class=Error sqlstate=none code=ASSET_WRITE_FAILED');
    expect(
      summarizeErrorForLog(Object.assign(new Error('mensaje'), { code: 'valor-con-datos' })),
    ).toBe('class=Error sqlstate=none');
  });
});
