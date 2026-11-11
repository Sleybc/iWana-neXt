// Cierre de venta · bloque C · paso «Contrato» de la consola de OT (CA-1, CA-12; ADR-109).
// Datos ficticios, sin PII. El cliente de API va simulado con el contrato de @iwana/shared.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ContractSignatureRequestSchema,
  type ContractDocumentGeneration,
  type ProvisioningOrderContextDto,
} from '@iwana/shared';
import { ApiError, contractSigningApi } from '@/lib/api-client';
import { ExecutionOrderContractStep } from './ExecutionOrderContractStep';
import {
  CONTRACT_STEP_COPY,
  contractGenerationPollDelay,
  contractStepError,
  contractStepDisabledReason,
  resolveExecutionOrderContract,
  signerDocumentTypeFrom,
  type ExecutionOrderContractContext,
} from './execution-order-contract-signing';
import {
  drawStroke,
  installCanvasMocks,
  installPointerEvent,
} from './execution-order-canvas.test-helper';

jest.mock('@/lib/api-client', () => {
  class MockApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    ApiError: MockApiError,
    contractSigningApi: {
      requestGeneration: jest.fn(),
      getLatestGeneration: jest.fn(),
      getDocument: jest.fn(),
      sign: jest.fn(),
    },
  };
});

const api = contractSigningApi as jest.Mocked<typeof contractSigningApi>;

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const SHA = 'a'.repeat(64);

const CONTRACT: ExecutionOrderContractContext = {
  contractId: CONTRACT_ID,
  status: 'DRAFT',
  holderName: 'Titular Ficticio',
  provisioningStatus: 'CERTIFIED',
};

function generation(
  overrides: Partial<ContractDocumentGeneration> = {},
): ContractDocumentGeneration {
  return {
    generationId: GENERATION_ID,
    contractId: CONTRACT_ID,
    status: 'PENDING',
    templateLegalTextId: null,
    templateVersion: null,
    documentSha256: null,
    requestedAt: '2026-11-11T15:00:00.000Z',
    completedAt: null,
    failureReason: null,
    missingOperatorFields: [],
    ...overrides,
  };
}

const READY = generation({
  status: 'READY',
  templateLegalTextId: '44444444-4444-4444-8444-444444444444',
  templateVersion: '1.0',
  documentSha256: SHA,
  completedAt: '2026-11-11T15:00:05.000Z',
});

function renderStep(props: Partial<Parameters<typeof ExecutionOrderContractStep>[0]> = {}) {
  const onSigned = jest.fn();
  const view = render(
    <ExecutionOrderContractStep
      executionOrderId={ORDER_ID}
      contract={CONTRACT}
      disabledReason={null}
      signed={false}
      onSigned={onSigned}
      {...props}
    />,
  );
  return { ...view, onSigned };
}

const createObjectURL = jest.fn(() => 'blob:contrato-ficticio');
const revokeObjectURL = jest.fn();
const getCurrentPosition = jest.fn();

let uuidSequence = 0;

beforeAll(() => {
  installPointerEvent();
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => `55555555-5555-4555-8555-${String(++uuidSequence).padStart(12, '0')}`,
    configurable: true,
  });
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  installCanvasMocks();
  api.getDocument.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
  getCurrentPosition.mockImplementation((success: PositionCallback) =>
    success({ coords: { latitude: 4.6097123, longitude: -74.0817456 } } as GeolocationPosition),
  );
});

afterEach(() => {
  jest.useRealTimers();
});

async function signWithDocument(user: ReturnType<typeof userEvent.setup>, document = 'AB12345') {
  await user.type(await screen.findByLabelText('Número de documento'), document);
  const capture = screen.getByRole('group', { name: 'Captura de firma del contrato' });
  drawStroke(within(capture).getByRole('img', { name: 'Área de firma' }));
  await user.click(within(capture).getByRole('button', { name: 'Firmar contrato' }));
}

