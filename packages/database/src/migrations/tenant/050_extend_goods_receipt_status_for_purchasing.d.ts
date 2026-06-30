import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * Migracion 050: amplía el enum de recepciones para soportar parcialidades y discrepancias.
 */
export declare class ExtendGoodsReceiptStatusForPurchasing0500000000000 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
//# sourceMappingURL=050_extend_goods_receipt_status_for_purchasing.d.ts.map