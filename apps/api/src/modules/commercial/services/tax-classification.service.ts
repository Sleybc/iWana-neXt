import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CustomerSegment } from '@iwana/shared';
import { TaxClassification } from '../entities/tax-classification.entity';
import { TaxRule } from '../entities/tax-rule.entity';
import {
  CreateTaxClassificationDto,
  CreateTaxRuleDto,
  UpdateTaxRuleDto,
  UpdateTaxClassificationDto,
} from '../dto/tax.dto';

@Injectable()
export class TaxClassificationService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // ─── Clasificaciones ──────────────────────────────────────────────────────

  async findAllClassifications(): Promise<TaxClassification[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(TaxClassification, {
        where: { tenantId },
        order: { code: 'ASC' },
      }),
    );
  }

  async findOneClassification(id: string): Promise<TaxClassification> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const entity = await runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.findOne(TaxClassification, { where: { id, tenantId } }),
    );
    if (!entity) throw new NotFoundException(`TaxClassification ${id} no encontrada`);
    return entity;
  }

  async createClassification(dto: CreateTaxClassificationDto): Promise<TaxClassification> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar código único por tenant
      const existing = await qr.manager.findOne(TaxClassification, {
        where: { tenantId, code: dto.code },
      });
      if (existing) {
        throw new BadRequestException(`Ya existe una clasificación con código '${dto.code}'`);
      }

      const entity = qr.manager.create(TaxClassification, {
        tenantId,
        code: dto.code.toUpperCase(),
        name: dto.name,
        description: dto.description ?? null,
        isActive: true,
      });
      return qr.manager.save(TaxClassification, entity);
    });
  }

  async updateClassification(
    id: string,
    dto: UpdateTaxClassificationDto,
  ): Promise<TaxClassification> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxClassification, { where: { id, tenantId } });
      if (!entity) throw new NotFoundException(`TaxClassification ${id} no encontrada`);
      Object.assign(entity, dto);
      return qr.manager.save(TaxClassification, entity);
    });
  }

  // ─── Reglas tributarias ───────────────────────────────────────────────────

  async findRulesByClassification(taxClassificationId: string): Promise<TaxRule[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(TaxRule, {
        where: { tenantId, taxClassificationId, isActive: true },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async findAllRules(taxClassificationId?: string): Promise<TaxRule[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(TaxRule, {
        where: {
          tenantId,
          ...(taxClassificationId ? { taxClassificationId } : {}),
        },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async createRule(dto: CreateTaxRuleDto, createdBy: string): Promise<TaxRule> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Verificar que la clasificación existe y pertenece al tenant
      const classification = await qr.manager.findOne(TaxClassification, {
        where: { id: dto.taxClassificationId, tenantId },
      });
      if (!classification) {
        throw new NotFoundException(`TaxClassification ${dto.taxClassificationId} no encontrada`);
      }

      const entity = qr.manager.create(TaxRule, {
        tenantId,
        taxClassificationId: dto.taxClassificationId,
        customerSegment: (dto.customerSegment as TaxRule['customerSegment']) ?? null,
        estratoMin: dto.estratoMin ?? null,
        estratoMax: dto.estratoMax ?? null,
        // Nuevo modelo de estrato (migration 020)
        stratumFrom: dto.stratumFrom ?? null,
        stratumTo: dto.stratumTo ?? null,
        priority: dto.priority ?? 0,
        municipalityCode: dto.municipalityCode ?? null,
        taxType: dto.taxType,
        ratePercentage: dto.ratePercentage,
        isActive: true,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        createdBy,
      });
      return qr.manager.save(TaxRule, entity);
    });
  }

  async deactivateRule(id: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rule = await qr.manager.findOne(TaxRule, { where: { id, tenantId } });
      if (!rule) throw new NotFoundException(`TaxRule ${id} no encontrada`);
      rule.isActive = false;
      await qr.manager.save(TaxRule, rule);
    });
  }

  async updateRule(id: string, dto: UpdateTaxRuleDto): Promise<TaxRule> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rule = await qr.manager.findOne(TaxRule, { where: { id, tenantId } });
      if (!rule) throw new NotFoundException(`TaxRule ${id} no encontrada`);

      if (dto.taxClassificationId) {
        const classification = await qr.manager.findOne(TaxClassification, {
          where: { id: dto.taxClassificationId, tenantId },
        });
        if (!classification) {
          throw new NotFoundException(`TaxClassification ${dto.taxClassificationId} no encontrada`);
        }
      }

      Object.assign(rule, {
        ...(dto.taxClassificationId !== undefined && {
          taxClassificationId: dto.taxClassificationId,
        }),
        ...(dto.customerSegment !== undefined && {
          customerSegment: dto.customerSegment as TaxRule['customerSegment'],
        }),
        ...(dto.estratoMin !== undefined && { estratoMin: dto.estratoMin }),
        ...(dto.estratoMax !== undefined && { estratoMax: dto.estratoMax }),
        ...(dto.municipalityCode !== undefined && { municipalityCode: dto.municipalityCode }),
        ...(dto.taxType !== undefined && { taxType: dto.taxType }),
        ...(dto.ratePercentage !== undefined && { ratePercentage: dto.ratePercentage }),
        ...(dto.validFrom !== undefined && { validFrom: new Date(dto.validFrom) }),
        ...(dto.validTo !== undefined && { validTo: new Date(dto.validTo) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      });

      return qr.manager.save(TaxRule, rule);
    });
  }

  /**
   * Elimina físicamente una clasificación tributaria.
   * Rechaza la operación si existen reglas tributarias asociadas.
   */
  async deactivateClassification(id: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = await qr.manager.findOne(TaxClassification, { where: { id, tenantId } });
      if (!entity) throw new NotFoundException(`TaxClassification ${id} no encontrada`);
      const relatedRulesCount = await qr.manager.count(TaxRule, {
        where: { tenantId, taxClassificationId: id },
      });
      if (relatedRulesCount > 0) {
        throw new BadRequestException(
          'No se puede eliminar la clasificación porque tiene reglas tributarias asociadas.',
        );
      }
      await qr.manager.remove(TaxClassification, entity);
    });
  }

  /**
   * Resuelve la clasificación tributaria aplicable dado un segmento y estrato.
   * Lógica: filtrar reglas activas por segmento y rango de estrato,
   * ordenar por priority DESC y retornar la clasificación de la primera regla.
   */
  async resolveClassification(
    segment: CustomerSegment,
    stratum?: number,
  ): Promise<TaxClassification> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      let qb = qr.manager
        .createQueryBuilder(TaxRule, 'tr')
        .innerJoinAndSelect('tr.taxClassification', 'tc')
        .where('tr.tenantId = :tenantId', { tenantId })
        .andWhere('tr.isActive = true')
        .andWhere('(tr.customerSegment = :segment OR tr.customerSegment IS NULL)', { segment });

      if (stratum !== undefined) {
        qb = qb.andWhere(
          '((tr.stratumFrom IS NULL AND tr.stratumTo IS NULL) OR (:stratum BETWEEN tr.stratumFrom AND tr.stratumTo))',
          { stratum },
        );
      } else {
        qb = qb.andWhere('tr.stratumFrom IS NULL AND tr.stratumTo IS NULL');
      }

      const rule = await qb.orderBy('tr.priority', 'DESC').getOne();
      if (!rule?.taxClassification) {
        throw new NotFoundException(
          `No se encontró clasificación tributaria para segmento=${segment}${stratum !== undefined ? `, estrato=${stratum}` : ''}`,
        );
      }
      return rule.taxClassification;
    });
  }
}
