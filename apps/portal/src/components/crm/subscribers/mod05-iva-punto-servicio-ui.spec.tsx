import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import {
  PersonType,
  ServiceUsage,
  TaxAssignmentRateSource,
  TaxAssignmentStatus,
  TaxCategory,
  TaxProfileStatus,
  VatResponsibility,
  TaxTreatment,
  VatLegalBasis,
  VatTreatment,
} from '@iwana/shared';
import type {
  Contract,
  Subscriber360Response,
  SubscriberTaxProfileSnapshot,
} from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { TaxProfileBlock } from './TaxProfileBlock';
import { VatTreatmentBanner } from './VatTreatmentBanner';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog, ServicePointFields } from './CreateContractDialog';
import { SubscriberTabsContainer } from './SubscriberTabsContainer';

const mockCreateForSubscriber = jest.fn();
const mockCreateFromExpediente = jest.fn();
const mockUpdateServicePoint = jest.fn();
const mockUpdateContract = jest.fn();
const mockUploadStratumEvidence = jest.fn();
const mockDeleteStratumEvidence = jest.fn();
const mockGetTaxProfile = jest.fn();
const mockSuggestVat = jest.fn();

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return {
    ...actual,
    contractsApi: {
      ...actual.contractsApi,
      createForSubscriber: (...args: unknown[]) => mockCreateForSubscriber(...args),
      createFromExpediente: (...args: unknown[]) => mockCreateFromExpediente(...args),
      update: (...args: unknown[]) => mockUpdateContract(...args),
      updateServicePoint: (...args: unknown[]) => mockUpdateServicePoint(...args),
      uploadStratumEvidence: (...args: unknown[]) => mockUploadStratumEvidence(...args),
      deleteStratumEvidence: (...args: unknown[]) => mockDeleteStratumEvidence(...args),
    },
    subscriberTaxApi: {
      ...actual.subscriberTaxApi,
      getProfile: (...args: unknown[]) => mockGetTaxProfile(...args),
      suggestVat: (...args: unknown[]) => mockSuggestVat(...args),
    },
  };
});

const EXPEDIENTE_SUMMARY = {
  id: 'exp-1',
  fullName: 'Ana Ruiz',
  status: 'QUALIFIED',
  source: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  statusChangedAt: null,
  paymentMethod: null,
  billingCycle: null,
  fiscalName: null,
  interestedPlanId: null,
  additionalProductIds: [],
  additionalServiceIds: [],
  commercialNotes: null,
} satisfies NonNullable<Subscriber360Response['expedienteSummary']>;

function servicePointHarness(personType = PersonType.NATURAL) {
  function Harness() {
    const [serviceUsage, setServiceUsage] = useState<ServiceUsage | ''>('');
    const [installationStratum, setInstallationStratum] = useState('');
    const hasEvidence = false;
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    return (
      <>
        <ServicePointFields
          personType={personType}
          serviceUsage={serviceUsage}
          onServiceUsageChange={setServiceUsage}
          installationStratum={installationStratum}
          onInstallationStratumChange={setInstallationStratum}
          hasStratumEvidence={hasEvidence}
          pendingEvidenceFile={pendingFile}
          onPendingEvidenceFileChange={setPendingFile}
        />
        <button type="button">Guardar borrador</button>
        <output>{serviceUsage || 'Uso pendiente'}</output>
      </>
    );
  }
  return <Harness />;
}

async function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

