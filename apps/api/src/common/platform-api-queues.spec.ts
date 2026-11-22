import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as shared from '@iwana/shared';
import { PLATFORM_API_QUEUE_NAMES, SAMPLED_QUEUE_NAMES } from '@iwana/shared';
import * as local from './platform-api-queues';
import { BILLING_EMAIL_QUEUE } from '../modules/billing/emails/billing-email.constants';
import { BILLING_GENERATION_QUEUE } from '../modules/billing/generation/billing-generation.constants';
import { CONTRACT_SIGNED_COPY_QUEUE } from '../modules/crm/contracts/documents/contract-signed-copy.constants';
import { CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE } from '../modules/crm/pending-signature/contract-pending-signature.constants';
import { NETWORK_PROVISIONING_RECONCILE_QUEUE } from '../modules/network/network-provisioning-reconciler.processor';
import { PRIVACY_DUE_ALERTS_QUEUE } from '../modules/privacy/alerts/privacy-due-alerts.constants';
import { RETENTION_EXPIRY_QUEUE } from '../modules/privacy/retention/retention-expiry.constants';

/** Constantes de cola del API por nombre de identificador (las compartidas y las locales). */
const CONSTANTS: Record<string, unknown> = {
  ...shared,
  BILLING_EMAIL_QUEUE,
  BILLING_GENERATION_QUEUE,
  CONTRACT_SIGNED_COPY_QUEUE,
  CONTRACT_PENDING_SIGNATURE_ALERTS_QUEUE,
  NETWORK_PROVISIONING_RECONCILE_QUEUE,
  PRIVACY_DUE_ALERTS_QUEUE,
  RETENTION_EXPIRY_QUEUE,
};

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('colas del API muestreadas por el tablero', () => {
  it('cada cola con constante local del API está en la lista compartida', () => {
    const sharedNames = new Set<string>(PLATFORM_API_QUEUE_NAMES);
    expect(local.API_LOCAL_QUEUE_NAMES.filter((name) => !sharedNames.has(name))).toEqual([]);
  });

  it('dirección inversa: toda cola que procesa el API (@Processor) se muestrea', () => {
    const sampled = new Set<string>(SAMPLED_QUEUE_NAMES);
    const unresolved: string[] = [];
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, '..'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(/@Processor\(\s*([A-Z0-9_]+)/gu)) {
        const identifier = match[1] as string;
        const value = CONSTANTS[identifier];
        if (typeof value !== 'string') unresolved.push(identifier);
        else if (!sampled.has(value)) missing.push(value);
      }
    }
    // Una constante nueva sin resolver obliga a añadirla arriba (y a la lista compartida).
    expect(unresolved).toEqual([]);
    expect(missing).toEqual([]);
  });
});
