import { fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { Inbox } from 'lucide-react';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  PortalSkeletonBlock,
  portalFieldEmptyValueClassName,
  portalFieldListClassName,
  portalFieldListTwoColumnClassName,
  portalFieldRowClassName,
} from './portal-ui';

function classesOf(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean).sort();
}

describe('PortalPanel density (D1, spec MOD05 §8)', () => {
  describe('criterio 1: sin density renderiza igual que hoy', () => {
    it('default conserva cáscara, cabecera y cuerpo', () => {
      const { container } = render(
        <PortalPanel title="Datos" actions={<button type="button">Editar</button>}>
          <p>cuerpo</p>
        </PortalPanel>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(classesOf(root)).toEqual(
        [
          'rounded-2xl',
          'border',
          'border-gray-200',
          'bg-white',
          'shadow-iwana-soft',
          'dark:border-dark-border',
          'dark:bg-dark-surface-2',
          'p-5',
        ].sort(),
      );
      const header = root.firstElementChild as HTMLElement;
      expect(header.className).toContain('gap-3 pb-4');
      expect(screen.getByRole('heading', { name: 'Datos' }).className).toContain(
        'text-base font-semibold',
      );
      expect((root.lastElementChild as HTMLElement).className).toBe('pt-4');
    });

    it('compact sigue usando p-4 / pb-3 / pt-3', () => {
      const { container } = render(
        <PortalPanel title="Datos" compact>
          <p>cuerpo</p>
        </PortalPanel>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.className).toContain('p-4');
      expect(root.className).toContain('shadow-iwana-soft');
      expect((root.firstElementChild as HTMLElement).className).toContain('gap-2 pb-3');
      expect((root.lastElementChild as HTMLElement).className).toBe('pt-3');
    });

    it('density="default" explícito equivale a omitirla', () => {
      const a = render(<PortalPanel title="X">c</PortalPanel>).container.innerHTML;
      const b = render(
        <PortalPanel title="X" density="default">
          c
        </PortalPanel>,
      ).container.innerHTML;
      expect(b.replace(/:r\w+:/g, '')).toBe(a.replace(/:r\w+:/g, ''));
    });
  });

  describe('density="dense"', () => {
    it('aplica las clases de 8.2, sin sombra, y gana sobre compact', () => {
      const { container } = render(
        <PortalPanel
          title="Contacto"
          labelled
          density="dense"
          compact
          eyebrow="Ignorado"
          description="Ignorada"
        >
          <p>cuerpo</p>
        </PortalPanel>,
      );
      const root = container.firstElementChild as HTMLElement;
      expect(root.tagName).toBe('SECTION');
      expect(classesOf(root)).toEqual(
        [
          'rounded-xl',
          'border',
          'border-gray-200',
          'bg-white',
          'p-0',
          'dark:border-dark-border',
          'dark:bg-dark-surface-2',
        ].sort(),
      );
      expect(root.className).not.toContain('shadow-iwana-soft');
      expect(root.className).not.toContain('p-4');
      const heading = screen.getByRole('heading', { name: 'Contacto' });
      expect(heading.className).toContain('text-xs font-semibold uppercase tracking-wider');
      expect(screen.getByRole('region', { name: 'Contacto' })).toBe(root);
      expect(screen.queryByText('Ignorado')).not.toBeInTheDocument();
      expect(screen.queryByText('Ignorada')).not.toBeInTheDocument();
      expect((root.lastElementChild as HTMLElement).className).toBe('px-4 py-3');
    });

    it('contentClassName puede anular el padding del cuerpo', () => {
      const { container } = render(
        <PortalPanel title="Lista" density="dense" contentClassName="px-0 py-0">
          c
        </PortalPanel>,
      );
      const body = (container.firstElementChild as HTMLElement).lastElementChild as HTMLElement;
      expect(body.className).toBe('px-0 py-0');
    });
  });
});

describe('criterio 3: PortalFieldList / PortalFieldRow', () => {
  it('renderiza dt/dd dentro de dl, mono y acción', () => {
    const { container } = render(
      <PortalFieldList>
        <PortalFieldRow label="ID" mono>
          SUB-0001
        </PortalFieldRow>
        <PortalFieldRow
          label="Teléfono"
          action={
            <a href="tel:+57" aria-label="Llamar al teléfono principal">
              L
            </a>
          }
        >
          300 000 0000
        </PortalFieldRow>
      </PortalFieldList>,
    );
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    expect(dl!.className).toContain('divide-y');
    const rows = dl!.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.className).toBe(portalFieldRowClassName);
    expect(rows[0]!.querySelector('dt')).toHaveTextContent('ID');
    expect(rows[0]!.querySelector('dd span')!.className).toContain('font-mono');
    expect(
      within(rows[1] as HTMLElement).getByRole('link', { name: 'Llamar al teléfono principal' }),
    ).toBeInTheDocument();
  });

  it('con empty muestra «Sin dato» atenuado y no el valor', () => {
    render(
      <PortalFieldList>
        <PortalFieldRow label="Correo" empty>
          ignorado
        </PortalFieldRow>
      </PortalFieldList>,
    );
    const empty = screen.getByText('Sin dato');
    expect(empty.closest('dd')).not.toBeNull();
    expect(empty.className).toContain('text-gray-500');
    expect(screen.queryByText('ignorado')).not.toBeInTheDocument();
  });
});

