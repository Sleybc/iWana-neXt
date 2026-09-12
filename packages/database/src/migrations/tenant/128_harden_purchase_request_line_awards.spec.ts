import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HardenPurchaseRequestLineAwards1280000000000 } from './128_harden_purchase_request_line_awards';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './128_harden_purchase_request_line_awards.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new HardenPurchaseRequestLineAwards1280000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new HardenPurchaseRequestLineAwards1280000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('HardenPurchaseRequestLineAwards128', () => {
  it('pre-vuelos: cantidad positiva y conflicto de duplicados entre distintos proveedores', async () => {
    const sql = await upSql();

    expect(sql).toMatch(
      /SELECT COUNT\(\*\) AS total\s+FROM purchase_request_line_awards\s+WHERE awarded_quantity <= 0/,
    );
    expect(sql).toMatch(
      /GROUP BY tenant_id, purchase_request_line_id, awarded_party_ref_id\s+HAVING COUNT\(\*\) > 1/,
    );
  });

  it('dedupe conservando la fila más antigua por (tenant, línea, proveedor)', async () => {
    const sql = await upSql();

    expect(sql).toMatch(
      /DELETE FROM purchase_request_line_awards victima\s+USING purchase_request_line_awards conservada/,
    );
    expect(sql).toMatch(
      /victima\.purchase_request_line_id = conservada\.purchase_request_line_id\s+AND victima\.awarded_party_ref_id = conservada\.awarded_party_ref_id/,
    );
    // Desempate: created_at asc y, a igualdad, id asc (la conservada es la menor).
    expect(sql).toMatch(
      /conservada\.created_at < victima\.created_at\s+OR \(conservada\.created_at = victima\.created_at\s+AND conservada\.id < victima\.id\)/,
    );
  });

  it('columnas unit_cost y currency nullables, únicas en su tipo', async () => {
    const sql = await upSql();

    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS unit_cost NUMERIC\(14, 2\)/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS currency VARCHAR\(3\)/);
    expect(sql.match(/ADD COLUMN IF NOT EXISTS/g)).toHaveLength(2);
  });

  it('índice único de TRES columnas (tenant, línea, proveedor) con nombre del contrato', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_pr_line_awards_line_party');
    expect(sql).toMatch(
      /ON purchase_request_line_awards \(tenant_id, purchase_request_line_id, awarded_party_ref_id\)/,
    );
  });

  it('re-emite con IF NOT EXISTS el índice tenant+party que la 049 ya creó', async () => {
    const sql = await upSql();

    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_purchase_request_line_awards_tenant_party',
    );
    expect(sql).toMatch(/ON purchase_request_line_awards \(tenant_id, awarded_party_ref_id\)/);
  });

  it('CHECK awarded_quantity > 0 con nombre chk_pr_line_awards_qty_positive', async () => {
    const sql = await upSql();

    expect(sql).toContain('chk_pr_line_awards_qty_positive');
    expect(sql).toMatch(
      /ADD CONSTRAINT chk_pr_line_awards_qty_positive\s+CHECK \(awarded_quantity > 0\)/,
    );
  });

  it('backfill: CONVERTED_TO_PO con alguna línea viva vuelve a APPROVED, con conteo previo en log', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT COUNT(*) AS total') && sql.includes('purchase_requests')) {
        return Promise.resolve([{ total: '7' }]);
      }
      return Promise.resolve(undefined);
    });

    await new HardenPurchaseRequestLineAwards1280000000000().up({ query } as never);

    const executed = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
    expect(executed).toMatch(/status = 'APPROVED'/);
    expect(executed).toMatch(/WHERE r\.status = 'CONVERTED_TO_PO'/);
    expect(executed).toMatch(/l\.line_status IN \('OPEN', 'PENDING_QUOTE', 'AWARDED'\)/);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[128] Backfill: 7 solicitud(es) CONVERTED_TO_PO'),
    );

    logSpy.mockRestore();
  });

  it('down revierte CHECK, índice único y columnas; no toca el índice de la 049 ni el backfill', async () => {
    const sql = await downSql();

    expect(sql).toMatch(/DROP CONSTRAINT chk_pr_line_awards_qty_positive/);
    expect(sql).toContain('DROP INDEX IF EXISTS uq_pr_line_awards_line_party');
    expect(sql).toMatch(/DROP COLUMN IF EXISTS unit_cost/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS currency/);

    // El índice tenant+party pertenece a la 049: el down de la 128 no lo suelta.
    expect(sql).not.toContain('DROP INDEX IF EXISTS idx_purchase_request_line_awards_tenant_party');
    // El backfill NO se revierte (documentado): ningún UPDATE de vuelta a CONVERTED_TO_PO.
    expect(sql).not.toMatch(/UPDATE purchase_requests/i);
    expect(sql).not.toContain("'CONVERTED_TO_PO'");
  });

  it('no importa código de apps/api ni usa synchronize (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
    expect(MIGRATION_SOURCE).not.toContain('synchronize');
  });
});
