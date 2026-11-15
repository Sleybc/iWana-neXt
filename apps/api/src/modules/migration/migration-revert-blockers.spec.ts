import { ConfigService } from '@nestjs/config';
import { MIGRATION_REVERT_BLOCK_REASONS, type MigrationRevertBlocker } from '@iwana/shared';
import { AssuranceMigrationImportAdapter } from '../assurance/migration-adapters/assurance-migration-import.adapter';
import { BillingMigrationImportAdapter } from '../billing/migration-adapters/billing-migration-import.adapter';
import { CrmMigrationImportAdapter } from '../crm/migration-adapters/crm-migration-import.adapter';

/**
 * Los 9 motivos de bloqueo de la reversión (ADR-110 D7): cada adaptador traduce sus conteos a
 * motivos, sin filas en cero, y entre todos cubren el catálogo compartido completo. El SQL de
 * cada conteo lo ejercita la integración (D7 en migration-promotion.postgres.integration).
 */
const ids = { subscriberIds: ['11111111-1111-4111-8111-111111111111'], contractIds: [] };
const batchId = '22222222-2222-4222-8222-222222222222';
/** Titular complementado cuyo correo escrito por el lote ya no coincide (HMAC distinto). */
const complement = {
  subscriberId: '33333333-3333-4333-8333-333333333333',
  linkedExternalId: 'uisp:client:7',
  filled: [{ field: 'email' as const, hmac: 'hmac-del-valor-escrito' }],
  contactIds: [],
};

function ctxReturning(row: Record<string, number | string>) {
  return { manager: { query: jest.fn().mockResolvedValue([row]) }, tenantId: 't' } as never;
}

describe('Reversión UISP — motivos de bloqueo por adaptador', () => {
  const config = new ConfigService({
    PII_ENCRYPTION_KEY: '9a'.repeat(32),
    MFA_ENCRYPTION_KEY: '8b'.repeat(32),
    PII_HASH_KEY: '7c'.repeat(32),
    NODE_ENV: 'test',
  });
  const crm = new CrmMigrationImportAdapter(config, {} as never, {} as never);
  const billing = new BillingMigrationImportAdapter();
  const support = new AssuranceMigrationImportAdapter();

  it('CRM: CONTRATO_POSTERIOR, SOPORTE_POSTERIOR y ETIQUETA_POSTERIOR', async () => {
    await expect(
      crm.revertBlockers(ctxReturning({ contracts: 2, documents: 1, tags: 3 }), batchId, ids),
    ).resolves.toEqual([
      { motivo: 'CONTRATO_POSTERIOR', cantidad: 2 },
      { motivo: 'SOPORTE_POSTERIOR', cantidad: 1 },
      { motivo: 'ETIQUETA_POSTERIOR', cantidad: 3 },
    ]);
  });

  it('Billing: DOCUMENTO_POSTERIOR, PAGO_POSTERIOR y APLICACION_POSTERIOR', async () => {
    await expect(
      billing.revertBlockers(
        ctxReturning({ documents: 1, payments: 4, allocations: 2 }),
        batchId,
        ids,
      ),
    ).resolves.toEqual([
      { motivo: 'DOCUMENTO_POSTERIOR', cantidad: 1 },
      { motivo: 'PAGO_POSTERIOR', cantidad: 4 },
      { motivo: 'APLICACION_POSTERIOR', cantidad: 2 },
    ]);
  });

  it('Soporte: TICKET_POSTERIOR (tickets + actividad) y ORDEN_DE_TRABAJO', async () => {
    await expect(
      support.revertBlockers(
        ctxReturning({ tickets: 1, activity: 2, work_orders: 1 }),
        batchId,
        ids,
      ),
    ).resolves.toEqual([
      { motivo: 'TICKET_POSTERIOR', cantidad: 3 },
      { motivo: 'ORDEN_DE_TRABAJO', cantidad: 1 },
    ]);
  });

  it('conteos en cero no bloquean y entre los tres cubren los 9 motivos', async () => {
    await expect(
      crm.revertBlockers(ctxReturning({ contracts: 0, documents: 0, tags: 0 }), batchId, ids),
    ).resolves.toEqual([]);
    const all: MigrationRevertBlocker[] = [
      ...(await crm.revertBlockers(
        ctxReturning({ contracts: 1, documents: 1, tags: 1, email: 'otro' }),
        batchId,
        { ...ids, complements: [complement] },
      )),
      ...(await billing.revertBlockers(
        ctxReturning({ documents: 1, payments: 1, allocations: 1 }),
        batchId,
        ids,
      )),
      ...(await support.revertBlockers(
        ctxReturning({ tickets: 1, activity: 0, work_orders: 1 }),
        batchId,
        ids,
      )),
    ];
    expect(new Set(all.map((item) => item.motivo))).toEqual(
      new Set(MIGRATION_REVERT_BLOCK_REASONS),
    );
  });
});
