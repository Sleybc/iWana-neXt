import { randomUUID } from 'node:crypto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BillingDocumentLine, BillingDocumentResponse } from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingCourtesyDialog } from './BillingCourtesyDialog';
import { BillingDocumentTable } from './BillingDocumentTable';
import {
  courtesyBaseCents,
  courtesyEligibleLines,
  courtesyNeedsLine,
  documentLineVat,
  DOCUMENT_LINE_KINDS,
  statementCourtesyTotal,
} from './billing-copy';

const mockDocument = jest.fn();
const mockGrant = jest.fn();
const mockVoidCourtesy = jest.fn();
let mockAllowed = true;

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      document: (...args: unknown[]) => mockDocument(...args),
      grantCourtesy: (...args: unknown[]) => mockGrant(...args),
      voidCourtesy: (...args: unknown[]) => mockVoidCourtesy(...args),
      documentPdf: jest.fn(),
      issue: jest.fn(),
      voidDocument: jest.fn(),
    },
  };
});

jest.mock('@/components/access-control/permissions-context', () => {
  const ctx = {
    hasPermission: (key: string) => key !== 'billing.courtesies.manage' || mockAllowed,
  };
  return { usePermissions: () => ctx };
});

const DOC_ID = '11111111-1111-4111-8111-111111111111';

function line(overrides: Partial<BillingDocumentLine>): BillingDocumentLine {
  return {
    id: '66666666-6666-4666-8666-666666666661',
    documentId: DOC_ID,
    kind: 'PLAN',
    description: 'Plan Hogar 300',
    quantity: '1',
    unitPrice: '55000.00',
    baseAmount: '55000.00',
    taxAmount: '0.00',
    total: '55000.00',
    vatTreatment: 'EXEMPT',
    vatRate: '0',
    vatLegalBasis: 'ET_476_7',
    position: 0,
    ...overrides,
  };
}

const PRORATION = line({
  id: '66666666-6666-4666-8666-666666666662',
  kind: 'PRORRATEO',
  description: 'Prorrateo octubre',
  unitPrice: '3548.39',
  baseAmount: '3548.39',
  total: '3548.39',
  position: 1,
});

const DRAFT: BillingDocumentResponse = {
  id: DOC_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: '33333333-3333-4333-8333-333333333333',
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: '55555555-5555-4555-8555-555555555555',
  status: 'BORRADOR',
  number: null,
  dueDate: '2026-11-19',
  periodStart: '2026-10-30',
  periodEnd: '2026-11-29',
  coveredStart: '2026-10-30',
  paymentState: null,
  buyerProtected: false,
  subtotal: '58548.39',
  taxTotal: '0.00',
  total: '58548.39',
  unbilledAdditionalCount: 0,
  createdAt: '2026-11-05T12:00:00.000Z',
  updatedAt: '2026-11-05T12:00:00.000Z',
  lines: [line({}), PRORATION],
  courtesies: [],
};

// jsdom no expone crypto.randomUUID; la clave de idempotencia la necesita al confirmar.
const originalUuid = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
beforeAll(() => {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
});
afterAll(() => {
  if (originalUuid) Object.defineProperty(globalThis.crypto, 'randomUUID', originalUuid);
  else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAllowed = true;
  mockDocument.mockResolvedValue(DRAFT);
});

