import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In } from 'typeorm';
import { SupplierProfile, TenantContext, runInTenantSchema } from '@iwana/db';
import {
  DocumentTypeParty,
  PartyRoleType,
  SupplierProfileStatus,
  type ListMeta,
} from '@iwana/shared';
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
import {
  SupplierIdentityMatch,
  SupplierPartyPort,
  SupplierPartySummary,
} from '../ports/supplier-party.port';
import { isPostgresUniqueViolation } from './inventory-postgres.util';
import { generateSequentialNumber } from '../utils/sequential-number';
import { buildPageMeta } from '../../../common/pagination';
import { clampPage } from '../../../common/pagination/clamp-page';

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

        const profile = await this.persistProfileWithUniqueCode(manager, tenantId, {
          partyRefId: partyResult.partyId,
          partyRoleId: partyResult.partyRoleId,
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
        });

        // A1: componer el resumen desde la identidad leida EN la transaccion del alta,
        // no desde una conexion nueva que no veria el Party sin confirmar.
        const party = this.supplierPartyPort.summaryFromIdentity(partyResult.identity);
        return this.toRecord(profile, party);
      }),
    );
  }

  /**
   * Inserta el perfil generando `supplier_code` con reintento acotado ante colision del unico
   * `uq_supplier_profiles_tenant_supplier_code` (RF-PROV-05/CA-04, remediacion M2). La colision del
   * unico por tercero (`uq_supplier_profiles_tenant_party_ref`) se traduce a 409.
   */
  private async persistProfileWithUniqueCode(
    manager: EntityManager,
    tenantId: string,
    payload: Omit<Partial<SupplierProfile>, 'supplierCode' | 'tenantId'>,
  ): Promise<SupplierProfile> {
    const MAX_ATTEMPTS = 6;
    const canSavepoint = typeof manager.query === 'function';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const supplierCode = await generateSequentialNumber(manager, {
        entity: SupplierProfile,
        alias: 'sp',
        columnName: 'supplier_code',
        prefix: 'PROV-',
        tenantId,
      });

      if (canSavepoint) {
        await manager.query(`SAVEPOINT supplier_code_attempt`);
      }

      try {
        const profile = await manager.save(
          SupplierProfile,
          manager.create(SupplierProfile, { tenantId, supplierCode, ...payload }),
        );

        if (canSavepoint) {
          await manager.query(`RELEASE SAVEPOINT supplier_code_attempt`);
        }

        return profile;
      } catch (error) {
        if (isPostgresUniqueViolation(error, 'uq_supplier_profiles_tenant_party_ref')) {
          throw new ConflictException('Ya existe un perfil de proveedor para este tercero.');
        }

        if (isPostgresUniqueViolation(error, 'uq_supplier_profiles_tenant_supplier_code')) {
          // La transaccion queda abortada tras el 23505: hay que volver al savepoint
          // antes de reintentar con el siguiente numero libre.
          if (canSavepoint) {
            await manager.query(`ROLLBACK TO SAVEPOINT supplier_code_attempt`);
          }
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException(
      'No fue posible generar un código de proveedor único, intente nuevamente.',
    );
  }

  async list(query: ListSuppliersQueryInput): Promise<{
    data: SupplierProfileRecord[];
    meta: ListMeta;
    /** @deprecated Dual-emit ADR-065 — leer `meta`. */
    total: number;
    /** @deprecated Dual-emit ADR-065 — leer `meta`. */
    page: number;
    /** @deprecated Dual-emit ADR-065 — leer `meta`. */
    limit: number;
  }> {
    const validated = ListSuppliersQuerySchema.parse(query);
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const { status, search } = validated;
    const { page, limit } = clampPage(validated.page, validated.limit);

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
            where
              .where('sp.supplier_code ILIKE :searchPattern', { searchPattern })
              .orWhere('sp.purchasing_contact_name ILIKE :searchPattern', { searchPattern })
              .orWhere('sp.purchasing_contact_email ILIKE :searchPattern', { searchPattern });

            if (partyRefIds.length > 0) {
              where.orWhere('sp.party_ref_id IN (:...partyRefIds)', { partyRefIds });
            }
          }),
        );
      }

      qb.orderBy('sp.created_at', 'DESC').addOrderBy('sp.id', 'DESC');

      const total = await qb.getCount();
      const profiles = await qb
        .skip((page - 1) * limit)
        .take(limit)
        .getMany();

      const data = await this.enrichProfiles(profiles);
      const meta = buildPageMeta({
        total,
        page,
        limit,
        randomAccess: true,
        sortableFields: [],
      });
      return { data, meta, total, page, limit };
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

  /**
   * Reutilizacion de identidad (A2): busca un tercero por (tipo, numero) de documento para que la UI
   * confirme la identidad antes de dar de alta. Informa si ese tercero ya tiene perfil de proveedor.
   */
  async lookupByDocument(
    documentType: DocumentTypeParty,
    documentNumber: string,
  ): Promise<{ match: SupplierIdentityMatch | null; hasSupplierProfile: boolean }> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    const match = await this.supplierPartyPort.findIdentityByDocument(documentType, documentNumber);
    if (!match) {
      return { match: null, hasSupplierProfile: false };
    }

    const hasSupplierProfile = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) =>
        (await qr.manager.findOne(SupplierProfile, {
          where: { tenantId, partyRefId: match.partyRefId },
        })) !== null,
    );

    return { match, hasSupplierProfile };
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

  /**
   * Rechaza proveedores con perfil INACTIVE/BLOCKED en nuevas operaciones de compra.
   *
   * NO verifica existencia del tercero ni su rol en MOD08: la ausencia de perfil comercial es
   * legítima (proveedor todavía sin ficha). Esa verificación corresponde al `SupplierPartyPort`.
   * El nombre lo dice explícitamente para que ningún llamante lo tome por una guarda de identidad.
   */
  async assertNotBlockedForPurchasing(
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

    throw this.blockedProfileError(profile.status);
  }

  /**
   * Variante por lote de {@link assertNotBlockedForPurchasing}: una sola consulta para todo el
   * conjunto, en vez de un round-trip por proveedor dentro de la transacción del llamador.
   */
  async assertNotBlockedForPurchasingBatch(
    manager: EntityManager,
    tenantId: string,
    partyRefIds: string[],
  ): Promise<void> {
    if (partyRefIds.length === 0) {
      return;
    }

    const profiles = await manager.find(SupplierProfile, {
      where: { tenantId, partyRefId: In(partyRefIds) },
    });

    const blocked = profiles.find((profile) => profile.status !== SupplierProfileStatus.ACTIVE);

    if (blocked) {
      throw this.blockedProfileError(blocked.status);
    }
  }

  private blockedProfileError(status: SupplierProfileStatus): BadRequestException {
    const statusLabel = status === SupplierProfileStatus.BLOCKED ? 'bloqueado' : 'inactivo';
    return new BadRequestException(
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

    if (validated.address !== undefined) input.address = validated.address;
    if (validated.latitude !== undefined) input.latitude = validated.latitude;
    if (validated.longitude !== undefined) input.longitude = validated.longitude;
    if (validated.city !== undefined) input.city = validated.city;
    if (validated.department !== undefined) input.department = validated.department;

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
    if (profiles.length === 0) return [];
    const summaryMap = await this.supplierPartyPort.getSupplierSummariesBatch(
      profiles.map((p) => p.partyRefId),
    );
    return profiles.map((profile) =>
      this.toRecord(profile, summaryMap.get(profile.partyRefId) ?? null),
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
}
