import { useState, type ComponentProps } from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpedienteTimelinePanel, type TimelineEntry } from './ExpedienteTimelinePanel';

type TimelinePanelProps = ComponentProps<typeof ExpedienteTimelinePanel>;

const entries: TimelineEntry[] = Array.from({ length: 15 }, (_, index) => ({
  id: `contact-${index + 1}`,
  kind: 'contact',
  sortAt: new Date(2026, 0, index + 1),
  data: {
    kind: 'contact' as const,
    id: `contact-${index + 1}`,
    attemptedAt: '2026-01-01T12:00:00.000Z',
    channel: 'EMAIL',
    result: 'EXITOSO',
    durationMinutes: null,
    notes: null,
    actor: { userId: 'advisor-1', name: 'Asesor', role: 'SALES' },
  },
}));

function createProps(overrides: Partial<TimelinePanelProps> = {}): TimelinePanelProps {
  return {
    loadingTimeline: false,
    timelineError: null,
    onRetryTimeline: jest.fn(),
    timelineEntries: entries,
    timelineTotal: entries.length,
    activeFilter: 'all',
    onActiveFilterChange: jest.fn(),
    timelinePageSize: 5,
    onTimelinePageSizeChange: jest.fn(),
    isHistoryExpanded: true,
    onHistoryExpandedChange: jest.fn(),
    timelinePage: 2,
    timelineTotalPages: 3,
    onTimelinePageChange: jest.fn(),
    ...overrides,
  };
}

