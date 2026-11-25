import { createAppConfigurationSchema } from '../app.config';

/**
 * Preflight del despliegue: valida el entorno con el esquema de esta imagen, sin arrancar nada.
 *   docker compose … run --rm --no-deps -T api-prod node dist/cli/check-config.js
 * Nunca imprime valores: los mensajes de Joi pueden llevarlos, así que de cada clave sale solo el
 * tipo de fallo. Los fallos entre variables no tienen clave y su texto es nuestro, sin valores.
 */
export function configProblems(env: Record<string, string | undefined>): string[] {
  const { error } = createAppConfigurationSchema().validate(
    { ...env, NODE_ENV: env['NODE_ENV'] || 'production' },
    { abortEarly: false, allowUnknown: true },
  );
  return (error?.details ?? []).map(({ path, type, message }) =>
    path.length > 0 ? `${path.join('.')}: ${type}` : message,
  );
}

if (require.main === module) {
  const problems = configProblems(process.env);
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  if (problems.length === 0) process.stdout.write('Configuración válida.\n');
  process.exitCode = problems.length > 0 ? 1 : 0;
}
