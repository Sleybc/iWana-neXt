import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  DocumentType,
  ExpedienteStatus,
  AuditAction,
} from '@iwana/shared';
import { Subscriber } from './entities/subscriber.entity';
import { VatTreatmentService } from './vat-treatment.service';
import { SubscriberStatusTransitionService } from './subscriber-status-transition.service';
import { AuditService } from '../../audit/audit.service';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { Contract } from '../contracts/entities/contract.entity';
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
      legalRepresentativeId: z.string().uuid().optional(),
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
@Injectable()
export class SubscribersService {
  private readonly encryptionKey: Buffer;
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly vatTreatmentService: VatTreatmentService,
    private readonly statusTransitionService: SubscriberStatusTransitionService,
    private readonly auditService: AuditService,
  ) {
    // Reutilizar la misma clave de cifrado que ExpedienteService
    const keyHex = this.configService.getOrThrow<string>('MFA_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');
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
      legalRepresentativeId?: string | undefined;
      // Compartido
      email: string;
      phone: string;
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
    },
    actorId: string,
  ): Promise<Subscriber> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    // Calcular tratamiento IVA y régimen tributario
    const { vatTreatment, taxRegime } = this.vatTreatmentService.applyTaxFields(
      dto.personType,
      dto.stratum ?? null,
      dto.customerSegment,
    );

    // Cifrar PII
    const emailEncrypted = this.encryptValue(dto.email);
    const phoneEncrypted = this.encryptValue(dto.phone);
    const altContactPhoneEncrypted = dto.altContactPhone
      ? this.encryptValue(dto.altContactPhone)
      : null;
    const documentNumberEncrypted = dto.documentNumber
      ? this.encryptValue(dto.documentNumber)
      : null;

    // Hash determinista para búsqueda por documento/email/teléfono (migración 014)
    const documentNumberHash = dto.documentNumber ? this.sha256Hash(dto.documentNumber) : null;
    const emailHash = this.sha256Hash(dto.email);
    const phoneHash = this.sha256Hash(dto.phone);
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
    entity.nit = dto.nit ?? null;
    entity.nitVerificationDigit = dto.nitVerificationDigit ?? null;
    entity.businessName = dto.businessName ?? null;
    entity.commercialName = dto.commercialName ?? null;
    entity.legalRepresentativeId = dto.legalRepresentativeId ?? null;
    entity.emailEncrypted = emailEncrypted;
    entity.phoneEncrypted = phoneEncrypted;
    entity.altContactName = dto.altContactName ?? null;
    entity.altContactPhoneEncrypted = altContactPhoneEncrypted;
    entity.whatsapp = dto.whatsapp ?? null;
    entity.vatTreatment = vatTreatment;
    entity.taxRegime = taxRegime;
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

    const saved = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.save(Subscriber, entity),
    );

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
        taxRegime,
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
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<{ data: Subscriber[]; total: number }> {
    const { schemaName } = TenantContext.getOrThrow();
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const [data, total] = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const query = qr.manager.createQueryBuilder(Subscriber, 's');

      if (filters.status) query.andWhere('s.status = :status', { status: filters.status });
      if (filters.personType)
        query.andWhere('s.personType = :personType', { personType: filters.personType });
      if (filters.customerSegment)
        query.andWhere('s.customerSegment = :customerSegment', {
          customerSegment: filters.customerSegment,
        });
      if (filters.stratum) query.andWhere('s.stratum = :stratum', { stratum: filters.stratum });

      // Búsqueda por nombre/NIT/businessName (campos no cifrados)
      if (filters.search) {
        query.andWhere(
          '(s.firstName ILIKE :search OR s.lastName ILIKE :search OR s.businessName ILIKE :search OR s.nit ILIKE :search OR s.commercialName ILIKE :search)',
          { search: `%${filters.search}%` },
        );
      }

      query.orderBy('s.createdAt', 'DESC');
      query.skip((page - 1) * limit).take(limit);

      return query.getManyAndCount();
    });

    // Descifrar PII para respuesta
    const hydratedData = data.map((s) => this.decryptSubscriberFields(s));

    return { data: hydratedData, total };
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

    return this.decryptSubscriberFields(entity);
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
      legalRepresentativeId?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
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

    // Recalcular IVA si cambia personType o stratum
    const effectivePersonType = dto.personType ?? entity.personType;
    const effectiveStratum = dto.stratum !== undefined ? dto.stratum : entity.stratum;
    const effectiveSegment = dto.customerSegment ?? entity.customerSegment;

    if (dto.personType || dto.stratum !== undefined || dto.customerSegment) {
      const { vatTreatment, taxRegime } = this.vatTreatmentService.applyTaxFields(
        effectivePersonType,
        effectiveStratum,
        effectiveSegment,
      );
      entity.vatTreatment = vatTreatment;
      entity.taxRegime = taxRegime;
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
    }
    if (dto.firstName !== undefined) entity.firstName = dto.firstName;
    if (dto.lastName !== undefined) entity.lastName = dto.lastName;
    if (dto.stratum !== undefined) entity.stratum = dto.stratum;
    if (dto.birthDate !== undefined)
      entity.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    if (dto.nit !== undefined) entity.nit = dto.nit;
    if (dto.nitVerificationDigit !== undefined)
      entity.nitVerificationDigit = dto.nitVerificationDigit;
    if (dto.businessName !== undefined) entity.businessName = dto.businessName;
    if (dto.commercialName !== undefined) entity.commercialName = dto.commercialName;
    if (dto.legalRepresentativeId !== undefined)
      entity.legalRepresentativeId = dto.legalRepresentativeId;
    if (dto.email !== undefined) entity.emailEncrypted = this.encryptValue(dto.email);
    if (dto.phone !== undefined) entity.phoneEncrypted = this.encryptValue(dto.phone);
    if (dto.altContactName !== undefined)
      entity.altContactName = dto.altContactName ? dto.altContactName.trim() : null;
    if (dto.altContactPhone !== undefined)
      entity.altContactPhoneEncrypted = dto.altContactPhone
        ? this.encryptValue(dto.altContactPhone)
        : null;
    if (dto.whatsapp !== undefined) entity.whatsapp = dto.whatsapp;
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
      await qr.manager.save(Subscriber, entity);
    });

    this.logger.log(`Suscriptor actualizado: ${id} [actor: ${actorId}]`);

    // Registro de auditoría — diff de campos modificados, sin PII
    const diff: Record<string, { old: unknown; new: unknown }> = {};
    if (dto.personType !== undefined)
      diff.personType = { old: entity.personType, new: dto.personType };
    if (dto.customerSegment !== undefined)
      diff.customerSegment = { old: entity.customerSegment, new: dto.customerSegment };
    if (dto.stratum !== undefined) diff.stratum = { old: entity.stratum, new: dto.stratum };
    if (dto.nit !== undefined) diff.nit = { old: entity.nit, new: dto.nit };
    if (dto.businessName !== undefined)
      diff.businessName = { old: entity.businessName, new: dto.businessName };
    if (dto.city !== undefined) diff.city = { old: entity.city, new: dto.city };
    if (dto.department !== undefined)
      diff.department = { old: entity.department, new: dto.department };
    if (dto.address !== undefined) diff.address = { old: entity.address, new: dto.address };
    if (dto.altContactName !== undefined)
      diff.altContactName = { old: entity.altContactName, new: dto.altContactName };
    if (dto.altContactPhone !== undefined)
      diff.altContactPhone = {
        old: Boolean(entity.altContactPhoneEncrypted),
        new: Boolean(dto.altContactPhone?.trim()),
      };

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
   * Usa columnas hash SHA-256 para búsqueda sin descifrar (migración 014).
   * Fallback a descifrado en memoria si las columnas hash no existen.
   */
  async search(query: {
    documentNumber?: string | undefined;
    nit?: string | undefined;
    email?: string | undefined;
    phone?: string | undefined;
  }): Promise<Subscriber[]> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager.createQueryBuilder(Subscriber, 's');

      const conditions: string[] = [];
      const params: Record<string, string> = {};

      // Búsqueda por hash SHA-256 (columnas de migración 014)
      if (query.documentNumber) {
        conditions.push('s.documentNumberHash = :docHash');
        params.docHash = this.sha256Hash(query.documentNumber);
      }

      if (query.nit) {
        conditions.push('s.nit = :nit');
        params.nit = query.nit;
      }

      if (query.email) {
        conditions.push('s.emailHash = :emailHash');
        params.emailHash = this.sha256Hash(query.email);
      }

      if (query.phone) {
        conditions.push('s.phoneHash = :phoneHash');
        params.phoneHash = this.sha256Hash(query.phone);
      }

      if (conditions.length === 0) {
        return [];
      }

      qb.where(conditions.join(' AND '), params);
      return qb.getMany();
    });
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
      email: string;
      phone: string;
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
      partyId: string;
    },
    actorId: string,
  ): Promise<Subscriber> {
    // Guard: Subscriber requiere partyId — regla de negocio ADR-030
    if (!overrides.partyId) {
      throw new BadRequestException('Subscriber requiere un partyId válido (Party MOD08)');
    }

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
        email: overrides.email,
        phone: overrides.phone,
        altContactName: overrides.altContactName,
        altContactPhone: overrides.altContactPhone,
        address: overrides.address,
        city: overrides.city,
        department: overrides.department,
        neighborhood: overrides.neighborhood,
        postalCode: overrides.postalCode,
        latitude: overrides.latitude,
        longitude: overrides.longitude,
        expedienteId,
        initialStatus: SubscriberStatus.PROSPECT,
        convertedAt: new Date(),
        partyId: overrides.partyId,
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
    const subscriber = await this.findByExpedienteId(expedienteId);

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
    const subscriber = await this.findByExpedienteId(expedienteId);
    if (!subscriber) {
      return null;
    }

    if (subscriber.status === SubscriberStatus.ACTIVE) {
      return this.findById(subscriber.id);
    }

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
    habeasData: unknown[];
    arcoRequests: unknown[];
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

    return {
      subscriber,
      contacts: [],
      contracts,
      quotes: [],
      habeasData: [],
      arcoRequests: [],
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

  private encryptValue(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptValue(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Formato de valor cifrado inválido.');
    }

    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const ciphertext = Buffer.from(parts[2]!, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  /**
   * Hash SHA-256 determinista para búsqueda sin descifrar.
   */
  private sha256Hash(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
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
