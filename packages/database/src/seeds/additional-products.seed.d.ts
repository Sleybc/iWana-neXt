import { DataSource, QueryRunner } from 'typeorm';
export declare function seedAdditionalProducts(queryRunner: QueryRunner, tenantId: string, schemaName: string): Promise<void>;
export declare function seedAdditionalProductsForAllTenants(dataSource: DataSource): Promise<void>;
//# sourceMappingURL=additional-products.seed.d.ts.map