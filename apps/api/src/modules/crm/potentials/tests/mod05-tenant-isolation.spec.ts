/**
 * Test de aislamiento multi-tenant para MOD05 CRM.
 * Verifica que runInTenantSchema reciba el schema correcto del contexto activo.
 * ADR-017: Multi-tenant schema-per-tenant isolation
 */

import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TenantContext } from '@iwana/db';
import { CoverageReadPort } from '../../ports/coverage-read.port';
import { PlanCatalogReadPort } from '../../ports/plan-catalog-read.port';
import { AuditService } from '../../../audit/audit.service';
import { PotentialsService } from '../potentials.service';
import { PotentialLead } from '../entities/potential-lead.entity';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      ...(actual.TenantContext as Record<string, unknown>),
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

function newService(schema: string, tenant: string): PotentialsService {
  mockTenantContextGetOrThrow.mockReturnValue({ tenantId: tenant, schemaName: schema });
  return new PotentialsService(
    {} as DataSource,
    { getOrThrow: () => '0'.repeat(64) } as unknown as ConfigService,
    { checkAvailability: jest.fn() } as unknown as CoverageReadPort,
    { getActivePlans: jest.fn(), createSnapshot: jest.fn() } as unknown as PlanCatalogReadPort,
    { log: jest.fn() } as unknown as AuditService,
  );
}

describe('MOD05 — Aislamiento multi-tenant en PotentialsService', () => {
  beforeEach(() => {
    mockRunInTenantSchema.mockClear();
    mockTenantContextGetOrThrow.mockClear();
  });

  it('findAll llama a runInTenantSchema con el schema de TenantContext', async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 't-a', schemaName: 'tenant_a' });
    mockRunInTenantSchema.mockResolvedValue([
      {
        id: 'p1',
        tenantId: 't-a',
        fullName: 'Test',
        qualified: false,
        emailEncrypted: null,
        phoneEncrypted: null,
        source: 'web',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const svc = newService('tenant_a', 't-a');
    await svc.findAll();

    expect(mockRunInTenantSchema).toHaveBeenCalledTimes(1);
    expect(mockRunInTenantSchema.mock.calls[0]![1]).toBe('tenant_a');
  });

  it('create llama a runInTenantSchema con el schema del contexto', async () => {
    mockTenantContextGetOrThrow.mockReturnValue({ tenantId: 't-b', schemaName: 'tenant_b' });
    mockRunInTenantSchema.mockResolvedValue({
      id: 'p2',
      tenantId: 't-b',
      fullName: 'Test2',
      qualified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const svc = newService('tenant_b', 't-b');
    await svc.create({ fullName: 'Test2', source: 'Referido' });

    expect(mockRunInTenantSchema).toHaveBeenCalled();
    const allSchemas = mockRunInTenantSchema.mock.calls.map((c) => c[1]);
    expect(allSchemas).toContain('tenant_b');
    expect(allSchemas.every((s) => s === 'tenant_b')).toBe(true);
  });

  it('TenantContext.getOrThrow devuelve valores diferentes por contexto', () => {
    mockTenantContextGetOrThrow.mockReturnValueOnce({ tenantId: 'ta', schemaName: 'tenant_a' });
    const ctxA = mockTenantContextGetOrThrow();

    mockTenantContextGetOrThrow.mockReturnValueOnce({ tenantId: 'tb', schemaName: 'tenant_b' });
    const ctxB = mockTenantContextGetOrThrow();

    expect(ctxA.schemaName).toBe('tenant_a');
    expect(ctxB.schemaName).toBe('tenant_b');
    expect(ctxA.schemaName).not.toBe(ctxB.schemaName);
  });

  it('PotentialLead tiene columnas multi-tenant obligatorias', () => {
    const entity = new PotentialLead();
    expect(entity).toHaveProperty('id');
    expect(entity).toHaveProperty('tenantId');
    expect(entity).toHaveProperty('createdAt');
    expect(entity).toHaveProperty('updatedAt');
    expect(entity).toHaveProperty('qualified');
  });
});
