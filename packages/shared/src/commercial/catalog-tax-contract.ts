import { z } from 'zod';
import { NetworkType } from '../enums/taxation/network-type.enum';
import { VatConcept } from '../enums/taxation/vat-concept.enum';

/** Campos fiscales requeridos para crear un ítem del catálogo. */
export const createCatalogItemTaxFieldsSchema = z.object({
  vatConcept: z.nativeEnum(VatConcept),
});
export type CreateCatalogItemTaxFields = z.infer<typeof createCatalogItemTaxFieldsSchema>;

/** Campos fiscales aditivos al actualizar; su omisión conserva el valor legado. */
export const updateCatalogItemTaxFieldsSchema = z.object({
  vatConcept: z.nativeEnum(VatConcept).optional(),
});
export type UpdateCatalogItemTaxFields = z.infer<typeof updateCatalogItemTaxFieldsSchema>;

/** Proyección compartida del concepto fiscal almacenado en el catálogo. */
export const catalogItemTaxFieldsSchema = z.object({
  vatConcept: z.nativeEnum(VatConcept).nullable(),
});
export type CatalogItemTaxFields = z.infer<typeof catalogItemTaxFieldsSchema>;

/** Un plan nuevo usa red fija si el caller omite networkType. */
export const createPlanNetworkFieldsSchema = z.object({
  networkType: z.nativeEnum(NetworkType).default(NetworkType.FIXED),
});
export type CreatePlanNetworkFields = z.input<typeof createPlanNetworkFieldsSchema>;

/** Cambiar de red es opcional en una actualización del plan. */
export const updatePlanNetworkFieldsSchema = z.object({
  networkType: z.nativeEnum(NetworkType).optional(),
});
export type UpdatePlanNetworkFields = z.infer<typeof updatePlanNetworkFieldsSchema>;

/** Respuesta de catálogo para un plan: siempre incluye la red persistida. */
export const planNetworkFieldsSchema = z.object({
  networkType: z.nativeEnum(NetworkType),
});
export type PlanNetworkFields = z.infer<typeof planNetworkFieldsSchema>;

/** Contrato fiscal de entrada completo para crear un plan. */
export const createPlanCatalogTaxFieldsSchema = createCatalogItemTaxFieldsSchema.merge(
  createPlanNetworkFieldsSchema,
);
export type CreatePlanCatalogTaxFields = z.input<typeof createPlanCatalogTaxFieldsSchema>;

/** Contrato fiscal aditivo para editar un plan existente. */
export const updatePlanCatalogTaxFieldsSchema = updateCatalogItemTaxFieldsSchema.merge(
  updatePlanNetworkFieldsSchema,
);
export type UpdatePlanCatalogTaxFields = z.infer<typeof updatePlanCatalogTaxFieldsSchema>;

/** Proyección fiscal de respuesta de un plan. */
export const planCatalogTaxFieldsSchema = catalogItemTaxFieldsSchema.merge(planNetworkFieldsSchema);
export type PlanCatalogTaxFields = z.infer<typeof planCatalogTaxFieldsSchema>;
