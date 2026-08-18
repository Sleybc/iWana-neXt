import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { TimeFieldSelect } from './TimeFieldSelect';

function renderTimeField({
  value = '07:15',
  disabled = false,
  compact = false,
}: {
  value?: string;
  disabled?: boolean;
  compact?: boolean;
} = {}) {
  const onChange = jest.fn();

  return {
    onChange,
    ...render(
      <TimeFieldSelect
        id="time-field"
        value={value}
        disabled={disabled}
        compact={compact}
        onChange={onChange}
        ariaLabel="Hora de inicio"
        dataTestId="time-field-trigger"
      />,
    ),
  };
}

describe('TimeFieldSelect', () => {
  it('renderiza un trigger accesible con el valor visible y sin input type=time', () => {
    const { container } = renderTimeField();

    const trigger = screen.getByRole('button', { name: 'Hora de inicio' });

    expect(trigger).toHaveTextContent('07:15');
    expect(trigger).toHaveAttribute('data-testid', 'time-field-trigger');
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('deshabilita el trigger cuando el campo está bloqueado', () => {
    renderTimeField({ disabled: true });

    expect(screen.getByRole('button', { name: 'Hora de inicio' })).toBeDisabled();
  });

  it('usa el placeholder corto --:-- en modo compacto y oculta el reloj', () => {
    const { container } = renderTimeField({ value: '', compact: true });
    const trigger = screen.getByRole('button', { name: 'Hora de inicio' });

    expect(trigger).toHaveTextContent('--:--');
    expect(trigger).not.toHaveTextContent('Selecciona una hora');
    expect(trigger.className).toContain('h-8');
    expect(trigger.className).toContain('w-[5.5rem]');
    expect(trigger.className).toContain('justify-center');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('conserva el placeholder largo y el reloj en el modo por defecto', () => {
    const { container } = renderTimeField({ value: '' });
    const trigger = screen.getByRole('button', { name: 'Hora de inicio' });

    expect(trigger).toHaveTextContent('Selecciona una hora');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('expone los dos listbox y confirma una hora y minuto arbitrarios por click', async () => {
    const user = userEvent.setup();
    const { onChange } = renderTimeField();

    await user.click(screen.getByRole('button', { name: 'Hora de inicio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Selecciona una hora' });
    const hourList = within(dialog).getByRole('listbox', { name: 'Hora' });
    const minuteList = within(dialog).getByRole('listbox', { name: 'Minutos' });

    expect(within(hourList).getByRole('option', { name: '07' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(minuteList).getByRole('option', { name: '15' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(hourList).getByRole('option', { name: '13' }));
    await user.click(within(minuteList).getByRole('option', { name: '37' }));

    expect(onChange).toHaveBeenCalledWith('13:37');
    expect(screen.queryByRole('dialog', { name: 'Selecciona una hora' })).not.toBeInTheDocument();
  });

  it('abre un popover denso sin título visible redundante', async () => {
    const user = userEvent.setup();
    renderTimeField();

    await user.click(screen.getByRole('button', { name: 'Hora de inicio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Selecciona una hora' });
    const hourOption = within(within(dialog).getByRole('listbox', { name: 'Hora' })).getByRole(
      'option',
      { name: '07' },
    );

    expect(within(dialog).queryByText('Selecciona una hora')).not.toBeInTheDocument();
    expect(within(dialog).getByText('07:15')).toBeInTheDocument();
    expect(within(dialog).getByText('Min')).toBeInTheDocument();
    expect(dialog.className).toContain('w-44');
    expect(dialog.className).toContain('p-1.5');
    expect(dialog.className).toContain('shadow-iwana-active');
    expect(hourOption.className).toContain('h-7');
    expect(within(dialog).getByRole('listbox', { name: 'Hora' }).className).toContain('max-h-32');
  });

  it('navega con flechas, Home, End y Enter hasta 23:59', async () => {
    const { onChange } = renderTimeField({ value: '' });

    fireEvent.click(screen.getByRole('button', { name: 'Hora de inicio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Selecciona una hora' });
    const hourList = within(dialog).getByRole('listbox', { name: 'Hora' });
    const minuteList = within(dialog).getByRole('listbox', { name: 'Minutos' });
    const hour00 = within(hourList).getByRole('option', { name: '00' });
    const hour01 = within(hourList).getByRole('option', { name: '01' });
    const hour23 = within(hourList).getByRole('option', { name: '23' });
    const minute00 = within(minuteList).getByRole('option', { name: '00' });
    const minute59 = within(minuteList).getByRole('option', { name: '59' });

    await waitFor(() => expect(hour00).toHaveFocus());
    fireEvent.keyDown(hour00, { key: 'ArrowUp' });
    expect(hour00).toHaveFocus();
    fireEvent.keyDown(hour00, { key: 'ArrowRight' });
    await waitFor(() => expect(minute00).toHaveFocus());
    fireEvent.keyDown(minute00, { key: 'ArrowLeft' });
    await waitFor(() => expect(hour00).toHaveFocus());
    fireEvent.keyDown(hour00, { key: 'ArrowDown' });
    expect(hour01).toHaveFocus();
    fireEvent.keyDown(hour01, { key: 'Home' });
    expect(hour00).toHaveFocus();
    fireEvent.keyDown(hour00, { key: 'End' });
    expect(hour23).toHaveFocus();
    fireEvent.keyDown(hour23, { key: 'Enter' });

    await waitFor(() => expect(minute00).toHaveFocus());
    fireEvent.keyDown(minute00, { key: 'End' });
    expect(minute59).toHaveFocus();
    fireEvent.keyDown(minute59, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('23:59');
    expect(screen.getByRole('button', { name: 'Hora de inicio' })).toHaveTextContent(
      'Selecciona una hora',
    );
  });

  it('cierra con Escape sin confirmar cambios del borrador', async () => {
    const user = userEvent.setup();
    const { onChange } = renderTimeField();

    await user.click(screen.getByRole('button', { name: 'Hora de inicio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Selecciona una hora' });
    await user.click(
      within(within(dialog).getByRole('listbox', { name: 'Hora' })).getByRole('option', {
        name: '22',
      }),
    );
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Selecciona una hora' })).not.toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Hora de inicio' })).toHaveTextContent('07:15');
  });

  it('no presenta violaciones de accesibilidad en el estado cerrado', async () => {
    const { container } = renderTimeField();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('no presenta violaciones de accesibilidad con el selector abierto', async () => {
    const user = userEvent.setup();
    renderTimeField();

    await user.click(screen.getByRole('button', { name: 'Hora de inicio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Selecciona una hora' });

    expect(await axe(dialog)).toHaveNoViolations();
  });
});
