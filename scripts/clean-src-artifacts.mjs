#!/usr/bin/env node
/**
 * Elimina artefactos de compilación emitidos dentro de `packages/<pkg>/src/`.
 *
 * El build de cada paquete emite a `dist/` (outDir en su tsconfig), pero una
 * invocación de `tsc` con rutas de archivo explícitas **ignora el tsconfig del
 * proyecto** y emite junto al fuente. Eso deja `.js`/`.d.ts` obsoletos dentro
 * de `src/`, y ahí hacen daño en silencio:
 *
 * - Jest resolvía el `.js` en vez del `.ts` cuando `moduleFileExtensions` ponía
 *   `js` primero, de modo que los tests validaban código viejo sin avisar.
 * - Un test que recorra el directorio de migraciones ve `X.d.ts` junto a `X.ts`;
 *   como `.d.ts` también termina en `.ts` y ordena antes, un `find()` ingenuo
 *   elige la declaración, que no lleva el cuerpo de los métodos.
 *
 * `.gitignore` los oculta de `git status`, lo que los vuelve invisibles sin
 * desactivarlos. Este script los borra de verdad.
 *
 * Uso: node scripts/clean-src-artifacts.mjs [paquete...]
 *      (sin argumentos: todos los paquetes de packages/)
 */
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ARTIFACT = /\.(js|js\.map|d\.ts|d\.ts\.map)$/;
const ROOT = process.cwd();
const PACKAGES_DIR = path.join(ROOT, 'packages');

async function collect(dir, found = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      await collect(full, found);
    } else if (ARTIFACT.test(entry.name)) {
      found.push(full);
    }
  }

  return found;
}

const requested = process.argv.slice(2);
const packages =
  requested.length > 0
    ? requested
    : (await readdir(PACKAGES_DIR, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

let total = 0;

for (const pkg of packages) {
  const srcDir = path.join(PACKAGES_DIR, pkg, 'src');
  try {
    await stat(srcDir);
  } catch {
    continue;
  }

  const artifacts = await collect(srcDir);
  for (const file of artifacts) {
    await rm(file, { force: true });
  }

  if (artifacts.length > 0) {
    console.log(`${pkg}/src: ${artifacts.length} artefacto(s) eliminado(s)`);
    total += artifacts.length;
  }
}

console.log(
  total === 0 ? 'src limpio: sin artefactos de compilación.' : `Total: ${total} eliminado(s).`,
);
