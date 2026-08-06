import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { DataSource, EntityManager, In, Like } from 'typeorm';
import { AuditLog, runInTenantSchema, TenantContext } from '@iwana/db';
import { ExpedienteListView, resolveExpedienteStatusesForView } from './expediente-list-view';
import {
  AcquisitionChannel,
  AuditAction,
  ConsentStatus,
  ConsentType,
  ConsentChannel,
  ExpedienteStatus,
  SubscriberStatus,
  TechnicalViabilityResult,
} from '@iwana/shared';

const DOCUMENT_TYPE_OPTIONS = ['CC', 'CE', 'TI', 'NIT', 'PASAPORTE', 'PEP', 'PPT', 'OTRO'];
import { ExpedienteRecord } from './entities/expediente-record.entity';
import { StatusChange } from './entities/status-change.entity';
import { ContactAttempt } from './entities/contact-attempt.entity';
import { ConsentRecord } from './entities/consent-record-v2.entity';
import { CoverageCheck } from './entities/coverage-check.entity';
import { AuditService } from '../../audit/audit.service';
import { clampPage } from '../../../common/pagination/clamp-page';
import { clampLimit } from '../../../common/pagination/clamp-limit';
import { buildPageMeta } from '../../../common/pagination/build-page-meta';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadAesGcmKeyPair,
  looksLikeEncryptedAesGcm,
} from '../../../common/crypto/aes-gcm.util';
import { hashDocumentNumber } from '../../../common/crypto/hash-document.util';
import { CompletenessCalculator } from './completeness-calculator.service';
import { CrmActorReadPort } from '../ports/crm-actor-read.port';
import {
  ExpedienteActivatedEvent,
  ExpedienteDiscardedEvent,
  ExpedienteReadyForInstallationEvent,
} from './events/expediente-pipeline.events';

// TODO: mover a expediente-pipeline.events.ts cuando se estandarice tenantSlug en todos los eventos
class ExpedienteInstallationScheduledEvent {
  constructor(
    public readonly tenantId: string,
    public readonly schemaName: string,
    public readonly tenantSlug: string,
    public readonly expedienteId: string,
    public readonly actorUserId: string,
  ) {}
}
import { CreateExpedienteDto } from './dto/create-expediente.dto';
import { UpdateSectionDto, ExpedienteSection } from './dto/update-section.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { CreateContactAttemptDto } from './dto/create-contact-attempt.dto';
import { CreateConsentDto, CONSENT_LEGAL_VERSION } from './dto/create-consent.dto';
import { CreateCoverageCheckDto } from './dto/create-coverage-check.dto';
import {
  LinkInstallationOperationalRefsDto,
  LinkInstallationOperationalRefsSchema,
} from './dto/link-installation-operational-refs.dto';
import { OperationalResponsibilityHistory } from '../responsibilities/entities/operational-responsibility-history.entity';
import {
  DOCUMENT_SUPPORT_STATUS,
  type DocumentSupportDefinition,
  type DocumentSupportStatus,
  type ExpedienteDocumentItemDto,
  type ExpedienteDocumentSupportResponseDto,
  getDocumentDefinitionsByPersonType,
  type StoredDocumentSupportMap,
  type StoredDocumentSupportVersion,
} from './document-support.types';
import {
  evaluateProvisioningReadiness,
  isBlockingLegalComplianceStatus,
} from '../provisioning-readiness';
import { SubscribersService } from '../subscribers/subscribers.service';

export interface ExpedienteTimelineActor {
  userId: string | null;
  name: string | null;
}

export interface ExpedienteActivityItem {
  id: string;
  type: 'CREATED' | 'SECTION_UPDATED' | 'STATUS_CHANGED' | 'CONTACT_ATTEMPT';
  occurredAt: Date;
  actor: ExpedienteTimelineActor;
  sectionLabel: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
}

export interface ExpedienteOperationalMetadata {
  createdBy: ExpedienteTimelineActor;
  lastEditedBy: ExpedienteTimelineActor;
  lastActivityAt: Date | null;
}

interface UploadedDocumentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

function hasActorIdentity(actor: ExpedienteTimelineActor | null | undefined): boolean {
  return Boolean(actor?.name?.trim() || actor?.userId);
}

function hasActorName(actor: ExpedienteTimelineActor | null | undefined): boolean {
  return Boolean(actor?.name?.trim());
}

const SECTION_LABELS: Record<string, string> = {
  identification: 'Identificación',
  contact: 'Contacto',
  location: 'Ubicación',
  commercial_interest: 'Interés comercial',
  technical_feasibility: 'Viabilidad técnica',
  legal_consent: 'Consentimiento y validación',
  document_support: 'Soportes documentales',
  billing: 'Facturación',
  installation: 'Instalación',
};

const SECTION_FIELD_LABELS: Record<string, string> = {
  personType: 'Tipo de persona',
  documentType: 'Tipo de documento',
  documentNumberEncrypted: 'Documento',
  firstName: 'Nombres',
  lastName: 'Apellidos',
  companyName: 'Razón social',
  primaryContactName: 'Contacto principal',
  primaryContactRole: 'Cargo del contacto',
  fullName: 'Nombre completo',
  phonePrimaryEncrypted: 'Teléfono principal',
  phoneSecondaryEncrypted: 'Teléfono secundario',
  emailPrimaryEncrypted: 'Correo principal',
  emailSecondary: 'Correo secundario',
  altContactName: 'Nombre contacto alterno',
  altContactPhoneEncrypted: 'Teléfono alterno',
  contactPreference: 'Preferencia de contacto',
  bestContactTime: 'Mejor horario',
  address: 'Dirección',
  municipality: 'Municipio',
  department: 'Departamento',
  postalCode: 'Código postal',
  neighborhood: 'Barrio',
  stratum: 'Estrato',
  latitude: 'Latitud',
  longitude: 'Longitud',
  coordinatesSource: 'Fuente de coordenadas',
  coordinatesConfidence: 'Confianza coordenadas',
  accessReferences: 'Referencias de acceso',
  zoneType: 'Tipo de zona',
  acquisitionChannel: 'Canal de captación',
  source: 'Fuente',
  sourceDetail: 'Detalle de fuente',
  interestedPlanId: 'Plan de interés',
  additionalProductIds: 'Productos adicionales',
  campaign: 'Campaña',
  casePriority: 'Prioridad',
  estimatedBudget: 'Presupuesto estimado',
  commercialNotes: 'Notas comerciales',
  coverageResult: 'Resultado de cobertura',
  availableTechnology: 'Tecnología recomendada',
  estimatedDistanceM: 'Distancia estimada',
  feasibility: 'Viabilidad técnica',
  candidateTechnologies: 'Tecnologías candidatas',
  technicalConfidence: 'Confianza técnica',
  evaluationSource: 'Fuente de evaluación',
  technicalObservations: 'Observaciones técnicas',
  estimatedEquipment: 'Equipamiento estimado',
  identityVerified: 'Verificación de identidad',
  legalComplianceStatus: 'Autorización Habeas Data',
  identity_document: 'Copia de documento de identidad',
  utility_bill: 'Recibo de servicio público',
  chamber_of_commerce: 'Cámara de comercio',
  rut: 'RUT',
  legal_representative_id: 'Documento del representante legal',
  documentSupportStatus: 'Estado del soporte',
  paymentMethod: 'Método de pago',
  billingCycle: 'Ciclo de facturación',
  fiscalName: 'Nombre fiscal',
  fiscalDocument: 'Documento fiscal',
  fiscalAddress: 'Dirección fiscal',
  rutReference: 'Referencia RUT',
  installationAddress: 'Dirección de instalación',
  availabilityWindow: 'Ventana de disponibilidad',
  siteContactName: 'Contacto en sitio',
  siteContactPhoneEncrypted: 'Teléfono en sitio',
  specialAccessNotes: 'Notas de acceso',
  requiredMaterials: 'Materiales requeridos',
};

const DOCUMENT_SUPPORT_PERSON_TYPE_ALIASES: Readonly<
  Record<string, 'PERSONA_NATURAL' | 'PERSONA_JURIDICA'>
> = {
  PERSONA_NATURAL: 'PERSONA_NATURAL',
  NATURAL: 'PERSONA_NATURAL',
  PERSONANATURAL: 'PERSONA_NATURAL',
  TIPO_PERSONA_NATURAL: 'PERSONA_NATURAL',
  PERSONA_JURIDICA: 'PERSONA_JURIDICA',
  JURIDICA: 'PERSONA_JURIDICA',
  PERSONAJURIDICA: 'PERSONA_JURIDICA',
  TIPO_PERSONA_JURIDICA: 'PERSONA_JURIDICA',
};

/**
 * Servicio para gestionar el Expediente Único Progresivo
 * PRD v2.0 §4.1
 */
@Injectable()
export class ExpedienteService {
  private readonly encryptionKey: Buffer;
  private readonly encryptionKeyPrevious: Buffer | null;
  private readonly documentSupportDir: string;
  private readonly logger = new Logger(ExpedienteService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly completenessCalculator: CompletenessCalculator,
    private readonly crmActorReadPort: CrmActorReadPort,
    private readonly eventEmitter: EventEmitter2,
    private readonly subscribersService: SubscribersService,
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.encryptionKey = keys.activeKey;
    this.encryptionKeyPrevious = keys.previousKey;
    const configuredDocumentSupportDir = (
      this.configService as ConfigService & { get?: (key: string) => string | undefined }
    ).get?.('EXPEDIENTE_DOCUMENTS_DIR');
    this.documentSupportDir =
      configuredDocumentSupportDir?.trim() ||
      resolve(process.cwd(), 'storage', 'expediente-document-supports');
  }

  async getDocumentSupports(
    id: string,
    personTypeOverride?: string | null,
  ): Promise<ExpedienteDocumentSupportResponseDto> {
    const expediente = await this.findById(id);
    return this.buildDocumentSupportResponse(
      id,
      this.resolveEffectiveDocumentPersonType(expediente.personType, personTypeOverride),
      expediente.documentSupports,
    );
  }

