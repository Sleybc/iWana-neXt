import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ConservationDutyService, toBogotaCivilDate } from './conservation-duty.service';

const PARTY = '11111111-1111-4111-8111-111111111111';

function managerWithPolicies(policies: Record<string, number>): EntityManager {
  return {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      if (String(sql).includes('retention_policies')) {
        const category = (params as string[])[0] ?? '';
        return [{ years: policies[category] ?? 0 }];
      }
      return [];
    }),
  } as unknown as EntityManager;
}

function standingPort(overrides = {}) {
  return {
    standing: jest.fn(async () => ({
      subscriberIds: ['s1'],
      contractIds: [],
      expedienteIds: [],
      openContractIds: [],
      lastTerminatedAt: null,
      unreconciledContractClock: false,
      ...overrides,
    })),
    findProspectDiscard: jest.fn(async () => []),
    listProspectDiscard: jest.fn(async () => []),
  };
}

function billingPort(fiscalDate: string | null = null) {
  return {
    lastFiscalDocumentAt: jest.fn(async () => fiscalDate),
    hasUnreconciledFiscalClock: jest.fn(async () => false),
  };
}

function pqrPort(
  standing: { hasUnanswered: boolean; lastResponseAt: string | null } = {
    hasUnanswered: false,
    lastResponseAt: null,
  },
) {
  return { read: jest.fn(async () => standing) };
}

describe('toBogotaCivilDate (D-EXP-1)', () => {
  it('pasa intacta una fecha civil YYYY-MM-DD', () => {
    expect(toBogotaCivilDate('2021-06-01')).toBe('2021-06-01');
  });

  it('convierte un instante UTC a fecha civil de Bogotá (UTC-5)', () => {
    // 2021-06-01T04:30:00Z son las 23:30 del 31 de mayo en Bogotá.
    expect(toBogotaCivilDate('2021-06-01T04:30:00.000Z')).toBe('2021-05-31');
  });

  it('falla cerrado ante un valor inválido', () => {
    expect(() => toBogotaCivilDate('no-fecha')).toThrow();
  });
});

