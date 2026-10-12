import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, IsNull } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DocumentTypeParty, PartyRoleStatus, PartyRoleType, PartyStatus } from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyContact } from '../entities/party-contact.entity';
import { PartyRole } from '../entities/party-role.entity';
import { createPartyPiiCrypto } from '../party-pii.util';
import { clampPage } from '../../../common/pagination/clamp-page';
import {
  IPartyReadPort,
  PartySnapshot,
  PartySearchResult,
  PartyRoleSnapshot,
  PartyContactSnapshot,
} from '../ports/party-read.port';

const NON_MERGED_PARTY_STATUSES = Object.values(PartyStatus).filter(
  (status) => status !== PartyStatus.MERGED,
);

@Injectable()
export class PartyReadAdapter extends IPartyReadPort {
  private readonly pii: ReturnType<typeof createPartyPiiCrypto>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    super();
    this.pii = createPartyPiiCrypto(configService);
  }

  async getById(id: string): Promise<PartySnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const party = await qr.manager.findOne(Party, { where: { id } });
      return party ? this.toSnapshot(party) : null;
    });
  }

  async getByIds(ids: string[]): Promise<PartySnapshot[]> {
    if (ids.length === 0) return [];
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const parties = await qr.manager.find(Party, { where: { id: In(ids) } });
      return parties.map((p) => this.toSnapshot(p));
    });
  }

  async findByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<PartySnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    const documentNumberHmac = this.pii.documentHmac(documentType, documentNumber);
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      for (const status of NON_MERGED_PARTY_STATUSES) {
        const party = await qr.manager.findOne(Party, {
          where: { documentType, documentNumberHmac, deletedAt: IsNull(), status },
        });
        if (party) return this.toSnapshot(party);
      }

      const mergedParty = await qr.manager.findOne(Party, {
        where: {
          documentType,
          documentNumberHmac,
          deletedAt: IsNull(),
          status: PartyStatus.MERGED,
        },
      });
      if (!mergedParty?.mergedIntoPartyId) return null;

      for (const status of NON_MERGED_PARTY_STATUSES) {
        const canonicalParty = await qr.manager.findOne(Party, {
          where: { id: mergedParty.mergedIntoPartyId, deletedAt: IsNull(), status },
        });
        if (canonicalParty) return this.toSnapshot(canonicalParty);
      }
      return null;
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
    // D-5 / R-4: validar paginación antes de ocupar conexión del pool.
    const { page, limit } = clampPage(options.page ?? 1, options.limit ?? 20);
    const skip = (page - 1) * limit;
    const search = options.search?.trim();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(Party, 'p')
        .where('p.deleted_at IS NULL')
        .innerJoin(
          PartyRole,
          'pr',
          'pr.party_id = p.id AND pr.role = :role AND pr.status = :status',
          { role, status: PartyRoleStatus.ACTIVE },
        );

      if (search) {
        qb.andWhere('p.display_name ILIKE :search', { search: `%${search}%` });
      }

      // TypeORM 0.3: orderBy exige propiedad de entidad (displayName), no columna SQL.
      // DEF-1: desempate por id para paginación offset estable.
      const [data, total] = await qb
        .orderBy('p.displayName', 'ASC')
        .addOrderBy('p.id', 'ASC')
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

  async filterPartyIdsByActiveRole(role: PartyRoleType, partyIds: string[]): Promise<string[]> {
    if (partyIds.length === 0) return [];
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rows = await qr.manager
        .createQueryBuilder(Party, 'p')
        .select('p.id', 'id')
        .innerJoin(
          PartyRole,
          'pr',
          'pr.party_id = p.id AND pr.role = :role AND pr.status = :status',
          {
            role,
            status: PartyRoleStatus.ACTIVE,
          },
        )
        .where('p.id IN (:...partyIds)', { partyIds })
        .andWhere('p.deleted_at IS NULL')
        .getRawMany<{ id: string }>();

      return rows.map((row) => row.id);
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
        value: c.valueEncrypted ? this.pii.decrypt(c.valueEncrypted) : '',
        isPrimary: c.isPrimary,
      }));
    });
  }

  async listContactsForIds(partyIds: string[]): Promise<Map<string, PartyContactSnapshot[]>> {
    if (partyIds.length === 0) return new Map();
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const contacts = await qr.manager.find(PartyContact, { where: { partyId: In(partyIds) } });
      const grouped = new Map<string, PartyContactSnapshot[]>();
      for (const c of contacts) {
        const existing = grouped.get(c.partyId);
        const snapshot: PartyContactSnapshot = {
          id: c.id,
          type: c.type,
          value: c.valueEncrypted ? this.pii.decrypt(c.valueEncrypted) : '',
          isPrimary: c.isPrimary,
        };
        if (existing) {
          existing.push(snapshot);
        } else {
          grouped.set(c.partyId, [snapshot]);
        }
      }
      return grouped;
    });
  }

  private toSnapshot(party: Party): PartySnapshot {
    return {
      id: party.id,
      partyType: party.partyType,
      documentType: party.documentType,
      documentNumber: this.pii.decrypt(party.documentNumber),
      displayName: party.displayName,
      legalName: party.legalName,
      status: party.status,
      address: party.address,
      latitude: party.latitude !== null ? Number(party.latitude) : null,
      longitude: party.longitude !== null ? Number(party.longitude) : null,
      city: party.city,
      department: party.department,
    };
  }
}
