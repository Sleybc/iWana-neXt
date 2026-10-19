import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { AuditAction, SubscriberStatus } from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { decryptAes256Gcm, encryptAes256Gcm } from '../../../../common/crypto/aes-gcm.util';
import { ContractStatus } from '../../enums/contract-status.enum';
import { SubscriberLifecycleService } from '../subscriber-lifecycle.service';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();
const activeKey = Buffer.from('0123456789abcdef'.repeat(4), 'hex');
const previousKey = Buffer.from('fedcba9876543210'.repeat(4), 'hex');
const activeKeyHex = activeKey.toString('hex');
const previousKeyHex = previousKey.toString('hex');

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: unknown[]) => mockRunInTenantSchema(...args),
    TenantContext: { getOrThrow: () => mockTenantContextGetOrThrow() },
  };
});

describe('SubscriberLifecycleService', () => {
  const subscriberId = '00000000-0000-4000-8000-000000000001';
  const contractIds: [string, string] = [
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
  ];
  let service: SubscriberLifecycleService;
  let query: jest.Mock;
  let logWithin: jest.Mock;
  let loggerLog: jest.SpyInstance;
  let assetLoanReadPort: { findOpenContractIds: jest.Mock };
  let executionOrderReadPort: { hasOpenWithdrawalOrders: jest.Mock };
  let configService: ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'tenant-test',
      schemaName: 'tenant_test',
    });
    query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return contractIds.map((id) => ({ id, status: ContractStatus.ACTIVE }));
      }
      return [];
    });
    const manager = { query };
    assetLoanReadPort = { findOpenContractIds: jest.fn().mockResolvedValue([]) };
    executionOrderReadPort = { hasOpenWithdrawalOrders: jest.fn().mockResolvedValue(false) };
    configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'MFA_ENCRYPTION_KEY') return '33'.repeat(32);
        throw new Error(`Unexpected config key ${key}`);
      }),
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'PII_ENCRYPTION_KEY') return activeKeyHex;
        if (key === 'PII_ENCRYPTION_KEY_PREVIOUS') return previousKeyHex;
        return undefined;
      }),
    } as unknown as ConfigService;
    mockRunInTenantSchema.mockImplementation(
      async (
        _dataSource: DataSource,
        _schemaName: string,
        callback: (qr: QueryRunner) => unknown,
      ) => callback({ query, manager } as unknown as QueryRunner),
    );
    logWithin = jest.fn().mockResolvedValue(undefined);
    service = new SubscriberLifecycleService(
      {} as DataSource,
      { logWithin } as unknown as AuditService,
      assetLoanReadPort as never,
      executionOrderReadPort as never,
      configService,
    );
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => loggerLog.mockRestore());

  it('CA-LC-01 suspends all active contracts atomically and persists one shared batch', async () => {
    const result = await service.suspend(
      subscriberId,
      { reasonCode: 'MORA', note: 'Nota sintética no debe llegar al log' },
      '00000000-0000-4000-8000-000000000099',
    );

    expect(result.affectedContracts).toEqual(
      contractIds.map((id) => ({
        id,
        fromStatus: ContractStatus.ACTIVE,
        toStatus: ContractStatus.SUSPENDED,
      })),
    );
    expect(result.subscriberStatus).toEqual({
      from: SubscriberStatus.ACTIVE,
      to: SubscriberStatus.SUSPENDED,
    });
    expect(result.hasLiveContracts).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('FOR UPDATE'))).toBe(true);
    const historyWrites = query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO crm_lifecycle_changes'),
    );
    expect(historyWrites).toHaveLength(3);
    expect(new Set(historyWrites.map(([, params]) => (params as unknown[])[10])).size).toBe(1);
    for (const [, params] of historyWrites) {
      const values = params as unknown[];
      const encryptedNote = values[7] as string;
      expect(encryptedNote).toMatch(/^[\da-f]{24}:[\da-f]{32}:[\da-f]+$/u);
      expect(encryptedNote).not.toContain('Nota sintética no debe llegar al log');
      expect(decryptAes256Gcm(encryptedNote, activeKey, [previousKey])).toBe(
        'Nota sintética no debe llegar al log',
      );
      expect(values[8]).toBe(false);
    }
    expect(logWithin).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(loggerLog.mock.calls)).not.toContain('Nota sintética');
    expect(JSON.stringify(loggerLog.mock.calls)).toContain('MORA');
  });

  it('CA-LC-02 reactivates one selected contract and derives the subscriber as active', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.SUSPENDED,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [
          { id: contractIds[0], status: ContractStatus.SUSPENDED },
          { id: contractIds[1], status: ContractStatus.SUSPENDED },
        ];
      }
      return [];
    });

    const result = await service.reactivate(
      subscriberId,
      { reasonCode: 'PAGO_REGISTRADO', contractIds: [contractIds[0]] },
      '00000000-0000-4000-8000-000000000099',
    );

    expect(result.affectedContracts).toEqual([
      {
        id: contractIds[0],
        fromStatus: ContractStatus.SUSPENDED,
        toStatus: ContractStatus.ACTIVE,
      },
    ]);
    expect(result.subscriberStatus).toEqual({
      from: SubscriberStatus.SUSPENDED,
      to: SubscriberStatus.ACTIVE,
    });
    const contractUpdates = query.mock.calls.filter(([sql]) =>
      String(sql).startsWith('UPDATE contracts'),
    );
    expect(contractUpdates).toHaveLength(1);
    expect((contractUpdates[0]?.[1] as unknown[])[2]).toBe(contractIds[0]);
  });

  it('CA-LC-03 keeps the subscriber active when one of multiple active contracts is suspended', async () => {
    const result = await service.suspend(
      subscriberId,
      { reasonCode: 'SOLICITUD_TITULAR', contractIds: [contractIds[0]] },
      '00000000-0000-4000-8000-000000000099',
    );

    expect(result.affectedContracts).toEqual([
      {
        id: contractIds[0],
        fromStatus: ContractStatus.ACTIVE,
        toStatus: ContractStatus.SUSPENDED,
      },
    ]);
    expect(result.subscriberStatus).toEqual({
      from: SubscriberStatus.ACTIVE,
      to: SubscriberStatus.ACTIVE,
    });
    expect(result.hasLiveContracts).toBe(true);
    const contractUpdates = query.mock.calls.filter(([sql]) =>
      String(sql).startsWith('UPDATE contracts'),
    );
    expect(contractUpdates).toHaveLength(1);
    expect((contractUpdates[0]?.[1] as unknown[])[2]).toBe(contractIds[0]);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE subscribers'))).toBe(
      false,
    );
  });

  it('CA-LC-07 does not write when an explicitly selected contract is ineligible', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [
          { id: contractIds[0], status: ContractStatus.ACTIVE },
          { id: contractIds[1], status: ContractStatus.TERMINATED },
        ];
      }
      return [];
    });

    await expect(
      service.suspend(
        subscriberId,
        { reasonCode: 'MORA', contractIds },
        '00000000-0000-4000-8000-000000000099',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
    expect(logWithin).not.toHaveBeenCalled();
  });

  it('CA-LC-06 previews without writes and derives the subscriber result', async () => {
    const result = await service.preview(subscriberId, {
      action: 'SUSPEND',
      reasonCode: 'MORA',
    });

    expect(result).toMatchObject({
      action: 'SUSPEND',
      affectedContracts: contractIds.map((id) => ({
        id,
        fromStatus: ContractStatus.ACTIVE,
        toStatus: ContractStatus.SUSPENDED,
      })),
      subscriberStatus: { from: SubscriberStatus.ACTIVE, to: SubscriberStatus.SUSPENDED },
      hasLiveContracts: true,
      warnings: [],
    });
    expect(
      query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/i.test(String(sql).trim())),
    ).toBe(false);
    expect(logWithin).not.toHaveBeenCalled();
  });

  it('previews termination warnings through the MOD12 and MOD11 read ports', async () => {
    assetLoanReadPort.findOpenContractIds.mockResolvedValue([contractIds[0]]);
    executionOrderReadPort.hasOpenWithdrawalOrders.mockResolvedValue(true);

    const result = await service.preview(subscriberId, {
      action: 'TERMINATE',
      reasonCode: 'SOLICITUD_TITULAR',
      contractIds,
    });

    expect(assetLoanReadPort.findOpenContractIds).toHaveBeenCalledWith(contractIds);
    expect(executionOrderReadPort.hasOpenWithdrawalOrders).toHaveBeenCalledWith(subscriberId);
    expect(result.warnings).toEqual([
      { code: 'EQUIPMENT_ON_LOAN', contractIds: [contractIds[0]] },
      { code: 'OPEN_WITHDRAWAL_ORDERS', contractIds: [] },
    ]);
  });

  it('rechaza vistas previas cuando el suscriptor no existe o no hay servicios elegibles', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) return [];
      return [];
    });
    await expect(
      service.preview(subscriberId, { action: 'SUSPEND', reasonCode: 'MORA' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [{ id: contractIds[0], status: ContractStatus.TERMINATED }];
      }
      return [];
    });
    await expect(
      service.preview(subscriberId, { action: 'SUSPEND', reasonCode: 'MORA' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('valida selección explícita, cancelación y preview de terminación sin avisos', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.CANCELLED,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [{ id: contractIds[0], status: ContractStatus.SUSPENDED }];
      }
      return [];
    });
    await expect(
      service.preview(subscriberId, {
        action: 'REACTIVATE',
        reasonCode: 'PAGO_REGISTRADO',
        contractIds: [contractIds[0]],
      }),
    ).rejects.toMatchObject({ response: { code: 'SUBSCRIBER_CANCELLED' } });

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [
          { id: contractIds[0], status: ContractStatus.ACTIVE },
          { id: contractIds[1], status: ContractStatus.TERMINATED },
        ];
      }
      return [];
    });
    await expect(
      service.preview(subscriberId, {
        action: 'TERMINATE',
        reasonCode: 'SOLICITUD_TITULAR',
        contractIds: [contractIds[1]],
      }),
    ).rejects.toMatchObject({ response: { code: 'LIFECYCLE_CONTRACT_STATE_CHANGED' } });

    const result = await service.preview(subscriberId, {
      action: 'TERMINATE',
      reasonCode: 'SOLICITUD_TITULAR',
      contractIds: [contractIds[0]],
    });
    expect(result.warnings).toEqual([]);
    expect(assetLoanReadPort.findOpenContractIds).toHaveBeenCalledWith([contractIds[0]]);
    expect(executionOrderReadPort.hasOpenWithdrawalOrders).toHaveBeenCalledWith(subscriberId);
  });

  it('rechaza un lote sin cambios y una Idempotency-Key vacía antes de escribir', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM contracts')) {
        return contractIds.map((id) => ({ id, status: ContractStatus.TERMINATED }));
      }
      return [
        {
          id: subscriberId,
          status: SubscriberStatus.ACTIVE,
          activated_at: new Date('2026-10-01T00:00:00.000Z'),
        },
      ];
    });

    await expect(
      service.suspend(subscriberId, { reasonCode: 'MORA' }, 'actor-test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.suspend(subscriberId, { reasonCode: 'MORA' }, 'actor-test', '   '),
    ).rejects.toMatchObject({ response: { code: 'INVALID_IDEMPOTENCY_KEY' } });
    await expect(
      service.suspend(subscriberId, { reasonCode: 'MORA' }, 'actor-test', 'x'.repeat(201)),
    ).rejects.toMatchObject({ response: { code: 'INVALID_IDEMPOTENCY_KEY' } });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
    expect(logWithin).not.toHaveBeenCalled();
  });

  it('cancela y descarta borradores en la misma transacción con auditoría', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [
          { id: contractIds[0], status: ContractStatus.DRAFT },
          { id: contractIds[1], status: ContractStatus.TERMINATED },
        ];
      }
      return [];
    });

    const result = await service.cancelSubscriber(
      subscriberId,
      {
        targetStatus: SubscriberStatus.CANCELLED,
        reasonCode: 'SOLICITUD_TITULAR',
        note: 'Nota privada de prueba',
      },
      'actor-test',
    );

    expect(result).toEqual({
      id: subscriberId,
      status: SubscriberStatus.CANCELLED,
      fromStatus: SubscriberStatus.ACTIVE,
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SET deleted_at = now()'))).toBe(
      true,
    );
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE subscribers'))).toBe(
      true,
    );
    expect(logWithin).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(loggerLog.mock.calls)).not.toContain('Nota privada de prueba');
  });

  it('devuelve la cancelación idempotente y rechaza una clave usada con otro contenido', async () => {
    const cancellationRow = {
      id: 'history-1',
      entity_type: 'SUBSCRIBER',
      entity_id: subscriberId,
      subscriber_id: subscriberId,
      from_status: SubscriberStatus.ACTIVE,
      to_status: SubscriberStatus.CANCELLED,
      reason_code: 'SOLICITUD_TITULAR',
      note_encrypted: null,
      contract_scope_explicit: false,
      source: 'MANUAL',
      batch_id: '00000000-0000-4000-8000-000000000111',
      actor_id: 'actor-test',
      changed_at: new Date('2026-10-10T00:00:00.000Z'),
    };
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.CANCELLED,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM crm_lifecycle_changes')) return [cancellationRow];
      return [];
    });

    const command = {
      targetStatus: SubscriberStatus.CANCELLED,
      reasonCode: 'SOLICITUD_TITULAR',
    } as const;
    await expect(
      service.cancelSubscriber(subscriberId, command, 'actor-test', 'cancel-1'),
    ).resolves.toEqual({
      id: subscriberId,
      status: SubscriberStatus.CANCELLED,
      fromStatus: SubscriberStatus.ACTIVE,
    });
    await expect(
      service.cancelSubscriber(
        subscriberId,
        { ...command, reasonCode: 'MORA_PROLONGADA' },
        'actor-test',
        'cancel-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('trata como idempotente una cancelación ya persistida sin clave', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.CANCELLED,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      return [];
    });

    await expect(
      service.cancelSubscriber(
        subscriberId,
        { targetStatus: SubscriberStatus.CANCELLED, reasonCode: 'SOLICITUD_TITULAR' },
        'actor-test',
      ),
    ).resolves.toEqual({
      id: subscriberId,
      status: SubscriberStatus.CANCELLED,
      fromStatus: SubscriberStatus.CANCELLED,
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('FROM contracts'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('repite un lote idempotente con su batch y rechaza reutilizar la clave', async () => {
    const historyRows = [
      {
        id: 'history-contract',
        entity_type: 'CONTRACT',
        entity_id: contractIds[0],
        subscriber_id: subscriberId,
        from_status: ContractStatus.ACTIVE,
        to_status: ContractStatus.SUSPENDED,
        reason_code: 'MORA',
        note_encrypted: encryptAes256Gcm('Nota de reintento', activeKey),
        contract_scope_explicit: false,
        source: 'MANUAL',
        batch_id: '00000000-0000-4000-8000-000000000112',
        actor_id: 'actor-test',
        changed_at: new Date('2026-10-10T00:00:00.000Z'),
      },
      {
        id: 'history-subscriber',
        entity_type: 'SUBSCRIBER',
        entity_id: subscriberId,
        subscriber_id: subscriberId,
        from_status: SubscriberStatus.ACTIVE,
        to_status: SubscriberStatus.SUSPENDED,
        reason_code: 'MORA',
        note_encrypted: encryptAes256Gcm('Nota de reintento', activeKey),
        contract_scope_explicit: false,
        source: 'MANUAL',
        batch_id: '00000000-0000-4000-8000-000000000112',
        actor_id: 'actor-test',
        changed_at: new Date('2026-10-10T00:00:00.000Z'),
      },
    ];
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.SUSPENDED,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM crm_lifecycle_changes')) return historyRows;
      if (sql.includes('FROM contracts')) {
        return contractIds.map((id) => ({ id, status: ContractStatus.SUSPENDED }));
      }
      return [];
    });

    const result = await service.suspend(
      subscriberId,
      { reasonCode: 'MORA', note: 'Nota de reintento' },
      'actor-test',
      'suspend-1',
    );
    expect(result.batchId).toBe(historyRows[0]?.batch_id);
    expect(result.affectedContracts).toEqual([
      {
        id: contractIds[0],
        fromStatus: ContractStatus.ACTIVE,
        toStatus: ContractStatus.SUSPENDED,
      },
    ]);
    await expect(
      service.suspend(subscriberId, { reasonCode: 'USO_INDEBIDO' }, 'actor-test', 'suspend-1'),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      service.suspend(
        subscriberId,
        { reasonCode: 'MORA', note: 'Nota distinta' },
        'actor-test',
        'suspend-1',
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('mantiene el límite de 500 caracteres antes de iniciar la mutación', async () => {
    await expect(
      service.suspend(subscriberId, { reasonCode: 'MORA', note: 'n'.repeat(501) }, 'actor-test'),
    ).rejects.toMatchObject({ response: { code: 'LIFECYCLE_NOTE_TOO_LONG' } });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('rechaza reintento sin contractIds si la clave se creó con alcance explícito', async () => {
    const historyRows = [
      {
        id: 'history-contract',
        entity_type: 'CONTRACT',
        entity_id: contractIds[0],
        subscriber_id: subscriberId,
        from_status: ContractStatus.ACTIVE,
        to_status: ContractStatus.SUSPENDED,
        reason_code: 'MORA',
        note_encrypted: null,
        contract_scope_explicit: true,
        source: 'MANUAL',
        batch_id: '00000000-0000-4000-8000-000000000115',
        actor_id: 'actor-test',
        changed_at: new Date('2026-10-10T00:00:00.000Z'),
      },
      {
        id: 'history-subscriber',
        entity_type: 'SUBSCRIBER',
        entity_id: subscriberId,
        subscriber_id: subscriberId,
        from_status: SubscriberStatus.ACTIVE,
        to_status: SubscriberStatus.ACTIVE,
        reason_code: 'MORA',
        note_encrypted: null,
        contract_scope_explicit: true,
        source: 'MANUAL',
        batch_id: '00000000-0000-4000-8000-000000000115',
        actor_id: 'actor-test',
        changed_at: new Date('2026-10-10T00:00:00.000Z'),
      },
    ];
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM crm_lifecycle_changes')) return historyRows;
      return [];
    });

    await expect(
      service.suspend(subscriberId, { reasonCode: 'MORA' }, 'actor-test', 'scope-1'),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('transiciona un contrato individual y ejecuta la guarda transaccional de activación', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT subscriber_id FROM contracts')) {
        return [{ subscriber_id: subscriberId }];
      }
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.SUSPENDED,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [
          { id: contractIds[0], status: ContractStatus.SUSPENDED },
          { id: contractIds[1], status: ContractStatus.ACTIVE },
        ];
      }
      return [];
    });
    const beforeTransition = jest.fn().mockResolvedValue(undefined);

    const result = await service.transitionContract(
      contractIds[0],
      'REACTIVATE',
      { reasonCode: 'PAGO_REGISTRADO' },
      'actor-test',
      undefined,
      beforeTransition,
    );

    expect(beforeTransition).toHaveBeenCalledWith(expect.anything(), [contractIds[0]]);
    expect(result.affectedContracts).toEqual([
      {
        id: contractIds[0],
        fromStatus: ContractStatus.SUSPENDED,
        toStatus: ContractStatus.ACTIVE,
      },
    ]);
    expect(result.subscriberStatus.to).toBe(SubscriberStatus.ACTIVE);
  });

  it('rechaza una transición individual si el servicio no existe o ya cambió de estado', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT subscriber_id FROM contracts')) return [];
      return [];
    });
    await expect(
      service.transitionContract(contractIds[0], 'SUSPEND', { reasonCode: 'MORA' }, 'actor-test'),
    ).rejects.toBeInstanceOf(NotFoundException);

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT subscriber_id FROM contracts')) {
        return [{ subscriber_id: subscriberId }];
      }
      if (sql.includes('FROM subscribers')) {
        return [
          {
            id: subscriberId,
            status: SubscriberStatus.ACTIVE,
            activated_at: new Date('2026-10-01T00:00:00.000Z'),
          },
        ];
      }
      if (sql.includes('FROM contracts')) {
        return [{ id: contractIds[0], status: ContractStatus.TERMINATED }];
      }
      return [];
    });
    await expect(
      service.transitionContract(contractIds[0], 'SUSPEND', { reasonCode: 'MORA' }, 'actor-test'),
    ).rejects.toMatchObject({ response: { code: 'LIFECYCLE_CONTRACT_STATE_CHANGED' } });
  });

  it('bloquea el motivo de descarte reservado al sistema en comandos internos', async () => {
    await expect(
      service.terminate(
        subscriberId,
        {
          reasonCode: 'DESCARTE_EXPEDIENTE',
          contractIds: [contractIds[0]],
        } as never,
        'actor-test',
      ),
    ).rejects.toMatchObject({ response: { code: 'LIFECYCLE_SYSTEM_ONLY_REASON' } });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('pagina el historial y omite la nota cuando el actor no tiene permiso de lectura', async () => {
    const historyRecord = {
      id: 'history-row',
      entity_type: 'CONTRACT',
      entity_id: contractIds[0],
      subscriber_id: subscriberId,
      from_status: ContractStatus.ACTIVE,
      to_status: ContractStatus.SUSPENDED,
      reason_code: 'MORA',
      note_encrypted: encryptAes256Gcm('No debe exponerse', activeKey),
      contract_scope_explicit: false,
      source: 'MANUAL',
      batch_id: '00000000-0000-4000-8000-000000000113',
      actor_id: 'actor-test',
      changed_at: new Date('2026-10-10T00:00:00.000Z'),
    };
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ total: 1 }];
      if (sql.includes('FROM crm_lifecycle_changes')) return [historyRecord];
      return [];
    });

    const result = await service.listHistory(subscriberId, {
      page: 1,
      limit: 10,
      canReadNote: false,
    });

    expect(result.data[0]).toMatchObject({
      entityType: 'CONTRACT',
      entityId: contractIds[0],
      reasonCode: 'MORA',
      changedAt: '2026-10-10T00:00:00.000Z',
    });
    expect(result.data[0]).not.toHaveProperty('note');
    expect(result.meta).toMatchObject({ page: 1, limit: 10, total: 1 });
    expect(
      query.mock.calls.find(([sql]) => String(sql).includes('SELECT id, entity_type'))?.[0],
    ).toContain('NULL::text AS note_encrypted');
  });

  it('incluye la nota y acepta changedAt previamente serializado con permiso de lectura', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return [{ total: 1 }];
      if (sql.includes('SELECT id, entity_type')) {
        return [
          {
            id: 'history-row',
            entity_type: 'SUBSCRIBER',
            entity_id: subscriberId,
            subscriber_id: subscriberId,
            from_status: SubscriberStatus.ACTIVE,
            to_status: SubscriberStatus.SUSPENDED,
            reason_code: 'MORA',
            note_encrypted: encryptAes256Gcm('Nota autorizada', previousKey),
            contract_scope_explicit: false,
            source: 'MANUAL',
            batch_id: '00000000-0000-4000-8000-000000000114',
            actor_id: 'actor-test',
            changed_at: '2026-10-10T00:00:00.000Z',
          },
        ];
      }
      return [];
    });

    const result = await service.listHistory(subscriberId, {
      canReadNote: true,
      page: 1,
      limit: 10,
    });
    expect(result.data[0]).toMatchObject({
      note: 'Nota autorizada',
      changedAt: '2026-10-10T00:00:00.000Z',
    });
    expect(
      query.mock.calls.find(([sql]) => String(sql).includes('SELECT id, entity_type'))?.[0],
    ).not.toContain('NULL::text AS note_encrypted');
  });
});
