/**
 * Cuenta de plataforma sintética para CA-11 en el entorno real (modo remoto de ensayo-ca11.mjs).
 *
 * Corre dentro de la imagen de la API, con el servicio `platform-admin-bootstrap` de
 * docker-compose.prod.yml (rol de base de la aplicación, MFA_ENCRYPTION_KEY y PII_HASH_KEY):
 *
 *   node cuenta-sintetica.cjs alta --email=<correo> --output=<archivo>
 *   node cuenta-sintetica.cjs baja --email=<correo>
 *   node cuenta-sintetica.cjs barrido
 *
 * - `alta` crea una cuenta IWANA_SUPPORT (el rol de menor privilegio) con cambio de contraseña
 *   obligatorio y sin MFA, como el alta inicial: el ensayo la lleva hasta el TOTP por la consola.
 *   La contraseña solo va a <archivo> (0600, creación exclusiva). Alta y auditoría, en una
 *   transacción. Solo admite correos del dominio reservado `.invalid` (RFC 2606): nunca una
 *   persona real.
 * - `baja` borra la cuenta y deja la auditoría de la baja. Las filas de auditoría anteriores se
 *   conservan.
 * - `barrido` borra las cuentas IWANA_SUPPORT con alta auditada de este origen y sin baja: las
 *   huérfanas de un ensayo interrumpido (corte, SIGKILL o alta sin respuesta legible).
 * - Nunca imprime la contraseña ni el correo cifrado; stdout lleva solo el id de la cuenta.
 */
'use strict';

const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const { closeSync, constants, fsyncSync, openSync, unlinkSync, writeSync } = require('node:fs');

const appRequire = createRequire('/app/package.json');
const { AppDataSource, PlatformAuditLog, PlatformUser } = appRequire('@iwana/db');
const { AuditAction, PlatformRole } = appRequire('@iwana/shared');
const { loadAesGcmKeyPair } = appRequire('./dist/common/crypto/aes-gcm.util');
const { hashEmail } = appRequire('./dist/common/crypto/hash-email.util');
const { resolvePiiHashKey } = appRequire('./dist/common/crypto/pii-hash-key.util');
const { PLATFORM_USER_ENTITY_TYPE } = appRequire('./dist/modules/audit/audit.constants');
const { buildBootstrapSuperAdmin } = appRequire('./dist/modules/auth/platform-bootstrap.service');

const ORIGIN = 'CA11_CUENTA_SINTETICA';
const EMAIL_PATTERN = /^ca11-[a-z0-9-]{4,40}@[a-z0-9.-]+\.invalid$/u;

function parse(argv) {
  const [action, ...rest] = argv;
  if (action === 'barrido' && rest.length === 0) return { action };
  const options = Object.fromEntries(
    rest.map((arg) => {
      const at = arg.indexOf('=');
      return [arg.slice(2, at), arg.slice(at + 1)];
    }),
  );
  if (!['alta', 'baja'].includes(action)) throw new Error('Acción: alta, baja o barrido.');
  if (!EMAIL_PATTERN.test(options.email ?? '')) {
    throw new Error('El correo debe ser sintético: ca11-…@….invalid.');
  }
  if (action === 'alta' && !options.output?.startsWith('/')) {
    throw new Error('Indica --output=<ruta absoluta>.');
  }
  return { action, email: options.email, output: options.output };
}

const keys = () => ({
  encryptionKey: loadAesGcmKeyPair({
    getOrThrow: (key) => {
      if (!process.env[key]) throw new Error(`Falta ${key} en el entorno.`);
      return process.env[key];
    },
    get: (key) => process.env[key],
  }).activeKey,
  piiHashKey: resolvePiiHashKey(process.env),
});

async function alta(manager, { email, output }) {
  const { encryptionKey, piiHashKey } = keys();
  const users = manager.getRepository(PlatformUser);
  if ((await users.count({ where: { emailHash: hashEmail(email, piiHashKey) } })) > 0) {
    throw new Error('La cuenta sintética ya existe: bórrala antes.');
  }
  const password = randomBytes(24).toString('base64url');
  const fd = openSync(
    output,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let written = false;
  try {
    const draft = await buildBootstrapSuperAdmin(email, password, encryptionKey, piiHashKey, {
      requireMfaEnrollment: true,
    });
    const saved = await users.save(users.create({ ...draft, role: PlatformRole.IWANA_SUPPORT }));
    await manager.getRepository(PlatformAuditLog).save({
      userId: null,
      action: AuditAction.CREATE,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: saved.id,
      oldValue: null,
      newValue: { role: PlatformRole.IWANA_SUPPORT, origen: ORIGIN },
    });
    writeSync(fd, `contrasena=${password}\n`);
    fsyncSync(fd);
    written = true;
    return saved.id;
  } finally {
    closeSync(fd);
    if (!written) unlinkSync(output);
  }
}

async function baja(manager, { email }) {
  const { piiHashKey } = keys();
  const users = manager.getRepository(PlatformUser);
  const found = await users.find({ where: { emailHash: hashEmail(email, piiHashKey) } });
  if (found.length !== 1) throw new Error(`Se esperaba una cuenta sintética; hay ${found.length}.`);
  const [user] = found;
  if (user.role !== PlatformRole.IWANA_SUPPORT) throw new Error('No es la cuenta sintética.');
  await users.delete({ id: user.id });
  await manager.getRepository(PlatformAuditLog).save({
    userId: null,
    action: AuditAction.DELETE,
    entityType: PLATFORM_USER_ENTITY_TYPE,
    entityId: user.id,
    oldValue: { role: user.role, origen: ORIGIN },
    newValue: null,
  });
  return user.id;
}

async function barrido(manager) {
  const orphans = await manager.query(
    `SELECT u.id FROM public.platform_users u
      WHERE u.role = $1
        AND EXISTS (SELECT 1 FROM public.platform_audit_logs c
                     WHERE c.entity_id = u.id::text AND c.action = $2 AND c.new_value->>'origen' = $3)
        AND NOT EXISTS (SELECT 1 FROM public.platform_audit_logs d
                         WHERE d.entity_id = u.id::text AND d.action = $4)`,
    [PlatformRole.IWANA_SUPPORT, AuditAction.CREATE, ORIGIN, AuditAction.DELETE],
  );
  for (const { id } of orphans) {
    await manager.getRepository(PlatformUser).delete({ id, role: PlatformRole.IWANA_SUPPORT });
    await manager.getRepository(PlatformAuditLog).save({
      userId: null,
      action: AuditAction.DELETE,
      entityType: PLATFORM_USER_ENTITY_TYPE,
      entityId: id,
      oldValue: { role: PlatformRole.IWANA_SUPPORT, origen: ORIGIN, barrido: true },
      newValue: null,
    });
  }
  return orphans.length;
}

const ACTIONS = { alta, baja, barrido };

async function main() {
  const args = parse(process.argv.slice(2));
  await AppDataSource.initialize();
  try {
    const result = await AppDataSource.transaction((manager) =>
      ACTIONS[args.action](manager, args),
    );
    process.stdout.write(`${args.action}=${result}\n`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  // Solo el mensaje: un error de TypeORM puede llevar parámetros de la consulta.
  process.stderr.write(`${error instanceof Error ? error.message : 'Error'}\n`);
  process.exitCode = 1;
});
