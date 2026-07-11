import { DataSource } from 'typeorm';
import { DocumentTypeParty, PartyType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PartyReadAdapter } from '../../parties/adapters/party-read.adapter';
import { PartyWriteAdapter } from '../../parties/adapters/party-write.adapter';
import { SupplierProfileService } from '../services/supplier-profile.service';
import { SupplierPartyPortAdapter } from '../ports/supplier-party.port';
import { InMemoryTenantStore } from './support/in-memory-tenant-store';

/**
 * Aislamiento cross-tenant (remediacion C2): dos tenants con el MISMO documento deben poder dar de
 * alta el proveedor de forma independiente, sin verse ni colisionar entre si. El `supplier_code` y
 * el perfil son unicos POR tenant. Ejercita servicio + adapters reales sobre el store en memoria.
 */

const store = new InMemoryTenantStore();
let currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };

jest.mock('@iwana/db', () => ({
  SupplierProfile: class SupplierProfile {},
  TenantContext: {
    getOrThrow: jest.fn(() => currentTenant),
  },
  runInTenantSchema: jest.fn(),
}));

const iwanaDb = require('@iwana/db') as { runInTenantSchema: jest.Mock };

const actor: JwtPayload = {
  sub: 'support-001',
  email: 'support@example.test',
  role: UserRole.SUPPORT,
  tenantId: 'tenant-a',
  schemaName: 'tenant_a',
  jti: 'jti-support',
  type: 'tenant',
};

function buildService(): SupplierProfileService {
  const partyReadAdapter = new PartyReadAdapter({} as DataSource);
  const partyWriteAdapter = new PartyWriteAdapter();
  const supplierPartyPort = new SupplierPartyPortAdapter(partyReadAdapter);
  return new SupplierProfileService({} as DataSource, partyWriteAdapter, supplierPartyPort);
}

const baseInput = {
  partyType: PartyType.ORGANIZATION,
  documentType: DocumentTypeParty.NIT,
  documentNumber: '900555111',
  displayName: 'Proveedor Compartido',
};

describe('SupplierProfile aislamiento cross-tenant', () => {
  let service: SupplierProfileService;

  beforeAll(() => {
    iwanaDb.runInTenantSchema.mockImplementation(
      async (_ds: unknown, schemaName: string, cb: (qr: { manager: unknown }) => unknown) =>
        cb({ manager: store.managerFor(schemaName) }),
    );
    service = buildService();
  });

  it('cada tenant crea su proveedor con el mismo documento sin colisionar', async () => {
    currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
    const inA = await service.create(baseInput, { ...actor, tenantId: 'tenant-a' });

    currentTenant = { tenantId: 'tenant-b', schemaName: 'tenant_b' };
    const inB = await service.create(baseInput, { ...actor, tenantId: 'tenant-b' });

    expect(inA.partyRefId).toBeDefined();
    expect(inB.partyRefId).toBeDefined();
    // Identidades independientes por schema (no se comparte el Party entre tenants).
    expect(inA.partyRefId).not.toBe(inB.partyRefId);
    // Perfiles almacenados en schemas separados.
    expect(store.supplierProfiles('tenant_a')).toHaveLength(1);
    expect(store.supplierProfiles('tenant_b')).toHaveLength(1);
  });

  it('un tenant no ve el proveedor de otro (get devuelve 404 cruzado)', async () => {
    const profileInA = store.supplierProfiles('tenant_a')[0];
    if (!profileInA) {
      throw new Error('Se esperaba un perfil sembrado en tenant_a.');
    }
    const partyRefIdA = profileInA.partyRefId as string;

    // Consultado desde tenant B, el partyRefId de A no existe -> 404.
    currentTenant = { tenantId: 'tenant-b', schemaName: 'tenant_b' };
    await expect(service.get(partyRefIdA)).rejects.toThrow('Perfil de proveedor no encontrado.');

    // Desde su propio tenant si lo encuentra.
    currentTenant = { tenantId: 'tenant-a', schemaName: 'tenant_a' };
    const found = await service.get(partyRefIdA);
    expect(found.partyRefId).toBe(partyRefIdA);
  });

  it('el supplier_code es unico por tenant (ambos arrancan en PROV-000001)', async () => {
    expect(store.supplierProfiles('tenant_a')[0]?.supplierCode).toBe('PROV-000001');
    expect(store.supplierProfiles('tenant_b')[0]?.supplierCode).toBe('PROV-000001');
  });
});
