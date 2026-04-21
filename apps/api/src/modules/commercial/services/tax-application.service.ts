import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { CustomerSegment, TaxApplicationSnapshot } from '@iwana/shared';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import { TaxRule } from '../entities/tax-rule.entity';
import { TaxRuleApplication } from '../entities/tax-rule-application.entity';
import { TaxClassification } from '../entities/tax-classification.entity';
import { TaxClassificationService } from './tax-classification.service';
import { ITaxApplicationReadPort } from '../ports/tax-application-read.port';

/**
 * Servicio de resolución de aplicaciones tributarias.
 * Implementa ITaxApplicationReadPort para ser consumido por CrmModule y BillingModule.
 *
 * Feature flag TAXATION_USE_CATALOG:
 *  - 'false' (default): motor legacy vía TaxClassificationService.
 *  - 'true': nuevo motor con tabla puente tax_rule_applications + catálogo de TaxationModule.
 *
 * Cuando useCatalog=true y la tabla puente está vacía para la regla ganadora,
 * cae automáticamente al motor legacy (compatibilidad durante backfill).
 *
 * Ref: HLD-MOD06-TAXATION-DEPENDENCY-v1.1-addendum §5, ADR-031
 */
@Injectable()
export class TaxApplicationService extends ITaxApplicationReadPort {
  private readonly logger = new Logger(TaxApplicationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Inject(TaxCatalogReadPort) private readonly taxCatalogPort: TaxCatalogReadPort,
    private readonly taxClassificationService: TaxClassificationService,
  ) {
    super();
  }

  // ─── Puerto público (ITaxApplicationReadPort) ───────────────────────────

  async resolve(
    segment: CustomerSegment,
    stratum?: number,
    municipalityCode?: string,
  ): Promise<TaxApplicationSnapshot[]> {
    const useCatalog = this.configService.get<string>('TAXATION_USE_CATALOG', 'false') === 'true';

    if (!useCatalog) {
      return this._legacyResolve(segment, stratum);
    }

    return this._catalogResolve(segment, stratum, municipalityCode);
  }

  // ─── Simulador ──────────────────────────────────────────────────────────

