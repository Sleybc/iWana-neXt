import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DocumentTypeParty } from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyContact } from '../entities/party-contact.entity';
import { PartyRole } from '../entities/party-role.entity';
import {
  IPartyReadPort,
  PartySnapshot,
  PartyRoleSnapshot,
  PartyContactSnapshot,
} from '../ports/party-read.port';

@Injectable()
export class PartyReadAdapter extends IPartyReadPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {
    super();
  }

  async getById(id: string): Promise<PartySnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const party = await qr.manager.findOne(Party, { where: { id } });
      return party ? this.toSnapshot(party) : null;
    });
  }

  async findByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<PartySnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const party = await qr.manager.findOne(Party, { where: { documentType, documentNumber } });
      return party ? this.toSnapshot(party) : null;
    });
  }

  async listRoles(partyId: string): Promise<PartyRoleSnapshot[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const roles = await qr.manager.find(PartyRole, { where: { partyId } });
      return roles.map((r) => ({
        id: r.id,
        role: r.role,
        status: r.status,
        validFrom: r.validFrom,
        validTo: r.validTo,
      }));
    });
  }

  async listContacts(partyId: string): Promise<PartyContactSnapshot[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const contacts = await qr.manager.find(PartyContact, { where: { partyId } });
      return contacts.map((c) => ({
        id: c.id,
        type: c.type,
        value: c.value,
        isPrimary: c.isPrimary,
      }));
    });
  }

  private toSnapshot(party: Party): PartySnapshot {
    return {
      id: party.id,
      partyType: party.partyType,
      documentType: party.documentType,
      documentNumber: party.documentNumber,
      displayName: party.displayName,
      legalName: party.legalName,
      status: party.status,
    };
  }
}
