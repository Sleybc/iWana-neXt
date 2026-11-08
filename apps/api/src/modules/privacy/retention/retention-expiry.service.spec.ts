import type { EntityManager } from 'typeorm';
import {
  RETENTION_EXPIRY_BATCH_LIMIT,
  RETENTION_EXPIRY_RULES_VERSION,
  RetentionExpiryService,
} from './retention-expiry.service';

function managerStub(rows: Record<string, unknown[]> = {}): EntityManager & {
  writes: string[];
} {
  const writes: string[] = [];
  const query = jest.fn(async (sql: string) => {
    if (/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)) writes.push(sql);
    if (sql.includes('retention_policies')) return [{ years: 5 }];
    if (sql.includes('ROW_NUMBER')) return rows['blockedParties'] ?? [];
    // Barrido de solicitudes terminales: filas propias, no las del titular
    // (B4-R2 B-3: una fila sin cierre ya no se salta en silencio).
    if (sql.includes('FROM data_subject_requests r') && sql.includes('minimized_at IS NULL'))
      return rows['solicitudes'] ?? [];
    if (sql.includes('data_subject_requests') && /^\s*SELECT/iu.test(sql))
      return rows['requests'] ?? [];
    if (sql.includes('party_privacy_marks')) return rows['marks'] ?? [];
    if (sql.includes('privacy_retention_expiry_runs')) return rows['runs'] ?? [];
    if (sql.includes('expediente_records')) return rows['prospectos'] ?? [];
    return [];
  });
  return { query, writes } as unknown as EntityManager & { writes: string[] };
}

function serviceWith(overrides: Record<string, unknown> = {}): RetentionExpiryService {
  const duty = {
    evaluate: jest.fn(async () => ({
      applies: false,
      openContract: false,
      retention: false,
      evaluatedOn: '2026-11-08',
      clocks: {},
    })),
    hasDuty: jest.fn(async () => false),
    ...(overrides['duty'] as Record<string, unknown> | undefined),
  };
  const deps: Record<string, unknown> & {
    duty: unknown;
    standing: unknown;
    erasure: unknown;
    audit: unknown;
    pqr?: unknown;
  } = {
    duty,
    standing: {
      standing: jest.fn(async () => ({
        subscriberIds: [],
        contractIds: [],
        expedienteIds: [],
        openContractIds: [],
        lastTerminatedAt: null,
      })),
      findProspectDiscard: jest.fn(async () => []),
    },
    erasure: {
      plan: jest.fn(async () => ({ candidateExpedienteIds: [], blockers: [], counts: {} })),
      anonymize: jest.fn(async () => ({ categories: [], changedRows: 0 })),
    },
    marks: { partyIdsWithActiveMark: jest.fn(async () => []) },
    audit: { logWithin: jest.fn(async () => undefined) },
    ...overrides,
  };
  return new RetentionExpiryService(
    deps.duty as never,
    deps.standing as never,
    deps.erasure as never,
    deps.audit as never,
    (deps.pqr ?? undefined) as never,
  );
}

describe('RetentionExpiryService.previewTenant (H-EXP B1)', () => {
  it('distingue scanned=0 de candidatos verificados y no escribe dominio', async () => {
    const service = serviceWith();
    const manager = managerStub();
    const preview = await service.previewTenant(manager, '2026-11-08');
    expect(preview.scanned).toEqual({ titulares: 0, prospectos: 0, solicitudes: 0 });
    expect(preview.eligible.titulares).toEqual([]);
    expect(manager.writes).toEqual([]);
  });

  it('cuenta un titular bloqueado vencido como elegible', async () => {
    const party = '11111111-1111-4111-8111-111111111111';
    const request = '22222222-2222-4222-8222-222222222222';
    const service = serviceWith();
    const manager = managerStub({
      blockedParties: [{ party_id: party }],
      requests: [
        {
          id: request,
          party_id: party,
          requester_document_hmac: null,
          identity_verified_at: new Date('2026-01-01'),
        },
      ],
    });
    const preview = await service.previewTenant(manager, '2026-11-08');
    expect(preview.scanned.titulares).toBe(1);
    expect(preview.eligible.titulares).toEqual([{ partyId: party, requestId: request }]);
    expect(manager.writes).toEqual([]);
  });
});

