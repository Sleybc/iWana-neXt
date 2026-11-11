// Cierre de venta fase 2 · bloque F (spec 2026-11-11 B, D-F2, CA-2, CA-3, CA-6). Datos ficticios.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONTRACT_AUTO_CREATION_MISSING_FIELDS, type BillingPolicyPreview } from '@iwana/shared';
import type { Contract } from '@/lib/api-client';
import { billingApi, commercialApi } from '@/lib/api-client';
import {
  CONTRACT_AUTO_CREATION_FIELD_LABELS,
  ContractAutoCreationIssueNotice,
  contractAutoCreationCompletionTab,
} from './contract-auto-creation-ui';
import { ContractCard } from './ContractCard';
import { ContractDetailView } from './ContractDetailDrawer';
import { FirstChargePreview } from './FirstChargePreview';

jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () => (ctx ??= { hasPermission: () => true });
  })(),
}));

const CONTRACT: Contract = {
  id: 'contract-1',
  tenantId: 'tenant-1',
  quoteId: null,
  subscriberId: 'sub-1',
  planId: 'plan-1',
  planSnapshotJson: { name: 'Plan Ficticio', downloadSpeedMbps: 100, uploadSpeedMbps: 50 },
  status: 'DRAFT',
  statusReasonCode: null,
  statusChangedAt: null,
  titularAnonymizedAt: null,
  alias: 'Sede ficticia',
  installationAddress: 'Calle Ficticia 1',
  installationCity: 'Bogotá',
  installationDepartment: 'Cundinamarca',
  installationPostalCode: null,
  installationNotes: null,
  customerSegment: null,
  serviceUsage: null,
  installationStratum: null,
  stratumEvidenceMediaId: null,
  vatSnapshot: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  paymentMethod: null,
  billingCycleDay: null,
  billingCycle: null,
  fiscalName: null,
  fiscalDocument: null,
  fiscalAddress: null,
  startDate: null,
  endDate: null,
  createdAt: '2026-11-11T10:00:00.000Z',
  updatedAt: '2026-11-11T10:00:00.000Z',
  deletedAt: null,
};

afterEach(() => jest.restoreAllMocks());

