import { randomUUID } from 'node:crypto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BillingContractPolicyResponse, BillingPolicy } from '@iwana/shared';
import { BillingContractPolicy } from './BillingContractPolicy';

const mockContractPolicy = jest.fn();
const mockTenantPolicy = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      contractPolicy: (...args: unknown[]) => mockContractPolicy(...args),
      getPolicy: (...args: unknown[]) => mockTenantPolicy(...args),
      updateContractPolicy: (...args: unknown[]) => mockUpdate(...args),
    },
  };
});

const CONTRACT_ID = '44444444-4444-4444-8444-444444444444';

const CONTRACT_POLICY: BillingContractPolicyResponse['data'] = {
  contractId: CONTRACT_ID,
  periodTiming: null,
  generationLeadDays: null,
  paymentTermDays: null,
  graceDays: null,
  cutoffEnabled: null,
  firstPeriodMode: null,
  billingStartDate: null,
  updatedBy: null,
  updatedAt: null,
};

const TENANT_POLICY: BillingPolicy = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodTiming: 'ANTICIPADO',
  generationLeadDays: 3,
  cutoffMode: 'DIA_FIJO_CICLO',
  paymentTermDays: 14,
  graceDays: 1,
  cutoffEnabled: true,
  minimumUnpaidForCutoff: 0,
  prorationMethod: 'DIAS_REALES',
  firstPeriodMode: 'SEPARADO',
  automaticGeneration: false,
  approvalMode: 'BORRADOR',
  autoApplyCredit: true,
  generationHour: 6,
  documentPrefix: 'DC',
};

function renderPolicy() {
  return render(
    <BillingContractPolicy
      contractId={CONTRACT_ID}
      contractLabel="Internet hogar"
      canManage
      onClose={jest.fn()}
    />,
  );
}

// jsdom no expone crypto.randomUUID; la clave de idempotencia la necesita al guardar.
const originalUuid = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
  mockContractPolicy.mockResolvedValue(CONTRACT_POLICY);
  mockUpdate.mockResolvedValue(CONTRACT_POLICY);
});

afterEach(() => {
  if (originalUuid) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUuid);
  else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
});

describe('BillingContractPolicy: valores heredados (spec 2026-11-09 §4)', () => {
  it('CA-9: rotula cada campo heredable con el valor de la empresa', async () => {
    mockTenantPolicy.mockResolvedValue(TENANT_POLICY);
    renderPolicy();

    expect(
      await screen.findByRole('option', { name: 'Heredar de la empresa: Cobro anticipado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Heredar de la empresa: Habilitado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Heredar de la empresa: Documento inicial separado' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Plazo para pagar (días)')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa (14 días).',
    );
    expect(screen.getByLabelText('Días de gracia tras vencimiento')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa (1 día).',
    );
    expect(screen.getByLabelText('Días de anticipación para generar')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa (3 días).',
    );
    expect(screen.getByLabelText('Fecha de inicio de cobro')).toHaveAccessibleDescription(
      'Vacía: el cobro empieza en la fecha de activación del servicio.',
    );
  });

  it('CA-10: si la empresa no responde, vuelve a «Heredar», avisa y deja guardar', async () => {
    const user = userEvent.setup();
    mockTenantPolicy.mockRejectedValue(new Error('caída'));
    renderPolicy();

    expect(
      await screen.findByText('No fue posible consultar los valores de la empresa'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: 'Heredar' })).toHaveLength(3);
    expect(screen.getByLabelText('Plazo para pagar (días)')).toHaveAccessibleDescription(
      'Vacío: se usa el valor de la empresa.',
    );
    await user.type(screen.getByLabelText('Plazo para pagar (días)'), '20');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  });
});
