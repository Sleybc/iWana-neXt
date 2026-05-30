import { act, fireEvent, render, screen } from '@testing-library/react';
import { BusinessHoursWeekday } from '@iwana/shared';
import {
  BusinessHoursWeekEditor,
  buildBusinessHoursDraft,
  normalizeBusinessHourTime,
  type BusinessHourDay,
} from './BusinessHoursWeekEditor';

type MatchMediaListener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  let currentMatches = matches;
  const listeners = new Set<MatchMediaListener>();

  const mediaQuery = {
    get matches() {
      return currentMatches;
    },
    media: '(max-width: 767px)',
    onchange: null,
    addEventListener: jest.fn((_event: 'change', listener: MatchMediaListener) => {
      listeners.add(listener);
    }),
    removeEventListener: jest.fn((_event: 'change', listener: MatchMediaListener) => {
      listeners.delete(listener);
    }),
    addListener: jest.fn((listener: MatchMediaListener) => {
      listeners.add(listener);
    }),
    removeListener: jest.fn((listener: MatchMediaListener) => {
      listeners.delete(listener);
    }),
    dispatchEvent: jest.fn(),
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation(() => mediaQuery),
  });

  return {
    mediaQuery,
    setMatches(nextMatches: boolean) {
      currentMatches = nextMatches;
      const event = { matches: nextMatches, media: mediaQuery.media } as MediaQueryListEvent;

      listeners.forEach((listener) => listener(event));
      mediaQuery.onchange?.call(mediaQuery, event);
    },
  };
}

