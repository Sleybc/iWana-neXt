import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessPermissionKey, AuditAction, BILLING_ERROR_CODES } from '@iwana/shared';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { EffectivePermissionsService } from '../../access-control/services/effective-permissions.service';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { BillingIssuerReadPort } from '../ports/billing-issuer-read.port';
import { BillingPaymentsService } from '../payments/billing-payments.service';
import { BillingDocumentsService } from './billing-documents.service';

const mockRunInTenantSchema = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    TenantContext: {
      getOrThrow: () => ({
        tenantId: '00000000-0000-4000-8000-000000000001',
        schemaName: 'tenant_test',
      }),
    },
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
  };
});

const TENANT = '00000000-0000-4000-8000-000000000001';
const DOCUMENT = '00000000-0000-4000-8000-000000000030';
const PERIOD = '00000000-0000-4000-8000-000000000031';
const CONTRACT = '00000000-0000-4000-8000-000000000032';
const SUBSCRIBER = '00000000-0000-4000-8000-000000000033';
const ACTOR = '00000000-0000-4000-8000-000000000034';
const PARTY = '00000000-0000-4000-8000-000000000035';

const documentRow = {
  id: DOCUMENT,
  tenant_id: TENANT,
  period_id: PERIOD,
  contract_id: CONTRACT,
  subscriber_id: SUBSCRIBER,
  status: 'BORRADOR',
  number: null as string | null,
  issue_date: null as string | null,
  due_date: '2026-11-19',
  period_start: '2026-10-05',
  period_end: '2026-11-04',
  covered_start: '2026-10-05',
  subtotal: '100.00',
  tax_total: '19.00',
  total: '119.00',
  unbilled_additional_count: 0,
  blocking_reason: null as string | null,
  buyer_snapshot: { displayName: 'Adquirente de prueba' } as Record<string, unknown> | null,
  buyer_document_encrypted: null as string | null,
  issuer_snapshot: null as Record<string, unknown> | null,
  void_reason_code: null as string | null,
  void_note: null as string | null,
  voided_at: null as Date | null,
  voided_by: null as string | null,
  created_by: ACTOR,
  created_at: new Date('2026-11-05T12:00:00.000Z'),
  updated_at: new Date('2026-11-05T12:00:00.000Z'),
  paid_amount: '0.00',
  pending_amount: '119.00',
};

const contract = {
  contractId: CONTRACT,
  subscriberId: SUBSCRIBER,
  partyId: PARTY,
  status: 'ACTIVE' as const,
  statusReasonCode: null,
  terminatedAt: null,
  cycleDay: 5,
  cutoffDay: 20,
  activatedAt: '2026-10-05',
  endDate: null,
  planName: 'Plan',
  monthlyPrice: '100.00',
  vatSnapshot: null,
  unbilledAdditionalCount: 0,
  buyer: {
    displayName: 'Adquirente de prueba',
    documentType: 'NIT',
    documentNumber: null,
    hasDocumentNumber: true,
    revealDocumentNumber: () => '900123456',
    address: 'Calle 1',
    rutResponsibilities: ['RESPONSABLE_IVA'],
  },
};

const issuer = {
  legalName: 'Proveedor S.A.S.',
  nit: '900123456',
  verificationDigit: '7',
};

const effectivePolicy = {
  cutoff_mode: 'DIA_FIJO_CICLO',
  payment_term_days: 15,
  grace_days: 5,
  cutoff_enabled: true,
  auto_apply_credit: false,
};

