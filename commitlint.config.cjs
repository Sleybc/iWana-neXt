/** @type {import('@commitlint/types').UserConfig} */
/* Reglas de commit convencional para iWana neXt */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
  },
};
