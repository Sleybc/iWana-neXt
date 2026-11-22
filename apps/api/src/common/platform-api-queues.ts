import { MIGRATION_IMPORT_QUEUE, type PlatformApiQueueName } from '@iwana/shared';
import { BILLING_EMAIL_QUEUE } from '../modules/billing/emails/billing-email.constants';
import { BILLING_GENERATION_QUEUE } from '../modules/billing/generation/billing-generation.constants';
import { CONTRACT_SIGNED_COPY_QUEUE } from '../modules/crm/contracts/documents/contract-signed-copy.constants';
import { CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE } from '../modules/crm/pending-signature/contract-pending-signature.constants';
import { PRIVACY_DUE_ALERTS_QUEUE } from '../modules/privacy/alerts/privacy-due-alerts.constants';
import { RETENTION_EXPIRY_QUEUE } from '../modules/privacy/retention/retention-expiry.constants';

/**
 * Las colas del API cuya constante vive en su módulo deben estar en `PLATFORM_API_QUEUE_NAMES`
 * (`@iwana/shared`), que muestrea el tablero: si un literal cambia o la cola sale de la lista,
 * esto no compila.
 */
export const API_LOCAL_QUEUE_NAMES = [
  MIGRATION_IMPORT_QUEUE,
  BILLING_GENERATION_QUEUE,
  BILLING_EMAIL_QUEUE,
  CONTRACT_SIGNED_COPY_QUEUE,
  CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE,
  PRIVACY_DUE_ALERTS_QUEUE,
  RETENTION_EXPIRY_QUEUE,
] as const satisfies readonly PlatformApiQueueName[];
