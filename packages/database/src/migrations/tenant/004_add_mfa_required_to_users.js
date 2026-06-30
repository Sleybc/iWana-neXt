'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.runMigration = runMigration;
const data_source_1 = require('../../data-source');
/**
 * Migración retroactiva de schemas de tenant — Campo mfa_required en users.
 *
 * Agrega columna `mfa_required` a la tabla `users` en TODOS los schemas
 * de tenant activos. Default false — no cambia el comportamiento de usuarios existentes.
 *
 * Uso:
 *   pnpm --filter @iwana/db migration:tenant:run
 */
async function runMigration(dataSource) {
  const tenants = await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  );
  if (tenants.length === 0) {
    console.log('[tenant-migration] No hay tenants activos. Nada que migrar.');
    return;
  }
  console.log(`[tenant-migration] Migrando ${tenants.length} tenant(s)...`);
  const results = [];
  for (const tenant of tenants) {
    try {
      await (0, data_source_1.runInTenantSchema)(dataSource, tenant.schema_name, async (qr) => {
        await qr.query(`
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT false
        `);
      });
      results.push({ schema: tenant.schema_name, success: true });
      console.log(`[tenant-migration] ✓ ${tenant.schema_name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ schema: tenant.schema_name, success: false, error: message });
      console.error(`[tenant-migration] ✗ ${tenant.schema_name}: ${message}`);
    }
  }
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    throw new Error(`Migración parcialmente fallida: ${failed.length}/${tenants.length} schemas.`);
  }
  console.log(`[tenant-migration] Completado. ${tenants.length} schema(s) migrados exitosamente.`);
}
/**
 * Punto de entrada para ejecutar desde CLI:
 *   node dist/migrations/tenant/004_add_mfa_required_to_users.js
 */
async function main() {
  const { AppDataSource } = await Promise.resolve().then(() =>
    __importStar(require('../../data-source')),
  );
  await AppDataSource.initialize();
  try {
    await runMigration(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}
// Solo ejecutar si se llama directamente (no como módulo importado)
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
//# sourceMappingURL=004_add_mfa_required_to_users.js.map
