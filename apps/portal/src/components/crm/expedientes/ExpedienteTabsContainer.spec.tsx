import { fireEvent, render, screen } from '@testing-library/react';
import { ExpedienteTabsContainer } from './ExpedienteTabsContainer';

describe('ExpedienteTabsContainer', () => {
  const tabs = [
    { id: 'resumen', label: 'Resumen', content: <p>Contenido resumen</p> },
    { id: 'gestion', label: 'Gestión', content: <p>Contenido gestión</p> },
  ];

  it('asocia cada tab con un panel accesible y muestra solo el activo', () => {
    render(<ExpedienteTabsContainer tabs={tabs} />);

    const resumenTab = screen.getByRole('tab', { name: 'Resumen' });
    const gestionTab = screen.getByRole('tab', { name: 'Gestión' });
    const panel = screen.getByRole('tabpanel');

    expect(resumenTab).toHaveAttribute('aria-controls', panel.id);
    expect(gestionTab).toHaveAttribute('aria-controls', panel.id);
    expect(document.getElementById(gestionTab.getAttribute('aria-controls') ?? '')).toBe(panel);
    expect(panel).toHaveAttribute('aria-labelledby', resumenTab.id);
    expect(screen.getByText('Contenido resumen')).toBeInTheDocument();
    expect(screen.queryByText('Contenido gestión')).not.toBeInTheDocument();
  });

  it('permite cambiar de tab con teclado y conserva la asociación ARIA', () => {
    render(<ExpedienteTabsContainer tabs={tabs} />);

    const resumenTab = screen.getByRole('tab', { name: 'Resumen' });
    const gestionTab = screen.getByRole('tab', { name: 'Gestión' });

    fireEvent.keyDown(resumenTab, { key: 'ArrowRight' });

    expect(gestionTab).toHaveAttribute('aria-selected', 'true');
    expect(gestionTab).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', gestionTab.id);
    expect(screen.getByText('Contenido gestión')).toBeInTheDocument();
  });

  it('expone el estado de carga de la pestaña activa', () => {
    render(<ExpedienteTabsContainer tabs={tabs} loadingTabId="gestion" />);

    fireEvent.click(screen.getByRole('tab', { name: /Gestión/ }));

    expect(screen.getByRole('tab', { name: /Gestión/ })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando gestión');
  });
});
