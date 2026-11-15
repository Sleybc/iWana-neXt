import { UnprocessableEntityException } from '@nestjs/common';
import { MigrationMappingsService } from './migration-mappings.service';
import type {
  MigrationTitularLookupPort,
  MigrationTitularTarget,
} from './ports/migration-titular-lookup.port';

const TENANT = '00000000-0000-4000-8000-000000000001';
const CANDIDATE = '11111111-2222-4333-8444-555555555555';
const ACTOR = '00000000-0000-4000-8000-0000000000aa';
const scope = { tenantId: TENANT, schemaName: 'tenant_test' };

const qr = { query: jest.fn(), manager: {} };

jest.mock('@iwana/db', () => ({
  runInTenantSchema: (_ds: unknown, _schema: string, fn: (runner: unknown) => unknown) => fn(qr),
}));

function mappingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-0000000000bb',
    source_system: 'UISP',
    kind: 'TITULAR',
    external_value: '22',
    external_label: null,
    action: 'EQUIVALE',
    target_ref: CANDIDATE,
    created_at: new Date('2026-11-15T00:00:00Z'),
    updated_at: new Date('2026-11-15T00:00:00Z'),
    ...overrides,
  };
}

describe('MigrationMappingsService — equivalencia TITULAR (spec 2026-11-15 §2.1)', () => {
  let titularTarget: jest.Mock<Promise<MigrationTitularTarget | null>, [unknown, string]>;
  let service: MigrationMappingsService;
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };

  /** Respuestas de `qr.query` por SQL: pendiente en lote, INSERT/UPDATE y SELECT FOR UPDATE. */
  function queries(options: { pending: boolean; current?: Record<string, unknown> }) {
    qr.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM migration_batches')) return options.pending ? [{ found: 1 }] : [];
      if (sql.includes('FOR UPDATE')) return options.current ? [options.current] : [];
      if (sql.startsWith('INSERT') || sql.trimStart().startsWith('INSERT')) {
        return [mappingRow({ external_label: params[3], target_ref: params[5] })];
      }
      if (sql.trimStart().startsWith('UPDATE')) {
        return [[mappingRow({ target_ref: params[3], external_label: params[5] })], 1];
      }
      return [];
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    titularTarget = jest.fn().mockResolvedValue({
      subscriberId: CANDIDATE,
      externalId: null,
      restricted: false,
    });
    service = new MigrationMappingsService(
      {} as never,
      audit as never,
      { titularTarget } as unknown as MigrationTitularLookupPort,
    );
  });

  const create = (label: string | null = null) =>
    service.create(
      scope,
      {
        kind: 'TITULAR',
        externalValue: '22',
        externalLabel: label,
        action: 'EQUIVALE',
        targetRef: CANDIDATE,
      },
      ACTOR,
    );

  async function expect422(promise: Promise<unknown>): Promise<void> {
    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    await promise.catch((error: UnprocessableEntityException) => {
      expect(error.getResponse()).toMatchObject({ code: 'MIGRATION_TITULAR_TARGET_INVALID' });
    });
    expect(qr.query.mock.calls.some(([sql]) => /INSERT|UPDATE migration/u.test(sql))).toBe(false);
  }

  it('acepta un candidato pendiente, vigente y sin enlace; fuerza external_label null', async () => {
    queries({ pending: true });
    const mapping = await create('Nombre que no debe guardarse');
    expect(mapping.targetRef).toBe(CANDIDATE);
    expect(mapping.externalLabel).toBeNull();
    const pendingCall = qr.query.mock.calls.find(([sql]) => sql.includes('migration_batches'))!;
    expect(pendingCall[0]).toContain('purged_at IS NULL');
    expect(pendingCall[1]).toEqual([TENANT, '22', CANDIDATE]);
    expect(titularTarget).toHaveBeenCalledWith(qr, CANDIDATE);
  });

  it('acepta un candidato ya enlazado al mismo cliente de UISP', async () => {
    queries({ pending: true });
    titularTarget.mockResolvedValue({
      subscriberId: CANDIDATE,
      externalId: 'uisp:client:22',
      restricted: false,
    });
    await expect(create()).resolves.toMatchObject({ targetRef: CANDIDATE });
  });

  it('422 si el candidato no aparece como pendiente en ningún lote vigente', async () => {
    queries({ pending: false });
    await expect422(create());
  });

  it('422 si el suscriptor no existe, está dado de baja o anonimizado', async () => {
    queries({ pending: true });
    titularTarget.mockResolvedValue(null);
    await expect422(create());
  });

  it('422 si el suscriptor tiene datos bloqueados', async () => {
    queries({ pending: true });
    titularTarget.mockResolvedValue({
      subscriberId: CANDIDATE,
      externalId: null,
      restricted: true,
    });
    await expect422(create());
  });

  it('422 si el suscriptor está enlazado a otro cliente de UISP', async () => {
    queries({ pending: true });
    titularTarget.mockResolvedValue({
      subscriberId: CANDIDATE,
      externalId: 'uisp:client:7',
      restricted: false,
    });
    await expect422(create());
  });

  it('TITULAR solo admite EQUIVALE', async () => {
    queries({ pending: true });
    await expect(
      service.create(
        scope,
        { kind: 'TITULAR', externalValue: '22', action: 'DESCARTAR', targetRef: null },
        ACTOR,
      ),
    ).rejects.toMatchObject({
      response: { code: 'MIGRATION_MAPPING_TARGET_INVALID' },
    });
  });

  it('update de TITULAR revalida el destino y fuerza external_label null', async () => {
    queries({ pending: true, current: mappingRow() });
    const updated = await service.update(
      scope,
      mappingRow().id,
      { action: 'EQUIVALE', targetRef: CANDIDATE, externalLabel: 'Nombre' },
      ACTOR,
    );
    expect(updated.externalLabel).toBeNull();
    expect(titularTarget).toHaveBeenCalledWith(qr, CANDIDATE);
  });

  it('update de TITULAR responde 422 si el destino no es válido', async () => {
    queries({ pending: false, current: mappingRow() });
    await expect422(
      service.update(scope, mappingRow().id, { action: 'EQUIVALE', targetRef: CANDIDATE }, ACTOR),
    );
  });

  it('otros tipos no consultan CRM', async () => {
    qr.query.mockResolvedValue([
      mappingRow({ kind: 'PLAN', external_value: '501', target_ref: CANDIDATE }),
    ]);
    await service.create(
      scope,
      { kind: 'PLAN', externalValue: '501', action: 'EQUIVALE', targetRef: CANDIDATE },
      ACTOR,
    );
    expect(titularTarget).not.toHaveBeenCalled();
  });
});