describe('densidad v1.1 (spec MOD05 §8.6)', () => {
  const V10_LIST = 'divide-y divide-gray-100 dark:divide-dark-border';
  const TWO_COLUMNS =
    'grid grid-cols-1 *:border-gray-100 dark:*:border-dark-border [&>*+*]:border-t sm:grid-cols-2 sm:gap-x-6 sm:[&>*:nth-child(2)]:border-t-0';

  function listOf(container: HTMLElement): HTMLElement {
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    return dl as HTMLElement;
  }

  describe('criterio 1: PortalFieldList sin columns o con columns={1} es v1.0', () => {
    it('la constante de v1.0 no cambia', () => {
      expect(portalFieldListClassName).toBe(V10_LIST);
    });

    it('sin columns renderiza exactamente las clases de v1.0', () => {
      const { container } = render(
        <PortalFieldList>
          <PortalFieldRow label="ID">SUB-0001</PortalFieldRow>
        </PortalFieldList>,
      );
      expect(listOf(container).className).toBe(V10_LIST);
    });

    it('columns={1} equivale a omitirla', () => {
      const a = render(
        <PortalFieldList>
          <PortalFieldRow label="ID">SUB-0001</PortalFieldRow>
        </PortalFieldList>,
      ).container.innerHTML;
      const b = render(
        <PortalFieldList columns={1}>
          <PortalFieldRow label="ID">SUB-0001</PortalFieldRow>
        </PortalFieldList>,
      ).container.innerHTML;
      expect(b).toBe(a);
    });
  });

  describe('criterio 2: columns={2}', () => {
    it('exporta la constante con las clases exactas del contrato', () => {
      expect(portalFieldListTwoColumnClassName).toBe(TWO_COLUMNS);
    });

    it('aplica las clases tal cual (variantes *: y [&>…] intactas) y sin divide-y', () => {
      const { container } = render(
        <PortalFieldList columns={2}>
          <PortalFieldRow label="Solicitante">Ana</PortalFieldRow>
          <PortalFieldRow label="Área">Soporte</PortalFieldRow>
        </PortalFieldList>,
      );
      const dl = listOf(container);
      expect(dl.className).toBe(TWO_COLUMNS);
      expect(dl.className).not.toContain('divide-y');
      expect(dl.className).not.toContain('grid-flow-col');
      expect(dl.className).not.toMatch(/(^|\s)order-/);
    });

    it('className se añade sin alterar las clases del contrato', () => {
      const { container } = render(
        <PortalFieldList columns={2} className="mt-2">
          <PortalFieldRow label="Solicitante">Ana</PortalFieldRow>
        </PortalFieldList>,
      );
      expect(listOf(container).className).toBe(`${TWO_COLUMNS} mt-2`);
    });

    it('sigue siendo dl con filas div > dt + dd en el orden del DOM', () => {
      const labels = ['Solicitante', 'Área', 'Relacionado con', 'Visita técnica'];
      const { container } = render(
        <PortalFieldList columns={2}>
          {labels.map((label) => (
            <PortalFieldRow key={label} label={label}>
              valor
            </PortalFieldRow>
          ))}
        </PortalFieldList>,
      );
      const rows = listOf(container).querySelectorAll(':scope > div');
      expect(rows).toHaveLength(4);
      rows.forEach((row) => {
        expect(row.className).toBe(portalFieldRowClassName);
        expect(Array.from(row.children).map((c) => c.tagName)).toEqual(['DT', 'DD']);
      });
      expect(Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent)).toEqual(
        labels,
      );
    });
  });

  describe('criterio 3: emptyLabel', () => {
    it('con empty muestra el texto propio con la clase de vacío y sin mono', () => {
      render(
        <PortalFieldList columns={2}>
          <PortalFieldRow label="Área" empty emptyLabel="Sin área" mono>
            ignorado
          </PortalFieldRow>
        </PortalFieldList>,
      );
      const empty = screen.getByText('Sin área');
      expect(empty.closest('dd')).not.toBeNull();
      expect(empty.className).toBe(portalFieldEmptyValueClassName);
      expect(empty.className).not.toContain('font-mono');
      expect(screen.queryByText('Sin dato')).not.toBeInTheDocument();
      expect(screen.queryByText('ignorado')).not.toBeInTheDocument();
    });

    it('con empty y sin emptyLabel muestra «Sin dato»', () => {
      render(
        <PortalFieldList>
          <PortalFieldRow label="Correo" empty />
        </PortalFieldList>,
      );
      expect(screen.getByText('Sin dato').className).toBe(portalFieldEmptyValueClassName);
    });

    it('sin empty ignora emptyLabel y pinta el valor', () => {
      render(
        <PortalFieldList>
          <PortalFieldRow label="Visita técnica" emptyLabel="No requiere">
            Programada
          </PortalFieldRow>
        </PortalFieldList>,
      );
      expect(screen.getByText('Programada')).toBeInTheDocument();
      expect(screen.queryByText('No requiere')).not.toBeInTheDocument();
    });

    it('el valor atenuado es texto leído: sin aria-hidden, sr-only ni aria-label sustituto', () => {
      const { container } = render(
        <PortalFieldList>
          <PortalFieldRow label="Orden de trabajo" empty emptyLabel="Sin vincular" />
        </PortalFieldList>,
      );
      const empty = screen.getByText('Sin vincular');
      const dd = empty.closest('dd') as HTMLElement;
      expect(dd).toHaveTextContent('Sin vincular');
      expect(container.querySelector('[aria-hidden]')).toBeNull();
      expect(container.querySelector('[aria-label]')).toBeNull();
      expect(container.querySelector('.sr-only')).toBeNull();
      expect(empty).toBeVisible();
      // El par etiqueta/valor llega al árbol de accesibilidad como término y definición.
      expect(screen.getByRole('term')).toHaveTextContent('Orden de trabajo');
      expect(screen.getByRole('definition')).toHaveTextContent('Sin vincular');
    });
  });
});

