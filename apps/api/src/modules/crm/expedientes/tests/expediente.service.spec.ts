import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuditAction, ConsentStatus, ConsentType, ExpedienteStatus } from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { UpdateSectionDto, ExpedienteSection } from '../dto/update-section.dto';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { StatusChange } from '../entities/status-change.entity';
import { ExpedienteService } from '../expediente.service';

const mockRunInTenantSchema = jest.fn();
const mockTenantContextGetOrThrow = jest.fn();

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db') as Record<string, unknown>;
  return {
    ...actual,
    runInTenantSchema: (...args: Parameters<typeof mockRunInTenantSchema>) =>
      mockRunInTenantSchema(...args),
    TenantContext: {
      getOrThrow: () => mockTenantContextGetOrThrow(),
    },
  };
});

describe('ExpedienteService', () => {
  let service: ExpedienteService;

  const auditServiceMock = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const completenessCalculatorMock = {
    calculate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpedienteService,
        { provide: DataSource, useValue: {} },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('0'.repeat(64)) },
        },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: CompletenessCalculator, useValue: completenessCalculatorMock },
      ],
    }).compile();

    service = module.get<ExpedienteService>(ExpedienteService);
  });

  it('crea el expediente con actor real y sincroniza completitud', async () => {
    const expediente = buildExpediente({
      id: 'exp-1',
      fullName: '  Cliente Demo  ',
      source: '  Referido  ',
      createdBy: 'user-1',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          save: async (_entity: unknown, data: Record<string, unknown>) => ({
            ...expediente,
            ...data,
            id: 'exp-1',
          }),
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => ({
            ...expediente,
            fullName: 'Cliente Demo',
            source: 'Referido',
            contactAttempts: [],
            consents: [],
            coverageChecks: [],
            statusChanges: [],
          }),
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 10,
      legal: 20,
      technical: 30,
      operational: 40,
      overall: 25,
    });

    const created = await service.create(
      { fullName: '  Cliente Demo  ', source: '  Referido  ' },
      'user-1',
    );

    expect(created.id).toBe('exp-1');
    expect(created.createdBy).toBe('user-1');
    expect(completenessCalculatorMock.calculate).toHaveBeenCalledWith('exp-1');
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATE,
        entityId: 'exp-1',
        userId: 'user-1',
      }),
    );
  });

  it('actualiza la seccion de contacto cifrando datos sensibles y recalculando completitud', async () => {
    const expediente = buildExpediente({ id: 'exp-2' });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 80,
      legal: 50,
      technical: 40,
      operational: 30,
      overall: 50,
    });

    const updated = await service.updateSection(
      'exp-2',
      {
        section: ExpedienteSection.CONTACT,
        data: { phonePrimary: '3001112233', emailPrimary: 'demo@test.com' },
      } satisfies UpdateSectionDto,
      'user-2',
    );

    expect(updated.phonePrimaryEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(updated.emailPrimaryEncrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(updated.phonePrimaryEncrypted).not.toContain('3001112233');
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityId: 'exp-2',
        userId: 'user-2',
      }),
    );
  });

  it('actualiza la seccion de interes comercial incluyendo la fuente cuando se edita desde portal', async () => {
    const expediente = buildExpediente({
      id: 'exp-commercial',
      source: 'Manual',
      interestedPlanId: null,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 60,
      legal: 0,
      technical: 0,
      operational: 0,
      overall: 15,
    });

    const updated = await service.updateSection(
      'exp-commercial',
      {
        section: ExpedienteSection.COMMERCIAL_INTEREST,
        data: { source: 'Referido', interestedPlanId: 'plan-empresarial-500' },
      } satisfies UpdateSectionDto,
      'user-commercial',
    );

    expect(updated.source).toBe('Referido');
    expect(updated.interestedPlanId).toBe('plan-empresarial-500');
  });

  it('registra el cambio de estado con el actor autenticado', async () => {
    const expediente = buildExpediente({
      id: 'exp-3',
      status: ExpedienteStatus.CONTACTADO,
      previousStatus: ExpedienteStatus.NUEVO_POTENCIAL,
    });
    const createdStatusChanges: Array<Record<string, unknown>> = [];

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (entity: unknown, data: Record<string, unknown>) => {
            if (entity === ExpedienteRecord) {
              Object.assign(expediente, data);
            }
            if (entity === StatusChange) {
              createdStatusChanges.push(data);
            }
            return data;
          },
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => ({
            ...expediente,
            statusChanges: createdStatusChanges,
            contactAttempts: [],
            consents: [],
            coverageChecks: [],
          }),
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 90,
      legal: 90,
      technical: 90,
      operational: 90,
      overall: 90,
    });

    const updated = await service.transitionStatus(
      'exp-3',
      { targetStatus: ExpedienteStatus.EN_COTIZACION, reason: 'Plan validado' },
      'user-3',
    );

    expect(updated.status).toBe(ExpedienteStatus.EN_COTIZACION);
    expect(createdStatusChanges).toHaveLength(1);
    expect(createdStatusChanges[0]).toEqual(
      expect.objectContaining({
        changedBy: 'user-3',
        fromStatus: ExpedienteStatus.CONTACTADO,
        toStatus: ExpedienteStatus.EN_COTIZACION,
      }),
    );
  });

  it('reactiva un expediente descartado al estado previo y limpia el motivo de descarte', async () => {
    const expediente = buildExpediente({
      id: 'exp-4',
      status: ExpedienteStatus.DESCARTADO,
      previousStatus: ExpedienteStatus.PRECALIFICADO,
      discardReason: 'Sin contacto',
    });
    const createdStatusChanges: Array<Record<string, unknown>> = [];

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (entity: unknown, data: Record<string, unknown>) => {
            if (entity === ExpedienteRecord) {
              Object.assign(expediente, data);
            }
            if (entity === StatusChange) {
              createdStatusChanges.push(data);
            }
            return data;
          },
          create: (_entity: unknown, data: Record<string, unknown>) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => ({
            ...expediente,
            statusChanges: createdStatusChanges,
            contactAttempts: [],
            consents: [],
            coverageChecks: [],
          }),
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 60,
      legal: 50,
      technical: 40,
      operational: 30,
      overall: 45,
    });

    const updated = await service.reactivate('exp-4', 'user-4');

    expect(updated.status).toBe(ExpedienteStatus.PRECALIFICADO);
    expect(updated.discardReason).toBeNull();
    expect(createdStatusChanges[0]).toEqual(
      expect.objectContaining({
        changedBy: 'user-4',
        fromStatus: ExpedienteStatus.DESCARTADO,
        toStatus: ExpedienteStatus.PRECALIFICADO,
      }),
    );
  });

  it('lista expedientes ocultando PII cifrada y exponiendo solo completitud operativa', async () => {
    const expediente = buildExpediente({
      id: 'exp-list',
      documentNumberEncrypted: 'enc-documento',
      phonePrimaryEncrypted: 'enc-telefono-principal',
      phoneSecondaryEncrypted: 'enc-telefono-secundario',
      emailPrimaryEncrypted: 'enc-email',
      altContactPhoneEncrypted: 'enc-alt-contacto',
      siteContactPhoneEncrypted: 'enc-sitio',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) => {
      const queryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[expediente], 1]),
      };

      return callback({
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        },
      });
    });
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 70,
      legal: 55,
      technical: 40,
      operational: 25,
      overall: 48,
    });

    const result = await service.findAll({ search: 'Cliente', page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'exp-list',
        completenessCommercial: 70,
        completenessLegal: 55,
        completenessTechnical: 40,
        completenessOperational: 25,
        documentNumberEncrypted: null,
        phonePrimaryEncrypted: null,
        phoneSecondaryEncrypted: null,
        emailPrimaryEncrypted: null,
        altContactPhoneEncrypted: null,
        siteContactPhoneEncrypted: null,
      }),
    );
  });

  it('filtra por assignedTo y documentNumber exacto manteniendo PII oculta en listados', async () => {
    const encryptedDocument = encryptTestValue('900123456');
    const matchingExpediente = buildExpediente({
      id: 'exp-filter',
      assignedTo: 'advisor-1',
      documentNumberEncrypted: encryptedDocument,
      phonePrimaryEncrypted: 'enc-telefono-principal',
    });
    const createQueryBuilder = jest.fn().mockReturnValue({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[matchingExpediente], 1]),
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          createQueryBuilder,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 70,
      legal: 55,
      technical: 40,
      operational: 25,
      overall: 48,
    });

    const result = await service.findAll({
      assignedTo: 'advisor-1',
      documentNumber: '900123456',
      page: 1,
      limit: 10,
    } as any);

    expect(createQueryBuilder).toHaveBeenCalledWith(ExpedienteRecord, 'expediente');
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('exp-filter');
    expect(result.data[0]?.assignedTo).toBe('advisor-1');
    expect(result.data[0]?.documentNumberEncrypted).toBeNull();
    expect(result.data[0]?.phonePrimaryEncrypted).toBeNull();
  });

  it('revoca consentimiento de tratamiento de datos y marca el agregado para cumplimiento', async () => {
    const consentimiento = {
      id: 'consent-1',
      tenantId: 'ten-1',
      expedienteId: 'exp-consent',
      consentType: ConsentType.TRATAMIENTO_DATOS,
      status: ConsentStatus.ACEPTADO,
      channel: 'TELEFONO',
      obtainedAt: new Date('2026-03-24T10:00:00Z'),
      ipAddress: '10.0.0.5',
      legalTextVersion: 'Ley 1581 de 2012',
      evidenceRef: null,
      revokedAt: null,
      revokedReason: null,
      revokedBy: null,
      createdAt: new Date('2026-03-24T10:00:00Z'),
      updatedAt: new Date('2026-03-24T10:00:00Z'),
    };
    const markConsentRevoked = jest.fn().mockResolvedValue(undefined);
    const syncCompletenessUpdate = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(service, 'findById').mockResolvedValue(buildExpediente({ id: 'exp-consent' }));

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => consentimiento,
            update: markConsentRevoked,
            save: async (_entity: unknown, data: typeof consentimiento) => data,
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            update: syncCompletenessUpdate,
          },
        }),
      );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 65,
      legal: 30,
      technical: 20,
      operational: 10,
      overall: 31,
    });

    const revoked = await service.revokeConsent(
      'exp-consent',
      'consent-1',
      '  <b>Revocado</b> por solicitud del titular  ',
      'user-consent',
    );

    expect(revoked.status).toBe(ConsentStatus.RECHAZADO);
    expect(revoked.revokedBy).toBe('user-consent');
    expect(revoked.revokedReason).toBe('Revocado por solicitud del titular');
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(markConsentRevoked).toHaveBeenCalledWith(
      ExpedienteRecord,
      { id: 'exp-consent' },
      { dataConsentRevoked: true },
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'ConsentRecord',
        entityId: 'consent-1',
        userId: 'user-consent',
        newValue: expect.objectContaining({ reason: 'Revocado por solicitud del titular' }),
      }),
    );
  });

  it('acepta payload legado en ingles para crear consentimiento y lo normaliza a español', async () => {
    const savedConsent: Record<string, unknown>[] = [];

    jest
      .spyOn(service, 'findById')
      .mockResolvedValue(buildExpediente({ id: 'exp-consent-create' }));

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => null,
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: async (_entity: unknown, data: Record<string, unknown>) => {
              savedConsent.push(data);
              return {
                id: 'consent-create-1',
                ...data,
                obtainedAt: new Date('2026-03-26T15:00:00Z'),
                createdAt: new Date('2026-03-26T15:00:00Z'),
                updatedAt: new Date('2026-03-26T15:00:00Z'),
              };
            },
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            update: jest.fn().mockResolvedValue(undefined),
          },
        }),
      );

    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 70,
      legal: 65,
      technical: 50,
      operational: 40,
      overall: 56,
    });

    await service.createConsent(
      'exp-consent-create',
      {
        consentType: 'DATA_TREATMENT' as any,
        status: 'ACCEPTED' as any,
        channel: 'TELEFONO' as any,
        legalTextVersion: 'Ley 1581 v1',
      },
      'user-consent-create',
      '10.0.0.8',
    );

    expect(savedConsent[0]).toEqual(
      expect.objectContaining({
        consentType: ConsentType.TRATAMIENTO_DATOS,
        status: ConsentStatus.ACEPTADO,
        legalTextVersion: 'Ley 1581 de 2012',
      }),
    );
  });

  it('registra cobertura sin intentar nullificar expediente_id en checks ya cargados', async () => {
    const expediente = buildExpediente({
      id: 'exp-coverage',
      createdBy: '959042da-03f9-4dfe-8a45-58b56d4f5b9c',
      coverageChecks: [
        {
          id: 'coverage-existing',
          expedienteId: 'exp-coverage',
          result: 'VIABLE',
        } as any,
      ],
    });
    const saveCoverage = jest.fn().mockResolvedValue({
      id: 'coverage-new',
      tenantId: 'ten-1',
      expedienteId: 'exp-coverage',
      result: 'VIABLE',
      technologyAvailable: 'FIBRA_OPTICA',
      distanceM: 300,
      checkedBy: '959042da-03f9-4dfe-8a45-58b56d4f5b9c',
      checkedAt: new Date('2026-03-26T21:57:37Z'),
      snapshotJson: {},
      addressUsed: 'Cra 19 # 100-50',
    });
    const updateExpediente = jest.fn().mockResolvedValue(undefined);
    const syncCompletenessUpdate = jest.fn().mockResolvedValue(undefined);

    jest.spyOn(service, 'findById').mockResolvedValue(expediente as any);

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            create: (_entity: unknown, data: Record<string, unknown>) => data,
            save: saveCoverage,
            update: updateExpediente,
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            update: syncCompletenessUpdate,
          },
        }),
      );

    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 40,
      legal: 33,
      technical: 75,
      operational: 0,
      overall: 37,
    });

    await service.createCoverageCheck(
      'exp-coverage',
      {
        addressUsed: 'Cra 19 # 100-50',
        result: 'VIABLE' as any,
        technologyAvailable: 'FIBRA_OPTICA',
        distanceM: 300,
      },
      '959042da-03f9-4dfe-8a45-58b56d4f5b9c',
    );

    expect(saveCoverage).toHaveBeenCalledTimes(1);
    expect(updateExpediente).toHaveBeenCalledWith(
      ExpedienteRecord,
      { id: 'exp-coverage' },
      expect.objectContaining({
        coverageResult: 'VIABLE',
        availableTechnology: 'FIBRA_OPTICA',
        estimatedDistanceM: 300,
        feasibility: 'VIABLE',
      }),
    );
  });

  it('asigna el expediente y deja evidencia operativa con el actor que ejecuta la accion', async () => {
    const expediente = buildExpediente({ id: 'exp-assign', assignedTo: null });
    const cambiosEstado: Array<Record<string, unknown>> = [];

    jest
      .spyOn(service, 'findById')
      .mockResolvedValueOnce(expediente)
      .mockResolvedValueOnce({
        ...expediente,
        assignedTo: 'advisor-1',
      });

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => ({
              id: 'user-assign',
              firstName: 'Laura',
              lastName: 'Pérez',
              email: 'laura@tenant.test',
            }),
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            save: async (entity: unknown, data: Record<string, unknown>) => {
              if (entity === ExpedienteRecord) {
                Object.assign(expediente, data);
              }

              if (entity === StatusChange) {
                cambiosEstado.push(data);
              }

              return data;
            },
            create: (_entity: unknown, data: Record<string, unknown>) => data,
          },
        }),
      );

    const assigned = await service.assignExpediente('exp-assign', 'advisor-1', 'user-assign');

    expect(expediente.assignedTo).toBe('advisor-1');
    expect(assigned.assignedTo).toBe('advisor-1');
    expect(cambiosEstado[0]).toEqual(
      expect.objectContaining({
        changedBy: 'user-assign',
        actorName: 'Laura Pérez',
        metadataJson: { type: 'ASSIGNMENT', assignedTo: 'advisor-1' },
      }),
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityType: 'ExpedienteRecord',
        entityId: 'exp-assign',
        userId: 'user-assign',
        newValue: { assignedTo: 'advisor-1' },
      }),
    );
  });

  it('construye el summary del pipeline sin depender de un limit artificial', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) => {
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: ExpedienteStatus.NUEVO_POTENCIAL, count: '2' },
          { status: ExpedienteStatus.CONTACTADO, count: '1' },
        ]),
      };

      return callback({
        manager: {
          createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
        },
      });
    });

    const summary = await (service as any).getPipelineSummary();

    expect(summary.total).toBe(3);
    expect(summary.data[ExpedienteStatus.NUEVO_POTENCIAL]).toBe(2);
    expect(summary.data[ExpedienteStatus.CONTACTADO]).toBe(1);
    expect(summary.data[ExpedienteStatus.DESCARTADO]).toBe(0);
  });

  it('construye actividad operativa con autores y mantiene historial de pipeline separado', async () => {
    const expediente = buildExpediente({
      id: 'exp-activity',
      createdBy: 'user-creator',
      updatedAt: new Date('2026-03-23T12:00:00Z'),
      statusChanges: [
        {
          id: 'status-1',
          tenantId: 'ten-1',
          expedienteId: 'exp-activity',
          fromStatus: ExpedienteStatus.CONTACTADO,
          toStatus: ExpedienteStatus.EN_COTIZACION,
          changedAt: new Date('2026-03-23T11:00:00Z'),
          changedBy: 'user-sales',
          reason: 'Cliente solicita propuesta',
          metadataJson: null,
          createdAt: new Date('2026-03-23T11:00:00Z'),
        },
      ] as unknown as StatusChange[],
    });

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            find: async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
              if ((entity as { name?: string }).name === 'AuditLog') {
                return [
                  {
                    id: 'audit-1',
                    action: AuditAction.UPDATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-activity',
                    userId: 'user-editor',
                    newValue: { section: 'location' },
                    createdAt: new Date('2026-03-23T12:00:00Z'),
                  },
                  {
                    id: 'audit-2',
                    action: AuditAction.CREATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-activity',
                    userId: 'user-creator',
                    newValue: { fullName: 'Cliente Demo' },
                    createdAt: new Date('2026-03-23T09:00:00Z'),
                  },
                ];
              }

              if ((options?.where as { id?: unknown })?.id) {
                return [
                  {
                    id: 'user-creator',
                    firstName: 'Carlos',
                    lastName: 'Mejía',
                    email: 'carlos@tenant.test',
                  },
                  {
                    id: 'user-editor',
                    firstName: 'Ana',
                    lastName: 'Torres',
                    email: 'ana@tenant.test',
                  },
                  {
                    id: 'user-sales',
                    firstName: 'Laura',
                    lastName: 'Pérez',
                    email: 'laura@tenant.test',
                  },
                ];
              }

              return [];
            },
          },
        }),
      );

    const timeline = await service.getTimelineSummary('exp-activity');

    expect(timeline.changes[0]).toEqual(
      expect.objectContaining({
        toStatus: ExpedienteStatus.EN_COTIZACION,
        actor: expect.objectContaining({ name: 'Laura Pérez' }),
      }),
    );
    expect(timeline.activities[0]).toEqual(
      expect.objectContaining({
        type: 'SECTION_UPDATED',
        sectionLabel: 'Ubicación',
        actor: expect.objectContaining({ name: 'Ana Torres' }),
      }),
    );
    expect(timeline.metadata.createdBy.name).toBe('Carlos Mejía');
    expect(timeline.metadata.lastEditedBy.name).toBe('Ana Torres');
  });

  it('infiere creado por desde auditoría histórica cuando el expediente no tiene createdBy resoluble', async () => {
    const expediente = buildExpediente({
      id: 'exp-history',
      createdBy: 'user-missing',
      updatedAt: new Date('2026-03-23T12:30:00Z'),
      statusChanges: [],
    });

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      )
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            find: async (entity: unknown, options?: { where?: Record<string, unknown> }) => {
              if ((entity as { name?: string }).name === 'AuditLog') {
                return [
                  {
                    id: 'audit-create',
                    action: AuditAction.CREATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-history',
                    userId: 'user-liliana',
                    newValue: { fullName: 'Carlos Mejía' },
                    createdAt: new Date('2026-03-23T08:00:00Z'),
                  },
                  {
                    id: 'audit-update',
                    action: AuditAction.UPDATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-history',
                    userId: 'user-liliana',
                    newValue: { section: 'commercial_interest' },
                    createdAt: new Date('2026-03-23T12:00:00Z'),
                  },
                ];
              }

              if ((options?.where as { id?: unknown })?.id) {
                return [
                  {
                    id: 'user-liliana',
                    firstName: 'Liliana Paola',
                    lastName: 'Borda Ovalle',
                    email: 'liliana@tenant.test',
                  },
                ];
              }

              return [];
            },
          },
        }),
      );

    const timeline = await service.getTimelineSummary('exp-history');

    expect(timeline.metadata.createdBy.name).toBe('Liliana Paola Borda Ovalle');
    expect(timeline.metadata.lastEditedBy.name).toBe('Liliana Paola Borda Ovalle');
  });

  it('persiste campos nuevos de identificacion para persona juridica', async () => {
    const expediente = buildExpediente({
      id: 'exp-legal',
      personType: null,
      companyName: null,
      primaryContactName: null,
      primaryContactRole: null,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 50,
      legal: 30,
      technical: 0,
      operational: 0,
      overall: 20,
    });

    const updated = await service.updateSection(
      'exp-legal',
      {
        section: ExpedienteSection.IDENTIFICATION,
        data: {
          personType: 'PERSONA_JURIDICA',
          companyName: 'Empresa Demo SAS',
          primaryContactName: 'Laura Perez',
          primaryContactRole: 'Representante legal',
          documentType: 'NIT',
          documentNumber: '900123456',
        },
      },
      'user-1',
    );

    expect(updated.companyName).toBe('Empresa Demo SAS');
    expect(updated.primaryContactName).toBe('Laura Perez');
    expect(updated.primaryContactRole).toBe('Representante legal');
  });
});