describe('ExpedienteTimelinePanel — paginación de bitácora', () => {
  it('conserva el menú de filtros cuando el filtro activo no tiene resultados', () => {
    render(
      <ExpedienteTimelinePanel
        {...createProps({
          timelineEntries: [],
          timelineTotal: 0,
          activeFilter: 'contact',
          timelineTotalPages: 1,
          timelinePage: 1,
        })}
      />,
    );

    const toolbar = screen.getByRole('toolbar', { name: 'Filtros de la bitácora' });
    expect(within(toolbar).getByRole('button', { name: 'Contactos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(toolbar).getByRole('button', { name: 'Todos' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Estados' })).toBeInTheDocument();
    expect(screen.getByLabelText('Filas por página')).toBeInTheDocument();
    expect(screen.getByText('Sin resultados para este filtro')).toBeInTheDocument();
  });

  it('usa chips densos y selector canónico compacto de tamaño de página', () => {
    const { container } = render(<ExpedienteTimelinePanel {...createProps()} />);

    const contactos = screen.getByRole('button', { name: 'Contactos' });
    expect(contactos).toHaveClass('rounded-full', 'px-3', 'py-1.5', 'text-xs');
    expect(contactos).not.toHaveClass('min-h-11');

    expect(screen.getByRole('combobox', { name: 'Filas por página' })).toHaveClass('h-8');
    expect(
      container.querySelector('[data-density="compact"]#expediente-timeline-page-size') ||
        container.querySelector('[data-density="compact"]'),
    ).toBeTruthy();
    expect(screen.queryByText('Ver', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('renderiza las cinco variantes de evento del contrato', () => {
    const eventDate = '2026-01-01T12:00:00.000Z';
    const variantEntries: TimelineEntry[] = [
      {
        id: 'contact:contact-1',
        kind: 'contact',
        sortAt: new Date(eventDate),
        data: {
          kind: 'contact',
          id: 'contact-1',
          attemptedAt: eventDate,
          channel: 'TELEFONO',
          result: 'EXITOSO',
          durationMinutes: 5,
          notes: 'Contacto inicial',
          actor: { userId: 'user-1', name: 'Usuario de prueba', role: 'SALES' },
        },
      },
      {
        id: 'responsibility:responsibility-1',
        kind: 'responsibility',
        sortAt: new Date(eventDate),
        data: {
          kind: 'responsibility',
          id: 'responsibility-1',
          changedAt: eventDate,
          previousResponsible: { userId: 'user-1', name: 'Usuario de prueba 1', role: 'SALES' },
          newResponsible: { userId: 'user-2', name: 'Usuario de prueba 2', role: 'ADMIN' },
          actor: { userId: 'user-3', name: 'Usuario de prueba 3', role: 'ADMIN' },
          notes: 'Reasignación operativa',
        },
      },
      {
        id: 'attribution:attribution-1',
        kind: 'attribution',
        sortAt: new Date(eventDate),
        data: {
          kind: 'attribution',
          id: 'attribution-1',
          attributedAt: eventDate,
          revokedAt: null,
          revokedReason: null,
          actorName: 'Usuario de prueba 4',
          actorRole: 'SALES',
          acquisitionChannel: 'WEB',
          attributedBy: { userId: 'user-3', name: 'Usuario de prueba 3', role: 'ADMIN' },
        },
      },
      {
        id: 'pipeline:pipeline-1',
        kind: 'pipeline',
        sortAt: new Date(eventDate),
        data: {
          kind: 'pipeline',
          id: 'pipeline-1',
          changedAt: eventDate,
          fromStatus: 'NUEVO_POTENCIAL',
          toStatus: 'PRECALIFICADO',
          reason: 'Información completa',
          actor: { userId: 'user-3', name: 'Usuario de prueba 3', role: 'ADMIN' },
        },
      },
      {
        id: 'system:system-1',
        kind: 'system',
        sortAt: new Date(eventDate),
        data: {
          kind: 'system',
          id: 'system-1',
          occurredAt: eventDate,
          type: 'CREATED',
          sectionLabel: null,
          reason: null,
          actor: { userId: 'user-3', name: 'Usuario de prueba 3', role: 'ADMIN' },
        },
      },
    ];

    render(
      <ExpedienteTimelinePanel
        {...createProps({ timelineEntries: variantEntries, timelineTotal: variantEntries.length })}
      />,
    );

    expect(screen.getByText('Intento de contacto')).toBeInTheDocument();
    expect(screen.getByText('Cambio de responsable')).toBeInTheDocument();
    expect(screen.getByText('Atribución comercial')).toBeInTheDocument();
    expect(screen.getByText('Cambio de estado')).toBeInTheDocument();
    expect(screen.getByText('Oportunidad creada')).toBeInTheDocument();
  });

  it('usa gramática compacta para botones, estado activo y navegación', () => {
    render(<ExpedienteTimelinePanel {...createProps()} />);

    const nav = screen.getByRole('navigation', {
      name: 'Paginación de la bitácora de actividad',
    });
    const currentPage = within(nav).getByRole('button', { name: 'Página 2' });
    const inactivePage = within(nav).getByRole('button', { name: 'Página 1' });

    expect(currentPage).toHaveClass('h-8', 'min-w-8', 'rounded-lg', 'bg-iwana-primary');
    expect(currentPage).toHaveAttribute('aria-current', 'page');
    expect(currentPage).not.toHaveClass('border');
    expect(inactivePage).toHaveClass('h-8', 'min-w-8', 'rounded-lg');
    expect(inactivePage).toHaveClass('hover:bg-iwana-surface-soft');
    expect(inactivePage).not.toHaveClass('border');

    const previous = within(nav).getByRole('button', { name: 'Anterior' });
    const next = within(nav).getByRole('button', { name: 'Siguiente' });
    expect(previous).toHaveClass('rounded-full', 'border-iwana-primary/25', 'text-xs');
    expect(previous).not.toHaveClass('min-h-11');
    expect(next).toHaveClass('rounded-full', 'border-iwana-primary/25', 'text-xs');
    expect(next).not.toHaveClass('min-h-11');
    expect(within(nav).getByText('Página 2 de 3', { selector: 'span' })).toHaveClass('sm:hidden');
  });

  it('expone elipsis no interactivos y oculta los números en mobile', () => {
    render(
      <ExpedienteTimelinePanel
        {...createProps({
          timelinePage: 5,
          timelineTotalPages: 10,
        })}
      />,
    );

    const nav = screen.getByRole('navigation', {
      name: 'Paginación de la bitácora de actividad',
    });
    const ellipses = nav.querySelectorAll('span[aria-hidden="true"]');

    expect(ellipses.length).toBeGreaterThanOrEqual(1);
    ellipses.forEach((ellipsis) => {
      expect(ellipsis).toHaveTextContent('…');
      expect(ellipsis).toHaveClass('h-8', 'min-w-8', 'sm:inline-flex');
    });
    expect(within(nav).getByText('Página 5 de 10', { selector: 'span' })).toHaveClass('sm:hidden');
  });

  it('anuncia el cambio y restaura el foco dentro de la navegación', async () => {
    function TimelinePagerHarness() {
      const [page, setPage] = useState(2);

      return (
        <ExpedienteTimelinePanel
          {...createProps({
            timelinePage: page,
            timelineEntries: entries.slice((page - 1) * 5, page * 5),
            onTimelinePageChange: setPage,
          })}
        />
      );
    }

    const user = userEvent.setup();
    render(<TimelinePagerHarness />);

    await user.click(screen.getByRole('button', { name: 'Página 3' }));

    expect(screen.getByRole('button', { name: 'Página 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await waitFor(() => {
      expect(screen.getByRole('navigation').contains(document.activeElement)).toBe(true);
    });

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent(/Página 3 de 3/);
  });

  it('mantiene anterior y siguiente deshabilitados en los extremos', () => {
    const { unmount } = render(<ExpedienteTimelinePanel {...createProps({ timelinePage: 1 })} />);

    const nav = screen.getByRole('navigation', {
      name: 'Paginación de la bitácora de actividad',
    });
    expect(within(nav).getByRole('button', { name: 'Anterior' })).toBeDisabled();

    unmount();
    render(<ExpedienteTimelinePanel {...createProps({ timelinePage: 3 })} />);
    const lastPageNav = screen.getByRole('navigation', {
      name: 'Paginación de la bitácora de actividad',
    });
    expect(within(lastPageNav).getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
