import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { auditActionLabel, auditEntityTypeLabel, auditFeedSummary } from '@/lib/audit-vocabulary';
import { RecentActivityPanel, resolveAuditEntityHref } from './RecentActivityPanel';
import type { AuditLogEntry } from '@/lib/api-client';

jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: '1',
    tenantId: 't-1',
    userId: 'u-1',
    actor: {
      id: 'u-1',
      type: 'tenant',
      displayName: 'Ana Operaciones',
    },
    action: 'MFA_ENABLED',
    entityType: 'User',
    entityId: 'u-1',
    oldValue: { secret: 'should-not-render' },
    newValue: { secret: 'should-not-render-either' },
    ipAddress: '203.0.113.10',
    userAgent: 'Mozilla/5.0 Sensitive',
    requestId: 'req-sensitive-001',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('RecentActivityPanel', () => {
  it('expone el estado de carga con un rol ARIA válido', () => {
    render(<RecentActivityPanel status="loading" />);

    expect(screen.getByRole('status', { name: 'Cargando historial' })).toBeInTheDocument();
  });

  it('traduce action y entityType a vocabulario amigable', () => {
    render(<RecentActivityPanel entries={[entry()]} status="success" />);

    expect(screen.getByText('Verificación en dos pasos activada · usuario')).toBeInTheDocument();
    expect(screen.queryByText('MFA_ENABLED')).not.toBeInTheDocument();
    expect(screen.queryByText(/\ben User\b/)).not.toBeInTheDocument();
  });

  it('muestra actor displayName y tiempo sin dumps sensibles (C-13 / SEC)', () => {
    render(<RecentActivityPanel entries={[entry()]} status="success" />);

    expect(screen.getByText('Ana Operaciones')).toBeInTheDocument();
    expect(screen.queryByText(/should-not-render/)).not.toBeInTheDocument();
    expect(screen.queryByText('203.0.113.10')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mozilla\/5\.0 Sensitive/)).not.toBeInTheDocument();
    expect(screen.queryByText('req-sensitive-001')).not.toBeInTheDocument();
    expect(screen.queryByText(/ver todo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /export/i })).not.toBeInTheDocument();
  });

  it('vacío no agrega una acción fuera del historial', () => {
    render(<RecentActivityPanel entries={[]} status="success" />);

    expect(screen.getByText('Sin cambios recientes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ir a configuración/i })).not.toBeInTheDocument();
  });

  it('minimizado (AUDITOR) no ofrece configuración ni «ver todo»', () => {
    render(<RecentActivityPanel entries={[]} status="success" minimized />);

    expect(screen.getByText('Sin cambios recientes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ir a configuración/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ver todo/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

  it('error ofrece reintento por bloque (datos del padre)', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();

    const { rerender } = render(
      <RecentActivityPanel entries={[]} status="error" error="Fallo de red" onRetry={onRetry} />,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<RecentActivityPanel entries={[]} status="success" onRetry={onRetry} />);
    await waitFor(() => {
      expect(screen.getByText('Sin cambios recientes')).toBeInTheDocument();
    });
  });

  it('muestra actualización y el mensaje de error predeterminado sin callback', () => {
    const { rerender } = render(<RecentActivityPanel entries={[]} status="updating" />);
    expect(screen.getByText('Actualizando')).toBeInTheDocument();

    rerender(<RecentActivityPanel status="error" />);
    expect(screen.getByText('No pudimos cargar el historial')).toBeInTheDocument();
    expect(screen.getByText(/Reintenta en unos minutos/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reintentar/i })).not.toBeInTheDocument();
  });

  it('presenta tiempos relativos, fecha inválida y omite actor vacío', () => {
    const now = Date.now();
    render(
      <RecentActivityPanel
        status="success"
        entries={[
          entry({ id: 'invalid', createdAt: 'not-a-date', actor: null }),
          entry({ id: 'minutes', createdAt: new Date(now - 30 * 60 * 1000).toISOString() }),
          entry({ id: 'hours', createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() }),
          entry({ id: 'days', createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() }),
        ]}
      />,
    );

    expect(screen.getByText('reciente')).toBeInTheDocument();
    expect(screen.getByText('hace 30 min')).toBeInTheDocument();
    expect(screen.getByText('hace 2h')).toBeInTheDocument();
    expect(screen.getByText('hace 2d')).toBeInTheDocument();
    expect(screen.getAllByText('Ana Operaciones')).toHaveLength(3);

    const times = screen.getAllByRole('time');
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times[0]).toHaveClass('font-mono');
    expect(times[0]).toHaveClass('tabular-nums');
  });

  it('enlaza solo entityTypes con ruta de detalle existente (C-12)', () => {
    render(
      <RecentActivityPanel
        status="success"
        entries={[
          entry({
            id: 'e1',
            action: 'UPDATE',
            entityType: 'Expediente',
            entityId: 'exp-1',
          }),
          entry({
            id: 'e2',
            action: 'UPDATE',
            entityType: 'User',
            entityId: 'u-9',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /Actualización · oportunidad/i })).toHaveAttribute(
      'href',
      '/dashboard/crm/expedientes/exp-1',
    );
    expect(screen.getByText('Actualización · usuario')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Actualización · usuario/i }),
    ).not.toBeInTheDocument();
  });

  it('helpers de vocabulario y deep link cubren enums frecuentes', () => {
    expect(auditActionLabel('CREATE')).toBe('Creación');
    expect(auditActionLabel('UNKNOWN_X')).toBe('Cambio registrado');
    expect(auditEntityTypeLabel('AccessProfile')).toBe('perfil de acceso');
    expect(auditEntityTypeLabel('FooBar')).toBe('');
    expect(resolveAuditEntityHref('Subscriber', 'sub-1')).toBe('/dashboard/crm/subscribers/sub-1');
    expect(auditEntityTypeLabel('ExpedienteRecord')).toBe('oportunidad');
    expect(resolveAuditEntityHref('ExpedienteRecord', 'exp-2')).toBe(
      '/dashboard/crm/expedientes/exp-2',
    );
    expect(resolveAuditEntityHref('InventoryItem', 'inv-1')).toBeNull();
    expect(resolveAuditEntityHref('Expediente', null)).toBeNull();
    expect(auditFeedSummary('LOGIN', 'User')).toBe('Inicio de sesión');
    expect(auditFeedSummary('CREATE', 'FooBar')).toBe('Creación');
    expect(auditFeedSummary('UPDATE', 'User')).toBe('Actualización · usuario');
  });
});
