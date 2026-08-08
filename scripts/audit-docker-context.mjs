#!/usr/bin/env node
/**
 * Gate del contexto Docker: verifica exclusivamente reglas de `.dockerignore`.
 * No inspecciona archivos potencialmente sensibles ni requiere un daemon Docker.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import process from 'node:process';

/**
 * Rutas y patrones cuya presencia en el contexto de build está prohibida.
 * Se mantienen explícitos para que el control sea revisable sin simular Docker.
 */
export const REQUIRED_DOCKERIGNORE_RULES = Object.freeze([
  { id: 'backups', pattern: '.backups', description: 'backups locales' },
  { id: 'api-storage', pattern: 'apps/api/storage', description: 'storage local de la API' },
  { id: 'login-payload', pattern: 'login-request.json', description: 'payload local de login' },
  { id: 'env-root', pattern: '.env', description: 'archivo de entorno raíz' },
  { id: 'env-variants', pattern: '.env.*', description: 'variantes reales de entorno' },
  { id: 'har', pattern: '**/*.har', description: 'archivos HAR' },
  { id: 'trace', pattern: '**/*.trace', description: 'trazas locales' },
  { id: 'node-modules', pattern: '**/node_modules', description: 'dependencias locales' },
  { id: 'turbo-cache', pattern: '.turbo', description: 'caché de Turborepo' },
  { id: 'pnpm-store', pattern: '.pnpm-store', description: 'store local de pnpm' },
  { id: 'eslint-cache', pattern: '.eslintcache', description: 'caché de ESLint' },
  { id: 'next-cache', pattern: '**/.next', description: 'caché de Next.js' },
  { id: 'dist-cache', pattern: '**/dist', description: 'artefactos de build locales' },
  { id: 'coverage-cache', pattern: '**/coverage', description: 'cobertura local' },
]);

const SAFE_NEGATIONS = new Set(['.env.example']);

function normalizePattern(pattern) {
  return pattern.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
}

function parseDockerignore(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const negated = line.startsWith('!');
      return { negated, pattern: normalizePattern(negated ? line.slice(1) : line) };
    });
}

/**
 * Audita el archivo de reglas, sin recorrer ni leer el contenido del contexto.
 * @param {string} rootDirectory directorio raíz que contiene `.dockerignore`
 * @returns {{ findings: Array<{ rule: string, message: string }> }}
 */
export function auditDockerContext(rootDirectory = process.cwd()) {
  const dockerignorePath = join(resolve(rootDirectory), '.dockerignore');

  if (!existsSync(dockerignorePath)) {
    return {
      findings: [
        {
          rule: 'dockerignore-missing',
          message: 'Falta .dockerignore; el contexto Docker no tiene exclusiones verificables.',
        },
      ],
    };
  }

  const rules = parseDockerignore(readFileSync(dockerignorePath, 'utf8'));
  const ignoredPatterns = new Set(
    rules.filter((rule) => !rule.negated).map((rule) => rule.pattern),
  );
  const findings = REQUIRED_DOCKERIGNORE_RULES.filter(
    (rule) => !ignoredPatterns.has(rule.pattern),
  ).map((rule) => ({
    rule: `missing-${rule.id}`,
    message: `Falta la exclusión '${rule.pattern}' para ${rule.description}.`,
  }));

  for (const rule of rules) {
    if (rule.negated && !SAFE_NEGATIONS.has(rule.pattern)) {
      findings.push({
        rule: 'unsafe-negation',
        message: `La excepción '!${rule.pattern}' no está permitida; sólo se admite '!.env.example'.`,
      });
    }
  }

  return { findings };
}

function printResult(findings) {
  if (findings.length === 0) {
    console.log('Contexto Docker auditado: exclusiones sensibles y cachés locales protegidas.');
    return;
  }

  console.error('Auditoría de contexto Docker bloqueada:');
  for (const finding of findings) console.error(`- [${finding.rule}] ${finding.message}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const { findings } = auditDockerContext();
  printResult(findings);
  process.exitCode = findings.length === 0 ? 0 : 1;
}
