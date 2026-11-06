import { randomUUID } from 'node:crypto';

import {
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  billingPostgresIntegrationEnabled,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { PreventAnonymizedCrmMutations1690000000000 } from './169_prevent_anonymized_crm_mutations';
import { BillingContractPriceBackfill1750000000175 } from './175_billing_contract_price_backfill';

const describeWithBillingPostgres = billingPostgresIntegrationEnabled ? describe : describe.skip;

describeWithBillingPostgres(
  '175 — backfill de precio respetando anonimización en PostgreSQL real',
  () => {
    let dataSource = createBillingIntegrationDataSource();
    let fixture: BillingTenantFixture | undefined;
    const migration = new BillingContractPriceBackfill1750000000175();
    const anonymizedMutationGuard = new PreventAnonymizedCrmMutations1690000000000();
    const planId = randomUUID();
    const activeSubscriberId = randomUUID();
    const anonymizedSubscriberId = randomUUID();
    const noPriceSubscriberId = randomUUID();
    const otherSourceSubscriberId = randomUUID();
    const activeContractId = randomUUID();
    const anonymizedContractId = randomUUID();
    const noPriceContractId = randomUUID();
    const otherSourceContractId = randomUUID();
    const originalSnapshot = { id: planId, source: 'expediente' };

    beforeAll(async () => {
      await dataSource.initialize();
      fixture = await createBillingTenantFixture(dataSource, 'tenant_billing175');
      await fixture.queryRunner.query(`
      CREATE TABLE subscribers (
        id uuid PRIMARY KEY, anonymized_at timestamptz NULL, customer_segment varchar(30) NOT NULL
      );
      CREATE TABLE expediente_records (id uuid PRIMARY KEY, anonymized_at timestamptz NULL);
      CREATE TABLE contracts (
        id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, plan_id varchar(120) NOT NULL,
        plan_snapshot_json jsonb NOT NULL, status varchar(20) NOT NULL DEFAULT 'TERMINATED',
        status_reason_code varchar(60), status_changed_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE catalog_price_history (
        item_id uuid NOT NULL, customer_segment varchar(30) NOT NULL,
        is_current boolean NOT NULL, base_price numeric(14, 2) NOT NULL
      );
    `);
      await fixture.queryRunner.query(
        `INSERT INTO subscribers (id, anonymized_at, customer_segment)
       VALUES ($1, NULL, 'HOGAR'), ($2, now(), 'HOGAR'), ($3, NULL, 'EMPRESA'), ($4, NULL, 'HOGAR')`,
        [activeSubscriberId, anonymizedSubscriberId, noPriceSubscriberId, otherSourceSubscriberId],
      );
      await fixture.queryRunner.query(
        `INSERT INTO contracts (id, subscriber_id, plan_id, plan_snapshot_json)
       VALUES ($1, $2, $4, $5::jsonb), ($3, $6, $4, $5::jsonb), ($7, $8, $9, $5::jsonb),
              ($10, $11, $4, $12::jsonb)`,
        [
          activeContractId,
          activeSubscriberId,
          anonymizedContractId,
          planId,
          JSON.stringify(originalSnapshot),
          anonymizedSubscriberId,
          noPriceContractId,
          noPriceSubscriberId,
          randomUUID(),
          otherSourceContractId,
          otherSourceSubscriberId,
          JSON.stringify({ id: planId, source: 'catalogo' }),
        ],
      );
      await fixture.queryRunner.query(
        `INSERT INTO catalog_price_history (item_id, customer_segment, is_current, base_price)
       VALUES ($1, 'HOGAR', true, 49900.00)`,
        [planId],
      );
      await anonymizedMutationGuard.up(fixture.queryRunner);
    });

    afterAll(async () => {
      await dropBillingTenantFixture(dataSource, fixture);
    });

    it('up excluye contratos anonimizados y down restaura snapshots sin alterar el fixture', async () => {
      const activeFixture = fixture;
      const queryRunner = activeFixture?.queryRunner;
      if (!activeFixture || !queryRunner) throw new Error('Fixture MOD14 175 no inicializado.');

      const installedTriggers = (await queryRunner.query(
        `SELECT tgname
           FROM pg_trigger
          WHERE tgrelid = 'contracts'::regclass
            AND tgname = $1
            AND NOT tgisinternal`,
        ['trg_contracts_prevent_anonymized_mutation'],
      )) as Array<{ tgname: string }>;
      expect(installedTriggers).toEqual([{ tgname: 'trg_contracts_prevent_anonymized_mutation' }]);

      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await migration.up(queryRunner);
        expect(log).toHaveBeenLastCalledWith(
          '[175] billing price backfill excluded_anonymized=1 updated=1',
        );

        const snapshots = (await queryRunner.query(
          `SELECT id, plan_snapshot_json->>'monthlyPrice' AS monthly_price
         FROM contracts ORDER BY id`,
        )) as Array<{ id: string; monthly_price: string | null }>;
        expect(snapshots).toEqual(
          [
            { id: activeContractId, monthly_price: '49900.00' },
            { id: anonymizedContractId, monthly_price: null },
            { id: noPriceContractId, monthly_price: null },
            { id: otherSourceContractId, monthly_price: null },
          ].sort((left, right) => left.id.localeCompare(right.id)),
        );

        await expect(
          queryRunner.query(
            `UPDATE contracts SET plan_snapshot_json = jsonb_set(plan_snapshot_json, '{monthlyPrice}', '1')
           WHERE id = $1`,
            [anonymizedContractId],
          ),
        ).rejects.toThrow(/solo lectura/iu);

        const backupRows = (await queryRunner.query(
          'SELECT contract_id FROM crm_contract_price_backup_175 ORDER BY contract_id',
        )) as Array<{ contract_id: string }>;
        expect(backupRows).toEqual([{ contract_id: activeContractId }]);

        await migration.down(queryRunner);
        expect(log).toHaveBeenLastCalledWith(
          '[175] billing price rollback restored=1 skipped_anonymized=0',
        );
        const restored = (await queryRunner.query(
          `SELECT plan_snapshot_json FROM contracts WHERE id = $1`,
          [activeContractId],
        )) as Array<{ plan_snapshot_json: typeof originalSnapshot }>;
        expect(restored).toEqual([{ plan_snapshot_json: originalSnapshot }]);
        const untouchedSource = (await queryRunner.query(
          `SELECT plan_snapshot_json FROM contracts WHERE id = $1`,
          [otherSourceContractId],
        )) as Array<{ plan_snapshot_json: { id: string; source: string } }>;
        expect(untouchedSource).toEqual([
          { plan_snapshot_json: { id: planId, source: 'catalogo' } },
        ]);
        expect(
          await queryRunner.query("SELECT to_regclass('crm_contract_price_backup_175') AS backup"),
        ).toEqual([{ backup: null }]);
      } finally {
        log.mockRestore();
      }
    });

    it('down omite una fila que fue anonimizada después del backfill', async () => {
      const activeFixture = fixture;
      const queryRunner = activeFixture?.queryRunner;
      if (!activeFixture || !queryRunner) throw new Error('Fixture MOD14 175 no inicializado.');

      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await migration.up(queryRunner);
        await queryRunner.query('UPDATE subscribers SET anonymized_at = now() WHERE id = $1', [
          activeSubscriberId,
        ]);

        await migration.down(queryRunner);

        expect(log).toHaveBeenLastCalledWith(
          '[175] billing price rollback restored=0 skipped_anonymized=1',
        );
        const snapshot = (await queryRunner.query(
          `SELECT plan_snapshot_json->>'monthlyPrice' AS monthly_price
         FROM contracts WHERE id = $1`,
          [activeContractId],
        )) as Array<{ monthly_price: string | null }>;
        expect(snapshot).toEqual([{ monthly_price: '49900.00' }]);
      } finally {
        log.mockRestore();
      }
    });
  },
);
