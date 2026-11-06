// Ejecuta el AuthService.login compilado contra Postgres real y mide si persiste el contador.
// Uso (desde apps/api): U=postgres://... node <ruta>/loginrollback.cjs
require('C:/appiw/apps/api/node_modules/reflect-metadata');
const req = require('module').createRequire('C:/appiw/apps/api/dist/main.js');
const { DataSource } = req('typeorm');
const { User, TenantContext, runInTenantSchema } = req('@iwana/db');
const bcrypt = req('bcryptjs');
const { AuthService } = require('C:/appiw/apps/api/dist/modules/auth/auth.service.js');
const { hashEmail } = require('C:/appiw/apps/api/dist/common/crypto/hash-email.util.js');
(async () => {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env.U,
    entities: [User],
    synchronize: false,
  });
  await ds.initialize();
  const S = 'tenant_repro';
  await ds.query(`CREATE SCHEMA ${S}`);
  await ds.query(`ALTER EXTENSION "uuid-ossp" SET SCHEMA ${S}`);
  const log = await ds.driver.createSchemaBuilder().log();
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.query(`SET search_path TO ${S}`);
  for (const q of log.upQueries) {
    if (/FOREIGN KEY/i.test(q.query)) continue;
    await qr.query(q.query, q.parameters);
  }
  await qr.release();
  const key = Buffer.alloc(32, 7);
  const email = 'repro@example.test';
  const id = '11111111-1111-4111-8111-111111111111';
  const cols = ds.getMetadata(User).columns;
  const vals = {};
  for (const c of cols) {
    if (
      c.isNullable ||
      c.default !== undefined ||
      c.isGenerated ||
      c.isCreateDate ||
      c.isUpdateDate
    )
      continue;
    vals[c.propertyName] = /uuid/.test(String(c.type)) ? id : 'x';
  }
  Object.assign(vals, {
    id,
    emailHash: hashEmail(email, key),
    passwordHash: await bcrypt.hash('Correcta1!', 4),
    failedLoginAttempts: 0,
    lockedUntil: null,
  });
  const self = Object.create(AuthService.prototype);
  Object.assign(self, { dataSource: ds, piiHashKey: key, auditService: { log: async () => {} } });
  const read = () =>
    runInTenantSchema(ds, S, (q) =>
      q.query('SELECT failed_login_attempts AS n, locked_until AS l FROM users WHERE id=$1', [id]),
    );
  await TenantContext.run({ tenantId: id, schemaName: S }, async () => {
    await runInTenantSchema(ds, S, (q) => q.manager.save(User, q.manager.create(User, vals)));
    console.log('inicial', JSON.stringify(await read()));
    for (let i = 1; i <= 7; i++) {
      let r;
      try {
        await self.login({ email, password: 'Mala1!' });
        r = 'OK?';
      } catch (e) {
        r = e.constructor.name + ': ' + e.message;
      }
      console.log('intento', i, r, JSON.stringify(await read()));
    }
    await runInTenantSchema(ds, S, async (q) => {
      const u = await q.manager.findOne(User, { where: { id } });
      await self.registerFailedAttempt(q.manager, u);
    });
    console.log('control, misma escritura con commit', JSON.stringify(await read()));
  });
  await ds.destroy();
})().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
