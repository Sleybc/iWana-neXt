import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const CURSOR_SANDBOX_MARKER = 'cursor-sandbox-cache';

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

/** Ruta canónica de browsers Playwright fuera del sandbox de Cursor. */
export function defaultPlaywrightBrowsersPath(): string {
  if (process.platform === 'win32') {
    return resolve(
      process.env.LOCALAPPDATA || resolve(homedir(), 'AppData', 'Local'),
      'ms-playwright',
    );
  }

  return resolve(homedir(), '.cache', 'ms-playwright');
}

/**
 * Cursor inyecta PLAYWRIGHT_BROWSERS_PATH hacia Temp\cursor-sandbox-cache.
 * Ese path se borra entre sesiones y hace que `playwright install` parezca
 * exitoso sin dejar browsers permanentes. En local (no CI) se reescribe a la
 * caché canónica del usuario.
 */
export function pinPlaywrightBrowsersPath(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.CI === 'true') {
    return env.PLAYWRIGHT_BROWSERS_PATH;
  }

  const current = env.PLAYWRIGHT_BROWSERS_PATH;
  if (current && !current.includes(CURSOR_SANDBOX_MARKER)) {
    return current;
  }

  const canonical = defaultPlaywrightBrowsersPath();
  env.PLAYWRIGHT_BROWSERS_PATH = canonical;
  return canonical;
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

  // Las configs de Playwright se cargan como ESM, donde `__dirname` no existe;
  // y como CJS en otros contextos, donde `import.meta` no está disponible. Se
  // busca la raíz subiendo desde el cwd hasta encontrar el marcador del
  // workspace, lo que funciona en ambos y no depende de desde dónde se invoque.
  const workspaceRoot = findWorkspaceRoot();

  if (loadEnvFile && workspaceRoot) {
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

  pinPlaywrightBrowsersPath();
}
