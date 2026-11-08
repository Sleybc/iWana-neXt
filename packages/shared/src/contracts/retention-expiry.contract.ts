import { z } from 'zod';

/**
 * Job de vencimiento de retención por tenant (H-EXP Fase 1, ADR-105).
 *
 * Solo identificadores técnicos: AsyncLocalStorage no propaga a BullMQ y el
 * payload queda en Redis. Nunca schema, slug, titular, HMAC, fecha ni secretos:
 * el consumidor resuelve el schema desde `public.tenants` por ID y revalida
 * todos los deberes dentro de cada transacción.
 */
export const PrivacyRetentionExpiryTenantJobSchema = z
  .object({
    version: z.literal(1),
    tenantId: z.string().uuid(),
    runId: z.string().uuid(),
  })
  .strict();

export type PrivacyRetentionExpiryTenantJob = z.infer<typeof PrivacyRetentionExpiryTenantJobSchema>;
