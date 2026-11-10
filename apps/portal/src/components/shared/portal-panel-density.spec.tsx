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
