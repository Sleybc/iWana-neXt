import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as bcrypt from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { PlatformAuditLog, PlatformUser } from '@iwana/db';
import { PlatformRole, UserStatus } from '@iwana/shared';
import {
  BootstrapAdminCliError,
  bootstrapPlatformAdmin,
  generateBootstrapPassword,
  parseBootstrapAdminArgs,
} from './bootstrap-platform-admin';

const env = {
  MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  PII_HASH_KEY: randomBytes(32).toString('hex'),
} as NodeJS.ProcessEnv;

/** DataSource falso: una transacción que confirma salvo que el callback lance. */
function fakeDataSource(opts: {
  existingAdmins?: number;
  failAudit?: boolean;
  failCommit?: boolean;
}) {
  const saved: { users: Partial<PlatformUser>[]; audit: Partial<PlatformAuditLog>[] } = {
    users: [],
    audit: [],
  };
  const repos = new Map<unknown, unknown>([
    [
      PlatformUser,
      {
        count: jest.fn().mockResolvedValue(opts.existingAdmins ?? 0),
        create: (v: Partial<PlatformUser>) => v,
        save: jest.fn(async (v: Partial<PlatformUser>) => {
          saved.users.push(v);
          return { ...v, id: '11111111-1111-4111-8111-111111111111' };
        }),
      },
    ],
    [
      PlatformAuditLog,
      {
        save: jest.fn(async (v: Partial<PlatformAuditLog>) => {
          if (opts.failAudit) throw new Error('audit down');
          saved.audit.push(v);
          return v;
        }),
      },
    ],
  ]);
  const manager = { query: jest.fn(), getRepository: (e: unknown) => repos.get(e) };
  const dataSource = {
    transaction: async (cb: (m: unknown) => Promise<unknown>) => {
      const result = await cb(manager);
      if (opts.failCommit) throw new Error('commit failed');
      return result;
    },
  } as unknown as DataSource;
  return { dataSource, saved, manager };
}

describe('bootstrap-platform-admin CLI (B-01, ADR-116)', () => {
  let dir: string;
  let output: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iwana-bootstrap-'));
    output = join(dir, 'platform-admin.txt');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('exige un correo válido y una ruta absoluta', () => {
    expect(() => parseBootstrapAdminArgs(['--output=/x'])).toThrow(BootstrapAdminCliError);
    expect(() => parseBootstrapAdminArgs(['--email=no-es-correo', '--output=/x'])).toThrow(
      BootstrapAdminCliError,
    );
    expect(() => parseBootstrapAdminArgs(['--email=a@b.co', '--output=rel.txt'])).toThrow(
      BootstrapAdminCliError,
    );
    expect(() => parseBootstrapAdminArgs(['--email=a@b.co', '--output=/x', '--extra'])).toThrow(
      BootstrapAdminCliError,
    );
    expect(parseBootstrapAdminArgs(['--email=a@b.co', '--output=/x'])).toEqual({
      email: 'a@b.co',
      output: '/x',
    });
  });

  it('genera contraseñas de 32 caracteres distintas', () => {
    const a = generateBootstrapPassword();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(generateBootstrapPassword()).not.toBe(a);
  });

  it('no crea nada ni escribe archivo si ya existe un administrador', async () => {
    const { dataSource, saved } = fakeDataSource({ existingAdmins: 1 });
    const result = await bootstrapPlatformAdmin(dataSource, { email: 'a@b.co', output }, env);
    expect(result).toEqual({ status: 'SKIPPED' });
    expect(saved.users).toHaveLength(0);
    expect(existsSync(output)).toBe(false);
  });

  it('crea el SYSTEM_ADMIN con cambio obligatorio, audita y deja la credencial en 0600', async () => {
    const { dataSource, saved, manager } = fakeDataSource({});
    const result = await bootstrapPlatformAdmin(dataSource, { email: 'Admin@B.co', output }, env);

    expect(result.status).toBe('CREATED');
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'));
    const user = saved.users[0] ?? {};
    expect(user).toMatchObject({
      role: PlatformRole.SYSTEM_ADMIN,
      status: UserStatus.PENDING_VERIFICATION,
      passwordResetRequired: true,
      mfaEnabled: false,
    });
    expect(user.email).not.toContain('admin@b.co');
    expect(saved.audit[0]).toMatchObject({ userId: null, newValue: { origen: 'BOOTSTRAP_CLI' } });
    expect(JSON.stringify(saved.audit)).not.toContain('admin@b.co');

    expect(statSync(output).mode & 0o777).toBe(0o600);
    const password = /contrasena=(\S+)/.exec(readFileSync(output, 'utf8'))?.[1] ?? '';
    expect(await bcrypt.compare(password, user.passwordHash ?? '')).toBe(true);
  });

  it('si falla la auditoría no deja archivo', async () => {
    const { dataSource } = fakeDataSource({ failAudit: true });
    await expect(
      bootstrapPlatformAdmin(dataSource, { email: 'a@b.co', output }, env),
    ).rejects.toThrow('audit down');
    expect(existsSync(output)).toBe(false);
  });

  it('si falla la confirmación retira la credencial ya escrita', async () => {
    const { dataSource } = fakeDataSource({ failCommit: true });
    await expect(
      bootstrapPlatformAdmin(dataSource, { email: 'a@b.co', output }, env),
    ).rejects.toThrow('commit failed');
    expect(existsSync(output)).toBe(false);
  });

  it('nunca sobrescribe ni borra un archivo previo', async () => {
    writeFileSync(output, 'previo');
    const { dataSource, saved } = fakeDataSource({});
    await expect(
      bootstrapPlatformAdmin(dataSource, { email: 'a@b.co', output }, env),
    ).rejects.toMatchObject({ code: 'EEXIST' });
    expect(readFileSync(output, 'utf8')).toBe('previo');
    expect(saved.users).toHaveLength(0);
  });
});
