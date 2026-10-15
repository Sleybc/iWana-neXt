import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { PartyContact } from '../entities/party-contact.entity';
import { UpsertContactDto } from '../dto/upsert-contact.dto';
import { createPartyPiiCrypto, partyContactStorageValue } from '../party-pii.util';

@Injectable()
export class PartyContactService {
  private readonly logger = new Logger(PartyContactService.name);
  private readonly pii: ReturnType<typeof createPartyPiiCrypto>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.pii = createPartyPiiCrypto(configService);
  }

  async upsert(partyId: string, dto: UpsertContactDto): Promise<PartyContact> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Si isPrimary=true, limpiar isPrimary anterior del mismo tipo
      if (dto.isPrimary) {
        await qr.manager.update(
          PartyContact,
          { partyId, type: dto.type, isPrimary: true },
          { isPrimary: false },
        );
      }

      // Buscar contacto existente del mismo tipo para hacer upsert real
      const existing = await qr.manager.findOne(PartyContact, {
        where: { partyId, type: dto.type },
      });

      if (existing) {
        // PII: no loguear value
        existing.value = partyContactStorageValue();
        existing.valueEncrypted = this.pii.encrypt(dto.value);
        existing.valueHmac = this.pii.contactHmac(dto.type, dto.value);
        existing.isPrimary = dto.isPrimary;
        existing.metadata = dto.metadata ?? null;
        await qr.manager.save(PartyContact, existing);
        this.logger.log(
          `[PartyContactService] Contacto tipo=${dto.type} actualizado para party=${partyId}`,
        );
        return this.decryptContact(existing, dto.value);
      }

      const contact = qr.manager.create(PartyContact, {
        partyId,
        type: dto.type,
        value: partyContactStorageValue(),
        valueEncrypted: this.pii.encrypt(dto.value),
        valueHmac: this.pii.contactHmac(dto.type, dto.value),
        isPrimary: dto.isPrimary,
        metadata: dto.metadata ?? null,
      });

      await qr.manager.save(PartyContact, contact);
      this.logger.log(
        `[PartyContactService] Contacto tipo=${dto.type} creado para party=${partyId}`,
      );
      return this.decryptContact(contact, dto.value);
    });
  }

  async list(partyId: string): Promise<PartyContact[]> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const contacts = await qr.manager.find(PartyContact, { where: { partyId } });
      return contacts.map((contact) =>
        this.decryptContact(
          contact,
          contact.valueEncrypted ? this.pii.decrypt(contact.valueEncrypted) : null,
        ),
      );
    });
  }

  async delete(partyId: string, contactId: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const contact = await qr.manager.findOne(PartyContact, {
        where: { id: contactId, partyId },
      });

      if (!contact) {
        throw new NotFoundException(`Contacto ${contactId} no encontrado para party ${partyId}`);
      }

      await qr.manager.remove(PartyContact, contact);
      // PII: no loguear value
      this.logger.log(
        `[PartyContactService] Contacto tipo=${contact.type} eliminado de party=${partyId}`,
      );
    });
  }

  private decryptContact(contact: PartyContact, value: string | null): PartyContact {
    return Object.assign(new PartyContact(), contact, { value });
  }
}
