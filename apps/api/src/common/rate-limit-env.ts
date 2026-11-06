/**
 * Relajación de los límites de ruta solo para E2E (`RATE_LIMIT_E2E_RELAXED`).
 *
 * Playwright corre desde una sola IP: sin esta válvula, el límite de
 * `login` (30/min por IP, G0) puede devolver 429 en la preparación de
 * `execution-orders-operational.spec.ts` y en las 26 suites que inician
 * sesión, dejando rojo el E2E de CI (spec de límites de peticiones §5).
 *
 * - Solo multiplica los límites **de ruta** (`@Throttle`): el límite
 *   global (100/min) y `getGlobalRateLimitTracker` no cambian.
 * - Solo se activa con `RATE_LIMIT_E2E_RELAXED=true` en el entorno E2E.
 * - Con `NODE_ENV=production` el arranque se rechaza: una válvula de
 *   teste que afloja el frenado de fuerza bruta nunca va a producción.
 *   El esquema Joi de `app.config.ts` lo rechaza en el bootstrap y este
 *   helper lo rechaza al evaluar los decoradores, como segunda capa.
 */

export const RATE_LIMIT_E2E_ENV_VAR = 'RATE_LIMIT_E2E_RELAXED';

/** Factor x100: deja margen a toda la suite E2E sin desactivar el throttle. */
export const RATE_LIMIT_E2E_MULTIPLIER = 100;

export function isRateLimitE2ERelaxed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RATE_LIMIT_E2E_ENV_VAR] === 'true';
}

export function assertRateLimitE2EAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] === 'production' && isRateLimitE2ERelaxed(env)) {
    throw new Error(
      'RATE_LIMIT_E2E_RELAXED no puede definirse con NODE_ENV=production: ' +
        'la relajación de límites solo existe en el entorno E2E.',
    );
  }
}

export function resolveRouteRateLimit(limit: number, env: NodeJS.ProcessEnv = process.env): number {
  assertRateLimitE2EAllowed(env);
  return isRateLimitE2ERelaxed(env) ? limit * RATE_LIMIT_E2E_MULTIPLIER : limit;
}