describe('reglas de cortesía en la vista (spec MOD14 2026-11-12)', () => {
  it('muestra el IVA de cada línea sin enums crudos', () => {
    expect(documentLineVat({ vatTreatment: 'STANDARD', vatRate: '19' })).toBe('IVA 19 %');
    expect(documentLineVat({ vatTreatment: 'EXEMPT', vatRate: '0' })).toBe('Exento');
    expect(documentLineVat({ vatTreatment: 'EXCLUDED', vatRate: '0' })).toBe('Excluido');
    expect(DOCUMENT_LINE_KINDS.CORTESIA).toBe('Cortesía');
    expect(DOCUMENT_LINE_KINDS.ADICIONAL).toBe('Adicional');
  });

  it('excluye de las líneas elegibles las cortesías y las líneas ya regaladas', () => {
    const courtesyLine = line({
      id: '66666666-6666-4666-8666-666666666663',
      kind: 'CORTESIA',
      total: '-3548.39',
      unitPrice: '-3548.39',
      baseAmount: '-3548.39',
    });
    const gifted = {
      ...DRAFT,
      lines: [line({}), PRORATION, courtesyLine],
      courtesies: [
        {
          id: '77777777-7777-4777-8777-777777777771',
          documentId: DOC_ID,
          subscriberId: DRAFT.subscriberId,
          application: 'LINEA_EN_BORRADOR' as const,
          target: 'LINEA' as const,
          sourceLineId: PRORATION.id,
          lineId: courtesyLine.id,
          amount: '3548.39',
          reasonCode: 'PRORRATEO_INICIAL' as const,
          note: null,
          status: 'ACTIVA' as const,
          voidReasonCode: null,
          voidNote: null,
          voidedAt: null,
          voidedBy: null,
          createdBy: '88888888-8888-4888-8888-888888888888',
          createdAt: '2026-11-06T12:00:00.000Z',
        },
      ],
    };
    expect(courtesyEligibleLines(gifted).map((item) => item.id)).toEqual([line({}).id]);
  });

  it('usa el total del borrador y el pendiente del emitido como saldo base', () => {
    expect(courtesyBaseCents(DRAFT)).toBe(5854839);
    expect(courtesyBaseCents({ status: 'EMITIDO', total: '119.00', pendingAmount: '19.00' })).toBe(
      1900,
    );
  });

  it('exige cortesía por línea en un borrador con IVA mixto', () => {
    expect(courtesyNeedsLine(DRAFT)).toBe(false);
    const mixed = {
      ...DRAFT,
      lines: [
        line({}),
        line({
          id: PRORATION.id,
          kind: 'INSTALACION',
          vatTreatment: 'STANDARD',
          vatRate: '19',
          vatLegalBasis: 'ET_468',
        }),
      ],
    };
    expect(courtesyNeedsLine(mixed)).toBe(true);
    expect(courtesyNeedsLine({ ...mixed, status: 'EMITIDO' })).toBe(false);
  });

  it('solo informa el total de cortesías cuando hay alguna', () => {
    expect(statementCourtesyTotal({ totalCourtesy: '0.00' })).toBeNull();
    expect(statementCourtesyTotal({})).toBeNull();
    expect(statementCourtesyTotal({ totalCourtesy: '3548.39' })).toBe('3548.39');
  });
});

describe('BillingCourtesyDialog', () => {
  function renderDialog(onSaved = jest.fn()) {
    render(<BillingCourtesyDialog documentId={DOC_ID} onClose={jest.fn()} onSaved={onSaved} />);
    return onSaved;
  }

  it('regala el prorrateo y muestra el saldo resultante antes de confirmar', async () => {
    mockGrant.mockResolvedValue({});
    const onSaved = renderDialog();
    const select = await screen.findByLabelText('Línea a regalar');
    fireEvent.change(select, { target: { value: PRORATION.id } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'PRORRATEO_INICIAL' } });

    const preview = screen.getByText('Saldo resultante').closest('dl')!;
    expect(within(preview).getByText(/55\.000/u)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Otorgar cortesía' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockGrant).toHaveBeenCalledWith(
      DOC_ID,
      { target: 'LINEA', lineId: PRORATION.id, reasonCode: 'PRORRATEO_INICIAL' },
      expect.any(String),
    );
  });

  it('pide nota con «Otro motivo» y bloquea un valor mayor que el saldo', async () => {
    renderDialog();
    await screen.findByLabelText('Línea a regalar');
    fireEvent.click(screen.getByRole('radio', { name: 'Por valor' }));
    fireEvent.change(screen.getByLabelText('Valor de la cortesía (IVA incluido)'), {
      target: { value: '1000' },
    });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'OTRO' } });
    const submit = screen.getByRole('button', { name: 'Otorgar cortesía' });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText('Nota (obligatoria con «Otro motivo»)')).toBeRequired();

    fireEvent.change(screen.getByLabelText('Nota (obligatoria con «Otro motivo»)'), {
      target: { value: 'Compromiso comercial' },
    });
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Valor de la cortesía (IVA incluido)'), {
      target: { value: '99999999' },
    });
    expect(screen.getByText('La cortesía supera el saldo de la factura')).toBeInTheDocument();
    expect(submit).toBeDisabled();
  });

  it('desactiva «Por valor» si el borrador mezcla IVA', async () => {
    mockDocument.mockResolvedValue({
      ...DRAFT,
      lines: [
        line({}),
        line({ id: PRORATION.id, kind: 'INSTALACION', vatTreatment: 'STANDARD', vatRate: '19' }),
      ],
    });
    renderDialog();
    expect(await screen.findByRole('radio', { name: 'Por valor' })).toBeDisabled();
    expect(screen.getByText(/conceptos con IVA distinto/u)).toBeInTheDocument();
  });

  it('traduce el error de saldo excedido de la API', async () => {
    mockGrant.mockRejectedValue(
      new ApiError(409, 'BILLING_COURTESY_EXCEEDS_BALANCE', 'La cortesía supera el saldo.'),
    );
    renderDialog();
    await screen.findByLabelText('Línea a regalar');
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'FALLA_DEL_SERVICIO' } });
    fireEvent.click(screen.getByRole('button', { name: 'Otorgar cortesía' }));
    expect(await screen.findByText(/supera el saldo pendiente de la factura/u)).toBeInTheDocument();
  });
});

