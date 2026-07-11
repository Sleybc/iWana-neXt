import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager } from 'typeorm';
import { SupplierProfile, TenantContext, runInTenantSchema } from '@iwana/db';
import { PartyRoleType, SupplierProfileStatus } from '@iwana/shared';
import { IPartyWritePort, EnsurePartyInput } from '../../parties/ports/party-write.port';
import {
  CreateSupplierInput,
  CreateSupplierSchema,
  ListSuppliersQueryInput,
  ListSuppliersQuerySchema,
  SetSupplierStatusInput,
  SetSupplierStatusSchema,
  UpdateSupplierInput,
  UpdateSupplierSchema,
} from '../dto';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SupplierPartyPort, SupplierPartySummary } from '../ports/supplier-party.port';
import { isPostgresUniqueViolation } from './inventory-postgres.util';

export interface SupplierProfileRecord {
  id: string;
  supplierCode: string;
  partyRefId: string;
  status: SupplierProfileStatus;
  paymentTermsDays: number | null;
  currency: string | null;
  incoterm: string | null;
  defaultLeadTimeDays: number | null;
  purchasingContactName: string | null;
  purchasingContactEmail: string | null;
  purchasingContactPhone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  party: SupplierPartySummary | null;
}

async function withTransaction<T>(
  manager: EntityManager,
  work: (transactionManager: EntityManager) => Promise<T>,
): Promise<T> {
  if (typeof manager.transaction === 'function') {
    return manager.transaction(work);
  }

  return work(manager);
}

