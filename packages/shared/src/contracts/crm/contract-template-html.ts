/**
 * Validación por lista blanca del HTML de la plantilla del contrato (CONTRATO_SERVICIO;
 * ADR-109 D4/D5, hallazgos SEC-2/SEC-4). La plantilla se renderiza en Chromium (worker) con
 * JavaScript apagado y red bloqueada; esta validación es la primera barrera y la usan la
 * publicación (API) y el render (worker). Cerrada por defecto: lo que no está en la lista se
 * rechaza; no se intenta «limpiar» el contenido.
 *
 * Admite: etiquetas de texto y tabla, `<style>` en línea, `<img>` solo con `data:image/png|jpeg`,
 * `<a>` solo con `href="#…"`, comentarios (secciones `<!--IF:…-->`) y `<!DOCTYPE html>`.
 * Rechaza: script, link, meta, iframe, object, embed, svg, math, form, base, cualquier
 * atributo `on*`, `srcdoc`, `xlink:*`, URL remotas o `javascript:`, `@import` y `url()` no
 * `data:` en CSS, escapes CSS y entidades dentro de atributos sensibles.
 */

export const CONTRACT_TEMPLATE_ALLOWED_TAGS: readonly string[] = [
  'html',
  'head',
  'body',
  'title',
  'style',
  'div',
  'span',
  'p',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'small',
  'sup',
  'sub',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'header',
  'footer',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  'ul',
  'ol',
  'li',
  'img',
  'a',
];

const GLOBAL_ATTRIBUTES = new Set(['class', 'style', 'lang', 'title', 'id', 'align', 'dir']);
const TAG_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  td: new Set(['colspan', 'rowspan', 'width', 'valign']),
  th: new Set(['colspan', 'rowspan', 'width', 'valign', 'scope']),
  col: new Set(['span', 'width']),
  colgroup: new Set(['span']),
  table: new Set(['width']),
  div: new Set(['data-signature-slot']),
  img: new Set(['src', 'alt', 'width', 'height']),
  a: new Set(['href']),
};

const ALLOWED_TAGS = new Set(CONTRACT_TEMPLATE_ALLOWED_TAGS);
const TAG_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s>]+)*)\s*\/?>/gu;
const ATTRIBUTE_PATTERN = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
const DATA_IMAGE = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/u;
const UNSAFE_CSS = /@import|@namespace|expression\s*\(|javascript:|behavior\s*:|-moz-binding|\\/iu;
const CSS_URL = /url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/giu;

export type ContractTemplateHtmlCheck = { ok: true } | { ok: false; reason: string };

function cssIsSafe(css: string): boolean {
  if (UNSAFE_CSS.test(css)) return false;
  for (const match of css.matchAll(CSS_URL)) {
    if (!DATA_IMAGE.test((match[2] ?? '').trim())) return false;
  }
  // Un `url(` que el patrón no reconoce (sin cierre, con comillas mezcladas) se rechaza.
  const urls = css.match(/url\s*\(/giu)?.length ?? 0;
  return urls === [...css.matchAll(CSS_URL)].length;
}

function checkAttributes(tag: string, raw: string): string | null {
  const allowed = TAG_ATTRIBUTES[tag];
  for (const match of raw.matchAll(ATTRIBUTE_PATTERN)) {
    const name = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!GLOBAL_ATTRIBUTES.has(name) && !allowed?.has(name))
      return `atributo «${name}» en <${tag}>`;
    if (name === 'style' && (value.includes('&') || !cssIsSafe(value))) return `estilo en <${tag}>`;
    if (name === 'href' && !/^#[A-Za-z0-9_-]*$/u.test(value)) return 'enlace no interno';
    if (name === 'src' && !DATA_IMAGE.test(value)) return 'imagen no embebida';
    if (name === 'data-signature-slot' && !/^[a-z]+$/u.test(value)) return 'hueco de firma';
  }
  return null;
}

export function checkContractTemplateHtml(html: string): ContractTemplateHtmlCheck {
  const fail = (reason: string): ContractTemplateHtmlCheck => ({ ok: false, reason });
  const withoutComments = html
    .replace(/^﻿?\s*<!DOCTYPE\s+html\s*>/iu, '')
    .replace(/<!--[\s\S]*?-->/gu, '');
  if (/<!|<\?/u.test(withoutComments)) return fail('declaración o comentario sin cerrar');
  // `<` seguido de espacios y una letra o `/` (p. ej. `< meta`) no se acepta como texto.
  if (/<\s+[/a-zA-Z]|<\/\s/u.test(withoutComments)) return fail('etiqueta con espacios');

  let consumed = '';
  let lastIndex = 0;
  for (const match of withoutComments.matchAll(TAG_PATTERN)) {
    consumed += withoutComments.slice(lastIndex, match.index);
    lastIndex = (match.index ?? 0) + match[0].length;
    const tag = (match[2] ?? '').toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return fail(`etiqueta <${tag}>`);
    if (match[1] === '/') continue;
    const problem = checkAttributes(tag, match[3] ?? '');
    if (problem) return fail(problem);
  }
  consumed += withoutComments.slice(lastIndex);
  // Cualquier `<` restante es una etiqueta que el patrón no reconoció.
  if (/<[/a-zA-Z]/u.test(consumed)) return fail('etiqueta mal formada');

  for (const block of withoutComments.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/giu)) {
    if (!cssIsSafe(block[1] ?? '')) return fail('hoja de estilo');
  }
  return { ok: true };
}
