import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNull } from 'typeorm';
import { DocumentTypeParty, PartyStatus, PartyRoleStatus, PartyRoleType } from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyRole } from '../entities/party-role.entity';
import { PartyContact } from '../entities/party-contact.entity';
import { createPartyPiiCrypto, partyContactStorageValue } from '../party-pii.util';
import { calculateNitVerificationDigit } from '../../../common/crypto/nit-verification-digit.util';
import {
  IPartyWritePort,
  EnsurePartyInput,
  PartyWriteContext,
  EnsurePartyResult,
  PartyIdentitySnapshot,
} from '../ports/party-write.port';

const NON_MERGED_PARTY_STATUSES = Object.values(PartyStatus).filter(
  (status) => status !== PartyStatus.MERGED,
);

/**
 * Implementación del puerto de escritura de Parties.
 * Opera exclusivamente sobre el EntityManager del llamante (participa en su transacción).
 * Ref: ADR-052 §D2
 */
@Injectable()
export class PartyWriteAdapter extends IPartyWritePort {
  private readonly logger = new Logger(PartyWriteAdapter.name);
  private readonly pii: ReturnType<typeof createPartyPiiCrypto>;

  constructor(configService: ConfigService) {
    super();
    this.pii = createPartyPiiCrypto(configService);
  }

  async ensurePartyWithRole(
    input: EnsurePartyInput,
    role: PartyRoleType,
    ctx: PartyWriteContext,
  ): Promise<EnsurePartyResult> {
    const { manager } = ctx;
    let partyCreated = false;
    const documentNumberHmac = this.pii.documentHmac(input.documentType, input.documentNumber);

    // Serializa por HMAC para cerrar la carrera antes de alcanzar el índice único.
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `party:${input.documentType}:${documentNumberHmac}`,
    ]);

    let party: Party | null = null;
    for (const status of NON_MERGED_PARTY_STATUSES) {
      party = await manager.findOne(Party, {
        where: {
          documentType: input.documentType,
          documentNumberHmac,
          deletedAt: IsNull(),
          status,
        },
      });
      if (party) break;
    }

    if (!party) {
      party = manager.create(Party, {
        partyType: input.partyType,
        documentType: input.documentType,
        documentNumber: this.pii.encrypt(input.documentNumber),
        documentNumberHmac,
        verificationDigit:
          input.documentType === DocumentTypeParty.NIT
            ? calculateNitVerificationDigit(input.documentNumber)
            : null,
        displayName: input.displayName,
        legalName: input.legalName ?? null,
        status: PartyStatus.ACTIVE,
        address: input.address ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        city: input.city ?? null,
        department: input.department ?? null,
      });
      await manager.save(Party, party);
      partyCreated = true;

      if (input.contacts?.length) {
        await this.createContacts(manager, party.id, input.contacts);
      }

      // PII: no loguear documentNumber
      this.logger.log(
        `[PartyWriteAdapter] Party creado id=${party.id} tipo=${input.partyType} rol=${role}`,
      );
    } else {
      this.logger.log(
        `[PartyWriteAdapter] Party reutilizado id=${party.id} tipo=${party.partyType} rol=${role}`,
      );
    }

    const existingRole = await manager.findOne(PartyRole, {
      where: { partyId: party.id, role },
    });

    let roleAdded = false;
    let partyRole: PartyRole;

    if (!existingRole) {
      partyRole = manager.create(PartyRole, {
        partyId: party.id,
        role,
        status: PartyRoleStatus.ACTIVE,
        validFrom: new Date(),
        validTo: null,
        createdBy: ctx.actorUserId ?? null,
      });
      await manager.save(PartyRole, partyRole);
      roleAdded = true;
      this.logger.log(`[PartyWriteAdapter] Rol ${role} asignado a party=${party.id}`);
    } else if (existingRole.status === PartyRoleStatus.INACTIVE) {
      existingRole.status = PartyRoleStatus.ACTIVE;
      existingRole.validFrom = new Date();
      existingRole.validTo = null;
      await manager.save(PartyRole, existingRole);
      partyRole = existingRole;
      roleAdded = true;
      this.logger.log(`[PartyWriteAdapter] Rol ${role} reactivado para party=${party.id}`);
    } else {
      partyRole = existingRole;
      this.logger.log(
        `[PartyWriteAdapter] Rol ${role} ya activo para party=${party.id} — idempotente`,
      );
    }

    const identity = await this.buildIdentitySnapshot(manager, party);

    return {
      partyId: party.id,
      partyRoleId: partyRole.id,
      partyCreated,
      roleAdded,
      identity,
    };
  }

  /**
   * Lee la identidad (incluidos contactos) dentro del mismo EntityManager transaccional,
   * de modo que el llamante vea los datos recien creados sin abrir otra conexion.
   * Ref: ADR-052 §D3, remediacion A1.
   */
  private async buildIdentitySnapshot(
    manager: PartyWriteContext['manager'],
    party: Party,
  ): Promise<PartyIdentitySnapshot> {
    const contacts = await manager.find(PartyContact, { where: { partyId: party.id } });

    return {
      partyId: party.id,
      displayName: party.displayName,
      legalName: party.legalName ?? null,
      partyType: party.partyType,
      documentType: party.documentType,
      status: party.status,
      contacts: contacts.map((contact) => ({
        type: contact.type,
        value: contact.valueEncrypted ? this.pii.decrypt(contact.valueEncrypted) : '',
        isPrimary: contact.isPrimary,
        metadata: contact.metadata ?? null,
      })),
    };
  }

  /** Crea contactos opcionales al dar de alta un party nuevo. */
  private async createContacts(
    manager: PartyWriteContext['manager'],
    partyId: string,
    contacts: NonNullable<EnsurePartyInput['contacts']>,
  ): Promise<void> {
    for (const contactInput of contacts) {
      const contact = manager.create(PartyContact, {
        partyId,
        type: contactInput.type,
        value: partyContactStorageValue(),
        valueEncrypted: this.pii.encrypt(contactInput.value),
        valueHmac: this.pii.contactHmac(contactInput.type, contactInput.value),
        isPrimary: contactInput.isPrimary ?? false,
        metadata: contactInput.metadata ?? null,
      });
      await manager.save(PartyContact, contact);
    }
  }
}