describe('aviso «No se pudo crear el contrato automáticamente» (CA-3, D-F2)', () => {
  it('tiene una etiqueta en español para cada código, sin enums crudos', () => {
    for (const field of CONTRACT_AUTO_CREATION_MISSING_FIELDS) {
      const label = CONTRACT_AUTO_CREATION_FIELD_LABELS[field];
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/_/);
    }
  });

  it('lista lo que falta y ofrece completar datos y crear el contrato a mano', async () => {
    const user = userEvent.setup();
    const onCompleteData = jest.fn();
    render(
      <ContractAutoCreationIssueNotice
        issue={{
          reason: 'MISSING_DATA',
          missing: ['INSTALLATION_ADDRESS', 'VAT_RESPONSIBILITY'],
          detectedAt: '2026-11-11T10:00:00.000Z',
        }}
        onCompleteData={onCompleteData}
        createContractHref="/dashboard/crm/subscribers/sub-1/services/new"
      />,
    );

    expect(screen.getByText('No se pudo crear el contrato automáticamente')).toBeInTheDocument();
    // Encabezado compacto de la ficha (CA-7): los faltantes quedan plegados hasta abrirlos.
    const summary = screen.getByText('Ver qué falta para el contrato (2)', { exact: true });
    const disclosure = summary.closest('details');
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute('open');
    await user.click(summary);
    expect(disclosure).toHaveAttribute('open');
    const list = screen.getByRole('list', { name: 'Datos que faltan para el contrato' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Dirección del punto de servicio', 'Responsabilidad de IVA']);
    await user.click(screen.getByRole('button', { name: 'Completar datos' }));
    expect(onCompleteData).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Crear contrato' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/sub-1/services/new',
    );
  });

  it('sin permiso de alta no ofrece «Crear contrato»', () => {
    render(
      <ContractAutoCreationIssueNotice
        issue={{ reason: 'MISSING_DATA', missing: ['PLAN'], detectedAt: '2026-11-11T10:00:00Z' }}
        onCompleteData={jest.fn()}
        createContractHref={null}
      />,
    );
    expect(screen.queryByRole('link', { name: 'Crear contrato' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Completar datos' })).toBeInTheDocument();
  });

  it('lleva a Tributario si falta IVA o RUT y a Datos en el resto', () => {
    expect(
      contractAutoCreationCompletionTab(['NIT_VERIFICATION_DIGIT', 'RUT_RESPONSIBILITIES']),
    ).toBe('tributario');
    expect(contractAutoCreationCompletionTab(['LEGAL_REPRESENTATIVE', 'PLAN'])).toBe('datos');
  });
});

describe('tarjeta de servicio sin ciclo de facturación (CA-2)', () => {
  beforeEach(() => {
    jest
      .spyOn(commercialApi, 'getPlanById')
      .mockResolvedValue({} as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
  });

  it('muestra «Falta ciclo de facturación» con el motivo', () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, billingCycleMissing: true }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(screen.getByText('Falta ciclo de facturación')).toBeInTheDocument();
    expect(
      screen.getByText('Asigna el ciclo de facturación del contrato antes de firmarlo.'),
    ).toBeInTheDocument();
  });

  it('no muestra el aviso si el contrato tiene ciclo', () => {
    render(
      <ContractCard
        contract={{ ...CONTRACT, billingCycleDay: 15, billingCycleMissing: false }}
        onTransition={jest.fn()}
        onRemove={jest.fn()}
        onViewDetail={jest.fn()}
      />,
    );
    expect(screen.queryByText('Falta ciclo de facturación')).toBeNull();
  });
});

describe('vista previa del alta con la instalación congelada (CA-6)', () => {
  const PREVIEW = {
    cycles: [
      {
        cycleDay: 15,
        cutoffDay: 20,
        items: [
          {
            periodStart: '2026-11-15',
            periodEnd: '2026-12-14',
            generationDate: '2026-11-10',
            dueDate: '2026-11-25',
            cutoffDate: '2026-11-30',
          },
        ],
      },
    ],
  } as unknown as BillingPolicyPreview;
  const PLAN = { basePrice: 60000, currentPrice: null, installationFee: 90000 };

  beforeEach(() => {
    jest.spyOn(billingApi, 'preview').mockResolvedValue(PREVIEW);
  });

  async function installationValue() {
    await screen.findByText('Valor mensual');
    return screen.queryByText('Instalación')?.parentElement?.textContent ?? null;
  }

  it('sin contrato usa el cargo del catálogo', async () => {
    render(<FirstChargePreview plan={PLAN} billingCycleDay={15} />);
    expect(await installationValue()).toMatch(/90[.,]000/);
  });

  it('con el contrato creado usa el cargo congelado y no el del catálogo', async () => {
    render(
      <FirstChargePreview plan={PLAN} billingCycleDay={15} contractInstallationFee={120000} />,
    );
    const value = await installationValue();
    expect(value).toMatch(/120[.,]000/);
    expect(value).not.toMatch(/90[.,]000/);
  });

  it('con el contrato creado sin cargo congelado no muestra instalación', async () => {
    render(<FirstChargePreview plan={PLAN} billingCycleDay={15} contractInstallationFee={null} />);
    await waitFor(() => expect(screen.getByText('Valor mensual')).toBeInTheDocument());
    expect(screen.queryByText('Instalación')).toBeNull();
  });
});

describe('detalle del contrato (CA-2, CA-6)', () => {
  beforeEach(() => {
    jest
      .spyOn(commercialApi, 'getPlanById')
      .mockResolvedValue({} as Awaited<ReturnType<typeof commercialApi.getPlanById>>);
  });

  it('muestra «Falta ciclo de facturación» y la instalación congelada', async () => {
    render(
      <ContractDetailView
        layout="page"
        contract={{ ...CONTRACT, billingCycleMissing: true, installationFee: 120000 }}
        onReload={jest.fn()}
      />,
    );
    expect(await screen.findByText('Falta ciclo de facturación')).toBeInTheDocument();
    const installation = screen.getByText('Instalación').parentElement?.textContent ?? '';
    expect(installation).toMatch(/120[.,]000/);
  });
});