describe('BillingDocumentsService — emisión, anulación y descarte', () => {
  let service: BillingDocumentsService;
  let query: jest.Mock;
  let contracts: {
    findByContractId: jest.Mock;
    findBillingCycleByContractId: jest.Mock;
    findTitularRefs: jest.Mock;
    lockTitularForBillingWrite: jest.Mock;
  };
  let issuers: { getIssuerIdentity: jest.Mock };
  let permissions: { getEffectivePermissionsForUser: jest.Mock };
  let privacyMarks: { activeMarks: jest.Mock };
  let payments: {
    lockSubscriber: jest.Mock;
    emitEvents: jest.Mock;
    applyCreditWithin: jest.Mock;
    recalculateSignals: jest.Mock;
  };
  let audit: { logWithin: jest.Mock };

  const config = {
    getOrThrow: (key: string) => (key === 'MFA_ENCRYPTION_KEY' ? '12'.repeat(32) : ''),
    get: () => undefined,
  } as unknown as ConfigService;

  /** Enrutador de SQL: cada prueba ajusta solo las filas que le interesan. */
  const route = (overrides: Record<string, unknown> = {}) => {
    query.mockImplementation(async (sql: string) => {
      for (const [needle, value] of Object.entries(overrides)) {
        if (sql.includes(needle)) return value;
      }
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SAVEPOINT')) return [];
      if (sql.includes('FROM billing_documents d')) return [documentRow];
      if (sql.includes('SELECT document_prefix FROM billing_policy'))
        return [{ document_prefix: 'FE' }];
      if (sql.includes('SELECT period_start::text, period_end::text, effective_policy'))
        return [
          {
            period_start: '2026-10-05',
            period_end: '2026-11-04',
            effective_policy: effectivePolicy,
          },
        ];
      if (sql.includes('regexp_replace(number')) return [{ next: 1 }];
      if (sql.includes('UPDATE billing_documents'))
        return [[{ ...documentRow, status: 'EMITIDO' }]];
      return [];
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    query = jest.fn();
    route();
    mockRunInTenantSchema.mockImplementation(
      async (_dataSource: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ query, manager: { query } }),
    );
    contracts = {
      findByContractId: jest.fn().mockResolvedValue(contract),
      findBillingCycleByContractId: jest.fn().mockResolvedValue({ cycleDay: 5, cutoffDay: 20 }),
      findTitularRefs: jest
        .fn()
        .mockResolvedValue([{ subscriberId: SUBSCRIBER, partyId: PARTY, anonymized: false }]),
      lockTitularForBillingWrite: jest
        .fn()
        .mockResolvedValue({ exists: true, partyId: PARTY, anonymized: false }),
    };
    issuers = { getIssuerIdentity: jest.fn().mockResolvedValue(issuer) };
    permissions = { getEffectivePermissionsForUser: jest.fn().mockResolvedValue([]) };
    privacyMarks = { activeMarks: jest.fn().mockResolvedValue({}) };
    payments = {
      lockSubscriber: jest.fn().mockResolvedValue(undefined),
      emitEvents: jest.fn().mockResolvedValue(undefined),
      applyCreditWithin: jest.fn().mockResolvedValue([]),
      recalculateSignals: jest.fn().mockResolvedValue([]),
    };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    service = new BillingDocumentsService(
      {} as never,
      audit as unknown as AuditService,
      contracts as unknown as BillingContractReadPort,
      issuers as unknown as BillingIssuerReadPort,
      config,
      permissions as unknown as EffectivePermissionsService,
      {
        getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
      } as never,
      privacyMarks as never,
      payments as unknown as BillingPaymentsService,
    );
  });

  const prepared = () => ({
    contract,
    cycle: { cycleDay: 5, cutoffDay: 20 },
    issuer,
    issueDate: '2026-11-05',
  });

  describe('prepareIssue', () => {
    it('no descifra el documento del adquirente salvo que se pida (RS-9)', async () => {
      await service.prepareIssue(CONTRACT);
      expect(contracts.findByContractId).toHaveBeenCalledWith(CONTRACT, {
        revealDocument: false,
      });

      await service.prepareIssue(CONTRACT, { revealDocument: true });
      expect(contracts.findByContractId).toHaveBeenLastCalledWith(CONTRACT, {
        revealDocument: true,
      });
    });
  });

  describe('issueWithinManager — rechazos del borrador', () => {
    const run = (
      manager: EntityManager,
      preparedValue: ReturnType<typeof prepared> | undefined = prepared(),
      ids = [DOCUMENT],
    ) => service.issueWithinManager(manager, TENANT, ids, ACTOR, preparedValue, []);

    it('rechaza la emisión sin preparación previa', async () => {
      await expect(
        run({ query } as unknown as EntityManager, null as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza un documento inexistente bajo el lock', async () => {
      route({ 'FROM billing_documents d': [] });
      await expect(run({ query } as unknown as EntityManager)).rejects.toMatchObject({
        response: { code: 'BILLING_DOCUMENT_NOT_FOUND' },
      });
    });

    it('rechaza un documento que ya no es borrador', async () => {
      route({ 'FROM billing_documents d': [{ ...documentRow, status: 'EMITIDO' }] });
      await expect(run({ query } as unknown as EntityManager)).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_DRAFT },
      });
    });

    it('rechaza un borrador con datos pendientes', async () => {
      route({ 'FROM billing_documents d': [{ ...documentRow, blocking_reason: 'SIN_DIRECCION' }] });
      await expect(run({ query } as unknown as EntityManager)).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_BLOCKED },
      });
    });

    it('rechaza la emisión cuando el contrato no existe', async () => {
      await expect(
        run({ query } as unknown as EntityManager, { ...prepared(), contract: null } as never),
      ).rejects.toMatchObject({ response: { code: 'BILLING_CONTRACT_NOT_FOUND' } });
    });

    it('rechaza un titular anonimizado y también uno inexistente', async () => {
      contracts.lockTitularForBillingWrite.mockResolvedValueOnce({
        exists: true,
        partyId: PARTY,
        anonymized: true,
      });
      await expect(run({ query } as unknown as EntityManager)).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.PRIVACY_TITULAR_ANONYMIZED },
      });

      contracts.lockTitularForBillingWrite.mockResolvedValueOnce({
        exists: false,
        partyId: null,
        anonymized: false,
      });
      await expect(run({ query } as unknown as EntityManager)).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.PRIVACY_TITULAR_ANONYMIZED },
      });
    });

    it('rechaza la emisión sin documento fiscal del adquirente', async () => {
      await expect(
        run(
          { query } as unknown as EntityManager,
          {
            ...prepared(),
            contract: {
              ...contract,
              buyer: { ...contract.buyer, revealDocumentNumber: () => null },
            },
          } as never,
        ),
      ).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_BLOCKED },
      });
    });

    it('rechaza la emisión si el emisor no tiene razón social o NIT', async () => {
      await expect(
        run(
          { query } as unknown as EntityManager,
          {
            ...prepared(),
            issuer: { legalName: null, nit: null, verificationDigit: null },
          } as never,
        ),
      ).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_ISSUER_INCOMPLETE },
      });
    });

    it('falla si no hay prefijo de facturación configurado', async () => {
      route({ 'SELECT document_prefix FROM billing_policy': [] });
      await expect(run({ query } as unknown as EntityManager)).rejects.toThrow(
        'No se encontró el prefijo de facturación.',
      );
    });

    it('falla si no se resuelve el ciclo del periodo', async () => {
      await expect(
        run(
          { query } as unknown as EntityManager,
          {
            ...prepared(),
            cycle: { cycleDay: null, cutoffDay: null },
          } as never,
        ),
      ).rejects.toThrow('No se pudo resolver el ciclo del periodo para emitir.');
    });
  });

  describe('issueWithinManager — consecutivo y emisión', () => {
    it('emite el borrador, audita y aplica saldo a favor cuando la política lo pide', async () => {
      route({
        'SELECT period_start::text, period_end::text, effective_policy': [
          {
            period_start: '2026-10-05',
            period_end: '2026-11-04',
            effective_policy: { ...effectivePolicy, auto_apply_credit: true },
          },
        ],
      });
      const manager = { query } as unknown as EntityManager;
      await expect(
        service.issueWithinManager(manager, TENANT, [DOCUMENT], ACTOR, prepared(), []),
      ).resolves.toEqual([]);

      expect(payments.lockSubscriber).toHaveBeenCalledWith(manager, SUBSCRIBER);
      expect(payments.applyCreditWithin).toHaveBeenCalledWith(
        manager,
        TENANT,
        DOCUMENT,
        SUBSCRIBER,
        ACTOR,
      );
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'BillingDocument',
          entityId: DOCUMENT,
        }),
        manager,
      );
      const update = query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE billing_documents'),
      );
      expect(update?.[0]).toContain("SET status = 'EMITIDO'");
    });

    it('reintenta el consecutivo ante una colisión y se detiene tras tres intentos', async () => {
      const conflict = Object.assign(new Error('duplicate'), {
        driverError: { code: '23505', constraint: 'billing_documents_tenant_id_number_key' },
      });
      route({ 'UPDATE billing_documents': undefined });
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT document_prefix FROM billing_policy'))
          return [{ document_prefix: 'FE' }];
        if (sql.includes('SELECT period_start::text, period_end::text, effective_policy'))
          return [
            {
              period_start: '2026-10-05',
              period_end: '2026-11-04',
              effective_policy: effectivePolicy,
            },
          ];
        if (sql.includes('regexp_replace(number')) return [{ next: 4 }];
        if (sql.includes('FROM billing_documents d')) return [documentRow];
        if (sql.includes('UPDATE billing_documents')) throw conflict;
        if (sql.includes('SAVEPOINT')) return [];
        return [];
      });

      await expect(
        service.issueWithinManager(
          { query } as unknown as EntityManager,
          TENANT,
          [DOCUMENT],
          ACTOR,
          prepared(),
          [],
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      const rollbacks = query.mock.calls.filter(([sql]) =>
        String(sql).includes('ROLLBACK TO SAVEPOINT'),
      );
      expect(rollbacks).toHaveLength(3);
    });

    it('propaga un error de base que no es colisión de consecutivo', async () => {
      route({ 'UPDATE billing_documents': undefined });
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_advisory_xact_lock')) return [];
        if (sql.includes('SELECT document_prefix FROM billing_policy'))
          return [{ document_prefix: 'FE' }];
        if (sql.includes('SELECT period_start::text, period_end::text, effective_policy'))
          return [
            {
              period_start: '2026-10-05',
              period_end: '2026-11-04',
              effective_policy: effectivePolicy,
            },
          ];
        if (sql.includes('regexp_replace(number')) return [{ next: 1 }];
        if (sql.includes('FROM billing_documents d')) return [documentRow];
        if (sql.includes('UPDATE billing_documents')) throw new Error('conexión perdida');
        if (sql.includes('SAVEPOINT')) return [];
        return [];
      });

      await expect(
        service.issueWithinManager(
          { query } as unknown as EntityManager,
          TENANT,
          [DOCUMENT],
          ACTOR,
          prepared(),
          [],
        ),
      ).rejects.toThrow('conexión perdida');
    });
  });

  describe('issue', () => {
    it('prepara cada contrato sin descifrar y emite en una sola transacción', async () => {
      route({
        'SELECT id, contract_id FROM billing_documents': [{ id: DOCUMENT, contract_id: CONTRACT }],
        'FROM billing_documents d': [documentRow],
      });
      const result = await service.issue([DOCUMENT], ACTOR);
      expect(contracts.findByContractId).toHaveBeenCalledWith(CONTRACT, {
        revealDocument: false,
      });
      expect(payments.emitEvents).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('anulación', () => {
    it('rechaza un documento inexistente', async () => {
      route({ 'SELECT id::text, period_id::text, status': [] });
      await expect(
        service.void(DOCUMENT, 'ERROR_DE_VALOR', undefined, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza un documento que no está emitido', async () => {
      route({
        'SELECT id::text, period_id::text, status': [
          { id: DOCUMENT, period_id: PERIOD, status: 'BORRADOR' },
        ],
      });
      await expect(
        service.void(DOCUMENT, 'ERROR_DE_VALOR', undefined, ACTOR),
      ).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_ISSUED },
      });
    });

    it('anula, revierte aplicaciones, audita y recalcula señales', async () => {
      route({
        'SELECT id::text, period_id::text, status': [
          { id: DOCUMENT, period_id: PERIOD, status: 'EMITIDO' },
        ],
      });
      await service.void(DOCUMENT, 'ERROR_DE_VALOR', 'nota', ACTOR);
      expect(payments.recalculateSignals).toHaveBeenCalledWith(expect.anything(), TENANT, [PERIOD]);
      expect(payments.emitEvents).toHaveBeenCalled();
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({ newValue: { status: 'ANULADO', reasonCode: 'ERROR_DE_VALOR' } }),
        expect.anything(),
      );
    });
  });

  describe('descarte', () => {
    it('rechaza un documento inexistente', async () => {
      route({ 'SELECT status FROM billing_documents': [] });
      await expect(service.discard(DOCUMENT, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rechaza un documento que ya no es borrador', async () => {
      route({ 'SELECT status FROM billing_documents': [{ status: 'EMITIDO' }] });
      await expect(service.discard(DOCUMENT, ACTOR)).rejects.toMatchObject({
        response: { code: BILLING_ERROR_CODES.BILLING_DOCUMENT_NOT_DRAFT },
      });
    });

    it('borra el borrador y audita la eliminación', async () => {
      route({ 'SELECT status FROM billing_documents': [{ status: 'BORRADOR' }] });
      await service.discard(DOCUMENT, ACTOR);
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM billing_documents WHERE tenant_id = $1 AND id = $2',
        [TENANT, DOCUMENT],
      );
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.DELETE, entityId: DOCUMENT }),
        expect.anything(),
      );
    });
  });

  describe('listado y detalle', () => {
    it.each([
      ['PAGADO', { status: 'EMITIDO', paid_amount: '119.00' }],
      ['VENCIDO', { status: 'EMITIDO', due_date: '2020-01-01' }],
      ['PARCIAL', { status: 'EMITIDO', paid_amount: '59.50' }],
      ['PENDIENTE', { status: 'EMITIDO' }],
    ])('deriva el estado de pago %s de un documento emitido', async (state, patch) => {
      route({ 'FROM billing_documents d': [{ ...documentRow, ...patch }] });
      const result = await service.findOne(DOCUMENT, ACTOR);
      expect(result.paymentState).toBe(state);
    });

    it('no deriva estado de pago para un documento que no está emitido', async () => {
      const result = await service.findOne(DOCUMENT, ACTOR);
      expect(result.paymentState).toBeNull();
    });

    it('responde 404 cuando el documento no existe', async () => {
      route({ 'FROM billing_documents d': [] });
      await expect(service.findOne(DOCUMENT, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devuelve una lista vacía sin consultar la base para SIN_DOCUMENTO', async () => {
      const result = await service.list(
        { page: 1, limit: 25, paymentState: 'SIN_DOCUMENTO' },
        ACTOR,
      );
      expect(result).toMatchObject({ data: [], total: 0, page: 1, limit: 25 });
      expect(query).not.toHaveBeenCalled();
    });

    it('combina todos los filtros en la consulta paginada', async () => {
      route({
        'SELECT count(*)::int AS total': [{ total: 1 }],
        'FROM billing_documents d': [documentRow],
      });
      const result = await service.list(
        {
          page: 2,
          limit: 10,
          status: 'BORRADOR',
          paymentState: 'PENDIENTE',
          cycleDay: 5,
          subscriberId: SUBSCRIBER,
          from: '2026-11-01',
          to: '2026-11-30',
        },
        ACTOR,
      );
      const countSql = String(
        query.mock.calls.find(([sql]) =>
          String(sql).includes('SELECT count(*)::int AS total'),
        )?.[0],
      );
      expect(countSql).toContain('d.status = $2');
      expect(countSql).toContain('d.subscriber_id = $3::uuid');
      expect(countSql).toContain('d.issue_date >= $4::date');
      expect(countSql).toContain('d.issue_date <= $5::date');
      expect(countSql).toContain('EXTRACT(DAY FROM p.period_start)::int = $6');
      expect(countSql).toContain('CASE WHEN d.status <>');
      expect(result.meta).toMatchObject({ total: 1, page: 2, limit: 10, totalPages: 1 });
      expect(result.data).toHaveLength(1);
    });

    it('redacta el adquirente bloqueado sin permiso y no audita', async () => {
      route({ 'FROM billing_documents d': [documentRow] });
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      const result = await service.findOne(DOCUMENT, ACTOR);
      expect(result.buyerProtected).toBe(true);
      expect(result.buyerSnapshot?.['displayName']).not.toBe('Adquirente de prueba');
      expect(audit.logWithin).not.toHaveBeenCalled();
    });

    it('audita el acceso a datos bloqueados cuando el actor tiene permiso de privacidad', async () => {
      route({ 'FROM billing_documents d': [documentRow] });
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      permissions.getEffectivePermissionsForUser.mockResolvedValueOnce([
        AccessPermissionKey.PRIVACY_READ,
      ]);
      const result = await service.findOne(DOCUMENT, ACTOR);
      expect(result.buyerProtected).toBe(false);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.RECORD_ACCESS, entityId: DOCUMENT }),
        expect.anything(),
      );
    });

    it('responde 503 si la auditoría del acceso bloqueado falla', async () => {
      route({ 'FROM billing_documents d': [documentRow] });
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      permissions.getEffectivePermissionsForUser.mockResolvedValueOnce([
        AccessPermissionKey.PRIVACY_READ,
      ]);
      audit.logWithin.mockRejectedValueOnce(new Error('audit caída'));
      await expect(service.findOne(DOCUMENT, ACTOR)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('audita LIST_ACCESS con el conteo cuando el bloqueado aparece en un listado', async () => {
      route({
        'SELECT count(*)::int AS total': [{ total: 1 }],
        'FROM billing_documents d': [documentRow],
      });
      privacyMarks.activeMarks.mockResolvedValueOnce({ [PARTY]: ['DATOS_BLOQUEADOS'] });
      permissions.getEffectivePermissionsForUser.mockResolvedValueOnce([
        AccessPermissionKey.CRM_BLOCKED_DATA_READ,
      ]);
      const result = await service.list({ page: 1, limit: 25 }, ACTOR);
      expect(result.data[0]?.buyerProtected).toBe(false);
      expect(audit.logWithin).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LIST_ACCESS,
          newValue: { purpose: 'list', totalServed: 1, blockedServed: 1 },
        }),
        expect.anything(),
      );
    });
  });

  describe('validación de montos', () => {
    it('falla con un monto almacenado que no es monetario', async () => {
      route({ 'FROM billing_documents d': [{ ...documentRow, status: 'EMITIDO', total: 'x' }] });
      await expect(service.findOne(DOCUMENT, ACTOR)).rejects.toBeInstanceOf(RangeError);
    });
  });
});