  /**
   * Simula la resolución tributaria explicando la regla ganadora.
   * Útil para el TaxSimulatorPanel en el portal del tenant.
   */
  async simulate(
    segment: CustomerSegment,
    stratum?: number,
    municipalityCode?: string,
  ): Promise<{
    applications: TaxApplicationSnapshot[];
    winnerRuleId: string | null;
    reason: string;
  }> {
    const useCatalog = this.configService.get<string>('TAXATION_USE_CATALOG', 'false') === 'true';

    if (!useCatalog) {
      const applications = await this._legacyResolve(segment, stratum);
      return {
        applications,
        winnerRuleId: null,
        reason:
          'Motor legacy activo (TAXATION_USE_CATALOG=false). Clasificaciones tributarias existentes aplicadas.',
      };
    }

    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const { rule, bridgeApps } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const foundRule = await this._findMatchingRule(
          qr.manager,
          tenantId,
          segment,
          stratum,
          municipalityCode,
        );
        if (!foundRule) return { rule: null, bridgeApps: [] as TaxRuleApplication[] };

        const apps = await qr.manager.find(TaxRuleApplication, {
          where: { taxRuleId: foundRule.id, isActive: true },
        });
        return { rule: foundRule, bridgeApps: apps };
      },
    );

    if (!rule) {
      return {
        applications: [],
        winnerRuleId: null,
        reason: `No se encontró regla tributaria activa para segmento=${segment}${stratum !== undefined ? `, estrato=${stratum}` : ''}${municipalityCode ? `, municipio=${municipalityCode}` : ''}.`,
      };
    }

    if (bridgeApps.length === 0) {
      // Sin aplicaciones en la tabla puente → fallback legacy durante backfill
      this.logger.warn(
        `[TaxApplicationService] Regla ${rule.id} sin aplicaciones en catálogo — usando motor legacy`,
      );
      const legacyApps = await this._legacyResolve(segment, stratum);
      return {
        applications: legacyApps,
        winnerRuleId: rule.id,
        reason: `Regla de prioridad ${rule.priority} encontrada pero sin aplicaciones en catálogo. Resultado del motor legacy aplicado.`,
      };
    }

    const applications = await this._buildSnapshots(rule, bridgeApps);

    return {
      applications,
      winnerRuleId: rule.id,
      reason: `Regla de prioridad ${rule.priority} aplicada: segmento ${segment}${stratum !== undefined ? `, estrato ${stratum}` : ''}${municipalityCode ? `, municipio ${municipalityCode}` : ''}. ${applications.length} impuesto(s) aplicable(s).`,
    };
  }

  // ─── Motor de catálogo (useCatalog=true) ───────────────────────────────

  private async _catalogResolve(
    segment: CustomerSegment,
    stratum?: number,
    municipalityCode?: string,
  ): Promise<TaxApplicationSnapshot[]> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();

    const { rule, bridgeApps } = await runInTenantSchema(
      this.dataSource,
      schemaName,
      async (qr) => {
        const foundRule = await this._findMatchingRule(
          qr.manager,
          tenantId,
          segment,
          stratum,
          municipalityCode,
        );
        if (!foundRule) return { rule: null, bridgeApps: [] as TaxRuleApplication[] };

        const apps = await qr.manager.find(TaxRuleApplication, {
          where: { taxRuleId: foundRule.id, isActive: true },
        });
        return { rule: foundRule, bridgeApps: apps };
      },
    );

    if (!rule) return this._legacyResolve(segment, stratum);
    if (bridgeApps.length === 0) return this._legacyResolve(segment, stratum);

    return this._buildSnapshots(rule, bridgeApps);
  }

  /**
   * Encuentra la regla de aplicación tributaria de mayor prioridad
   * que coincida con el segmento, estrato y municipio dados.
   */
  private async _findMatchingRule(
    manager: EntityManager,
    tenantId: string,
    segment: CustomerSegment,
    stratum?: number,
    municipalityCode?: string,
  ): Promise<TaxRule | null> {
    let qb = manager
      .createQueryBuilder(TaxRule, 'tr')
      .where('tr.tenantId = :tenantId', { tenantId })
      .andWhere('tr.isActive = true')
      .andWhere('(tr.customerSegment = :segment OR tr.customerSegment IS NULL)', { segment });

    if (stratum !== undefined) {
      qb = qb.andWhere(
        '((tr.stratumFrom IS NULL AND tr.stratumTo IS NULL) OR (:stratum BETWEEN tr.stratumFrom AND tr.stratumTo))',
        { stratum },
      );
    }

    if (municipalityCode) {
      qb = qb.andWhere('(tr.municipalityCode = :municipalityCode OR tr.municipalityCode IS NULL)', {
        municipalityCode,
      });
    }

    return qb.orderBy('tr.priority', 'DESC').getOne();
  }

  /**
   * Construye la lista de TaxApplicationSnapshot cruzando las filas de la tabla
   * puente con el catálogo de TaxationModule (via ITaxCatalogReadPort).
   */
  private async _buildSnapshots(
    rule: TaxRule,
    applications: TaxRuleApplication[],
  ): Promise<TaxApplicationSnapshot[]> {
    const snapshots: TaxApplicationSnapshot[] = [];

    for (const app of applications) {
      const taxDef = await this.taxCatalogPort.findById(app.taxDefinitionId);
      if (!taxDef) {
        this.logger.warn(
          `[TaxApplicationService] TaxDefinition ${app.taxDefinitionId} no encontrada en catálogo — omitida`,
        );
        continue;
      }

      const effectiveRate = this._computeEffectiveRate(app, taxDef.treatment, taxDef.baseRate);

      snapshots.push({
        taxDefinitionId: app.taxDefinitionId,
        treatment: app.treatment,
        effectiveRate,
        ruleId: rule.id,
        priorityMatched: rule.priority,
      });
    }

    return snapshots;
  }

  /**
   * Calcula la tasa efectiva a partir de la aplicación y la definición del catálogo.
   * - Si hay rateOverride en la aplicación → usar ese valor.
   * - Si el tratamiento es EXEMPT o EXCLUDED → null (sin tasa).
   * - Sino → usar baseRate del catálogo, o null si no tiene.
   */
  private _computeEffectiveRate(
    application: TaxRuleApplication,
    treatment: string,
    baseRate: string | null,
  ): number | null {
    if (application.rateOverride !== null && application.rateOverride !== undefined) {
      return Number(application.rateOverride);
    }
    if (treatment === 'EXEMPT' || treatment === 'EXCLUDED') {
      return null;
    }
    return baseRate !== null ? parseFloat(baseRate) : null;
  }

  // ─── CRUD de TaxRuleApplication ──────────────────────────────────────────

  async listApplications(): Promise<TaxRuleApplication[]> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager.find(TaxRuleApplication, {
        order: { priority: 'ASC', createdAt: 'DESC' },
      });
    });
  }

  async createApplication(dto: {
    taxRuleId: string;
    taxDefinitionId: string;
    treatment: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
    rateOverride?: number | null;
    priority?: number;
  }): Promise<TaxRuleApplication> {
    const { schemaName, tenantId } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const app = qr.manager.create(TaxRuleApplication, {
        tenantId,
        taxRuleId: dto.taxRuleId,
        taxDefinitionId: dto.taxDefinitionId,
        treatment: dto.treatment,
        rateOverride: dto.rateOverride != null ? String(dto.rateOverride) : null,
        priority: dto.priority ?? 0,
        isActive: true,
      });
      return qr.manager.save(TaxRuleApplication, app);
    });
  }

  async updateApplication(
    id: string,
    dto: {
      treatment?: 'STANDARD' | 'EXEMPT' | 'EXCLUDED' | 'FIXED';
      rateOverride?: number | null;
      priority?: number;
      isActive?: boolean;
    },
  ): Promise<TaxRuleApplication> {
    const { schemaName } = TenantContext.getOrThrow();
    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const existing = await qr.manager.findOne(TaxRuleApplication, { where: { id } });
      if (!existing) throw new NotFoundException(`TaxRuleApplication ${id} no encontrada`);
      if (dto.treatment !== undefined) existing.treatment = dto.treatment;
      if (dto.rateOverride !== undefined)
        existing.rateOverride = dto.rateOverride != null ? String(dto.rateOverride) : null;
      if (dto.priority !== undefined) existing.priority = dto.priority;
      if (dto.isActive !== undefined) existing.isActive = dto.isActive;
      return qr.manager.save(TaxRuleApplication, existing);
    });
  }

  async deleteApplication(id: string): Promise<void> {
    const { schemaName } = TenantContext.getOrThrow();
    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      await qr.manager.delete(TaxRuleApplication, { id });
    });
  }

  // ─── Motor legacy (useCatalog=false o fallback) ─────────────────────────

  /**
   * Resolución legacy: usa TaxClassificationService y adapta el resultado
   * al formato TaxApplicationSnapshot para compatibilidad durante el backfill.
   */
  private async _legacyResolve(
    segment: CustomerSegment,
    stratum?: number,
  ): Promise<TaxApplicationSnapshot[]> {
    try {
      const classification = await this.taxClassificationService.resolveClassification(
        segment,
        stratum,
      );
      return this._adaptClassificationToSnapshots(classification);
    } catch {
      return [];
    }
  }

  /** Convierte una TaxClassification legacy a una lista de TaxApplicationSnapshot. */
  private _adaptClassificationToSnapshots(
    classification: TaxClassification,
  ): TaxApplicationSnapshot[] {
    const snapshots: TaxApplicationSnapshot[] = [];
    const ruleId = classification.id;

    // Cada flag "applies*" se traduce como un impuesto STANDARD sintético
    if (classification.appliesIva) {
      snapshots.push({
        taxDefinitionId: classification.id,
        treatment: 'STANDARD',
        effectiveRate: null,
        ruleId,
        priorityMatched: 0,
      });
    }
    if (classification.appliesRetefuente) {
      snapshots.push({
        taxDefinitionId: classification.id,
        treatment: 'STANDARD',
        effectiveRate: null,
        ruleId,
        priorityMatched: 0,
      });
    }
    if (classification.appliesReteIca) {
      snapshots.push({
        taxDefinitionId: classification.id,
        treatment: 'STANDARD',
        effectiveRate: null,
        ruleId,
        priorityMatched: 0,
      });
    }
    if (classification.appliesEstampillas) {
      snapshots.push({
        taxDefinitionId: classification.id,
        treatment: 'STANDARD',
        effectiveRate: null,
        ruleId,
        priorityMatched: 0,
      });
    }

    return snapshots;
  }
}
