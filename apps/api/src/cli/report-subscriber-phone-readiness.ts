/** Conteo agregado de teléfonos normalizables y acciones de contacto por tenant. */
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import {
  COUNTRY_PHONE_PREFIX,
  SubscriberStatus,
  UserRole,
  toDialablePhone,
  type SubscriberListItem,
} from '@iwana/shared';
import type { DataSource } from 'typeorm';
import type { TenantContext as TenantContextApi } from '@iwana/db';
import type { SubscribersService } from '../modules/crm/subscribers/subscribers.service';
import type { projectSubscriberForList as ProjectSubscriberForList } from '../modules/crm/subscribers/subscriber-projection';

interface TenantRow {
  id: string;
  slug: string;
  schema_name: string;
  country_code: string | null;
}

interface TenantReference {
  id: string;
  slug: string;
  schemaName: string;
  countryCode: string | null;
}

export interface PhoneFieldCount {
  populated: number;
  normalizable: number;
  notNormalizable: number;
  normalizablePercent: number | null;
}

export interface SubscriberPhoneReadinessReport {
  tenantId: string;
  tenantSlug: string;
  countryPrefixAvailable: boolean;
  subscribersScanned: number;
  fields: {
    phone: PhoneFieldCount;
    altContactPhone: PhoneFieldCount;
    whatsapp: PhoneFieldCount;
  };
  actions: {
    callSubscribers: number;
    whatsappSubscribers: number;
  };
}

export interface SubscriberPhoneReadinessArgs {
  tenant: string | null;
  allActiveTenants: boolean;
  help: boolean;
}

type PhoneField = keyof SubscriberPhoneReadinessReport['fields'];

interface MutablePhoneFieldCount {
  populated: number;
  normalizable: number;
}

interface MutableReadinessReport {
  subscribersScanned: number;
  fields: Record<PhoneField, MutablePhoneFieldCount>;
  actions: {
    callSubscribers: number;
    whatsappSubscribers: number;
  };
}

const TENANT_LIST_SQL = `
  SELECT id::text AS id, slug, schema_name, country_code
    FROM public.tenants
   WHERE status = $1
   ORDER BY slug
`;

export interface AllowedTargetOptions {
  /**
   * Solo para la prueba integrada (`*.postgres.integration.spec.ts`): admite la base del job
   * de integración. El binario nunca lo activa y ninguna variable de entorno lo enciende.
   */
  allowEphemeralTest?: boolean;
}

/** Bases que crean y destruyen los jobs de integración (mismo criterio que las specs de CRM/inventario). */
const INTEGRATION_DATABASE_NAME = /^(?:test|dbiw|iwana_it_[a-z0-9_]+)$/u;
/** Schemas efímeros que la prueba integrada crea y destruye. */
const EPHEMERAL_SCHEMA_NAME = /^tenant_[a-z0-9_]{1,55}$/u;

function rejectReadonlyRole(env: NodeJS.ProcessEnv): void {
  if (env['DB_USER']?.trim() === 'iwana_readonly') {
    throw new Error('Usa el rol de aplicación; iwana_readonly no puede descifrar los teléfonos.');
  }
}

function assertEphemeralTestTarget(env: NodeJS.ProcessEnv): void {
  if (env['NODE_ENV'] !== 'test' || env['IWANA_DB_INTEGRATION_AVAILABLE'] !== 'true') {
    throw new Error(
      'El destino efímero solo existe en la prueba integrada (NODE_ENV=test e IWANA_DB_INTEGRATION_AVAILABLE=true).',
    );
  }
  if (!INTEGRATION_DATABASE_NAME.test((env['DB_NAME'] ?? '').trim())) {
    throw new Error(
      'El destino efímero exige la base de integración del job (test, dbiw o iwana_it_*).',
    );
  }
  rejectReadonlyRole(env);
}

