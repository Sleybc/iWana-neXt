/**
 * Escritura de superficies generadas para los sincronizadores de IA
 * (sync-skills.mjs, sync-mcp.mjs). En modo --check no escribe: acumula las rutas
 * desactualizadas para fallar con un mensaje accionable, igual que sync-agents.mjs.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import process from 'node:process';

export function createSurfaceWriter({ root, check }) {
  const drift = [];

  return {
    drift,
    emit(target, content) {
      const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
      if (current === content) return;
      if (check) {
        drift.push(relative(root, target));
        return;
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
    },
    remove(target) {
      if (!existsSync(target)) return;
      if (check) {
        drift.push(`${relative(root, target)} (huérfano)`);
        return;
      }
      rmSync(target, { recursive: true, force: true });
    },
  };
}

export function finish({ label, check, drift, fixCommand, summary }) {
  if (check) {
    if (drift.length > 0) {
      console.error(`${label}: superficies generadas desactualizadas:`);
      for (const path of drift) console.error(`  - ${path}`);
      console.error(`Ejecuta: ${fixCommand}`);
      process.exit(1);
    }
    console.log(`OK: ${summary}`);
    return;
  }
  console.log(`Generados: ${summary}`);
}