describe('RetentionExpiryService.runTenantBatch (H-EXP B1/B2)', () => {
  it('en dry-run evalúa sin escribir ledger ni anonimizar', async () => {
    const party = '11111111-1111-4111-8111-111111111111';
    const request = '22222222-2222-4222-8222-222222222222';
    const erasure = {
      plan: jest.fn(async () => ({ candidateExpedienteIds: [], blockers: [], counts: {} })),
      anonymize: jest.fn(async () => ({ categories: [], changedRows: 0 })),
    };
    const service = serviceWith({
      erasure,
    });
    const manager = managerStub({
      blockedParties: [{ party_id: party }],
      requests: [
        {
          id: request,
          party_id: party,
          status: 'NO_PROCEDENTE',
          requester_document_hmac: null,
          identity_verified_at: new Date(),
        },
      ],
    });
    const result = await service.runTenantBatch(manager, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      dryRun: true,
      today: '2026-11-08',
    });
    expect(erasure.anonymize).not.toHaveBeenCalled();
    expect(manager.writes).toEqual([]);
    expect(result.counts.titulares).toBe(1);
  });

  it('en apply anonimiza, registra ledger idempotente y no repite al reintentar', async () => {
    const party = '11111111-1111-4111-8111-111111111111';
    const request = '22222222-2222-4222-8222-222222222222';
    const erasure = {
      plan: jest.fn(async () => ({ candidateExpedienteIds: [], blockers: [], counts: {} })),
      anonymize: jest.fn(async () => ({ categories: ['IDENTIFICACION'], changedRows: 1 })),
    };
    const audit = { logWithin: jest.fn(async () => undefined) };
    const service = serviceWith({
      erasure,
      audit,
    });
    const rows = {
      blockedParties: [{ party_id: party }],
      requests: [
        {
          id: request,
          party_id: party,
          status: 'NO_PROCEDENTE',
          requester_document_hmac: null,
          identity_verified_at: new Date(),
        },
      ],
      runs: [],
      marks: [{ event: 'OPEN' }],
    };
    const first = managerStub(rows);
    const result = await service.runTenantBatch(first, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      today: '2026-11-08',
    });
    expect(erasure.anonymize).toHaveBeenCalledTimes(1);
    expect(first.writes.some((sql) => sql.includes('privacy_retention_expiry_runs'))).toBe(true);
    expect(audit.logWithin).toHaveBeenCalled();
    expect(result.status).toBe('COMPLETE');

    // Reintento con el acto ya completado en la misma versión: no-op.
    const second = managerStub({
      ...rows,
      runs: [
        {
          tipo: 'TITULAR',
          target_id: party,
          rules_version: RETENTION_EXPIRY_RULES_VERSION,
          estado: 'COMPLETE',
        },
      ],
    });
    erasure.anonymize.mockClear();
    const retry = await service.runTenantBatch(second, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      today: '2026-11-08',
    });
    expect(erasure.anonymize).not.toHaveBeenCalled();
    expect(retry.counts.titulares).toBe(0);
  });

  it('falla cerrado sin anonimizar si un puerto no está disponible', async () => {
    const party = '11111111-1111-4111-8111-111111111111';
    const duty = {
      evaluate: jest.fn(async () => {
        throw new Error('PQR retention port is not registered');
      }),
      hasDuty: jest.fn(async () => false),
    };
    const erasure = { plan: jest.fn(), anonymize: jest.fn() };
    const service = serviceWith({
      duty,
      erasure,
    });
    const manager = managerStub({
      blockedParties: [{ party_id: party }],
      requests: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          party_id: party,
          status: 'NO_PROCEDENTE',
          requester_document_hmac: null,
          identity_verified_at: new Date(),
        },
      ],
      marks: [{ event: 'OPEN' }],
    });
    const result = await service.runTenantBatch(manager, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      today: '2026-11-08',
    });
    expect(erasure.anonymize).not.toHaveBeenCalled();
    expect(result.reasonCounts['PORT_UNAVAILABLE'] ?? 0).toBeGreaterThan(0);
  });

  it('respeta el lote de 100 y devuelve cursor para continuar', async () => {
    expect(RETENTION_EXPIRY_BATCH_LIMIT).toBe(100);
    const parties = Array.from(
      { length: 101 },
      (_, i) => `11111111-1111-4111-8111-1111111111${String(i).padStart(2, '0')}`,
    );
    const service = serviceWith();
    const manager = managerStub({
      blockedParties: parties.map((party) => ({ party_id: party })),
      requests: parties.map((party, i) => ({
        id: `22222222-2222-4222-8222-2222222222${String(i).padStart(2, '0')}`,
        party_id: party,
        status: 'NO_PROCEDENTE',
        requester_document_hmac: null,
        identity_verified_at: new Date(),
      })),
    });
    const result = await service.runTenantBatch(manager, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      dryRun: true,
      today: '2026-11-08',
    });
    expect(result.status).toBe('CONTINUE');
    expect(result.nextCursor).not.toBeNull();
  });
});