function buildExpediente(overrides: Partial<ExpedienteRecord>): ExpedienteRecord {
  return {
    id: 'exp-base',
    tenantId: 'ten-1',
    status: ExpedienteStatus.NUEVO_POTENCIAL,
    previousStatus: null,
    statusChangedAt: new Date('2026-03-23T00:00:00Z'),
    discardReason: null,
    fullName: 'Cliente Demo',
    documentType: null,
    documentNumberEncrypted: null,
    gender: null,
    birthDate: null,
    personType: null,
    companyName: null,
    firstName: null,
    lastName: null,
    primaryContactName: null,
    primaryContactRole: null,
    phonePrimaryEncrypted: null,
    phoneSecondaryEncrypted: null,
    emailPrimaryEncrypted: null,
    emailSecondary: null,
    altContactName: null,
    altContactPhoneEncrypted: null,
    contactPreference: null,
    bestContactTime: null,
    address: null,
    municipality: null,
    department: null,
    stratum: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfidence: null,
    accessReferences: null,
    zoneType: null,
    source: 'Web',
    interestedPlanId: null,
    campaign: null,
    casePriority: null,
    estimatedBudget: null,
    commercialNotes: null,
    coverageResult: null,
    availableTechnology: null,
    estimatedDistanceM: null,
    feasibility: null,
    technicalObservations: null,
    estimatedEquipment: null,
    identityVerified: null,
    legalComplianceStatus: null,
    paymentMethod: null,
    billingCycle: null,
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    rutReference: null,
    installationAddress: null,
    availabilityWindow: null,
    siteContactName: null,
    siteContactPhoneEncrypted: null,
    specialAccessNotes: null,
    requiredMaterials: null,
    ticketId: null,
    workOrderId: null,
    inventoryAssignmentRef: null,
    expansionRequestId: null,
    executionPolicyRef: null,
    checklistCompleted: false,
    evidenceMode: null,
    conformityEvidenceRef: null,
    lastRescheduleReason: null,
    lastRescheduleNotes: null,
    completenessCommercial: 0,
    completenessLegal: 0,
    completenessTechnical: 0,
    completenessOperational: 0,
    createdBy: 'user-base',
    assignedTo: null,
    dataConsentRevoked: false,
    createdAt: new Date('2026-03-23T00:00:00Z'),
    updatedAt: new Date('2026-03-23T00:00:00Z'),
    deletedAt: null,
    contactAttempts: [],
    consents: [],
    coverageChecks: [],
    statusChanges: [],
    ...overrides,
  } as ExpedienteRecord;
}

function encryptTestValue(value: string): string {
  const iv = Buffer.alloc(12, 1);
  const key = Buffer.from('0'.repeat(64), 'hex');
  const cipher = require('crypto').createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