  async uploadDocumentSupport(
    id: string,
    documentKey: string,
    file: UploadedDocumentFile,
    actorUserId: string,
    personTypeOverride?: string | null,
  ): Promise<ExpedienteDocumentSupportResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();
    const expediente = await this.findById(id);
    const effectivePersonType = this.resolveEffectiveDocumentPersonType(
      expediente.personType,
      personTypeOverride,
    );
    const definitions = this.getDocumentDefinitionsForOperation(
      expediente.personType,
      personTypeOverride,
    );
    const documentDefinition = this.requireDocumentDefinition(definitions, documentKey);
    this.validateDocumentUpload(file);

    const supports = this.getNormalizedDocumentSupports(expediente.documentSupports);
    const actorName = await this.resolveActorName(schemaName, actorUserId);
    const versionId = crypto.randomUUID();
    const safeExtension = this.resolveSafeFileExtension(file.originalname, file.mimetype);
    const storedFileName = `${versionId}${safeExtension}`;
    const targetDirectory = join(this.documentSupportDir, schemaName, id, documentKey);
    const targetPath = join(targetDirectory, storedFileName);

    await mkdir(targetDirectory, { recursive: true });
    await writeFile(targetPath, file.buffer);

    const nextVersion: StoredDocumentSupportVersion = {
      id: versionId,
      fileName: this.sanitizeStoredFileName(file.originalname),
      storedFileName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: actorUserId,
      uploadedByName: actorName,
      status: DOCUMENT_SUPPORT_STATUS.UPLOADED,
      note: null,
    };

    supports[documentKey] = {
      versions: [nextVersion, ...(supports[documentKey]?.versions ?? [])],
    };