describe('RetentionExpiryService prospectos vía puerto CRM (H-EXP B2-R3 B1)', () => {
  it('selecciona prospectos por el puerto sin SQL directo a expediente_records', async () => {
    const expediente = '55555555-5555-4555-8555-555555555555';
    const seenSql: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        seenSql.push(String(sql));
        if (String(sql).includes('retention_policies')) return [{ years: 2 }];
        if (String(sql).includes('privacy_retention_expiry_runs')) return [];
        if (String(sql).includes('privacy_retention_expiry_cursors')) return [];
        return [];
      }),
    } as unknown as EntityManager;
    const standing = {
      standing: jest.fn(async () => ({
        subscriberIds: [],
        contractIds: [],
        expedienteIds: [],
        openContractIds: [],
        lastTerminatedAt: null,
      })),
      findProspectDiscard: jest.fn(async () => []),
      listProspectDiscard: jest.fn(async () => [
        {
          expedienteId: expediente,
          discardedAt: '2020-01-15T12:00:00.000Z',
          hasContract: false,
        },
      ]),
    };
    const service = serviceWith({
      standing,
      pqr: { read: jest.fn(async () => ({ hasUnanswered: false, lastResponseAt: null })) },
    });
    const preview = await service.previewTenant(manager, '2026-11-08');
    expect(preview.scanned.prospectos).toBe(1);
    expect(preview.eligible.prospectos).toEqual([{ expedienteId: expediente }]);
    expect(seenSql.some((sql) => sql.includes('expediente_records'))).toBe(false);
  });

  it('el ledger del prospecto anonimizado guarda request_id NULL (H-EXP B2-R3 P3)', async () => {
    const expediente = '66666666-6666-4666-8666-666666666666';
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)) writes.push({ sql, params: params ?? [] });
        if (String(sql).includes('retention_policies')) return [{ years: 2 }];
        if (String(sql).includes('privacy_retention_expiry_runs')) return [];
        if (String(sql).includes('privacy_retention_expiry_cursors')) return [];
        if (String(sql).includes('data_subject_request_tasks')) return [];
        if (String(sql).includes('SELECT 1 FROM data_subject_requests')) return [];
        return [];
      }),
    } as unknown as EntityManager;
    const standing = {
      standing: jest.fn(async () => ({
        subscriberIds: [],
        contractIds: [],
        expedienteIds: [],
        openContractIds: [],
        lastTerminatedAt: null,
      })),
      findProspectDiscard: jest.fn(async () => [
        { expedienteId: expediente, discardedAt: '2020-01-15T12:00:00.000Z', hasContract: false },
      ]),
      listProspectDiscard: jest.fn(async () => [
        { expedienteId: expediente, discardedAt: '2020-01-15T12:00:00.000Z', hasContract: false },
      ]),
    };
    const erasure = {
      plan: jest.fn(async () => ({ candidateExpedienteIds: [], blockers: [], counts: {} })),
      anonymize: jest.fn(async () => ({ categories: [], changedRows: 1 })),
    };
    const pqr = { read: jest.fn(async () => ({ hasUnanswered: false, lastResponseAt: null })) };
    const service = serviceWith({ standing, erasure, pqr });
    const result = await service.runTenantBatch(manager, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      today: '2026-11-08',
    });
    expect(result.counts.prospectos).toBe(1);
    const ledger = writes.find((write) => write.sql.includes('privacy_retention_expiry_runs'));
    expect(ledger).toBeDefined();
    // params: tipo, target_id, request_id, eligible_on, rules_version, estado, changed_rows, reason
    expect(ledger?.params[2]).toBeNull();
  });
});