describe('paso «Contrato» — habilitación', () => {
  it('deshabilitado muestra el motivo y no consulta ni ofrece generar', () => {
    renderStep({ disabledReason: CONTRACT_STEP_COPY.disabledProvisioning });

    expect(screen.getByRole('region', { name: 'Contrato' })).toBeInTheDocument();
    expect(screen.getByText(CONTRACT_STEP_COPY.disabledProvisioning)).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar contrato' })).toBeNull();
    expect(api.getLatestGeneration).not.toHaveBeenCalled();
  });

  it('el motivo depende del momento, permiso, red, sincronización y aprovisionamiento', () => {
    const base = {
      inProgress: true,
      canRegister: true,
      offline: false,
      inSync: true,
      provisioningStatus: 'CERTIFIED' as const,
    };
    expect(contractStepDisabledReason(base)).toBeNull();
    expect(contractStepDisabledReason({ ...base, provisioningStatus: 'ACTIVE' })).toBeNull();
    expect(contractStepDisabledReason({ ...base, inProgress: false })).toBe(
      CONTRACT_STEP_COPY.disabledNotInProgress,
    );
    expect(contractStepDisabledReason({ ...base, canRegister: false })).toBe(
      CONTRACT_STEP_COPY.disabledNoPermission,
    );
    expect(contractStepDisabledReason({ ...base, offline: true })).toBe(
      CONTRACT_STEP_COPY.disabledOffline,
    );
    expect(contractStepDisabledReason({ ...base, inSync: false })).toBe(
      CONTRACT_STEP_COPY.disabledSync,
    );
    for (const status of ['RESERVED', 'FAILED', 'RELEASED', null] as const) {
      expect(contractStepDisabledReason({ ...base, provisioningStatus: status })).toBe(
        CONTRACT_STEP_COPY.disabledProvisioning,
      );
    }
  });

  it('resuelve el contrato en borrador referenciado por el aprovisionamiento', () => {
    const context = {
      subscriber: { id: 'sub', displayLabel: 'Titular Ficticio' },
      contracts: [
        { id: 'c-active', alias: null, status: 'ACTIVE' },
        { id: 'c-draft', alias: null, status: 'DRAFT' },
      ],
      provisioning: { contractId: 'c-draft', status: 'CERTIFIED' },
    } as unknown as ProvisioningOrderContextDto;

    expect(resolveExecutionOrderContract(context)).toEqual({
      contractId: 'c-draft',
      status: 'DRAFT',
      holderName: 'Titular Ficticio',
      provisioningStatus: 'CERTIFIED',
    });
    expect(
      resolveExecutionOrderContract({
        ...context,
        provisioning: null,
      } as ProvisioningOrderContextDto),
    ).toEqual(expect.objectContaining({ contractId: 'c-draft', provisioningStatus: null }));
    expect(
      resolveExecutionOrderContract({
        ...context,
        provisioning: null,
        contracts: [
          { id: 'a', alias: null, status: 'DRAFT' },
          { id: 'b', alias: null, status: 'DRAFT' },
        ],
      } as ProvisioningOrderContextDto),
    ).toBeNull();
    expect(resolveExecutionOrderContract(null)).toBeNull();
  });

  it('vista del técnico: usa el contrato de la OT que publica CRM y precarga el documento', () => {
    const view = {
      executionOrderId: 'ot-1',
      status: 'CERTIFIED',
      ip: null,
      certified: true,
      updatedAt: null,
    } as const;
    expect(
      resolveExecutionOrderContract(null, {
        view,
        contract: {
          contractId: 'c-draft',
          status: 'DRAFT',
          holder: {
            fullName: 'Titular Ficticio',
            documentType: 'CC',
            documentNumber: '1000000001',
          },
        },
      }),
    ).toEqual({
      contractId: 'c-draft',
      status: 'DRAFT',
      holderName: 'Titular Ficticio',
      provisioningStatus: 'CERTIFIED',
      holderDocument: { type: 'CC', number: '1000000001' },
    });
    expect(resolveExecutionOrderContract(null, { view, contract: null })).toBeNull();
    expect(signerDocumentTypeFrom('CE')).toBe('CE');
    expect(signerDocumentTypeFrom('NIT')).toBeNull();
    expect(signerDocumentTypeFrom(null)).toBeNull();
  });

  it('la espera del sondeo crece y se estabiliza', () => {
    expect([0, 1, 2, 3, 4, 9].map(contractGenerationPollDelay)).toEqual([
      1_000, 2_000, 3_000, 5_000, 8_000, 8_000,
    ]);
  });
});

