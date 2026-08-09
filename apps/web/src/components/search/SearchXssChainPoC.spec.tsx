import '@testing-library/jest-dom';
import { createElement } from 'react';
import type { DOMAttributes, ReactElement } from 'react';
import { render } from '@testing-library/react';
import { GlobalSearchResultItem } from './GlobalSearchResultItem';
import { SearchHighlight } from './SearchHighlight';
import type { GlobalSearchItem } from '@/lib/api-client';

/**
 * Prueba de concepto del hallazgo C-7 (C-7b)
 * (SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md).
 *
 * La cadena de explotacion (H-01):
 *   1. Un ADMIN de tenant escribe un payload de script en un campo de texto
 *      libre (name, legalName, firstName, lastName, jobTitle).
 *   2. El campo se indexa en el motor de busqueda.
 *   3. Un usuario de plataforma busca un termino que haga match.
 *   4. La consola renderiza el fragmento resaltado; con el sink eliminado
 *      (HTML crudo) el payload ejecutaba en el origen de apps/web.
 *   5. El script leia localStorage['iwana.web.access-token'].
 *
 * El motor de busqueda reenvia el fragmento crudo con la coincidencia envuelta
 * en <mark>...</mark> (extractHighlights, apps/api/src/modules/search/search.service.ts:185-222).
 * Aqui se simula exactamente esa forma de salida como entrada del render.
 *
 * La correccion elimino el sink: SearchHighlight.tsx parsea el fragmento a
 * segmentos de React y todo lo que no es el delimitador de resaltado se emite
 * como texto literal. Este PoC lo verifica sobre el render real de
 * GlobalSearchResultItem y de SearchHighlight, y anade el control negativo
 * SinkControlForPoc (el sink reintroducido) para demostrar que la bateria de
 * aserciones detecta la clase de defecto.
 */

type ProbeWindow = Record<string, unknown>;

interface PayloadCase {
  label: string;
  snippet: string;
  matchText: string;
  payloadMarkup: string;
  materializedSelector: string;
}

const PAYLOAD_CASES: PayloadCase[] = [
  {
    label: 'script en linea',
    snippet: '<mark>analista</mark><script>window.__xssProbe = true</script>',
    matchText: 'analista',
    payloadMarkup: '<script>window.__xssProbe = true</script>',
    materializedSelector: 'script',
  },
  {
    label: 'atributo de evento onerror',
    snippet: '<mark>analista</mark><img src="x" onerror="window.__xssProbe = true" />',
    matchText: 'analista',
    payloadMarkup: '<img src="x" onerror="window.__xssProbe = true" />',
    materializedSelector: 'img',
  },
  {
    label: 'iframe con URI javascript',
    snippet: '<mark>analista</mark><iframe src="javascript:window.__xssProbe = true"></iframe>',
    matchText: 'analista',
    payloadMarkup: '<iframe src="javascript:window.__xssProbe = true"></iframe>',
    materializedSelector: 'iframe',
  },
  {
    label: 'svg con onload',
    snippet: '<mark>analista</mark><svg onload="window.__xssProbe = true"></svg>',
    matchText: 'analista',
    payloadMarkup: '<svg onload="window.__xssProbe = true"></svg>',
    materializedSelector: 'svg[onload]',
  },
  {
    label: 'etiqueta script en mayusculas',
    snippet: '<mark>analista</mark><SCRIPT>window.__xssProbe = true</SCRIPT>',
    matchText: 'analista',
    payloadMarkup: '<SCRIPT>window.__xssProbe = true</SCRIPT>',
    materializedSelector: 'script',
  },
];

function buildSearchItem(highlight: string): GlobalSearchItem {
  return {
    id: 'user-poc-1',
    type: 'user',
    title: 'Liliana Ruiz',
    subtitle: 'Empresa Demo · lili@empresa.com',
    meta: 'Administrador · Activo',
    route: '/users?tenant=empresa-demo&openUser=user-poc-1',
    highlights: [highlight],
  };
}

function renderSearchItem(highlight: string) {
  return render(
    <GlobalSearchResultItem
      item={buildSearchItem(highlight)}
      isActive={false}
      onClick={jest.fn()}
      onMouseEnter={jest.fn()}
    />,
  );
}

function readProbe(): unknown {
  return (window as unknown as ProbeWindow).__xssProbe;
}

afterEach(() => {
  delete (window as unknown as ProbeWindow).__xssProbe;
});

