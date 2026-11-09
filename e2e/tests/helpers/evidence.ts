import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCIA = process.env.E2E_EVIDENCIA === '1';
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function evidenceDir(docsRelativeDir: string): string {
  const dir = path.join(
    workspaceRoot,
    EVIDENCIA ? 'docs/' : 'test-results/evidencia',
    docsRelativeDir,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function evidencePath(docsRelativeDir: string, file: string): string {
  return path.join(evidenceDir(docsRelativeDir), file);
}
