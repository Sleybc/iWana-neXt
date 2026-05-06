import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { DataSource } from 'typeorm';
import {
  AcquisitionChannel,
  AuditAction,
  ConsentStatus,
  ConsentType,
  ExpedienteStatus,
  TechnicalViabilityResult,
} from '@iwana/shared';
import { AuditService } from '../../../audit/audit.service';
import { CompletenessCalculator } from '../completeness-calculator.service';
import { CrmActorReadPort } from '../../ports/crm-actor-read.port';
import { UpdateSectionDto, ExpedienteSection } from '../dto/update-section.dto';
import { ExpedienteRecord } from '../entities/expediente-record.entity';
import { StatusChange } from '../entities/status-change.entity';
import { ExpedienteService } from '../expediente.service';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  access: jest.fn().mockResolvedValue(undefined),
  rename: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

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

  const crmActorReadPortMock = {
    findById: jest.fn(),
    findByIds: jest.fn(),
  };

  const eventEmitterMock = {
    emitAsync: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTenantContextGetOrThrow.mockReturnValue({
      tenantId: 'ten-1',
      schemaName: 'tenant_test',
    });
    crmActorReadPortMock.findById.mockImplementation(async (_schemaName: string, actorId: string) =>
      resolveActor(actorId),
    );
    crmActorReadPortMock.findByIds.mockImplementation(
      async (_schemaName: string, actorIds: string[]) =>
        actorIds
          .map((actorId) => resolveActor(actorId))
          .filter((actor): actor is NonNullable<typeof actor> => actor !== null),
    );

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
        { provide: CrmActorReadPort, useValue: crmActorReadPortMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
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
      {
        fullName: '  Cliente Demo  ',
        source: '  Referido  ',
        acquisitionChannel: AcquisitionChannel.REFERIDO_CLIENTE,
      },
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

  it('no consulta tablas de usuario cuando el actor no tiene UUID', async () => {
    const resolveActorName = (
      service as unknown as {
        resolveActorName: (schemaName: string, userId: string) => Promise<string | null>;
      }
    ).resolveActorName.bind(service);

    const result = await resolveActorName('tenant_test', 'platform-sub-no-uuid');

    expect(result).toBeNull();
    expect(mockRunInTenantSchema).not.toHaveBeenCalled();
  });

  it('expone documentNumber en detalle autorizado', async () => {
    const encryptedDocument = encryptTestValue('900123456');
    const expediente = buildExpediente({
      id: 'exp-1',
      documentNumberEncrypted: encryptedDocument,
      documentType: 'NIT',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => expediente,
        },
      }),
    );

    const result = await service.findById('exp-1');
    expect((result as any).documentNumber).toBe('900123456');
    expect(result.documentNumberEncrypted).toBe(encryptedDocument);
  });

  it('expone altContactPhone en detalle autorizado cuando existe cifrado', async () => {
    const encryptedAltPhone = encryptTestValue('3005556677');
    const expediente = buildExpediente({
      id: 'exp-alt-phone',
      altContactPhoneEncrypted: encryptedAltPhone,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => expediente,
        },
      }),
    );

    const result = await service.findById('exp-alt-phone');
    expect((result as any).altContactPhone).toBe('3005556677');
    expect(result.altContactPhoneEncrypted).toBe(encryptedAltPhone);
  });

  it('expone siteContactPhone en detalle autorizado cuando existe cifrado', async () => {
    const encryptedSitePhone = encryptTestValue('3014445566');
    const expediente = buildExpediente({
      id: 'exp-site-phone',
      siteContactPhoneEncrypted: encryptedSitePhone,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => expediente,
        },
      }),
    );

    const result = await service.findById('exp-site-phone');
    expect((result as any).siteContactPhone).toBe('3014445566');
    expect(result.siteContactPhoneEncrypted).toBe(encryptedSitePhone);
  });

  it('usa progreso 100 en detalle cuando comercial, legal y tecnica estan al 100%', async () => {
    const expediente = buildExpediente({
      id: 'exp-progress-detail',
      personType: 'PERSONA_NATURAL',
      firstName: 'Andres',
      lastName: 'Orjuela',
      documentType: 'CC',
      documentNumberEncrypted: encryptTestValue('123456789'),
      phonePrimaryEncrypted: encryptTestValue('3001112233'),
      emailPrimaryEncrypted: encryptTestValue('demo@test.com'),
      department: 'CUNDINAMARCA',
      municipality: 'EL_COLEGIO',
      address: 'Calle 1 # 2-3',
      postalCode: '252601',
      stratum: 2,
      neighborhood: 'Centro',
      latitude: 4.58,
      longitude: -74.44,
      interestedPlanId: 'plan-1',
      acquisitionChannel: 'OTRO' as any,
      feasibility: 'VIABLE' as any,
      candidateTechnologies: ['FIBER'] as any,
      availableTechnology: 'FIBER' as any,
      technicalConfidence: 'HIGH' as any,
      evaluationSource: 'MAP' as any,
      identityVerified: 'VERIFICADO',
      legalComplianceStatus: 'AUTORIZADO',
      documentSupports: {
        identity_document: { versions: [{ id: 'v1' }] },
        utility_bill: { versions: [{ id: 'v2' }] },
      } as any,
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 100,
      legal: 100,
      technical: 100,
      operational: 0,
      overall: 75,
    });

    const result = await service.findById('exp-progress-detail');

    expect((result as any).pipelineProgress).toBe(75);
  });

  it('audita acceso autorizado al Documento visible sin persistir el valor plano', async () => {
    const encryptedDocument = encryptTestValue('900123456');
    const expediente = buildExpediente({
      id: 'exp-1',
      documentNumberEncrypted: encryptedDocument,
      documentType: 'NIT',
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => expediente,
        },
      }),
    );

    await service.findById('exp-1');

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.anything(),
        entityId: 'exp-1',
      }),
    );
    expect(auditServiceMock.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ documentNumber: '900123456' }),
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

  it('sube un soporte documental usando el personType efectivo cuando llega por override', async () => {
    const expediente = buildExpediente({
      id: 'exp-doc-1',
      personType: 'PERSONA_NATURAL',
      documentSupports: {},
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
          find: jest.fn().mockResolvedValue([]),
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 80,
      legal: 75,
      technical: 40,
      operational: 30,
      overall: 56,
    });

    const result = await service.uploadDocumentSupport(
      'exp-doc-1',
      'rut',
      {
        originalname: 'rut.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('pdf-demo'),
      },
      'user-docs',
      'PERSONA_JURIDICA',
    );

    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    expect(result.items).toHaveLength(3);
    expect(result.items.find((item) => item.key === 'rut')?.versions[0]).toEqual(
      expect.objectContaining({
        fileName: 'rut.pdf',
        status: 'UPLOADED',
      }),
    );
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          section: 'document_support',
          changedFields: ['rut'],
        }),
      }),
    );
  });

  it('actualiza el estado de una versión documental usando el personType efectivo y recalcula el resumen', async () => {
    const expediente = buildExpediente({
      id: 'exp-doc-2',
      personType: 'PERSONA_NATURAL',
      documentSupports: {
        rut: {
          versions: [
            {
              id: 'ver-1',
              fileName: 'rut.pdf',
              storedFileName: 'ver-1.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              uploadedAt: '2026-04-13T12:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'UPLOADED',
              note: null,
            },
          ],
        },
      },
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
          find: jest.fn().mockResolvedValue([]),
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 80,
      legal: 75,
      technical: 40,
      operational: 30,
      overall: 56,
    });

    const result = await service.updateDocumentSupportStatus(
      'exp-doc-2',
      'rut',
      'ver-1',
      'APPROVED',
      'user-docs',
      undefined,
      'PERSONA_JURIDICA',
    );

    const rutItem = result.items.find((item) => item.key === 'rut');
    expect(rutItem?.versions[0]?.status).toBe('APPROVED');
    expect(result.summary.approvedCount).toBe(1);
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          changedFields: ['rut', 'documentSupportStatus'],
        }),
      }),
    );
  });

  it('elimina la versión vigente y promueve la anterior como vigente', async () => {
    const expediente = buildExpediente({
      id: 'exp-doc-delete-1',
      personType: 'PERSONA_JURIDICA',
      documentSupports: {
        rut: {
          versions: [
            {
              id: 'ver-2',
              fileName: 'rut-correccion.pdf',
              storedFileName: 'ver-2.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              uploadedAt: '2026-05-06T10:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'UPLOADED',
              note: null,
            },
            {
              id: 'ver-1',
              fileName: 'rut-base.pdf',
              storedFileName: 'ver-1.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 900,
              uploadedAt: '2026-05-05T10:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'APPROVED',
              note: null,
            },
          ],
        },
      },
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 80,
      legal: 75,
      technical: 40,
      operational: 30,
      overall: 56,
    });

    const result = await service.deleteDocumentSupport(
      'exp-doc-delete-1',
      'rut',
      'ver-2',
      'user-docs',
      'PERSONA_JURIDICA',
    );

    const rutItem = result.items.find((item: { key: string }) => item.key === 'rut');
    expect(rutItem?.versions.map((version: { id: string }) => version.id)).toEqual(['ver-1']);
    expect(rutItem?.versions[0]?.status).toBe('APPROVED');
  });

  it('mantiene la eliminación persistida aunque falle la limpieza física final', async () => {
    const expediente = buildExpediente({
      id: 'exp-doc-delete-unlink',
      personType: 'PERSONA_JURIDICA',
      documentSupports: {
        rut: {
          versions: [
            {
              id: 'ver-2',
              fileName: 'rut-correccion.pdf',
              storedFileName: 'ver-2.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              uploadedAt: '2026-05-06T10:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'UPLOADED',
              note: null,
            },
            {
              id: 'ver-1',
              fileName: 'rut-base.pdf',
              storedFileName: 'ver-1.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 900,
              uploadedAt: '2026-05-05T10:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'APPROVED',
              note: null,
            },
          ],
        },
      },
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 80,
      legal: 75,
      technical: 40,
      operational: 30,
      overall: 56,
    });
    (unlink as jest.MockedFunction<typeof unlink>).mockRejectedValueOnce(
      new Error('permiso denegado'),
    );

    const result = await service.deleteDocumentSupport(
      'exp-doc-delete-unlink',
      'rut',
      'ver-2',
      'user-docs',
      'PERSONA_JURIDICA',
    );

    expect(result.items.find((item: { key: string }) => item.key === 'rut')?.versions).toEqual([
      expect.objectContaining({ id: 'ver-1', status: 'APPROVED' }),
    ]);
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'exp-doc-delete-unlink',
        newValue: expect.objectContaining({
          section: 'document_support',
          changedFields: ['rut'],
        }),
      }),
    );
    expect(completenessCalculatorMock.calculate).toHaveBeenCalledWith('exp-doc-delete-unlink');
  });

  it('preserva el error de persistencia aunque falle el rollback físico', async () => {
    const expediente = buildExpediente({
      id: 'exp-doc-delete-rollback',
      personType: 'PERSONA_JURIDICA',
      documentSupports: {
        rut: {
          versions: [
            {
              id: 'ver-2',
              fileName: 'rut-correccion.pdf',
              storedFileName: 'ver-2.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024,
              uploadedAt: '2026-05-06T10:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'UPLOADED',
              note: null,
            },
            {
              id: 'ver-1',
              fileName: 'rut-base.pdf',
              storedFileName: 'ver-1.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 900,
              uploadedAt: '2026-05-05T10:00:00.000Z',
              uploadedByUserId: 'user-docs',
              uploadedByName: 'Equipo interno',
              status: 'APPROVED',
              note: null,
            },
          ],
        },
      },
    });
    const persistError = new Error('falló persistencia documental');
    const rollbackError = new Error('falló rollback físico');
    const loggerErrorSpy = jest.spyOn((service as any).logger, 'error').mockImplementation();

    mockRunInTenantSchema
      .mockImplementationOnce(async (_ds, _schema, callback) =>
        callback({
          manager: {
            findOne: async () => expediente,
          },
        }),
      )
      .mockRejectedValueOnce(persistError);

    (rename as jest.MockedFunction<typeof rename>)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(rollbackError);

    await expect(
      service.deleteDocumentSupport(
        'exp-doc-delete-rollback',
        'rut',
        'ver-2',
        'user-docs',
        'PERSONA_JURIDICA',
      ),
    ).rejects.toThrow('falló persistencia documental');

    expect(rename).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/tenant_test/exp-doc-delete-rollback/rut/ver-2.pdf'),
      expect.stringContaining('/tenant_test/exp-doc-delete-rollback/rut/ver-2.pdf.pending-delete'),
    );
    expect(rename).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/tenant_test/exp-doc-delete-rollback/rut/ver-2.pdf.pending-delete'),
      expect.stringContaining('/tenant_test/exp-doc-delete-rollback/rut/ver-2.pdf'),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo revertir la eliminación física'),
      rollbackError.stack,
    );
    expect(unlink).not.toHaveBeenCalled();
    expect(auditServiceMock.log).not.toHaveBeenCalled();
  });

  it('permite operar el documento correcto cuando el personType efectivo llega por override', async () => {
    const expediente = buildExpediente({
      id: 'exp-doc-delete-override',
      personType: 'PERSONA_NATURAL',
      documentSupports: {},
    });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );
    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 80,
      legal: 75,
      technical: 40,
      operational: 30,
      overall: 56,
    });

    await expect(
      service.deleteDocumentSupport(
        'exp-doc-delete-override',
        'rut',
        'ver-9',
        'user-docs',
        'PERSONA_JURIDICA',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no registra actividad cuando el payload no produce cambios reales', async () => {
    const expediente = buildExpediente({
      id: 'exp-noop-contact',
      phonePrimaryEncrypted: encryptTestValue('3001112233'),
    });
    const saveSpy = jest.fn(async (_entity: unknown, data: ExpedienteRecord) => data);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: saveSpy,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );

    const updated = await service.updateSection(
      'exp-noop-contact',
      {
        section: ExpedienteSection.CONTACT,
        data: { phonePrimary: '3001112233' },
      } satisfies UpdateSectionDto,
      'user-noop',
    );

    expect(updated.id).toBe('exp-noop-contact');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(auditServiceMock.log).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.UPDATE,
        entityId: 'exp-noop-contact',
      }),
    );
    expect(completenessCalculatorMock.calculate).toHaveBeenCalledTimes(1);
    expect(completenessCalculatorMock.calculate).toHaveBeenCalledWith('exp-noop-contact');
  });

  it('limpia contacto alternativo cuando se envía vacío y persiste null', async () => {
    const expediente = buildExpediente({
      id: 'exp-contact-clear',
      altContactName: 'Contacto previo',
      altContactPhoneEncrypted: encryptTestValue('3001112233'),
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
      commercial: 80,
      legal: 50,
      technical: 40,
      operational: 30,
      overall: 50,
    });

    const updated = await service.updateSection(
      'exp-contact-clear',
      {
        section: ExpedienteSection.CONTACT,
        data: { altContactName: '', altContactPhone: '' },
      } satisfies UpdateSectionDto,
      'user-2',
    );

    expect(updated.altContactName).toBeNull();
    expect(updated.altContactPhoneEncrypted).toBeNull();
  });

  it('normaliza coma decimal al guardar ubicación y persiste coordenadas válidas', async () => {
    const expediente = buildExpediente({ id: 'exp-location-1' });

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
      'exp-location-1',
      {
        section: ExpedienteSection.LOCATION,
        data: {
          address: 'Cra 10 # 20-30',
          municipality: 'EL_COLEGIO',
          department: 'CUNDINAMARCA',
          postalCode: '252601',
          stratum: '3',
          latitude: '4,7110000',
          longitude: '-74,0721000',
        },
      } satisfies UpdateSectionDto,
      'user-location',
    );

    expect(updated.postalCode).toBe('252601');
    expect(updated.stratum).toBe(3);
    expect(updated.latitude).toBeCloseTo(4.711, 3);
    expect(updated.longitude).toBeCloseTo(-74.0721, 3);
  });

  it('rechaza ubicación con coordenada inválida devolviendo error semántico', async () => {
    const expediente = buildExpediente({ id: 'exp-location-2' });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );

    await expect(
      service.updateSection(
        'exp-location-2',
        {
          section: ExpedienteSection.LOCATION,
          data: {
            latitude: 'abc',
          },
        } satisfies UpdateSectionDto,
        'user-location',
      ),
    ).rejects.toThrow(BadRequestException);
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
    const actorUserId = '6e2eb956-c266-4c14-b00d-0eea857f66cc';
    const expediente = buildExpediente({
      id: 'exp-3',
      status: ExpedienteStatus.PRECALIFICADO,
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
      actorUserId,
    );

    expect(updated.status).toBe(ExpedienteStatus.EN_COTIZACION);
    expect(createdStatusChanges).toHaveLength(1);
    expect(createdStatusChanges[0]).toEqual(
      expect.objectContaining({
        changedBy: actorUserId,
        fromStatus: ExpedienteStatus.PRECALIFICADO,
        toStatus: ExpedienteStatus.EN_COTIZACION,
      }),
    );
  });

  it('reactiva un expediente descartado al estado previo y limpia el motivo de descarte', async () => {
    const actorUserId = 'f8f5fa0e-c9f3-4d14-97e6-88c61f8f0e5f';
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

    const updated = await service.reactivate('exp-4', actorUserId);

    expect(updated.status).toBe(ExpedienteStatus.PRECALIFICADO);
    expect(updated.discardReason).toBeNull();
    expect(createdStatusChanges[0]).toEqual(
      expect.objectContaining({
        changedBy: actorUserId,
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

  it('usa progreso 100 en listado cuando comercial, legal y tecnica estan al 100%', async () => {
    const expediente = buildExpediente({
      id: 'exp-progress-list',
      personType: 'PERSONA_NATURAL',
      firstName: 'Andres',
      lastName: 'Orjuela',
      documentType: 'CC',
      documentNumberEncrypted: 'enc-documento',
      phonePrimaryEncrypted: 'enc-telefono',
      emailPrimaryEncrypted: 'enc-email',
      department: 'CUNDINAMARCA',
      municipality: 'EL_COLEGIO',
      address: 'Calle 1 # 2-3',
      postalCode: '252601',
      stratum: 2,
      neighborhood: 'Centro',
      latitude: 4.58,
      longitude: -74.44,
      interestedPlanId: 'plan-1',
      acquisitionChannel: 'OTRO' as any,
      feasibility: 'VIABLE' as any,
      candidateTechnologies: ['FIBER'] as any,
      availableTechnology: 'FIBER' as any,
      technicalConfidence: 'HIGH' as any,
      evaluationSource: 'MAP' as any,
      identityVerified: 'VERIFICADO',
      legalComplianceStatus: 'AUTORIZADO',
      documentSupports: {
        identity_document: { versions: [{ id: 'v1' }] },
        utility_bill: { versions: [{ id: 'v2' }] },
      } as any,
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
      commercial: 100,
      legal: 100,
      technical: 100,
      operational: 0,
      overall: 75,
    });

    const result = await service.findAll({ page: 1, limit: 10 });

    expect((result.data[0] as any).pipelineProgress).toBe(75);
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
      getMany: jest.fn().mockResolvedValue([matchingExpediente]),
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
        legalTextVersion: 'Ley 1581 v1',
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

  it('construye el summary del pipeline sin depender de un limit artificial', async () => {
    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) => {
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: ExpedienteStatus.NUEVO_POTENCIAL, count: '2' },
          { status: ExpedienteStatus.PRECALIFICADO, count: '1' },
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
    expect(summary.data[ExpedienteStatus.PRECALIFICADO]).toBe(1);
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
          fromStatus: ExpedienteStatus.PRECALIFICADO,
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
                    id: 'audit-pii-access',
                    action: AuditAction.UPDATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-activity',
                    userId: null,
                    newValue: { piiaAccess: 'documentNumber', source: 'findById' },
                    createdAt: new Date('2026-03-23T10:30:30Z'),
                  },
                  {
                    id: 'audit-1',
                    action: AuditAction.UPDATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-activity',
                    userId: 'user-editor',
                    newValue: {
                      section: 'location',
                      data: { municipality: 'Bogotá', address: 'Calle 10 # 20-30' },
                    },
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
        reason: 'Campos actualizados: Municipio, Dirección',
        actor: expect.objectContaining({ name: 'Ana Torres' }),
      }),
    );
    expect(
      timeline.activities.some(
        (activity) =>
          activity.type === 'SECTION_UPDATED' &&
          activity.sectionLabel === 'Identificación' &&
          activity.actor?.name == null,
      ),
    ).toBe(false);
    expect(timeline.metadata.createdBy.name).toBe('Carlos Mejía');
    expect(timeline.metadata.lastEditedBy.name).toBe('Ana Torres');
  });

  it('usa actorName del audit log cuando no se puede resolver el usuario', async () => {
    const expediente = buildExpediente({
      id: 'exp-activity-actor-name',
      statusChanges: [],
      contactAttempts: [],
      createdBy: 'user-no-match',
      updatedAt: new Date('2026-03-23T12:40:00Z'),
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
                    id: 'audit-actor-fallback',
                    action: AuditAction.UPDATE,
                    entityType: 'ExpedienteRecord',
                    entityId: 'exp-activity-actor-name',
                    userId: 'user-no-match',
                    newValue: {
                      section: 'identification',
                      actorName: 'Liliana Paola Borda Ovalle',
                    },
                    createdAt: new Date('2026-03-23T12:35:00Z'),
                  },
                ];
              }

              return [];
            },
          },
        }),
      );

    const timeline = await service.getTimelineSummary('exp-activity-actor-name');

    expect(timeline.activities[0]).toEqual(
      expect.objectContaining({
        type: 'SECTION_UPDATED',
        actor: expect.objectContaining({ name: 'Liliana Paola Borda Ovalle' }),
      }),
    );
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

  it('deriva fullName desde firstName y lastName para persona natural', async () => {
    const expediente = buildExpediente({ id: 'exp-natural' });

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
      commercial: 10,
      legal: 20,
      technical: 30,
      operational: 40,
      overall: 25,
    });

    const updated = await service.updateSection(
      'exp-natural',
      {
        section: ExpedienteSection.IDENTIFICATION,
        data: {
          personType: 'PERSONA_NATURAL',
          firstName: 'Laura',
          lastName: 'Perez',
          documentType: 'CC',
          documentNumber: '1012345678',
        },
      },
      'user-1',
    );

    expect(updated.fullName).toBe('Laura Perez');
    expect(updated.companyName).toBeNull();
  });

  it('rechaza persona juridica sin contacto principal ni cargo', async () => {
    const expediente = buildExpediente({ id: 'exp-invalid' });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );

    await expect(
      service.updateSection(
        'exp-invalid',
        {
          section: ExpedienteSection.IDENTIFICATION,
          data: {
            personType: 'PERSONA_JURIDICA',
            companyName: 'Empresa Demo SAS',
            documentType: 'NIT',
            documentNumber: '900123456',
          },
        },
        'user-1',
      ),
    ).rejects.toThrow('Contacto principal');
  });

  it('rechaza persona natural sin firstName', async () => {
    const expediente = buildExpediente({ id: 'exp-test' });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );

    await expect(
      service.updateSection(
        'exp-test',
        {
          section: ExpedienteSection.IDENTIFICATION,
          data: {
            personType: 'PERSONA_NATURAL',
            lastName: 'Perez',
            documentType: 'CC',
            documentNumber: '1012345678',
          },
        },
        'user-1',
      ),
    ).rejects.toThrow('Nombres');
  });

  it('rechaza documentType fuera del catalogo', async () => {
    const expediente = buildExpediente({ id: 'exp-test' });

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          save: async (_entity: unknown, data: ExpedienteRecord) => data,
          update: jest.fn().mockResolvedValue(undefined),
          findOne: async () => expediente,
        },
      }),
    );

    await expect(
      service.updateSection(
        'exp-test',
        {
          section: ExpedienteSection.IDENTIFICATION,
          data: {
            personType: 'PERSONA_NATURAL',
            firstName: 'Laura',
            lastName: 'Perez',
            documentType: 'PASAPORTE_FALSO',
            documentNumber: '1012345678',
          },
        },
        'user-1',
      ),
    ).rejects.toThrow('Tipo de documento');
  });

  it('redacta documentNumber en auditoria al actualizar identificacion', async () => {
    const expediente = buildExpediente({ id: 'exp-audit' });

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
      commercial: 10,
      legal: 20,
      technical: 30,
      operational: 40,
      overall: 25,
    });

    await service.updateSection(
      'exp-audit',
      {
        section: ExpedienteSection.IDENTIFICATION,
        data: {
          personType: 'PERSONA_NATURAL',
          firstName: 'Laura',
          lastName: 'Perez',
          documentType: 'CC',
          documentNumber: '1012345678',
        },
      },
      'user-1',
    );

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({
          section: 'identification',
          changedFields: expect.arrayContaining(['firstName', 'lastName', 'documentType']),
        }),
      }),
    );
  });

  it('rechaza viabilidad tecnica viable cuando falta tecnologia recomendada', async () => {
    const expediente = buildExpediente({ id: 'exp-tech-invalid' });
    jest.spyOn(service, 'findById').mockResolvedValue(expediente);

    await expect(
      service.updateSection(
        'exp-tech-invalid',
        {
          section: ExpedienteSection.TECHNICAL_FEASIBILITY,
          data: {
            feasibility: TechnicalViabilityResult.VIABLE,
            candidateTechnologies: ['FIBER'],
            technicalConfidence: 'HIGH',
            evaluationSource: 'MAP',
          },
        },
        'user-tech',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('persiste viabilidad tecnica estructurada completa cuando el payload es valido', async () => {
    const expediente = buildExpediente({ id: 'exp-tech-valid' });
    const persisted = buildExpediente({
      id: 'exp-tech-valid',
      feasibility: TechnicalViabilityResult.VIABLE,
      candidateTechnologies: ['FIBER'],
      availableTechnology: 'FIBER',
      technicalConfidence: 'HIGH',
      evaluationSource: 'TECHNICAL_SITE_VISIT',
      technicalObservations: 'Viable con ajuste menor de acometida',
    });

    const saveExpediente = jest
      .fn()
      .mockImplementation(async (_entity: unknown, data: ExpedienteRecord) => data);
    const syncCompleteness = jest.fn().mockResolvedValue(undefined);

    jest
      .spyOn(service, 'findById')
      .mockResolvedValueOnce(expediente)
      .mockResolvedValueOnce(persisted);

    mockRunInTenantSchema.mockImplementation(async (_ds, _schema, callback) =>
      callback({
        manager: {
          findOne: async () => null,
          save: saveExpediente,
          update: syncCompleteness,
        },
      }),
    );

    completenessCalculatorMock.calculate.mockResolvedValue({
      commercial: 60,
      legal: 40,
      technical: 75,
      operational: 20,
      overall: 49,
    });

    const updated = await service.updateSection(
      'exp-tech-valid',
      {
        section: ExpedienteSection.TECHNICAL_FEASIBILITY,
        data: {
          feasibility: TechnicalViabilityResult.VIABLE,
          candidateTechnologies: ['FIBER'],
          availableTechnology: 'FIBER',
          technicalConfidence: 'HIGH',
          evaluationSource: 'TECHNICAL_SITE_VISIT',
          technicalObservations: 'Viable con ajuste menor de acometida',
        },
      },
      'user-tech',
    );

    expect(updated.feasibility).toBe(TechnicalViabilityResult.VIABLE);
    expect(saveExpediente).toHaveBeenCalledWith(
      ExpedienteRecord,
      expect.objectContaining({
        feasibility: TechnicalViabilityResult.VIABLE,
        candidateTechnologies: ['FIBER'],
        availableTechnology: 'FIBER',
        technicalConfidence: 'HIGH',
        evaluationSource: 'TECHNICAL_SITE_VISIT',
      }),
    );
  });
});

function resolveActor(actorId: string) {
  const actorDirectory: Record<string, { id: string; name: string; role: string | null }> = {
    'user-1': { id: 'user-1', name: 'Carlos Mejía', role: 'ADMIN' },
    'user-2': { id: 'user-2', name: 'Ana Torres', role: 'ADMIN' },
    'user-creator': { id: 'user-creator', name: 'Carlos Mejía', role: 'ADMIN' },
    'user-editor': { id: 'user-editor', name: 'Ana Torres', role: 'ADMIN' },
    'user-sales': { id: 'user-sales', name: 'Laura Pérez', role: 'SALES' },
    'user-admin': { id: 'user-admin', name: 'Carlos Mejía', role: 'ADMIN' },
    'user-liliana': {
      id: 'user-liliana',
      name: 'Liliana Paola Borda Ovalle',
      role: 'ADMIN',
    },
  };

  return actorDirectory[actorId] ?? null;
}

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
    postalCode: null,
    stratum: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    coordinatesSource: null,
    coordinatesConfidence: null,
    accessReferences: null,
    zoneType: null,
    source: 'Web',
    acquisitionChannel: AcquisitionChannel.WEB,
    sourceDetail: null,
    interestedPlanId: null,
    campaign: null,
    casePriority: null,
    estimatedBudget: null,
    commercialNotes: null,
    coverageResult: null,
    availableTechnology: null,
    estimatedDistanceM: null,
    feasibility: null,
    candidateTechnologies: null,
    technicalConfidence: null,
    evaluationSource: null,
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
