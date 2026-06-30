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
 * Migración retroactiva de schemas de tenant — Campos de perfil de usuario.
 *
 * Agrega columnas de perfil personal a la tabla `users` en TODOS los schemas
 * de tenant activos. Usa IF NOT EXISTS para ser idempotente.
 *
 * Campos cifrados con AES-256-GCM (mismo mecanismo que email):
 * - first_name, last_name: VARCHAR(512) — IV:authTag:ciphertext en hex
 * - document_number: VARCHAR(512) — nunca se retorna en DTOs públicos (Ley 1581)
 *
 * Campos sin cifrado:
 * - phone, job_title, document_type, avatar_url
 *
 * NOTA: document_number solo se almacena pero no se expone en respuestas.
 *
 * Uso:
 *   pnpm --filter @iwana/db migration:tenant:run
 *
 * Referencias:
 * - Ley 1581 (Habeas Data): document_number es PII sensible → no exponer en API
 * - ADR-017: Multi-tenant schema-per-tenant isolation
 */
async function runMigration(dataSource) {
  // Obtener todos los tenants activos del schema público
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
            ADD COLUMN IF NOT EXISTS first_name        VARCHAR(512),
            ADD COLUMN IF NOT EXISTS last_name         VARCHAR(512),
            ADD COLUMN IF NOT EXISTS phone             VARCHAR(20),
            ADD COLUMN IF NOT EXISTS job_title         VARCHAR(150),
            ADD COLUMN IF NOT EXISTS document_type     VARCHAR(20),
            ADD COLUMN IF NOT EXISTS document_number   VARCHAR(512),
            ADD COLUMN IF NOT EXISTS avatar_url        VARCHAR(500)
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
    console.error(`[tenant-migration] ${failed.length} schema(s) fallaron:`);
    for (const f of failed) {
      console.error(`  - ${f.schema}: ${f.error}`);
    }
    throw new Error(`Migración parcialmente fallida: ${failed.length}/${tenants.length} schemas.`);
  }
  console.log(`[tenant-migration] Completado. ${tenants.length} schema(s) migrados exitosamente.`);
}
/**
 * Punto de entrada para ejecutar desde CLI:
 *   node dist/migrations/tenant/003_add_user_profile_fields.js
 */
async function main() {
  // Importación dinámica para evitar dependencia circular en el módulo
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
//# sourceMappingURL=003_add_user_profile_fields.js.map
