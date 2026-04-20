import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CompatibilityRuleType } from '@iwana/shared';
import { CompatibilityRule } from '../entities/compatibility-rule.entity';
import { CreateCompatibilityRuleDto } from '../dto/compatibility.dto';

export interface CompatibilityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable()
export class CompatibilityService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findAll(): Promise<CompatibilityRule[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) =>
      qr.manager.find(CompatibilityRule, {
        where: { tenantId, isActive: true },
        order: { createdAt: 'DESC' },
      }),
    );
  }

  async create(dto: CreateCompatibilityRuleDto): Promise<CompatibilityRule> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    if (dto.sourceItemId === dto.targetItemId) {
      throw new BadRequestException('source_item_id y target_item_id deben ser distintos');
    }

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const entity = qr.manager.create(CompatibilityRule, {
        tenantId,
        ruleType: dto.ruleType,
        sourceItemId: dto.sourceItemId,
        targetItemId: dto.targetItemId,
        description: dto.description ?? null,
        isActive: true,
      });
      return qr.manager.save(CompatibilityRule, entity);
    });
  }

  async deactivate(id: string): Promise<void> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const rule = await qr.manager.findOne(CompatibilityRule, { where: { id, tenantId } });
      if (!rule) throw new NotFoundException(`CompatibilityRule ${id} no encontrada`);
      rule.isActive = false;
      await qr.manager.save(CompatibilityRule, rule);
    });
  }

  /**
   * Valida una combinación de ítems contra las reglas activas del tenant.
   *
   * - REQUIRES: si source está en la lista y target no → error
   * - EXCLUDES: si source y target están ambos en la lista → error
   * - REPLACES: si source y target están ambos en la lista → warning
   */
  async validateCombination(itemIds: string[]): Promise<CompatibilityValidationResult> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    const idSet = new Set(itemIds);

    const rules = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      // Cargar solo las reglas donde source o target están entre los ítems dados
      return qr.manager
        .createQueryBuilder(CompatibilityRule, 'cr')
        .where('cr.tenant_id = :tenantId', { tenantId })
        .andWhere('cr.is_active = true')
        .andWhere('(cr.source_item_id = ANY(:ids) OR cr.target_item_id = ANY(:ids))', {
          ids: itemIds,
        })
        .getMany();
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of rules) {
      const sourcePresent = idSet.has(rule.sourceItemId);
      const targetPresent = idSet.has(rule.targetItemId);

      if (rule.ruleType === CompatibilityRuleType.REQUIRES) {
        if (sourcePresent && !targetPresent) {
          errors.push(
            `El ítem ${rule.sourceItemId} requiere ${rule.targetItemId}${rule.description ? ` (${rule.description})` : ''}`,
          );
        }
      } else if (rule.ruleType === CompatibilityRuleType.EXCLUDES) {
        if (sourcePresent && targetPresent) {
          errors.push(
            `Los ítems ${rule.sourceItemId} y ${rule.targetItemId} son incompatibles${rule.description ? ` (${rule.description})` : ''}`,
          );
        }
      } else if (rule.ruleType === CompatibilityRuleType.REPLACES) {
        if (sourcePresent && targetPresent) {
          warnings.push(
            `El ítem ${rule.sourceItemId} reemplaza a ${rule.targetItemId}; considera eliminar el ítem anterior`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
