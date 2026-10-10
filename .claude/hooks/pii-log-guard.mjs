/**
 * PostToolUse (Edit|Write|MultiEdit): gate «No PII in logs» de AGENTS.md.
 * Señala llamadas a logger/console de apps/api y apps/worker que interpolan campos
 * personales. Loguear el id del registro sí está permitido. Analiza línea por línea:
 * una llamada partida en varias líneas se le escapa; el gate completo sigue en
 * gate-verifier.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { block, readHookInput, toolFilePath } from './lib/hook-input.mjs';

const SCOPE = /(^|\/)apps\/(api|worker)\/src\/.+(?<!\.spec)\.ts$/;
const CALL = /\b(this\.logger|logger|console)\.(log|info|warn|error|debug|verbose)\(/;
const PII =
  /(email|phone|telefono|documentNumber|document_number|password|address|direccion|fullName|firstName|lastName)/i;

const file = toolFilePath(await readHookInput());
if (!SCOPE.test(file)) process.exit(0);

const hits = readFileSync(file, 'utf8')
  .split('\n')
  .flatMap((line, index) => {
    if (!CALL.test(line)) return [];
    const expressions = [...line.matchAll(/\$\{([^}]+)\}/g)].map((match) => match[1]);
    return expressions.some((expression) => PII.test(expression))
      ? [`${index + 1}: ${line.trim()}`]
      : [];
  });

if (hits.length > 0) {
  block(`Posible PII en logs (${file}); loguea el id, no el dato personal:\n${hits.join('\n')}`);
}
