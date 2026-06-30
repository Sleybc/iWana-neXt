import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DocumentTypeParty, PartyRoleType } from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyContact } from '../entities/party-contact.entity';
import { PartyRole } from '../entities/party-role.entity';
import {
  IPartyReadPort,
  PartySnapshot,
  PartySearchResult,
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

  async searchByRole(
    role: PartyRoleType,
    options: {
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PartySearchResult> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const page = options.page ?? 1;
      const limit = options.limit ?? 20;
      const skip = (page - 1) * limit;
      const search = options.search?.trim();
      const qb = qr.manager
        .createQueryBuilder(Party, 'p')
        .where('p.deleted_at IS NULL')
        .innerJoin(
          'party_role',
          'pr',
          "pr.party_id = p.id AND pr.role = :role AND pr.status = 'ACTIVE'",
          { role },
        );

      if (search) {
        qb.andWhere('p.display_name ILIKE :search', { search: `%${search}%` });
      }

      const [data, total] = await qb
        .orderBy('p.display_name', 'ASC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();
      return {
        data: data.map((party) => this.toSnapshot(party)),
        total,
        page,
        limit,
      };
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