describe('criterio 5: estados cargando, vacío y error', () => {
  it('cargando: aria-busy, cabecera visible y 3 filas de esqueleto con la rejilla', () => {
    const { container } = render(
      <PortalPanel title="Contacto" labelled density="dense" busy>
        <PortalFieldList>
          {[0, 1, 2].map((i) => (
            <div key={i} className={portalFieldRowClassName}>
              <PortalSkeletonBlock className="h-4" />
              <PortalSkeletonBlock className="h-4" />
            </div>
          ))}
        </PortalFieldList>
      </PortalPanel>,
    );
    const region = screen.getByRole('region', { name: 'Contacto' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'Contacto' })).toBeVisible();
    expect(container.querySelectorAll(`dl > div`)).toHaveLength(3);
  });

  it('vacío: estado embebido dentro del cuerpo; la región sigue localizable', () => {
    render(
      <PortalPanel title="Visitas" labelled density="dense">
        <PortalEmptyState embedded icon={Inbox} title="Sin visitas registradas." description="" />
      </PortalPanel>,
    );
    const region = screen.getByRole('region', { name: 'Visitas' });
    expect(within(region).getByText('Sin visitas registradas.')).toBeInTheDocument();
  });

  it('error: conserva cabecera y devuelve el foco al título tras reintentar', () => {
    function ErrorCard() {
      const titleRef = useRef<HTMLHeadingElement>(null);
      const [failed, setFailed] = useState(true);
      return (
        <PortalPanel
          title="Servicios"
          labelled
          density="dense"
          titleRef={titleRef}
          titleTabIndex={-1}
        >
          {failed ? (
            <PortalAlert
              variant="error"
              title="No se pudieron cargar los servicios."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setFailed(false);
                    titleRef.current?.focus();
                  }}
                >
                  Reintentar
                </button>
              }
            />
          ) : (
            <p>ok</p>
          )}
        </PortalPanel>
      );
    }
    render(<ErrorCard />);
    expect(screen.getByRole('heading', { name: 'Servicios' })).toBeInTheDocument();
    expect(screen.getByText('No se pudieron cargar los servicios.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByRole('heading', { name: 'Servicios' })).toHaveFocus();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
