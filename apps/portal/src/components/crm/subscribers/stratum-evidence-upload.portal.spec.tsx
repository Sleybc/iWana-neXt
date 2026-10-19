import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { PersonType, ServiceUsage, VatLegalBasis, VatTreatment } from '@iwana/shared';
import type { Contract, Subscriber360Response } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';
import { ContractDetailDrawer } from './ContractDetailDrawer';
import { ConvertExpedienteToContractDialog } from './ConvertExpedienteToContractDialog';
import { CreateContractDialog, ServicePointFields } from './CreateContractDialog';

const mockCreateForSubscriber = jest.fn();
const mockCreateFromExpediente = jest.fn();
const mockUpdateContract = jest.fn();
const mockUpdateServicePoint = jest.fn();
const mockUploadStratumEvidence = jest.fn();
const mockDeleteStratumEvidence = jest.fn();
const mockSearchPlansForPicker = jest.fn();
const mockGetPlanById = jest.fn();

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
    commercialApi: {
      ...actual.commercialApi,
      searchPlansForPicker: (...args: unknown[]) => mockSearchPlansForPicker(...args),
      getPlanById: (...args: unknown[]) => mockGetPlanById(...args),
    },
  };
});

const HINT_TEXT =
  'Adjunta un recibo de un servicio público o el certificado municipal de estratificación de la dirección de instalación. Formatos admitidos: PDF o imagen JPG, PNG o WEBP, hasta 10 MB.';
const TYPE_MESSAGE =
  'Ese tipo de archivo no está admitido. Formatos admitidos: PDF o imagen JPG, PNG o WEBP, hasta 10 MB.';
const SIZE_MESSAGE = 'El archivo supera el máximo de 10 MB. Adjunta uno más liviano.';
const WITHOUT_SUPPORT_WARNING =
  'Sin soporte del estrato, a este servicio se le aplicará IVA del 19 %.';

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

function pdfFile(): File {
  return new File(['%PDF-1.7 recibo de servicio'], 'recibo.pdf', { type: 'application/pdf' });
}

function gifFile(): File {
  return new File(['GIF89a'], 'captura.gif', { type: 'image/gif' });
}

function servicePointHarness() {
  function Harness() {
    const [serviceUsage, setServiceUsage] = useState<ServiceUsage | ''>('');
    const [installationStratum, setInstallationStratum] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    return (
      <>
        <ServicePointFields
          personType={PersonType.NATURAL}
          serviceUsage={serviceUsage}
          onServiceUsageChange={setServiceUsage}
          installationStratum={installationStratum}
          onInstallationStratumChange={setInstallationStratum}
          hasStratumEvidence={false}
          pendingEvidenceFile={pendingFile}
          onPendingEvidenceFileChange={setPendingFile}
        />
      </>
    );
  }
  return <Harness />;
}

/**
 * Acota la opción al listbox abierto: en el diálogo de creación el `<select>`
 * nativo de segmento también tiene una opción «Residencial».
 */
async function selectOption(label: string, option: string) {
  fireEvent.click(screen.getByRole('combobox', { name: label }));
  const listbox = await screen.findByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name: option }));
}

async function chooseResidentialStratumTwo() {
  await selectOption('Uso del servicio', 'Residencial');
  await selectOption('Estrato del predio de instalación', 'Estrato 2');
}