export function assertAllowedTarget(
  env: NodeJS.ProcessEnv,
  options: AllowedTargetOptions = {},
): void {
  if (options.allowEphemeralTest === true) {
    assertEphemeralTestTarget(env);
    return;
  }

  const nodeEnv = env['NODE_ENV'];
  if (nodeEnv !== 'production' && nodeEnv !== 'staging') {
    throw new Error('Usa NODE_ENV=production o NODE_ENV=staging; este CLI no admite desarrollo.');
  }

  const requiredDatabaseVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  if (requiredDatabaseVars.some((key) => !env[key]?.trim())) {
    throw new Error('Falta configuración explícita de la base de datos para el entorno real.');
  }
  rejectReadonlyRole(env);

  const host = (env['DB_HOST'] ?? '').trim().toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === 'iwana_postgres_dev' ||
    /(?:^|[_-])dev$/u.test(host) ||
    /(?:^|[_-])dev$/u.test((env['DB_NAME'] ?? '').trim().toLowerCase())
  ) {
    throw new Error('El CLI no puede conectarse a una base de desarrollo local.');
  }
}

function createMutableReport(): MutableReadinessReport {
  return {
    subscribersScanned: 0,
    fields: {
      phone: { populated: 0, normalizable: 0 },
      altContactPhone: { populated: 0, normalizable: 0 },
      whatsapp: { populated: 0, normalizable: 0 },
    },
    actions: { callSubscribers: 0, whatsappSubscribers: 0 },
  };
}

function toPercent(normalizable: number, populated: number): number | null {
  if (populated === 0) return null;
  return Math.round((normalizable / populated) * 10_000) / 100;
}

function firstDialablePhone(
  candidates: Array<string | null | undefined>,
  countryPrefix: string,
): string | null {
  for (const candidate of candidates) {
    const dialablePhone = toDialablePhone(candidate, countryPrefix);
    if (dialablePhone) return dialablePhone;
  }
  return null;
}

function addSubscriberToReport(
  report: MutableReadinessReport,
  subscriber: SubscriberListItem,
  countryPrefix: string | null,
): void {
  report.subscribersScanned += 1;

  const values: Record<PhoneField, string | null> = {
    phone: subscriber.phone ?? null,
    altContactPhone: subscriber.altContactPhone ?? null,
    whatsapp: subscriber.whatsapp ?? null,
  };
  const fieldPrefix = countryPrefix ?? '';

  for (const field of Object.keys(values) as PhoneField[]) {
    const value = values[field];
    if (!value?.trim()) continue;

    report.fields[field].populated += 1;
    if (toDialablePhone(value, fieldPrefix)) report.fields[field].normalizable += 1;
  }

  const hidden = subscriber.privacyRestricted || Boolean(subscriber.anonymizedAt);
  if (hidden || countryPrefix === null) return;

  const callPhone = firstDialablePhone(
    [subscriber.phone, subscriber.altContactPhone],
    countryPrefix,
  );
  const whatsappPhone = firstDialablePhone([subscriber.whatsapp, subscriber.phone], countryPrefix);
  if (callPhone) report.actions.callSubscribers += 1;
  if (whatsappPhone) report.actions.whatsappSubscribers += 1;
}

function finalizeReport(
  tenant: TenantReference,
  report: MutableReadinessReport,
  countryPrefix: string | null,
): SubscriberPhoneReadinessReport {
  const toFieldCount = (field: MutablePhoneFieldCount): PhoneFieldCount => ({
    ...field,
    notNormalizable: field.populated - field.normalizable,
    normalizablePercent: toPercent(field.normalizable, field.populated),
  });

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    countryPrefixAvailable: countryPrefix !== null,
    subscribersScanned: report.subscribersScanned,
    fields: {
      phone: toFieldCount(report.fields.phone),
      altContactPhone: toFieldCount(report.fields.altContactPhone),
      whatsapp: toFieldCount(report.fields.whatsapp),
    },
    actions: report.actions,
  };
}