    await this.persistDocumentSupports(id, schemaName, supports);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: {
        section: 'document_support',
        actorName,
        changedFields: [documentDefinition.key],
      },
    });

    await this.syncCompleteness(id, schemaName);

    return this.buildDocumentSupportResponse(id, effectivePersonType, supports);
  }

  async updateDocumentSupportStatus(
    id: string,
    documentKey: string,
    versionId: string,
    status: DocumentSupportStatus,
    actorUserId: string,
    note?: string | null,
    personTypeOverride?: string | null,
  ): Promise<ExpedienteDocumentSupportResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();
    const expediente = await this.findById(id);
    const effectivePersonType = this.resolveEffectiveDocumentPersonType(
      expediente.personType,
      personTypeOverride,
    );
    const definitions = this.getDocumentDefinitionsForOperation(
      expediente.personType,
      personTypeOverride,
    );
    const documentDefinition = this.requireDocumentDefinition(definitions, documentKey);
    const supports = this.getNormalizedDocumentSupports(expediente.documentSupports);
    const versions = supports[documentKey]?.versions ?? [];
    const versionIndex = versions.findIndex((version) => version.id === versionId);

    if (versionIndex === -1) {
      throw new NotFoundException('La versión documental solicitada no existe en este expediente.');
    }

    const actorName = await this.resolveActorName(schemaName, actorUserId);
    const targetVersion = versions[versionIndex];

    if (!targetVersion) {
      throw new NotFoundException('La versión documental solicitada no existe en este expediente.');
    }

    versions[versionIndex] = {
      ...targetVersion,
      status,
      note: this.normalizeOptionalText(note),
    };

    supports[documentKey] = { versions };

    await this.persistDocumentSupports(id, schemaName, supports);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: {
        section: 'document_support',
        actorName,
        changedFields: [documentDefinition.key, 'documentSupportStatus'],
      },
    });

    await this.syncCompleteness(id, schemaName);

    return this.buildDocumentSupportResponse(id, effectivePersonType, supports);
  }

  async deleteDocumentSupport(
    id: string,
    documentKey: string,
    versionId: string,
    actorUserId: string,
    personTypeOverride?: string | null,
  ): Promise<ExpedienteDocumentSupportResponseDto> {
    const { schemaName } = TenantContext.getOrThrow();
    const expediente = await this.findById(id);
    const effectivePersonType = this.resolveEffectiveDocumentPersonType(
      expediente.personType,
      personTypeOverride,
    );
    const definitions = this.getDocumentDefinitionsForOperation(
      expediente.personType,
      personTypeOverride,
    );
    const documentDefinition = this.requireDocumentDefinition(definitions, documentKey);
    const supports = this.getNormalizedDocumentSupports(expediente.documentSupports);
    const versions = supports[documentKey]?.versions ?? [];
    const targetVersion = versions.find((version) => version.id === versionId);

    if (!targetVersion) {
      throw new NotFoundException('La versión documental solicitada no existe en este expediente.');
    }

    const targetFilePath = join(
      this.documentSupportDir,
      schemaName,
      id,
      documentKey,
      targetVersion.storedFileName,
    );
    const pendingDeleteFilePath = `${targetFilePath}.pending-delete`;
    let movedToPendingDelete = false;

    try {
      await rename(targetFilePath, pendingDeleteFilePath);
      movedToPendingDelete = true;
    } catch (error) {
      const isMissingSourceFile =
        error instanceof Error &&
        'code' in error &&
        typeof error.code === 'string' &&
        error.code === 'ENOENT';

      if (!isMissingSourceFile) {
        throw error;
      }
    }

    const remainingVersions = versions.filter((version) => version.id !== versionId);

    if (remainingVersions.length > 0) {
      supports[documentKey] = { versions: remainingVersions };
    } else {
      delete supports[documentKey];
    }

    try {
      await this.persistDocumentSupports(id, schemaName, supports);
    } catch (error) {
      if (movedToPendingDelete) {
        try {
          await rename(pendingDeleteFilePath, targetFilePath);
        } catch (rollbackError) {
          const rollbackMessage =
            rollbackError instanceof Error ? rollbackError.message : 'Error desconocido';
          this.logger.error(
            `No se pudo revertir la eliminación física ${pendingDeleteFilePath} tras fallar la persistencia del soporte documental: ${rollbackMessage}`,
            rollbackError instanceof Error ? rollbackError.stack : undefined,
          );
        }
      }
      throw error;
    }

    if (movedToPendingDelete) {
      try {
        // Una vez persistida la eliminación, la limpieza física pasa a ser best-effort.
        await unlink(pendingDeleteFilePath);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        this.logger.warn(
          `No se pudo limpiar el soporte documental ${pendingDeleteFilePath} tras persistir su eliminación: ${errorMessage}`,
        );
      }
    }

    const actorName = await this.resolveActorName(schemaName, actorUserId);
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: {
        section: 'document_support',
        actorName,
        changedFields: [documentDefinition.key],
      },
    });

    await this.syncCompleteness(id, schemaName);

    return this.buildDocumentSupportResponse(id, effectivePersonType, supports);
  }

  async getDocumentSupportFile(
    id: string,
    documentKey: string,
    versionId: string,
  ): Promise<{ filePath: string; fileName: string; mimeType: string }> {
    const expediente = await this.findById(id);
    const definitions = getDocumentDefinitionsByPersonType(expediente.personType);
    this.requireDocumentDefinition(definitions, documentKey);

    const supports = this.getNormalizedDocumentSupports(expediente.documentSupports);
    const version = (supports[documentKey]?.versions ?? []).find((item) => item.id === versionId);

    if (!version) {
      throw new NotFoundException('No se encontró el archivo solicitado para este expediente.');
    }

    const { schemaName } = TenantContext.getOrThrow();
    const filePath = join(
      this.documentSupportDir,
      schemaName,
      id,
      documentKey,
      version.storedFileName,
    );
    await access(filePath);

    return {
      filePath,
      fileName: version.fileName,
      mimeType: version.mimeType,
    };
  }

  /**
   * Crear expediente con datos mínimos (nombre + canal de adquisición)
   * CA-01
   */
  async create(dto: CreateExpedienteDto, actorUserId: string): Promise<ExpedienteRecord> {
    const { schemaName, tenantId, tenantSlug } = TenantContext.getOrThrow();
    const now = new Date();

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(ExpedienteRecord, {
        tenantId,
        fullName: dto.fullName.trim(),
        acquisitionChannel: dto.acquisitionChannel ?? AcquisitionChannel.OTRO,
        sourceDetail: this.normalizeOptionalText(dto.sourceDetail),
        source:
          this.normalizeOptionalText(dto.sourceDetail) ??
          dto.source?.trim() ??
          dto.acquisitionChannel ??
          AcquisitionChannel.OTRO,
        status: ExpedienteStatus.NUEVO_POTENCIAL,
        previousStatus: null,
        assignedTo: null,
        dataConsentRevoked: false,
        statusChangedAt: now,
        // El creador es el primer responsable del expediente
        currentResponsibleUserId: actorUserId,
        currentResponsibleAssignedAt: now,
        completenessCommercial: 0,
        completenessLegal: 0,
        completenessTechnical: 0,
        completenessOperational: 0,
        checklistCompleted: false,
        createdBy: actorUserId,
      });
      const saved = await qr.manager.save(ExpedienteRecord, entity);

      // Registrar la asignación inicial en el historial de responsabilidad
      try {
        const historyEntry = qr.manager.create(OperationalResponsibilityHistory, {
          tenantId,
          expedienteId: saved.id,
          previousResponsibleUserId: null,
          newResponsibleUserId: actorUserId,
          changedBy: actorUserId,
          changedAt: now,
          notes: 'Asignación inicial al creador del expediente',
        });
        await qr.manager.save(OperationalResponsibilityHistory, historyEntry);
      } catch {
        // Si la tabla aún no existe (schema compat), no bloquear la creación
      }

      return saved;
    });

    await this.syncCompleteness(created.id, schemaName);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'ExpedienteRecord',
      entityId: created.id,
      userId: actorUserId,
      // SEC-P1 / E7 + GSEC-04: sin fullName (PII) en audit manual
      newValue: {
        acquisitionChannel: created.acquisitionChannel,
        sourceDetail: created.sourceDetail,
        status: created.status,
      },
    });

    return this.findById(created.id);
  }

  /**
   * Listar expedientes con filtros opcionales
   */
  async findAll(filters: {
    status?: ExpedienteStatus | undefined;
    municipality?: string | undefined;
    search?: string | undefined;
    assignedTo?: string | undefined;
    documentNumber?: string | undefined;
    includeCompleted?: boolean | undefined;
    view?: ExpedienteListView | undefined;
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<{
    data: ExpedienteRecord[];
    total: number;
    meta: ReturnType<typeof buildPageMeta>;
  }> {
    const { schemaName } = TenantContext.getOrThrow();
    // H-1 / D-2: tope de limit 100 (Ley 1581). Control primario en service (dictamen SEC).
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);
    const status = filters.status;
    const municipality = filters.municipality;
    const search = filters.search;
    const assignedTo = filters.assignedTo;
    const documentNumber = filters.documentNumber?.trim();
    const includeCompleted = filters.includeCompleted ?? false;

    const { hydrated: hydratedData, count: total } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const query = qr.manager.createQueryBuilder(ExpedienteRecord, 'expediente');

        if (municipality)
          query.andWhere('expediente.municipality = :municipality', { municipality });
        if (search) query.andWhere('expediente.fullName ILIKE :search', { search: `%${search}%` });
        if (assignedTo) query.andWhere('expediente.assignedTo = :assignedTo', { assignedTo });

        // Semántica de vista: `view` es fuente de verdad; `includeCompleted` es compatibilidad temporal.
        const effectiveView = filters.view ?? (includeCompleted ? 'all' : 'open');
        const allowedStatuses = resolveExpedienteStatusesForView(effectiveView);

        if (status) {
          query.andWhere('expediente.status = :status', { status });
          // Solo aplicar restricción de vista si no es 'all' (allowedStatuses !== null)
          if (allowedStatuses !== null) {
            query.andWhere('expediente.status IN (:...allowedStatuses)', { allowedStatuses });
          }
        } else if (allowedStatuses !== null) {
          query.andWhere('expediente.status IN (:...allowedStatuses)', { allowedStatuses });
        }

        // D-4: filtro por hash determinista (sin decrypt + SCAN_CAP).
        if (documentNumber) {
          query.andWhere('expediente.documentNumberHash = :docHash', {
            docHash: hashDocumentNumber(documentNumber),
          });
        }

        // DEF-1: desempate por id para paginación offset estable.
        query
          .orderBy('expediente.createdAt', 'DESC')
          .addOrderBy('expediente.id', 'DESC')
          .skip((page - 1) * limit)
          .take(limit);

        const [rows, count] = await query.getManyAndCount();

        // Batch: una consulta por tabla en vez de 3 por fila (ADR-065 S-1)
        const ids = rows.map((r) => r.id);
        const completenessMap = await this.completenessCalculator.calculateBatch(
          qr.manager,
          schemaName,
          ids,
        );

        const hydrated = rows.map((item) => {
          const completeness = completenessMap.get(item.id);
          if (completeness) {
            const pipelineProgress = this.calculatePipelineProgress(completeness);
            Object.assign(item, {
              completenessCommercial: completeness.commercial,
              completenessLegal: completeness.legal,
              completenessTechnical: completeness.technical,
              completenessOperational: completeness.operational,
              completenessOverall: completeness.overall,
              pipelineProgress,
            });
          }
          item.documentNumberEncrypted = null;
          item.documentNumberHash = null;
          item.phonePrimaryEncrypted = null;
          item.phoneSecondaryEncrypted = null;
          item.emailPrimaryEncrypted = null;
          item.altContactPhoneEncrypted = null;
          item.siteContactPhoneEncrypted = null;
          return item;
        });

        return { hydrated, count };
      },
    );

    return {
      data: hydratedData,
      total,
      meta: buildPageMeta({ total, page, limit, randomAccess: true }),
    };
  }

  /**
   * Backfill de `document_number_hash` para filas legacy (ciphertext sin hash).
   * Invocable por tenant; no loguea PII. La migración 088 cubre el despliegue;
   * este método queda como reintento ops. La 087 solo añade columna/índice.
   */
  async backfillDocumentNumberHashes(batchSize = 100): Promise<{
    processed: number;
    updated: number;
    skipped: number;
  }> {
    const safeBatch = Math.min(Math.max(Math.floor(batchSize) || 100, 1), 500);
    const { schemaName } = TenantContext.getOrThrow();
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let afterId: string | null = null;

    // Keyset por id: avanza aunque un decrypt falle (evita bucle infinito).
    for (;;) {
      const batch = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const qb = qr.manager
          .createQueryBuilder(ExpedienteRecord, 'expediente')
          .where('expediente.documentNumberHash IS NULL')
          .andWhere('expediente.documentNumberEncrypted IS NOT NULL')
          .orderBy('expediente.id', 'ASC')
          .take(safeBatch);

        if (afterId) {
          qb.andWhere('expediente.id > :afterId', { afterId });
        }

        return qb.getMany();
      });

      if (batch.length === 0) {
        break;
      }

      afterId = batch[batch.length - 1]!.id;

      await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        for (const row of batch) {
          processed += 1;
          if (!row.documentNumberEncrypted) {
            skipped += 1;
            continue;
          }
          try {
            const plaintext = this.decryptValue(row.documentNumberEncrypted);
            row.documentNumberHash = hashDocumentNumber(plaintext);
            await qr.manager.save(ExpedienteRecord, row);
            updated += 1;
          } catch {
            skipped += 1;
            this.logger.warn(
              `No se pudo backfillear document_number_hash para expediente ${row.id}`,
            );
          }
        }
      });

      if (batch.length < safeBatch) {
        break;
      }
    }

    return { processed, updated, skipped };
  }

  async getPipelineSummary(): Promise<{ data: Record<string, number>; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();

    const rows = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager.createQueryBuilder(ExpedienteRecord, 'expediente');

      return query
        .select('expediente.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('expediente.status')
        .getRawMany<{ status: string; count: string }>();
    });

    const summary: Record<string, number> = {};
    for (const status of Object.values(ExpedienteStatus) as string[]) {
      summary[status] = 0;
    }

    let total = 0;
    for (const row of rows) {
      const count = Number(row.count ?? 0);
      summary[row.status] = count;
      total += count;
    }

    return { data: summary, total };
  }

  /**
   * Obtener expediente por ID con relaciones
   */
  async findById(id: string): Promise<ExpedienteRecord> {
    const { schemaName } = TenantContext.getOrThrow();

    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, {
        where: { id },
        relations: ['contactAttempts', 'consents', 'coverageChecks', 'statusChanges'],
      }),
    );

    if (!entity) {
      throw new NotFoundException('Expediente no encontrado');
    }

    if (entity.documentNumberEncrypted) {
      (entity as ExpedienteRecord & { documentNumber?: string }).documentNumber = this.decryptValue(
        entity.documentNumberEncrypted,
      );

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'ExpedienteRecord',
        entityId: id,
        userId: null,
        // Evento de lectura sensible: se audita, pero no debe tratarse como actualización de sección.
        newValue: { piiaAccess: 'documentNumber', source: 'findById' },
      });
    }

    if (entity.phonePrimaryEncrypted) {
      (entity as ExpedienteRecord & { phonePrimary?: string }).phonePrimary = this.decryptValue(
        entity.phonePrimaryEncrypted,
      );
    }

    if (entity.emailPrimaryEncrypted) {
      (entity as ExpedienteRecord & { emailPrimary?: string }).emailPrimary = this.decryptValue(
        entity.emailPrimaryEncrypted,
      );
    }

    if (entity.altContactPhoneEncrypted) {
      (entity as ExpedienteRecord & { altContactPhone?: string }).altContactPhone =
        this.decryptValue(entity.altContactPhoneEncrypted);
    }

    if (entity.siteContactPhoneEncrypted) {
      (entity as ExpedienteRecord & { siteContactPhone?: string }).siteContactPhone =
        this.decryptValue(entity.siteContactPhoneEncrypted);
    }

    const completeness = await this.completenessCalculator.calculate(id);
    Object.assign(entity, {
      completenessCommercial: completeness.commercial,
      completenessLegal: completeness.legal,
      completenessTechnical: completeness.technical,
      completenessOperational: completeness.operational,
      completenessOverall: completeness.overall,
      sectionCompleteness: completeness.sectionCompleteness,
      installationReadiness: completeness.installationReadiness,
      provisioningReadiness: this.buildProvisioningReadiness(entity),
      missingRequirements: completeness.missingRequirements,
      pipelineProgress: this.calculatePipelineProgress(completeness),
    });

    // Enriquecer con resumen del suscriptor vinculado si existe
    try {
      const subscriberSummary = await this.subscribersService.findSummaryByExpedienteId(id);
      if (subscriberSummary) {
        Object.assign(entity, { subscriberSummary });
      }
    } catch (err) {
      // El resumen del suscriptor es enriquecimiento opcional; no bloquear la lectura del expediente
      this.logger.warn(
        `No se pudo obtener subscriberSummary para expediente ${id}: ${(err as Error).message}`,
      );
    }

    return entity;
  }

  async findDisplayNameById(id: string): Promise<string | null> {
    const { schemaName } = TenantContext.getOrThrow();

    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, {
        where: { id },
        select: ['id', 'fullName', 'firstName', 'lastName', 'companyName'],
      }),
    );

    return entity ? this.resolveDisplayName(entity) : null;
  }

  /**
   * Resolución batch de display names para evitar N+1 conexiones a la pool.
   * Usa un EntityManager ya existente (no abre nuevas conexiones) y resuelve
   * todos los IDs en una sola consulta con IN.
   */
  async findDisplayNamesByIds(
    manager: EntityManager,
    ids: string[],
  ): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map();

    const uniqueIds = [...new Set(ids)];
    const entities = await manager.find(ExpedienteRecord, {
      where: { id: In(uniqueIds) },
      select: ['id', 'fullName', 'firstName', 'lastName', 'companyName'],
    });

    const map = new Map<string, string | null>();
    for (const id of uniqueIds) {
      map.set(id, null);
    }
    for (const entity of entities) {
      map.set(entity.id, this.resolveDisplayName(entity));
    }
    return map;
  }

  async findDisplayNameByShortCode(
    code: string,
  ): Promise<{ id: string; displayName: string } | null> {
    const { schemaName } = TenantContext.getOrThrow();
    const normalizedCode = code.trim().slice(0, 8).toUpperCase();

    if (!/^[A-Z0-9]{8}$/.test(normalizedCode)) {
      return null;
    }

    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager
        .createQueryBuilder(ExpedienteRecord, 'expediente')
        .select([
          'expediente.id',
          'expediente.fullName',
          'expediente.firstName',
          'expediente.lastName',
          'expediente.companyName',
        ])
        .where('UPPER(SUBSTRING(expediente.id::text, 1, 8)) = :code', { code: normalizedCode })
        .getOne(),
    );

    const displayName = entity ? this.resolveDisplayName(entity) : null;

    return entity && displayName ? { id: entity.id, displayName } : null;
  }

  /**
   * Actualizar una sección específica del expediente
   * CA-02 - Solo esa sección se modifica, completitud se recalcula
   */
  async updateSection(
    id: string,
    dto: UpdateSectionDto,
    actorUserId: string,
  ): Promise<ExpedienteRecord> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    const updateData = this.buildSectionUpdate(dto.section, dto.data);
    const effectiveUpdateData = this.extractMeaningfulUpdateData(entity, updateData);

    // Evita generar auditoría y actividad cuando no hay cambios reales.
    if (Object.keys(effectiveUpdateData).length === 0) {
      return entity;
    }

    if (dto.section === ExpedienteSection.TECHNICAL_FEASIBILITY) {
      const projected = { ...entity, ...effectiveUpdateData } as ExpedienteRecord;
      this.validateTechnicalFeasibilityConsistency(projected);
    }

    Object.assign(entity, effectiveUpdateData);

    const actorName = await this.resolveActorName(schemaName, actorUserId);

    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(ExpedienteRecord, entity),
    );

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: {
        section: dto.section,
        actorName,
        changedFields: this.sanitizeAuditChangedFields(dto.section, effectiveUpdateData),
      },
    });

    await this.syncCompleteness(id, schemaName);

    return this.findById(updated.id);
  }

  /**
   * Transición de estado del pipeline
   */
  async transitionStatus(
    id: string,
    dto: TransitionStatusDto,
    actorUserId: string,
  ): Promise<ExpedienteRecord> {
    const { schemaName, tenantId, tenantSlug } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    const fromStatus = entity.status;
    const toStatus = dto.targetStatus;
    const actorName = await this.resolveActorName(schemaName, actorUserId);
    const statusChangeActorId = this.resolveStatusChangeActorId(actorUserId, entity.createdBy);

    if (fromStatus === toStatus) {
      return entity;
    }

    const now = new Date();
    entity.previousStatus = fromStatus;
    entity.status = toStatus;
    entity.statusChangedAt = now;

    if (toStatus === ExpedienteStatus.CLIENTE_ACTIVO && !entity.checklistCompleted) {
      // Cierre automático de checklist cuando el expediente ya cumple la transición.
      entity.checklistCompleted = true;
    }

    if (toStatus === ExpedienteStatus.DESCARTADO && dto.reason) {
      entity.discardReason = dto.reason;
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.save(ExpedienteRecord, entity);
    });

    await this.persistStatusChangeSafely({
      schemaName,
      tenantId,
      expedienteId: id,
      fromStatus,
      toStatus,
      changedAt: now,
      changedBy: statusChangeActorId,
      actorName,
      reason: dto.reason ?? null,
      contextLabel: 'TRANSITION',
    });

    await this.syncCompleteness(id, schemaName);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: { fromStatus, toStatus, reason: dto.reason },
    });

    if (toStatus === ExpedienteStatus.LISTO_PARA_INSTALACION) {
      await this.emitPipelineEventSafely(
        'crm.expediente.ready-for-installation',
        new ExpedienteReadyForInstallationEvent(tenantId, schemaName, id, actorUserId),
        id,
      );
    }

    if (toStatus === ExpedienteStatus.INSTALACION_AGENDADA) {
      await this.emitPipelineEventSafely(
        'crm.expediente.installation-scheduled',
        new ExpedienteInstallationScheduledEvent(tenantId, schemaName, tenantSlug, id, actorUserId),
        id,
      );
    }

    if (toStatus === ExpedienteStatus.CLIENTE_ACTIVO) {
      await this.emitPipelineEventSafely(
        'crm.expediente.activated',
        new ExpedienteActivatedEvent(tenantId, schemaName, id, actorUserId),
        id,
      );
    }

    if (toStatus === ExpedienteStatus.DESCARTADO) {
      await this.emitPipelineEventSafely(
        'crm.expediente.discarded',
        new ExpedienteDiscardedEvent(tenantId, schemaName, id, actorUserId, dto.reason ?? null),
        id,
      );
    }

    return this.findById(id);
  }

  /**
   * Reactivar expediente descartado
   * CA-11
   */
  async reactivate(id: string, actorUserId: string): Promise<ExpedienteRecord> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    if (entity.status !== ExpedienteStatus.DESCARTADO) {
      throw new BadRequestException('Solo expedientes descartados pueden reactivarse');
    }

    const previousStatus = entity.previousStatus || ExpedienteStatus.NUEVO_POTENCIAL;
    const actorName = await this.resolveActorName(schemaName, actorUserId);
    const statusChangeActorId = this.resolveStatusChangeActorId(actorUserId, entity.createdBy);
    const changedAt = new Date();
    entity.status = previousStatus;
    entity.previousStatus = ExpedienteStatus.DESCARTADO;
    entity.statusChangedAt = changedAt;
    entity.discardReason = null;

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.save(ExpedienteRecord, entity);
    });

    await this.persistStatusChangeSafely({
      schemaName,
      tenantId,
      expedienteId: id,
      fromStatus: ExpedienteStatus.DESCARTADO,
      toStatus: previousStatus,
      changedAt,
      changedBy: statusChangeActorId,
      actorName,
      reason: 'Reactivación de expediente',
      contextLabel: 'REACTIVATE',
    });

    await this.syncCompleteness(id, schemaName);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: id,
      userId: actorUserId,
      newValue: { action: 'reactivate', previousStatus },
    });

    return this.findById(id);
  }

  async createContactAttempt(
    expedienteId: string,
    dto: CreateContactAttemptDto,
    actorUserId: string,
  ): Promise<ContactAttempt> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const expediente = await this.findById(expedienteId);
    const actorName = await this.resolveActorName(schemaName, actorUserId);
    const persistenceActorId = this.resolvePersistenceActorId(actorUserId, expediente.createdBy);

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(ContactAttempt, {
        tenantId,
        expedienteId,
        attemptedAt: new Date(),
        channel: dto.channel,
        result: dto.result,
        durationMinutes: dto.durationMinutes ?? null,
        notes: dto.notes ? this.sanitizePlainText(dto.notes) : null,
        advisorId: persistenceActorId,
        actorName,
      });

      return qr.manager.save(ContactAttempt, entity);
    });

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'ContactAttempt',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        expedienteId,
        channel: created.channel,
        result: created.result,
      },
    });

    return created;
  }

  async listContactAttempts(
    expedienteId: string,
    rawPage = 1,
    rawLimit = 20,
  ): Promise<{
    data: ContactAttempt[];
    total: number;
    meta: ReturnType<typeof buildPageMeta>;
  }> {
    // H-1 / D-2: tope de limit 100 también en intentos de contacto.
    const cappedLimit = clampLimit(rawLimit);
    const { page, limit } = clampPage(rawPage ?? 1, cappedLimit);
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    const [data, total] = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager.createQueryBuilder(ContactAttempt, 'attempt');

      query
        .where('attempt.expedienteId = :expedienteId', { expedienteId })
        // DEF-1: desempate por id.
        .orderBy('attempt.attemptedAt', 'DESC')
        .addOrderBy('attempt.id', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      return query.getManyAndCount();
    });

    return {
      data,
      total,
      meta: buildPageMeta({ total, page, limit, randomAccess: true }),
    };
  }

  async createConsent(
    expedienteId: string,
    dto: CreateConsentDto,
    actorUserId: string,
    ipAddress: string | null,
  ): Promise<ConsentRecord> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await this.findById(expedienteId);
    const normalizedConsentType = this.normalizeConsentType(dto.consentType);
    const normalizedConsentStatus = this.normalizeConsentStatus(dto.status);

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (normalizedConsentStatus === ConsentStatus.ACEPTADO) {
        const existingAccepted = await qr.manager.findOne(ConsentRecord, {
          where: {
            expedienteId,
            consentType: normalizedConsentType,
            status: ConsentStatus.ACEPTADO,
          },
        });

        if (existingAccepted) {
          throw new BadRequestException({
            code: 'CONSENT_ALREADY_ACCEPTED',
            message: 'Ya existe un consentimiento aceptado para este tipo.',
          });
        }
      }

      const entity = qr.manager.create(ConsentRecord, {
        tenantId,
        expedienteId,
        legacyProspectId: expedienteId,
        consentType: normalizedConsentType,
        status: normalizedConsentStatus,
        legacyAccepted: normalizedConsentStatus === ConsentStatus.ACEPTADO,
        channel: dto.channel,
        obtainedAt: new Date(),
        ipAddress,
        legalTextVersion: dto.legalTextVersion?.trim() || CONSENT_LEGAL_VERSION,
        evidenceRef: dto.evidenceRef?.trim() ?? null,
        revokedAt: null,
        revokedReason: null,
        revokedBy: null,
      });

      return qr.manager.save(ConsentRecord, entity);
    });

    await this.syncCompleteness(expedienteId, schemaName);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'ConsentRecord',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        expedienteId,
        consentType: created.consentType,
        status: created.status,
      },
    });

    return created;
  }

  async listConsents(expedienteId: string): Promise<ConsentRecord[]> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(ConsentRecord, {
        where: { expedienteId },
        order: { obtainedAt: 'DESC' },
      }),
    );
  }

  async revokeConsent(
    expedienteId: string,
    consentId: string,
    reason: string,
    actorUserId: string,
  ): Promise<ConsentRecord> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    const updated = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(ConsentRecord, {
        where: { id: consentId, expedienteId },
      });

      if (!entity) {
        throw new NotFoundException(`Consentimiento ${consentId} no encontrado`);
      }

      entity.status = ConsentStatus.RECHAZADO;
      entity.legacyAccepted = false;
      entity.revokedAt = new Date();
      entity.revokedReason = this.sanitizePlainText(reason);
      entity.revokedBy = actorUserId;

      if (entity.consentType === ConsentType.TRATAMIENTO_DATOS) {
        await qr.manager.update(
          ExpedienteRecord,
          { id: expedienteId },
          { dataConsentRevoked: true },
        );
      }

      return qr.manager.save(ConsentRecord, entity);
    });

    await this.syncCompleteness(expedienteId, schemaName);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ConsentRecord',
      entityId: consentId,
      userId: actorUserId,
      newValue: {
        expedienteId,
        status: ConsentStatus.RECHAZADO,
        reason: this.sanitizePlainText(reason),
      },
    });

    return updated;
  }

  async createCoverageCheck(
    expedienteId: string,
    dto: CreateCoverageCheckDto,
    actorUserId: string,
  ): Promise<CoverageCheck> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const expediente = await this.findById(expedienteId);
    const persistenceActorId = this.resolvePersistenceActorId(actorUserId, expediente.createdBy);

    const created = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(CoverageCheck, {
        tenantId,
        expedienteId,
        checkedAt: new Date(),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        addressUsed: dto.addressUsed.trim(),
        result: dto.result,
        technologyAvailable: dto.technologyAvailable?.trim() ?? null,
        distanceM: dto.distanceM ?? null,
        snapshotJson: dto.snapshotJson ?? {},
        checkedBy: persistenceActorId,
      });

      const saved = await qr.manager.save(CoverageCheck, entity);

      await qr.manager.update(
        ExpedienteRecord,
        { id: expedienteId },
        {
          coverageResult: dto.result,
          availableTechnology: dto.technologyAvailable?.trim() ?? expediente.availableTechnology,
          estimatedDistanceM: dto.distanceM ?? expediente.estimatedDistanceM,
          feasibility: dto.result,
        },
      );

      return saved;
    });

    await this.syncCompleteness(expedienteId, schemaName);

    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'CoverageCheck',
      entityId: created.id,
      userId: actorUserId,
      newValue: {
        expedienteId,
        result: created.result,
        technologyAvailable: created.technologyAvailable,
      },
    });

    return created;
  }

  async listCoverageChecks(expedienteId: string): Promise<CoverageCheck[]> {
    const { schemaName } = TenantContext.getOrThrow();
    await this.findById(expedienteId);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(CoverageCheck, {
        where: { expedienteId },
        order: { checkedAt: 'DESC' },
      }),
    );
  }

  /**
   * Vincular ticket y orden de trabajo operativos al expediente de instalación
   */
  async linkInstallationOperationalRefs(
    expedienteId: string,
    dto: LinkInstallationOperationalRefsDto,
    actorUserId: string,
  ): Promise<ExpedienteRecord> {
    // Valida estructura del DTO en la frontera del servicio
    LinkInstallationOperationalRefsSchema.parse(dto);

    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(expedienteId);

    const prevTicketId = entity.ticketId;
    const prevWorkOrderId = entity.workOrderId;

    entity.ticketId = dto.ticketId;
    entity.workOrderId = dto.workOrderId;

    if (dto.lastRescheduleReason !== undefined) {
      entity.lastRescheduleReason = dto.lastRescheduleReason ?? null;
    }
    if (dto.lastRescheduleNotes !== undefined) {
      entity.lastRescheduleNotes = dto.lastRescheduleNotes ?? null;
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.save(ExpedienteRecord, entity);
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'ExpedienteRecord',
      entityId: expedienteId,
      userId: actorUserId,
      newValue: {
        ticketId: { from: prevTicketId, to: dto.ticketId },
        workOrderId: { from: prevWorkOrderId, to: dto.workOrderId },
      },
    });

    return this.findById(expedienteId);
  }

  async getTimelineSummary(id: string): Promise<{
    changes: Array<{
      id: string;
      fromStatus: string;
      toStatus: string;
      changedAt: Date;
      reason: string | null;
      actor: ExpedienteTimelineActor;
    }>;
    activities: ExpedienteActivityItem[];
    metadata: ExpedienteOperationalMetadata;
  }> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const auditLogs = await qr.manager.find(AuditLog, {
        where: { entityType: 'ExpedienteRecord', entityId: id },
        order: { createdAt: 'DESC' },
      });

      const actorIds = new Set<string>();

      if (entity.createdBy) {
        actorIds.add(entity.createdBy);
      }

      for (const change of entity.statusChanges ?? []) {
        if (change.changedBy) {
          actorIds.add(change.changedBy);
        }
      }

      for (const attempt of entity.contactAttempts ?? []) {
        if (attempt.advisorId) {
          actorIds.add(attempt.advisorId);
        }
      }

      for (const log of auditLogs) {
        if (log.userId) {
          actorIds.add(log.userId);
        }
      }

      const actors = actorIds.size
        ? await this.crmActorReadPort.findByIds(schemaName, Array.from(actorIds))
        : [];

      const actorMap = new Map<string, ExpedienteTimelineActor>();
      for (const actor of actors) {
        actorMap.set(actor.id, { userId: actor.id, name: actor.name });
      }

      const getActor = (userId: string | null | undefined): ExpedienteTimelineActor => {
        if (!userId) {
          return { userId: null, name: null };
        }

        return actorMap.get(userId) ?? { userId, name: null };
      };

      const changes = [...(entity.statusChanges ?? [])]
        .sort((left, right) => right.changedAt.getTime() - left.changedAt.getTime())
        .map((change) => ({
          id: change.id,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          changedAt: change.changedAt,
          reason: change.reason,
          actor: change.actorName
            ? { userId: change.changedBy, name: change.actorName }
            : getActor(change.changedBy),
        }));

      const statusActivities: ExpedienteActivityItem[] = changes.map((change) => ({
        id: `status:${change.id}`,
        type: 'STATUS_CHANGED',
        occurredAt: change.changedAt,
        actor: change.actor,
        sectionLabel: null,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        reason: change.reason,
      }));

      const auditActivities: ExpedienteActivityItem[] = [];
      const contactAttemptActivities: ExpedienteActivityItem[] = [...(entity.contactAttempts ?? [])]
        .sort((left, right) => right.attemptedAt.getTime() - left.attemptedAt.getTime())
        .map((attempt) => ({
          id: `contact:${attempt.id}`,
          type: 'CONTACT_ATTEMPT',
          occurredAt: attempt.attemptedAt,
          actor: attempt.actorName
            ? { userId: attempt.advisorId, name: attempt.actorName }
            : getActor(attempt.advisorId),
          sectionLabel: 'Intento de contacto',
          fromStatus: null,
          toStatus: null,
          reason: attempt.notes,
        }));

      for (const log of auditLogs) {
        const newValue = log.newValue ?? null;
        const isPiiAccessLog = typeof newValue?.['piiaAccess'] === 'string';

        // Evita ruido en la bitácora funcional: acceso PII no es edición de sección.
        if (isPiiAccessLog) {
          continue;
        }

        const section =
          typeof newValue?.['section'] === 'string' ? String(newValue['section']) : null;
        const changedFields = this.extractChangedFieldsFromAuditLog(newValue, section);
        const actorNameFromLog =
          typeof newValue?.['actorName'] === 'string' ? String(newValue['actorName']) : null;
        const actor = actorNameFromLog
          ? { userId: log.userId, name: actorNameFromLog }
          : getActor(log.userId);

        if (log.action === AuditAction.CREATE) {
          auditActivities.push({
            id: `audit:${log.id}`,
            type: 'CREATED',
            occurredAt: log.createdAt,
            actor,
            sectionLabel: null,
            fromStatus: null,
            toStatus: null,
            reason: null,
          });
          continue;
        }

        if (log.action === AuditAction.UPDATE && section) {
          auditActivities.push({
            id: `audit:${log.id}`,
            type: 'SECTION_UPDATED',
            occurredAt: log.createdAt,
            actor,
            sectionLabel: SECTION_LABELS[section] ?? section,
            fromStatus: null,
            toStatus: null,
            reason: this.buildAuditChangeSummary(changedFields),
          });
        }
      }

      const activities = [
        ...statusActivities,
        ...auditActivities,
        ...contactAttemptActivities,
      ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());

      const createAuditActor = auditActivities
        .filter((activity) => activity.type === 'CREATED')
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
        .find(
          (activity) => hasActorName(activity.actor) || hasActorIdentity(activity.actor),
        )?.actor;

      const firstKnownActor = [...auditActivities]
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
        .find(
          (activity) => hasActorName(activity.actor) || hasActorIdentity(activity.actor),
        )?.actor;

      const createdByFromEntity = getActor(entity.createdBy);
      const createdBy = hasActorName(createdByFromEntity)
        ? createdByFromEntity
        : (createAuditActor ?? firstKnownActor ?? createdByFromEntity);

      const lastEditedBy =
        activities.find(
          (activity) => hasActorName(activity.actor) || hasActorIdentity(activity.actor),
        )?.actor ?? createdBy;
      const lastActivityAt = activities[0]?.occurredAt ?? entity.updatedAt;

      return {
        changes,
        activities,
        metadata: {
          createdBy,
          lastEditedBy,
          lastActivityAt,
        },
      };
    });
  }

  /**
   * Construir actualización según sección
   */
  private buildSectionUpdate(
    section: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    switch (section) {
      case ExpedienteSection.IDENTIFICATION:
        return this.buildIdentificationSectionUpdate(data);

      case ExpedienteSection.CONTACT:
        if (data.phonePrimary)
          result.phonePrimaryEncrypted = this.encryptValue(String(data.phonePrimary));
        if (data.phoneSecondary)
          result.phoneSecondaryEncrypted = this.encryptValue(String(data.phoneSecondary));
        if (data.emailPrimary)
          result.emailPrimaryEncrypted = this.encryptValue(String(data.emailPrimary));
        if (data.emailSecondary) result.emailSecondary = String(data.emailSecondary);
        if ('altContactName' in data) {
          const altContactName = String(data.altContactName ?? '').trim();
          result.altContactName = altContactName ? altContactName : null;
        }
        if ('altContactPhone' in data) {
          const altContactPhone = String(data.altContactPhone ?? '').trim();
          result.altContactPhoneEncrypted = altContactPhone
            ? this.encryptValue(altContactPhone)
            : null;
        }
        if (data.contactPreference) result.contactPreference = String(data.contactPreference);
        if (data.bestContactTime) result.bestContactTime = String(data.bestContactTime);
        break;

      case ExpedienteSection.LOCATION:
        if (data.address) result.address = String(data.address);
        if (data.municipality) result.municipality = String(data.municipality);
        if (data.department) result.department = String(data.department);
        if ('postalCode' in data) {
          result.postalCode = this.normalizeOptionalText(data.postalCode);
        }
        if ('stratum' in data) {
          const parsedStratum = this.parseOptionalNumber(data.stratum, 'stratum');
          result.stratum = parsedStratum;
        }
        if (data.neighborhood) result.neighborhood = String(data.neighborhood);
        if ('latitude' in data) {
          const parsedLatitude = this.parseOptionalNumber(data.latitude, 'latitude', {
            normalizeDecimalComma: true,
          });
          result.latitude = parsedLatitude;
        }
        if ('longitude' in data) {
          const parsedLongitude = this.parseOptionalNumber(data.longitude, 'longitude', {
            normalizeDecimalComma: true,
          });
          result.longitude = parsedLongitude;
        }
        if (data.coordinatesSource) result.coordinatesSource = String(data.coordinatesSource);
        if (data.coordinatesConfidence)
          result.coordinatesConfidence = String(data.coordinatesConfidence);
        if (data.accessReferences) result.accessReferences = String(data.accessReferences);
        if (data.zoneType) result.zoneType = String(data.zoneType);
        break;

      case ExpedienteSection.COMMERCIAL_INTEREST:
        if ('acquisitionChannel' in data && data.acquisitionChannel) {
          const acquisitionChannel = String(data.acquisitionChannel);
          result.acquisitionChannel = acquisitionChannel;
          result.source = acquisitionChannel;
        }
        if ('sourceDetail' in data) {
          const sourceDetail = this.normalizeOptionalText(data.sourceDetail);
          result.sourceDetail = sourceDetail;
          if (sourceDetail) {
            result.source = sourceDetail;
          }
        }
        if (data.source) {
          const source = String(data.source);
          result.source = source;
          if (!('sourceDetail' in data)) {
            result.sourceDetail = source;
          }
        }
        if (data.interestedPlanId) result.interestedPlanId = String(data.interestedPlanId);
        if ('additionalProductIds' in data) {
          const parsedAdditionalProducts = this.parseStringArray(data.additionalProductIds);
          result.additionalProductIds = parsedAdditionalProducts ?? [];
        }
        if ('additionalServiceIds' in data) {
          const parsedAdditionalServices = this.parseStringArray(data.additionalServiceIds);
          result.additionalServiceIds = parsedAdditionalServices ?? [];
        }
        if (data.campaign) result.campaign = String(data.campaign);
        if (data.casePriority) result.casePriority = String(data.casePriority);
        if (data.estimatedBudget) result.estimatedBudget = Number(data.estimatedBudget);
        if (data.commercialNotes) result.commercialNotes = String(data.commercialNotes);
        break;

      case ExpedienteSection.TECHNICAL_FEASIBILITY:
        if ('coverageResult' in data)
          result.coverageResult = this.normalizeOptionalEnum(data.coverageResult);
        if ('availableTechnology' in data)
          result.availableTechnology = this.normalizeOptionalEnum(data.availableTechnology);
        if ('estimatedDistanceM' in data)
          result.estimatedDistanceM = this.parseOptionalNumber(
            data.estimatedDistanceM,
            'estimatedDistanceM',
          );
        if ('feasibility' in data)
          result.feasibility = this.normalizeOptionalEnum(data.feasibility);
        if ('candidateTechnologies' in data)
          result.candidateTechnologies = this.parseStringArray(data.candidateTechnologies);
        if ('technicalConfidence' in data)
          result.technicalConfidence = this.normalizeOptionalEnum(data.technicalConfidence);
        if ('evaluationSource' in data)
          result.evaluationSource = this.normalizeOptionalEnum(data.evaluationSource);
        if ('technicalObservations' in data)
          result.technicalObservations = this.normalizeOptionalText(data.technicalObservations);
        if ('estimatedEquipment' in data)
          result.estimatedEquipment = this.normalizeOptionalText(data.estimatedEquipment);
        break;

      case ExpedienteSection.LEGAL_CONSENT:
        if (data.identityVerified) result.identityVerified = String(data.identityVerified);
        if (data.legalComplianceStatus)
          result.legalComplianceStatus = String(data.legalComplianceStatus);
        break;

      case ExpedienteSection.BILLING:
        if (data.paymentMethod) result.paymentMethod = String(data.paymentMethod);
        if (data.billingCycle) result.billingCycle = String(data.billingCycle);
        if (data.fiscalName) result.fiscalName = String(data.fiscalName);
        if (data.fiscalDocument) result.fiscalDocument = String(data.fiscalDocument);
        if (data.fiscalAddress) result.fiscalAddress = String(data.fiscalAddress);
        if (data.rutReference) result.rutReference = String(data.rutReference);
        break;

      case ExpedienteSection.INSTALLATION:
        if (data.installationAddress) result.installationAddress = String(data.installationAddress);
        if (data.availabilityWindow) result.availabilityWindow = String(data.availabilityWindow);
        if (data.siteContactName) result.siteContactName = String(data.siteContactName);
        if (data.siteContactPhone)
          result.siteContactPhoneEncrypted = this.encryptValue(String(data.siteContactPhone));
        if (data.specialAccessNotes) result.specialAccessNotes = String(data.specialAccessNotes);
        if (data.requiredMaterials) result.requiredMaterials = String(data.requiredMaterials);
        break;
    }

    return result;
  }

  private extractMeaningfulUpdateData(
    entity: ExpedienteRecord,
    updateData: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.entries(updateData).reduce<Record<string, unknown>>((acc, [field, nextValue]) => {
      const currentValue = (entity as unknown as Record<string, unknown>)[field];

      if (!this.isSamePersistedValue(field, currentValue, nextValue)) {
        acc[field] = nextValue;
      }

      return acc;
    }, {});
  }

  private isSamePersistedValue(field: string, currentValue: unknown, nextValue: unknown): boolean {
    if (currentValue === null || currentValue === undefined) {
      return nextValue === null || nextValue === undefined;
    }

    if (nextValue === null || nextValue === undefined) {
      return currentValue === null || currentValue === undefined;
    }

    if (field.endsWith('Encrypted')) {
      if (typeof currentValue !== 'string' || typeof nextValue !== 'string') {
        return currentValue === nextValue;
      }

      return (
        this.getComparableEncryptedValue(currentValue) ===
        this.getComparableEncryptedValue(nextValue)
      );
    }

    if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
      if (currentValue.length !== nextValue.length) {
        return false;
      }

      return currentValue.every((value, index) => value === nextValue[index]);
    }

    if (currentValue instanceof Date && nextValue instanceof Date) {
      return currentValue.getTime() === nextValue.getTime();
    }

    return currentValue === nextValue;
  }

  private getComparableEncryptedValue(value: string): string {
    if (!looksLikeEncryptedAesGcm(value)) {
      return value;
    }

    try {
      return this.decryptValue(value);
    } catch {
      return value;
    }
  }

  private parseOptionalNumber(
    value: unknown,
    fieldName: string,
    options?: { normalizeDecimalComma?: boolean },
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (!trimmedValue) {
        return null;
      }

      const normalizedValue = options?.normalizeDecimalComma
        ? trimmedValue.replace(',', '.')
        : trimmedValue;
      const parsed = Number(normalizedValue);
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException({
          code: 'INVALID_NUMERIC_VALUE',
          message: `El campo ${fieldName} debe ser numérico válido.`,
          field: fieldName,
        });
      }
      return parsed;
    }

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new BadRequestException({
          code: 'INVALID_NUMERIC_VALUE',
          message: `El campo ${fieldName} debe ser numérico válido.`,
          field: fieldName,
        });
      }
      return value;
    }

    throw new BadRequestException({
      code: 'INVALID_NUMERIC_VALUE',
      message: `El campo ${fieldName} debe ser numérico válido.`,
      field: fieldName,
    });
  }

  private buildIdentificationSectionUpdate(data: Record<string, unknown>): Record<string, unknown> {
    const personType = this.requireAllowedValue(
      data.personType,
      ['PERSONA_NATURAL', 'PERSONA_JURIDICA'],
      'Tipo de persona',
    );
    const documentType = this.requireAllowedValue(
      data.documentType,
      DOCUMENT_TYPE_OPTIONS,
      'Tipo de documento',
    );
    const documentNumber = this.requireNonEmptyText(data.documentNumber, 'Numero de documento');

    const documentNumberHash = hashDocumentNumber(String(documentNumber));

    if (personType === 'PERSONA_NATURAL') {
      const firstName = this.requireNonEmptyText(data.firstName, 'Nombres');
      const lastName = this.requireNonEmptyText(data.lastName, 'Apellidos');
      return {
        personType,
        firstName: this.sanitizePlainText(String(firstName)),
        lastName: this.sanitizePlainText(String(lastName)),
        companyName: null,
        primaryContactName: null,
        primaryContactRole: null,
        documentType,
        documentNumberEncrypted: this.encryptValue(String(documentNumber)),
        documentNumberHash,
        fullName: `${firstName} ${lastName}`.trim(),
      };
    }

    const companyName = this.requireNonEmptyText(data.companyName, 'Razon social');
    const primaryContactName = this.requireNonEmptyText(
      data.primaryContactName,
      'Contacto principal',
    );
    const primaryContactRole = this.requireNonEmptyText(
      data.primaryContactRole,
      'Cargo del contacto',
    );
    return {
      personType,
      firstName: null,
      lastName: null,
      companyName: this.sanitizePlainText(String(companyName)),
      primaryContactName: this.sanitizePlainText(String(primaryContactName)),
      primaryContactRole: this.sanitizePlainText(String(primaryContactRole)),
      documentType,
      documentNumberEncrypted: this.encryptValue(String(documentNumber)),
      documentNumberHash,
      fullName: String(companyName),
    };
  }

  private requireAllowedValue(value: unknown, allowedValues: string[], fieldName: string): string {
    const stringValue = String(value ?? '');
    if (!allowedValues.includes(stringValue)) {
      throw new BadRequestException(`${fieldName} no es un valor permitido`);
    }
    return stringValue;
  }

  private requireNonEmptyText(value: unknown, fieldName: string): string {
    const stringValue = String(value ?? '').trim();
    if (!stringValue) {
      throw new BadRequestException(`${fieldName} es requerido`);
    }
    return this.sanitizePlainText(stringValue);
  }

  private sanitizeAuditChangedFields(section: string, data: Record<string, unknown>): string[] {
    const changedFields = Object.keys(data);

    if (section === ExpedienteSection.IDENTIFICATION) {
      return changedFields.filter(
        (field) => field !== 'documentNumberEncrypted' && field !== 'documentNumberHash',
      );
    }

    return changedFields;
  }

  private extractChangedFieldsFromAuditLog(newValue: unknown, section: string | null): string[] {
    if (!newValue || typeof newValue !== 'object') {
      return [];
    }

    const record = newValue as Record<string, unknown>;

    if (Array.isArray(record.changedFields)) {
      return record.changedFields.filter((value): value is string => typeof value === 'string');
    }

    if (record.data && typeof record.data === 'object') {
      const rawData = record.data as Record<string, unknown>;
      if (section) {
        return this.sanitizeAuditChangedFields(section, rawData);
      }
      return Object.keys(rawData);
    }

    return [];
  }

  private buildAuditChangeSummary(changedFields: string[]): string | null {
    if (changedFields.length === 0) {
      return null;
    }

    const labels = changedFields.map((field) => SECTION_FIELD_LABELS[field] ?? field);
    return `Campos actualizados: ${labels.join(', ')}`;
  }

  private sanitizePlainText(value: string): string {
    return value.replace(/<[^>]*>/g, '').trim();
  }

  private normalizeConsentType(value: CreateConsentDto['consentType']): ConsentType {
    if (value === 'DATA_TREATMENT') {
      return ConsentType.TRATAMIENTO_DATOS;
    }

    if (value === 'COMMERCIAL_CONTACT') {
      return ConsentType.CONTACTO_COMERCIAL;
    }

    if (value === 'OPERATIONAL_CONTACT') {
      return ConsentType.CONTACTO_OPERATIVO;
    }

    return value;
  }

  private parseStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const parsed = value.map((item) => String(item ?? '').trim()).filter(Boolean);

    return parsed.length > 0 ? parsed : null;
  }

  private normalizeOptionalEnum(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalText(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized ? this.sanitizePlainText(normalized) : null;
  }

  private validateTechnicalFeasibilityConsistency(expediente: ExpedienteRecord): void {
    const feasibility = expediente.feasibility;
    if (!feasibility) {
      return;
    }

    const hasCandidateTechnologies = (expediente.candidateTechnologies?.length ?? 0) > 0;
    const hasRecommendedTechnology = Boolean(expediente.availableTechnology);
    const hasConfidence = Boolean(expediente.technicalConfidence);
    const hasEvaluationSource = Boolean(expediente.evaluationSource);
    const hasObservations = Boolean(expediente.technicalObservations?.trim());

    if (feasibility === TechnicalViabilityResult.VIABLE) {
      if (!hasCandidateTechnologies) {
        throw new BadRequestException({
          code: 'CANDIDATE_TECHNOLOGIES_REQUIRED',
          message:
            'Debes registrar al menos una tecnologia candidata cuando la viabilidad es viable.',
        });
      }

      if (!hasRecommendedTechnology) {
        throw new BadRequestException({
          code: 'TECHNOLOGY_RECOMMENDATION_REQUIRED',
          message: 'La tecnologia recomendada es obligatoria cuando la viabilidad es viable.',
        });
      }

      if (!hasConfidence || !hasEvaluationSource) {
        throw new BadRequestException({
          code: 'TECHNICAL_CONFIDENCE_AND_SOURCE_REQUIRED',
          message:
            'Nivel de certeza y fuente de evaluacion son obligatorios cuando la viabilidad es viable.',
        });
      }

      return;
    }

    if (feasibility === TechnicalViabilityResult.VALIDATION_REQUIRED) {
      if (!hasCandidateTechnologies || !hasConfidence || !hasEvaluationSource || !hasObservations) {
        throw new BadRequestException({
          code: 'VALIDATION_REQUIRED_FIELDS_MISSING',
          message:
            'Para validacion tecnica requerida debes registrar tecnologias candidatas, certeza, fuente y observacion tecnica.',
        });
      }

      return;
    }

    if (feasibility === TechnicalViabilityResult.NOT_VIABLE) {
      if (!hasEvaluationSource || !hasObservations) {
        throw new BadRequestException({
          code: 'NOT_VIABLE_FIELDS_MISSING',
          message: 'Para no viable debes registrar fuente de evaluacion y observacion tecnica.',
        });
      }
    }
  }

  private normalizeConsentStatus(value: CreateConsentDto['status']): ConsentStatus {
    if (value === 'PENDING') {
      return ConsentStatus.PENDIENTE;
    }

    if (value === 'ACCEPTED') {
      return ConsentStatus.ACEPTADO;
    }

    if (value === 'REJECTED') {
      return ConsentStatus.RECHAZADO;
    }

    if (value === 'REVOKED') {
      return ConsentStatus.REVOCADO;
    }

    return value;
  }

  private getNormalizedDocumentSupports(value: unknown): StoredDocumentSupportMap {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as StoredDocumentSupportMap;
  }

  private resolveEffectiveDocumentPersonType(
    persistedPersonType: string | null | undefined,
    personTypeOverride?: string | null,
  ): string | null {
    return (
      this.resolveDocumentSupportPersonTypeOverride(personTypeOverride) ??
      this.resolveSupportedDocumentSupportPersonType(persistedPersonType) ??
      persistedPersonType ??
      null
    );
  }

  private resolveDocumentSupportPersonTypeOverride(
    personTypeOverride?: string | null,
  ): string | null {
    const normalizedOverride = this.normalizeOptionalText(personTypeOverride);

    if (normalizedOverride === null) {
      return null;
    }

    const resolvedOverride = this.resolveSupportedDocumentSupportPersonType(normalizedOverride);

    if (!resolvedOverride) {
      throw new BadRequestException({
        code: 'INVALID_DOCUMENT_SUPPORT_PERSON_TYPE',
        message: 'El personType indicado no es válido para soportes documentales.',
        field: 'personType',
      });
    }

    return resolvedOverride;
  }

  private resolveSupportedDocumentSupportPersonType(
    value: string | null | undefined,
  ): 'PERSONA_NATURAL' | 'PERSONA_JURIDICA' | null {
    const normalized = String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');

    if (!normalized) {
      return null;
    }

    return DOCUMENT_SUPPORT_PERSON_TYPE_ALIASES[normalized] ?? null;
  }

  private getDocumentDefinitionsForOperation(
    persistedPersonType: string | null | undefined,
    personTypeOverride?: string | null,
  ): DocumentSupportDefinition[] {
    return getDocumentDefinitionsByPersonType(
      this.resolveEffectiveDocumentPersonType(persistedPersonType, personTypeOverride),
    );
  }

  private requireDocumentDefinition(
    definitions: DocumentSupportDefinition[],
    documentKey: string,
  ): DocumentSupportDefinition {
    const definition = definitions.find((item) => item.key === documentKey);

    if (!definition) {
      throw new BadRequestException({
        code: 'INVALID_DOCUMENT_SUPPORT_KEY',
        message: 'El soporte solicitado no aplica para el tipo de persona del expediente.',
      });
    }

    return definition;
  }

  private validateDocumentUpload(
    file: UploadedDocumentFile | undefined,
  ): asserts file is UploadedDocumentFile {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo para continuar.');
    }

    const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Solo se permiten archivos PDF, PNG, JPG o WEBP.');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('El archivo supera el límite de 10 MB permitido.');
    }
  }

  private resolveSafeFileExtension(fileName: string, mimeType: string): string {
    const normalized = extname(fileName).toLowerCase();
    if (
      normalized === '.pdf' ||
      normalized === '.png' ||
      normalized === '.jpg' ||
      normalized === '.jpeg' ||
      normalized === '.webp'
    ) {
      return normalized;
    }

    if (mimeType === 'application/pdf') return '.pdf';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.jpg';
  }

  private sanitizeStoredFileName(fileName: string): string {
    const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return normalized || 'soporte_documental';
  }

  private async persistDocumentSupports(
    expedienteId: string,
    schemaName: string,
    supports: StoredDocumentSupportMap,
  ): Promise<void> {
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(
        ExpedienteRecord,
        { id: expedienteId },
        { documentSupports: supports },
      );
    });
  }

  private buildDocumentSupportResponse(
    expedienteId: string,
    personType: string | null | undefined,
    storedValue: unknown,
  ): ExpedienteDocumentSupportResponseDto {
    const supports = this.getNormalizedDocumentSupports(storedValue);
    const definitions = getDocumentDefinitionsByPersonType(personType);
    const items: ExpedienteDocumentItemDto[] = definitions.map((definition) => {
      const versions = supports[definition.key]?.versions ?? [];

      return {
        key: definition.key,
        label: definition.label,
        hint: definition.hint,
        versions: versions.map((version) => ({
          id: version.id,
          fileName: version.fileName,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          uploadedAt: version.uploadedAt,
          uploadedBy: version.uploadedByName ?? 'Equipo interno',
          status: version.status,
          note: version.note,
          downloadUrl: `/api/v1/crm/expedientes/${expedienteId}/document-supports/${definition.key}/${version.id}/file`,
        })),
      };
    });

    const currentStatuses = items.map(
      (item) => item.versions[0]?.status ?? DOCUMENT_SUPPORT_STATUS.PENDING,
    );
    const uploadedCount = items.filter((item) => item.versions.length > 0).length;
    const approvedCount = items.filter(
      (item) => item.versions[0]?.status === DOCUMENT_SUPPORT_STATUS.APPROVED,
    ).length;

    const blockStatus =
      approvedCount === items.length && items.length > 0
        ? 'COMPLETO'
        : currentStatuses.some(
              (status) =>
                status === DOCUMENT_SUPPORT_STATUS.OBSERVED ||
                status === DOCUMENT_SUPPORT_STATUS.REJECTED,
            )
          ? 'OBSERVADO'
          : currentStatuses.some(
                (status) =>
                  status === DOCUMENT_SUPPORT_STATUS.UPLOADED ||
                  status === DOCUMENT_SUPPORT_STATUS.APPROVED,
              )
            ? 'EN_REVISION'
            : 'PENDIENTE';

    return {
      personType: personType ?? null,
      items,
      summary: {
        requiredCount: items.length,
        uploadedCount,
        approvedCount,
        blockStatus,
      },
    };
  }

  /**
   * Algunos usuarios de plataforma pueden autenticarse con `sub` no UUID.
   * Las tablas tenant exigen UUID en columnas operativas (`advisor_id`, `checked_by`).
   * Si el actor actual no cumple, degradamos a `createdBy` del expediente para evitar 500.
   */
  private resolvePersistenceActorId(actorUserId: string, fallbackUserId: string): string {
    if (this.isUuid(actorUserId)) {
      return actorUserId;
    }

    if (this.isUuid(fallbackUserId)) {
      return fallbackUserId;
    }

    throw new BadRequestException({
      code: 'INVALID_ACTOR_ID',
      message:
        'No fue posible resolver un identificador válido del actor para persistir la operación.',
    });
  }

  /**
   * `status_changes.changed_by` es UUID obligatorio, pero en flujos híbridos
   * el `sub` del actor puede llegar no UUID. Para no romper guardados de
   * sección, degradamos a `createdBy` del expediente cuando es válido.
   */
  private resolveStatusChangeActorId(actorUserId: string, fallbackUserId: string): string | null {
    if (this.isUuid(actorUserId)) {
      return actorUserId;
    }

    if (this.isUuid(fallbackUserId)) {
      return fallbackUserId;
    }

    return null;
  }

  private isUuid(value: string | null | undefined): boolean {
    if (!value) {
      return false;
    }

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private resolveDisplayName(
    expediente: Pick<ExpedienteRecord, 'fullName' | 'firstName' | 'lastName' | 'companyName'>,
  ): string | null {
    const fullName = expediente.fullName?.trim();
    if (fullName) {
      return fullName;
    }

    const personName = [expediente.firstName, expediente.lastName]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(' ');

    if (personName) {
      return personName;
    }

    return expediente.companyName?.trim() || null;
  }

  private async resolveActorName(schemaName: string, userId: string): Promise<string | null> {
    if (!this.isUuid(userId)) {
      this.logger.warn(
        `No se pudo resolver actor por id no UUID al registrar actividad de expediente: ${userId}`,
      );
      return null;
    }

    const actor = await this.crmActorReadPort.findById(schemaName, userId);
    return actor?.name ?? null;
  }

  private encryptValue(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }

  private decryptValue(encrypted: string): string {
    return decryptAes256Gcm(encrypted, this.encryptionKey, this.encryptionKeyPrevious);
  }

  private async syncCompleteness(expedienteId: string, schemaName: string): Promise<void> {
    const completeness = await this.completenessCalculator.calculate(expedienteId);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(
        ExpedienteRecord,
        { id: expedienteId },
        {
          completenessCommercial: completeness.commercial,
          completenessLegal: completeness.legal,
          completenessTechnical: completeness.technical,
          completenessOperational: completeness.operational,
        },
      );
    });
  }

  private buildProvisioningReadiness(entity: ExpedienteRecord) {
    const hasOperationalStage =
      entity.status === ExpedienteStatus.INSTALACION_AGENDADA ||
      entity.status === ExpedienteStatus.CLIENTE_ACTIVO;

    const isBlockedByConsent = Boolean(entity.dataConsentRevoked);
    const isBlockedByLegalStatus = isBlockingLegalComplianceStatus(entity.legalComplianceStatus);

    return evaluateProvisioningReadiness({
      expedienteStatus: entity.status,
      subscriberStatus:
        entity.status === ExpedienteStatus.CLIENTE_ACTIVO
          ? SubscriberStatus.ACTIVE
          : hasOperationalStage
            ? SubscriberStatus.PROSPECT
            : null,
      hasPartyOrDocument: Boolean(entity.documentNumberEncrypted || entity.fiscalDocument),
      hasInstallationAddress: Boolean(entity.installationAddress || entity.address),
      hasSiteContact: Boolean(entity.siteContactName && entity.siteContactPhoneEncrypted),
      hasCommercialOffer: Boolean(
        entity.interestedPlanId ||
        (entity.additionalProductIds?.length ?? 0) > 0 ||
        (entity.additionalServiceIds?.length ?? 0) > 0,
      ),
      hasTechnologyDefinition: Boolean(
        entity.availableTechnology ||
        (entity.candidateTechnologies?.length ?? 0) > 0 ||
        entity.feasibility ||
        entity.coverageResult,
      ),
      hasTicketReference: Boolean(entity.ticketId),
      hasWorkOrderReference: Boolean(entity.workOrderId),
      hasAssignedTechnician: Boolean(entity.workOrderId),
      hasMinimumConsent: Boolean(
        !entity.dataConsentRevoked && entity.identityVerified && entity.legalComplianceStatus,
      ),
      isBlocked: isBlockedByConsent || isBlockedByLegalStatus || !hasOperationalStage,
      blockedReason: isBlockedByConsent
        ? 'El consentimiento de datos está revocado para este expediente.'
        : isBlockedByLegalStatus
          ? 'El estado legal del expediente bloquea la preparación para aprovisionamiento.'
          : !hasOperationalStage
            ? 'El expediente aún no está en instalación agendada.'
            : null,
      hasRetryableError: false,
      retryableErrorMessage: null,
    });
  }

  private async emitPipelineEventSafely(
    eventName: string,
    payload:
      | ExpedienteReadyForInstallationEvent
      | ExpedienteInstallationScheduledEvent
      | ExpedienteActivatedEvent
      | ExpedienteDiscardedEvent,
    expedienteId: string,
  ): Promise<void> {
    try {
      await this.eventEmitter.emitAsync(eventName, payload);
    } catch (error) {
      this.logger.warn(
        `[PIPELINE_EVENT] Falló emisión ${eventName} para expediente ${expedienteId}: ${String(error)}`,
      );
    }
  }

  private async persistStatusChangeSafely(params: {
    schemaName: string;
    tenantId: string;
    expedienteId: string;
    fromStatus: ExpedienteStatus;
    toStatus: ExpedienteStatus;
    changedAt: Date;
    changedBy: string | null;
    actorName: string | null;
    reason: string | null;
    contextLabel: 'TRANSITION' | 'REACTIVATE';
  }): Promise<void> {
    if (!params.changedBy) {
      this.logger.warn(
        `[${params.contextLabel}] Se omite status_change para expediente ${params.expedienteId} porque no hay actor UUID persistible.`,
      );
      return;
    }

    const changedBy = params.changedBy;

    try {
      await runInTenantSchema(this.dataSource, params.schemaName, async (qr) => {
        const statusChangePayload = {
          tenantId: params.tenantId,
          expedienteId: params.expedienteId,
          fromStatus: params.fromStatus,
          toStatus: params.toStatus,
          changedAt: params.changedAt,
          changedBy,
          actorName: params.actorName,
          reason: params.reason,
        };

        const statusChangeEntity =
          typeof qr.manager.create === 'function'
            ? qr.manager.create(StatusChange, statusChangePayload)
            : statusChangePayload;
        await qr.manager.save(StatusChange, statusChangeEntity as StatusChange);
      });
    } catch (error) {
      // No bloquear la operación de negocio por fallos en trazabilidad histórica.
      this.logger.warn(
        `[${params.contextLabel}] Falló persistencia de status_change para expediente ${params.expedienteId}: ${String(error)}`,
      );
    }
  }

  private calculatePipelineProgress(completeness: { overall: number }): number {
    return completeness.overall;
  }
}
