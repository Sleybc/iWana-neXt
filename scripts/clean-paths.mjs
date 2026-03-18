import { rm } from 'node:fs/promises';
import path from 'node:path';

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error('Uso: node scripts/clean-paths.mjs <ruta> [ruta...]');
  process.exit(1);
}

for (const target of targets) {
  const absolutePath = path.resolve(process.cwd(), target);
  await rm(absolutePath, { force: true, recursive: true });
  console.log(`Removed ${target}`);
}
