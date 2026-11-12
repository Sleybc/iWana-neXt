import { z } from 'zod';
import { VatTreatment } from '../enums/vat-treatment.enum';
import { VatLegalBasis } from '../enums/taxation/vat-legal-basis.enum';

/**
 * IVA por ítem del catálogo (spec 2026-11-12 MOD14 «IVA por concepto y cortesías», D1, D2, R1, R2).
 *
 * - El acceso a internet del plan conserva la regla del estrato (ADR-093, `resolveInternetVat`).
 * - Instalación, productos y servicios adicionales llevan su propio tratamiento: el del ítem del
 *   catálogo (producto o servicio) o el del cargo de instalación del plan. Sin valor, 19 %.
 * - La base legal es un código corto (`ET_468`, `ET_476_7`…), nunca texto libre.
 */

/** Código de base legal: mayúsculas, dígitos, `_`, `.` o `-`; 2 a 40 caracteres. */
export const CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN = /^[A-Z0-9][A-Z0-9_.-]{1,39}$/u;

/** D2: lo que no diga otra cosa causa IVA a la tarifa general. */
export const DEFAULT_CATALOG_ITEM_VAT_TREATMENT = VatTreatment.STANDARD;
/** ET 468: tarifa general del 19 %. */
export const DEFAULT_CATALOG_ITEM_VAT_LEGAL_BASIS: string = VatLegalBasis.ET_468;

/** Tarifa que corresponde a cada tratamiento (EXEMPT se declara al 0 %; EXCLUDED no causa). */
export function vatRateForTreatment(treatment: VatTreatment): 0 | 19 {
  return treatment === VatTreatment.STANDARD ? 19 : 0;
}

export const catalogItemVatLegalBasisSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN, 'Código de base legal inválido.'));

function requireLegalBasisWhenNotStandard(
  treatment: VatTreatment | undefined,
  legalBasis: string | null | undefined,
  path: string,
  context: z.RefinementCtx,
): void {
  if (
    treatment !== undefined &&
    treatment !== VatTreatment.STANDARD &&
    (legalBasis === undefined || legalBasis === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: 'Un tratamiento exento o excluido exige la base legal.',
    });
  }
}

/**
 * Campos de entrada del IVA de un producto o servicio. Omitirlos al crear deja STANDARD (19 %,
 * ET_468); al actualizar conservan el valor. EXEMPT o EXCLUDED exigen la base legal.
 */
export const catalogItemVatInputSchema = z
  .object({
    vatTreatment: z.nativeEnum(VatTreatment).optional(),
    vatLegalBasis: catalogItemVatLegalBasisSchema.nullable().optional(),
  })
  .superRefine((value, context) =>
    requireLegalBasisWhenNotStandard(
      value.vatTreatment,
      value.vatLegalBasis,
      'vatLegalBasis',
      context,
    ),
  );
export type CatalogItemVatInput = z.infer<typeof catalogItemVatInputSchema>;

/** Campos de entrada del IVA del cargo de instalación de un plan (mismas reglas). */
export const planInstallationVatInputSchema = z
  .object({
    installationVatTreatment: z.nativeEnum(VatTreatment).optional(),
    installationVatLegalBasis: catalogItemVatLegalBasisSchema.nullable().optional(),
  })
  .superRefine((value, context) =>
    requireLegalBasisWhenNotStandard(
      value.installationVatTreatment,
      value.installationVatLegalBasis,
      'installationVatLegalBasis',
      context,
    ),
  );
export type PlanInstallationVatInput = z.infer<typeof planInstallationVatInputSchema>;

/**
 * Proyección de respuesta del catálogo. Productos y servicios: `vatTreatment`/`vatLegalBasis`
 * (null en un plan: su internet sigue el estrato). Planes: `installationVatTreatment` e
 * `installationVatLegalBasis` (null en productos y servicios).
 */
export const catalogItemVatFieldsSchema = z.object({
  vatTreatment: z.nativeEnum(VatTreatment).nullable(),
  vatLegalBasis: z.string().regex(CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN).nullable(),
  installationVatTreatment: z.nativeEnum(VatTreatment).nullable(),
  installationVatLegalBasis: z.string().regex(CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN).nullable(),
});
export type CatalogItemVatFields = z.infer<typeof catalogItemVatFieldsSchema>;

/** De dónde salió un tratamiento congelado en el contrato. */
export const CONTRACT_ITEM_VAT_SOURCES = ['CATALOG', 'DEFAULT', 'BACKFILL'] as const;
export type ContractItemVatSource = (typeof CONTRACT_ITEM_VAT_SOURCES)[number];

