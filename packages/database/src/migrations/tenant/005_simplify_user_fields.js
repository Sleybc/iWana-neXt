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
exports.revertMigration = revertMigration;
const crypto = __importStar(require('crypto'));
const data_source_1 = require('../../data-source');
function isHex(segment, expectedLength) {
  if (!segment || (expectedLength !== undefined && segment.length !== expectedLength)) {
    return false;
  }
  return /^[0-9a-f]+$/i.test(segment) && segment.length % 2 === 0;
}
function looksLikeEncryptedValue(value) {
  const parts = value.split(':');
  if (parts.length !== 3) {
    return false;
  }
  const [iv, authTag, ciphertext] = parts;
  return isHex(iv ?? '', 24) && isHex(authTag ?? '', 32) && isHex(ciphertext ?? '');
}
function decryptLegacyValue(encrypted, encryptionKey) {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de valor cifrado inválido.');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
function decodeLegacyValue(value, encryptionKey) {
  if (!value) {
    return null;
  }
  if (!looksLikeEncryptedValue(value)) {
    return value;
  }
  return decryptLegacyValue(value, encryptionKey);
}
function hashEmail(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}
/**
 * Migración 005 — simplifica campos de users a texto plano manteniendo emailHash.
 *
 * No elimina `email_hash` porque sigue siendo dependencia transversal de autenticación.
 */
async function runMigration(dataSource) {
  const keyHex = process.env['MFA_ENCRYPTION_KEY'];
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('MFA_ENCRYPTION_KEY no está disponible para descifrar datos legacy.');
  }
  const encryptionKey = Buffer.from(keyHex, 'hex');
  const tenants = await dataSource.query(
    `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  );
  if (tenants.length === 0) {
    console.log('[tenant-migration][005] No hay tenants activos. Nada que migrar.');
    return;
  }
  for (const tenant of tenants) {
    await (0, data_source_1.runInTenantSchema)(dataSource, tenant.schema_name, async (qr) => {
      const users = await qr.query(
        `SELECT id, email, first_name, last_name, document_number FROM users`,
      );
      for (const user of users) {
        const nextEmail = decodeLegacyValue(user.email, encryptionKey);
        if (!nextEmail) {
          throw new Error(`El usuario ${user.id} no tiene email válido para migrar.`);
        }
        const normalizedEmail = nextEmail.toLowerCase().trim();
        const nextFirstName = decodeLegacyValue(user.first_name, encryptionKey);
        const nextLastName = decodeLegacyValue(user.last_name, encryptionKey);
        const nextDocumentNumber = decodeLegacyValue(user.document_number, encryptionKey);
        await qr.query(
          `
            UPDATE users
               SET email = $1,
                   email_hash = $2,
                   first_name = $3,
                   last_name = $4,
                   document_number = $5
             WHERE id = $6
          `,
          [
            normalizedEmail,
            hashEmail(normalizedEmail),
            nextFirstName,
            nextLastName,
            nextDocumentNumber,
            user.id,
          ],
        );
      }
      await qr.query(`ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255)`);
      await qr.query(`ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(100)`);
      await qr.query(`ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(100)`);
      await qr.query(`ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(30)`);
      await qr.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email`);
      await qr.query(`ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email)`);
      await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_first_name ON users (first_name)`);
      await qr.query(`CREATE INDEX IF NOT EXISTS idx_users_last_name ON users (last_name)`);
    });
    console.log(`[tenant-migration][005] ✓ ${tenant.schema_name}`);
  }
}
/** Reversión estructural de la migración 005. */
async function revertMigration(dataSource) {
  const tenants = await dataSource.query(
    `SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  );
  if (tenants.length === 0) {
    console.log('[tenant-migration][005:down] No hay tenants activos. Nada que revertir.');
    return;
  }
  for (const tenant of tenants) {
    await (0, data_source_1.runInTenantSchema)(dataSource, tenant.schema_name, async (qr) => {
      await qr.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_email`);
      await qr.query(`DROP INDEX IF EXISTS idx_users_first_name`);
      await qr.query(`DROP INDEX IF EXISTS idx_users_last_name`);
      await qr.query(`ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(512)`);
      await qr.query(`ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(512)`);
      await qr.query(`ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(512)`);
      await qr.query(`ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(512)`);
    });
    console.log(`[tenant-migration][005:down] ✓ ${tenant.schema_name}`);
  }
}
async function main() {
  const { AppDataSource } = await Promise.resolve().then(() =>
    __importStar(require('../../data-source')),
  );
  await AppDataSource.initialize();
  try {
    if (process.argv.includes('--down')) {
      await revertMigration(AppDataSource);
      return;
    }
    await runMigration(AppDataSource);
  } finally {
    await AppDataSource.destroy();
  }
}
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
//# sourceMappingURL=005_simplify_user_fields.js.map
