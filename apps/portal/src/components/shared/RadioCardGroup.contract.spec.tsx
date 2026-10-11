import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioCardGroup } from '@iwana/ui';

function KeyboardGroup() {
  const [value, setValue] = useState('first');
  return (
    <RadioCardGroup
      legend="Equipo"
      name="equipment"
      value={value}
      onChange={setValue}
      options={[
        { value: 'first', title: 'Primero', meta: 'SKU-001' },
        { value: 'second', title: 'Segundo' },
        {
          value: 'unavailable',
          title: 'No disponible',
          disabled: true,
          disabledReason: 'Requiere revisión de supervisión.',
        },
      ]}
    />
  );
}

describe('RadioCardGroup — contrato interactivo', () => {
  it('selecciona con clic y con flechas nativas, manteniendo semántica HTML', async () => {
    const user = userEvent.setup();
    const { container } = render(<KeyboardGroup />);
    const first = screen.getByRole('radio', { name: /Primero/ });
    const second = screen.getByRole('radio', { name: /Segundo/ });

    expect(screen.getByRole('group', { name: 'Equipo' })).toBeInTheDocument();
    expect(container.querySelector('[role="radiogroup"]')).toBeNull();
    expect(container.querySelector('[role="radio"]')).toBeNull();
    expect(first).toBeChecked();
    await user.click(first);
    await user.keyboard('{ArrowDown}');
    expect(second).toBeChecked();
  });

  it('expone el motivo del radio deshabilitado y conserva densidad mínima', () => {
    render(<KeyboardGroup />);
    const unavailable = screen.getByRole('radio', { name: /No disponible/ });

    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveAccessibleDescription('Requiere revisión de supervisión.');
    expect(unavailable.closest('label')).toHaveClass('min-h-11');
    expect(unavailable.closest('label')?.className).toContain('has-[:focus-visible]:ring-2');
  });
});
