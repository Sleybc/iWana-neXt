import { Injectable, Logger } from '@nestjs/common';
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
  DocumentTypeParty,
} from '@iwana/shared';
import { ExpedienteRecord } from '../expedientes/entities/expediente-record.entity';
import { SubscribersService } from './subscribers.service';
import { SubscriberConvertedEvent } from './events/subscriber-converted.event';
import { AuditService } from '../../audit/audit.service';
import { decryptAes256Gcm, loadAesGcmKeyPair } from '../../../common/crypto/aes-gcm.util';
import { ExpedienteReadyForInstallationEvent } from '../expedientes/events/expediente-pipeline.events';
import { parseExpedienteNit } from '../../../common/crypto/nit-verification-digit.util';

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
  ) {
    const keys = loadAesGcmKeyPair(this.configService);
    this.encryptionKey = keys.activeKey;
    this.encryptionKeyPrevious = keys.previousKey;
  }

  @OnEvent('crm.expediente.ready-for-installation', { suppressErrors: false })
  async handleExpedienteReadyForInstallation(
    event: ExpedienteReadyForInstallationEvent,
  ): Promise<void> {
    await this.createFromExpediente(event.expedienteId, event.actorUserId);
  }

  /**
   * Crea (o reutiliza) un subscriber PROSPECT a partir de un expediente listo.
   * Determina personType y customerSegment según los datos del expediente.
   *
   * La escritura de Party y Subscriber se coordina en una transacción del servicio.
   */
  async createFromExpediente(expedienteId: string, actorId: string): Promise<string> {
    const { schemaName } = TenantContext.getOrThrow();

    const existing = await this.subscribersService.findByExpedienteId(expedienteId);
    if (existing) {
      if (existing.status === SubscriberStatus.CANCELLED) {
        await this.subscribersService.reactivateProspectFromExpediente(expedienteId, actorId);
      }
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
    const rawDocumentNumber = this.resolveDocumentNumber(expediente);
    const parsedNit =
      personType === PersonType.JURIDICA
        ? parseExpedienteNit(expediente.fiscalDocument ?? rawDocumentNumber)
        : null;
    const documentNumber =
      personType === PersonType.JURIDICA
        ? (parsedNit?.nit ?? rawDocumentNumber)
        : rawDocumentNumber;
    const partyDocumentNumber = documentNumber ?? `NODATA-${expediente.id}`;
    const partyDocumentType = documentNumber
      ? this.mapDocumentTypeToParty(
          personType === PersonType.JURIDICA
            ? (expediente.documentType ?? 'NIT')
            : expediente.documentType,
          personType,
        )
      : DocumentTypeParty.OTHER;

    // 6. Crear subscriber PROSPECT con trazabilidad del expediente y vínculo a Party
    const subscriber = await this.subscribersService.createFromExpediente(
      expedienteId,
      {
        personType,
        customerSegment,
        documentType:
          personType === PersonType.JURIDICA
            ? parsedNit
              ? 'NIT'
              : (expediente.documentType ?? 'NIT')
            : (expediente.documentType ?? undefined),
        documentNumber: documentNumber ?? undefined,
        firstName: expediente.firstName ?? undefined,
        lastName: expediente.lastName ?? undefined,
        stratum: expediente.stratum,
        businessName: expediente.companyName ?? undefined,
        nit: parsedNit?.nit ?? undefined,
        nitVerificationDigit: parsedNit?.verificationDigit ?? undefined,
        email,
        phone,
        address: expediente.address ?? '',
        city: expediente.municipality ?? undefined,
        department: expediente.department ?? undefined,
        neighborhood: expediente.neighborhood ?? undefined,
        postalCode: expediente.postalCode ?? undefined,
        latitude: expediente.latitude ?? undefined,
        longitude: expediente.longitude ?? undefined,
        partyDocumentNumber,
        partyDocumentType,
      },
      actorId,
    );

    this.logger.log(
      `Subscriber ${subscriber.id} creado desde expediente ${expedienteId} ` +
        `[${personType}/${customerSegment}]`,
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
        partyId: subscriber.partyId,
      },
    });

    return subscriber.id;
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
   * Si no hay email real, conserva el contacto pendiente.
   */
  private resolveEmail(expediente: ExpedienteRecord): string | null {
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

    this.logger.warn(
      `Expediente ${expediente.id} sin correo; el suscriptor quedará con contacto pendiente`,
    );
    return null;
  }

  /**
   * Resuelve el teléfono del expediente.
   * Prioriza phonePrimary (descifrado), luego phoneSecondary (descifrado).
   * Si no hay teléfono real, conserva el contacto pendiente.
   */
  private resolvePhone(expediente: ExpedienteRecord): string | null {
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

    this.logger.warn(
      `Expediente ${expediente.id} sin teléfono; el suscriptor quedará con contacto pendiente`,
    );
    return null;
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
