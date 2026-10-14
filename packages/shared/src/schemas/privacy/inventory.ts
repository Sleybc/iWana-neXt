import { z } from 'zod';
import { dataPurposeSchema } from './authorizations';

export const privacyInventoryDatabaseKeySchema = z.enum([
  'CLIENTES',
  'PROSPECTOS',
  'PROVEEDORES',
  'USUARIOS_SISTEMA',
]);

export const privacyInventoryRetentionSchema = z
  .object({
    category: z.string().trim().min(1),
    years: z.number().int().min(0),
  })
  .strict();

export const privacyInventoryDatabaseSchema = z
  .object({
    key: privacyInventoryDatabaseKeySchema,
    categories: z.array(z.string().trim().min(1)),
    purposes: z.array(dataPurposeSchema),
    retention: z.array(privacyInventoryRetentionSchema),
    hasSensitiveData: z.boolean(),
    internationalTransfer: z.literal('NO_DECLARADA'),
    securityMeasures: z.array(z.string().trim().min(1)),
  })
  .strict();

export const privacyInventorySchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    databases: z.array(privacyInventoryDatabaseSchema),
  })
  .strict();

export type PrivacyInventoryDatabaseKey = z.infer<typeof privacyInventoryDatabaseKeySchema>;
export type PrivacyInventoryDatabase = z.infer<typeof privacyInventoryDatabaseSchema>;
export type PrivacyInventory = z.infer<typeof privacyInventorySchema>;
