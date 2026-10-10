/**
 * PreToolUse (Bash): complemento de guard-paths para comandos de shell, que no pasan
 * por las herramientas de edición. Todo se niega: un permissionDecision "ask" se ignora
 * en modo bypassPermissions (comprobado el 2026-10-09), así que la protección no puede
 * depender del modo. Lo destructivo pero legítimo lo ejecuta el usuario en su terminal.
 * Los patrones son una red, no una frontera de seguridad.
 */

import process from 'node:process';

import { readHookInput } from './lib/hook-input.mjs';

const PROTECTED = String.raw`\S*(\.env(?!\.example)\b|secrets\/|pnpm-lock\.yaml|\.mcp\.json|\.claude\/skills\/|mcp-[a-z]+\.local\.env)`;
const BY_USER = 'si es intencional, que el usuario lo ejecute en su terminal';

const RULES = [
  [
    /\bgit\s+(checkout\s+-b|switch\s+-c|worktree\s+add)\b/,
    'el proyecto trabaja siempre en main, sin ramas ni worktrees',
  ],
  [/\bgit\s+branch\s+(?!-)[\w./-]+/, 'el proyecto trabaja siempre en main, sin ramas'],
  [/--no-verify\b/, 'no se saltan husky ni commitlint'],
  [
    new RegExp(String.raw`(>>?|\btee\b|\bcp\b|\bmv\b)\s+(\S+\s+)?${PROTECTED}`),
    'escritura por shell en una ruta protegida por guard-paths',
  ],
  [
    /\bgit\s+(push\b.*--force|reset\s+--hard|clean\s+-\w*f)/,
    `reescribe o descarta trabajo; ${BY_USER}`,
  ],
  [
    /\bdocker\s+(compose\b.*\bdown\b.*\s-v\b|volume\s+rm)\b/,
    `borra volúmenes de datos de desarrollo; ${BY_USER}`,
  ],
  [/\bmigration(:tenant)?:revert\b|\bdb:restore/, `revierte esquema o restaura datos; ${BY_USER}`],
];

// El cuerpo de un heredoc es texto (un informe, un mensaje de commit), no comandos.
const HEREDOC_BODY = /<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g;

const command = String((await readHookInput()).tool_input?.command ?? '').replace(
  HEREDOC_BODY,
  '<<$2$3',
);
const hit = RULES.find(([pattern]) => pattern.test(command));
if (!hit) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `guard-bash: ${hit[1]}`,
    },
  }),
);
