import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuditLogsTable } from './AuditLogsTable';
import type { BaseAuditEntry } from './AuditLogsTable';

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual('@iwana/ui');
  return {
    ...actual,
    DatePicker: ({
      id,
      onChange,
      placeholder,
    }: {
      id?: string;
      onChange: (date: Date | undefined) => void;
      placeholder?: string;
    }) => (
      <button type="button" id={id} onClick={() => onChange(new Date(2026, 0, 1))}>
        {placeholder}
      </button>
    ),
    Select: ({
      id,
      options,
      value,
      onChange,
      'aria-label': ariaLabel,
    }: {
      id?: string;
      options: Array<{ value: string; label: string }>;
      value: string;
      onChange: (e: { target: { value: string } }) => void;
      'aria-label'?: string;
    }) => (
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ),
  };
});

const sampleEntry: BaseAuditEntry = {
  id: 'log-1',
  action: 'LOGIN',
  entityType: 'User',
  entityId: 'user-1',
  userId: 'user-1',
  actor: {
    id: 'user-1',
    type: 'platform',
    displayName: 'Ana Admin',
  },
  ipAddress: '203.0.113.10',
  userAgent: 'Mozilla/5.0 Chrome/120',
  requestId: 'req-1',
  oldValue: null,
  newValue: null,
  createdAt: '2026-08-11T12:00:00.000Z',
};

const baseProps = {
  entries: [sampleEntry],
  isLoading: false,
  hasNextPage: false,
  hasPrevPage: false,
  onNext: jest.fn(),
  onPrev: jest.fn(),
  viewMode: 'basic' as const,
  onViewModeChange: jest.fn(),
  pageIndex: 1,
  pageSize: 10,
  onPageSizeChange: jest.fn(),
};

describe('AuditLogsTable', () => {
  it('CA-AUD-01: chrome Lectura sin Técnico, CSV, Metadata técnica', () => {
    render(<AuditLogsTable {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Lectura', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detalle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeInTheDocument();

    expect(screen.queryByText('Técnico')).not.toBeInTheDocument();
    expect(screen.queryByText('Básico')).not.toBeInTheDocument();
    expect(screen.queryByText(/CSV/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Metadata técnica')).not.toBeInTheDocument();
    expect(screen.queryByText('Actor')).not.toBeInTheDocument();
  });

  it('CA-AUD-07: 0 tr[role=button]', () => {
    const { container } = render(<AuditLogsTable {...baseProps} />);
    expect(container.querySelectorAll('tr[role="button"]')).toHaveLength(0);
  });

  it('CA-AUD-10: IP y Timestamp UTC ausentes en Lectura colapsada', () => {
    render(<AuditLogsTable {...baseProps} />);

    expect(screen.queryByText(/IP:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Timestamp UTC')).not.toBeInTheDocument();
    expect(screen.queryByText('203.0.113.10')).not.toBeInTheDocument();
  });

  it('CA-AUD-05: Descargar y error canónico de export', async () => {
    const onExportCsv = jest.fn().mockRejectedValue(new Error('fail'));
    render(<AuditLogsTable {...baseProps} onExportCsv={onExportCsv} />);

    fireEvent.click(screen.getByRole('button', { name: 'Descargar' }));

    await waitFor(() => {
      expect(
        screen.getByText('No pudimos descargar el archivo. Reintenta en unos minutos.'),
      ).toBeInTheDocument();
    });
  });

  it('empty park vs empty filtro', () => {
    const { rerender } = render(<AuditLogsTable {...baseProps} entries={[]} />);
    expect(screen.getByText('Sin actividad registrada')).toBeInTheDocument();

    rerender(
      <AuditLogsTable
        {...baseProps}
        entries={[]}
        actionFilter="LOGIN"
        onActionFilterChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Sin cambios con estos filtros')).toBeInTheDocument();
  });

  it('CA-FR-07: empty preset distinto de empty park y empty filtro', () => {
    render(<AuditLogsTable {...baseProps} entries={[]} emptySummaryPreset />);

    expect(
      screen.getByText('Sin cambios en el lote del resumen con este filtro'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Quita el filtro del resumen para ver todos los cambios.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sin actividad registrada')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin cambios con estos filtros')).not.toBeInTheDocument();
  });

  it('con summaryPresetActive oculta Anterior/Siguiente y tamaño de página', () => {
    render(<AuditLogsTable {...baseProps} hasNextPage hasPrevPage summaryPresetActive />);

    expect(screen.queryByRole('button', { name: /Anterior/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Siguiente/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cambios por página')).not.toBeInTheDocument();
  });
});
