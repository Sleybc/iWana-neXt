import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import {
  PersonType,
  CustomerSegment,
  SubscriberStatus,
  AuditAction,
  PartyType,
  DocumentTypeParty,
  PartyRoleType,
} from '@iwana/shared';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { SubscribersService } from './subscribers.service';
import { SubscriberConvertedEvent } from './events/subscriber-converted.event';
import { AuditService } from '../../audit/audit.service';
import { decryptAes256Gcm, loadAesGcmKeyPair } from '../../../common/crypto/aes-gcm.util';
import { ExpedienteReadyForInstallationEvent } from '../expedientes/events/expediente-pipeline.events';
import { PartyService } from '../../parties/services/party.service';
import { PartyRoleService } from '../../parties/services/party-role.service';
import { IPartyReadPort } from '../../parties/ports/party-read.port';

/**
 * Listener que crea un Subscriber automáticamente cuando un expediente
 * transiciona a LISTO_PARA_INSTALACION.
 *
 * Flujo:
 * 1. Expediente → LISTO_PARA_INSTALACION
 * 2. ExpedienteService emite evento de pipeline
 * 3. Se descifran datos PII del expediente (misma clave AES-256-GCM)
 * 4. Se copian datos al subscriber con cifrado independiente
 * 5. Se calcula vatTreatment y taxRegime
 * 6. Se crea subscriber con status PROSPECT (idempotente por expedienteId)
 * 7. Se emite evento subscriber.converted vía EventEmitter2
 * 8. Se registra en audit trail
 */
@Injectable()
export class SubscriberCreationService {
  private readonly encryptionKey: Buffer;
  private readonly encryptionKeyPrevious: Buffer | null;
  private readonly logger = new Logger(SubscriberCreationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly subscribersService: SubscribersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly auditService: AuditService,
    private readonly partyService: PartyService,
    private readonly partyRoleService: PartyRoleService,
    private readonly partyReadPort: IPartyReadPort,
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.encryptionKey = keys.activeKey;
    this.encryptionKeyPrevious = keys.previousKey;
  }

  @OnEvent('crm.expediente.ready-for-installation', { async: true })
  async handleExpedienteReadyForInstallation(
    event: ExpedienteReadyForInstallationEvent,
  ): Promise<void> {
    await this.createFromExpediente(event.expedienteId, event.actorUserId);
  }

  /**
   * Crea (o reutiliza) un subscriber PROSPECT a partir de un expediente listo.
   * Determina personType y customerSegment según los datos del expediente.
   *
   * FASE 5 (ADR-030): crea Party + PartyRole(CUSTOMER) antes del subscriber.
   * El partyId queda vinculado al subscriber desde su creación.
   */
  async createFromExpediente(expedienteId: string, actorId: string): Promise<string> {
    const { schemaName } = TenantContext.getOrThrow();

    const existing = await this.subscribersService.findByExpedienteId(expedienteId);
    if (existing) {
      this.logger.log(
        `Conversión idempotente: expediente ${expedienteId} ya vinculado a subscriber ${existing.id}`,
      );
      return existing.id;
    }

    // 1. Buscar expediente
    const expediente = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(ExpedienteRecord, { where: { id: expedienteId } }),
    );

    if (!expediente) {
      throw new Error(`Expediente ${expedienteId} no encontrado para creación de subscriber`);
    }

    // 2. Determinar personType según los datos del expediente
    const personType = this.resolvePersonType(expediente);

    // 3. Determinar customerSegment (por defecto según tipo de persona)
    const customerSegment = this.resolveCustomerSegment(expediente, personType);

    // 4. Descifrar PII del expediente (misma clave AES-256-GCM)
    const email = this.resolveEmail(expediente);
    const phone = this.resolvePhone(expediente);
    const documentNumber = this.resolveDocumentNumber(expediente);

    // 5. Crear Party + PartyRole(CUSTOMER) — ADR-030 F5
    const partyId = await this.createPartyForSubscriber(expediente, personType);

    // 6. Crear subscriber PROSPECT con trazabilidad del expediente y vínculo a Party
    const subscriber = await this.subscribersService.createFromExpediente(
      expedienteId,
      {
        personType,
        customerSegment,
        documentType: expediente.documentType ?? undefined,
        documentNumber: documentNumber ?? undefined,
        firstName: expediente.firstName ?? undefined,
        lastName: expediente.lastName ?? undefined,
        stratum: expediente.stratum,
        businessName: expediente.companyName ?? undefined,
        nit: expediente.fiscalDocument ?? undefined,
        email,
        phone,
        address: expediente.address ?? '',
        city: expediente.municipality ?? undefined,
        department: expediente.department ?? undefined,
        neighborhood: expediente.neighborhood ?? undefined,
        postalCode: expediente.postalCode ?? undefined,
        latitude: expediente.latitude ?? undefined,
        longitude: expediente.longitude ?? undefined,
        partyId,
      },
      actorId,
    );

