import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { TaxOrigin } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';
import {
  CreateTaxDefinitionSchema,
  CreateTaxDefinitionInput,
} from '../dto/create-tax-definition.dto';
import {
  UpdateTaxDefinitionSchema,
  UpdateTaxDefinitionInput,
} from '../dto/update-tax-definition.dto';
import { ListTaxDefinitionQueryDto } from '../dto/list-tax-definition-query.dto';

@Injectable()
export class TaxDefinitionService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Lista todas las definiciones tributarias del tenant con filtros opcionales.
   * Por defecto excluye las inactivas; usar `isActive=true` para incluirlas.
   * El filtro de contexto incluye registros con `BOTH`.
   */
  async findAll(query: ListTaxDefinitionQueryDto): Promise<TaxDefinition[]> {
    const { schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // En expresiones SQL string del QueryBuilder se deben usar nombres físicos de columnas.
      let qb = qr.manager.createQueryBuilder(TaxDefinition, 'td').where('td.deleted_at IS NULL');

      // Si isActive no se proporciona o es true, filtrar solo activos
      if (query.isActive !== false) {
        qb = qb.andWhere('td.is_active = :isActive', { isActive: true });
      }

      if (query.context) {
        qb = qb.andWhere('(td.context = :ctx OR td.context = :both)', {
          ctx: query.context,
          both: 'BOTH',
        });
      }

      if (query.category) {
        qb = qb.andWhere('td.category = :cat', { cat: query.category });
      }

      if (query.origin) {
        qb = qb.andWhere('td.origin = :origin', { origin: query.origin });
      }

      return qb.orderBy('td.code', 'ASC').getMany();
    });
  }

  /**
   * Busca una definición tributaria por ID (excluye eliminados soft).
   * Arroja NotFoundException si no existe.
   */
  async findOne(id: string): Promise<TaxDefinition> {
    const { schemaName } = TenantContext.getOrThrow();

    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(TaxDefinition, {
        where: { id, deletedAt: IsNull() },
      }),
    );

    if (!entity) {
      throw new NotFoundException(`TaxDefinition ${id} no encontrada`);
    }

    return entity;
  }

  /**
   * Crea una nueva definición tributaria con origen CUSTOM.
   * Valida unicidad del código (case-insensitive, normalizado a UPPER).
   */
  async create(input: CreateTaxDefinitionInput): Promise<TaxDefinition> {
    const { schemaName } = TenantContext.getOrThrow();

    // Normalizar campos antes de validar para mejorar UX en códigos ingresados en minúsculas.
    const normalizedInput = {
      ...input,
      code: input.code?.trim().toUpperCase(),
      name: input.name?.trim(),
    };

    // Validación Zod en boundary de servicio
    const parseResult = CreateTaxDefinitionSchema.safeParse(normalizedInput);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    const data = parseResult.data;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar unicidad del código (excluir soft-deleted)
      const existing = await qr.manager.findOne(TaxDefinition, {
        where: { code: data.code, deletedAt: IsNull() },
      });
      if (existing) {
        throw new BadRequestException(`Ya existe una definición con código '${data.code}'`);
      }

      // Crear entidad con origin forzado a CUSTOM
      const entity = qr.manager.create(TaxDefinition, {
        code: data.code,
        name: data.name,
        category: data.category,
        jurisdictionLevel: data.jurisdictionLevel,
        municipalityCode: data.municipalityCode ?? null,
        baseRate:
          data.baseRate !== undefined && data.baseRate !== null ? String(data.baseRate) : null,
        treatment: data.treatment,
        context: data.context,
        origin: TaxOrigin.CUSTOM, // Forzado independiente del input
        isActive: data.isActive ?? true,
        notes: data.notes ?? null,
      });

      return qr.manager.save(TaxDefinition, entity);
    });
  }

  /**
   * Actualiza una definición tributaria existente.
   * Solo campos proporcionados se actualizan (partial).
   */
  async update(id: string, input: UpdateTaxDefinitionInput): Promise<TaxDefinition> {
    const { schemaName } = TenantContext.getOrThrow();

    // Validación Zod en boundary de servicio
    const parseResult = UpdateTaxDefinitionSchema.safeParse(input);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }

    const data = parseResult.data;

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { id, deletedAt: IsNull() },
      });

      if (!entity) {
        throw new NotFoundException(`TaxDefinition ${id} no encontrada`);
      }

      // Aplicar solo campos presentes en el input (partial update)
      if (data.name !== undefined) entity.name = data.name;
      if (data.category !== undefined) entity.category = data.category;
      if (data.jurisdictionLevel !== undefined) entity.jurisdictionLevel = data.jurisdictionLevel;
      if (data.municipalityCode !== undefined)
        entity.municipalityCode = data.municipalityCode ?? null;
      if (data.baseRate !== undefined) {
        entity.baseRate = data.baseRate !== null ? String(data.baseRate) : null;
      }
      if (data.treatment !== undefined) entity.treatment = data.treatment;
      if (data.context !== undefined) entity.context = data.context;
      if (data.isActive !== undefined) entity.isActive = data.isActive;
      if (data.notes !== undefined) entity.notes = data.notes ?? null;

      return qr.manager.save(TaxDefinition, entity);
    });
  }

  /**
   * Marca como eliminado (soft delete) una definición tributaria.
   * Desactiva automáticamente el registro al eliminarlo.
   */
  async softDelete(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { id, deletedAt: IsNull() },
      });

      if (!entity) {
        throw new NotFoundException(`TaxDefinition ${id} no encontrada`);
      }

      entity.deletedAt = new Date();
      entity.isActive = false;

      await qr.manager.save(TaxDefinition, entity);
    });
  }
}