function renderEditor({
  days = FULL_WEEK,
  canEdit = true,
  onChange = jest.fn(),
  isMobile = false,
}: {
  days?: BusinessHourDay[];
  canEdit?: boolean;
  onChange?: jest.Mock;
  isMobile?: boolean;
} = {}) {
  mockMatchMedia(isMobile);

  return {
    onChange,
    ...render(<BusinessHoursWeekEditor days={days} canEdit={canEdit} onChange={onChange} />),
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_WEEK: BusinessHourDay[] = [
  { weekday: BusinessHoursWeekday.MONDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.TUESDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.WEDNESDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.THURSDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.FRIDAY, isOpen: true, opensAt: '07:00', closesAt: '17:00' },
  { weekday: BusinessHoursWeekday.SATURDAY, isOpen: false, opensAt: null, closesAt: null },
  { weekday: BusinessHoursWeekday.SUNDAY, isOpen: false, opensAt: null, closesAt: null },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BusinessHoursWeekEditor', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  describe('renderizado', () => {
    it('muestra la variante desktop en tabla cuando el viewport es amplio', () => {
      renderEditor();

      expect(screen.getByTestId('bh-layout-desktop')).toBeInTheDocument();
      expect(screen.getByTestId('bh-row-monday')).toBeInTheDocument();
      expect(screen.getByTestId('bh-row-sunday')).toBeInTheDocument();
      expect(screen.getByText('Inicio')).toBeInTheDocument();
      expect(screen.getByText('Fin')).toBeInTheDocument();
    });

    it('muestra la variante mobile en tarjetas cuando el viewport es estrecho', () => {
      renderEditor({ isMobile: true });

      expect(screen.getByTestId('bh-layout-mobile')).toBeInTheDocument();
      expect(screen.queryByTestId('bh-layout-desktop')).not.toBeInTheDocument();
      expect(screen.getByTestId('bh-row-monday')).toBeInTheDocument();
      expect(screen.getAllByText('Horario activo').length).toBeGreaterThan(0);
    });

    it('actualiza la variante cuando cambia el viewport tras montar', () => {
      const viewport = mockMatchMedia(false);

      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={jest.fn()} />);

      expect(screen.getByTestId('bh-layout-desktop')).toBeInTheDocument();

      act(() => {
        viewport.setMatches(true);
      });

      expect(screen.getByTestId('bh-layout-mobile')).toBeInTheDocument();
      expect(screen.queryByTestId('bh-layout-desktop')).not.toBeInTheDocument();
      expect(viewport.mediaQuery.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      );
    });

    it('muestra valores de hora guardados', () => {
      renderEditor();

      const opensInput = screen.getByTestId('bh-opens-monday');
      const closesInput = screen.getByTestId('bh-closes-monday');

      expect(opensInput).toHaveTextContent('07:00');
      expect(closesInput).toHaveTextContent('17:00');
    });

    it('deshabilita inputs de tiempo cuando el día está cerrado', () => {
      renderEditor();

      const satOpens = screen.getByTestId('bh-opens-saturday');
      const satCloses = screen.getByTestId('bh-closes-saturday');

      expect(satOpens).toBeDisabled();
      expect(satCloses).toBeDisabled();
    });

    it('deshabilita todos los inputs cuando canEdit=false en mobile', () => {
      renderEditor({ canEdit: false, isMobile: true });

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => expect(cb).toBeDisabled());

      const mondayOpens = screen.getByTestId('bh-opens-monday');
      expect(mondayOpens).toBeDisabled();
    });

    it('expone nombres accesibles por día para checkbox e inputs de hora', () => {
      renderEditor({ isMobile: true });

      expect(screen.getByRole('checkbox', { name: 'Lunes, abierto' })).toBeInTheDocument();
      expect(screen.getByLabelText('Lunes, desde')).toHaveTextContent('07:00');
      expect(screen.getByLabelText('Lunes, hasta')).toHaveTextContent('17:00');
    });

    it('ya no renderiza inputs nativos type=time', () => {
      const { container } = renderEditor();

      expect(container.querySelector('input[type="time"]')).toBeNull();
    });
  });

  describe('interacción', () => {
    it('mantiene onChange al cambiar hora de apertura en mobile', () => {
      const { onChange } = renderEditor({ isMobile: true });

      fireEvent.click(screen.getByTestId('bh-opens-monday'));
      fireEvent.click(screen.getByTestId('bh-opens-monday-hour-08'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const result = onChange.mock.calls[0][0] as BusinessHourDay[];
      const monday = result.find((d) => d.weekday === BusinessHoursWeekday.MONDAY);
      expect(monday?.opensAt).toBe('08:00');
    });

    it('al desmarcar un día limpia opensAt y closesAt', () => {
      const { onChange } = renderEditor();

      fireEvent.click(screen.getByTestId('bh-open-monday'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const result = onChange.mock.calls[0][0] as BusinessHourDay[];
      const monday = result.find((d) => d.weekday === BusinessHoursWeekday.MONDAY);
      expect(monday?.isOpen).toBe(false);
      expect(monday?.opensAt).toBeNull();
      expect(monday?.closesAt).toBeNull();
    });

    it('al marcar un día cerrado habilita los inputs de tiempo', () => {
      const { onChange, rerender } = renderEditor({ isMobile: true });

      fireEvent.click(screen.getByTestId('bh-open-saturday'));

      const updatedDays = onChange.mock.calls[0][0] as BusinessHourDay[];
      rerender(<BusinessHoursWeekEditor days={updatedDays} canEdit={true} onChange={onChange} />);

      const satOpens = screen.getByTestId('bh-opens-saturday');
      expect(satOpens).not.toBeDisabled();
    });

    it('permite ajustar minutos sin separar el control visual', () => {
      const { onChange } = renderEditor();

      fireEvent.click(screen.getByTestId('bh-opens-monday'));
      fireEvent.click(screen.getByTestId('bh-opens-monday-minute-15'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const result = onChange.mock.calls[0][0] as BusinessHourDay[];
      const monday = result.find((day) => day.weekday === BusinessHoursWeekday.MONDAY);
      expect(monday?.opensAt).toBe('07:15');
    });
  });
});

// ─── buildBusinessHoursDraft ──────────────────────────────────────────────────

describe('buildBusinessHoursDraft', () => {
  it('rellena los 7 días aunque la entrada esté vacía', () => {
    const draft = buildBusinessHoursDraft([]);
    expect(draft).toHaveLength(7);
    draft.forEach((d) => {
      expect(d.isOpen).toBe(false);
      expect(d.opensAt).toBeNull();
      expect(d.closesAt).toBeNull();
    });
  });

  it('preserva los valores existentes', () => {
    const input: BusinessHourDay[] = [
      {
        weekday: BusinessHoursWeekday.WEDNESDAY,
        isOpen: true,
        opensAt: '09:00',
        closesAt: '18:00',
      },
    ];
    const draft = buildBusinessHoursDraft(input);
    const wed = draft.find((d) => d.weekday === BusinessHoursWeekday.WEDNESDAY);
    expect(wed?.isOpen).toBe(true);
    expect(wed?.opensAt).toBe('09:00');
    expect(wed?.closesAt).toBe('18:00');
  });

  it('normaliza horarios con segundos a HH:mm', () => {
    const input: BusinessHourDay[] = [
      {
        weekday: BusinessHoursWeekday.FRIDAY,
        isOpen: true,
        opensAt: '07:00:00',
        closesAt: '17:00:00',
      },
    ];
    const draft = buildBusinessHoursDraft(input);
    const fri = draft.find((d) => d.weekday === BusinessHoursWeekday.FRIDAY);
    expect(fri?.opensAt).toBe('07:00');
    expect(fri?.closesAt).toBe('17:00');
  });

  it('descarta horarios inválidos al construir el draft', () => {
    const input: BusinessHourDay[] = [
      {
        weekday: BusinessHoursWeekday.TUESDAY,
        isOpen: true,
        opensAt: 'hora-invalida',
        closesAt: '17:00',
      },
    ];

    const draft = buildBusinessHoursDraft(input);
    const tue = draft.find((d) => d.weekday === BusinessHoursWeekday.TUESDAY);

    expect(tue?.opensAt).toBeNull();
    expect(tue?.closesAt).toBe('17:00');
  });
});

// ─── normalizeBusinessHourTime ────────────────────────────────────────────────

describe('normalizeBusinessHourTime', () => {
  it('devuelve vacío para null', () => {
    expect(normalizeBusinessHourTime(null)).toBe('');
  });

  it('devuelve vacío para undefined', () => {
    expect(normalizeBusinessHourTime(undefined)).toBe('');
  });

  it('recorta segundos de HH:mm:ss a HH:mm', () => {
    expect(normalizeBusinessHourTime('08:30:00')).toBe('08:30');
  });

  it('devuelve HH:mm sin cambios', () => {
    expect(normalizeBusinessHourTime('14:45')).toBe('14:45');
  });

  it('devuelve vacío para formato inválido', () => {
    expect(normalizeBusinessHourTime('hora-invalida')).toBe('');
  });
});
