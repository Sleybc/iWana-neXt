import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TaxContext } from '@iwana/shared';
import { runInTenantSchema, TenantContext } from '@iwana/db';
import { DataSource, IsNull } from 'typeorm';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { TaxCatalogReadPort, TaxDefinitionSnapshot } from './tax-catalog-read.port';

/**
 * Adaptador de lectura del catálogo de impuestos.
 * Implementa TaxCatalogReadPort con TypeORM y runInTenantSchema para
 * aislamiento de tenant autónomo — no depende de search_path del llamador.
 * Ref: HLD-MOD07 §5, ADR-029
 */
@Injectable()
export class TaxCatalogReadAdapter extends TaxCatalogReadPort {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  private toSnapshot(entity: TaxDefinition): TaxDefinitionSnapshot {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      category: entity.category,
      jurisdictionLevel: entity.jurisdictionLevel,
      municipalityCode: entity.municipalityCode,
      baseRate: entity.baseRate,
      treatment: entity.treatment,
      context: entity.context,
      origin: entity.origin,
      isActive: entity.isActive,
      notes: entity.notes,
    };
  }

  async findActiveByCode(code: string): Promise<TaxDefinitionSnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { code, isActive: true, deletedAt: IsNull() },
      });
      return entity ? this.toSnapshot(entity) : null;
    });
  }

  async listByContext(context: TaxContext): Promise<TaxDefinitionSnapshot[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entities = await qr.manager.find(TaxDefinition, {
        where: [
          { context, isActive: true, deletedAt: IsNull() },
          { context: TaxContext.BOTH, isActive: true, deletedAt: IsNull() },
        ],
        order: { category: 'ASC', code: 'ASC' },
      });
      return entities.map((e) => this.toSnapshot(e));
    });
  }

  async resolveSystemPreset(code: string): Promise<TaxDefinitionSnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { code, deletedAt: IsNull() },
      });
      return entity ? this.toSnapshot(entity) : null;
    });
  }

  async findById(id: string): Promise<TaxDefinitionSnapshot | null> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxDefinition, {
        where: { id, isActive: true, deletedAt: IsNull() },
      });
      return entity ? this.toSnapshot(entity) : null;
    });
  }
}
