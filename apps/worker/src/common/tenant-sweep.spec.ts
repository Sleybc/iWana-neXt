import { Logger } from '@nestjs/common';
import {
  SWEEPABLE_TENANTS_SQL,
  describeErrorForLog,
  TenantSweepFailedError,
  listSweepableTenants,
  runTenantSweep,
  throwIfTenantSweepFailed,
} from './tenant-sweep';
import { SanitizeFailedReason } from './sanitize-failed-reason.decorator';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const T3 = '33333333-3333-4333-8333-333333333333';

/** Error del driver `pg` por tabla ausente: el texto nombra la relación y no debe persistirse. */
function missingRelation(): Error {
  return Object.assign(new Error('relation "execution_order_evidence" does not exist'), {
    code: '42P01',
  });
}

describe('tenant-sweep', () => {
  it('solo recorre empresas ACTIVE y no retiradas, en orden estable', () => {
    expect(SWEEPABLE_TENANTS_SQL).toContain("status = 'ACTIVE'");
    expect(SWEEPABLE_TENANTS_SQL).toContain('deleted_at IS NULL');
    expect(SWEEPABLE_TENANTS_SQL).toContain('ORDER BY schema_name');
  });

  it('lee filas de un cliente pg ({ rows }) y de TypeORM (arreglo)', async () => {
    const row = { id: T1, schema_name: 'tenant_uno' };
    const pg = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const typeorm = { query: jest.fn().mockResolvedValue([row]) };

    await expect(listSweepableTenants(pg)).resolves.toEqual([{ id: T1, schemaName: 'tenant_uno' }]);
    await expect(listSweepableTenants(typeorm)).resolves.toEqual([
      { id: T1, schemaName: 'tenant_uno' },
    ]);
    expect(pg.query).toHaveBeenCalledWith(SWEEPABLE_TENANTS_SQL);
  });

  it('un schema inválido cuenta como fallo de esa empresa: nunca se interpola ni se omite', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const tenants = [
      { id: T1, schemaName: 'public; DROP TABLE users' },
      { id: T2, schemaName: 'tenant_dos' },
    ];
    const visited: string[] = [];

    const { results, failures } = await runTenantSweep(tenants, async (tenant) => {
      visited.push(tenant.schemaName);
      return 1;
    });

    expect(visited).toEqual(['tenant_dos']);
    expect(results).toEqual([1]);
    expect(failures.map((failure) => failure.tenantId)).toEqual([T1]);
    expect(new TenantSweepFailedError('el barrido', failures).message).toBe(
      `Fallaron 1 empresa(s) en el barrido: tenant=${T1} (class=Error sqlstate=none code=TENANT_SCHEMA_INVALID)`,
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('DROP');
    warn.mockRestore();
  });

  it('describeErrorForLog conserva el motivo de un barrido y sanea cualquier otro', () => {
    const sweep = new TenantSweepFailedError('el barrido', [
      { tenantId: T2, error: missingRelation() },
    ]);
    expect(describeErrorForLog(sweep)).toBe(sweep.message);
    expect(describeErrorForLog(missingRelation())).toBe('class=Error sqlstate=42P01');
  });

  it('un schema incompleto no detiene a las demás empresas', async () => {
    const visited: string[] = [];
    const { results, failures } = await runTenantSweep(
      [
        { id: T1, schemaName: 'tenant_uno' },
        { id: T2, schemaName: 'tenant_incompleto' },
        { id: T3, schemaName: 'tenant_tres' },
      ],
      async (tenant) => {
        visited.push(tenant.schemaName);
        if (tenant.id === T2) throw missingRelation();
        return 1;
      },
    );

    expect(visited).toEqual(['tenant_uno', 'tenant_incompleto', 'tenant_tres']);
    expect(results).toEqual([1, 1]);
    expect(failures.map((failure) => failure.tenantId)).toEqual([T2]);
  });

  it('el motivo nombra la empresa con su id y el resumen saneado, sin el texto del driver', () => {
    const error = new TenantSweepFailedError('el barrido de eventos vencidos', [
      { tenantId: T2, error: missingRelation() },
    ]);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe(
      `Fallaron 1 empresa(s) en el barrido de eventos vencidos: tenant=${T2} (class=Error sqlstate=42P01)`,
    );
    expect(error.message).not.toContain('execution_order_evidence');
    expect(error.failedTenantIds).toEqual([T2]);
  });

  it('no persiste un id ni un nombre de barrido que no sean seguros, y acota la lista', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      tenantId: index === 0 ? "x'; DROP TABLE t; --" : `tenant-${index}`,
      error: new Error('detalle CENTINELA-PII'),
    }));
    const error = new TenantSweepFailedError('<script>', many);

    expect(error.message).toMatch(/^Fallaron 12 empresa\(s\) en barrido multiempresa: /u);
    expect(error.message).toContain('tenant=desconocida');
    expect(error.message).toContain('tenant=tenant-9');
    expect(error.message).not.toContain('tenant=tenant-10');
    expect(error.message).toContain('; y 2 más');
    expect(error.message).not.toContain('DROP');
    expect(error.message).not.toContain('CENTINELA-PII');
  });

  it('throwIfTenantSweepFailed no lanza sin fallos', () => {
    expect(() => throwIfTenantSweepFailed('el barrido', [])).not.toThrow();
  });

  it('@SanitizeFailedReason conserva el motivo que nombra la empresa', async () => {
    class ProcessorProbe {
      async process(): Promise<void> {
        throwIfTenantSweepFailed('el barrido de eventos vencidos', [
          { tenantId: T2, error: missingRelation() },
        ]);
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(ProcessorProbe.prototype, 'process');
    if (!descriptor) throw new Error('process method descriptor is missing');
    const decorated = { ...descriptor };
    SanitizeFailedReason()(ProcessorProbe.prototype, 'process', decorated);
    Object.defineProperty(ProcessorProbe.prototype, 'process', decorated);

    const thrown = await new ProcessorProbe().process().catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(AggregateError);
    expect(thrown).toMatchObject({
      name: 'TenantSweepFailedError',
      message: `Fallaron 1 empresa(s) en el barrido de eventos vencidos: tenant=${T2} (class=Error sqlstate=42P01)`,
    });
    expect(String(thrown)).not.toContain('execution_order_evidence');
  });
});
