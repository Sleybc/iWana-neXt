import { z } from 'zod';
import {
  catalogItemVatInputSchema,
  planInstallationVatInputSchema,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';

/**
 * IVA por ítem del catálogo (spec MOD14 2026-11-12 R1, D2). El acceso a internet del plan sigue
 * la regla del estrato; aquí solo se elige el IVA de productos, servicios y de la instalación.
 */
export const CATALOG_VAT_TREATMENT_OPTIONS = [
  { value: VatTreatment.STANDARD, label: 'IVA general (19 %)' },
  { value: VatTreatment.EXEMPT, label: 'Exento (0 %, se declara)' },
  { value: VatTreatment.EXCLUDED, label: 'Excluido (no causa IVA)' },
] as const;

/** Bases legales conocidas; el campo admite otro código del Estatuto Tributario. */
export const CATALOG_VAT_LEGAL_BASIS_SUGGESTIONS = [
  { value: VatLegalBasis.ET_476_7, label: 'Estatuto Tributario, artículo 476 numeral 7' },
  { value: VatLegalBasis.ET_481_H, label: 'Estatuto Tributario, artículo 481 literal h' },
] as const;

export function catalogVatTreatmentLabel(treatment: VatTreatment | null | undefined): string {
  const option = CATALOG_VAT_TREATMENT_OPTIONS.find((item) => item.value === treatment);
  return option?.label ?? CATALOG_VAT_TREATMENT_OPTIONS[0].label;
}

/**
 * Error visible del código de base legal, o null si es válido para el tratamiento. La regla
 * (patrón del código y base obligatoria si no es 19 %) es la del contrato compartido
 * `catalogItemVatInputSchema`; aquí solo se traduce a un mensaje del formulario.
 */
export function catalogVatLegalBasisError(
  treatment: VatTreatment,
  legalBasis: string,
): string | null {
  if (treatment === VatTreatment.STANDARD) return null;
  const code = legalBasis.trim();
  if (!code) return 'Indica la base legal del exento o excluido.';
  const parsed = catalogItemVatInputSchema.safeParse({
    vatTreatment: treatment,
    vatLegalBasis: code,
  });
  return parsed.success
    ? null
    : 'Usa un código como ET_476_7: letras mayúsculas, números y guion bajo.';
}

/** Campos que se envían a la API: el 19 % no lleva base legal propia (la resuelve el backend). */
export function catalogVatPayload({ treatment, legalBasis }: CatalogVatFormValue): {
  treatment: VatTreatment;
  legalBasis: string | null;
} {
  return {
    treatment,
    legalBasis: treatment === VatTreatment.STANDARD ? null : legalBasis.trim().toUpperCase(),
  };
}

/**
 * Campos del IVA de la instalación del plan con los nombres del contrato compartido
 * `planInstallationVatInputSchema`, que valida la regla antes de enviarlos.
 */
export function planInstallationVatPayload(value: CatalogVatFormValue): {
  installationVatTreatment: VatTreatment;
  installationVatLegalBasis: string | null;
} {
  const { treatment, legalBasis } = catalogVatPayload(value);
  const parsed = planInstallationVatInputSchema.parse({
    installationVatTreatment: treatment,
    installationVatLegalBasis: legalBasis,
  });
  return {
    installationVatTreatment: treatment,
    installationVatLegalBasis: parsed.installationVatLegalBasis ?? null,
  };
}

/** Valor del campo de IVA en los formularios del catálogo. */
export const catalogVatFormSchema = z
  .object({ treatment: z.nativeEnum(VatTreatment), legalBasis: z.string() })
  .superRefine((value, context) => {
    const message = catalogVatLegalBasisError(value.treatment, value.legalBasis);
    if (message) context.addIssue({ code: z.ZodIssueCode.custom, path: ['legalBasis'], message });
  });
export type CatalogVatFormValue = z.infer<typeof catalogVatFormSchema>;

/** Valor inicial: sin tratamiento registrado el ítem causa 19 % (D2). */
export function toCatalogVatFormValue(
  treatment: VatTreatment | null | undefined,
  legalBasis: string | null | undefined,
): CatalogVatFormValue {
  const resolved = treatment ?? VatTreatment.STANDARD;
  return {
    treatment: resolved,
    legalBasis: resolved === VatTreatment.STANDARD ? '' : (legalBasis ?? ''),
  };
}
