import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CustomerSegment,
  NetworkType,
  PersonType,
  ServiceUsage,
  SubscriberStatus,
  VatConcept,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import { ContractsService } from '../contracts.service';
import { Contract } from '../entities/contract.entity';
import { ContractStatus } from '../../enums/contract-status.enum';
import { CommercialCatalogReadPort } from '../../../commercial/ports/commercial-catalog-read.port';
import { IInternetVatResolverPort } from '../../../taxation/ports/internet-vat-resolver.port';
import { AuditService } from '../../../audit/audit.service';
import { MediaService } from '../../../media/media.service';
import { SubscriberFiscalCompletenessService } from '../../subscribers/subscriber-fiscal-completeness.service';
import { SubscriberLifecycleService } from '../../subscribers/subscriber-lifecycle.service';
import { IPrivacyMarksReadPort } from '../../../privacy/ports/privacy-marks-read.port';

const mockRun = jest.fn();
jest.mock('@iwana/db', () => ({
  ...jest.requireActual<Record<string, unknown>>('@iwana/db'),
  TenantContext: {
    getOrThrow: () => ({ tenantId: 'tenant-test', schemaName: 'tenant_plan_test' }),
  },
  runInTenantSchema: (_ds: unknown, schema: string, callback: unknown) => mockRun(schema, callback),
}));

