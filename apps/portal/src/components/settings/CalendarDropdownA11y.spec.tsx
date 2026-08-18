import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Calendar } from '@iwana/ui';

describe('Calendar dropdown de mes y año', () => {
  it('permite abrir, navegar, confirmar y devolver el foco al trigger', async () => {
    const onMonthChange = jest.fn();

    render(
      <Calendar
        month={new Date(2026, 0, 15)}
        startMonth={new Date(2026, 0)}
        endMonth={new Date(2026, 2)}
        onMonthChange={onMonthChange}
      />,
    );

    const triggers = screen
      .getAllByRole('button')
      .filter(
        (button) => button.textContent?.trim() === 'enero' || button.textContent?.trim() === '2026',
      );
    expect(triggers).toHaveLength(2);

    const monthTrigger = triggers[0];
    if (!monthTrigger) throw new Error('No se encontró el trigger de mes.');
    fireEvent.click(monthTrigger);

    await screen.findByRole('listbox');
    const januaryOption = screen.getByRole('option', { name: 'enero' });
    const februaryOption = screen.getByRole('option', { name: 'febrero' });
    await waitFor(() => expect(januaryOption).toHaveFocus());

    fireEvent.keyDown(januaryOption, { key: 'End' });
    fireEvent.keyDown(januaryOption, { key: 'Home' });
    fireEvent.keyDown(januaryOption, { key: 'ArrowDown' });
    await waitFor(() => expect(februaryOption).toHaveFocus());
    fireEvent.keyDown(februaryOption, { key: 'ArrowUp' });
    await waitFor(() => expect(januaryOption).toHaveFocus());
    fireEvent.keyDown(januaryOption, { key: 'ArrowDown' });
    await waitFor(() => expect(februaryOption).toHaveFocus());
    fireEvent.keyDown(februaryOption, { key: ' ' });

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(monthTrigger).toHaveFocus();
    });
    expect(onMonthChange).toHaveBeenCalledWith(expect.any(Date));
    const selectedMonth = onMonthChange.mock.calls[0]?.[0] as Date | undefined;
    expect(selectedMonth?.getMonth()).toBe(1);

    fireEvent.click(monthTrigger);
    const reopenedListbox = await screen.findByRole('listbox');
    const reopenedFirstOption = screen.getAllByRole('option')[0];
    if (!reopenedFirstOption) throw new Error('No se encontró una opción de mes al reabrir.');
    await waitFor(() => expect(reopenedFirstOption).toHaveFocus());

    fireEvent.keyDown(reopenedFirstOption, { key: 'Escape' });

    await waitFor(() => {
      expect(reopenedListbox).not.toBeInTheDocument();
      expect(monthTrigger).toHaveFocus();
    });
    expect(onMonthChange).toHaveBeenCalledTimes(1);
  });

  it('permite seleccionar un año con foco, flechas y Enter', async () => {
    const onMonthChange = jest.fn();

    render(
      <Calendar
        month={new Date(2026, 0, 15)}
        startMonth={new Date(2026, 0)}
        endMonth={new Date(2027, 2)}
        onMonthChange={onMonthChange}
      />,
    );

    const yearTrigger = screen.getByRole('button', { name: 'Elegir el año' });
    fireEvent.click(yearTrigger);

    await screen.findByRole('listbox');
    const currentYear = screen.getByRole('option', { name: '2026' });
    const nextYear = screen.getByRole('option', { name: '2027' });
    await waitFor(() => expect(currentYear).toHaveFocus());

    fireEvent.keyDown(currentYear, { key: 'ArrowDown' });
    await waitFor(() => expect(nextYear).toHaveFocus());
    fireEvent.keyDown(nextYear, { key: 'ArrowUp' });
    await waitFor(() => expect(currentYear).toHaveFocus());
    fireEvent.keyDown(currentYear, { key: 'ArrowDown' });
    await waitFor(() => expect(nextYear).toHaveFocus());
    fireEvent.keyDown(nextYear, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(yearTrigger).toHaveFocus();
    });
    expect(onMonthChange).toHaveBeenCalledWith(expect.any(Date));
    const selectedYear = onMonthChange.mock.calls[0]?.[0] as Date | undefined;
    expect(selectedYear?.getFullYear()).toBe(2027);
  });
});