function renderConvertDialog(onSuccess = jest.fn(async () => undefined)) {
  render(
    <ConvertExpedienteToContractDialog
      subscriberId="sub-1"
      expedienteSummary={EXPEDIENTE_SUMMARY}
      onClose={jest.fn()}
      onSuccess={onSuccess}
    />,
  );
  return onSuccess;
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

describe('MOD05 — soporte de estrato en PDF: carga y rechazo de tipos no admitidos', () => {
  beforeEach(() => {
    // resetAllMocks (no clearAllMocks): también descarta los `mockRejectedValueOnce`
    // no consumidos por un test anterior, que contaminarían el siguiente.
    jest.resetAllMocks();
    mockCreateForSubscriber.mockResolvedValue(contractFixture({ status: 'DRAFT' }));
    mockCreateFromExpediente.mockResolvedValue(contractFixture({ status: 'DRAFT' }));
    mockUpdateContract.mockImplementation(async (_id: string, payload: Partial<Contract>) =>
      contractFixture({ ...payload, status: 'DRAFT' }),
    );
    mockUploadStratumEvidence.mockResolvedValue(
      contractFixture({ status: 'DRAFT', stratumEvidenceMediaId: 'private-id' }),
    );
    mockUpdateServicePoint.mockImplementation(async (_id: string, payload: Partial<Contract>) =>
      contractFixture({
        ...payload,
        status: 'ACTIVE',
        vatSnapshot: {
          treatment: VatTreatment.STANDARD,
          legalBasis: VatLegalBasis.ET_468,
          ratePercent: 19,
          requiresAccountantReview: false,
          resolvedAt: '2026-10-12T12:00:00.000Z',
        },
      }),
    );
    mockSearchPlansForPicker.mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Plan Fibra 200', sublabel: 'FTTH' }],
      total: 1,
    });
    mockGetPlanById.mockResolvedValue({
      id: 'plan-1',
      name: 'Plan Fibra 200',
      technology: 'FTTH',
      downloadSpeedMbps: 200,
      uploadSpeedMbps: 100,
      basePrice: 90000,
      installationFee: 0,
      currentPrice: 90000,
    });
  });

  describe('control de soporte', () => {
    it('declara los formatos admitidos en el selector y en la ayuda, sin códigos MIME visibles', async () => {
      render(servicePointHarness());
      await chooseResidentialStratumTwo();

      const upload = screen.getByLabelText('Soporte del estrato') as HTMLInputElement;
      expect(upload.accept).toBe('application/pdf,image/jpeg,image/png,image/webp');
      expect(screen.getByText(HINT_TEXT)).toBeInTheDocument();
      expect(screen.queryByText(/image\/|application\//)).toBeNull();
    });

    it('acepta un PDF y lo deja listo para subir al guardar', async () => {
      render(servicePointHarness());
      await chooseResidentialStratumTwo();

      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [pdfFile()] },
      });

      expect(screen.queryByText('No se guardó el soporte')).toBeNull();
      expect(screen.queryByText(WITHOUT_SUPPORT_WARNING)).toBeNull();
      expect(screen.getByRole('button', { name: 'Quitar soporte' })).toBeInTheDocument();
    });

    it('rechaza un GIF con un mensaje de negocio y no deja el archivo pendiente', async () => {
      render(servicePointHarness());
      await chooseResidentialStratumTwo();

      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [gifFile()] },
      });

      expect(await screen.findByText(TYPE_MESSAGE)).toBeVisible();
      expect(screen.getByText('No se guardó el soporte')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Quitar soporte' })).toBeNull();
      expect(screen.getByText(WITHOUT_SUPPORT_WARNING)).toBeInTheDocument();
    });

    it('rechaza un PDF de más de 10 MB con el mensaje de tamaño', async () => {
      render(servicePointHarness());
      await chooseResidentialStratumTwo();

      const oversized = pdfFile();
      Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [oversized] },
      });

      expect(await screen.findByText(SIZE_MESSAGE)).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Quitar soporte' })).toBeNull();
    });
  });

  describe('flujos de carga', () => {
    it('sube el PDF al crear el borrador de conversión y muestra el soporte cargado', async () => {
      const onSuccess = renderConvertDialog();
      await chooseResidentialStratumTwo();
      const pdf = pdfFile();
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [pdf] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

      await waitFor(() =>
        expect(mockUploadStratumEvidence).toHaveBeenCalledWith('contract-1', pdf),
      );
      expect(mockCreateFromExpediente).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('Soporte cargado')).toBeInTheDocument();
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('no envía un GIF rechazado: la conversión sigue sin soporte y sin subida', async () => {
      const onSuccess = renderConvertDialog();
      await chooseResidentialStratumTwo();
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [gifFile()] },
      });
      expect(await screen.findByText(TYPE_MESSAGE)).toBeVisible();

      fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

      await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
      expect(mockCreateFromExpediente).toHaveBeenCalledTimes(1);
      expect(mockUploadStratumEvidence).not.toHaveBeenCalled();
    });

    it('traduce el 422 STRATUM_EVIDENCE_TYPE_NOT_ALLOWED, conserva el borrador y permite reintentar', async () => {
      mockUploadStratumEvidence.mockRejectedValueOnce(
        new ApiError(
          422,
          'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED',
          'application/x-msdownload no admitido',
        ),
      );
      const onSuccess = renderConvertDialog();
      await chooseResidentialStratumTwo();
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [pdfFile()] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

      expect(await screen.findByText(TYPE_MESSAGE)).toBeVisible();
      expect(screen.queryByText(/x-msdownload/)).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Convertir a contrato' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: 'Convertir a contrato' }));

      await waitFor(() => expect(mockUploadStratumEvidence).toHaveBeenCalledTimes(2));
      expect(mockCreateFromExpediente).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('traduce el 422 al crear el borrador desde Crear servicio y permite reintentar', async () => {
      mockUploadStratumEvidence.mockRejectedValueOnce(
        new ApiError(422, 'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED', 'tipo no admitido'),
      );
      const onSuccess = jest.fn(async () => undefined);
      render(
        <CreateContractDialog subscriberId="sub-1" onClose={jest.fn()} onSuccess={onSuccess} />,
      );
      fireEvent.change(screen.getByRole('combobox', { name: /^Plan/ }), {
        target: { value: 'Fi' },
      });
      fireEvent.click(await screen.findByRole('option', { name: /Plan Fibra 200/i }));
      await waitFor(() => expect(mockGetPlanById).toHaveBeenCalledWith('plan-1'));
      await chooseResidentialStratumTwo();
      const pdf = pdfFile();
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [pdf] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Crear servicio en borrador' }));

      expect(await screen.findByText(TYPE_MESSAGE)).toBeVisible();
      expect(mockCreateForSubscriber).toHaveBeenCalledTimes(1);
      expect(onSuccess).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Crear servicio en borrador' }));

      await waitFor(() => expect(mockUploadStratumEvidence).toHaveBeenCalledTimes(2));
      expect(mockUploadStratumEvidence).toHaveBeenLastCalledWith('contract-1', pdf);
      expect(mockCreateForSubscriber).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('reemplaza con un PDF el soporte de un borrador desde la edición general', async () => {
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
      const pdf = pdfFile();
      fireEvent.change(screen.getByLabelText('Reemplazar soporte'), {
        target: { files: [pdf] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      await waitFor(() =>
        expect(mockUploadStratumEvidence).toHaveBeenCalledWith('contract-1', pdf),
      );
      expect(screen.queryByText(TYPE_MESSAGE)).toBeNull();
      expect(screen.getByText('Soporte cargado')).toBeInTheDocument();
    });

    it('traduce el 422 al guardar la edición de un borrador y mantiene la edición abierta', async () => {
      mockUploadStratumEvidence.mockRejectedValueOnce(
        new ApiError(422, 'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED', 'application/x-msdownload'),
      );
      renderDrawer(
        contractFixture({
          status: 'DRAFT',
          serviceUsage: ServiceUsage.RESIDENTIAL,
          installationStratum: 2,
          stratumEvidenceMediaId: null,
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
      const pdf = pdfFile();
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [pdf] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

      expect(await screen.findByText(TYPE_MESSAGE)).toBeVisible();
      expect(screen.queryByText(/x-msdownload/)).toBeNull();
      expect(mockUpdateContract).toHaveBeenCalledTimes(1);
      expect(mockUploadStratumEvidence).toHaveBeenCalledWith('contract-1', pdf);
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    });

    it('traduce el 422 en la acción dedicada Actualizar punto de servicio', async () => {
      mockUploadStratumEvidence.mockRejectedValueOnce(
        new ApiError(422, 'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED', 'application/x-msdownload'),
      );
      renderDrawer(contractFixture({ status: 'ACTIVE' }));
      fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));
      await selectOption('Uso del servicio', 'Residencial');
      await selectOption('Estrato del predio de instalación', 'Estrato 1');
      fireEvent.change(screen.getByLabelText('Soporte del estrato'), {
        target: { files: [pdfFile()] },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Actualizar punto de servicio' }));

      expect(await screen.findByText(TYPE_MESSAGE)).toBeVisible();
      expect(screen.queryByText(/x-msdownload/)).toBeNull();
      expect(mockUpdateServicePoint).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Actualizar punto de servicio' })).toBeEnabled();
    });
  });
});