describe('RetentionExpiryService.verifyTenant (H-EXP B1)', () => {
  it('detecta una solicitud vencida sin minimizar', async () => {
    const service = serviceWith();
    const manager = managerStub({
      solicitudes: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          status: 'RESUELTA',
          resolved_at: new Date('2019-01-01'),
          closed_at: null,
          minimized_at: null,
        },
      ],
    });
    const verification = await service.verifyTenant(manager, '2026-11-08');
    expect(verification.solicitudesVencidasSinMinimizar).toBe(1);
    expect(verification.tenantConciliado).toBe(false);
    expect(manager.writes).toEqual([]);
  });
});

describe('RetentionExpiryService B4-R2 (M-2, B-3, B-5)', () => {
  const expediente = '77777777-7777-4777-8777-777777777777';

  function prospectManager(writes: Array<{ sql: string; params: unknown[] }>): EntityManager {
    return {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)) writes.push({ sql, params: params ?? [] });
        if (String(sql).includes('retention_policies')) {
          const category = (params as string[] | undefined)?.[0];
          return [{ years: category === 'PQR_SOPORTES' ? 3 : 2 }];
        }
        return [];
      }),
    } as unknown as EntityManager;
  }

  function prospectStanding(discardedAt: string | null) {
    const row = { expedienteId: expediente, discardedAt, hasContract: false };
    return {
      standing: jest.fn(async () => ({
        subscriberIds: [],
        contractIds: [],
        expedienteIds: [],
        openContractIds: [],
        lastTerminatedAt: null,
        unreconciledContractClock: false,
      })),
      findProspectDiscard: jest.fn(async () => [row]),
      listProspectDiscard: jest.fn(async () => [row]),
    };
  }

  it('M-2: un prospecto con PQR respondida hace 6 meses se retiene por PQR_SOPORTES', async () => {
    const service = serviceWith({
      standing: prospectStanding('2020-01-15T12:00:00.000Z'),
      pqr: {
        read: jest.fn(async () => ({
          hasUnanswered: false,
          lastResponseAt: '2026-05-08T12:00:00.000Z',
        })),
      },
    });
    const preview = await service.previewTenant(prospectManager([]), '2026-11-08');
    expect(preview.eligible.prospectos).toEqual([]);
  });

  it('M-2: un prospecto con PQR respondida hace más de 3 años es elegible', async () => {
    const service = serviceWith({
      standing: prospectStanding('2020-01-15T12:00:00.000Z'),
      pqr: {
        read: jest.fn(async () => ({
          hasUnanswered: false,
          lastResponseAt: '2023-11-01T12:00:00.000Z',
        })),
      },
    });
    const preview = await service.previewTenant(prospectManager([]), '2026-11-08');
    expect(preview.eligible.prospectos).toEqual([{ expedienteId: expediente }]);
  });

  it('B-3: prospecto DESCARTADO sin discardedAt deja ATTENTION_REQUIRED con PROSPECT_UNRECONCILED', async () => {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const service = serviceWith({
      standing: prospectStanding(null),
      pqr: { read: jest.fn(async () => ({ hasUnanswered: false, lastResponseAt: null })) },
    });
    const preview = await service.previewTenant(prospectManager([]), '2026-11-08');
    expect(preview.eligible.prospectos).toEqual([]);
    expect(preview.unreconciled.prospectos).toEqual([
      { expedienteId: expediente, reasonCode: 'PROSPECT_UNRECONCILED' },
    ]);
    const result = await service.runTenantBatch(prospectManager(writes), {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      today: '2026-11-08',
    });
    expect(result.status).toBe('ATTENTION_REQUIRED');
    expect(result.reasonCounts).toEqual({ PROSPECT_UNRECONCILED: 1 });
    const ledger = writes.find((write) => write.sql.includes('privacy_retention_expiry_runs'));
    // params: tipo, target_id, request_id, eligible_on, rules_version, estado, changed_rows, reason
    expect(ledger?.params).toEqual([
      'TITULAR',
      expediente,
      null,
      '2026-11-08',
      RETENTION_EXPIRY_RULES_VERSION,
      'ATTENTION_REQUIRED',
      0,
      'PROSPECT_UNRECONCILED',
    ]);
  });

  it('B-3: solicitud terminal sin fecha de cierre deja ATTENTION_REQUIRED con MISSING_REQUEST_CLOSURE', async () => {
    const request = '88888888-8888-4888-8888-888888888888';
    const requestRow = {
      id: request,
      status: 'DESISTIDA',
      resolved_at: null,
      closed_at: null,
      minimized_at: null,
    };
    const emptyStanding = {
      ...prospectStanding(null),
      findProspectDiscard: jest.fn(async () => []),
      listProspectDiscard: jest.fn(async () => []),
    };
    const service = serviceWith({ standing: emptyStanding });
    const preview = await service.previewTenant(
      managerStub({ solicitudes: [requestRow] }),
      '2026-11-08',
    );
    expect(preview.eligible.solicitudes).toEqual([]);
    expect(preview.unreconciled.solicitudes).toEqual([
      { requestId: request, reasonCode: 'MISSING_REQUEST_CLOSURE' },
    ]);
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const manager = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (/^\s*(INSERT|UPDATE|DELETE)/iu.test(sql)) writes.push({ sql, params: params ?? [] });
        if (sql.includes('retention_policies')) return [{ years: 5 }];
        if (sql.includes('FROM data_subject_requests r') && sql.includes('minimized_at IS NULL'))
          return [requestRow];
        return [];
      }),
    } as unknown as EntityManager;
    const result = await service.runTenantBatch(manager, {
      actorId: '33333333-3333-4333-8333-333333333333',
      runId: '44444444-4444-4444-8444-444444444444',
      today: '2026-11-08',
    });
    expect(result.status).toBe('ATTENTION_REQUIRED');
    expect(result.reasonCounts).toEqual({ MISSING_REQUEST_CLOSURE: 1 });
    const ledger = writes.find((write) => write.sql.includes('privacy_retention_expiry_runs'));
    expect(ledger?.params).toEqual([
      'REQUEST',
      request,
      null,
      '2026-11-08',
      RETENTION_EXPIRY_RULES_VERSION,
      'ATTENTION_REQUIRED',
      0,
      'MISSING_REQUEST_CLOSURE',
    ]);
    expect(writes.some((write) => write.sql.includes('UPDATE data_subject_requests'))).toBe(false);
  });

  it('B-5: el dry-run separa al titular no conciliado de los elegibles con su código', async () => {
    const party = '11111111-1111-4111-8111-111111111111';
    const request = '22222222-2222-4222-8222-222222222222';
    const service = serviceWith({
      duty: {
        evaluate: jest.fn(async () => {
          throw new Error('CONTRACT_UNRECONCILED: sintético');
        }),
      },
    });
    const preview = await service.previewTenant(
      managerStub({
        blockedParties: [{ party_id: party }],
        requests: [{ id: request, party_id: party, hmac: null }],
      }),
      '2026-11-08',
    );
    expect(preview.eligible.titulares).toEqual([]);
    expect(preview.unreconciled.titulares).toEqual([
      { partyId: party, requestId: request, reasonCode: 'CONTRACT_UNRECONCILED' },
    ]);
  });
});
