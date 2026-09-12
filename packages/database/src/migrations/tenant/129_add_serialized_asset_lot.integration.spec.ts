import { randomUUID } from 'node:crypto';

import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { AddSerializedAssetLot1290000000000 } from './129_add_serialized_asset_lot';

/**
 * Integración 129 contra PostgreSQL real (patrón 126/128): levanta el mínimo
 * de tablas de inventario (047) en un schema efímero y ejecuta up/down con
 * datos sembrados — DDL, FK real, índice parcial y, sobre todo, el backfill
 * serial↔lote derivado del kardex.
 *
 * `IWANA_DB_INTEGRATION_AVAILABLE=true` + `pnpm --filter @iwana/db
 * test:integration`. Sin PostgreSQL alcanzable se omite con banner — nunca en
 * silencio.
 */
const SCHEMA = `it_129_serial_lot_${randomUUID().slice(0, 8)}`;

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;

if (!dbAvailable) {
  console.warn(
    '[129-integration] describe.skip activo — sin PostgreSQL real; no se ejecuta el round-trip con datos.',
  );
}

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describeWithDb('129 add serialized_assets.lot_id — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  /** Recepción con dos ingresos: debe ganar el lote del movimiento más antiguo. */
  const ASSET_DOS_RECEPCIONES = randomUUID();
  const LOTE_ANTIGUO = randomUUID();
  const LOTE_RECIENTE = randomUUID();

  /** Solo tiene movimiento de SALIDA con lote: no es entrada, queda NULL. */
  const ASSET_SOLO_SALIDA = randomUUID();
  const LOTE_SALIDA = randomUUID();

  /** Recepción sin lote en el kardex: queda NULL, no se inventa nada. */
  const ASSET_RECEPCION_SIN_LOTE = randomUUID();

  /** Recepción REVERSADA: no cuenta como entrada válida. */
  const ASSET_REVERSA = randomUUID();
  const LOTE_REVERSA = randomUUID();

  /** Sin ningún movimiento: queda NULL. */
  const ASSET_SIN_MOVIMIENTOS = randomUUID();

  async function insertLot(lotId: string, lotNumber: string): Promise<void> {
    await runner.query(
      `INSERT INTO stock_lots (id, tenant_id, item_id, lot_number) VALUES ($1, $2, $3, $4)`,
      [lotId, TENANT, ITEM, lotNumber],
    );
  }

  async function insertAsset(assetId: string, serial: string): Promise<void> {
    await runner.query(
      `INSERT INTO serialized_assets (id, tenant_id, inventory_item_id, serial_number)
       VALUES ($1, $2, $3, $4)`,
      [assetId, TENANT, ITEM, serial],
    );
  }

  async function insertMovement(
    origin: string,
    createdAt: string,
    isReversal: boolean,
    lines: Array<{ assetId: string; lotId: string | null }>,
  ): Promise<void> {
    const movementId = randomUUID();
    await runner.query(
      `INSERT INTO stock_movements (id, tenant_id, origin, is_reversal, created_at)
       VALUES ($1, $2, $3::stock_movement_origin, $4, $5::timestamptz)`,
      [movementId, TENANT, origin, isReversal, createdAt],
    );

    for (const line of lines) {
      await runner.query(
        `INSERT INTO stock_movement_lines
           (id, tenant_id, movement_id, serialized_asset_id, lot_id, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::timestamptz)`,
        [TENANT, movementId, line.assetId, line.lotId, createdAt],
      );
    }
  }

  async function lotOf(assetId: string): Promise<string | null> {
    const rows = (await runner.query(`SELECT lot_id FROM serialized_assets WHERE id = $1`, [
      assetId,
    ])) as Array<{ lot_id: string | null }>;
    return rows[0]?.lot_id ?? null;
  }

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();

    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 3, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);

    // Mínimo de inventario (047) suficiente para la migración: el enum de
    // origen sí se replica porque el backfill filtra por él.
    await runner.query(`
      CREATE TYPE stock_movement_origin AS ENUM (
        'PURCHASE_RECEIPT', 'TRANSFER', 'EXECUTION_ORDER', 'SALE',
        'INTERNAL_CONSUMPTION', 'RETURN', 'REFURBISH', 'ADJUSTMENT',
        'WRITE_OFF', 'COUNTER_PURCHASE'
      )
    `);
    await runner.query(`
      CREATE TABLE stock_lots (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        item_id UUID NOT NULL,
        lot_number VARCHAR(80) NOT NULL
      )
    `);
    await runner.query(`
      CREATE TABLE serialized_assets (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        inventory_item_id UUID NOT NULL,
        serial_number VARCHAR(160),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE TABLE stock_movements (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        origin stock_movement_origin NOT NULL,
        is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(`
      CREATE TABLE stock_movement_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        movement_id UUID NOT NULL REFERENCES stock_movements (id),
        serialized_asset_id UUID,
        lot_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await insertLot(LOTE_ANTIGUO, 'LOT-ANTIGUO');
    await insertLot(LOTE_RECIENTE, 'LOT-RECIENTE');
    await insertLot(LOTE_SALIDA, 'LOT-SALIDA');
    await insertLot(LOTE_REVERSA, 'LOT-REVERSA');

    await insertAsset(ASSET_DOS_RECEPCIONES, 'SER-DOS-RECEPCIONES');
    await insertAsset(ASSET_SOLO_SALIDA, 'SER-SOLO-SALIDA');
    await insertAsset(ASSET_RECEPCION_SIN_LOTE, 'SER-SIN-LOTE');
    await insertAsset(ASSET_REVERSA, 'SER-REVERSA');
    await insertAsset(ASSET_SIN_MOVIMIENTOS, 'SER-SIN-MOVIMIENTOS');

    // El más antiguo se siembra DESPUÉS para que el orden de inserción no sea
    // el que "acierta": solo `created_at` puede decidir.
    await insertMovement('COUNTER_PURCHASE', '2026-03-01 09:00', false, [
      { assetId: ASSET_DOS_RECEPCIONES, lotId: LOTE_RECIENTE },
    ]);
    await insertMovement('PURCHASE_RECEIPT', '2026-01-01 09:00', false, [
      { assetId: ASSET_DOS_RECEPCIONES, lotId: LOTE_ANTIGUO },
    ]);

    await insertMovement('EXECUTION_ORDER', '2026-02-01 09:00', false, [
      { assetId: ASSET_SOLO_SALIDA, lotId: LOTE_SALIDA },
    ]);
    await insertMovement('PURCHASE_RECEIPT', '2026-02-02 09:00', false, [
      { assetId: ASSET_RECEPCION_SIN_LOTE, lotId: null },
    ]);
    await insertMovement('PURCHASE_RECEIPT', '2026-02-03 09:00', true, [
      { assetId: ASSET_REVERSA, lotId: LOTE_REVERSA },
    ]);
  });

  afterAll(async () => {
    await runner?.release();

    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('up crea columna, FK real e índice parcial, y backfillea solo lo derivable del kardex', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await new AddSerializedAssetLot1290000000000().up(runner);
    logSpy.mockRestore();

    const columnas = (await runner.query(`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'serialized_assets'
        AND column_name = 'lot_id'
    `)) as Array<{ data_type: string; is_nullable: string }>;
    expect(columnas).toHaveLength(1);
    expect(columnas[0]?.data_type).toBe('uuid');
    expect(columnas[0]?.is_nullable).toBe('YES');

    const fks = (await runner.query(`
      SELECT confrelid::regclass::text AS referencia FROM pg_constraint
      WHERE conname = 'fk_serialized_assets_lot'
        AND conrelid = 'serialized_assets'::regclass
    `)) as Array<{ referencia: string }>;
    expect(fks).toHaveLength(1);
    expect(fks[0]?.referencia).toBe('stock_lots');

    const indices = (await runner.query(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = 'idx_serialized_assets_tenant_lot'
    `)) as Array<{ indexdef: string }>;
    expect(indices).toHaveLength(1);
    expect(indices[0]?.indexdef).toContain('(tenant_id, lot_id)');
    expect(indices[0]?.indexdef).toContain('WHERE (lot_id IS NOT NULL)');

    // Backfill: gana la recepción MÁS ANTIGUA, no la última ni la insertada primero.
    expect(await lotOf(ASSET_DOS_RECEPCIONES)).toBe(LOTE_ANTIGUO);

    // Lo que no es una entrada válida con lote no produce valor inventado.
    expect(await lotOf(ASSET_SOLO_SALIDA)).toBeNull();
    expect(await lotOf(ASSET_RECEPCION_SIN_LOTE)).toBeNull();
    expect(await lotOf(ASSET_REVERSA)).toBeNull();
    expect(await lotOf(ASSET_SIN_MOVIMIENTOS)).toBeNull();
  });

  it('la FK rechaza un lote inexistente: la relación es real, no documental', async () => {
    const huerfano = randomUUID();
    await insertAsset(huerfano, 'SER-HUERFANO');

    await expect(
      runner.query(`UPDATE serialized_assets SET lot_id = $1 WHERE id = $2`, [
        randomUUID(),
        huerfano,
      ]),
    ).rejects.toThrow(/fk_serialized_assets_lot|foreign key/i);

    await runner.query(`DELETE FROM serialized_assets WHERE id = $1`, [huerfano]);
  });

  it('up es re-ejecutable y no pisa un lote ya asignado por la recepción', async () => {
    // Simula lo que hace la recepción desde la 129 en adelante: el lote llega
    // escrito, y el backfill de un re-run no debe reemplazarlo por el del kardex.
    await runner.query(`UPDATE serialized_assets SET lot_id = $1 WHERE id = $2`, [
      LOTE_RECIENTE,
      ASSET_DOS_RECEPCIONES,
    ]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await new AddSerializedAssetLot1290000000000().up(runner);
    logSpy.mockRestore();

    expect(await lotOf(ASSET_DOS_RECEPCIONES)).toBe(LOTE_RECIENTE);
    expect(await lotOf(ASSET_SOLO_SALIDA)).toBeNull();
  });

  it('down retira índice, FK y columna sin tocar el resto de la tabla', async () => {
    await new AddSerializedAssetLot1290000000000().down(runner);

    const columnas = (await runner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'serialized_assets' AND column_name = 'lot_id'
    `)) as Array<{ column_name: string }>;
    expect(columnas).toHaveLength(0);

    const fks = (await runner.query(`
      SELECT conname FROM pg_constraint
      WHERE conname = 'fk_serialized_assets_lot'
        AND conrelid = 'serialized_assets'::regclass
    `)) as Array<{ conname: string }>;
    expect(fks).toHaveLength(0);

    const indices = (await runner.query(`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = current_schema() AND indexname = 'idx_serialized_assets_tenant_lot'
    `)) as Array<{ indexname: string }>;
    expect(indices).toHaveLength(0);

    // Los activos siguen ahí: el down no borra filas.
    const total = (await runner.query(
      `SELECT COUNT(*)::int AS total FROM serialized_assets`,
    )) as Array<{ total: number }>;
    expect(total[0]?.total).toBe(5);
  });

  it('up tras down vuelve a derivar el backfill desde el kardex (nada se pierde)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await new AddSerializedAssetLot1290000000000().up(runner);
    logSpy.mockRestore();

    expect(await lotOf(ASSET_DOS_RECEPCIONES)).toBe(LOTE_ANTIGUO);
  });
});
