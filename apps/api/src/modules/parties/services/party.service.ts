import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { PartyStatus, PartyRoleStatus } from '@iwana/shared';
import { Party } from '../entities/party.entity';
import { PartyRole } from '../entities/party-role.entity';
import { CreatePartyDto, CreatePartySchema } from '../dto/create-party.dto';
import { UpdatePartyDto } from '../dto/update-party.dto';
import { ListPartiesDto } from '../dto/list-parties.dto';
import { clampPage } from '../../../common/pagination/clamp-page';
import { applySort } from '../../../common/pagination/apply-sort';
import { buildPageMeta } from '../../../common/pagination/build-page-meta';
import type { ListMeta } from '@iwana/shared';

export interface PaginatedParties {
  data: Party[];
  /** @deprecated Usar meta.total */
  total: number;
  /** @deprecated Usar meta.page */
  page: number;
  /** @deprecated Usar meta.limit */
  limit: number;
  meta: ListMeta;
}

/**
 * Campos ordenables del recurso Party.
 * Vacío hasta Ola 2 (creación de índices compuestos).
 * ADR-065 Ola 1.
 */
const SORTABLE_FIELDS: string[] = [];

@Injectable()
export class PartyService {
  private readonly logger = new Logger(PartyService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async create(dto: CreatePartyDto): Promise<Party> {
    // Validación Zod en boundary
    const validated = CreatePartySchema.parse(dto);
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar unicidad (documentType, documentNumber) activo
      const existing = await qr.manager.findOne(Party, {
        where: {
          documentType: validated.documentType,
          documentNumber: validated.documentNumber,
          deletedAt: IsNull(),
        },
      });

      if (existing) {
        // PII: no loguear documentNumber
        this.logger.warn(
          `[PartyService] Conflicto de documento tipo=${validated.documentType} — party ya existe`,
        );
        throw new ConflictException(
          `Ya existe un party activo con ese documento (${validated.documentType})`,
        );
      }

      const party = qr.manager.create(Party, {
        partyType: validated.partyType,
        documentType: validated.documentType,
        documentNumber: validated.documentNumber,
        verificationDigit: validated.verificationDigit ?? null,
        displayName: validated.displayName,
        legalName: validated.legalName ?? null,
        birthDate: validated.birthDate ? new Date(validated.birthDate) : null,
        incorporationDate: validated.incorporationDate
          ? new Date(validated.incorporationDate)
          : null,
        notes: validated.notes ?? null,
        status: PartyStatus.ACTIVE,
      });

      await qr.manager.save(Party, party);
      this.logger.log(`[PartyService] Party creado id=${party.id} tipo=${party.partyType}`);
      return party;
    });
  }

  async findAll(dto: ListPartiesDto): Promise<PaginatedParties> {
    const { schemaName } = TenantContext.getOrThrow();
    // D-5 / R-4: validar paginación antes de ocupar conexión del pool.
    const { page, limit } = clampPage(dto.page ?? 1, dto.limit ?? 20);
    const skip = (page - 1) * limit;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const qb = qr.manager.createQueryBuilder(Party, 'p').where('p.deleted_at IS NULL');

      if (dto.status) qb.andWhere('p.status = :status', { status: dto.status });
      if (dto.documentType)
        qb.andWhere('p.document_type = :docType', { docType: dto.documentType });
      if (dto.search) qb.andWhere('p.display_name ILIKE :search', { search: `%${dto.search}%` });
      if (dto.role) {
        qb.innerJoin(
          'party_role',
          'pr',
          "pr.party_id = p.id AND pr.role = :role AND pr.status = 'ACTIVE'",
          {
            role: dto.role,
          },
        );
      }

      // Default primero: TypeORM orderBy() reemplaza el ORDER BY acumulado (O-7(b)).
      qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC');
      const sortResult = applySort(qb, SORTABLE_FIELDS, dto.sortBy, dto.sortDir);

      const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
      return {
        data,
        total,
        page,
        limit,
        meta: buildPageMeta({
          total,
          page,
          limit,
          randomAccess: true,
          sortableFields: SORTABLE_FIELDS,
          sortBy: sortResult.appliedSortBy ?? undefined,
          sortDir: sortResult.appliedSortDir ?? undefined,
        }),
      };
    });
  }

  async findOne(id: string): Promise<Party> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const party = await qr.manager.findOne(Party, {
        where: { id, deletedAt: IsNull() },
        relations: ['contacts', 'roles'],
      });

      if (!party) {
        throw new NotFoundException(`Party ${id} no encontrado`);
      }

      return party;
    });
  }

  async update(id: string, dto: UpdatePartyDto): Promise<Party> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const party = await qr.manager.findOne(Party, { where: { id, deletedAt: IsNull() } });

      if (!party) {
        throw new NotFoundException(`Party ${id} no encontrado`);
      }

      // No permitir cambiar documento si tiene roles activos
      const hasActiveRoles = await qr.manager.count(PartyRole, {
        where: { partyId: id, status: PartyRoleStatus.ACTIVE },
      });

      if (
        hasActiveRoles > 0 &&
        party.status === PartyStatus.ACTIVE &&
        (dto.documentType || dto.documentNumber)
      ) {
        throw new ForbiddenException(
          'No se puede cambiar el documento de un party activo con roles activos',
        );
      }

      Object.assign(party, {
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.legalName !== undefined && { legalName: dto.legalName }),
        ...(dto.birthDate !== undefined && {
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        }),
        ...(dto.incorporationDate !== undefined && {
          incorporationDate: dto.incorporationDate ? new Date(dto.incorporationDate) : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.verificationDigit !== undefined && { verificationDigit: dto.verificationDigit }),
        ...(hasActiveRoles === 0 && dto.documentType && { documentType: dto.documentType }),
        ...(hasActiveRoles === 0 && dto.documentNumber && { documentNumber: dto.documentNumber }),
      });

      await qr.manager.save(Party, party);
      this.logger.log(`[PartyService] Party actualizado id=${id}`);
      return party;
    });
  }

  async softDelete(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const party = await qr.manager.findOne(Party, { where: { id, deletedAt: IsNull() } });

      if (!party) {
        throw new NotFoundException(`Party ${id} no encontrado`);
      }

      party.status = PartyStatus.INACTIVE;
      party.deletedAt = new Date();
      await qr.manager.save(Party, party);
      this.logger.log(`[PartyService] Party soft-deleted id=${id}`);
    });
  }
}