describe('ConservationDutyService (extraído de requests.service.ts)', () => {
  it('sin party ni hmac no aplica ningún deber', async () => {
    const service = new ConservationDutyService(standingPort());
    await expect(service.evaluate(managerWithPolicies({}), null, null)).resolves.toEqual(
      expect.objectContaining({ applies: false, openContract: false, retention: false }),
    );
  });

  it('el contrato abierto aplica aunque todo lo demás haya vencido', async () => {
    const service = new ConservationDutyService(
      standingPort({ openContractIds: ['c1'] }),
      billingPort(),
      pqrPort(),
    );
    const result = await service.evaluate(managerWithPolicies({}), PARTY, null);
    expect(result).toMatchObject({ applies: true, openContract: true });
  });

  it('el aniversario usa fecha civil de Bogotá, no el recorte UTC', async () => {
    const service = new ConservationDutyService(
      standingPort({ lastTerminatedAt: '2021-06-01T04:30:00.000Z' }),
      billingPort(),
      pqrPort(),
    );
    // Hoy civil 2026-06-01 en Bogotá: 2021-05-31 + 5 años = 2026-05-31 <= hoy → vencido.
    // Con slice(0,10) daría 2021-06-01 + 5 años = 2026-06-01 > 2026-05-31 → retenido (error).
    const result = await service.evaluate(
      managerWithPolicies({ IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5 }),
      PARTY,
      null,
      new Date('2026-06-01T12:00:00-05:00'),
    );
    expect(result.retention).toBe(false);
    expect(result.applies).toBe(false);
  });

  it('el aniversario inclusivo vence el mismo día (expiresOn <= today)', async () => {
    const service = new ConservationDutyService(
      standingPort({ lastTerminatedAt: '2021-06-01' }),
      billingPort(),
      pqrPort(),
    );
    const policies = managerWithPolicies({ IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5 });
    const vencido = await service.evaluate(
      policies,
      PARTY,
      null,
      new Date('2026-06-01T12:00:00-05:00'),
    );
    expect(vencido.retention).toBe(false);
    const retenido = await service.evaluate(
      policies,
      PARTY,
      null,
      new Date('2026-05-31T12:00:00-05:00'),
    );
    expect(retenido.retention).toBe(true);
  });

  it('falla cerrado con CONTRACT_UNRECONCILED si hay terminales sin reloj válido', async () => {
    const service = new ConservationDutyService(
      standingPort({
        contractIds: ['c1'],
        lastTerminatedAt: null,
        unreconciledContractClock: true,
      }),
      billingPort(),
      pqrPort(),
    );
    await expect(
      service.evaluate(
        managerWithPolicies({ IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5 }),
        PARTY,
        null,
      ),
    ).rejects.toThrow(/CONTRACT_UNRECONCILED/);
  });

  it('sin contratos el reloj ausente no bloquea (se distingue de reloj sin conciliar)', async () => {
    const service = new ConservationDutyService(
      standingPort({ contractIds: [], lastTerminatedAt: null }),
      billingPort(),
      pqrPort(),
    );
    const result = await service.evaluate(
      managerWithPolicies({ IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5 }),
      PARTY,
      null,
    );
    expect(result.applies).toBe(false);
  });

  it('falla cerrado con FISCAL_UNRECONCILED si hay documentos sin fecha válida', async () => {
    const billing = {
      lastFiscalDocumentAt: jest.fn(async () => null),
      hasUnreconciledFiscalClock: jest.fn(async () => true),
    };
    const service = new ConservationDutyService(standingPort(), billing, pqrPort());
    await expect(
      service.evaluate(
        managerWithPolicies({
          IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5,
          FACTURACION_SOPORTES_CONTABLES: 10,
        }),
        PARTY,
        null,
      ),
    ).rejects.toThrow(/FISCAL_UNRECONCILED/);
  });

  it('sin documentos fiscales el reloj ausente no bloquea', async () => {
    const billing = {
      lastFiscalDocumentAt: jest.fn(async () => null),
      hasUnreconciledFiscalClock: jest.fn(async () => false),
    };
    const service = new ConservationDutyService(standingPort(), billing, pqrPort());
    const result = await service.evaluate(
      managerWithPolicies({
        IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5,
        FACTURACION_SOPORTES_CONTABLES: 10,
      }),
      PARTY,
      null,
    );
    expect(result.applies).toBe(false);
  });

  it('falla cerrado si falta la categoría del catálogo', async () => {
    const service = new ConservationDutyService(
      standingPort({ lastTerminatedAt: '2021-06-01' }),
      billingPort(),
    );
    await expect(service.evaluate(managerWithPolicies({}), PARTY, null)).rejects.toThrow(
      /retention policy/i,
    );
  });

  it('falla cerrado sin el puerto de Billing', async () => {
    const service = new ConservationDutyService(standingPort(), undefined, undefined);
    await expect(service.evaluate(managerWithPolicies({}), PARTY, null)).rejects.toThrow(
      /billing/i,
    );
  });

  it('falla cerrado sin el puerto PQR', async () => {
    const service = new ConservationDutyService(standingPort(), billingPort(), undefined);
    await expect(service.evaluate(managerWithPolicies({}), PARTY, null)).rejects.toThrow(/pqr/i);
  });

  it('un recurso PQR pendiente retiene aunque haya respuesta definitiva', async () => {
    const pqr = {
      read: jest.fn(async () => ({ hasUnanswered: true, lastResponseAt: '2024-01-15T00:00:00Z' })),
    };
    const service = new ConservationDutyService(standingPort(), billingPort(), pqr);
    const result = await service.evaluate(
      managerWithPolicies({ PQR_SOPORTES: 3 }),
      PARTY,
      null,
      new Date('2026-06-01T12:00:00-05:00'),
    );
    expect(result).toMatchObject({ applies: true, retention: true, pqrRetained: true });
  });

  describe('M-1 (B4-R2): el contrato abierto u otro deber vigente prevalece sobre la incidencia', () => {
    const policies = {
      IDENTIFICACION_DIRECCION_CONTRATO_SUSCRIPTOR: 5,
      FACTURACION_SOPORTES_CONTABLES: 10,
      PQR_SOPORTES: 3,
    };

    it('contrato abierto y otro terminado sin fecha: conserva por el abierto, sin 409', async () => {
      const service = new ConservationDutyService(
        standingPort({
          contractIds: ['c1', 'c2'],
          openContractIds: ['c1'],
          unreconciledContractClock: true,
        }),
        billingPort(),
        pqrPort(),
      );
      const result = await service.evaluate(managerWithPolicies(policies), PARTY, null);
      expect(result).toMatchObject({ applies: true, openContract: true });
    });

    it('contrato abierto y documento fiscal sin fecha: conserva por el abierto, sin 409', async () => {
      const billing = {
        lastFiscalDocumentAt: jest.fn(async () => null),
        hasUnreconciledFiscalClock: jest.fn(async () => true),
      };
      const service = new ConservationDutyService(
        standingPort({ contractIds: ['c1'], openContractIds: ['c1'] }),
        billing,
        pqrPort(),
      );
      const result = await service.evaluate(managerWithPolicies(policies), PARTY, null);
      expect(result).toMatchObject({ applies: true, openContract: true });
    });

    it('reloj contractual sin conciliar con deber fiscal vigente: conserva por el fiscal', async () => {
      const service = new ConservationDutyService(
        standingPort({ contractIds: ['c1'], unreconciledContractClock: true }),
        billingPort('2024-01-15'),
        pqrPort(),
      );
      const result = await service.evaluate(
        managerWithPolicies(policies),
        PARTY,
        null,
        new Date('2026-06-01T12:00:00-05:00'),
      );
      expect(result).toMatchObject({ applies: true, openContract: false, fiscalRetained: true });
    });

    it('sin nada más que justifique conservar, el 409 lleva el código CONTRACT_UNRECONCILED', async () => {
      const service = new ConservationDutyService(
        standingPort({ contractIds: ['c1'], unreconciledContractClock: true }),
        billingPort(),
        pqrPort(),
      );
      const error = await service
        .evaluate(managerWithPolicies(policies), PARTY, null)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'CONTRACT_UNRECONCILED',
      });
    });

    it('sin nada más que justifique conservar, el 409 lleva el código FISCAL_UNRECONCILED', async () => {
      const billing = {
        lastFiscalDocumentAt: jest.fn(async () => null),
        hasUnreconciledFiscalClock: jest.fn(async () => true),
      };
      const service = new ConservationDutyService(standingPort(), billing, pqrPort());
      const error = await service
        .evaluate(managerWithPolicies(policies), PARTY, null)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'FISCAL_UNRECONCILED',
      });
    });
  });
});
