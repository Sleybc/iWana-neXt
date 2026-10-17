import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { clampPage } from '../../../common/pagination/clamp-page';
import { clampLimit } from '../../../common/pagination/clamp-limit';
import { applySort } from '../../../common/pagination/apply-sort';
import { buildPageMeta } from '../../../common/pagination/build-page-meta';
import { hashDocumentNumber } from '../../../common/crypto/hash-document.util';
import { hashEmail } from '../../../common/crypto/hash-email.util';
import { hmacPii, resolvePiiHashKey } from '../../../common/crypto/pii-hash-key.util';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  DocumentType,
  ExpedienteStatus,
  AuditAction,
  ConsentChannel,
  DocumentTypeParty,
  PartyContactType,
  PartyRoleType,
  PartyType,
  ConsentStatus,
  ConsentType,
  VatResponsibility,
  RUT_RESPONSIBILITIES,
  type DataPurpose,
  type DataAuthorizationView,
  type PrivacyMark,
  type RequestSummary,
  type RutResponsibility,
} from '@iwana/shared';
import { Subscriber } from './entities/subscriber.entity';
import { hasRealContact } from './subscriber-contact.util';
import { VatTreatmentService } from './vat-treatment.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { AuditService } from '../../audit/audit.service';
import {
  decryptAes256Gcm,
  encryptAes256Gcm,
  loadPiiAesGcmKeyPair,
} from '../../../common/crypto/aes-gcm.util';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { ConsentRecord } from '../expedientes/entities/consent-record-v2.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { IPartyWritePort } from '../../parties/ports/party-write.port';
import { IPartyReadPort } from '../../parties/ports/party-read.port';
import { IPrivacyAuthorizationWritePort } from '../../privacy/ports/privacy-authorization-write.port';
import { IPrivacyAuthorizationReadPort } from '../../privacy/ports/privacy-authorization-read.port';
import { IPrivacyLegalTextReadPort } from '../../privacy/ports/privacy-legal-text-read.port';
import { IPrivacyMarksReadPort } from '../../privacy/ports/privacy-marks-read.port';
import { IPrivacyRequestsReadPort } from '../../privacy/requests/ports/privacy-requests-read.port';
import {
  calculateNitVerificationDigit,
  parseExpedienteNit,
} from '../../../common/crypto/nit-verification-digit.util';
import {
  evaluateProvisioningReadiness,
  isBlockingLegalComplianceStatus,
  type ProvisioningReadinessSummary,
} from '../provisioning-readiness';

const SUBSCRIBER_SECTION_SCHEMAS = {
  identification: z
    .object({
      documentType: z.string().optional(),
      documentNumber: z.string().min(3).max(50).optional(),
      firstName: z.string().min(1).max(300).optional(),
      lastName: z.string().min(1).max(300).optional(),
      birthDate: z.string().optional(),
      nit: z.string().min(5).max(20).optional(),
      nitVerificationDigit: z.string().max(1).optional(),
      businessName: z.string().min(1).max(300).optional(),
      commercialName: z.string().max(300).optional(),
      legalRepresentative: z
        .object({
          fullName: z.string().min(1).max(300),
          documentType: z.nativeEnum(DocumentType),
          documentNumber: z.string().min(3).max(50),
        })
        .strict()
        .optional(),
      vatResponsibility: z.nativeEnum(VatResponsibility).optional(),
      rutResponsibilities: z.array(z.enum(RUT_RESPONSIBILITIES)).optional(),
    })
    .strict(),
  contact: z
    .object({
      email: z.string().email().max(500).optional(),
      phone: z.string().min(5).max(100).optional(),
      altContactName: z.string().max(160).optional(),
      altContactPhone: z.string().max(100).optional(),
      whatsapp: z.string().max(50).optional(),
    })
    .strict(),
  location: z
    .object({
      address: z.string().min(1).max(500).optional(),
      neighborhood: z.string().max(100).optional(),
      city: z.string().max(50).optional(),
      department: z.string().max(50).optional(),
      postalCode: z.string().max(20).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      coverageNodeId: z.string().uuid().optional(),
    })
    .strict(),
  segmentFiscal: z
    .object({
      personType: z.nativeEnum(PersonType).optional(),
      customerSegment: z.nativeEnum(CustomerSegment).optional(),
      stratum: z.number().int().min(1).max(6).nullable().optional(),
    })
    .strict(),
  services: z
    .object({
      externalId: z.string().max(160).optional(),
    })
    .strict(),
  compliance: z
    .object({
      manualOverrideReason: z.string().min(10).max(500).nullable().optional(),
    })
    .strict(),
} as const;

/**
 * Servicio CRUD del suscriptor con cifrado PII, búsqueda determinista
 * y cálculo automático de tratamiento IVA.
 */

/**
 * Campos ordenables del recurso Subscriber.
 * Vacío hasta Ola 2 (creación de índices compuestos).
 * ADR-065 Ola 1.
 */
const SORTABLE_FIELDS: string[] = [];

