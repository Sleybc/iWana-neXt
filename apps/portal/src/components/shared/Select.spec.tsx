import { fireEvent, render, screen } from '@testing-library/react';
import { Select } from '@iwana/ui';

describe('Select', () => {
  it('renderiza el menú en un portal para evitar clipping dentro de modales', async () => {
    const { container } = render(
      <div className="overflow-hidden">
        <Select
          id="installation-rule"
          label="Regla de instalación"
          options={[
            { value: 'ALWAYS', label: 'Siempre cobrar instalación' },
            { value: 'ON_DEMAND', label: 'Cobrar instalación bajo demanda' },
            { value: 'NEVER', label: 'Nunca cobrar instalación' },
          ]}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Regla de instalación' }));

    const listbox = await screen.findByRole('listbox', { name: 'Regla de instalación' });

    expect(document.body.contains(listbox)).toBe(true);
    expect(container.contains(listbox)).toBe(false);
  });
});