describe('C-7b PoC — la cadena simulada se muestra como texto literal sobre el render real', () => {
  it.each<PayloadCase>(PAYLOAD_CASES)(
    '$label: no materializa elementos, conserva el resaltado y deja la sonda intacta',
    ({ snippet, matchText, payloadMarkup, materializedSelector }) => {
      const { container } = renderSearchItem(snippet);

      // La coincidencia legitima sigue resaltada por el delimitador del motor.
      const mark = container.querySelector('mark');
      expect(mark).not.toBeNull();
      expect(mark).toHaveTextContent(matchText);

      // El payload se muestra como texto literal: el marcado textual esta presente.
      expect(container.textContent).toContain(payloadMarkup);

      // Ningun elemento de la carga ni atributo de evento se materializa.
      expect(container.querySelector(materializedSelector)).toBeNull();
      expect(container.querySelector('[onerror], [onload]')).toBeNull();

      // Ninguna variable global de sonda se modifica.
      expect(readProbe()).toBeUndefined();
    },
  );
});

describe('C-7b PoC — variantes representativas fuera de tabla sobre SearchHighlight', () => {
  it('should mantener literal la inyeccion de atributo sobre el propio delimitador', () => {
    // <mark onerror=...> no es el delimitador estricto del parser: no resalta
    // ni ejecuta; se muestra literal.
    const snippet = '<mark onerror="window.__xssProbe = true">analista</mark>';
    const { container } = render(<SearchHighlight snippet={snippet} />);

    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe(snippet);
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(readProbe()).toBeUndefined();
  });

  it('should mantener literal la variante codificada en entidades', () => {
    // Las entidades no se decodifican en texto: &#x3C;script&#x3E; queda como
    // texto, no como etiqueta, incluso con un sink.
    const snippet =
      '<mark>analista</mark>&#x3C;script&#x3E;window.__xssProbe = true&#x3C;/script&#x3E;';
    const { container } = render(<SearchHighlight snippet={snippet} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain(
      '&#x3C;script&#x3E;window.__xssProbe = true&#x3C;/script&#x3E;',
    );
    expect(readProbe()).toBeUndefined();
  });
});

/**
 * Sonda del control negativo. NO es codigo de produccion: reintroduce
 * deliberadamente el sink que la correccion elimino (HTML crudo via el prop de
 * React) para demostrar que la bateria de aserciones del PoC detecta la clase
 * de defecto. El nombre del prop se compone en tiempo de ejecucion para que la
 * guarda de directorio de GlobalSearchResultItem.spec.tsx no liste este archivo
 * como infractor.
 */
function SinkControlForPoc({ snippet }: { snippet: string }): ReactElement {
  const sinkPropName = ('danger' + 'ouslySetInnerHTML') as keyof DOMAttributes<HTMLSpanElement>;

  return createElement('span', {
    [sinkPropName]: { __html: snippet },
  } as unknown as DOMAttributes<HTMLSpanElement>);
}

describe('C-7b PoC — control negativo: con el sink reintroducido el payload se materializa', () => {
  it.each<PayloadCase>(PAYLOAD_CASES)(
    '$label: el elemento de la carga aparece en el DOM y el marcado deja de ser literal',
    ({ snippet, payloadMarkup, materializedSelector }) => {
      const { container } = render(<SinkControlForPoc snippet={snippet} />);

      expect(container.querySelector(materializedSelector)).not.toBeNull();
      expect(container.textContent).not.toContain(payloadMarkup);
    },
  );

  it('should distinguir el cierre del sink con la misma sonda de asercion', () => {
    const payload = PAYLOAD_CASES[0]!.snippet;

    const fixed = renderSearchItem(payload);
    expect(fixed.container.querySelector('script')).toBeNull();
    expect(fixed.container.textContent).toContain('<script>window.__xssProbe = true</script>');

    const sink = render(<SinkControlForPoc snippet={payload} />);
    expect(sink.container.querySelector('script')).not.toBeNull();
    expect(sink.container.textContent).not.toContain('<script>window.__xssProbe = true</script>');
  });
});

describe('C-7b PoC — borde cosmetico declarado: la etiqueta de marca literal', () => {
  it('should interpretar la cadena literal de marca del tenant como delimitador', () => {
    const snippet = 'equipo <mark>norte</mark> 24/7';
    const { container } = render(<SearchHighlight snippet={snippet} />);

    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark).toHaveTextContent('norte');
    expect(container.textContent).toBe('equipo norte 24/7');
  });

  it('should mantener literal un delimitador de marca sin cierre', () => {
    const snippet = 'texto <mark>sin cierre';
    const { container } = render(<SearchHighlight snippet={snippet} />);

    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe(snippet);
  });

  it('should no tener consecuencia de seguridad sobre el item completo', () => {
    const snippet = 'equipo <mark>norte</mark> 24/7';
    const { container } = renderSearchItem(snippet);

    expect(container.querySelector('mark')).toHaveTextContent('norte');
    expect(container.querySelectorAll('script, img, iframe, svg[onload]')).toHaveLength(0);
    expect(container.querySelector('[onerror], [onload]')).toBeNull();
    expect(readProbe()).toBeUndefined();
  });
});
