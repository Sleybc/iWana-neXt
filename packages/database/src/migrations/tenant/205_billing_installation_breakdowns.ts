import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 205 — consumo de la OT de instalación asociado al contrato (spec MOD14 2026-11-13
 * «Primer cobro completo», bloque A: R1, R2).
 *
 * - `billing_installation_breakdowns`: una fila por OT de instalación cerrada (única por tenant y
 *   OT: idempotencia del registro). Enlaza contrato, titular y OT y congela el segmento con el
 *   que se leyó el precio comercial.
 * - `billing_installation_breakdown_items`: ítems consumidos por la OT, agrupados por artículo de
 *   inventario y comodato. Cantidad, unidad, seriales, comodato y valor de referencia congelado al
 *   registrar: precio vigente del producto comercial vinculado o, sin él, costo promedio de
 *   inventario (`value_source`). Sin valor: `SIN_VALOR` y valores nulos.
 *
 * Es informativo: no toca documentos, líneas ni saldos.
 *
 * `down()` retira las dos tablas. Si hay registros lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: los valores congelados no se pueden reconstruir.
 */
export class BillingInstallationBreakdowns2050000000205 implements MigrationInterface {
  name = 'BillingInstallationBreakdowns2050000000205';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE billing_installation_breakdowns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        contract_id uuid NOT NULL,
        subscriber_id uuid NOT NULL,
        execution_order_id uuid NOT NULL,
        execution_order_number varchar(40) NOT NULL,
        execution_order_closed_at timestamptz NOT NULL,
        price_segment varchar(20) NOT NULL CHECK (price_segment IN (
          'RESIDENTIAL','SOHO','PYME','CORPORATE','GOVERNMENT','WHOLESALE')),
        captured_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_billing_installation_breakdowns_order
        ON billing_installation_breakdowns (tenant_id, execution_order_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_installation_breakdowns_contract
        ON billing_installation_breakdowns (tenant_id, contract_id)
    `);
    await queryRunner.query(`
      CREATE TABLE billing_installation_breakdown_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        breakdown_id uuid NOT NULL
          REFERENCES billing_installation_breakdowns(id) ON DELETE CASCADE,
        position smallint NOT NULL CHECK (position > 0),
        inventory_item_id varchar(160) NOT NULL,
        description varchar(200) NOT NULL,
        unit_of_measure varchar(32) NOT NULL,
        quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
        serial_numbers jsonb NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(serial_numbers) = 'array'),
        is_loan boolean NOT NULL DEFAULT false,
        commercial_product_id varchar(160) NULL,
        value_source varchar(20) NOT NULL
          CHECK (value_source IN ('PRECIO_COMERCIAL','COSTO_PROMEDIO','SIN_VALOR')),
        unit_reference_value numeric(14,2) NULL CHECK (unit_reference_value >= 0),
        reference_value numeric(14,2) NULL CHECK (reference_value >= 0),
        CONSTRAINT chk_billing_installation_items_value_shape
          CHECK ((value_source = 'SIN_VALOR'
                  AND unit_reference_value IS NULL AND reference_value IS NULL)
              OR (value_source <> 'SIN_VALOR'
                  AND unit_reference_value IS NOT NULL AND reference_value IS NOT NULL)),
        CONSTRAINT uq_billing_installation_items_position UNIQUE (breakdown_id, position)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      // M6: PostgreSQL resuelve la tabla al planificar aunque la rama no se ejecute; se
      // consulta su existencia antes de contar (down repetido o up a medias).
      const [present] = (await queryRunner.query(
        `SELECT to_regclass('billing_installation_breakdowns') IS NOT NULL AS present`,
      )) as Array<{ present: boolean }>;
      const rows = present?.present
        ? ((await queryRunner.query(
            `SELECT COUNT(*)::int AS total FROM billing_installation_breakdowns`,
          )) as Array<{ total: number }>)
        : [];
      const total = rows[0]?.total ?? 0;
      if (total > 0) {
        throw new Error(
          `Rollback de BillingInstallationBreakdowns bloqueado: ${total} consumo(s) de ` +
            `instalación con valor congelado. Para continuar de forma destructiva, exporte ` +
            `${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS billing_installation_breakdown_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS billing_installation_breakdowns`);
  }
}
