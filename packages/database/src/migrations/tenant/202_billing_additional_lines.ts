import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/** El titular anonimizado deja sus filas de CRM en solo lectura (trigger de la 169/178). */
const NOT_ANONYMIZED = `NOT EXISTS (
  SELECT 1 FROM subscribers s
   WHERE s.id = c.subscriber_id
     AND (s.anonymized_at IS NOT NULL OR s.anonymized_request_id IS NOT NULL))`;

/**
 * Migración 202 — adicionales facturados (spec MOD14 2026-11-12 «IVA por concepto y cortesías»,
 * bloque C: D3, R3, CA-2).
 *
 * - `billing_document_lines.additional_item_id`: ítem del catálogo que origina una línea
 *   `ADICIONAL` (el tipo ya cabe en el CHECK de la 193). Da la idempotencia por contrato, ítem y
 *   periodo: un producto se cobra una sola vez en un documento vivo del contrato. Solo una línea
 *   `ADICIONAL` puede llevarlo; índice parcial para la consulta de idempotencia.
 * - Relleno de `contracts.additional_vat_snapshot` (201): cada entrada sin `unitPrice` congela el
 *   nombre y el precio base vigente del ítem para el segmento del contrato (RESIDENTIAL si no
 *   tiene), igual que hace CRM al crear el contrato o agregar el adicional. Sin precio vigente
 *   queda `unitPrice: null` y el cobro lo cuenta como «adicional sin cobrar». Los contratos de
 *   titulares anonimizados no se tocan (solo lectura).
 *
 * `down()` retira la columna, el índice y las claves `unitPrice`/`name` del arreglo congelado. Si
 * hay líneas enlazadas a un ítem o precios congelados lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: sin el enlace, un producto se volvería a cobrar.
 */
export class BillingAdditionalLines2020000000202 implements MigrationInterface {
  name = 'BillingAdditionalLines2020000000202';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing_document_lines
        ADD COLUMN additional_item_id varchar(120) NULL,
        ADD CONSTRAINT chk_billing_document_lines_additional_item
          CHECK (additional_item_id IS NULL
                 OR (kind = 'ADICIONAL' AND length(additional_item_id) > 0))
    `);
    await queryRunner.query(`
      CREATE INDEX idx_billing_document_lines_additional_item
        ON billing_document_lines (tenant_id, additional_item_id)
        WHERE additional_item_id IS NOT NULL
    `);

    const priced = (await queryRunner.query(`
      WITH targets AS (
        SELECT c.id
          FROM contracts c
         WHERE jsonb_typeof(c.additional_vat_snapshot) = 'array'
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.additional_vat_snapshot) e(value)
                        WHERE NOT (e.value ? 'unitPrice'))
           AND ${NOT_ANONYMIZED}
      ),
      rebuilt AS (
        SELECT t.id,
               jsonb_agg(
                 CASE WHEN x.value ? 'unitPrice' THEN x.value
                      ELSE x.value
                           || CASE WHEN ci.name IS NOT NULL
                                   THEN jsonb_build_object('name', left(ci.name, 200))
                                   ELSE '{}'::jsonb END
                           || jsonb_build_object('unitPrice', ph.base_price::text)
                 END ORDER BY x.ord) AS snapshot
          FROM targets t
          JOIN contracts c ON c.id = t.id
          CROSS JOIN LATERAL jsonb_array_elements(c.additional_vat_snapshot)
               WITH ORDINALITY AS x(value, ord)
          LEFT JOIN catalog_items ci
            ON ci.id::text = x.value->>'itemId'
           AND ci.tenant_id = c.tenant_id
           AND ci.type = x.value->>'itemType'
          LEFT JOIN LATERAL (
            SELECT round(p.base_price, 2) AS base_price
              FROM catalog_price_history p
             WHERE p.item_id = ci.id
               AND p.tenant_id = c.tenant_id
               AND p.customer_segment = COALESCE(c.customer_segment, 'RESIDENTIAL')
               AND p.is_current = true
             ORDER BY p.valid_from DESC
             LIMIT 1
          ) ph ON true
         GROUP BY t.id
      ),
      updated AS (
        UPDATE contracts c
           SET additional_vat_snapshot = r.snapshot
          FROM rebuilt r
         WHERE r.id = c.id
        RETURNING c.id
      ) SELECT COUNT(*)::int AS total FROM updated
    `)) as Array<{ total: number }>;

    console.log(`[202] Contratos con precio de adicionales congelado=${priced[0]?.total ?? 0}.`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = (await queryRunner.query(`
        SELECT
          (SELECT COUNT(*)::int FROM billing_document_lines
            WHERE additional_item_id IS NOT NULL) AS lines,
          (SELECT COUNT(*)::int FROM contracts c
            WHERE jsonb_typeof(c.additional_vat_snapshot) = 'array'
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.additional_vat_snapshot) e(value)
                           WHERE e.value ? 'unitPrice')) AS contracts
      `)) as Array<{ lines: number; contracts: number }>;
      const lines = rows[0]?.lines ?? 0;
      const contracts = rows[0]?.contracts ?? 0;
      if (lines > 0 || contracts > 0) {
        throw new Error(
          `Rollback de BillingAdditionalLines bloqueado: ${lines} línea(s) de adicionales ` +
            `enlazadas y ${contracts} contrato(s) con precio congelado. Para continuar de forma ` +
            `destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    // Retirar las claves de bloque C. Los titulares anonimizados nunca las recibieron del
    // relleno; si alguno las tiene (alta posterior) su trigger impide reescribirlo: se omite.
    await queryRunner.query(`
      UPDATE contracts c
         SET additional_vat_snapshot = (
               SELECT COALESCE(jsonb_agg((x.value - 'unitPrice' - 'name') ORDER BY x.ord),
                               '[]'::jsonb)
                 FROM jsonb_array_elements(c.additional_vat_snapshot)
                      WITH ORDINALITY AS x(value, ord))
       WHERE jsonb_typeof(c.additional_vat_snapshot) = 'array'
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(c.additional_vat_snapshot) e(value)
                      WHERE e.value ? 'unitPrice' OR e.value ? 'name')
         AND ${NOT_ANONYMIZED}
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_billing_document_lines_additional_item`);
    await queryRunner.query(`
      ALTER TABLE billing_document_lines
        DROP CONSTRAINT IF EXISTS chk_billing_document_lines_additional_item,
        DROP COLUMN IF EXISTS additional_item_id
    `);
  }
}