    this.logger.log(
      `Subscriber ${subscriber.id} creado desde expediente ${expedienteId} ` +
        `[${personType}/${customerSegment}] → party=${partyId}`,
    );

    // Emitir evento para que otros módulos reaccionen (Billing, Provisioning, etc.)
    const { tenantId } = TenantContext.getOrThrow();
    this.eventEmitter.emit(
      'crm.subscriber.converted',
      new SubscriberConvertedEvent(
        tenantId,
        schemaName,
        subscriber.id,
        expedienteId,
        SubscriberStatus.PROSPECT,
      ),
    );

    // Registro de auditoría — sin PII
    await this.auditService.log({
      action: AuditAction.CREATE,
      entityType: 'Subscriber',
      entityId: subscriber.id,
      userId: actorId,
      newValue: {
        source: 'expediente',
        expedienteId,
        personType,
        customerSegment,
        status: 'PROSPECT',
        partyId,
      },
    });

    return subscriber.id;
  }

  /**
   * Crea un Party + PartyRole(CUSTOMER) para un subscriber nuevo.
   * Si el Party ya existe con el mismo documentNumber (ConflictException), reutiliza el existente.
   *
   * PII: documentNumber se almacena en el formato cifrado del expediente (AES-256-GCM)
   * para mantener confidencialidad en la tabla party (ADR-030 §PII).
   *
   * Ref: ADR-030, HLD-MOD08-PARTIES-v1.0 §4
   */
  private async createPartyForSubscriber(
    expediente: ExpedienteRecord,
    personType: PersonType,
  ): Promise<string> {
    const partyType =
      personType === PersonType.NATURAL ? PartyType.NATURAL : PartyType.ORGANIZATION;
    const documentType = this.mapDocumentTypeToParty(expediente.documentType, personType);

    // Almacenar documentNumber cifrado para mantener PII — mismo formato que subscribers
    const documentNumber = expediente.documentNumberEncrypted ?? `NODATA-${expediente.id}`;

    const displayName = this.buildDisplayName(expediente, personType);
    const legalName = this.buildLegalName(expediente, personType);

    let partyId: string;

    try {
      const party = await this.partyService.create({
        partyType,
        documentType,
        documentNumber,
        displayName,
        ...(legalName ? { legalName } : {}),
      });
      partyId = party.id;
      this.logger.log(`[SubscriberCreationService] Party creado id=${partyId} tipo=${partyType}`);
    } catch (error) {
      if (error instanceof ConflictException) {
        // Party ya existe con este documentNumber — reutilizar (ADR-030)
        const existing = await this.partyReadPort.findByDocument(documentType, documentNumber);
        if (!existing) {
          throw new Error(
            `[SubscriberCreationService] Party en conflicto pero no encontrado tipo=${documentType}`,
          );
        }
        partyId = existing.id;
        this.logger.warn(`[SubscriberCreationService] Party existente reutilizado id=${partyId}`);
      } else {
        throw error;
      }
    }

    // Asignar rol CUSTOMER al party (idempotente si ya existe)
    try {
      await this.partyRoleService.assign(partyId, {
        role: PartyRoleType.CUSTOMER,
        validFrom: expediente.createdAt?.toISOString(),
      });
    } catch (error) {
      // Rol CUSTOMER ya activo — ignorar (ConflictException es aceptable aquí)
      if (!(error instanceof ConflictException)) {
        throw error;
      }
      this.logger.warn(`[SubscriberCreationService] Rol CUSTOMER ya activo en party=${partyId}`);
    }

    return partyId;
  }

  /**
   * Mapea DocumentType de CRM a DocumentTypeParty de MOD08.
   * Si el tipo no coincide, infiere por personType.
   */
  private mapDocumentTypeToParty(
    docType: string | null | undefined,
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

    if (docType && mapping[docType]) {
      return mapping[docType]!;
    }

    return personType === PersonType.NATURAL ? DocumentTypeParty.CC : DocumentTypeParty.NIT;
  }

  /**
   * Construye el displayName del Party desde los datos del expediente.
   */
  private buildDisplayName(expediente: ExpedienteRecord, personType: PersonType): string {
    if (personType === PersonType.NATURAL) {
      if (expediente.firstName && expediente.lastName) {
        return `${expediente.firstName} ${expediente.lastName}`.substring(0, 160);
      }
      if (expediente.firstName) return expediente.firstName.substring(0, 160);
    }
    if (expediente.companyName) return expediente.companyName.substring(0, 160);
    if (expediente.fullName) return expediente.fullName.substring(0, 160);
    return 'Sin nombre';
  }

  /**
   * Construye el legalName del Party desde los datos del expediente.
   */
  private buildLegalName(expediente: ExpedienteRecord, personType: PersonType): string | null {
    if (personType === PersonType.JURIDICA) {
      return expediente.companyName?.substring(0, 200) ?? null;
    }
    if (expediente.firstName && expediente.lastName) {
      return `${expediente.firstName} ${expediente.lastName}`.substring(0, 200);
    }
    return null;
  }

  /**
   * Determina personType según los datos del expediente.
   * Si tiene NIT o companyName → JURIDICA.
   * Si tiene estrato → NATURAL.
   * Por defecto usa el campo personType del expediente.
   */
  private resolvePersonType(expediente: ExpedienteRecord): PersonType {
    if (expediente.personType) {
      if (expediente.personType === 'PERSONA_NATURAL' || expediente.personType === 'NATURAL') {
        return PersonType.NATURAL;
      }
      if (expediente.personType === 'PERSONA_JURIDICA' || expediente.personType === 'JURIDICA') {
        return PersonType.JURIDICA;
      }
    }

    // Inferir por datos: si tiene NIT o companyName → JURIDICA
    if (expediente.fiscalDocument || expediente.companyName) {
      return PersonType.JURIDICA;
    }

    return PersonType.NATURAL;
  }

  /**
   * Determina customerSegment del suscriptor.
   * Si el expediente porta un segmento explícito, se propaga tal cual;
   * si no, aplica el fallback por tipo de persona:
   * NATURAL → RESIDENTIAL (por defecto)
   * JURIDICA → PYME (por defecto)
   */
  private resolveCustomerSegment(
    expediente: ExpedienteRecord,
    personType: PersonType,
  ): CustomerSegment {
    if (expediente.customerSegment) {
      return expediente.customerSegment;
    }
    return personType === PersonType.JURIDICA ? CustomerSegment.PYME : CustomerSegment.RESIDENTIAL;
  }

  /**
   * Resuelve el email del expediente.
   * Prioriza emailPrimary (descifrado), luego emailSecondary (texto plano).
   * Si no hay email, genera un placeholder temporal.
   */
  private resolveEmail(expediente: ExpedienteRecord): string {
    // Intentar descifrar emailPrimary si existe
    if (expediente.emailPrimaryEncrypted) {
      try {
        return this.decryptValue(expediente.emailPrimaryEncrypted);
      } catch {
        this.logger.warn(`No se pudo descifrar emailPrimary del expediente ${expediente.id}`);
      }
    }

    // Usar emailSecondary (texto plano) si existe
    if (expediente.emailSecondary) {
      return expediente.emailSecondary;
    }

    // Placeholder temporal — el usuario debe actualizar su email al activar el portal
    this.logger.warn(`Expediente ${expediente.id} sin email — usando placeholder temporal`);
    return `expediente-${expediente.id}@placeholder.iwana.co`;
  }

  /**
   * Resuelve el teléfono del expediente.
   * Prioriza phonePrimary (descifrado), luego phoneSecondary (descifrado).
   * Si no hay teléfono, usa placeholder temporal.
   */
  private resolvePhone(expediente: ExpedienteRecord): string {
    // Intentar descifrar phonePrimary si existe
    if (expediente.phonePrimaryEncrypted) {
      try {
        return this.decryptValue(expediente.phonePrimaryEncrypted);
      } catch {
        this.logger.warn(`No se pudo descifrar phonePrimary del expediente ${expediente.id}`);
      }
    }

    // Intentar descifrar phoneSecondary si existe
    if (expediente.phoneSecondaryEncrypted) {
      try {
        return this.decryptValue(expediente.phoneSecondaryEncrypted);
      } catch {
        this.logger.warn(`No se pudo descifrar phoneSecondary del expediente ${expediente.id}`);
      }
    }

    // Placeholder temporal — el usuario debe actualizar su teléfono al activar el portal
    this.logger.warn(`Expediente ${expediente.id} sin teléfono — usando placeholder temporal`);
    return '0000000000';
  }

  /**
   * Resuelve el número de documento del expediente.
   * Descifra documentNumberEncrypted si existe.
   */
  private resolveDocumentNumber(expediente: ExpedienteRecord): string | null {
    if (expediente.documentNumberEncrypted) {
      try {
        return this.decryptValue(expediente.documentNumberEncrypted);
      } catch {
        this.logger.warn(`No se pudo descifrar documentNumber del expediente ${expediente.id}`);
        return null;
      }
    }
    return null;
  }

  /**
   * Descifra un valor usando AES-256-GCM (mismo patrón que ExpedienteService y SubscribersService).
   * Formato: iv:authTag:ciphertext (hex)
   */
  private decryptValue(encrypted: string): string {
    return decryptAes256Gcm(encrypted, this.encryptionKey, this.encryptionKeyPrevious);
  }
}
