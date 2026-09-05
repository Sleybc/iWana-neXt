import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { TAX_COLOMBIA_PRESETS, TaxPresetDefinition } from '@iwana/shared';
import { TaxDefinition } from '../entities/tax-definition.entity';

/**
 * Servicio de siembra de presets de impuestos Colombia.
 *
 * Responsabilidad: poblar el catálogo de tax_definitions por schema tenant
 * con 7 presets estándar de Colombia (IVA, RteFte, ReteICA, Rete IVA, etc.).
 *
 * Invocación: desde el worker de provisioning BullMQ tras crear el schema tenant.
 * Idempotencia: verifica existencia por code antes de insertar.
 *
 * Ref: HLD-MOD07 §4, RF-TAX-02
 */
@Injectable()
export class TaxPresetsSeeder {
  private readonly logger = new Logger(TaxPresetsSeeder.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Siembra los 7 presets Colombia en el schema del tenant.
   * Idempotente: omite presets ya existentes.
   */
  async seedForTenant(schemaName: string): Promise<void> {
    this.logger.log(`[TaxPresetsSeeder] Sembrando presets Colombia en schema ${schemaName}`);

    await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      for (const preset of TAX_COLOMBIA_PRESETS) {
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