export function parseSubscriberPhoneReadinessArgs(argv: string[]): SubscriberPhoneReadinessArgs {
  let tenant: string | null = null;
  let tenantSeen = false;
  let allActiveTenants = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--all-active-tenants') {
      if (allActiveTenants) throw new Error('Usa --all-active-tenants una sola vez.');
      allActiveTenants = true;
    } else if (arg.startsWith('--tenant=')) {
      if (tenantSeen) throw new Error('Usa --tenant una sola vez.');
      tenantSeen = true;
      tenant = arg.slice('--tenant='.length).trim();
      if (!tenant) throw new Error('--tenant requiere un id o slug.');
      if (tenant.includes('=')) throw new Error('--tenant acepta un solo id o slug.');
    } else {
      throw new Error(`Argumento desconocido: ${arg.split('=')[0]}`);
    }
  }

  if (!help && allActiveTenants === (tenant !== null)) {
    throw new Error('Indica exactamente uno: --tenant=<id|slug> o --all-active-tenants.');
  }

  return { tenant, allActiveTenants, help };
}

function mapTenantRow(row: TenantRow): TenantReference {
  return {
    id: row.id,
    slug: row.slug,
    schemaName: row.schema_name,
    countryCode: row.country_code,
  };
}

async function resolveTenants(
  dataSource: Pick<DataSource, 'query'>,
  args: SubscriberPhoneReadinessArgs,
  isValidSchemaName: (schemaName: string) => boolean,
): Promise<TenantReference[]> {
  if (args.allActiveTenants) {
    const rows = (await dataSource.query(TENANT_LIST_SQL, [
      SubscriberStatus.ACTIVE,
    ])) as TenantRow[];
    return rows.map((row) => {
      if (!isValidSchemaName(row.schema_name)) throw new Error('Tenant con schema inválido.');
      return mapTenantRow(row);
    });
  }

  if (!args.tenant) throw new Error('Debes indicar el tenant que se medirá.');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    args.tenant,
  );
  const tenantSql = isUuid
    ? `SELECT id::text AS id, slug, schema_name, country_code
         FROM public.tenants
        WHERE status = $1 AND id = $2::uuid
        ORDER BY slug`
    : `SELECT id::text AS id, slug, schema_name, country_code
         FROM public.tenants
        WHERE status = $1 AND slug = $2
        ORDER BY slug`;
  const rows = await dataSource.query(tenantSql, [SubscriberStatus.ACTIVE, args.tenant]);
  const row = (rows as TenantRow[])[0];
  if (!row) throw new Error('Tenant inexistente o inactivo.');
  if (!isValidSchemaName(row.schema_name)) throw new Error('Tenant con schema inválido.');
  return [mapTenantRow(row)];
}

function getTenantPhonePrefix(countryCode: string | null): string | null {
  const normalizedCode = countryCode?.trim().toUpperCase();
  return normalizedCode ? (COUNTRY_PHONE_PREFIX[normalizedCode] ?? null) : null;
}

async function measureTenant(
  runtime: SubscriberPhoneReadinessRuntime,
  tenant: TenantReference,
): Promise<SubscriberPhoneReadinessReport> {
  const { subscribersService, tenantContext, project } = runtime;
  const countryPrefix = getTenantPhonePrefix(tenant.countryCode);
  const mutableReport = createMutableReport();

  await tenantContext.run(
    { tenantId: tenant.id, schemaName: tenant.schemaName, tenantSlug: tenant.slug },
    async () => {
      let page = 1;
      let totalPages = 1;
      do {
        const result = await subscribersService.findAll({ page, limit: 100, canSeeBlocked: false });
        for (const subscriber of result.data) {
          const projected = project(subscriber, UserRole.ADMIN, false);
          addSubscriberToReport(mutableReport, projected, countryPrefix);
        }
        totalPages = Math.max(1, result.meta.totalPages ?? Math.ceil(result.total / 100));
        page += 1;
      } while (page <= totalPages);
    },
  );

  return finalizeReport(tenant, mutableReport, countryPrefix);
}

function helpText(): string {
  return (
    `Disponibilidad agregada de teléfonos y acciones del listado de suscriptores (solo lectura)\n\n` +
    `Uso: pnpm --filter @iwana/api report:subscriber-phone-readiness -- --tenant=<id|slug>\n` +
    `     pnpm --filter @iwana/api report:subscriber-phone-readiness -- --all-active-tenants\n\n` +
    `--tenant              Mide un tenant ACTIVE por UUID o slug.\n` +
    `--all-active-tenants  Mide cada tenant ACTIVE y los reporta por separado.\n` +
    `El resultado contiene conteos agregados; nunca imprime teléfonos ni IDs de suscriptor.\n`
  );
}

