/** Reporte de tickets históricos con referencias de suscriptor sin correspondencia. Solo lectura. */
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { getDataSourceToken } from '@nestjs/typeorm';
import type Redis from 'ioredis';
import { isValidSchemaName } from '@iwana/db';
import { CrmSubscriberReadPort } from '../modules/crm/ports/crm-subscriber-read.port';
import { REDIS_CLIENT } from '../modules/redis/redis.module';
import {
  AssuranceSubscriberTicketLinksReadPort,
  type AssuranceSubscriberTicketLink,
} from '../modules/assurance/ports/assurance-subscriber-ticket-links-read.port';
import type { DataSource } from 'typeorm';

export interface TicketSubscriberLinksReport {
  ticketCount: number;
  ticketIds: string[];
}

export interface TicketSubscriberLinksArgs {
  tenant: string | null;
  help: boolean;
}

export async function analyzeTicketSubscriberLinks(
  assurancePort: Pick<AssuranceSubscriberTicketLinksReadPort, 'listSubscriberTicketLinks'>,
  crmPort: Pick<CrmSubscriberReadPort, 'findExistingSubscriberIds'>,
  tenantId: string,
  schemaName: string,
): Promise<TicketSubscriberLinksReport> {
  if (!isValidSchemaName(schemaName)) {
    throw new Error('Schema tenant inválido.');
  }

  const ticketLinks = await assurancePort.listSubscriberTicketLinks(tenantId, schemaName);
  const references = ticketLinks.flatMap((link) =>
    link.requesterRefId === null ? [] : [link.requesterRefId],
  );
  const existingIds = new Set(
    references.length === 0
      ? []
      : (await crmPort.findExistingSubscriberIds(tenantId, schemaName, references)).map((id) =>
          id.toLowerCase(),
        ),
  );
  const ticketIds = ticketLinks
    .filter(
      (link: AssuranceSubscriberTicketLink) =>
        link.requesterRefId === null || !existingIds.has(link.requesterRefId.toLowerCase()),
    )
    .map(({ ticketId }) => ticketId)
    .sort();

  return { ticketCount: ticketIds.length, ticketIds };
}

export function parseTicketSubscriberLinksArgs(argv: string[]): TicketSubscriberLinksArgs {
  let tenant: string | null = null;
  let tenantSeen = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
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

  return { tenant, help };
}

function ensureCliEnvLoaded(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;
  if (!loadEnvFile) return;
  const workspaceRoot = resolve(__dirname, '..', '..', '..', '..');
  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    try {
      loadEnvFile(resolve(workspaceRoot, candidate));
    } catch {
      // Los archivos locales pueden faltar en CI o en producción.
    }
  }
}

async function resolveTenantSchema(
  dataSource: Pick<DataSource, 'query'>,
  tenantRef: string,
): Promise<{ id: string; schemaName: string }> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    tenantRef,
  );
  const rows = isUuid
    ? await dataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
        [tenantRef],
      )
    : await dataSource.query(
        `SELECT id::text, schema_name, status FROM public.tenants WHERE slug = $1 LIMIT 1`,
        [tenantRef],
      );
  const tenant = (rows as Array<{ id: string; schema_name: string; status: string }>)[0];
  if (!tenant || tenant.status !== 'ACTIVE' || !isValidSchemaName(tenant.schema_name)) {
    throw new Error('Tenant inexistente, inactivo o con schema inválido.');
  }
  return { id: tenant.id, schemaName: tenant.schema_name };
}

function printHelp(): void {
  process.stdout.write(
    `Reporte de vínculos de tickets con suscriptores (solo lectura)\n\n` +
      `Uso: pnpm --filter @iwana/api exec node dist/cli/report-ticket-subscriber-links.js --tenant=<id|slug>\n\n` +
      `--tenant  UUID o slug de un tenant ACTIVE.\n` +
      `El comando siempre simula; no tiene modo de escritura.\n`,
  );
}

async function main(): Promise<void> {
  ensureCliEnvLoaded();
  const flags = parseTicketSubscriberLinksArgs(process.argv.slice(2));
  if (flags.help) return printHelp();
  if (!flags.tenant) throw new Error('Debes indicar --tenant=<id|slug>.');

  const { AppModule } = await import('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const redisClient = app.get<Redis>(REDIS_CLIENT, { strict: false });
  try {
    const dataSource = app.get<DataSource>(getDataSourceToken());
    const tenant = await resolveTenantSchema(dataSource, flags.tenant);
    const report = await analyzeTicketSubscriberLinks(
      app.get(AssuranceSubscriberTicketLinksReadPort),
      app.get(CrmSubscriberReadPort),
      tenant.id,
      tenant.schemaName,
    );
    process.stdout.write(
      `${JSON.stringify({ tenantId: tenant.id, simulation: true, ...report }, null, 2)}\n`,
    );
  } finally {
    await app.close();
    // El módulo global de Redis conserva un cliente ioredis sin lifecycle hook;
    // el contexto CLI debe liberarlo para que el proceso termine al reportar.
    redisClient.disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    process.stderr.write(
      '[TICKET-SUBSCRIBER-LINKS] No se pudo generar el reporte. Revisa la configuración del tenant y de la base de datos.\n',
    );
    process.exitCode = 1;
  });
}
