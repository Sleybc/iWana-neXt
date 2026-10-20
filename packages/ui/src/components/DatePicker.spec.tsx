/** @jest-environment jsdom */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })[
      'IS_REACT_ACT_ENVIRONMENT'
    ] = true;
  });

  afterAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })[
      'IS_REACT_ACT_ENVIRONMENT'
    ] = false;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T08:00:00'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  it('permite limpiar una fecha opcional al volver a elegir el mismo día', async () => {
    const onChange = jest.fn();
    const selectedDate = new Date(2026, 6, 11);

    await act(async () => {
      root.render(
        <DatePicker id="manual-date" label="Fecha" value={selectedDate} onChange={onChange} />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('#manual-date');
    expect(trigger?.textContent).toContain('11/07/2026');

    await act(async () => {
      trigger?.click();
    });

    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.querySelector('[role="grid"]')).not.toBeNull();

    const selectedDay = document.body.querySelector<HTMLButtonElement>(
      '[data-day="2026-07-11"] button',
    );
    expect(selectedDay).not.toBeNull();

    await act(async () => {
      selectedDay?.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('mantiene la fecha si el consumidor opta por conservarla al volver a elegirla', async () => {
    const onChange = jest.fn();
    const selectedDate = new Date(2026, 6, 11);

    await act(async () => {
      root.render(
        <DatePicker
          id="manual-date-preserved"
          label="Fecha"
          value={selectedDate}
          onChange={onChange}
          preserveSelectionOnReselect
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('#manual-date-preserved');
    await act(async () => {
      trigger?.click();
    });

    const selectedDay = document.body.querySelector<HTMLButtonElement>(
      '[data-day="2026-07-11"] button',
    );
    await act(async () => {
      selectedDay?.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual(selectedDate);
  });

  it('genera un id accesible y cierra el calendario aunque no haya callback de cambio', async () => {
    await act(async () => {
      root.render(<DatePicker placeholder="Elige el día" />);
    });

    const trigger = container.querySelector<HTMLButtonElement>('button');
    expect(trigger?.id).toBeTruthy();
    expect(trigger?.getAttribute('aria-labelledby')).toBeNull();
    expect(trigger?.getAttribute('aria-describedby')).toBeNull();
    expect(trigger?.textContent).toContain('Elige el día');

    await act(async () => {
      trigger?.click();
    });

    const day = document.body.querySelector<HTMLButtonElement>('[data-day="2026-07-11"] button');
    expect(day).not.toBeNull();

    await act(async () => {
      day?.click();
    });

    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('usa la etiqueta requerida, el formato personalizado y la ayuda asociada', async () => {
    await act(async () => {
      root.render(
        <DatePicker
          label="Fecha de inicio"
          requiredIndicator
          helperText="Debe ser posterior a hoy."
          value={new Date(2026, 6, 11)}
          formatLabel={() => 'Mañana'}
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button');
    const label = container.querySelector<HTMLLabelElement>('label');
    const helper = container.querySelector<HTMLParagraphElement>('p');

    expect(label?.textContent).toContain('Fecha de inicio');
    expect(label?.textContent).toContain('*');
    expect(trigger?.getAttribute('aria-labelledby')).toBe(label?.id);
    expect(trigger?.getAttribute('aria-describedby')).toBe(helper?.id);
    expect(trigger?.textContent).toContain('Mañana');
    expect(helper?.textContent).toBe('Debe ser posterior a hoy.');
  });

  it('prioriza el error sobre la ayuda y expone el estado inválido', async () => {
    await act(async () => {
      root.render(
        <DatePicker
          id="fecha-con-error"
          label="Fecha de inicio"
          helperText="Ayuda que no aplica mientras haya un error."
          error="Selecciona una fecha válida."
          disabled
        />,
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('#fecha-con-error');
    const error = container.querySelector<HTMLParagraphElement>('[role="alert"]');

    expect(trigger?.disabled).toBe(true);
    expect(trigger?.getAttribute('aria-describedby')).toBe('fecha-con-error-error');
    expect(trigger?.getAttribute('aria-invalid')).toBe('true');
    expect(error?.textContent).toContain('Selecciona una fecha válida.');
    expect(container.querySelector('#fecha-con-error-helper')).toBeNull();
  });
});