/** Dependencias que el binario obtiene del contexto Nest y la prueba integrada construye a mano. */
export interface SubscriberPhoneReadinessRuntime {
  dataSource: Pick<DataSource, 'query'>;
  subscribersService: Pick<SubscribersService, 'findAll'>;
  tenantContext: Pick<typeof TenantContextApi, 'run'>;
  isValidSchemaName: (schemaName: string) => boolean;
  project: typeof ProjectSubscriberForList;
  close: () => Promise<void>;
}

export interface EphemeralTestTarget {
  /** Schema efímero que reemplaza al del tenant resuelto; lo crea y destruye la prueba. */
  schemaName: string;
}

export interface RunSubscriberPhoneReadinessOptions {
  argv: string[];
  env: NodeJS.ProcessEnv;
  write: (chunk: string) => void;
  createRuntime: () => Promise<SubscriberPhoneReadinessRuntime>;
  /** Solo la prueba integrada lo pasa; el binario nunca. */
  ephemeralTest?: EphemeralTestTarget;
}

export async function runSubscriberPhoneReadiness(
  options: RunSubscriberPhoneReadinessOptions,
): Promise<void> {
  const args = parseSubscriberPhoneReadinessArgs(options.argv);
  if (args.help) {
    options.write(helpText());
    return;
  }

  const ephemeralTest = options.ephemeralTest;
  // Las guardas corren antes de cargar el contexto Nest o abrir conexiones.
  assertAllowedTarget(options.env, { allowEphemeralTest: ephemeralTest !== undefined });
  if (ephemeralTest) {
    if (args.allActiveTenants) {
      throw new Error('El destino efímero exige --tenant=<id|slug>.');
    }
    if (!EPHEMERAL_SCHEMA_NAME.test(ephemeralTest.schemaName)) {
      throw new Error('El schema efímero debe tener la forma tenant_<sufijo>.');
    }
  }

  const runtime = await options.createRuntime();
  try {
    const resolved = await resolveTenants(runtime.dataSource, args, runtime.isValidSchemaName);
    const tenants = ephemeralTest
      ? resolved.map((tenant) => {
          if (!runtime.isValidSchemaName(ephemeralTest.schemaName)) {
            throw new Error('El schema efímero no es un schema válido.');
          }
          return { ...tenant, schemaName: ephemeralTest.schemaName };
        })
      : resolved;
    const reports: SubscriberPhoneReadinessReport[] = [];
    for (const tenant of tenants) {
      reports.push(await measureTenant(runtime, tenant));
    }
    options.write(
      `${JSON.stringify(
        {
          readOnly: true,
          environment: options.env['NODE_ENV'],
          tenantCount: reports.length,
          reports,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await runtime.close();
  }
}

async function createAppRuntime(): Promise<SubscriberPhoneReadinessRuntime> {
  const [
    { AppModule },
    { TenantContext, isValidSchemaName },
    { SubscribersService },
    { projectSubscriberForList },
    { REDIS_CLIENT },
  ] = await Promise.all([
    import('../app.module'),
    import('@iwana/db'),
    import('../modules/crm/subscribers/subscribers.service'),
    import('../modules/crm/subscribers/subscriber-projection'),
    import('../modules/redis/redis.module'),
  ]);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const redisClient = app.get<Redis>(REDIS_CLIENT, { strict: false });
  return {
    dataSource: app.get<DataSource>(getDataSourceToken()),
    subscribersService: app.get(SubscribersService),
    tenantContext: TenantContext,
    isValidSchemaName,
    project: projectSubscriberForList,
    close: async () => {
      try {
        await app.close();
      } finally {
        redisClient.disconnect();
      }
    },
  };
}

async function main(): Promise<void> {
  await runSubscriberPhoneReadiness({
    argv: process.argv.slice(2),
    env: process.env,
    write: (chunk) => {
      process.stdout.write(chunk);
    },
    createRuntime: createAppRuntime,
  });
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write(
      '[SUBSCRIBER-PHONE-READINESS] No se pudo generar el reporte. Revisa la configuración de la base y los tenants.\n',
    );
    process.exitCode = 1;
  });
}
