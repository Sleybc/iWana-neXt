import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { PUBLIC_ROUTES_WITH_TENANT, PUBLIC_ROUTES_WITHOUT_TENANT } from '../public-routes';

/**
 * Guarda anti-deriva de las rutas públicas.
 *
 * El defecto que motiva este test no fue una desincronización: la lista del
 * middleware **nunca** estuvo sincronizada con los `@Public()` reales. Seis
 * rutas públicas devolvían 401 anónimo, entre ellas `/auth/platform/login`,
 * `/platform-users/bootstrap` y `/platform/branding/public`, de modo que una
 * instalación sin tenants no podía crear su primer administrador de plataforma.
 *
 * Por eso el arreglo no es la lista corregida sino este test: toda ruta con
 * `@Public()` debe estar clasificada en exactamente una de las dos listas de
 * `public-routes.ts`. Una ruta pública nueva rompe el build hasta que alguien
 * decida si necesita contexto de tenant.
 */

const MODULES_DIR = resolve(__dirname, '..', '..');

/** Prefijos de ruta excluidos del middleware en `app.module.ts`. */
const MIDDLEWARE_EXCLUDED = ['/health', '/tenants'];

interface PublicRoute {
  file: string;
  path: string;
}

function listControllerFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);

    if (statSync(full).isDirectory()) {
      listControllerFiles(full, found);
    } else if (entry.endsWith('.controller.ts')) {
      found.push(full);
    }
  }

  return found;
}

function normalize(segment: string): string {
  const trimmed = segment.replace(/^\/+|\/+$/gu, '');

  return trimmed ? `/${trimmed.toLowerCase()}` : '';
}

/**
 * Extrae las rutas marcadas con `@Public()` recorriendo los controladores.
 *
 * Se hace por análisis de fuente y no por reflexión sobre el contenedor Nest:
 * levantar la aplicación completa aquí exigiría base de datos y Redis, y este
 * test debe correr en CI sin infraestructura.
 */
function collectPublicRoutes(): PublicRoute[] {
  const routes: PublicRoute[] = [];
  const httpDecorator = /^@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/u;

  for (const file of listControllerFiles(MODULES_DIR)) {
    const source = readFileSync(file, 'utf8');
    const controllerPrefix = normalize(/@Controller\(\s*'([^']*)'/u.exec(source)?.[1] ?? '');
    const relativeFile = file.slice(MODULES_DIR.length + 1).replace(/\\/gu, '/');

    // Se acumulan los decoradores contiguos de cada handler y se evalúa el
    // bloque completo. El orden entre `@Public()` y `@Get`/`@Post` varía en el
    // repo —ambos aparecen— así que buscar uno "seguido del otro" pierde la
    // mitad de los casos.
    let block: string[] = [];

    for (const rawLine of source.split(/\r?\n/u)) {
      const line = rawLine.trim();

      if (line.startsWith('@')) {
        block.push(line);
        continue;
      }

      if (line === '' || line.startsWith('*') || line.startsWith('/')) {
        // Comentarios y líneas en blanco no cortan el bloque de decoradores.
        continue;
      }

      if (block.some((entry) => entry.startsWith('@Public()'))) {
        const http = block.map((entry) => httpDecorator.exec(entry)).find(Boolean);

        if (http) {
          routes.push({
            file: relativeFile,
            path: `${controllerPrefix}${normalize(http[2] ?? '')}` || '/',
          });
        }
      }

      block = [];
    }
  }

  return routes;
}

describe('Rutas públicas — clasificación frente al contexto de tenant', () => {
  const publicRoutes = collectPublicRoutes();

  const relevant = publicRoutes.filter(
    (route) => !MIDDLEWARE_EXCLUDED.some((prefix) => route.path.startsWith(prefix)),
  );

  it('el barrido encuentra rutas públicas (si no, el patrón dejó de funcionar)', () => {
    expect(publicRoutes.length).toBeGreaterThan(5);
  });

  it('toda ruta @Public() está clasificada en exactamente una lista', () => {
    const clasificadas = new Set([...PUBLIC_ROUTES_WITHOUT_TENANT, ...PUBLIC_ROUTES_WITH_TENANT]);

    const sinClasificar = relevant
      .filter((route) => !clasificadas.has(route.path))
      .map((route) => `${route.path}  (${route.file})`);

    expect(sinClasificar).toEqual([]);
  });

  it('ninguna ruta está en las dos listas a la vez', () => {
    const duplicadas = PUBLIC_ROUTES_WITHOUT_TENANT.filter((path) =>
      PUBLIC_ROUTES_WITH_TENANT.includes(path),
    );

    expect(duplicadas).toEqual([]);
  });

  it('las listas no contienen rutas que ya no existen como @Public()', () => {
    const reales = new Set(publicRoutes.map((route) => route.path));

    const huerfanas = [...PUBLIC_ROUTES_WITHOUT_TENANT, ...PUBLIC_ROUTES_WITH_TENANT].filter(
      (path) => !reales.has(path),
    );

    expect(huerfanas).toEqual([]);
  });

  it('las rutas de plataforma que desbloquean el arranque en frío están sin tenant', () => {
    // Regresión directa del defecto: sin estas tres, una instalación con cero
    // tenants no puede crear su primer administrador ni pintar el login.
    expect(PUBLIC_ROUTES_WITHOUT_TENANT).toEqual(
      expect.arrayContaining([
        '/auth/platform/login',
        '/platform-users/bootstrap',
        '/platform/branding/public',
      ]),
    );
  });
});
