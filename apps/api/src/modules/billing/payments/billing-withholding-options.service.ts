import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BILLING_ERROR_CODES,
  BILLING_WITHHOLDING_TAX_CODES,
  BillingWithholdingOptionsResponseSchema,
  TAX_COLOMBIA_PRESETS,
  type BillingWithholdingOption,
  type BillingWithholdingOptionsResponse,
  type BillingWithholdingTaxCode,
} from '@iwana/shared';
import { TenantContext } from '@iwana/db';
import { TaxCatalogReadPort } from '../../taxation/ports/tax-catalog-read.port';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';

/**
 * Tolerancia por defecto, en puntos porcentuales, sobre la tarifa sugerida (H-1 c). Se configura
 * con `BILLING_WITHHOLDING_RATE_TOLERANCE_PP` (0 a 100). Con 2: retefuente sugerida 4 % admite hasta
 * 6 % (no declarante); reteICA 0,414 % admite hasta 2,414 %.
 */
export const BILLING_WITHHOLDING_RATE_TOLERANCE_PP_DEFAULT = 2;

/** Porcentaje → diezmilésimas de punto (4 decimales), para comparar tarifas sin flotantes. */
export function rateTenThousandths(rate: string | number): number {
  return Math.round(Number(rate) * 10_000);
}

/** Tope de tarifa de un tipo de retención (H-1 c). `ceiling` null: sin sugerida, todo exige permiso. */
export type WithholdingRateCeiling = {
  suggestedRate: string | null;
  ceiling: string | null;
};

function percent(rate: string | number | null): string | null {
  if (rate == null) return null;
  const value = Number(rate);
  return Number.isFinite(value) && value > 0 ? value.toFixed(4) : null;
}

/**
 * Opciones de retención del registro de pago (spec MOD14 2026-11-13 R7): si el titular puede
 * retener y la tarifa sugerida de cada tipo. La tarifa sale de la definición activa del tenant en
 * Tributación; si el tenant la desactivó o no la tiene, del preset del sistema. La sugerida es
 * editable dentro de la tolerancia (`rateCeilings`); por encima, el registro de pago exige
 * `BILLING_COURTESIES_MANAGE` (H-1 c).
 */
@Injectable()
export class BillingWithholdingOptionsService {
  constructor(
    private readonly contracts: BillingContractReadPort,
    private readonly taxCatalog: TaxCatalogReadPort,
    private readonly config?: ConfigService,
  ) {}

  /** H-7: consulta de solo lectura; no toma `FOR SHARE` ni abre transacción de escritura. */
  async optionsForSubscriber(subscriberId: string): Promise<BillingWithholdingOptionsResponse> {
    TenantContext.getOrThrow();
    const titular = await this.contracts.findTitularWithholdingEligibility(subscriberId);
    if (!titular.exists || titular.anonymized) {
      throw new NotFoundException({
        code: BILLING_ERROR_CODES.BILLING_SUBSCRIBER_NOT_FOUND,
        message: 'No se encontró el suscriptor.',
      });
    }
    const eligibility = titular.withholdingAgent ?? null;
    const options: BillingWithholdingOption[] = [];
    if (eligibility) {
      // Secuencial: cada lectura del catálogo toma su propia conexión del pool.
      for (const taxCode of BILLING_WITHHOLDING_TAX_CODES) {
        options.push(await this.option(taxCode));
      }
    }
    return BillingWithholdingOptionsResponseSchema.parse({
      subscriberId,
      eligible: eligibility !== null,
      eligibility,
      options,
    });
  }

  /** Tolerancia vigente en puntos porcentuales (H-1 c). Un valor inválido cae al defecto. */
  rateTolerance(): number {
    const raw = this.config?.get<string | number>('BILLING_WITHHOLDING_RATE_TOLERANCE_PP');
    const value = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : BILLING_WITHHOLDING_RATE_TOLERANCE_PP_DEFAULT;
  }

  /**
   * Tope de tarifa por tipo (H-1 c): sugerida de Tributación (o preset) + tolerancia, con cuatro
   * decimales y como máximo 100. Se resuelve fuera de la transacción del pago: el catálogo usa su
   * propia conexión.
   */
  async rateCeilings(
    taxCodes: readonly BillingWithholdingTaxCode[],
  ): Promise<Map<BillingWithholdingTaxCode, WithholdingRateCeiling>> {
    const tolerance = rateTenThousandths(this.rateTolerance());
    const ceilings = new Map<BillingWithholdingTaxCode, WithholdingRateCeiling>();
    for (const taxCode of [...new Set(taxCodes)].sort()) {
      const { suggestedRate } = await this.option(taxCode);
      const ceiling =
        suggestedRate === null
          ? null
          : (Math.min(1_000_000, rateTenThousandths(suggestedRate) + tolerance) / 10_000).toFixed(
              4,
            );
      ceilings.set(taxCode, { suggestedRate, ceiling });
    }
    return ceilings;
  }

  private async option(taxCode: BillingWithholdingTaxCode): Promise<BillingWithholdingOption> {
    const active = await this.taxCatalog.findActiveByCode(taxCode);
    if (active) {
      return {
        taxCode,
        name: active.name,
        suggestedRate: percent(active.baseRate),
        source: 'TRIBUTACION',
      };
    }
    const preset = TAX_COLOMBIA_PRESETS.find((item) => item.code === taxCode);
    return {
      taxCode,
      name: preset?.name ?? taxCode,
      suggestedRate: percent(preset?.baseRate ?? null),
      source: 'PRESET',
    };
  }
}