describe('paso «Contrato» — generación', () => {
  it('genera, anuncia «Generando contrato…», sondea y muestra el PDF sin enlace de descarga', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    api.getLatestGeneration.mockResolvedValueOnce(null).mockResolvedValueOnce(READY);
    api.requestGeneration.mockResolvedValue(generation());
    renderStep();

    await user.click(await screen.findByRole('button', { name: 'Generar contrato' }));
    expect(api.requestGeneration).toHaveBeenCalledWith(CONTRACT_ID, ORDER_ID);
    expect(screen.getAllByText('Generando contrato…').length).toBeGreaterThan(0);

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });

    const frame = await screen.findByTitle('Contrato para leer con el cliente');
    expect(frame.getAttribute('src')).toBe('blob:contrato-ficticio#toolbar=0&navpanes=0');
    expect(api.getDocument).toHaveBeenCalledWith(CONTRACT_ID, GENERATION_ID, ORDER_ID);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button', { name: /descargar/i })).toBeNull();
    expect(screen.getByText(CONTRACT_STEP_COPY.readingNotice)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Contrato para leer con el cliente' }),
    ).toHaveFocus();
  });

  it('retoma una generación lista al abrir la OT', async () => {
    api.getLatestGeneration.mockResolvedValue(READY);
    renderStep();

    expect(await screen.findByTitle('Contrato para leer con el cliente')).toBeInTheDocument();
    expect(api.requestGeneration).not.toHaveBeenCalled();
  });

  it('lista los datos del operador que faltan', async () => {
    api.getLatestGeneration.mockResolvedValue(
      generation({
        status: 'FAILED',
        completedAt: '2026-11-11T15:00:05.000Z',
        failureReason: 'OPERATOR_DATA_MISSING',
        missingOperatorFields: ['qualityAndCoverageUrl', 'reconnectionFee'],
      }),
    );
    renderStep();

    expect(
      await screen.findByText('Faltan datos de la empresa para el contrato'),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Datos de la empresa que faltan' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Web de calidad y cobertura')).toBeInTheDocument();
    expect(screen.queryByText(/OPERATOR_DATA_MISSING|reconnectionFee/)).toBeNull();
  });

  it('explica que la plantilla no está aprobada', async () => {
    api.getLatestGeneration.mockResolvedValue(
      generation({
        status: 'FAILED',
        completedAt: '2026-11-11T15:00:05.000Z',
        failureReason: 'TEMPLATE_NOT_APPROVED',
      }),
    );
    renderStep();

    expect(
      await screen.findByText('No hay una plantilla de contrato aprobada'),
    ).toBeInTheDocument();
    expect(screen.getByText(/aprobada por asesoría jurídica/)).toBeInTheDocument();
  });

  it('un fallo de red al generar se puede reintentar', async () => {
    const user = userEvent.setup();
    api.getLatestGeneration.mockResolvedValue(null);
    api.requestGeneration
      .mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'x'))
      .mockResolvedValueOnce(READY);
    renderStep();

    await user.click(await screen.findByRole('button', { name: 'Generar contrato' }));
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByTitle('Contrato para leer con el cliente')).toBeInTheDocument();
  });
});

