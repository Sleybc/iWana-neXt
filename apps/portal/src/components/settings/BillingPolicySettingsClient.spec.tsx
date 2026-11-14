import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingPolicy, BillingPolicyPreview } from '@iwana/shared';
import { BillingPolicySettingsClient } from './BillingPolicySettingsClient';

const mockGetPolicy = jest.fn();
const mockUpdatePolicy = jest.fn();
const mockPreviewPolicy = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      getPolicy: (...args: unknown[]) => mockGetPolicy(...args),
      updatePolicy: (...args: unknown[]) => mockUpdatePolicy(...args),
      preview: (...args: unknown[]) => mockPreviewPolicy(...args),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: () => true,
      });
  })(),
}));

const POLICY: BillingPolicy = {
  tenantId: '6a56d37e-0c44-47fb-9cf2-b7d3b615b2c7',
  periodTiming: 'ANTICIPADO',
  generationLeadDays: 0,
  cutoffMode: 'DIA_FIJO_CICLO',
  paymentTermDays: 14,
  graceDays: 0,
  cutoffEnabled: true,
  minimumUnpaidForCutoff: 0,
  prorationMethod: 'DIAS_REALES',
  firstPeriodMode: 'SEPARADO',
  automaticGeneration: false,
  approvalMode: 'BORRADOR',
  autoApplyCredit: true,
  generationHour: 6,
  documentPrefix: 'DC',
  updatedAt: '2026-10-31T18:15:30.123456Z',
};

const PREVIEW: BillingPolicyPreview = {
  cycles: [
    {
      cycleDay: 1,
      cutoffDay: 10,
      items: [
        {
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
          generationDate: '2026-10-28',
          dueDate: '2026-11-10',
          cutoffDate: '2026-11-11',
        },
        {
          periodStart: '2026-12-01',
          periodEnd: '2026-12-31',
          generationDate: '2026-11-27',
          dueDate: '2026-12-10',
          cutoffDate: '2026-12-11',
        },
        {
          periodStart: '2027-01-01',
          periodEnd: '2027-01-31',
          generationDate: '2026-12-28',
          dueDate: '2027-01-10',
          cutoffDate: null,
        },
      ],
    },
  ],
};

describe('BillingPolicySettingsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPolicy.mockResolvedValue(POLICY);
    mockUpdatePolicy.mockImplementation(async (input: unknown) => ({
      ...POLICY,
      ...(input as Record<string, unknown>),
      updatedAt: '2026-11-01T19:10:00.654321Z',
    }));
    mockPreviewPolicy.mockResolvedValue(PREVIEW);
  });

  it('carga la política y muestra las fechas que devuelve el servidor por ciclo', async () => {
    render(<BillingPolicySettingsClient />);

    expect(await screen.findByText('Ciclo día 1 · corte día 10')).toBeInTheDocument();
    expect(screen.getByText('2026-11-01 a 2026-11-30')).toBeInTheDocument();
    expect(screen.getByText('No programado')).toBeInTheDocument();
    expect(
      screen.getByText('Fechas calculadas según la zona horaria configurada para esta empresa.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockPreviewPolicy).toHaveBeenCalledTimes(1));
    expect(mockPreviewPolicy).toHaveBeenCalledWith({
      policy: {
        periodTiming: 'ANTICIPADO',
        generationLeadDays: 0,
        cutoffMode: 'DIA_FIJO_CICLO',
        paymentTermDays: 14,
        graceDays: 0,
        cutoffEnabled: true,
      },
    });
  });

  it('deshabilita el corte fijo y no solicita vista previa para una combinación incompatible', async () => {
    const user = userEvent.setup();
    render(<BillingPolicySettingsClient />);

    await screen.findByText('Ciclo día 1 · corte día 10');
    mockPreviewPolicy.mockClear();
    await user.selectOptions(screen.getByLabelText('Momento del cobro'), 'VENCIDO');

    expect(screen.getByRole('option', { name: 'Corte en día fijo del ciclo' })).toBeDisabled();
    expect(screen.getByText(/El corte en día fijo solo es compatible/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await waitFor(() => expect(mockPreviewPolicy).not.toHaveBeenCalled());
  });

  it('envía expectedUpdatedAt y recarga los valores vigentes cuando recibe 409', async () => {
    const user = userEvent.setup();
    const latestPolicy = {
      ...POLICY,
      documentPrefix: 'NW',
      updatedAt: '2026-11-01T19:10:00.654321Z',
    };
    mockGetPolicy.mockResolvedValueOnce(POLICY).mockResolvedValueOnce(latestPolicy);
    const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
    mockUpdatePolicy.mockRejectedValue(
      new actual.ApiError(409, 'BILLING_POLICY_CHANGED', 'Conflict'),
    );
    render(<BillingPolicySettingsClient />);

    await screen.findByText('Ciclo día 1 · corte día 10');
    const prefix = screen.getByLabelText('Prefijo de las facturas');
    await user.clear(prefix);
    await user.type(prefix, 'OLD');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText(/La política fue modificada recientemente por otro usuario/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Prefijo de las facturas')).toHaveValue('NW');
    expect(mockUpdatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        documentPrefix: 'OLD',
        expectedUpdatedAt: '2026-10-31T18:15:30.123456Z',
      }),
    );
    expect(mockGetPolicy).toHaveBeenCalledTimes(2);
  });
});
