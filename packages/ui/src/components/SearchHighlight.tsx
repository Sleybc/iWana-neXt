import { Fragment } from 'react';

/**
 * Resaltado de coincidencias sin sink de HTML crudo.
 *
 * El motor de busqueda devuelve fragmentos donde la coincidencia viene envuelta
 * en `<mark>`, pero el resto del fragmento es texto libre editable por el tenant
 * y llega sin escapar. Interpretar ese fragmento como HTML permitia ejecutar
 * script en el origen de la consola de plataforma
 * (SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0, hallazgo C-7).
 *
 * Aqui el fragmento se trata como *dato*: se parte en segmentos y React los
 * emite como nodos de texto. Todo lo que no sea el delimitador de resaltado se
 * muestra literal, incluidas etiquetas o comillas. No hay HTML que interpretar,
 * de modo que la clase de defecto desaparece en lugar de quedar contenida.
 *
 * Contrato congelado: docs/specs/2026-08-09-search-highlight-ds-contrato.md v1.0.
 * El `<mark>` usa el par tonal lima (spec §4.1), identico al Badge lime. Sin
 * directiva 'use client': no usa hooks ni eventos (spec §2), renderizable desde
 * Server Components y client components.
 */

const HIGHLIGHT_TAG_PATTERN = /<mark>([\s\S]*?)<\/mark>/gi;

export interface SearchHighlightSegment {
  text: string;
  isMatch: boolean;
}

export interface SearchHighlightProps {
  snippet: string;
}

export function parseSearchHighlight(snippet: string): SearchHighlightSegment[] {
  const segments: SearchHighlightSegment[] = [];
  let cursor = 0;

  for (const match of snippet.matchAll(HIGHLIGHT_TAG_PATTERN)) {
    const start = match.index ?? 0;

    if (start > cursor) {
      segments.push({ text: snippet.slice(cursor, start), isMatch: false });
    }

    if (match[1]) {
      segments.push({ text: match[1], isMatch: true });
    }

    cursor = start + match[0].length;
  }

  if (cursor < snippet.length) {
    segments.push({ text: snippet.slice(cursor), isMatch: false });
  }

  return segments;
}

export function SearchHighlight({ snippet }: SearchHighlightProps) {
  const segments = parseSearchHighlight(snippet);

  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          <mark
            key={`match-${index}`}
            className="bg-iwana-secondary-100 text-iwana-secondary-900 dark:bg-iwana-secondary-700/20 dark:text-iwana-secondary-400"
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={`text-${index}`}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * Chip que envuelve el fragmento resaltado. Receta canonica de la spec §6,
 * consolidada aqui porque era byte-identica en ambas apps.
 */
export function SearchSnippetPill({ snippet }: SearchHighlightProps) {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300">
      <SearchHighlight snippet={snippet} />
    </span>
  );
}