@Injectable()
export class SupplierProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly partyWritePort: IPartyWritePort,
    private readonly supplierPartyPort: SupplierPartyPort,
  ) {}

  async create(input: CreateSupplierInput, actor: JwtPayload): Promise<SupplierProfileRecord> {
    const validated = CreateSupplierSchema.parse(input);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const partyResult = await this.partyWritePort.ensurePartyWithRole(
          this.toEnsurePartyInput(validated),
          PartyRoleType.SUPPLIER,
          { manager, actorUserId: actor.sub },
        );

        const supplierCode = await this.generateSupplierCode(manager, tenantId);

        try {
          const profile = await manager.save(
            SupplierProfile,
            manager.create(SupplierProfile, {
              tenantId,
              partyRefId: partyResult.partyId,
              partyRoleId: partyResult.partyRoleId,
              supplierCode,
              paymentTermsDays: validated.paymentTermsDays ?? null,
              currency: validated.currency ?? null,
              incoterm: validated.incoterm ?? null,
              defaultLeadTimeDays: validated.defaultLeadTimeDays ?? null,
              purchasingContactName: validated.purchasingContactName ?? null,
              purchasingContactEmail: validated.purchasingContactEmail ?? null,
              purchasingContactPhone: validated.purchasingContactPhone ?? null,
              notes: validated.notes ?? null,
              status: SupplierProfileStatus.ACTIVE,
              createdByUserId: actor.sub,
            }),
          );

          const party = await this.supplierPartyPort.getSupplierSummary(partyResult.partyId);
          return this.toRecord(profile, party);
        } catch (error) {
          if (isPostgresUniqueViolation(error, 'uq_supplier_profiles_tenant_party_ref')) {
            throw new ConflictException('Ya existe un perfil de proveedor para este tercero.');
          }

          throw error;
        }
      }),
    );
  }

  async list(
    query: ListSuppliersQueryInput,
  ): Promise<{ data: SupplierProfileRecord[]; total: number; page: number; limit: number }> {
    const validated = ListSuppliersQuerySchema.parse(query);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { status, search, page, limit } = validated;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager
        .createQueryBuilder(SupplierProfile, 'sp')
        .where('sp.tenant_id = :tenantId', { tenantId });

      if (status) {
        qb.andWhere('sp.status = :status', { status });
      }

      if (search) {
        const partySearch = await this.supplierPartyPort.searchSuppliers(search, 1);
        const partyRefIds = partySearch.data.map((entry) => entry.partyRefId);
        const searchPattern = `%${search}%`;

        qb.andWhere(
          new Brackets((where) => {
            where.where('sp.supplier_code ILIKE :searchPattern', { searchPattern });

            if (partyRefIds.length > 0) {
              where.orWhere('sp.party_ref_id IN (:...partyRefIds)', { partyRefIds });
            }
          }),
        );
      }

      qb.orderBy('sp.created_at', 'DESC');

      const total = await qb.getCount();
      const profiles = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      const data = await this.enrichProfiles(profiles);
      return { data, total, page, limit };
    });
  }

  async get(partyRefId: string): Promise<SupplierProfileRecord> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const profile = await qr.manager.findOne(SupplierProfile, {
        where: { tenantId, partyRefId },
      });

      if (!profile) {
        throw new NotFoundException('Perfil de proveedor no encontrado.');
      }

      const party = await this.supplierPartyPort.getSupplierSummary(partyRefId);
      return this.toRecord(profile, party);
    });
  }

  async update(
    partyRefId: string,
    input: UpdateSupplierInput,
    _actor: JwtPayload,
  ): Promise<SupplierProfileRecord> {
    const validated = UpdateSupplierSchema.parse(input);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const profile = await manager.findOne(SupplierProfile, {
          where: { tenantId, partyRefId },
        });

        if (!profile) {
          throw new NotFoundException('Perfil de proveedor no encontrado.');
        }

        const updated = await manager.save(SupplierProfile, {
          ...profile,
          ...this.applyCommercialPatch(profile, validated),
        });

        const party = await this.supplierPartyPort.getSupplierSummary(partyRefId);
        return this.toRecord(updated, party);
      }),
    );
  }

  /** Rechaza proveedores con perfil INACTIVE/BLOCKED en nuevas operaciones de compra. */
  async assertEligibleForPurchasing(
    manager: EntityManager,
    tenantId: string,
    partyRefId: string,
  ): Promise<void> {
    const profile = await manager.findOne(SupplierProfile, {
      where: { tenantId, partyRefId },
    });

    if (!profile || profile.status === SupplierProfileStatus.ACTIVE) {
      return;
    }

    const statusLabel = profile.status === SupplierProfileStatus.BLOCKED ? 'bloqueado' : 'inactivo';
    throw new BadRequestException(
      `El proveedor está ${statusLabel} y no puede usarse en nuevas operaciones de compra.`,
    );
  }

  async setStatus(
    partyRefId: string,
    input: SetSupplierStatusInput,
    _actor: JwtPayload,
  ): Promise<SupplierProfileRecord> {
    const validated = SetSupplierStatusSchema.parse(input);
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      withTransaction(qr.manager, async (manager) => {
        const profile = await manager.findOne(SupplierProfile, {
          where: { tenantId, partyRefId },
        });

        if (!profile) {
          throw new NotFoundException('Perfil de proveedor no encontrado.');
        }

        if (profile.status === validated.status) {
          const party = await this.supplierPartyPort.getSupplierSummary(partyRefId);
          return this.toRecord(profile, party);
        }

        const updated = await manager.save(SupplierProfile, {
          ...profile,
          status: validated.status,
        });

        const party = await this.supplierPartyPort.getSupplierSummary(partyRefId);
        return this.toRecord(updated, party);
      }),
    );
  }

  private toEnsurePartyInput(validated: CreateSupplierInput): EnsurePartyInput {
    const input: EnsurePartyInput = {
      partyType: validated.partyType,
      documentType: validated.documentType,
      documentNumber: validated.documentNumber,
      displayName: validated.displayName,
    };

    if (validated.legalName !== undefined) {
      input.legalName = validated.legalName;
    }

    if (validated.contacts !== undefined) {
      input.contacts = validated.contacts.map((contact) => {
        const mapped: NonNullable<EnsurePartyInput['contacts']>[number] = {
          type: contact.type,
          value: contact.value,
        };

        if (contact.isPrimary !== undefined) {
          mapped.isPrimary = contact.isPrimary;
        }

        if (contact.metadata !== undefined) {
          mapped.metadata = contact.metadata;
        }

        return mapped;
      });
    }

    return input;
  }

  private applyCommercialPatch(
    profile: SupplierProfile,
    input: UpdateSupplierInput,
  ): Partial<SupplierProfile> {
    const patch: Partial<SupplierProfile> = {};

    if (input.paymentTermsDays !== undefined) {
      patch.paymentTermsDays = input.paymentTermsDays;
    }
    if (input.currency !== undefined) {
      patch.currency = input.currency;
    }
    if (input.incoterm !== undefined) {
      patch.incoterm = input.incoterm;
    }
    if (input.defaultLeadTimeDays !== undefined) {
      patch.defaultLeadTimeDays = input.defaultLeadTimeDays;
    }
    if (input.purchasingContactName !== undefined) {
      patch.purchasingContactName = input.purchasingContactName;
    }
    if (input.purchasingContactEmail !== undefined) {
      patch.purchasingContactEmail = input.purchasingContactEmail;
    }
    if (input.purchasingContactPhone !== undefined) {
      patch.purchasingContactPhone = input.purchasingContactPhone;
    }
    if (input.notes !== undefined) {
      patch.notes = input.notes;
    }

    return patch;
  }

  private async enrichProfiles(profiles: SupplierProfile[]): Promise<SupplierProfileRecord[]> {
    return Promise.all(
      profiles.map(async (profile) => {
        const party = await this.supplierPartyPort.getSupplierSummary(profile.partyRefId);
        return this.toRecord(profile, party);
      }),
    );
  }

  private toRecord(
    profile: SupplierProfile,
    party: SupplierPartySummary | null,
  ): SupplierProfileRecord {
    return {
      id: profile.id,
      supplierCode: profile.supplierCode,
      partyRefId: profile.partyRefId,
      status: profile.status,
      paymentTermsDays: profile.paymentTermsDays,
      currency: profile.currency,
      incoterm: profile.incoterm,
      defaultLeadTimeDays: profile.defaultLeadTimeDays,
      purchasingContactName: profile.purchasingContactName,
      purchasingContactEmail: profile.purchasingContactEmail,
      purchasingContactPhone: profile.purchasingContactPhone,
      notes: profile.notes,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      party,
    };
  }

  private async generateSupplierCode(
    manager: Pick<EntityManager, 'createQueryBuilder'>,
    tenantId: string,
  ): Promise<string> {
    const result = await manager
      .createQueryBuilder(SupplierProfile, 'sp')
      .select('MAX(sp.supplier_code)', 'maxValue')
      .where('sp.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ maxValue?: string | null }>();

    const latestNumber = result?.maxValue ?? 'PROV-000000';
    const latestSequence = latestNumber.slice('PROV-'.length);
    const nextSequence = (Number.parseInt(latestSequence || '0', 10) + 1)
      .toString()
      .padStart(6, '0');
    return `PROV-${nextSequence}`;
  }
}
