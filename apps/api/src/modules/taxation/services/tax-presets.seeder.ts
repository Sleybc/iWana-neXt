import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { TaxCategory, JurisdictionLevel, TaxTreatment, TaxContext, TaxOrigin } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';

/**
 * Tipo local para definiciones de presets — usa number para baseRate,
 * TypeORM convierte a NUMERIC al guardar.
 */
type PresetData = {
  code: string;
  name: string;
  category: TaxCategory;
  jurisdictionLevel: JurisdictionLevel;
  municipalityCode: string | null;
  baseRate: number | null;
  treatment: TaxTreatment;
  context: TaxContext;
  origin: TaxOrigin;
  isActive: boolean;
  notes: string | null;
};

/**
 * Servicio de siembra de presets de impuestos Colombia.
 *
 * Responsabilidad: poblar el catálogo de tax_definitions por schema tenant
 * con 6 presets estándar de Colombia (IVA, RteFte, ReteICA, etc.).
 *
 * Invocación: desde el worker de provisioning BullMQ tras crear el schema tenant.
 * Idempotencia: verifica existencia por code antes de insertar.
 *
 * Ref: HLD-MOD07 §4, RF-TAX-02
 */
@Injectable()
export class TaxPresetsSeeder {
  private readonly logger = new Logger(TaxPresetsSeeder.name);

  private static readonly COLOMBIA_PRESETS: PresetData[] = [
    {
      code: 'IVA_19',
      name: 'IVA 19%',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: 19,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Tarifa general IVA Colombia — Art. 468 E.T.',
    },
    {
      code: 'IVA_EXENTO',
      name: 'IVA exento (0%)',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: 0,
      treatment: TaxTreatment.EXEMPT,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Servicios de internet residencial estrato 1-3 — Decreto 1835/2021',
    },
    {
      code: 'IVA_EXCLUIDO',
      name: 'IVA excluido',
      category: TaxCategory.VAT,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: null,
      treatment: TaxTreatment.EXCLUDED,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Bienes y servicios excluidos de IVA — Art. 424 E.T.',
    },
    {
      code: 'RETE_FUENTE_SERVICIOS',
      name: 'Retención en la fuente — Servicios',
      category: TaxCategory.WITHHOLDING,
      jurisdictionLevel: JurisdictionLevel.NATIONAL,
      municipalityCode: null,
      baseRate: 4,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.PURCHASE,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'RteFte servicios en general — Art. 392 E.T. (4% para no autoretenedores)',
    },
    {
      code: 'RETE_ICA',
      name: 'ReteICA — Bogotá',
      category: TaxCategory.MUNICIPAL,
      jurisdictionLevel: JurisdictionLevel.MUNICIPAL,
      municipalityCode: '11001',
      baseRate: 0.414,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.PURCHASE,
      origin: TaxOrigin.SYSTEM,
      isActive: true,
      notes: 'Retención ICA Bogotá D.C. — CIIU 6130 (telecomunicaciones inalámbricas)',
    },
    {
      code: 'ESTAMPILLA_DEPARTAMENTAL',
      name: 'Estampilla departamental',
      category: TaxCategory.STAMP,
      jurisdictionLevel: JurisdictionLevel.DEPARTMENT,
      municipalityCode: null,
      baseRate: null,
      treatment: TaxTreatment.STANDARD,
      context: TaxContext.BOTH,
      origin: TaxOrigin.SYSTEM,
      isActive: false,
      notes: 'Estampilla pro-hospitales, pro-universidad, etc. según departamento',
    },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Siembra los 6 presets Colombia en el schema del tenant.
   * Idempotente: omite presets ya existentes.
   */
  async seedForTenant(schemaName: string): Promise<void> {
    this.logger.log(`[TaxPresetsSeeder] Sembrando presets Colombia en schema ${schemaName}`);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      for (const preset of TaxPresetsSeeder.COLOMBIA_PRESETS) {
        const existing = await qr.manager.findOne(TaxDefinition, {
          where: { code: preset.code, deletedAt: IsNull() },
        });

        if (existing) {
          this.logger.debug(`[TaxPresetsSeeder] Preset ${preset.code} ya existe — omitiendo`);
          continue;
        }

        // Usar 'as any' para evitar conflicto de tipos baseRate: number vs string
        const entity = qr.manager.create(TaxDefinition, preset as any);
        await qr.manager.save(TaxDefinition, entity);
        this.logger.debug(`[TaxPresetsSeeder] Preset ${preset.code} sembrado`);
      }
    });

    this.logger.log(`[TaxPresetsSeeder] Presets Colombia completados para ${schemaName}`);
  }
}
