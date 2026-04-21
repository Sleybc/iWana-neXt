import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TaxDefinition } from '../entities/tax-definition.entity';
import { ITaxCatalogReadPort } from './tax-catalog-read.port';

/**
 * Adaptador de lectura del catálogo de impuestos.
 * Implementa ITaxCatalogReadPort con TypeORM; el tenant se resuelve
 * via search_path establecido por runInTenantSchema() antes de este punto.
 */
@Injectable()
export class TaxCatalogReadAdapter extends ITaxCatalogReadPort {
  constructor(
    @InjectRepository(TaxDefinition)
    private readonly repo: Repository<TaxDefinition>,
  ) {
    super();
  }

  async findActiveByCode(code: string): Promise<TaxDefinition | null> {
    return this.repo.findOne({
      where: { code, isActive: true, deletedAt: IsNull() },
    });
  }

  async findAllActive(): Promise<TaxDefinition[]> {
    return this.repo.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { category: 'ASC', code: 'ASC' },
    });
  }
}
