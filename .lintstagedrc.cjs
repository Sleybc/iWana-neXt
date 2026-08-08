/** @type {import('lint-staged').Config} */
/* Ejecuta linters solo sobre archivos staged del proyecto — pre-commit.
 * Scoped a código ejecutable y configuración raíz para excluir .agents/ y .opencode/ */
module.exports = {
  '{apps,packages,e2e}/**/*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
  '{apps,packages,scripts,nginx}/**/*.{json,yaml,yml,md}': ['prettier --write'],
  '*.{js,mjs,cjs,json,yaml,yml}': ['prettier --write'],
};