/** Tratamiento resuelto de un ítem: tarifa siempre coherente con el tratamiento. */
export interface CatalogItemVatResolution {
  treatment: VatTreatment;
  legalBasis: string;
  ratePercent: 0 | 19;
  source: Exclude<ContractItemVatSource, 'BACKFILL'>;
}

/**
 * Resuelve el IVA de un ítem del catálogo. Sin tratamiento (ítem legado, plan heredado o ítem que
 * ya no existe) aplica D2: STANDARD 19 % ET_468 con `source: 'DEFAULT'`.
 */
export function resolveCatalogItemVat(
  treatment: VatTreatment | null | undefined,
  legalBasis: string | null | undefined,
): CatalogItemVatResolution {
  if (!treatment) {
    return {
      treatment: DEFAULT_CATALOG_ITEM_VAT_TREATMENT,
      legalBasis: DEFAULT_CATALOG_ITEM_VAT_LEGAL_BASIS,
      ratePercent: 19,
      source: 'DEFAULT',
    };
  }
  if (!legalBasis && treatment !== VatTreatment.STANDARD) {
    throw new RangeError('Un tratamiento exento o excluido exige la base legal.');
  }
  return {
    treatment,
    legalBasis: legalBasis || DEFAULT_CATALOG_ITEM_VAT_LEGAL_BASIS,
    ratePercent: vatRateForTreatment(treatment),
    source: 'CATALOG',
  };
}

const itemVatSnapshotShape = {
  treatment: z.nativeEnum(VatTreatment),
  legalBasis: z.string().regex(CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN),
  ratePercent: z.union([z.literal(0), z.literal(19)]),
  source: z.enum(CONTRACT_ITEM_VAT_SOURCES),
  frozenAt: z.string().datetime({ offset: true }),
};

function rateMatchesTreatment(value: { treatment: VatTreatment; ratePercent: 0 | 19 }): boolean {
  return vatRateForTreatment(value.treatment) === value.ratePercent;
}

/** Tratamiento del cargo de instalación congelado en el contrato (`installation_vat_snapshot`). */
export const contractItemVatSnapshotSchema = z
  .object(itemVatSnapshotShape)
  .strict()
  .refine(rateMatchesTreatment, { message: 'La tarifa no corresponde al tratamiento.' });
export type ContractItemVatSnapshot = z.infer<typeof contractItemVatSnapshotSchema>;

/** Valor monetario congelado del adicional: no negativo, dos decimales. */
export const CONTRACT_ADDITIONAL_UNIT_PRICE_PATTERN = /^\d{1,12}\.\d{2}$/u;

/**
 * Tratamiento de cada adicional congelado en el contrato (`additional_vat_snapshot`).
 *
 * Bloque C (spec MOD14 2026-11-12 D3/R3): el contrato también congela el nombre y el precio
 * vigente del ítem para el segmento del contrato al crearlo o al agregar el adicional, como
 * congela `installation_fee`. Son opcionales: una entrada sin `unitPrice` (ítem legado sin precio
 * vigente) no se cobra y cuenta como «adicional sin cobrar».
 */
export const contractAdditionalVatSnapshotSchema = z
  .object({
    ...itemVatSnapshotShape,
    itemId: z.string().min(1).max(120),
    itemType: z.enum(['PRODUCT', 'SERVICE']),
    name: z.string().min(1).max(200).optional(),
    unitPrice: z.string().regex(CONTRACT_ADDITIONAL_UNIT_PRICE_PATTERN).nullable().optional(),
  })
  .strict()
  .refine(rateMatchesTreatment, { message: 'La tarifa no corresponde al tratamiento.' });
export type ContractAdditionalVatSnapshot = z.infer<typeof contractAdditionalVatSnapshotSchema>;

/** Congela una resolución con su instante. */
export function freezeCatalogItemVat(
  resolution: CatalogItemVatResolution,
  frozenAt: Date = new Date(),
): ContractItemVatSnapshot {
  return {
    treatment: resolution.treatment,
    legalBasis: resolution.legalBasis,
    ratePercent: resolution.ratePercent,
    source: resolution.source,
    frozenAt: frozenAt.toISOString(),
  };
}

/** Lectura tolerante de un jsonb congelado: null si no cumple el contrato. */
export function parseContractItemVatSnapshot(value: unknown): ContractItemVatSnapshot | null {
  const parsed = contractItemVatSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Lectura tolerante del arreglo congelado de adicionales: descarta entradas inválidas. */
export function parseContractAdditionalVatSnapshots(
  value: unknown,
): ContractAdditionalVatSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = contractAdditionalVatSnapshotSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
