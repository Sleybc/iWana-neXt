import { QueryFailedError } from 'typeorm';
import {
  acquireIdempotencyTransactionLock,
  isPostgresUniqueViolation,
} from '../services/inventory-postgres.util';

describe('inventory-postgres.util', () => {
  it('detecta violaciones unicas de PostgreSQL', () => {
    const violation = new QueryFailedError(
      'INSERT INTO purchase_rfqs',
      [],
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'uq_purchase_rfqs_active_request',
      }),
    );

    expect(isPostgresUniqueViolation(violation, 'uq_purchase_rfqs_active_request')).toBe(true);
    expect(isPostgresUniqueViolation(violation, 'uq_other')).toBe(false);
    expect(isPostgresUniqueViolation(new Error('boom'))).toBe(false);
  });

  it('adquiere lock transaccional por idempotencyKey', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await acquireIdempotencyTransactionLock({ query }, 'counter-purchase:demo');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
      'counter-purchase:demo',
    ]);
  });
});
