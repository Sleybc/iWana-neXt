'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ExtendGoodsReceiptStatusForPurchasing0500000000000 = void 0;
/**
 * Migracion 050: amplía el enum de recepciones para soportar parcialidades y discrepancias.
 */
class ExtendGoodsReceiptStatusForPurchasing0500000000000 {
  name = 'ExtendGoodsReceiptStatusForPurchasing0500000000000';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TYPE goods_receipt_status
      ADD VALUE IF NOT EXISTS 'PARTIAL'
    `);
    await queryRunner.query(`
      ALTER TYPE goods_receipt_status
      ADD VALUE IF NOT EXISTS 'WITH_SHORTAGES'
    `);
    await queryRunner.query(`
      ALTER TYPE goods_receipt_status
      ADD VALUE IF NOT EXISTS 'WITH_DAMAGES'
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`
      UPDATE goods_receipts
      SET status = CASE
        WHEN status = 'PARTIAL' THEN 'IN_PROGRESS'
        WHEN status IN ('WITH_SHORTAGES', 'WITH_DAMAGES') THEN 'COMPLETED'
        ELSE status
      END
      WHERE status IN ('PARTIAL', 'WITH_SHORTAGES', 'WITH_DAMAGES')
    `);
    await queryRunner.query(`
      ALTER TABLE goods_receipts
      ALTER COLUMN status DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TYPE goods_receipt_status
      RENAME TO goods_receipt_status_old
    `);
    await queryRunner.query(`
      CREATE TYPE goods_receipt_status AS ENUM (
        'DRAFT',
        'IN_PROGRESS',
        'COMPLETED',
        'REJECTED',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE goods_receipts
      ALTER COLUMN status TYPE goods_receipt_status
      USING status::text::goods_receipt_status
    `);
    await queryRunner.query(`
      ALTER TABLE goods_receipts
      ALTER COLUMN status SET DEFAULT 'DRAFT'
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS goods_receipt_status_old`);
  }
}
exports.ExtendGoodsReceiptStatusForPurchasing0500000000000 =
  ExtendGoodsReceiptStatusForPurchasing0500000000000;
//# sourceMappingURL=050_extend_goods_receipt_status_for_purchasing.js.map
