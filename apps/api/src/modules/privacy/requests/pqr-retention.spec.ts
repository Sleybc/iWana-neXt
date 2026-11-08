import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { PrivacyRequestsService } from './requests.service';
import { hasPqrConservationDuty } from './pqr-retention';

describe('B7 — reloj de retención PQR', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-07T15:00:00Z')));
  afterEach(() => jest.useRealTimers());
  it('falla cerrado si falta el puerto de PQR con un expediente atribuible', async () => {
    await expect(
      hasPqrConservationDuty(
        undefined,
        { subscriberIds: [], contractIds: [], expedienteIds: ['expediente'] },
        {} as EntityManager,
        '2026-11-07',
      ),
    ).rejects.toThrow('PQR retention port');
  });
  it('falla cerrado si falta la política de una PQR respondida', async () => {
    const port = {
      read: jest.fn().mockResolvedValue({ hasUnanswered: false, lastResponseAt: '2025-11-07' }),
    };
    const manager = { query: jest.fn().mockResolvedValue([]) } as unknown as EntityManager;
    await expect(
      hasPqrConservationDuty(
        port,
        { subscriberIds: [], contractIds: [], expedienteIds: ['expediente'] },
        manager,
        '2026-11-07',
      ),
    ).rejects.toThrow('Missing retention policy');
  });
  it.each([
    ['respuesta reciente', false, '2024-11-07', 3, true],
    ['respuesta vencida', false, '2023-11-06', 3, false],
    ['sin respuesta', true, null, 3, true],
    ['plazo ampliado', false, '2022-11-07', 5, true],
    ['sin PQR', false, null, 3, false],
  ])('%s', async (_label, hasUnanswered, lastResponseAt, years, applies) => {
    const pqr = { read: jest.fn().mockResolvedValue({ hasUnanswered, lastResponseAt }) };
    const standing = {
      standing: jest.fn().mockResolvedValue({
        subscriberIds: [],
        contractIds: [],
        expedienteIds: ['expediente'],
        openContractIds: [],
        lastTerminatedAt: null,
      }),
    };
    const key = '01'.repeat(32);
    const service = Reflect.construct(PrivacyRequestsService, [
      {},
      new ConfigService({ MFA_ENCRYPTION_KEY: key, PII_ENCRYPTION_KEY: key, PII_HASH_KEY: key }),
      {},
      {},
      standing,
      {},
      undefined,
      undefined,
      {
        lastFiscalDocumentAt: jest.fn().mockResolvedValue(null),
        hasUnreconciledFiscalClock: jest.fn().mockResolvedValue(false),
      },
      pqr,
    ]) as unknown as {
      conservationDuty(
        manager: EntityManager,
        party: string,
        hmac: string,
      ): Promise<{ applies: boolean }>;
    };
    const manager = { query: jest.fn().mockResolvedValue([{ years }]) } as unknown as EntityManager;
    expect((await service.conservationDuty(manager, 'party', 'hmac')).applies).toBe(applies);
    expect(pqr.read).toHaveBeenCalledWith(
      { subscriberIds: [], contractIds: [], expedienteIds: ['expediente'] },
      { manager },
    );
  });
});