function contractFixture(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    tenantId: 'tenant-1',
    quoteId: null,
    subscriberId: 'sub-1',
    planId: 'plan-1',
    planSnapshotJson: { name: 'Fibra 300' },
    status: 'ACTIVE',
    statusReasonCode: null,
    statusChangedAt: null,
    titularAnonymizedAt: null,
    alias: 'Sede principal',
    installationAddress: 'Calle 1 # 2-3',
    installationCity: 'Bogotá',
    installationDepartment: 'Cundinamarca',
    installationPostalCode: '110111',
    installationNotes: null,
    customerSegment: null,
    serviceUsage: null,
    installationStratum: null,
    stratumEvidenceMediaId: null,
    vatSnapshot: null,
    additionalProductIds: [],
    additionalServiceIds: [],
    paymentMethod: 'PSE',
    billingCycle: 'Mensual',
    fiscalName: null,
    fiscalDocument: null,
    fiscalAddress: null,
    startDate: null,
    endDate: null,
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-12T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function renderDrawer(contract = contractFixture()) {
  return render(
    <ContractDetailDrawer
      contract={contract}
      onClose={jest.fn()}
      onReload={jest.fn(async () => undefined)}
    />,
  );
}

describe('MOD05 — criterios UX IVA por punto de servicio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateForSubscriber.mockResolvedValue(contractFixture({ status: 'DRAFT' }));
    mockCreateFromExpediente.mockResolvedValue(contractFixture({ status: 'DRAFT' }));
    mockUpdateContract.mockImplementation(async (_id: string, payload: Partial<Contract>) =>
      contractFixture({ ...payload, status: 'DRAFT' }),
    );
    mockUploadStratumEvidence.mockResolvedValue(
      contractFixture({ status: 'DRAFT', stratumEvidenceMediaId: 'private-id' }),
    );
    mockDeleteStratumEvidence.mockResolvedValue(
      contractFixture({ status: 'DRAFT', stratumEvidenceMediaId: null }),
    );
    mockUpdateServicePoint.mockImplementation(async (_id: string, payload: Partial<Contract>) =>
      contractFixture({
        ...payload,
        status: 'ACTIVE',
        vatSnapshot: {
          treatment: VatTreatment.EXCLUDED,
          legalBasis: VatLegalBasis.ET_476_7,
          ratePercent: 0,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-12T12:00:00.000Z',
        },
      }),
    );
  });

  it('CA-UX-IVA-01 explica el uso en creación y ofrece etiquetas de negocio', async () => {
    render(
      <CreateContractDialog
        subscriberId="sub-1"
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    expect(
      screen.getByText(
        'El uso del predio determina el tratamiento de IVA de este contrato. Si allí también funciona un negocio, selecciona No residencial mientras el contador no indique otra clasificación.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    const residentialOptions = await screen.findAllByRole('option', { name: 'Residencial' });
    expect(residentialOptions.length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'No residencial' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('RESIDENTIAL')).not.toBeInTheDocument();
  });

  it('CA-UX-IVA-02 deja en blanco los datos que el expediente no conoce', () => {
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="sub-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Uso del servicio' })).toHaveTextContent(
      'Selecciona el uso',
    );
    expect(
      screen.queryByRole('combobox', { name: 'Estrato del predio de instalación' }),
    ).toBeNull();
  });

  it('CA-UX-IVA-03 permite guardar un borrador de conversión con uso pendiente', async () => {
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="sub-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    expect(
      screen.getByText(/Puedes dejarlo pendiente si aún no conoces el uso/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convertir a contrato' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));
    await waitFor(() => expect(mockCreateFromExpediente).toHaveBeenCalled());
    expect(mockCreateFromExpediente.mock.calls[0]?.[1]).not.toHaveProperty('serviceUsage');
  });

  it('CA-UX-IVA-04 muestra estrato solo para uso residencial y lo oculta para no residencial', async () => {
    render(servicePointHarness());
    await selectOption('Uso del servicio', 'Residencial');
    expect(
      screen.getByRole('combobox', { name: 'Estrato del predio de instalación' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    fireEvent.click(await screen.findByRole('option', { name: 'No residencial' }));
    expect(
      screen.queryByRole('combobox', { name: 'Estrato del predio de instalación' }),
    ).toBeNull();
  });

  it('CA-UX-IVA-05 deshabilita residencial a persona jurídica y explica el motivo', async () => {
    render(servicePointHarness(PersonType.JURIDICA));
    expect(
      screen.getByText(
        'Las personas jurídicas no pueden registrar un servicio como residencial. Selecciona No residencial.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('combobox', { name: 'Uso del servicio' }));
    expect(await screen.findByRole('option', { name: 'Residencial' })).toBeDisabled();
  });

  it('CA-UX-IVA-06 pide soporte solo para estratos residenciales 1 a 3', async () => {
    render(servicePointHarness());
    await selectOption('Uso del servicio', 'Residencial');
    await selectOption('Estrato del predio de instalación', 'Estrato 2');
    const upload = screen.getByLabelText('Soporte del estrato') as HTMLInputElement;
    expect(upload.accept).toBe('application/pdf,image/jpeg,image/png,image/webp');
    expect(
      screen.getByText(
        'Adjunta un recibo de un servicio público o el certificado municipal de estratificación de la dirección de instalación. Formatos admitidos: PDF o imagen JPG, PNG o WEBP, hasta 10 MB.',
      ),
    ).toBeInTheDocument();
    await selectOption('Estrato del predio de instalación', 'Estrato 4');
    expect(screen.queryByLabelText('Soporte del estrato')).toBeNull();
  });

  it('CA-UX-IVA-07 avisa del 19 % por falta de soporte sin bloquear la conversión', async () => {
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="sub-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={jest.fn(async () => undefined)}
      />,
    );
    await selectOption('Uso del servicio', 'Residencial');
    await selectOption('Estrato del predio de instalación', 'Estrato 2');
    expect(
      screen.getByText('Sin soporte del estrato, a este servicio se le aplicará IVA del 19 %.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convertir a contrato' })).toBeEnabled();
  });

  it('CA-UX-IVA-08 carga el soporte en el contrato recién creado sin enviarlo en el cuerpo', async () => {
    const onSuccess = jest.fn(async () => undefined);
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="sub-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );
    await selectOption('Uso del servicio', 'Residencial');
    await selectOption('Estrato del predio de instalación', 'Estrato 2');
    const file = new File(['evidence'], 'receipt.png', { type: 'image/png' });
    const upload = screen.getByLabelText('Soporte del estrato') as HTMLInputElement;
    fireEvent.change(upload, { target: { files: [file] } });
    expect(mockUploadStratumEvidence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));
    await waitFor(() => expect(mockUploadStratumEvidence).toHaveBeenCalledWith('contract-1', file));
    expect(mockCreateFromExpediente).toHaveBeenCalledTimes(1);
    expect(mockCreateFromExpediente.mock.calls[0]?.[1]).not.toHaveProperty(
      'stratumEvidenceMediaId',
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Soporte cargado')).toBeInTheDocument();
    expect(screen.queryByText('private-id')).toBeNull();
    expect(screen.queryByText(/publicUrl|https?:/i)).toBeNull();
    expect(screen.getByLabelText('Reemplazar soporte')).toBeInTheDocument();
  });

  it('CA-UX-IVA-08 reemplaza el soporte del borrador con el endpoint del contrato', async () => {
    renderDrawer(
      contractFixture({
        status: 'DRAFT',
        titularAnonymizedAt: null,
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: 'existing-private-id',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    const file = new File(['replacement'], 'replacement.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Reemplazar soporte'), {
      target: { files: [file] },
    });
    expect(mockUploadStratumEvidence).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockUploadStratumEvidence).toHaveBeenCalledWith('contract-1', file));
    expect(mockUpdateContract.mock.calls[0]?.[1]).not.toHaveProperty('stratumEvidenceMediaId');
    expect(screen.getByText('Soporte cargado')).toBeInTheDocument();
  });

  it('CA-UX-IVA-08 quita el soporte mediante DELETE del contrato', async () => {
    renderDrawer(
      contractFixture({
        status: 'DRAFT',
        serviceUsage: ServiceUsage.RESIDENTIAL,
        installationStratum: 2,
        stratumEvidenceMediaId: 'existing-private-id',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar soporte' }));
    await waitFor(() => expect(mockDeleteStratumEvidence).toHaveBeenCalledWith('contract-1'));
    await waitFor(() => expect(screen.queryByText('Soporte cargado')).toBeNull());
  });

  it('CA-UX-IVA-08 conserva el borrador y ofrece reintentar cuando falla la carga', async () => {
    const onSuccess = jest.fn(async () => undefined);
    mockUploadStratumEvidence
      .mockRejectedValueOnce(new Error('network failure'))
      .mockResolvedValueOnce(
        contractFixture({ status: 'DRAFT', stratumEvidenceMediaId: 'private-id' }),
      );
    render(
      <ConvertExpedienteToContractDialog
        subscriberId="sub-1"
        expedienteSummary={EXPEDIENTE_SUMMARY}
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />,
    );
    await selectOption('Uso del servicio', 'Residencial');
    await selectOption('Estrato del predio de instalación', 'Estrato 2');
    const file = new File(['evidence'], 'receipt.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));
    expect(
      await screen.findByText('No se pudo cargar el soporte. Intenta de nuevo.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Convertir a contrato' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));
    await waitFor(() => expect(mockUploadStratumEvidence).toHaveBeenCalledTimes(2));
    expect(mockCreateFromExpediente).toHaveBeenCalledTimes(1);
    expect(mockUploadStratumEvidence).toHaveBeenLastCalledWith('contract-1', file);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('CA-UX-IVA-09 edita el punto de servicio en el formulario general del borrador', () => {
    renderDrawer(contractFixture({ status: 'DRAFT' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(screen.getByRole('combobox', { name: 'Uso del servicio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('CA-UX-IVA-10 activa la edición dedicada y recalcula la instantánea', async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
    expect(screen.queryByRole('combobox', { name: 'Uso del servicio' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    await selectOption('Uso del servicio', 'No residencial');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    await waitFor(() =>
      expect(mockUpdateServicePoint).toHaveBeenCalledWith(
        'contract-1',
        expect.objectContaining({
          serviceUsage: ServiceUsage.NON_RESIDENTIAL,
          installationStratum: null,
        }),
      ),
    );
    expect(mockUpdateServicePoint.mock.calls[0]?.[1]).not.toHaveProperty('stratumEvidenceMediaId');
    expect(await screen.findByText('Excluido · 0 %')).toBeInTheDocument();
  });

  it('CA-UX-IVA-11 presenta el 422 junto al campo y conserva el valor seleccionado', async () => {
    mockUpdateServicePoint.mockRejectedValueOnce(
      new ApiError(422, 'VALIDATION_ERROR', 'serviceUsage no válido'),
    );
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    await selectOption('Uso del servicio', 'No residencial');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
    expect(
      await screen.findByText('Selecciona el uso del servicio para continuar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Uso del servicio' })).toHaveTextContent(
      'No residencial',
    );
  });

  it('CA-UX-IVA-12 presenta una sección IVA dentro del detalle del contrato', () => {
    renderDrawer();
    expect(screen.getByText('IVA del contrato')).toBeInTheDocument();
  });

  it.each([
    [VatTreatment.EXEMPT, 0, 'Exento · 0 %'],
    [VatTreatment.EXCLUDED, 0, 'Excluido · 0 %'],
    [VatTreatment.STANDARD, 19, 'Gravado · 19 %'],
  ] as const)('CA-UX-IVA-13 traduce el tratamiento %s', (treatment, ratePercent, label) => {
    renderDrawer(
      contractFixture({
        vatSnapshot: {
          treatment,
          legalBasis: VatLegalBasis.ET_468,
          ratePercent,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-12T12:00:00.000Z',
        },
      }),
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(treatment)).toBeNull();
  });

  it.each([
    [VatLegalBasis.ET_481_H, 'Estatuto Tributario, artículo 481, literal h'],
    [VatLegalBasis.ET_476_7, 'Estatuto Tributario, artículo 476, numeral 7'],
    [VatLegalBasis.ET_468, 'Estatuto Tributario, artículo 468'],
  ] as const)('CA-UX-IVA-14 explica el fundamento %s', (legalBasis, label) => {
    renderDrawer(
      contractFixture({
        vatSnapshot: {
          treatment: VatTreatment.STANDARD,
          legalBasis,
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-12T12:00:00.000Z',
        },
      }),
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(legalBasis)).toBeNull();
  });

  it('CA-UX-IVA-15 muestra el aviso de revisión contable sin ocultar tarifa y fundamento', () => {
    renderDrawer(
      contractFixture({
        vatSnapshot: {
          treatment: VatTreatment.STANDARD,
          legalBasis: VatLegalBasis.ET_468,
          ratePercent: 19,
          requiresAccountantReview: true,
          resolvedAt: '2026-10-12T12:00:00.000Z',
        },
      }),
    );
    expect(screen.getByText('Este concepto requiere revisión del contador.')).toBeInTheDocument();
    expect(screen.getByText('Gravado · 19 %')).toBeInTheDocument();
    expect(screen.getByText('Estatuto Tributario, artículo 468')).toBeInTheDocument();
  });

  it.each([
    ['DRAFT', 'El cálculo de IVA estará disponible cuando se active el contrato.'],
    ['ACTIVE', 'El cálculo de IVA no está disponible para este contrato.'],
  ] as const)('CA-UX-IVA-16 explica una instantánea nula en estado %s', (status, message) => {
    renderDrawer(contractFixture({ status, vatSnapshot: null }));
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/IVA legado|STANDARD|EXEMPT|EXCLUDED/)).toBeNull();
  });

  it('CA-UX-IVA-17 presenta la fecha local de cálculo en es-CO', () => {
    renderDrawer(
      contractFixture({
        vatSnapshot: {
          treatment: VatTreatment.EXEMPT,
          legalBasis: VatLegalBasis.ET_481_H,
          ratePercent: 0,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-12T12:00:00.000Z',
        },
      }),
    );
    expect(screen.getByText(/^Calculado el/)).toHaveTextContent('12 de octubre de 2026');
  });

  it('CA-UX-IVA-19 no muestra el tratamiento tributario legado en el banner', () => {
    const { container } = render(
      <VatTreatmentBanner
        vatResponsibility={VatResponsibility.RESPONSABLE}
        rutResponsibilities={['O-13']}
      />,
    );
    // Sin régimen tributario ni tratamiento de IVA por suscriptor (ADR-093 D6).
    expect(container).not.toHaveTextContent(
      /Común|Simplificado|COMMON|SIMPLIFIED|Estándar|Exento|Excluido|STANDARD|EXEMPT|EXCLUDED/,
    );
    expect(screen.getByText('Responsable')).toBeInTheDocument();
    expect(screen.getByText('Gran contribuyente')).toBeInTheDocument();
  });

  it('CA-UX-IVA-20 oculta asignaciones IVA, conserva otros tributos y navega a Servicios', async () => {
    const profile: SubscriberTaxProfileSnapshot = {
      id: 'profile-1',
      subscriberId: 'sub-1',
      segment: 'RESIDENTIAL',
      stratum: 2,
      profileStatus: TaxProfileStatus.CONFIGURED,
      confirmedAt: null,
      confirmedBy: null,
      updatedAt: '2026-10-12T12:00:00.000Z',
      assignments: [
        {
          id: 'vat-assignment',
          taxDefinitionId: 'vat-definition',
          taxName: 'IVA legado del suscriptor',
          taxCategory: TaxCategory.VAT,
          effectiveRate: '0',
          rateSource: TaxAssignmentRateSource.CATALOG,
          treatment: TaxTreatment.EXEMPT,
          status: TaxAssignmentStatus.SUGGESTED,
          reason: null,
          updatedAt: '2026-10-12T12:00:00.000Z',
        },
        {
          id: 'withholding-assignment',
          taxDefinitionId: 'withholding-definition',
          taxName: 'Retención municipal',
          taxCategory: TaxCategory.WITHHOLDING,
          effectiveRate: '2.5',
          rateSource: TaxAssignmentRateSource.CATALOG,
          treatment: null,
          status: TaxAssignmentStatus.CONFIRMED,
          reason: null,
          updatedAt: '2026-10-12T12:00:00.000Z',
        },
      ],
    };
    mockGetTaxProfile.mockResolvedValue(profile);

    function ProfileTabs() {
      const [activeTab, setActiveTab] = useState('tributario');
      return (
        <SubscriberTabsContainer
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          tabs={[
            {
              id: 'tributario',
              label: 'Tributario',
              content: (
                <TaxProfileBlock
                  subscriberId="sub-1"
                  onNavigateToServices={() => setActiveTab('servicios')}
                />
              ),
            },
            { id: 'servicios', label: 'Servicios', content: <p>Contratos del suscriptor</p> },
          ]}
        />
      );
    }

    const user = userEvent.setup();
    render(<ProfileTabs />);
    expect(await screen.findByText('Retención municipal')).toBeInTheDocument();
    expect(screen.queryByText('IVA legado del suscriptor')).toBeNull();
    expect(mockSuggestVat).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Servicios' }));
    expect(await screen.findByText('Contratos del suscriptor')).toBeInTheDocument();
  });
});
