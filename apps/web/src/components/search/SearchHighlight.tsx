'use client';

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
 */

const HIGHLIGHT_TAG_PATTERN = /<mark>([\s\S]*?)<\/mark>/gi;

export interface SearchHighlightSegment {
  text: string;
  isMatch: boolean;
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

export function SearchHighlight({ snippet }: { snippet: string }) {
  const segments = parseSearchHighlight(snippet);

  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          <mark key={`match-${index}`}>{segment.text}</mark>
        ) : (
          <Fragment key={`text-${index}`}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
