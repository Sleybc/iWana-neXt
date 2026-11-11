import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from '@iwana/db';
import {
  AccessPermissionKey,
  CRM_CONTRACT_PDF_JOB_NAME,
  ContractDocumentSnapshotSchema,
  NetworkType,
  VatConcept,
  type ContractDocumentSnapshot,
} from '@iwana/shared';
import { decryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import { ContractStatus } from '../../enums/contract-status.enum';
import {
  ContractDocumentGenerationService,
  snapshotDigest,
} from './contract-document-generation.service';

const KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TENANT = {
  tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  schemaName: 'tenant_unit',
  tenantSlug: 'unit',
};
const CONTRACT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBSCRIBER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORDER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TECH_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const GENERATION_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const TEMPLATE = {
  id: '12121212-1212-4212-8212-121212121212',
  version: '1.0',
  sha256: 'a'.repeat(64),
};

const completeProfile = {
  legalName: 'Operador S.A.S.',
  nit: '900000000-1',
  qualityAndCoverageUrl: 'https://operador.example.invalid/calidad',
  customerServiceChannels: [{ kind: 'PHONE' as const, value: '6010000000', label: null }],
  reconnectionFee: 15000,
  annualIncreaseCapPercent: 5,
  equipmentIncidentReportChannel: 'Línea 6010000000',
  otherConditions: null,
  updatedAt: null,
};

const { updatedAt: _updatedAt, ...operatorWithoutTimestamp } = completeProfile;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: GENERATION_ID,
    contract_id: CONTRACT_ID,
    status: 'PENDING',
    template_legal_text_id: TEMPLATE.id,
    template_version: TEMPLATE.version,
    document_sha256: null,
    failure_reason: null,
    missing_operator_fields: [],
    requested_at: new Date('2026-11-11T15:00:00Z'),
    completed_at: null,
    ...overrides,
  };
}

