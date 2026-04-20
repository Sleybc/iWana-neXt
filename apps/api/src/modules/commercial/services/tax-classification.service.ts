import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
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
          isActive: true,
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
}