describe('paso «Contrato» — firma', () => {
  beforeEach(() => {
    api.getLatestGeneration.mockResolvedValue(READY);
  });

  it('precarga al titular, firma con el contrato congelado y queda «Contrato firmado» sin PDF', async () => {
    const user = userEvent.setup();
    api.sign.mockResolvedValue({
      contractId: CONTRACT_ID,
      status: 'ACTIVE',
      signedAt: '2026-11-11T15:10:00.000Z',
      billingStartDate: '2026-11-11',
      signedDocumentSha256: 'b'.repeat(64),
      templateVersion: '1.0',
      replayed: false,
    });
    const { onSigned } = renderStep();

    await screen.findByTitle('Contrato para leer con el cliente');
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('Titular Ficticio');
    await signWithDocument(user);

    await waitFor(() => expect(api.sign).toHaveBeenCalledTimes(1));
    const [contractId, payload] = api.sign.mock.calls[0]!;
    expect(contractId).toBe(CONTRACT_ID);
    expect(ContractSignatureRequestSchema.safeParse(payload).success).toBe(true);
    expect(payload).toEqual(
      expect.objectContaining({
        generationId: GENERATION_ID,
        documentSha256: SHA,
        executionOrderId: ORDER_ID,
        signer: { fullName: 'Titular Ficticio', documentType: 'CC', documentNumber: 'AB12345' },
        location: { latitude: 4.61, longitude: -74.082 },
      }),
    );
    expect(payload.signatureImage).toMatch(/^data:image\/png;base64,/);

    const signed = await screen.findByRole('heading', { name: 'Contrato firmado' });
    expect(signed).toHaveFocus();
    expect(onSigned).toHaveBeenCalledWith(CONTRACT_ID);
    expect(screen.queryByTitle('Contrato para leer con el cliente')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:contrato-ficticio');
    expect(screen.getByText('Firmado')).toBeInTheDocument();
  });

  it('sin ubicación disponible firma con location null', async () => {
    const user = userEvent.setup();
    getCurrentPosition.mockImplementation((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1 } as GeolocationPositionError),
    );
    api.sign.mockResolvedValue({} as never);
    renderStep();

    await screen.findByTitle('Contrato para leer con el cliente');
    await signWithDocument(user);

    await waitFor(() => expect(api.sign).toHaveBeenCalledTimes(1));
    expect(api.sign.mock.calls[0]![1].location).toBeNull();
  });

  it('un 503 se reintenta con la misma clave de idempotencia', async () => {
    const user = userEvent.setup();
    api.sign
      .mockRejectedValueOnce(new ApiError(503, 'SIGNED_DOCUMENT_UNAVAILABLE', 'x'))
      .mockResolvedValueOnce({ replayed: true } as never);
    renderStep();

    await screen.findByTitle('Contrato para leer con el cliente');
    await signWithDocument(user);
    expect(await screen.findByText(/no se firmará dos veces/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Firmar contrato' }));
    await screen.findByRole('heading', { name: 'Contrato firmado' });
    expect(api.sign).toHaveBeenCalledTimes(2);
    expect(api.sign.mock.calls[1]![1].idempotencyKey).toBe(
      api.sign.mock.calls[0]![1].idempotencyKey,
    );
  });

  it('si la huella no coincide pide generar de nuevo', async () => {
    const user = userEvent.setup();
    api.sign.mockRejectedValue(new ApiError(409, 'CONTRACT_DOCUMENT_HASH_MISMATCH', 'x'));
    renderStep();

    await screen.findByTitle('Contrato para leer con el cliente');
    await signWithDocument(user);

    expect(await screen.findByText(/Genéralo de nuevo y léelo con el cliente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar contrato' })).toBeInTheDocument();
    expect(screen.queryByTitle('Contrato para leer con el cliente')).toBeNull();
  });

  it('valida el documento de quien firma antes de llamar al API', async () => {
    const user = userEvent.setup();
    renderStep();

    await screen.findByTitle('Contrato para leer con el cliente');
    await signWithDocument(user, '1.2');

    expect(await screen.findByText(/de 3 a 20 letras o números/)).toBeInTheDocument();
    expect(api.sign).not.toHaveBeenCalled();
  });

  it('tras firmar el técnico no puede reabrir el PDF (CA-12)', async () => {
    api.getDocument.mockRejectedValue(new ApiError(403, 'CONTRACT_DOCUMENT_SIGNED', 'x'));
    renderStep();

    expect(
      await screen.findByRole('heading', { name: 'El contrato ya está firmado.' }),
    ).toBeInTheDocument();
    expect(screen.queryByTitle('Contrato para leer con el cliente')).toBeNull();
    expect(screen.getByText('Sin firma pendiente')).toBeInTheDocument();
  });

  it('firmado en esta visita no vuelve a consultar el documento', () => {
    renderStep({ signed: true });

    expect(screen.getByRole('heading', { name: 'Contrato firmado' })).toBeInTheDocument();
    expect(api.getLatestGeneration).not.toHaveBeenCalled();
    expect(api.getDocument).not.toHaveBeenCalled();
  });
});

describe('paso «Contrato» — falta ciclo de facturación (fase 2, CA-2)', () => {
  beforeEach(() => {
    api.getLatestGeneration.mockResolvedValue(READY);
  });

  it('un 409 BILLING_CYCLE_REQUIRED muestra el motivo y deshabilita la firma', async () => {
    const user = userEvent.setup();
    api.sign.mockRejectedValue(new ApiError(409, 'BILLING_CYCLE_REQUIRED', 'x'));
    renderStep();

    await screen.findByTitle('Contrato para leer con el cliente');
    await signWithDocument(user);

    expect(await screen.findByText('Falta ciclo de facturación')).toBeInTheDocument();
    expect(
      screen.getByText('Asigna el ciclo de facturación del contrato antes de firmarlo.'),
    ).toBeInTheDocument();
    const capture = screen.getByRole('group', { name: 'Captura de firma del contrato' });
    expect(within(capture).getByRole('button', { name: 'Firmar contrato' })).toBeDisabled();
    expect(api.sign).toHaveBeenCalledTimes(1);
  });

  it('con el contrato marcado sin ciclo la firma nace deshabilitada', async () => {
    renderStep({ contract: { ...CONTRACT, billingCycleMissing: true } });

    await screen.findByTitle('Contrato para leer con el cliente');
    expect(screen.getByText('Falta ciclo de facturación')).toBeInTheDocument();
    const capture = screen.getByRole('group', { name: 'Captura de firma del contrato' });
    expect(within(capture).getByRole('button', { name: 'Firmar contrato' })).toBeDisabled();
  });

  it('traduce BILLING_CYCLE_REQUIRED a un motivo sin salida desde la consola', () => {
    expect(contractStepError(new ApiError(409, 'BILLING_CYCLE_REQUIRED', 'x'))).toEqual({
      kind: 'final',
      message: 'Asigna el ciclo de facturación del contrato antes de firmarlo.',
    });
  });
});
