import { render, screen, fireEvent } from '@testing-library/react';
import { BusinessHoursWeekday } from '@iwana/shared';
import {
  BusinessHoursWeekEditor,
  buildBusinessHoursDraft,
  normalizeBusinessHourTime,
  type BusinessHourDay,
} from './BusinessHoursWeekEditor';

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
  describe('renderizado', () => {
    it('muestra 7 filas (una por día)', () => {
      const onChange = jest.fn();
      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={onChange} />);

      expect(screen.getByTestId('bh-row-monday')).toBeInTheDocument();
      expect(screen.getByTestId('bh-row-sunday')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(8); // thead + 7 días
    });

    it('muestra valores de hora guardados', () => {
      const onChange = jest.fn();
      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={onChange} />);

      const opensInput = screen.getByTestId('bh-opens-monday') as HTMLInputElement;
      const closesInput = screen.getByTestId('bh-closes-monday') as HTMLInputElement;

      expect(opensInput.value).toBe('07:00');
      expect(closesInput.value).toBe('17:00');
    });

    it('deshabilita inputs de tiempo cuando el día está cerrado', () => {
      const onChange = jest.fn();
      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={onChange} />);

      const satOpens = screen.getByTestId('bh-opens-saturday') as HTMLInputElement;
      const satCloses = screen.getByTestId('bh-closes-saturday') as HTMLInputElement;

      expect(satOpens.disabled).toBe(true);
      expect(satCloses.disabled).toBe(true);
    });

    it('deshabilita todos los inputs cuando canEdit=false', () => {
      const onChange = jest.fn();
      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={false} onChange={onChange} />);

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => expect(cb).toBeDisabled());
    });
  });

  describe('interacción', () => {
    it('llama onChange al cambiar hora de apertura', () => {
      const onChange = jest.fn();
      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={onChange} />);

      fireEvent.change(screen.getByTestId('bh-opens-monday'), {
        target: { value: '08:00' },
      });

      expect(onChange).toHaveBeenCalledTimes(1);
      const result = onChange.mock.calls[0][0] as BusinessHourDay[];
      const monday = result.find((d) => d.weekday === BusinessHoursWeekday.MONDAY);
      expect(monday?.opensAt).toBe('08:00');
    });

    it('al desmarcar un día limpia opensAt y closesAt', () => {
      const onChange = jest.fn();
      render(<BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('bh-open-monday'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const result = onChange.mock.calls[0][0] as BusinessHourDay[];
      const monday = result.find((d) => d.weekday === BusinessHoursWeekday.MONDAY);
      expect(monday?.isOpen).toBe(false);
      expect(monday?.opensAt).toBeNull();
      expect(monday?.closesAt).toBeNull();
    });

    it('al marcar un día cerrado habilita los inputs de tiempo', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <BusinessHoursWeekEditor days={FULL_WEEK} canEdit={true} onChange={onChange} />,
      );

      fireEvent.click(screen.getByTestId('bh-open-saturday'));

      const updatedDays = onChange.mock.calls[0][0] as BusinessHourDay[];
      rerender(<BusinessHoursWeekEditor days={updatedDays} canEdit={true} onChange={onChange} />);

      const satOpens = screen.getByTestId('bh-opens-saturday') as HTMLInputElement;
      expect(satOpens.disabled).toBe(false);
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
});
