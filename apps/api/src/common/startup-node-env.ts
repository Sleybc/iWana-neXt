/**
 * `NODE_ENV` tal como llegó al proceso. ConfigModule y los `.env` lo rellenan después con
 * `development`, así que este módulo se importa antes que cualquier otro.
 */
const startupNodeEnv = process.env['NODE_ENV'];

/** Solo con `development` o `test` explícitos; sin la variable, cerrado. */
export function isExplicitDevelopment(): boolean {
  return [startupNodeEnv, process.env['NODE_ENV']].every(
    (value) => value === 'development' || value === 'test',
  );
}
