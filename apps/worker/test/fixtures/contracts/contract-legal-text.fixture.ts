import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Texto legal CONTRATO_SERVICIO publicado para las pruebas del worker (SEC-2): el contenido de
 * la plantilla de fixture sin `<meta>` (la lista blanca no lo admite).
 */
export const FIXTURE_TEMPLATE_CONTENT = readFileSync(
  resolve(__dirname, 'contrato-servicio.base.html'),
  'utf8',
).replace(/<meta[^>]*>\s*/giu, '');
export const FIXTURE_TEMPLATE_SHA256 = createHash('sha256')
  .update(FIXTURE_TEMPLATE_CONTENT, 'utf8')
  .digest('hex');
export const FIXTURE_TEMPLATE_ID = '77777777-7777-4777-8777-777777777777';

export function legalTextRow(overrides: Record<string, unknown> = {}) {
  return {
    content: FIXTURE_TEMPLATE_CONTENT,
    sha256: FIXTURE_TEMPLATE_SHA256,
    type: 'CONTRATO_SERVICIO',
    format: 'HTML',
    legal_approval_declaration: 'APROBADO_POR_ASESORIA_JURIDICA',
    ...overrides,
  };
}

/** Columnas de plantilla congelada de una generación. */
export const FROZEN_TEMPLATE_COLUMNS = {
  template_legal_text_id: FIXTURE_TEMPLATE_ID,
  template_version: '1.0',
  template_sha256: FIXTURE_TEMPLATE_SHA256,
};

/** Texto legal publicado con otro contenido (p. ej. la semilla real con huecos de firma). */
export function publishedTemplate(content: string) {
  const clean = content.replace(/<meta[^>]*>\s*/giu, '');
  const sha256 = createHash('sha256').update(clean, 'utf8').digest('hex');
  return {
    row: legalTextRow({ content: clean, sha256 }),
    frozen: { ...FROZEN_TEMPLATE_COLUMNS, template_sha256: sha256 },
  };
}

/** La semilla real del worker como texto legal publicado. */
export const SEED_TEMPLATE = publishedTemplate(
  readFileSync(
    resolve(__dirname, '../../../src/templates/contracts/contrato-servicio.base.html'),
    'utf8',
  ),
);
