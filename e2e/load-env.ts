import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

/** Sube desde el cwd hasta la raíz del monorepo (marcada por pnpm-workspace.yaml). */
function findWorkspaceRoot(): string | null {
  let current = process.cwd();

  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

/**
 * Carga el entorno del workspace en el proceso de Playwright.
 *
 * Ninguna de las configs de e2e cargaba fichero de entorno, así que las specs
 * que dependen de variables —por ejemplo `web-tenant-create-happy-path.spec.ts`,
 * con `test.skip(!E2E_PLATFORM_EMAIL || !E2E_PLATFORM_PASSWORD, …)`— se saltaban
 * **siempre**, en cualquier configuración documentada. Aparecían en verde sin
 * ejercitar nada: cobertura fantasma.
 *
 * Precedencia, la misma que fija `packages/database/src/data-source.ts`:
 * variables del shell > `.env.development.local` > `.env.development` > `.env`.
 * `process.loadEnvFile` no sobrescribe claves ya presentes, así que el orden de
 * la lista basta para garantizarla.
 */
export function loadWorkspaceEnv(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void })
    .loadEnvFile;

  if (!loadEnvFile) {
    return;
  }

  // Las configs de Playwright se cargan como ESM, donde `__dirname` no existe;
  // y como CJS en otros contextos, donde `import.meta` no está disponible. Se
  // busca la raíz subiendo desde el cwd hasta encontrar el marcador del
  // workspace, lo que funciona en ambos y no depende de desde dónde se invoque.
  const workspaceRoot = findWorkspaceRoot();

  if (!workspaceRoot) {
    return;
  }

  for (const candidate of ['.env.development.local', '.env.development', '.env']) {
    const filePath = resolve(workspaceRoot, candidate);

    if (!existsSync(filePath)) {
      continue;
    }

    try {
      loadEnvFile(filePath);
    } catch {
      // Un fichero ilegible no debe impedir arrancar la suite: las specs que
      // necesiten una variable ausente se saltarán con su propio mensaje.
    }
  }
}
