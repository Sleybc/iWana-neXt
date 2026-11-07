/**
 * PostToolUse (Bash|PowerShell): tras un `git push`, recuerda a Claude que G6.5 solo se
 * declara con la corrida real de CI de ese push. El CI de main quedó rojo sin que nadie
 * mirara el 12-10, el 16-10 y el 17-10. Solo informa; nunca bloquea.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { PROJECT_DIR, readHookInput } from './lib/hook-input.mjs';

// El cuerpo de un heredoc es texto (un mensaje de commit), no comandos.
const HEREDOC_BODY = /<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g;
const PUSH = /(^|[;&|\n(]|\bthen)\s*git\s+(-C\s+\S+\s+)?push\b/;

const command = String((await readHookInput()).tool_input?.command ?? '').replace(
  HEREDOC_BODY,
  '<<$2$3',
);
if (!PUSH.test(command)) process.exit(0);

let sha = '';
try {
  sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  // Sin repo no hay commit que citar.
}

const target = sha ? `--commit ${sha}` : '--branch main --limit 2';
process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        `post-push-ci: hubo un push. Antes de dar el trabajo por cerrado o declarar G6.5, ` +
        `revisa las corridas de este push con \`gh run list ${target}\` y, si alguna falla, ` +
        '`gh run view <id> --log-failed`. Cita en el informe el run id y su conclusión.',
    },
  }),
);