describe('ContractDocumentGenerationService', () => {
  const query = jest.fn();
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    query,
    manager: {},
  };
  const dataSource = { createQueryRunner: () => queryRunner };
  const queue = { add: jest.fn() };
  const contracts = { findOne: jest.fn(), assertContractNotBlocked: jest.fn() };
  const subscribers = { findById: jest.fn() };
  const permanence = { get: jest.fn() };
  const catalog = { createSnapshot: jest.fn() };
  const equipment = { listInstalledAtCustomer: jest.fn() };
  const operator = { getForTenant: jest.fn() };
  const legalTexts = { current: jest.fn() };
  const orders = { getExecutionSnapshot: jest.fn() };
  const permissions = { getEffectivePermissionsForUser: jest.fn() };
  const audit = { logWithin: jest.fn(), log: jest.fn() };
  const actor = { sub: TECH_ID } as never;
  let service: ContractDocumentGenerationService;

  const run = <T>(fn: () => Promise<T>) => TenantContext.run(TENANT, fn);

  beforeEach(() => {
    jest.clearAllMocks();
    contracts.findOne.mockResolvedValue({
      id: CONTRACT_ID,
      subscriberId: SUBSCRIBER_ID,
      planId: 'plan-1',
      status: ContractStatus.DRAFT,
      customerSegment: null,
      serviceUsage: 'RESIDENTIAL',
      installationStratum: 3,
      installationAddress: 'Calle 1 # 2-3',
      installationCity: 'Bogotá',
      installationDepartment: 'Cundinamarca',
      vatSnapshot: { ratePercent: 19 },
    });
    contracts.assertContractNotBlocked.mockResolvedValue(undefined);
    orders.getExecutionSnapshot.mockResolvedValue({
      id: ORDER_ID,
      isAnnulled: false,
      subscriberId: SUBSCRIBER_ID,
      assignedTechnicianId: TECH_ID,
    });
    legalTexts.current.mockResolvedValue(TEMPLATE);
    operator.getForTenant.mockResolvedValue({ profile: completeProfile, missingFields: [] });
    subscribers.findById.mockResolvedValue({
      id: SUBSCRIBER_ID,
      firstName: 'Ana',
      lastName: 'Prueba',
      businessName: null,
      documentType: 'CC',
      documentNumber: '1000000001',
      email: 'ana@example.invalid',
      phone: '3000000000',
      customerSegment: 'RESIDENTIAL',
      stratum: 3,
      address: 'Otra',
      city: null,
      department: null,
    });
    catalog.createSnapshot.mockResolvedValue({
      planId: 'plan-1',
      name: 'Fibra 300',
      downloadSpeed: 300,
      uploadSpeed: 150,
      technology: 'FIBER',
      monthlyPrice: 80000,
      installationFee: 0,
      vatConcept: VatConcept.INTERNET_ACCESS,
      networkType: NetworkType.FIXED,
      snapshotAt: new Date(),
    });
    equipment.listInstalledAtCustomer.mockResolvedValue([
      { serialNumber: 'SN-1', macAddress: null, model: 'ONT' },
    ]);
    permanence.get.mockResolvedValue({
      permanence: {
        accepted: false,
        months: null,
        connectionFee: null,
        discountedOrDeferredAmount: null,
        startDate: null,
        endDate: null,
        schedule: [],
      },
      planOffer: null,
    });
    permissions.getEffectivePermissionsForUser.mockResolvedValue([]);
    query.mockResolvedValue([row()]);
    service = new ContractDocumentGenerationService(
      dataSource as never,
      queue as never,
      contracts as never,
      subscribers as never,
      permanence as never,
      catalog as never,
      equipment as never,
      operator as never,
      legalTexts as never,
      orders as never,
      permissions as never,
      audit as never,
      new ConfigService({ MFA_ENCRYPTION_KEY: KEY_HEX, PII_ENCRYPTION_KEY: KEY_HEX }),
    );
  });

  const insertCall = () => query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO'))!;

  it('toma el snapshot cifrado, persiste PENDING y encola solo identificadores', async () => {
    const result = await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));

    expect(result.status).toBe('PENDING');
    const [, params] = insertCall();
    const snapshot = JSON.parse(
      decryptAes256Gcm(params[6] as string, Buffer.from(KEY_HEX, 'hex')),
    ) as ContractDocumentSnapshot;
    expect(ContractDocumentSnapshotSchema.parse(snapshot)).toBeTruthy();
    expect(snapshot.holder.documentNumber).toBe('1000000001');
    expect(snapshot.service).toMatchObject({ vatAmount: 15200, monthlyTotal: 95200, stratum: 3 });
    expect(snapshot.installation.address).toBe('Calle 1 # 2-3');
    expect(snapshot.equipment).toHaveLength(1);
    expect(snapshot.permanence).toBeNull();
    expect(params[7]).toBe(snapshotDigest(snapshot));
    expect(String(params[6])).not.toContain('1000000001');
    // SEC-2: se congela la huella del contenido de la plantilla publicada.
    expect(params[5]).toBe(TEMPLATE.sha256);

    expect(queue.add).toHaveBeenCalledWith(
      CRM_CONTRACT_PDF_JOB_NAME,
      { tenantId: TENANT.tenantId, contractId: CONTRACT_ID, generationId: GENERATION_ID },
      expect.objectContaining({ jobId: GENERATION_ID, attempts: 3 }),
    );
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ContractDocumentGeneration',
        entityId: GENERATION_ID,
      }),
      expect.anything(),
    );
  });

  it('incluye la permanencia aceptada en el snapshot', async () => {
    permanence.get.mockResolvedValue({
      permanence: {
        accepted: true,
        months: 2,
        connectionFee: 120000,
        discountedOrDeferredAmount: 100000,
        startDate: null,
        endDate: null,
        schedule: [
          { month: 1, amount: 100000 },
          { month: 2, amount: 50000 },
        ],
      },
      planOffer: null,
    });
    await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));
    const snapshot = JSON.parse(
      decryptAes256Gcm(insertCall()[1][6] as string, Buffer.from(KEY_HEX, 'hex')),
    ) as ContractDocumentSnapshot;
    expect(snapshot.permanence).toMatchObject({ months: 2, discountedOrDeferredAmount: 100000 });
  });

  it('idempotente: con la misma versión devuelve la generación existente y reencola su jobId', async () => {
    query.mockResolvedValueOnce(undefined).mockResolvedValueOnce([]).mockResolvedValueOnce([row()]);
    const result = await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));
    expect(result.generationId).toBe(GENERATION_ID);
    expect(audit.logWithin).not.toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      CRM_CONTRACT_PDF_JOB_NAME,
      expect.anything(),
      expect.objectContaining({ jobId: GENERATION_ID }),
    );
  });

  it('una generación READY existente se devuelve sin reencolar', async () => {
    query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        row({ status: 'READY', document_sha256: 'b'.repeat(64), completed_at: new Date() }),
      ]);
    const result = await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));
    expect(result.status).toBe('READY');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('si la cola falla la generación queda PENDING (se reencola al repetir)', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis caído'));
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).resolves.toMatchObject({
      status: 'PENDING',
    });
  });

  it('CA-6: sin plantilla aprobada registra FAILED TEMPLATE_NOT_APPROVED y no encola', async () => {
    legalTexts.current.mockResolvedValue(null);
    query.mockResolvedValue([
      row({
        status: 'FAILED',
        failure_reason: 'TEMPLATE_NOT_APPROVED',
        template_legal_text_id: null,
        template_version: null,
        completed_at: new Date(),
      }),
    ]);
    const result = await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));
    expect(result.failureReason).toBe('TEMPLATE_NOT_APPROVED');
    expect(insertCall()[1]).toContain('TEMPLATE_NOT_APPROVED');
    expect(queue.add).not.toHaveBeenCalled();
    expect(subscribers.findById).not.toHaveBeenCalled();
  });

  it('CA-11: datos del operador incompletos registran la lista faltante', async () => {
    operator.getForTenant.mockResolvedValue({
      profile: completeProfile,
      missingFields: ['qualityAndCoverageUrl', 'reconnectionFee'],
    });
    query.mockResolvedValue([
      row({
        status: 'FAILED',
        failure_reason: 'OPERATOR_DATA_MISSING',
        missing_operator_fields: ['qualityAndCoverageUrl', 'reconnectionFee'],
        completed_at: new Date(),
      }),
    ]);
    const result = await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));
    expect(result.missingOperatorFields).toEqual(['qualityAndCoverageUrl', 'reconnectionFee']);
    expect(insertCall()[1]).toContainEqual(['qualityAndCoverageUrl', 'reconnectionFee']);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('CA-10: titular bloqueado o anonimizado registra SUBSCRIBER_BLOCKED sin leer sus datos', async () => {
    contracts.assertContractNotBlocked.mockRejectedValue(new ConflictException('bloqueado'));
    query.mockResolvedValue([
      row({
        status: 'FAILED',
        failure_reason: 'SUBSCRIBER_BLOCKED',
        template_legal_text_id: null,
        template_version: null,
        completed_at: new Date(),
      }),
    ]);
    const result = await run(() => service.request(CONTRACT_ID, ORDER_ID, actor));
    expect(result.failureReason).toBe('SUBSCRIBER_BLOCKED');
    expect(subscribers.findById).not.toHaveBeenCalled();
    expect(legalTexts.current).not.toHaveBeenCalled();
  });

  it('propaga un error de privacidad distinto del bloqueo', async () => {
    contracts.assertContractNotBlocked.mockRejectedValue(new Error('privacidad no disponible'));
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toThrow(
      'privacidad no disponible',
    );
  });

  it('rechaza un contrato que no está pendiente de firma', async () => {
    contracts.findOne.mockResolvedValue({
      id: CONTRACT_ID,
      subscriberId: SUBSCRIBER_ID,
      status: ContractStatus.ACTIVE,
    });
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rechaza una OT inexistente, anulada o de otro titular', async () => {
    orders.getExecutionSnapshot.mockResolvedValueOnce(null);
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    orders.getExecutionSnapshot.mockResolvedValueOnce({
      isAnnulled: true,
      subscriberId: SUBSCRIBER_ID,
      assignedTechnicianId: TECH_ID,
    });
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    orders.getExecutionSnapshot.mockResolvedValueOnce({
      isAnnulled: false,
      subscriberId: 'otro',
      assignedTechnicianId: TECH_ID,
    });
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('un técnico sin la OT asignada no genera ni consulta; el supervisor sí', async () => {
    orders.getExecutionSnapshot.mockResolvedValue({
      isAnnulled: false,
      subscriberId: SUBSCRIBER_ID,
      assignedTechnicianId: 'otro-tecnico',
    });
    await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run(() => service.latest(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    permissions.getEffectivePermissionsForUser.mockResolvedValue([
      AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
    ]);
    await expect(run(() => service.latest(CONTRACT_ID, ORDER_ID, actor))).resolves.toMatchObject({
      generationId: GENERATION_ID,
    });
  });

  it.each(['COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED'])(
    'SEC-5: el técnico asignado no accede con la OT %s; el supervisor sí',
    async (status) => {
      orders.getExecutionSnapshot.mockResolvedValue({
        isAnnulled: false,
        status,
        subscriberId: SUBSCRIBER_ID,
        assignedTechnicianId: TECH_ID,
      });
      await expect(run(() => service.latest(CONTRACT_ID, ORDER_ID, actor))).rejects.toMatchObject({
        response: { code: 'EXECUTION_ORDER_NOT_IN_EXECUTION' },
      });
      await expect(run(() => service.request(CONTRACT_ID, ORDER_ID, actor))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      permissions.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
      ]);
      await expect(run(() => service.latest(CONTRACT_ID, ORDER_ID, actor))).resolves.toBeDefined();
    },
  );

  it('SEC-5: el técnico asignado no accede a una OT con cierre registrado', async () => {
    orders.getExecutionSnapshot.mockResolvedValue({
      isAnnulled: false,
      status: 'IN_PROGRESS',
      closedAt: '2026-11-11T10:00:00.000Z',
      subscriberId: SUBSCRIBER_ID,
      assignedTechnicianId: TECH_ID,
    });
    await expect(run(() => service.latest(CONTRACT_ID, ORDER_ID, actor))).rejects.toMatchObject({
      response: { code: 'EXECUTION_ORDER_NOT_IN_EXECUTION' },
    });
  });

  it('latest devuelve null si aún no se pidió', async () => {
    query.mockResolvedValue([]);
    await expect(run(() => service.latest(CONTRACT_ID, ORDER_ID, actor))).resolves.toBeNull();
  });

  it('la huella de idempotencia ignora la hora de captura y cambia con los datos', () => {
    const base = ContractDocumentSnapshotSchema.parse({
      snapshotVersion: 1,
      contractId: CONTRACT_ID,
      executionOrderId: ORDER_ID,
      template: { legalTextId: TEMPLATE.id, version: '1.0' },
      operator: operatorWithoutTimestamp,
      holder: { fullName: 'A', documentType: null, documentNumber: null, email: null, phone: null },
      service: {
        planId: 'p',
        planName: 'P',
        technology: null,
        downloadMbps: null,
        uploadMbps: null,
        monthlyPrice: 1,
        vatRatePercent: null,
        vatAmount: null,
        monthlyTotal: 1,
        stratum: null,
        serviceUsage: null,
      },
      installation: { address: null, city: null, department: null },
      equipment: [],
      permanence: null,
      capturedAt: '2026-11-11T15:00:00.000Z',
    });
    const later = { ...base, capturedAt: '2026-11-12T15:00:00.000Z' };
    expect(snapshotDigest(later)).toBe(snapshotDigest(base));
    expect(snapshotDigest({ ...base, service: { ...base.service, monthlyPrice: 2 } })).not.toBe(
      snapshotDigest(base),
    );
  });
  describe('executionOrderContract (G7: contrato de la OT para el técnico)', () => {
    const answer = (contracts: unknown[], signed = false) =>
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM contracts c')) return contracts;
        if (sql.includes('FROM contract_signatures')) return signed ? [{ '?column?': 1 }] : [];
        return [];
      });

    it('técnico asignado: contrato DRAFT con documento del titular, auditado', async () => {
      answer([{ id: CONTRACT_ID, status: 'DRAFT' }]);
      const result = await run(() => service.executionOrderContract(ORDER_ID, actor));
      expect(result).toEqual({
        contractId: CONTRACT_ID,
        status: 'DRAFT',
        holder: { fullName: 'Ana Prueba', documentType: 'CC', documentNumber: '1000000001' },
      });
      const params = query.mock.calls.find(([sql]) => String(sql).includes('FROM contracts c'))![1];
      expect(params).toEqual([TENANT.tenantId, SUBSCRIBER_ID, ORDER_ID]);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Contract',
          entityId: CONTRACT_ID,
          newValue: { executionOrderId: ORDER_ID, purpose: 'SIGNING_HOLDER_DOCUMENT' },
        }),
      );
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('1000000001');
    });

    it('contrato firmado (ACTIVE): sin documento del titular y sin auditoría de acceso', async () => {
      answer([{ id: CONTRACT_ID, status: 'ACTIVE' }], true);
      const result = await run(() => service.executionOrderContract(ORDER_ID, actor));
      expect(result?.holder).toEqual({
        fullName: 'Ana Prueba',
        documentType: null,
        documentNumber: null,
      });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('DRAFT con firma registrada no expone el documento', async () => {
      answer([{ id: CONTRACT_ID, status: 'DRAFT' }], true);
      const result = await run(() => service.executionOrderContract(ORDER_ID, actor));
      expect(result?.holder.documentNumber).toBeNull();
    });

    it('sin contrato único devuelve null', async () => {
      answer([]);
      await expect(run(() => service.executionOrderContract(ORDER_ID, actor))).resolves.toBeNull();
      answer([
        { id: CONTRACT_ID, status: 'DRAFT' },
        { id: GENERATION_ID, status: 'DRAFT' },
      ]);
      await expect(run(() => service.executionOrderContract(ORDER_ID, actor))).resolves.toBeNull();
    });

    it('técnico no asignado sin permiso de supervisión → 403; supervisor sí lee', async () => {
      answer([{ id: CONTRACT_ID, status: 'DRAFT' }]);
      orders.getExecutionSnapshot.mockResolvedValue({
        id: ORDER_ID,
        isAnnulled: false,
        subscriberId: SUBSCRIBER_ID,
        assignedTechnicianId: 'otro-tecnico',
      });
      await expect(
        run(() => service.executionOrderContract(ORDER_ID, actor)),
      ).rejects.toMatchObject({ response: { code: 'EXECUTION_ORDER_NOT_ASSIGNED' } });
      expect(subscribers.findById).not.toHaveBeenCalled();

      permissions.getEffectivePermissionsForUser.mockResolvedValue([
        AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_SUPERVISE,
      ]);
      const result = await run(() => service.executionOrderContract(ORDER_ID, actor));
      expect(result?.contractId).toBe(CONTRACT_ID);
    });

    it('OT anulada o inexistente → 404', async () => {
      orders.getExecutionSnapshot.mockResolvedValue(null);
      await expect(run(() => service.executionOrderContract(ORDER_ID, actor))).rejects.toThrow(
        'Orden de trabajo no encontrada.',
      );
    });
  });
});