function isConsentChannel(value: string): value is ConsentChannel {
  return Object.values(ConsentChannel).includes(value as ConsentChannel);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class SubscribersService {
  private readonly encryptionKey: Buffer;
  private readonly encryptionKeyPrevious: Buffer[];
  private readonly piiHashKey: Buffer;
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly vatTreatmentService: VatTreatmentService,
    private readonly statusTransitionService: SubscriberStatusTransitionService,
    private readonly auditService: AuditService,
    private readonly partyWritePort: IPartyWritePort,
    @Optional()
    @Inject(IPrivacyAuthorizationWritePort)
    private readonly privacyAuthorizationWritePort?: IPrivacyAuthorizationWritePort,
    @Optional()
    @Inject(IPrivacyAuthorizationReadPort)
    private readonly privacyAuthorizationReadPort?: IPrivacyAuthorizationReadPort,
    @Optional()
    @Inject(IPrivacyLegalTextReadPort)
    private readonly privacyLegalTextReadPort?: IPrivacyLegalTextReadPort,
    @Optional()
    @Inject(IPrivacyMarksReadPort)
    private readonly privacyMarksReadPort?: IPrivacyMarksReadPort,
    @Optional()
    @Inject(IPrivacyRequestsReadPort)
    private readonly privacyRequestsReadPort?: IPrivacyRequestsReadPort,
    @Optional()
    @Inject(IPartyReadPort)
    private readonly partyReadPort?: IPartyReadPort,
  ) {
    const keys = loadPiiAesGcmKeyPair(this.configService);
    this.encryptionKey = keys.activeKey;
    this.encryptionKeyPrevious = keys.previousKey;
    this.piiHashKey = resolvePiiHashKey(this.configService);
  }

  // ── CRUD ──

  /**
   * Crear un suscriptor con cifrado PII y cálculo automático de IVA.
   */
  async create(
    dto: {
      personType: PersonType;
      customerSegment: CustomerSegment;
      // Persona natural
      documentType?: string | undefined;
      documentNumber?: string | undefined;
      firstName?: string | undefined;
      lastName?: string | undefined;
      stratum?: number | null | undefined;
      birthDate?: string | undefined;
      // Persona jurídica
      nit?: string | undefined;
      nitVerificationDigit?: string | undefined;
      businessName?: string | undefined;
      commercialName?: string | undefined;
      legalRepresentative?:
        | { fullName: string; documentType: DocumentType; documentNumber: string }
        | undefined;
      vatResponsibility?: VatResponsibility | null | undefined;
      rutResponsibilities?: RutResponsibility[] | undefined;
      // Compartido
      email?: string | undefined;
      phone?: string | undefined;
      altContactName?: string | undefined;
      altContactPhone?: string | undefined;
      whatsapp?: string | undefined;
      address: string;
      neighborhood?: string | undefined;
      city?: string | undefined;
      department?: string | undefined;
      postalCode?: string | undefined;
      latitude?: number | undefined;
      longitude?: number | undefined;
      coverageNodeId?: string | undefined;
      externalId?: string | undefined;
      expedienteId?: string | undefined;
      manualOverrideReason?: string | undefined;
      initialStatus?: SubscriberStatus | undefined;
      convertedAt?: Date | undefined;
      activatedAt?: Date | undefined;
      // Vínculo a Party (MOD08 — ADR-030 F4/F5)
      partyId?: string | null | undefined;
      /** Identidad entregada por la conversión; no forma parte del contrato HTTP. */
      partyDocumentNumber?: string | undefined;
      partyDocumentType?: DocumentTypeParty | undefined;
      authorizationChannel?: ConsentChannel | undefined;
      authorizations?: Array<{
        purpose: DataPurpose;
        granted: boolean;
        legalTextId: string;
      }>;
    },
    actorId: string,
    requestContext: { ip: string | null; userAgent: string | null } = {
      ip: null,
      userAgent: null,
    },
  ): Promise<Subscriber> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const isConversion = Boolean(dto.expedienteId && dto.convertedAt);
    if (!isConversion && !dto.email && !dto.phone) {
      throw new UnprocessableEntityException({
        code: 'SUBSCRIBER_CONTACT_REQUIRED',
        message: 'Registra al menos un teléfono o un correo.',
      });
    }
    if (!isConversion && dto.authorizations?.length && !dto.authorizationChannel) {
      throw new BadRequestException('Debe indicar el medio de las autorizaciones del alta.');
    }
    if (
      !isConversion &&
      !dto.authorizations?.some(
        (authorization) =>
          authorization.purpose === 'TRATAMIENTO_CONTRACTUAL' && authorization.granted,
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED',
        message: 'Se requiere autorización vigente para el tratamiento contractual.',
      });
    }

    if (!isConversion && (!dto.vatResponsibility || !dto.rutResponsibilities?.length)) {
      throw new BadRequestException({
        code: 'SUBSCRIBER_FISCAL_DATA_REQUIRED',
        message:
          'El alta manual requiere responsabilidad de IVA y al menos una responsabilidad del RUT.',
      });
    }
    if (
      !isConversion &&
      dto.rutResponsibilities &&
      new Set(dto.rutResponsibilities).size !== dto.rutResponsibilities.length
    ) {
      throw new BadRequestException('No repitas responsabilidades del RUT.');
    }

    // Calcular tratamiento IVA y régimen tributario
    const { vatTreatment } = this.vatTreatmentService.applyTaxFields(
      dto.personType,
      dto.stratum ?? null,
      dto.customerSegment,
    );

    // Cifrar PII
    const emailEncrypted = dto.email ? this.encryptValue(dto.email) : null;
    const phoneEncrypted = dto.phone ? this.encryptValue(dto.phone) : null;
    const altContactPhoneEncrypted = dto.altContactPhone
      ? this.encryptValue(dto.altContactPhone)
      : null;
    const parsedNit = dto.nit ? parseExpedienteNit(dto.nit) : null;
    const nit = parsedNit?.nit ?? dto.nit ?? null;
    const nitVerificationDigit = parsedNit?.verificationDigit ?? dto.nitVerificationDigit ?? null;
    if (
      parsedNit?.verificationDigit &&
      dto.nitVerificationDigit &&
      parsedNit.verificationDigit !== dto.nitVerificationDigit
    ) {
      throw new BadRequestException('El dígito de verificación del NIT no coincide.');
    }
    if (
      !isConversion &&
      dto.personType === PersonType.JURIDICA &&
      (!nit || !nitVerificationDigit)
    ) {
      throw new BadRequestException('El NIT y su dígito de verificación son obligatorios.');
    }
    if (!isConversion && dto.personType === PersonType.JURIDICA && !dto.legalRepresentative) {
      throw new BadRequestException('El representante legal es obligatorio para persona jurídica.');
    }
    if (
      nit &&
      nitVerificationDigit &&
      calculateNitVerificationDigit(nit) !== nitVerificationDigit
    ) {
      throw new BadRequestException('El dígito de verificación del NIT no coincide.');
    }

    const documentNumberEncrypted = dto.documentNumber
      ? this.encryptValue(dto.documentNumber)
      : null;

    // Hash determinista para búsqueda por documento/email/teléfono (migración 014)
    const documentNumberHash = dto.documentNumber
      ? hashDocumentNumber(dto.documentNumber, this.piiHashKey)
      : null;
    const emailHash = dto.email ? hashEmail(dto.email, this.piiHashKey) : null;
    const phoneHash = dto.phone ? this.hmacPhoneHash(dto.phone) : null;
    const normalizedManualReason = dto.manualOverrideReason?.trim();

    if (normalizedManualReason && normalizedManualReason.length < 10) {
      throw new BadRequestException(
        'manualOverrideReason debe tener al menos 10 caracteres para el alta manual.',
      );
    }

    const entity = new Subscriber();
    entity.tenantId = tenantId;
    entity.personType = dto.personType;
    entity.customerSegment = dto.customerSegment;
    entity.documentType = (dto.documentType as DocumentType | undefined) ?? null;
    entity.documentNumberEncrypted = documentNumberEncrypted;
    entity.documentNumberHash = documentNumberHash;
    entity.emailHash = emailHash;
    entity.phoneHash = phoneHash;
    entity.firstName = dto.firstName ?? null;
    entity.lastName = dto.lastName ?? null;
    entity.stratum = dto.stratum ?? null;
    entity.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    entity.nit = nit;
    entity.nitVerificationDigit = nitVerificationDigit;
    entity.businessName = dto.businessName ?? null;
    entity.commercialName = dto.commercialName ?? null;
    entity.legalRepresentativeId = null;
    entity.legalRepresentativePartyId = null;
    entity.emailEncrypted = emailEncrypted;
    entity.phoneEncrypted = phoneEncrypted;
    entity.altContactName = dto.altContactName ?? null;
    entity.altContactPhoneEncrypted = altContactPhoneEncrypted;
    entity.whatsapp = null;
    entity.whatsappEncrypted = dto.whatsapp ? this.encryptValue(dto.whatsapp) : null;
    entity.whatsappHmac = dto.whatsapp ? this.hmacPhoneHash(dto.whatsapp.trim()) : null;
    entity.vatTreatment = vatTreatment;
    entity.vatResponsibility = dto.vatResponsibility ?? null;
    entity.rutResponsibilities = dto.rutResponsibilities ?? [];
    entity.address = dto.address;
    entity.neighborhood = dto.neighborhood ?? null;
    entity.city = dto.city ?? null;
    entity.department = dto.department ?? null;
    entity.postalCode = dto.postalCode ?? null;
    entity.latitude = dto.latitude ?? null;
    entity.longitude = dto.longitude ?? null;
    entity.coverageNodeId = dto.coverageNodeId ?? null;
    entity.expedienteId = dto.expedienteId ?? null;
    entity.convertedAt = dto.convertedAt ?? null;
    entity.activatedAt = dto.activatedAt ?? null;
    entity.manualOverrideReason = normalizedManualReason ?? null;
    entity.status = dto.initialStatus ?? SubscriberStatus.LEAD;
    entity.externalId = dto.externalId ?? null;
    entity.createdBy = actorId;
    // Vínculo a Party (MOD08 — ADR-030)
    entity.partyId = dto.partyId ?? null;

    let saved: Subscriber;
    try {
      saved = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const partyDocumentNumber =
          dto.partyDocumentNumber ??
          (dto.personType === PersonType.JURIDICA ? nit : dto.documentNumber);
        if (partyDocumentNumber) {
          const documentType =
            dto.partyDocumentType ?? this.toPartyDocumentType(dto.documentType, dto.personType);
          const displayName =
            dto.personType === PersonType.JURIDICA
              ? (dto.businessName ?? dto.commercialName ?? 'Sin nombre')
              : [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
          const party = await this.partyWritePort.ensurePartyWithRole(
            {
              partyType:
                dto.personType === PersonType.NATURAL ? PartyType.NATURAL : PartyType.ORGANIZATION,
              documentType,
              documentNumber: partyDocumentNumber,
              displayName: displayName.slice(0, 160),
              legalName:
                dto.personType === PersonType.JURIDICA
                  ? (dto.businessName ?? null)
                  : [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() || null,
              contacts: [
                ...(dto.email
                  ? [{ type: PartyContactType.EMAIL, value: dto.email, isPrimary: true }]
                  : []),
                ...(dto.phone
                  ? [{ type: PartyContactType.PHONE, value: dto.phone, isPrimary: true }]
                  : []),
              ],
              address: dto.address,
              city: dto.city ?? null,
              department: dto.department ?? null,
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
            },
            PartyRoleType.CUSTOMER,
            { manager: qr.manager, actorUserId: actorId },
          );
          entity.partyId = party.partyId;
        }

        if (!entity.partyId) {
          throw new UnprocessableEntityException({
            code: 'SUBSCRIBER_PARTY_REQUIRED',
            message: 'No fue posible vincular el suscriptor con su titular.',
          });
        }
        const partyId = entity.partyId;

        if (!isConversion && dto.personType === PersonType.JURIDICA && dto.legalRepresentative) {
          const representativeName = dto.legalRepresentative.fullName.trim();
          const representative = await this.partyWritePort.ensurePartyWithRole(
            {
              partyType: PartyType.NATURAL,
              documentType: this.toPartyDocumentType(
                dto.legalRepresentative.documentType,
                PersonType.NATURAL,
              ),
              documentNumber: dto.legalRepresentative.documentNumber,
              displayName: representativeName.slice(0, 160),
              legalName: representativeName,
            },
            PartyRoleType.LEGAL_REPRESENTATIVE,
            { manager: qr.manager, actorUserId: actorId },
          );
          entity.legalRepresentativePartyId = representative.partyId;
          entity.legalRepresentativeDisplayName = representative.identity.displayName;
        }

        const authorizationWriter = this.requireAuthorizationWriter();
        if (isConversion && dto.expedienteId) {
          await qr.manager.findOne(ExpedienteRecord, {
            where: { id: dto.expedienteId },
            lock: { mode: 'pessimistic_write' },
          });
          const sourceConsents = await qr.manager.find(ConsentRecord, {
            where: { expedienteId: dto.expedienteId },
            order: { obtainedAt: 'ASC', id: 'ASC' },
          });
          const timeline: Array<{ purpose: DataPurpose; granted: boolean; at: Date }> = [];
          for (const consent of sourceConsents) {
            const purpose = this.mapConsentPurpose(consent.consentType);
            const revokedAt =
              consent.revokedAt ??
              (consent.status === ConsentStatus.REVOCADO ? consent.updatedAt : null);
            const accepted =
              consent.status === ConsentStatus.ACEPTADO ||
              consent.status === ConsentStatus.REVOCADO ||
              consent.legacyAccepted === true ||
              revokedAt !== null;
            const legalText = await this.findConsentLegalText(consent.legalTextVersion);
            const initialGranted = accepted;
            const recordSourceConsent = (granted: boolean, capturedAt: Date, sourceRef: string) => {
              const input = {
                partyId,
                purpose,
                granted,
                legalTextId: legalText?.id ?? null,
                capturedAt: capturedAt.toISOString(),
                sourceRef,
                actorId,
              };
              const context = {
                ip: consent.ipAddress,
                userAgent: null,
                manager: qr.manager,
              };

              if (!legalText || !isConsentChannel(consent.channel)) {
                return authorizationWriter.record(
                  { ...input, kind: 'LEGACY_IMPORT', channel: consent.channel },
                  context,
                );
              }

              return authorizationWriter.record(
                {
                  ...input,
                  kind: granted ? 'GRANT' : 'REVOCATION',
                  channel: consent.channel,
                },
                context,
              );
            };

            await recordSourceConsent(
              initialGranted,
              consent.obtainedAt,
              `consent_records:${consent.id}`,
            );
            timeline.push({ purpose, granted: initialGranted, at: consent.obtainedAt });

            if (revokedAt) {
              await recordSourceConsent(
                false,
                revokedAt,
                `consent_records:${consent.id}:revocation`,
              );
              timeline.push({ purpose, granted: false, at: revokedAt });
            }
          }

          const latestTreatment = timeline
            .filter((item) => item.purpose === 'TRATAMIENTO_CONTRACTUAL')
            .sort((left, right) => right.at.getTime() - left.at.getTime())[0];
          if (!latestTreatment?.granted) {
            throw new UnprocessableEntityException({
              code: 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED',
              message: 'El expediente no tiene autorización vigente para tratamiento contractual.',
            });
          }
        } else {
          const authorizationChannel = dto.authorizationChannel;
          if (dto.authorizations?.length && !authorizationChannel) {
            throw new BadRequestException('Debe indicar el medio de las autorizaciones del alta.');
          }
          for (const authorization of dto.authorizations ?? []) {
            await authorizationWriter.record(
              {
                partyId: entity.partyId,
                purpose: authorization.purpose,
                granted: authorization.granted,
                channel: authorizationChannel!,
                legalTextId: authorization.legalTextId,
                actorId,
              },
              {
                ip: requestContext.ip,
                userAgent: requestContext.userAgent,
                manager: qr.manager,
              },
            );
          }
        }

        return qr.manager.save(Subscriber, entity);
      });
    } catch (error) {
      if (dto.expedienteId && this.isExpedienteUniqueViolation(error)) {
        const existing = await this.findByExpedienteId(dto.expedienteId);
        if (existing) return this.decryptSubscriberFields(existing);
      }
      throw error;
    }

    this.logger.log(`Suscriptor creado: ${saved.id} [${dto.personType}/${dto.customerSegment}]`);

    // Registro de auditoría — sin PII en texto plano
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'Subscriber',
      entityId: saved.id,
      userId: actorId,
      newValue: {
        personType: dto.personType,
        customerSegment: dto.customerSegment,
        vatTreatment,
        status: entity.status,
        expedienteId: entity.expedienteId,
        convertedAt: entity.convertedAt,
        activatedAt: entity.activatedAt,
        manualOverride: Boolean(entity.manualOverrideReason),
      },
    });

    return this.findById(saved.id);
  }

  /**
   * Listar suscriptores con filtros y paginación.
   */
  async findAll(filters: {
    status?: SubscriberStatus | undefined;
    personType?: PersonType | undefined;
    customerSegment?: CustomerSegment | undefined;
    stratum?: number | undefined;
    search?: string | undefined;
    excludeBlocked?: boolean | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    sortBy?: string | undefined;
    sortDir?: 'asc' | 'desc' | undefined;
  }): Promise<{
    data: Array<Subscriber & { privacyMarks: PrivacyMark[] }>;
    total: number;
    meta: ReturnType<typeof buildPageMeta>;
  }> {
    const { schemaName } = TenantContext.getOrThrow();
    // H-1 / D-2: tope de limit 100 antes de clampPage (Ley 1581 — no amplificar extracción PII).
    const cappedLimit = clampLimit(filters.limit);
    const { page, limit } = clampPage(filters.page ?? 1, cappedLimit);
    const blockedPartyIds = filters.excludeBlocked ? await this.getBlockedPartyIds() : [];

    const { data, total, sortResult } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const query = qr.manager.createQueryBuilder(Subscriber, 's');

        if (filters.status) query.andWhere('s.status = :status', { status: filters.status });
        if (filters.personType)
          query.andWhere('s.personType = :personType', { personType: filters.personType });
        if (filters.customerSegment)
          query.andWhere('s.customerSegment = :customerSegment', {
            customerSegment: filters.customerSegment,
          });
        if (filters.stratum) query.andWhere('s.stratum = :stratum', { stratum: filters.stratum });

        // La entrada libre llega por el body POST. Escapamos también el carácter
        // escape para que %, _ y \\ se interpreten literalmente en ILIKE.
        if (filters.search) {
          const searchPattern = `%${escapeLikePattern(filters.search)}%`;
          const escapeClause = String.raw`ESCAPE E'\\'`;
          query.andWhere(
            `(s.firstName ILIKE :search ${escapeClause} OR s.lastName ILIKE :search ${escapeClause} OR s.businessName ILIKE :search ${escapeClause} OR s.nit ILIKE :search ${escapeClause} OR s.commercialName ILIKE :search ${escapeClause})`,
            { search: searchPattern },
          );
        }

        if (blockedPartyIds.length > 0) {
          query.andWhere(
            '(s.partyId IS NULL OR s.partyId <> ALL(CAST(:blockedPartyIds AS uuid[])))',
            {
              blockedPartyIds,
            },
          );
        }

        // Default primero: TypeORM orderBy() reemplaza el ORDER BY acumulado (O-7(b)).
        query.orderBy('s.createdAt', 'DESC').addOrderBy('s.id', 'DESC');
        const sortResult = applySort(query, SORTABLE_FIELDS, filters.sortBy, filters.sortDir);
        query.skip((page - 1) * limit).take(limit);

        const [rows, count] = await query.getManyAndCount();
        return { data: rows, total: count, sortResult };
      },
    );

    // Descifrar PII para respuesta
    const hydratedData = data.map((s) => this.decryptSubscriberFields(s));
    await this.hydrateLegalRepresentativeDisplayNames(hydratedData);
    const marksByParty = await this.privacyMarksReadPort?.activeMarks(
      hydratedData.flatMap((subscriber) => (subscriber.partyId ? [subscriber.partyId] : [])),
    );
    const dataWithMarks = hydratedData.map((subscriber) =>
      Object.assign(subscriber, {
        privacyMarks: subscriber.partyId ? (marksByParty?.[subscriber.partyId] ?? []) : [],
      }),
    );

    return {
      data: dataWithMarks,
      total,
      meta: buildPageMeta({
        total,
        page,
        limit,
        randomAccess: true,
        sortableFields: SORTABLE_FIELDS,
        sortBy: sortResult.appliedSortBy ?? undefined,
        sortDir: sortResult.appliedSortDir ?? undefined,
      }),
    };
  }

  /**
   * Obtener suscriptor por ID con PII descifrado.
   */
  async findById(id: string): Promise<Subscriber> {
    const { schemaName } = TenantContext.getOrThrow();

    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Subscriber, { where: { id } }),
    );

    if (!entity) {
      throw new NotFoundException(`Suscriptor ${id} no encontrado`);
    }

    const hydrated = this.decryptSubscriberFields(entity);
    await this.hydrateLegalRepresentativeDisplayNames([hydrated]);
    return hydrated;
  }

  /**
   * Actualizar suscriptor. Recalcula IVA si cambia personType o stratum.
   */
  async update(
    id: string,
    dto: {
      personType?: PersonType | undefined;
      customerSegment?: CustomerSegment | undefined;
      documentType?: string | undefined;
      documentNumber?: string | undefined;
      firstName?: string | undefined;
      lastName?: string | undefined;
      stratum?: number | null | undefined;
      birthDate?: string | undefined;
      nit?: string | undefined;
      nitVerificationDigit?: string | undefined;
      businessName?: string | undefined;
      commercialName?: string | undefined;
      legalRepresentative?:
        | { fullName: string; documentType: DocumentType; documentNumber: string }
        | undefined;
      vatResponsibility?: VatResponsibility | undefined;
      rutResponsibilities?: RutResponsibility[] | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      altContactName?: string | undefined;
      altContactPhone?: string | undefined;
      whatsapp?: string | undefined;
      address?: string | undefined;
      neighborhood?: string | undefined;
      city?: string | undefined;
      department?: string | undefined;
      postalCode?: string | undefined;
      latitude?: number | undefined;
      longitude?: number | undefined;
      coverageNodeId?: string | undefined;
      externalId?: string | undefined;
      expedienteId?: string | null | undefined;
      manualOverrideReason?: string | null | undefined;
    },
    actorId: string,
  ): Promise<Subscriber> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    const nextEmailEncrypted =
      dto.email === undefined
        ? entity.emailEncrypted
        : dto.email
          ? this.encryptValue(dto.email)
          : null;
    const nextPhoneEncrypted =
      dto.phone === undefined
        ? entity.phoneEncrypted
        : dto.phone
          ? this.encryptValue(dto.phone)
          : null;
    if (
      entity.status === SubscriberStatus.ACTIVE &&
      !hasRealContact({ emailEncrypted: nextEmailEncrypted, phoneEncrypted: nextPhoneEncrypted })
    ) {
      throw new UnprocessableEntityException({
        code: 'SUBSCRIBER_CONTACT_REQUIRED',
        message: 'Un suscriptor activo necesita al menos un teléfono o un correo.',
      });
    }

    // Recalcular IVA si cambia personType o stratum
    const effectivePersonType = dto.personType ?? entity.personType;
    const effectiveStratum = dto.stratum !== undefined ? dto.stratum : entity.stratum;
    const effectiveSegment = dto.customerSegment ?? entity.customerSegment;

    if (dto.personType || dto.stratum !== undefined || dto.customerSegment) {
      const { vatTreatment } = this.vatTreatmentService.applyTaxFields(
        effectivePersonType,
        effectiveStratum,
        effectiveSegment,
      );
      entity.vatTreatment = vatTreatment;
    }

    // Actualizar campos
    if (dto.personType) entity.personType = dto.personType;
    if (dto.customerSegment) entity.customerSegment = dto.customerSegment;
    if (dto.documentType !== undefined)
      entity.documentType = (dto.documentType as DocumentType | undefined) ?? null;
    if (dto.documentNumber !== undefined) {
      entity.documentNumberEncrypted = dto.documentNumber
        ? this.encryptValue(dto.documentNumber)
        : null;
      entity.documentNumberHash = dto.documentNumber
        ? hashDocumentNumber(dto.documentNumber, this.piiHashKey)
        : null;
    }
    if (dto.firstName !== undefined) entity.firstName = dto.firstName;
    if (dto.lastName !== undefined) entity.lastName = dto.lastName;
    if (dto.stratum !== undefined) entity.stratum = dto.stratum;
    if (dto.birthDate !== undefined)
      entity.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.nit !== undefined || dto.nitVerificationDigit !== undefined) {
      const parsedNit = dto.nit !== undefined ? parseExpedienteNit(dto.nit) : null;
      const nextNit = parsedNit?.nit ?? dto.nit ?? entity.nit;
      const nextDigit =
        parsedNit?.verificationDigit ?? dto.nitVerificationDigit ?? entity.nitVerificationDigit;
      if (nextNit && nextDigit && calculateNitVerificationDigit(nextNit) !== nextDigit) {
        throw new BadRequestException('El dígito de verificación del NIT no coincide.');
      }
      entity.nit = nextNit ?? null;
      entity.nitVerificationDigit = nextDigit ?? null;
    }
    if (dto.businessName !== undefined) entity.businessName = dto.businessName;
    if (dto.commercialName !== undefined) entity.commercialName = dto.commercialName;
    if (dto.vatResponsibility !== undefined) entity.vatResponsibility = dto.vatResponsibility;
    if (dto.rutResponsibilities !== undefined) entity.rutResponsibilities = dto.rutResponsibilities;
    if (dto.email !== undefined) {
      entity.emailEncrypted = nextEmailEncrypted;
      entity.emailHash = dto.email ? hashEmail(dto.email, this.piiHashKey) : null;
    }
    if (dto.phone !== undefined) {
      entity.phoneEncrypted = nextPhoneEncrypted;
      entity.phoneHash = dto.phone ? this.hmacPhoneHash(dto.phone) : null;
    }
    if (dto.altContactName !== undefined)
      entity.altContactName = dto.altContactName ? dto.altContactName.trim() : null;
    if (dto.altContactPhone !== undefined)
      entity.altContactPhoneEncrypted = dto.altContactPhone
        ? this.encryptValue(dto.altContactPhone)
        : null;
    if (dto.whatsapp !== undefined) {
      entity.whatsapp = null;
      entity.whatsappEncrypted = dto.whatsapp ? this.encryptValue(dto.whatsapp) : null;
      entity.whatsappHmac = dto.whatsapp ? this.hmacPhoneHash(dto.whatsapp.trim()) : null;
    }
    if (dto.address !== undefined) entity.address = dto.address;
    if (dto.neighborhood !== undefined) entity.neighborhood = dto.neighborhood;
    if (dto.city !== undefined) entity.city = dto.city;
    if (dto.department !== undefined) entity.department = dto.department;
    if (dto.postalCode !== undefined) entity.postalCode = dto.postalCode;
    if (dto.latitude !== undefined) entity.latitude = dto.latitude;
    if (dto.longitude !== undefined) entity.longitude = dto.longitude;
    if (dto.coverageNodeId !== undefined) entity.coverageNodeId = dto.coverageNodeId;
    if (dto.externalId !== undefined) entity.externalId = dto.externalId;
    if (dto.expedienteId !== undefined) entity.expedienteId = dto.expedienteId;
    if (dto.manualOverrideReason !== undefined) {
      const normalizedReason = dto.manualOverrideReason?.trim() || null;
      if (normalizedReason && normalizedReason.length < 10) {
        throw new BadRequestException(
          'manualOverrideReason debe tener al menos 10 caracteres para el alta manual.',
        );
      }
      entity.manualOverrideReason = normalizedReason;
    }

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      if (dto.legalRepresentative) {
        if (effectivePersonType !== PersonType.JURIDICA) {
          throw new BadRequestException('El representante legal solo aplica a persona jurídica.');
        }
        const representativeName = dto.legalRepresentative.fullName.trim();
        const representative = await this.partyWritePort.ensurePartyWithRole(
          {
            partyType: PartyType.NATURAL,
            documentType: this.toPartyDocumentType(
              dto.legalRepresentative.documentType,
              PersonType.NATURAL,
            ),
            documentNumber: dto.legalRepresentative.documentNumber,
            displayName: representativeName.slice(0, 160),
            legalName: representativeName,
          },
          PartyRoleType.LEGAL_REPRESENTATIVE,
          { manager: qr.manager, actorUserId: actorId },
        );
        entity.legalRepresentativePartyId = representative.partyId;
        entity.legalRepresentativeDisplayName = representative.identity.displayName;
      }
      await qr.manager.save(Subscriber, entity);
    });

    this.logger.log(`Suscriptor actualizado: ${id} [actor: ${actorId}]`);

    // Registro de auditoría — diff de campos modificados, sin PII
    // Solo se conservan nombres de campos; el contenido previo/nuevo puede ser PII.
    const diff = { changedFields: Object.keys(dto).sort() };
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Subscriber',
      entityId: id,
      userId: actorId,
      newValue: diff,
      isDiff: true,
    });

    return this.findById(id);
  }

  /**
   * Soft delete de suscriptor.
   */
  async remove(id: string, actorId: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    const entity = await this.findById(id);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.softRemove(Subscriber, entity);
    });

    this.logger.log(`Suscriptor eliminado (soft): ${id} [actor: ${actorId}]`);

    // Registro de auditoría — sin PII
    await this.auditService.log({
      action: AuditAction.DELETE,
      entityType: 'Subscriber',
      entityId: id,
      userId: actorId,
      newValue: {
        personType: entity.personType,
        customerSegment: entity.customerSegment,
        status: entity.status,
      },
    });
  }

  /**
   * Transición de estado del suscriptor.
   */
  async transitionStatus(
    id: string,
    targetStatus: SubscriberStatus,
    reason: string | null,
    actorId: string,
  ): Promise<Subscriber> {
    const result = await this.statusTransitionService.transition(id, targetStatus, reason, actorId);
    return this.findById(id);
  }

  /**
   * Búsqueda determinista por documento, NIT, email o teléfono.
   * Usa columnas HMAC-SHA-256 (`*_hmac`, SEC-P1 / migraciones 108–109).
   */
  async search(query: {
    documentNumber?: string | undefined;
    nit?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
    excludeBlocked?: boolean | undefined;
  }): Promise<Subscriber[]> {
    const { schemaName } = TenantContext.getOrThrow();
    const blockedPartyIds = query.excludeBlocked ? await this.getBlockedPartyIds() : [];

    const results = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager.createQueryBuilder(Subscriber, 's');

      const conditions: string[] = [];
      const params: Record<string, string> = {};

      // Búsqueda por HMAC (columnas *_hmac)
      if (query.documentNumber) {
        conditions.push('s.documentNumberHash = :docHash');
        params.docHash = hashDocumentNumber(query.documentNumber, this.piiHashKey);
      }

      if (query.nit) {
        conditions.push('s.nit = :nit');
        params.nit = query.nit;
      }

      if (query.email) {
        conditions.push('s.emailHash = :emailHash');
        params.emailHash = hashEmail(query.email, this.piiHashKey);
      }

      if (query.phone) {
        conditions.push('s.phoneHash = :phoneHash');
        params.phoneHash = this.hmacPhoneHash(query.phone);
      }

      if (conditions.length === 0) {
        return [];
      }

      qb.where(conditions.join(' AND '), params);
      if (blockedPartyIds.length > 0) {
        qb.andWhere('(s.partyId IS NULL OR s.partyId <> ALL(CAST(:blockedPartyIds AS uuid[])))', {
          blockedPartyIds,
        });
      }
      const results = await qb.take(100).getMany();
      return results;
    });

    const hydrated = results.map((subscriber) => this.decryptSubscriberFields(subscriber));
    const marksByParty = await this.privacyMarksReadPort?.activeMarks(
      hydrated.flatMap((subscriber) => (subscriber.partyId ? [subscriber.partyId] : [])),
    );
    return hydrated.map((subscriber) =>
      Object.assign(subscriber, {
        privacyMarks: subscriber.partyId ? (marksByParty?.[subscriber.partyId] ?? []) : [],
      }),
    );
  }

  private async getBlockedPartyIds(): Promise<string[]> {
    if (!this.privacyMarksReadPort) {
      throw new ServiceUnavailableException({
        code: 'PRIVACY_MARKS_UNAVAILABLE',
        message: 'No se pudo aplicar la protección de privacidad a la búsqueda.',
      });
    }
    return this.privacyMarksReadPort.partyIdsWithActiveMark('DATOS_BLOQUEADOS');
  }

  private async hydrateLegalRepresentativeDisplayNames(subscribers: Subscriber[]): Promise<void> {
    const partyIds = [
      ...new Set(
        subscribers.flatMap((subscriber) =>
          subscriber.legalRepresentativePartyId ? [subscriber.legalRepresentativePartyId] : [],
        ),
      ),
    ];
    if (partyIds.length === 0) {
      subscribers.forEach((subscriber) => (subscriber.legalRepresentativeDisplayName = null));
      return;
    }

    const parties = this.partyReadPort ? await this.partyReadPort.getByIds(partyIds) : [];
    const displayNames = new Map(parties.map((party) => [party.id, party.displayName]));
    for (const subscriber of subscribers) {
      subscriber.legalRepresentativeDisplayName = subscriber.legalRepresentativePartyId
        ? (displayNames.get(subscriber.legalRepresentativePartyId) ?? null)
        : null;
    }
  }

  /**
   * Crear suscriptor PROSPECT a partir de un expediente en LISTO_PARA_INSTALACION.
   * Invocado por SubscriberCreationService.
   *
   * Paso 5 — Guard: requiere partyId válido (ADR-030 F5).
   * Un Subscriber siempre debe tener un Party asociado al crearse.
   */
  async createFromExpediente(
    expedienteId: string,
    overrides: {
      personType: PersonType;
      customerSegment: CustomerSegment;
      documentType?: string | undefined;
      documentNumber?: string | undefined;
      firstName?: string | undefined;
      lastName?: string | undefined;
      stratum?: number | null | undefined;
      businessName?: string | undefined;
      nit?: string | undefined;
      nitVerificationDigit?: string | undefined;
      email?: string | null | undefined;
      phone?: string | null | undefined;
      altContactName?: string | undefined;
      altContactPhone?: string | undefined;
      address: string;
      city?: string | undefined;
      department?: string | undefined;
      neighborhood?: string | undefined;
      postalCode?: string | undefined;
      latitude?: number | undefined;
      longitude?: number | undefined;
      // Vínculo obligatorio a Party (MOD08 — ADR-030 F4/F5)
      partyId?: string | null;
      partyDocumentNumber?: string;
      partyDocumentType?: DocumentTypeParty;
    },
    actorId: string,
  ): Promise<Subscriber> {
    const subscriber = await this.create(
      {
        personType: overrides.personType,
        customerSegment: overrides.customerSegment,
        documentType: overrides.documentType,
        documentNumber: overrides.documentNumber,
        firstName: overrides.firstName,
        lastName: overrides.lastName,
        stratum: overrides.stratum,
        businessName: overrides.businessName,
        nit: overrides.nit,
        nitVerificationDigit: overrides.nitVerificationDigit,
        email: overrides.email ?? undefined,
        phone: overrides.phone ?? undefined,
        altContactName: overrides.altContactName,
        altContactPhone: overrides.altContactPhone,
        address: overrides.address,
        city: overrides.city,
        department: overrides.department,
        neighborhood: overrides.neighborhood,
        postalCode: overrides.postalCode,
        latitude: overrides.latitude,
        longitude: overrides.longitude,
        partyDocumentNumber: overrides.partyDocumentNumber,
        partyDocumentType: overrides.partyDocumentType,
        expedienteId,
        initialStatus: SubscriberStatus.PROSPECT,
        convertedAt: new Date(),
      },
      actorId,
    );
    return subscriber;
  }

  async findByExpedienteId(expedienteId: string): Promise<Subscriber | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Subscriber, { where: { expedienteId } }),
    );
  }

  async findSummaryByExpedienteId(
    expedienteId: string,
  ): Promise<{ id: string; status: SubscriberStatus; fullName: string } | null> {
    const { schemaName } = TenantContext.getOrThrow();
    const subscriber = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(Subscriber, {
        where: { expedienteId },
        select: [
          'id',
          'status',
          'firstName',
          'lastName',
          'businessName',
          'commercialName',
          'expedienteId',
        ],
      }),
    );

    if (!subscriber) {
      return null;
    }

    const fullName =
      subscriber.commercialName ||
      subscriber.businessName ||
      [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ').trim() ||
      null;

    if (!fullName) {
      return null;
    }

    return {
      id: subscriber.id,
      status: subscriber.status,
      fullName,
    };
  }

  async activateFromExpediente(expedienteId: string, actorId: string): Promise<Subscriber | null> {
    let subscriber = await this.findByExpedienteId(expedienteId);
    if (!subscriber) {
      return null;
    }

    if (subscriber.status === SubscriberStatus.CANCELLED) {
      await this.statusTransitionService.reactivateFromExpediente(
        subscriber.id,
        expedienteId,
        actorId,
      );
      subscriber = { ...subscriber, status: SubscriberStatus.PROSPECT } as Subscriber;
    }

    if (!hasRealContact(subscriber)) {
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Subscriber',
        entityId: subscriber.id,
        userId: actorId,
        newValue: {
          event: 'ACTIVATION_BLOCKED_CONTACT_PENDING',
          source: 'expediente',
          expedienteId,
          status: subscriber.status,
        },
      });
      return null;
    }

    if (subscriber.status === SubscriberStatus.ACTIVE) return this.findById(subscriber.id);

    if (subscriber.status !== SubscriberStatus.PROSPECT) {
      return null;
    }

    await this.statusTransitionService.transition(
      subscriber.id,
      SubscriberStatus.ACTIVE,
      `Activación automática desde expediente ${expedienteId}`,
      actorId,
    );

    const { schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.update(
        Subscriber,
        { id: subscriber.id },
        {
          activatedAt: new Date(),
        },
      );
    });

    return this.findById(subscriber.id);
  }

  async reactivateProspectFromExpediente(
    expedienteId: string,
    actorId: string,
  ): Promise<Subscriber | null> {
    const subscriber = await this.findByExpedienteId(expedienteId);
    if (!subscriber) return null;
    if (subscriber.status !== SubscriberStatus.CANCELLED) {
      return subscriber.status === SubscriberStatus.PROSPECT
        ? this.decryptSubscriberFields(subscriber)
        : null;
    }

    await this.statusTransitionService.reactivateFromExpediente(
      subscriber.id,
      expedienteId,
      actorId,
    );
    return this.findById(subscriber.id);
  }

  async cancelProspectFromExpediente(
    expedienteId: string,
    reason: string | null,
    actorId: string,
  ): Promise<Subscriber | null> {
    const subscriber = await this.findByExpedienteId(expedienteId);
    if (!subscriber || subscriber.status !== SubscriberStatus.PROSPECT) {
      return null;
    }

    await this.statusTransitionService.transition(
      subscriber.id,
      SubscriberStatus.CANCELLED,
      reason ?? `Cancelación automática por descarte de expediente ${expedienteId}`,
      actorId,
    );

    return this.findById(subscriber.id);
  }

  async get360View(id: string): Promise<{
    subscriber: Subscriber;
    contacts: unknown[];
    contracts: Contract[];
    quotes: unknown[];
    habeasData: DataAuthorizationView[];
    arcoRequests: RequestSummary[];
    privacyMarks: PrivacyMark[];
    expedienteSummary: Record<string, unknown> | null;
    timelineSeed: Array<Record<string, unknown>>;
    provisioningReadiness: ProvisioningReadinessSummary;
  }> {
    const subscriber = await this.findById(id);
    let expedienteSummary: Record<string, unknown> | null = null;
    let expedienteRecord: ExpedienteRecord | null = null;

    if (subscriber.expedienteId) {
      const expedienteId = subscriber.expedienteId;
      const { schemaName } = TenantContext.getOrThrow();
      const expediente = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
        qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } }),
      );

      if (expediente) {
        expedienteRecord = expediente;

        // Compatibilidad con subscribers creados antes de propagar postalCode
        // desde expediente en la conversión automática.
        if (!subscriber.postalCode && expediente.postalCode) {
          subscriber.postalCode = expediente.postalCode;
        }

        expedienteSummary = {
          id: expediente.id,
          fullName: expediente.fullName,
          status: expediente.status,
          source: expediente.source,
          createdAt: expediente.createdAt,
          statusChangedAt: expediente.statusChangedAt,
          paymentMethod: expediente.paymentMethod,
          billingCycle: expediente.billingCycle,
          fiscalName: expediente.fiscalName,
          // Interés comercial capturado durante el proceso CRM
          interestedPlanId: expediente.interestedPlanId,
          additionalProductIds: expediente.additionalProductIds ?? [],
          additionalServiceIds: expediente.additionalServiceIds ?? [],
          commercialNotes: expediente.commercialNotes ?? null,
        };
      }
    }

    // Cargar contratos/servicios contratados del subscriber
    const { schemaName } = TenantContext.getOrThrow();
    const contracts = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(Contract, {
        where: { subscriberId: id },
        order: { createdAt: 'DESC' },
      }),
    );
    let habeasData: DataAuthorizationView[] = [];
    let arcoRequests: RequestSummary[] = [];
    let marksByParty: Record<string, PrivacyMark[]> = {};
    if (subscriber.partyId) {
      [habeasData, arcoRequests, marksByParty] = await Promise.all([
        this.privacyAuthorizationReadPort?.listForParty(subscriber.partyId) ?? Promise.resolve([]),
        this.privacyRequestsReadPort?.listForParty(subscriber.partyId) ?? Promise.resolve([]),
        this.privacyMarksReadPort?.activeMarks([subscriber.partyId]) ?? Promise.resolve({}),
      ]);
    }

    return {
      subscriber,
      contacts: [],
      contracts,
      quotes: [],
      habeasData,
      arcoRequests,
      privacyMarks: subscriber.partyId ? (marksByParty[subscriber.partyId] ?? []) : [],
      expedienteSummary,
      timelineSeed: [
        ...(subscriber.convertedAt
          ? [
              {
                type: 'SUBSCRIBER_CONVERTED',
                occurredAt: subscriber.convertedAt,
                expedienteId: subscriber.expedienteId,
              },
            ]
          : []),
        ...(subscriber.activatedAt
          ? [
              {
                type: 'SUBSCRIBER_ACTIVATED',
                occurredAt: subscriber.activatedAt,
                expedienteId: subscriber.expedienteId,
              },
            ]
          : []),
      ],
      provisioningReadiness: this.buildProvisioningReadiness(subscriber, expedienteRecord),
    };
  }

  private buildProvisioningReadiness(
    subscriber: Subscriber,
    expediente: ExpedienteRecord | null,
  ): ProvisioningReadinessSummary {
    const hasSubscriberLink = Boolean(subscriber.expedienteId);
    const hasPartyOrDocument = Boolean(
      subscriber.partyId || subscriber.documentNumberEncrypted || subscriber.nit,
    );

    const hasInstallationAddress = Boolean(
      expediente?.installationAddress?.trim() || subscriber.address?.trim(),
    );

    const hasSiteContact = Boolean(
      (expediente?.siteContactName?.trim() && expediente?.siteContactPhoneEncrypted) ||
      subscriber.phoneEncrypted,
    );

    const hasCommercialOffer = Boolean(
      expediente?.interestedPlanId ||
      (expediente?.additionalProductIds?.length ?? 0) > 0 ||
      (expediente?.additionalServiceIds?.length ?? 0) > 0,
    );

    const hasTechnologyDefinition = Boolean(
      expediente?.availableTechnology ||
      (expediente?.candidateTechnologies?.length ?? 0) > 0 ||
      expediente?.feasibility ||
      expediente?.coverageResult,
    );

    const hasTicketReference = Boolean(expediente?.ticketId);
    const hasWorkOrderReference = Boolean(expediente?.workOrderId);
    const hasAssignedTechnician = hasWorkOrderReference;

    const hasMinimumConsent = Boolean(
      expediente &&
      !expediente.dataConsentRevoked &&
      expediente.identityVerified?.trim() &&
      expediente.legalComplianceStatus?.trim(),
    );

    const isBlockedByConsent = Boolean(expediente?.dataConsentRevoked);
    const isBlockedByLegalStatus = isBlockingLegalComplianceStatus(
      expediente?.legalComplianceStatus ?? null,
    );

    const blockedReason = isBlockedByConsent
      ? 'El consentimiento de datos está revocado para este expediente.'
      : isBlockedByLegalStatus
        ? 'El estado legal del expediente bloquea la preparación para aprovisionamiento.'
        : null;

    const hasRetryableError = hasSubscriberLink && !expediente;
    const retryableErrorMessage = hasRetryableError
      ? 'El subscriber está vinculado a un expediente que no se pudo sincronizar. Reintenta la lectura.'
      : null;

    return evaluateProvisioningReadiness({
      expedienteStatus: (expediente?.status as ExpedienteStatus | null) ?? null,
      subscriberStatus: subscriber.status,
      hasPartyOrDocument,
      hasInstallationAddress,
      hasSiteContact,
      hasCommercialOffer,
      hasTechnologyDefinition,
      hasTicketReference,
      hasWorkOrderReference,
      hasAssignedTechnician,
      hasMinimumConsent,
      isBlocked: isBlockedByConsent || isBlockedByLegalStatus || !hasSubscriberLink,
      blockedReason:
        blockedReason ??
        (!hasSubscriberLink ? 'El subscriber no está vinculado a expediente.' : null),
      hasRetryableError,
      retryableErrorMessage,
    });
  }

  async updateSection(
    id: string,
    section: string,
    payload: Record<string, unknown>,
    actorId: string,
  ): Promise<Subscriber> {
    const schema =
      SUBSCRIBER_SECTION_SCHEMAS[section as keyof typeof SUBSCRIBER_SECTION_SCHEMAS] ?? null;

    if (!schema) {
      throw new BadRequestException(`Sección de subscriber no válida: ${section}`);
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_SUBSCRIBER_SECTION_PAYLOAD',
        section,
        errors: parsed.error.flatten(),
      });
    }

    const updated = await this.update(id, parsed.data, actorId);
    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'Subscriber',
      entityId: id,
      userId: actorId,
      newValue: {
        section,
        changedFields: Object.keys(parsed.data),
      },
    });

    return updated;
  }

  // ── Cifrado PII (mismo patrón que ExpedienteService) ──

  private requireAuthorizationWriter(): IPrivacyAuthorizationWritePort {
    if (!this.privacyAuthorizationWritePort) {
      throw new ServiceUnavailableException('El registro de autorizaciones no está disponible.');
    }
    return this.privacyAuthorizationWritePort;
  }

  private async findConsentLegalText(version: string): Promise<{ id: string } | null> {
    if (!this.privacyLegalTextReadPort) {
      throw new ServiceUnavailableException('La consulta de textos legales no está disponible.');
    }
    return this.privacyLegalTextReadPort.findByVersion('AUTORIZACION', version);
  }

  private mapConsentPurpose(consentType: string): DataPurpose {
    switch (consentType) {
      case ConsentType.TRATAMIENTO_DATOS:
      case ConsentType.CONTACTO_OPERATIVO:
        return 'TRATAMIENTO_CONTRACTUAL';
      case ConsentType.CONTACTO_COMERCIAL:
        return 'CONTACTO_COMERCIAL';
      default:
        throw new UnprocessableEntityException({
          code: 'CONSENT_PURPOSE_UNRESOLVED',
          message: 'No fue posible clasificar una finalidad del expediente.',
        });
    }
  }

  private encryptValue(plaintext: string): string {
    return encryptAes256Gcm(plaintext, this.encryptionKey);
  }

  private decryptValue(encrypted: string): string {
    return decryptAes256Gcm(encrypted, this.encryptionKey, this.encryptionKeyPrevious);
  }

  /**
   * HMAC-SHA-256 de teléfono (sin normalización de casing; el caller decide formato).
   * Emails usan {@link hashEmail} (toLowerCase + trim).
   */
  private hmacPhoneHash(value: string): string {
    return hmacPii(value, this.piiHashKey);
  }

  private toPartyDocumentType(
    documentType: string | undefined,
    personType: PersonType,
  ): DocumentTypeParty {
    const mapping: Record<string, DocumentTypeParty> = {
      CC: DocumentTypeParty.CC,
      CE: DocumentTypeParty.CE,
      PASAPORTE: DocumentTypeParty.PASAPORTE,
      TI: DocumentTypeParty.TI,
      RUT: DocumentTypeParty.RUT,
      NIT: DocumentTypeParty.NIT,
      NIT_PERSONA: DocumentTypeParty.NIT,
      PEP: DocumentTypeParty.OTHER,
      PTP: DocumentTypeParty.OTHER,
    };
    return (
      (documentType ? mapping[documentType] : undefined) ??
      (personType === PersonType.NATURAL ? DocumentTypeParty.CC : DocumentTypeParty.NIT)
    );
  }

  private isExpedienteUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const driverError = (error as { driverError?: { code?: string; constraint?: string } })
      .driverError;
    return driverError?.code === '23505' && driverError.constraint === 'uq_subscribers_expediente';
  }

  /**
   * Descifra campos PII del suscriptor para respuesta.
   */
  private decryptSubscriberFields(subscriber: Subscriber): Subscriber {
    if (subscriber.documentNumberEncrypted) {
      try {
        (subscriber as Subscriber & { documentNumber?: string }).documentNumber = this.decryptValue(
          subscriber.documentNumberEncrypted,
        );
      } catch {
        this.logger.warn(`No se pudo descifrar documentNumber para suscriptor ${subscriber.id}`);
      }
    }

    if (subscriber.emailEncrypted) {
      try {
        (subscriber as Subscriber & { email?: string }).email = this.decryptValue(
          subscriber.emailEncrypted,
        );
      } catch {
        this.logger.warn(`No se pudo descifrar email para suscriptor ${subscriber.id}`);
      }
    }

    if (subscriber.phoneEncrypted) {
      try {
        (subscriber as Subscriber & { phone?: string }).phone = this.decryptValue(
          subscriber.phoneEncrypted,
        );
      } catch {
        this.logger.warn(`No se pudo descifrar phone para suscriptor ${subscriber.id}`);
      }
    }

    if (subscriber.whatsappEncrypted) {
      try {
        subscriber.whatsapp = this.decryptValue(subscriber.whatsappEncrypted);
      } catch {
        subscriber.whatsapp = null;
        this.logger.warn(`No se pudo descifrar whatsapp para suscriptor ${subscriber.id}`);
      }
    } else {
      subscriber.whatsapp = null;
    }

    if (subscriber.altContactPhoneEncrypted) {
      try {
        (subscriber as Subscriber & { altContactPhone?: string }).altContactPhone =
          this.decryptValue(subscriber.altContactPhoneEncrypted);
      } catch {
        this.logger.warn(`No se pudo descifrar altContactPhone para suscriptor ${subscriber.id}`);
      }
    }

    return subscriber;
  }
}