describe('BillingDocumentTable con cortesías', () => {
  const ISSUED: BillingDocumentResponse = {
    ...DRAFT,
    status: 'EMITIDO',
    number: 'DC-000101',
    paymentState: 'PENDIENTE',
    pendingAmount: '55000.00',
    courtesyAmount: '3548.39',
    lines: [line({}), PRORATION],
    courtesies: [
      {
        id: '77777777-7777-4777-8777-777777777772',
        documentId: DOC_ID,
        subscriberId: DRAFT.subscriberId,
        application: 'AJUSTE_SOBRE_EMITIDO',
        target: 'VALOR',
        sourceLineId: null,
        lineId: null,
        amount: '3548.39',
        reasonCode: 'PRORRATEO_INICIAL',
        note: null,
        status: 'ACTIVA',
        voidReasonCode: null,
        voidNote: null,
        voidedAt: null,
        voidedBy: null,
        createdBy: '88888888-8888-4888-8888-888888888888',
        createdAt: '2026-11-06T12:00:00.000Z',
      },
    ],
  };

  it('oculta «Otorgar cortesía» sin el permiso', () => {
    mockAllowed = false;
    render(<BillingDocumentTable documents={[ISSUED]} onChanged={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Otorgar cortesía/u })).not.toBeInTheDocument();
  });

  it('muestra el botón con permiso y no lo ofrece en un documento anulado', () => {
    render(
      <BillingDocumentTable
        documents={[
          ISSUED,
          { ...ISSUED, id: '99999999-9999-4999-8999-999999999999', status: 'ANULADO' },
        ]}
        onChanged={jest.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /Otorgar cortesía/u })).toHaveLength(1);
  });

  it('en el detalle muestra el IVA por línea, la cortesía con su motivo y la anula con motivo', async () => {
    mockDocument.mockResolvedValue(ISSUED);
    mockVoidCourtesy.mockResolvedValue({});
    const onChanged = jest.fn();
    render(<BillingDocumentTable documents={[ISSUED]} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText('Cortesías aplicadas')).toBeInTheDocument();
    expect(screen.getAllByText('Exento').length).toBeGreaterThan(0);
    expect(screen.getByText('Prorrateo del primer mes')).toBeInTheDocument();
    expect(screen.getByText('Aplicada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anular cortesía' }));
    fireEvent.change(await screen.findByLabelText('Motivo de anulación'), {
      target: { value: 'VALOR_INCORRECTO' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar anulación' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mockVoidCourtesy).toHaveBeenCalledWith(
      '77777777-7777-4777-8777-777777777772',
      { reasonCode: 'VALOR_INCORRECTO' },
      expect.any(String),
    );
  });
});
