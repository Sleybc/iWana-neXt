import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsSubTabs } from './SettingsSubTabs';

describe('SettingsSubTabs', () => {
  it('should render branding sub-sections and switch active item', () => {
    const onChange = jest.fn();

    render(
      <SettingsSubTabs
        items={[
          { id: 'identity', label: 'Identidad visual' },
          { id: 'plans', label: 'Planes' },
          { id: 'products', label: 'Productos' },
          { id: 'coverage', label: 'Cobertura' },
        ]}
        activeTab="identity"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Planes' }));
    expect(onChange).toHaveBeenCalledWith('plans');
  });
});
