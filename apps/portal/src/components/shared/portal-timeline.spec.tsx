import { useRef, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Button } from '@iwana/ui';
import { PortalEmptyState, PortalTimeline, type PortalTimelineItem } from './portal-ui';

const ITEMS: PortalTimelineItem[] = [
  { id: 'e1', title: 'Instalación', at: '2026-11-16T15:30:00Z', tone: 'current' },
  {
    id: 'e2',
    title: 'Reparación',
    at: '2026-10-01T10:00:00Z',
    detail: 'Cambio de fuente',
    meta: 'OT-20261001-004',
  },
];

const EMPTY = (
  <PortalEmptyState embedded title="Sin eventos" description="Aquí verás el historial." />
);

const fixedFormat = (iso: string) => `fecha ${iso.slice(0, 10)}`;

describe('PortalTimeline', () => {
  it('pinta una lista ordenada con aria-label, títulos y <time dateTime>', () => {
    render(
      <PortalTimeline
        label="Historial de equipos"
        items={ITEMS}
        empty={EMPTY}
        formatAt={fixedFormat}
      />,
    );

    const list = screen.getByRole('list', { name: 'Historial de equipos' });
    expect(list.tagName).toBe('OL');
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    const time = within(rows[1]!).getByText('fecha 2026-10-01');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-10-01T10:00:00Z');
    expect(time).toHaveClass('font-mono', 'tabular-nums');
    expect(within(rows[1]!).getByText('Cambio de fuente')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('OT-20261001-004')).toBeInTheDocument();
  });

  it('marca tone="current" con aria-current="step" y el resto como pasado', () => {
    render(<PortalTimeline label="Historial" items={ITEMS} empty={EMPTY} />);

    const [current, past] = screen.getAllByRole('listitem');
    expect(current).toHaveAttribute('aria-current', 'step');
    expect(past).not.toHaveAttribute('aria-current');
    expect(current!.querySelector('[data-timeline-node]')).toHaveClass('bg-iwana-secondary');
    expect(past!.querySelector('[data-timeline-node]')).toHaveClass('bg-iwana-primary/20');
    expect(past!.querySelector('[data-timeline-node]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('formatea la fecha por defecto en es-CO (fecha y hora cortas)', () => {
    render(<PortalTimeline label="Historial" items={ITEMS.slice(0, 1)} empty={EMPTY} />);

    // TZ de la suite: America/Bogota (jest.global-setup.js) → 10:30 a. m.
    expect(screen.getByText(/16\/11\/26/)).toHaveAttribute('dateTime', '2026-11-16T15:30:00Z');
  });

  it('cargando sin items: 3 filas de skeleton con role="status" y texto oculto', () => {
    const { container } = render(
      <PortalTimeline label="Historial" items={[]} empty={EMPTY} busy />,
    );

    const status = screen.getByRole('status');
    expect(within(status).getByText('Cargando…')).toHaveClass('sr-only');
    expect(container.querySelectorAll('[data-timeline-skeleton-row]')).toHaveLength(3);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin eventos')).not.toBeInTheDocument();
  });

  it('recargando con items: mantiene la lista con aria-busy y cursor de progreso', () => {
    render(<PortalTimeline label="Historial" items={ITEMS} empty={EMPTY} busy />);

    const list = screen.getByRole('list', { name: 'Historial' });
    expect(list).toHaveAttribute('aria-busy', 'true');
    expect(list).toHaveClass('cursor-progress');
    expect(list.className).not.toMatch(/opacity-/);
  });

  it('vacío: pinta `empty` solo si no hay items, ni busy, ni error', () => {
    const { rerender } = render(<PortalTimeline label="Historial" items={[]} empty={EMPTY} />);
    expect(screen.getByText('Sin eventos')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();

    rerender(
      <PortalTimeline
        label="Historial"
        items={[]}
        empty={EMPTY}
        error="No pudimos cargar el historial"
      />,
    );
    expect(screen.queryByText('Sin eventos')).not.toBeInTheDocument();
  });

  it('error sin items: aviso compacto con «Reintentar» que llama onRetry y lleva el foco al título', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    function Harness() {
      const headingRef = useRef<HTMLHeadingElement>(null);
      return (
        <section>
          <h2 ref={headingRef} tabIndex={-1}>
            Historial de equipos
          </h2>
          <PortalTimeline
            label="Historial"
            items={[]}
            empty={EMPTY}
            error="No pudimos cargar el historial"
            onRetry={onRetry}
            headingRef={headingRef}
          />
        </section>
      );
    }

    render(<Harness />);

    expect(screen.getByText('No pudimos cargar el historial')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    expect(retry).toHaveClass('min-h-11');

    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Historial de equipos' })).toHaveFocus();
  });

  it('error sin onRetry: no pinta el botón', () => {
    render(<PortalTimeline label="Historial" items={[]} empty={EMPTY} error="Falló" />);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('error con items: la lista se mantiene y el aviso va entre la lista y «Ver más»', () => {
    render(
      <PortalTimeline
        label="Historial"
        items={ITEMS}
        empty={EMPTY}
        error="No pudimos cargar más eventos"
        onRetry={jest.fn()}
        hasMore
        onLoadMore={jest.fn()}
      />,
    );

    const list = screen.getByRole('list', { name: 'Historial' });
    const alert = screen.getByText('No pudimos cargar más eventos');
    const more = screen.getByRole('button', { name: 'Ver más' });
    expect(list.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('«Ver más» llama onLoadMore y queda ocupado mientras loadingMore', async () => {
    const user = userEvent.setup();
    const onLoadMore = jest.fn();
    const { rerender } = render(
      <PortalTimeline
        label="Historial"
        items={ITEMS}
        empty={EMPTY}
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    const more = screen.getByRole('button', { name: 'Ver más' });
    expect(more).toHaveClass('min-h-11');
    await user.click(more);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(
      <PortalTimeline
        label="Historial"
        items={ITEMS}
        empty={EMPTY}
        hasMore
        onLoadMore={onLoadMore}
        loadingMore
      />,
    );
    expect(screen.getByRole('button', { name: /Ver más/ })).toBeDisabled();
  });

  it('sin hasMore no pinta «Ver más»', () => {
    render(<PortalTimeline label="Historial" items={ITEMS} empty={EMPTY} onLoadMore={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  function LoadMoreHarness({ pages }: { pages: number }) {
    const [items, setItems] = useState<PortalTimelineItem[]>(ITEMS);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loaded, setLoaded] = useState(1);
    const finish = () => {
      setItems((prev) => [
        ...prev,
        { id: `p${loaded}`, title: `Retiro ${loaded}`, at: '2026-09-01T10:00:00Z' },
      ]);
      setLoaded((n) => n + 1);
      setLoadingMore(false);
    };
    return (
      <>
        <PortalTimeline
          label="Historial"
          items={items}
          empty={EMPTY}
          hasMore={loaded < pages}
          onLoadMore={() => setLoadingMore(true)}
          loadingMore={loadingMore}
        />
        <button type="button" onClick={finish}>
          terminar carga
        </button>
      </>
    );
  }

  it('al terminar «Ver más» con más páginas, el foco vuelve al botón', async () => {
    const user = userEvent.setup();
    render(<LoadMoreHarness pages={3} />);

    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    // El navegador saca el foco del botón deshabilitado y jsdom no: pulsar el
    // control externo se lleva el foco, y el componente debe devolverlo.
    const finish = screen.getByRole('button', { name: 'terminar carga' });
    await user.click(finish);
    expect(finish).not.toHaveFocus();

    expect(screen.getByRole('button', { name: 'Ver más' })).toHaveFocus();
  });

  it('al terminar «Ver más» sin más páginas, el foco va a la lista (tabIndex -1, sin anillo)', async () => {
    const user = userEvent.setup();
    render(<LoadMoreHarness pages={2} />);

    await user.click(screen.getByRole('button', { name: 'Ver más' }));
    // El navegador saca el foco del botón deshabilitado y jsdom no: pulsar el
    // control externo se lleva el foco, y el componente debe devolverlo.
    const finish = screen.getByRole('button', { name: 'terminar carga' });
    await user.click(finish);
    expect(finish).not.toHaveFocus();

    const list = screen.getByRole('list', { name: 'Historial' });
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute('tabIndex', '-1');
    expect(list).toHaveClass('outline-none');
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('el foco no se mueve si la carga no la pidió «Ver más»', () => {
    const { rerender } = render(
      <PortalTimeline
        label="Historial"
        items={ITEMS}
        empty={EMPTY}
        hasMore
        onLoadMore={jest.fn()}
        loadingMore
      />,
    );
    rerender(
      <PortalTimeline
        label="Historial"
        items={ITEMS}
        empty={EMPTY}
        hasMore
        onLoadMore={jest.fn()}
      />,
    );
    expect(document.body).toHaveFocus();
  });

  it('solo `action` y «Ver más» son enfocables', () => {
    render(
      <PortalTimeline
        label="Historial"
        items={[
          {
            ...ITEMS[0]!,
            action: (
              <Button type="button" size="sm" className="min-h-11">
                Ver OT
              </Button>
            ),
          },
          ITEMS[1]!,
        ]}
        empty={EMPTY}
        hasMore
        onLoadMore={jest.fn()}
      />,
    );

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Ver OT', 'Ver más']);
    for (const row of screen.getAllByRole('listitem')) {
      expect(row).not.toHaveAttribute('tabIndex');
    }
  });

  it('sin violaciones axe con lista, aviso y «Ver más»', async () => {
    const { container } = render(
      <PortalTimeline
        label="Historial de equipos"
        items={ITEMS}
        empty={EMPTY}
        error="No pudimos cargar más eventos"
        onRetry={jest.fn()}
        hasMore
        onLoadMore={jest.fn()}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sin violaciones axe en carga', async () => {
    const { container } = render(
      <PortalTimeline label="Historial" items={[]} empty={EMPTY} busy />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
