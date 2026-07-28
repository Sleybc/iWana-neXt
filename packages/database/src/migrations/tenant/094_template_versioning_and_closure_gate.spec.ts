import { TemplateVersioningAndClosureGate0940000000000 } from './094_template_versioning_and_closure_gate';

describe('TemplateVersioningAndClosureGate094', () => {
  let migration: TemplateVersioningAndClosureGate0940000000000;

  beforeEach(() => {
    migration = new TemplateVersioningAndClosureGate0940000000000();
  });

  describe('up', () => {
    it('agrega columnas inventory_request_id y movement_status a execution_order_item_usage', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ADD COLUMN IF NOT EXISTS inventory_request_id'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS movement_status'),
        ]),
      );
    });

    it('crea constraint CHECK para movement_status en execution_order_item_usage', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const checkConstraint = queries.find((q) =>
        q.includes('chk_execution_order_item_usage_movement_status'),
      );
      expect(checkConstraint).toBeDefined();
      expect(checkConstraint).toContain('PENDING');
      expect(checkConstraint).toContain('CONFIRMED');
      expect(checkConstraint).toContain('REJECTED');
    });

    it('crea índice idx_execution_order_item_usage_inventory_request', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const createIndex = queries.find((q) =>
        q.includes('idx_execution_order_item_usage_inventory_request'),
      );
      expect(createIndex).toBeDefined();
      expect(createIndex).toContain('tenant_id');
      expect(createIndex).toContain('inventory_request_id');
    });

    it('agrega columnas media_asset_id, requirement_key, asset_status a execution_order_evidence', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ADD COLUMN IF NOT EXISTS media_asset_id'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS requirement_key'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS asset_status'),
        ]),
      );
    });

    it('crea UNIQUE INDEX uq_execution_order_evidence_tenant_media_asset', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const uniqueIndex = queries.find((q) =>
        q.includes('uq_execution_order_evidence_tenant_media_asset'),
      );
      expect(uniqueIndex).toBeDefined();
      expect(uniqueIndex).toContain('UNIQUE');
    });

    it('agrega columnas de plantilla a execution_orders', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ADD COLUMN IF NOT EXISTS template_id'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS template_key'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS template_version_number'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS template_label'),
          expect.stringContaining('ADD COLUMN IF NOT EXISTS template_requirements_snapshot'),
        ]),
      );
    });

    it('crea tabla execution_order_templates', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const createTable = queries.find(
        (q) => q.includes('CREATE TABLE') && q.includes('execution_order_templates'),
      );
      expect(createTable).toBeDefined();
      expect(createTable).toContain('key');
      expect(createTable).toContain('label');
      expect(createTable).toContain('work_type');
      expect(createTable).toContain('status');
    });

    it('crea tabla execution_order_template_versions', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const createTable = queries.find(
        (q) => q.includes('CREATE TABLE') && q.includes('execution_order_template_versions'),
      );
      expect(createTable).toBeDefined();
      expect(createTable).toContain('template_id');
      expect(createTable).toContain('version');
    });

    it('crea tabla execution_order_template_requirements', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const createTable = queries.find(
        (q) => q.includes('CREATE TABLE') && q.includes('execution_order_template_requirements'),
      );
      expect(createTable).toBeDefined();
      expect(createTable).toContain('key');
      expect(createTable).toContain('kind');
      expect(createTable).toContain('required');
    });

    it('crea constraints CHECK de status en templates y versions', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.up(queryRunner);

      const templateStatusCheck = queries.find((q) =>
        q.includes('chk_execution_order_templates_status'),
      );
      expect(templateStatusCheck).toBeDefined();
      expect(templateStatusCheck).toContain('DRAFT');
      expect(templateStatusCheck).toContain('PUBLISHED');
      expect(templateStatusCheck).toContain('RETIRED');

      const versionStatusCheck = queries.find((q) =>
        q.includes('chk_execution_order_template_versions_status'),
      );
      expect(versionStatusCheck).toBeDefined();

      const requirementKindCheck = queries.find((q) =>
        q.includes('chk_execution_order_template_requirements_kind'),
      );
      expect(requirementKindCheck).toBeDefined();
      expect(requirementKindCheck).toContain('FIELD');
      expect(requirementKindCheck).toContain('EVIDENCE');
    });
  });

  describe('down', () => {
    it('elimina constraints CHECK de requirements, versions y templates', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.down(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'DROP CONSTRAINT IF EXISTS chk_execution_order_template_requirements_kind',
          ),
          expect.stringContaining(
            'DROP CONSTRAINT IF EXISTS chk_execution_order_template_versions_status',
          ),
          expect.stringContaining('DROP CONSTRAINT IF EXISTS chk_execution_order_templates_status'),
        ]),
      );
    });

    it('elimina tabla execution_order_template_requirements, versions y templates', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.down(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DROP TABLE IF EXISTS execution_order_template_requirements'),
          expect.stringContaining('DROP TABLE IF EXISTS execution_order_template_versions'),
          expect.stringContaining('DROP TABLE IF EXISTS execution_order_templates'),
        ]),
      );
    });

    it('elimina columnas de plantilla de execution_orders', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.down(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DROP COLUMN IF EXISTS template_requirements_snapshot'),
          expect.stringContaining('DROP COLUMN IF EXISTS template_label'),
          expect.stringContaining('DROP COLUMN IF EXISTS template_version_number'),
          expect.stringContaining('DROP COLUMN IF EXISTS template_key'),
          expect.stringContaining('DROP COLUMN IF EXISTS template_version_id'),
          expect.stringContaining('DROP COLUMN IF EXISTS template_id'),
        ]),
      );
    });

    it('elimina columnas de evidence: asset_status, requirement_key, media_asset_id', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.down(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DROP COLUMN IF EXISTS asset_status'),
          expect.stringContaining('DROP COLUMN IF EXISTS requirement_key'),
          expect.stringContaining('DROP COLUMN IF EXISTS media_asset_id'),
        ]),
      );
    });

    it('elimina columnas de item_usage: movement_status, inventory_request_id', async () => {
      const queries: string[] = [];
      const queryRunner = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
        }),
      } as never;

      await migration.down(queryRunner);

      expect(queries).toEqual(
        expect.arrayContaining([
          expect.stringContaining('DROP COLUMN IF EXISTS movement_status'),
          expect.stringContaining('DROP COLUMN IF EXISTS inventory_request_id'),
        ]),
      );
    });
  });

  describe('reversibility (round-trip)', () => {
    it('down revierte todas las queries generadas por up en orden inverso coherente', async () => {
      const upQueries: string[] = [];
      const downQueries: string[] = [];

      const upRunner = {
        query: jest.fn(async (sql: string) => {
          upQueries.push(sql);
        }),
      } as never;

      const downRunner = {
        query: jest.fn(async (sql: string) => {
          downQueries.push(sql);
        }),
      } as never;

      await migration.up(upRunner);
      await migration.down(downRunner);

      // Ambas secuencias generan queries
      expect(upQueries.length).toBeGreaterThan(0);
      expect(downQueries.length).toBeGreaterThan(0);

      // El down deshace las tablas creadas por up
      const upCreatedTables = upQueries.filter(
        (q) => q.includes('CREATE TABLE') && q.includes('IF NOT EXISTS'),
      );
      const downDroppedTables = downQueries.filter((q) => q.includes('DROP TABLE IF EXISTS'));

      // Cada tabla creada por up debe tener su contraparte DROP en down
      const tableNames = [
        'execution_order_template_requirements',
        'execution_order_template_versions',
        'execution_order_templates',
      ];
      for (const tableName of tableNames) {
        expect(upQueries.some((q) => q.includes(`CREATE TABLE`) && q.includes(tableName))).toBe(
          true,
        );
        expect(downQueries.some((q) => q.includes(`DROP TABLE IF EXISTS ${tableName}`))).toBe(true);
      }

      // Las columnas agregadas por up deben tener su DROP en down
      const templateColumns = [
        'template_requirements_snapshot',
        'template_label',
        'template_version_number',
        'template_key',
        'template_version_id',
        'template_id',
      ];
      for (const col of templateColumns) {
        expect(upQueries.some((q) => q.includes(`ADD COLUMN IF NOT EXISTS ${col}`))).toBe(true);
        expect(downQueries.some((q) => q.includes(`DROP COLUMN IF EXISTS ${col}`))).toBe(true);
      }
    });
  });
});
