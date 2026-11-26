import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { AuditSummary } from './AuditSummary';
import type { SummaryEntry } from './AuditSummary';

const now = new Date().toISOString();

function entry(partial: Partial<SummaryEntry> & { id: string; action: string }): SummaryEntry {
  return {
    entityType: 'User',
    entityId: 'e1',
    userId: 'u1',
    actor: { id: 'u1', type: 'platform', displayName: 'Ana' },
    ipAddress: null,
    oldValue: null,
    newValue: null,
    createdAt: now,
    ...partial,
  };
}

describe('AuditSummary', () => {
  it('CA-AUD-01: ventana en palabras y labels de producto', () => {
    render(
      <AuditSummary
        entries={[entry({ id: '1', action: 'LOGIN_FAILED' })]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Últimas 24 h' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Últimos 7 días' })).toBeInTheDocument();
    expect(screen.getByText('Cambios críticos')).toBeInTheDocument();
    expect(screen.getByText('Accesos')).toBeInTheDocument();
    expect(screen.getByText('Acceso y seguridad')).toBeInTheDocument();
    expect(screen.getByText('Empresas con cambios')).toBeInTheDocument();

    expect(screen.queryByText('24h')).not.toBeInTheDocument();
    expect(screen.queryByText('7d')).not.toBeInTheDocument();
    expect(screen.queryByText('Top actores')).not.toBeInTheDocument();
    expect(screen.queryByText('Eventos críticos')).not.toBeInTheDocument();
  });

  it('compara empresas únicas con las del periodo anterior', () => {
    const previousDate = new Date(Date.now() - 30 * 60 * 60_000).toISOString();
    const currentCompanies = ['company-1', 'company-2'].map((entityId) =>
      entry({ id: entityId, action: 'UPDATE', entityType: 'Tenant', entityId }),
    );
    render(
      <AuditSummary
        entries={[
          ...currentCompanies,
          entry({
            id: 'previous',
            action: 'UPDATE',
            entityType: 'Tenant',
            entityId: 'company-1',
            createdAt: previousDate,
          }),
        ]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={jest.fn()}
      />,
    );
    expect(screen.getByText('1 más que en las 24 h anteriores')).toHaveClass('text-gray-600');
  });

  it('declara la muestra incompleta y omite las comparaciones sin cobertura', () => {
    render(
      <AuditSummary
        entries={[entry({ id: '1', action: 'LOGIN' })]}
        hasMore
        isLoading={false}
        mode="platform"
        window="7d"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/La muestra no cubre todo el periodo anterior/)).toBeInTheDocument();
    expect(screen.queryByText(/que en los 7 días anteriores/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Sin actividad en la muestra').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sin actividad en esta ventana')).not.toBeInTheDocument();
  });

  it('permite reintentar el resumen sin mostrar cifras cuando falla', () => {
    const onRetry = jest.fn();
    render(
      <AuditSummary
        entries={[]}
        hasError
        onRetry={onRetry}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el resumen de cambios.');
    expect(screen.queryByText('Cambios críticos')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('CA-AUD-07: ventana temporal usa min-h-11', () => {
    render(
      <AuditSummary
        entries={[]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Últimas 24 h' }).className).toMatch(/min-h-11/);
    expect(screen.getByRole('button', { name: 'Últimos 7 días' }).className).toMatch(/min-h-11/);
  });

  it('CA-FR-01: clic Ver críticos emite preset critical', () => {
    const onPresetChange = jest.fn();
    render(
      <AuditSummary
        entries={[entry({ id: '1', action: 'DELETE' })]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={onPresetChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ver críticos/ }));
    expect(onPresetChange).toHaveBeenCalledWith('critical');
  });

  it('CA-FR-03: segundo clic en la misma tarjeta quita el preset', () => {
    const onPresetChange = jest.fn();
    render(
      <AuditSummary
        entries={[entry({ id: '1', action: 'DELETE' })]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset="critical"
        onPresetChange={onPresetChange}
      />,
    );

    const cta = screen.getByRole('button', { name: /Ver críticos/ });
    expect(cta).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(cta);
    expect(onPresetChange).toHaveBeenCalledWith(null);
  });

  it('CA-FR-04: clic en otra tarjeta cambia el preset (no acumula)', () => {
    const onPresetChange = jest.fn();
    render(
      <AuditSummary
        entries={[entry({ id: '1', action: 'DELETE' }), entry({ id: '2', action: 'LOGIN' })]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset="critical"
        onPresetChange={onPresetChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Ver accesos/ }));
    expect(onPresetChange).toHaveBeenCalledWith('access');
  });

  it('CA-FR-05: cifra 0 no es interactiva', () => {
    render(
      <AuditSummary
        entries={[]}
        isLoading={false}
        mode="platform"
        window="24h"
        onWindowChange={jest.fn()}
        activePreset={null}
        onPresetChange={jest.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Ver críticos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver accesos/ })).not.toBeInTheDocument();
  });
});
