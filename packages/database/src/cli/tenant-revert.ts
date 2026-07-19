import { createInterface } from 'node:readline/promises';

import { AppDataSource } from '../data-source';
import {
  DESTRUCTIVE_DOWN_ENV_VAR,
  MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG,
  revertTenantMigrations,
} from '../migrations/tenant/revert';

/**
 * CLI de revert de migraciones tenant.
 *
 * Contraparte de `tenant-migrate.ts`, con una asimetría deliberada: aquel migra
 * todos los tenants activos; este exige un schema y revierte una sola migración.
 *
 * Encargo literal de ADR-056: la ayuda expone el requisito de
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN` — quien teclea `--help` debe entender el
 * requisito antes de disparar, no después.
 */

export const USAGE = `
Revert de migraciones de schema de tenant (@iwana/db)

  pnpm --filter @iwana/db migration:tenant:revert -- --schema=<tenant_x> [opciones]

Revierte la ULTIMA migracion aplicada a UN schema de tenant.

OPCIONES
  --schema=<nombre>   OBLIGATORIO. Schema del tenant (tenant_*). Sin valor por
                      defecto y sin comodines: este comando nunca itera tenants.
  --steps=<n>         Numero de migraciones a revertir, de la mas reciente hacia
                      atras. Por defecto 1. Usar >1 es explicito y deliberado.
  --dry-run           Resuelve e imprime el plan sin tocar el schema.
  --yes               Omite la confirmacion interactiva. Obligatorio cuando no
                      hay TTY (CI, scripts).
  -h, --help          Esta ayuda.

CONFIRMACION
  Con TTY y sin --yes se pide teclear el nombre exacto del schema. Es la unica
  guarda que obliga a leer sobre que se esta operando.

REQUISITO DE ENTORNO PARA MIGRACIONES DESTRUCTIVAS
  Algunas migraciones tienen un down() que solo procede si el schema no contiene
  datos de negocio. Su up() creo tablas VACIAS: si a estas alturas tienen filas,
  esas filas no las creo la migracion, las creo la operacion del tenant.
  Eliminarlas no seria revertir la migracion, seria destruir el tenant.

  Para esos casos el down() se bloquea salvo que se declare la intencion:

      ${DESTRUCTIVE_DOWN_ENV_VAR}=true

  El valor debe ser exactamente "true". Ni 1, ni TRUE, ni yes abren la puerta.

  Este CLI NO fija esa variable y no ofrece ninguna opcion para hacerlo: debe
  exportarse de forma consciente y acotada a la sesion que ejecuta el revert.
  Exportarla de forma permanente anula la guarda — no lo haga.

  Dar de baja un tenant NO se hace por esta via: use el ciclo gobernado de
  ADR-033 (MARKED_FOR_DELETION + retencion + purga).

  Migraciones que hoy exigen el flag:
${MIGRATIONS_REQUIRING_DESTRUCTIVE_FLAG.map((name) => `      - ${name}`).join('\n')}

EJEMPLOS
  # Ver que se revertiria, sin tocar nada
  pnpm --filter @iwana/db migration:tenant:revert -- --schema=tenant_acme --dry-run

  # Revertir la ultima migracion, con confirmacion interactiva
  pnpm --filter @iwana/db migration:tenant:revert -- --schema=tenant_acme

  # Revertir en CI (sin TTY)
  pnpm --filter @iwana/db migration:tenant:revert -- --schema=tenant_acme --yes
`;

interface ParsedArgs {
  schema?: string;
  steps: number;
  dryRun: boolean;
  yes: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { steps: 1, dryRun: false, yes: false, help: false };

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      parsed.help = true;
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--yes') {
      parsed.yes = true;
    } else if (arg.startsWith('--schema=')) {
      parsed.schema = arg.slice('--schema='.length);
    } else if (arg.startsWith('--steps=')) {
      const value = Number(arg.slice('--steps='.length));

      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--steps debe ser un entero >= 1 (recibido: "${arg.slice(8)}").`);
      }
      parsed.steps = value;
    } else {
      throw new Error(`Argumento no reconocido: "${arg}". Use --help.`);
    }
  }

  return parsed;
}

async function confirmSchema(schemaName: string, steps: number): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(
      `\nSe revertira${steps > 1 ? `n ${steps} migraciones` : ' 1 migracion'} sobre "${schemaName}".`,
    );
    const answer = await rl.question(`Teclee el nombre del schema para confirmar: `);

    return answer.trim() === schemaName;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[REVERT] ${(err as Error).message}`);
    process.exit(2);
  }

  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!args.schema) {
    console.error(
      '[REVERT] Falta --schema=<tenant_x>. Es obligatorio: este comando nunca itera tenants.',
    );
    console.error('[REVERT] Use --help para ver la ayuda completa.');
    process.exit(2);
  }

  if (!args.dryRun && !args.yes) {
    if (!process.stdin.isTTY) {
      console.error(
        '[REVERT] Sin TTY no se puede confirmar de forma interactiva. Anada --yes de forma explicita.',
      );
      process.exit(2);
    }

    if (!(await confirmSchema(args.schema, args.steps))) {
      console.error('[REVERT] Confirmacion no coincide. Abortado sin tocar el schema.');
      process.exit(1);
    }
  }

  await AppDataSource.initialize();
  let exitCode = 0;
  try {
    await revertTenantMigrations(AppDataSource, args.schema, {
      steps: args.steps,
      dryRun: args.dryRun,
    });
    console.log(
      args.dryRun
        ? '[REVERT] Dry-run completado. No se modifico nada.'
        : '[REVERT] Revert completado.',
    );
  } catch (err) {
    console.error('[REVERT] Fatal error:', err);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
  process.exit(exitCode);
}

// Guarda de entrada: permite importar `parseArgs`/`USAGE` desde los tests sin
// disparar el CLI (a diferencia de tenant-migrate.ts, que no se importa nunca).
if (require.main === module) {
  void main();
}