describe('ContractsService.changePlan', () => {
  const command = {
    planId: 'plan-new',
    expectedUpdatedAt: '2026-10-30T12:00:00.000Z',
    expectedMonthlyPrice: 80000,
  };
  let contract: Contract;
  let service: ContractsService;
  const subscriber = {
    id: 'subscriber-test',
    partyId: 'party-test',
    anonymizedAt: null,
    personType: PersonType.NATURAL,
    status: SubscriberStatus.ACTIVE,
    customerSegment: CustomerSegment.SOHO,
  };
  const snapshot = {
    planId: 'plan-new',
    name: 'Plan nuevo',
    monthlyPrice: 80000,
    installationFee: 0,
    downloadSpeed: 500,
    uploadSpeed: 200,
    technology: 'FIBER',
    vatConcept: VatConcept.INTERNET_ACCESS,
    networkType: NetworkType.FIXED,
    snapshotAt: new Date(command.expectedUpdatedAt),
  };
  const catalog = {
    getPlanById: jest.fn(),
    createSnapshot: jest.fn(),
    getItemVatTreatments: jest.fn(),
  };
  const vat = { resolve: jest.fn() };
  const audit = { logWithin: jest.fn() };
  const marks = { activeMarks: jest.fn() };
  const manager = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    contract = Object.assign(new Contract(), {
      id: 'contract-test',
      tenantId: 'tenant-test',
      subscriberId: subscriber.id,
      planId: 'plan-old',
      planSnapshotJson: { monthlyPrice: 60000 },
      vatSnapshot: null,
      status: ContractStatus.DRAFT,
      serviceUsage: ServiceUsage.RESIDENTIAL,
      installationStratum: 4,
      stratumEvidenceMediaId: null,
      customerSegment: null,
      updatedAt: new Date(command.expectedUpdatedAt),
    });
    manager.findOne.mockImplementation(async (entity: unknown) =>
      entity === Contract ? contract : subscriber,
    );
    manager.find.mockResolvedValue([subscriber]);
    manager.save.mockImplementation(async (_entity: unknown, value: unknown) => value);
    mockRun.mockImplementation(
      async (_schema: string, callback: (qr: unknown) => Promise<unknown>) =>
        callback({ manager, query: async () => [subscriber] }),
    );
    catalog.getPlanById.mockResolvedValue({ id: command.planId, isActive: true });
    catalog.createSnapshot.mockResolvedValue(snapshot);
    catalog.getItemVatTreatments.mockResolvedValue([]);
    marks.activeMarks.mockResolvedValue({});
    audit.logWithin.mockResolvedValue(undefined);
    vat.resolve.mockReturnValue({
      status: 'CANONICAL',
      treatment: VatTreatment.STANDARD,
      legalBasis: VatLegalBasis.ET_468,
      ratePercent: 19,
      requiresAccountantReview: false,
    });
    service = new ContractsService(
      {} as DataSource,
      catalog as unknown as CommercialCatalogReadPort,
      vat as unknown as IInternetVatResolverPort,
      audit as unknown as AuditService,
      {} as MediaService,
      {
        get: () => '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      } as unknown as ConfigService,
      {} as SubscriberFiscalCompletenessService,
      {} as SubscriberLifecycleService,
      undefined,
      marks as unknown as IPrivacyMarksReadPort,
    );
  });

  it('cambia DRAFT con snapshot servidor y segmento heredado, IVA pendiente y auditoría transaccional', async () => {
    const result = await service.changePlan(contract.id, command, 'actor-test');
    expect(result.planSnapshotJson).toEqual({
      ...snapshot,
      snapshotAt: snapshot.snapshotAt.toISOString(),
    });
    expect(result.vatSnapshot).toBeNull();
    expect(catalog.createSnapshot).toHaveBeenCalledWith(
      'tenant-test',
      'tenant_plan_test',
      'plan-new',
      CustomerSegment.SOHO,
      expect.objectContaining({ manager: expect.anything() }),
    );
    expect(manager.findOne).toHaveBeenCalledWith(
      Contract,
      expect.objectContaining({
        where: { id: contract.id, tenantId: 'tenant-test' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ContractPlanChange',
        oldValue: expect.objectContaining({ planId: 'plan-old' }),
        newValue: expect.objectContaining({ planId: 'plan-new', effectiveAt: expect.any(String) }),
      }),
      manager,
    );
    expect(vat.resolve).not.toHaveBeenCalled();
  });
  it('DRAFT vuelve a congelar el installation_fee del plan nuevo (fase 2, D1)', async () => {
    contract.installationFee = 50_000;
    catalog.createSnapshot.mockResolvedValue({ ...snapshot, installationFee: 120_000.004 });
    const result = await service.changePlan(contract.id, command, 'actor-test');
    expect(result.installationFee).toBe(120_000);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: expect.objectContaining({ installationFee: 50_000 }),
        newValue: expect.objectContaining({ installationFee: 120_000 }),
      }),
      manager,
    );
  });
  it('ACTIVE conserva el installation_fee congelado: la instalación ya ocurrió', async () => {
    contract.status = ContractStatus.ACTIVE;
    contract.installationFee = 50_000;
    catalog.createSnapshot.mockResolvedValue({ ...snapshot, installationFee: 120_000 });
    const result = await service.changePlan(contract.id, command);
    expect(result.installationFee).toBe(50_000);
  });
  it('MOD14 R2: DRAFT vuelve a congelar el IVA de la instalación con el plan nuevo', async () => {
    catalog.getItemVatTreatments.mockResolvedValue([
      {
        itemId: 'plan-new',
        itemType: 'PLAN',
        vatTreatment: null,
        vatLegalBasis: null,
        installationVatTreatment: VatTreatment.EXCLUDED,
        installationVatLegalBasis: 'ET_476_7',
      },
    ]);
    const result = await service.changePlan(contract.id, command, 'actor-test');
    expect(catalog.getItemVatTreatments).toHaveBeenCalledWith(
      'tenant-test',
      'tenant_plan_test',
      ['plan-new'],
      expect.objectContaining({ manager }),
    );
    expect(result.installationVatSnapshot).toMatchObject({
      treatment: 'EXCLUDED',
      legalBasis: 'ET_476_7',
      ratePercent: 0,
      source: 'CATALOG',
    });
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          installationVatSnapshot: expect.objectContaining({ treatment: 'EXCLUDED' }),
        }),
      }),
      manager,
    );
  });
  it('MOD14 R2: ACTIVE conserva el IVA congelado de la instalación', async () => {
    contract.status = ContractStatus.ACTIVE;
    const frozen = {
      treatment: VatTreatment.STANDARD,
      legalBasis: 'ET_468',
      ratePercent: 19 as const,
      source: 'CATALOG' as const,
      frozenAt: '2026-10-01T00:00:00.000Z',
    };
    contract.installationVatSnapshot = frozen;
    const result = await service.changePlan(contract.id, command);
    expect(result.installationVatSnapshot).toEqual(frozen);
    expect(catalog.getItemVatTreatments).not.toHaveBeenCalled();
  });
  it('ACTIVE resuelve IVA con el mismo snapshot capturado y segmento override', async () => {
    contract.status = ContractStatus.ACTIVE;
    contract.customerSegment = CustomerSegment.CORPORATE;
    const result = await service.changePlan(contract.id, command);
    expect(catalog.createSnapshot).toHaveBeenCalledWith(
      'tenant-test',
      'tenant_plan_test',
      'plan-new',
      CustomerSegment.CORPORATE,
      expect.objectContaining({ manager: expect.anything() }),
    );
    expect(catalog.getPlanById).toHaveBeenCalledTimes(1);
    expect(vat.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        vatConcept: snapshot.vatConcept,
        networkType: snapshot.networkType,
        stratum: 4,
      }),
    );
    expect(result.vatSnapshot).toMatchObject({ ratePercent: 19 });
  });
  it('mismo plan retorna sin save, consulta de catálogo ni auditoría', async () => {
    await service.changePlan(contract.id, { ...command, planId: contract.planId });
    expect(manager.save).not.toHaveBeenCalled();
    expect(catalog.getPlanById).not.toHaveBeenCalled();
    expect(audit.logWithin).not.toHaveBeenCalled();
  });
  it.each([ContractStatus.SUSPENDED, ContractStatus.TERMINATED, ContractStatus.ARCHIVED])(
    'rechaza estado %s',
    async (status) => {
      contract.status = status;
      await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({
        response: { code: 'CONTRACT_PLAN_CHANGE_NOT_ALLOWED' },
        status: 409,
      });
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
  it('rechaza una versión obsoleta incluso si el plan es el mismo', async () => {
    await expect(
      service.changePlan(contract.id, {
        ...command,
        planId: contract.planId,
        expectedUpdatedAt: '2026-10-29T12:00:00.000Z',
      }),
    ).rejects.toMatchObject({ response: { code: 'CONTRACT_CHANGED' } });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it.each([null, { isActive: false }])('rechaza plan inexistente o inactivo %j', async (plan) => {
    catalog.getPlanById.mockResolvedValue(plan);
    await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({
      response: { code: 'PLAN_UNAVAILABLE' },
      status: 422,
    });
  });
  it('traduce ausencia de tarifa vigente', async () => {
    catalog.createSnapshot.mockRejectedValue(new NotFoundException('Sin tarifa'));
    await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({
      response: { code: 'PLAN_PRICE_REQUIRED' },
      status: 422,
    });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it.each([NaN, -1, Infinity])('rechaza precio inválido %s', async (monthlyPrice) => {
    catalog.createSnapshot.mockResolvedValue({ ...snapshot, monthlyPrice });
    await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({
      response: { code: 'PLAN_PRICE_REQUIRED' },
    });
  });
  it('propaga el error de auditoría para revertir la transacción', async () => {
    audit.logWithin.mockRejectedValue(new Error('Auditoría no disponible'));
    await expect(service.changePlan(contract.id, command)).rejects.toThrow(
      'Auditoría no disponible',
    );
  });
  it('rechaza un precio diferente del confirmado sin mutación', async () => {
    await expect(
      service.changePlan(contract.id, { ...command, expectedMonthlyPrice: 70000 }),
    ).rejects.toMatchObject({ response: { code: 'PLAN_PRICE_CHANGED' }, status: 409 });
    expect(manager.save).not.toHaveBeenCalled();
    expect(audit.logWithin).not.toHaveBeenCalled();
  });
  it('IVA inválido conserva el plan sin guardar', async () => {
    contract.status = ContractStatus.ACTIVE;
    catalog.createSnapshot.mockResolvedValue({ ...snapshot, vatConcept: null });
    await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({
      response: { code: 'VAT_CONCEPT_REQUIRED' },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rechaza titular bloqueado dentro de la transacción', async () => {
    marks.activeMarks.mockResolvedValue({ 'party-test': ['DATOS_BLOQUEADOS'] });
    await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({
      response: { code: 'PRIVACY_DATA_BLOCKED' },
    });
  });
  it('contrato ajeno o inexistente no se modifica', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(service.changePlan(contract.id, command)).rejects.toMatchObject({ status: 404 });
    expect(manager.save).not.toHaveBeenCalled();
  });
});
