/**
 * Registro de envíos por correo y envío de la factura (spec MOD05↔MOD14 2026-11-13 D5, D10, R4,
 * CA-4, CA-6): estados y motivos legibles, destinatario solo enmascarado, sin texto del servidor.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  type BillingDocumentResponse,
  type BillingEmailLogEntry,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';
import { BillingDocumentTable } from './BillingDocumentTable';
import { BillingEmailLog, emailLogEntriesFor, emailSendOutcome } from './BillingEmailLog';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    const ctx = { hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key) };
    return () => ctx;
  })(),
}));

const mockEmailLog = jest.fn();
const mockSendDocument = jest.fn();
const mockDocument = jest.fn();
jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    billingApi: {
      emailLog: (...args: unknown[]) => mockEmailLog(...args),
      sendDocumentEmail: (...args: unknown[]) => mockSendDocument(...args),
      document: (...args: unknown[]) => mockDocument(...args),
    },
  };
});

const SUBSCRIBER_ID = '55555555-5555-4555-8555-555555555555';
const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_DOCUMENT = '11111111-1111-4111-8111-111111111112';
const PAYMENT_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '77777777-7777-4777-8777-777777777777';

let sequence = 0;
function entry(overrides: Partial<BillingEmailLogEntry>): BillingEmailLogEntry {
  sequence += 1;
  return {
    id: `cccccccc-cccc-4ccc-8ccc-${String(sequence).padStart(12, '0')}`,
    subscriberId: SUBSCRIBER_ID,
    kind: 'FACTURA',
    documentId: DOCUMENT_ID,
    paymentId: null,
    periodFrom: null,
    periodTo: null,
    recipientMasked: 'j***@d***.co',
    subject: 'Factura DC-1 · Empresa de prueba',
    status: 'ENVIADO',
    reasonCode: null,
    resend: false,
    requestedBy: USER_ID,
    createdAt: '2026-11-13T15:00:00.000Z',
    processedAt: '2026-11-13T15:01:00.000Z',
    ...overrides,
  };
}

const ENTRIES = [
  entry({ status: 'ENVIADO' }),
  entry({ status: 'EN_COLA', resend: true, processedAt: null }),
  entry({ status: 'ERROR', reasonCode: 'FALLO_DE_ENVIO' }),
  entry({ status: 'RECHAZADO', reasonCode: 'SIN_CORREO', recipientMasked: null }),
  entry({ status: 'RECHAZADO', reasonCode: 'TITULAR_RESTRINGIDO', recipientMasked: null }),
  entry({ documentId: OTHER_DOCUMENT }),
  entry({ kind: 'RECIBO', documentId: null, paymentId: PAYMENT_ID }),
  entry({
    kind: 'ESTADO_CUENTA',
    documentId: null,
    periodFrom: '2026-08-13',
    periodTo: '2026-11-13',
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGranted.current = new Set([
    AccessPermissionKey.BILLING_INVOICES_READ,
    AccessPermissionKey.BILLING_INVOICES_MANAGE,
  ]);
  mockEmailLog.mockResolvedValue({ subscriberId: SUBSCRIBER_ID, entries: ENTRIES });
});

describe('emailLogEntriesFor', () => {
  it('filtra por documento, pago o estado de cuenta', () => {
    expect(emailLogEntriesFor(ENTRIES, { kind: 'FACTURA', documentId: DOCUMENT_ID })).toHaveLength(
      5,
    );
    expect(emailLogEntriesFor(ENTRIES, { kind: 'RECIBO', paymentId: PAYMENT_ID })).toHaveLength(1);
    expect(emailLogEntriesFor(ENTRIES, { kind: 'ESTADO_CUENTA' })).toHaveLength(1);
  });
});

describe('emailSendOutcome', () => {
  it.each([
    [{ status: 'ENVIADO' }, 'Correo enviado', undefined],
    [{ status: 'EN_COLA' }, 'Envío en cola', /registro de envíos/u],
    [{ status: 'EN_COLA', resend: true }, 'Reenvío en cola', /registro de envíos/u],
    [
      { status: 'RECHAZADO', reasonCode: 'SIN_CORREO' },
      'No se envió el correo',
      /no tiene correo registrado/u,
    ],
    [
      { status: 'RECHAZADO', reasonCode: 'TITULAR_RESTRINGIDO' },
      'No se envió el correo',
      /restringidos/u,
    ],
    [{ status: 'ERROR', reasonCode: 'FALLO_DE_ENVIO' }, 'No se envió el correo', /no aceptó/u],
  ] as const)('%p → %s', (overrides, title, description) => {
    const outcome = emailSendOutcome(entry(overrides));
    expect(outcome.title).toBe(title);
    if (description) expect(outcome.description).toMatch(description);
    else expect(outcome.description).toBeUndefined();
  });
});

describe('BillingEmailLog', () => {
  it('muestra estados y motivos legibles, «Reenviado» y el destinatario enmascarado', async () => {
    render(
      <BillingEmailLog
        subscriberId={SUBSCRIBER_ID}
        target={{ kind: 'FACTURA', documentId: DOCUMENT_ID }}
      />,
    );
    const table = await screen.findByRole('region', { name: 'Envíos por correo' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Enviado');
    expect(rows[0]).toHaveTextContent('j***@d***.co');
    expect(rows[0]).toHaveTextContent('Factura DC-1 · Empresa de prueba');
    expect(rows[1]).toHaveTextContent('En cola');
    expect(rows[1]).toHaveTextContent('Reenviado');
    expect(rows[2]).toHaveTextContent('Error');
    expect(rows[2]).toHaveTextContent('Falló el envío');
    expect(rows[3]).toHaveTextContent('Rechazado');
    expect(rows[3]).toHaveTextContent('Sin correo registrado');
    expect(rows[3]).toHaveTextContent('No disponible');
    expect(rows[4]).toHaveTextContent('Datos del titular restringidos');
    expect(table).not.toHaveTextContent(
      /EN_COLA|ENVIADO|RECHAZADO|SIN_CORREO|TITULAR_RESTRINGIDO|FALLO_DE_ENVIO/u,
    );
    expect(mockEmailLog).toHaveBeenCalledWith(SUBSCRIBER_ID);
  });

  it('nunca muestra un correo en claro aunque llegue en la respuesta', async () => {
    const leaked = { ...entry({}), recipient: 'juan.perez@dominio.co' } as BillingEmailLogEntry;
    mockEmailLog.mockResolvedValue({ subscriberId: SUBSCRIBER_ID, entries: [leaked] });
    render(
      <BillingEmailLog
        subscriberId={SUBSCRIBER_ID}
        target={{ kind: 'FACTURA', documentId: DOCUMENT_ID }}
      />,
    );
    await screen.findByRole('region', { name: 'Envíos por correo' });
    expect(document.body).not.toHaveTextContent('juan.perez@dominio.co');
  });

  it('el estado de cuenta muestra el periodo enviado', async () => {
    render(<BillingEmailLog subscriberId={SUBSCRIBER_ID} target={{ kind: 'ESTADO_CUENTA' }} />);
    const table = await screen.findByRole('region', { name: 'Envíos por correo' });
    expect(within(table).getByRole('columnheader', { name: 'Periodo' })).toBeInTheDocument();
    expect(table).toHaveTextContent('13 de agosto de 2026 al 13 de noviembre de 2026');
  });

  it('un periodo móvil (solo desde) se rotula «Desde el …», no «Todo el historial»', async () => {
    mockEmailLog.mockResolvedValue({
      subscriberId: SUBSCRIBER_ID,
      entries: [
        entry({
          kind: 'ESTADO_CUENTA',
          documentId: null,
          periodFrom: '2026-08-13',
          periodTo: null,
        }),
        entry({ kind: 'ESTADO_CUENTA', documentId: null, periodFrom: null, periodTo: null }),
      ],
    });
    render(<BillingEmailLog subscriberId={SUBSCRIBER_ID} target={{ kind: 'ESTADO_CUENTA' }} />);
    const table = await screen.findByRole('region', { name: 'Envíos por correo' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Desde el 13 de agosto de 2026');
    expect(rows[0]).not.toHaveTextContent('Todo el historial');
    expect(rows[1]).toHaveTextContent('Todo el historial');
  });

  it('sin envíos lo dice; si la carga falla, ofrece reintentar', async () => {
    mockEmailLog.mockResolvedValueOnce({ subscriberId: SUBSCRIBER_ID, entries: [] });
    const { unmount } = render(
      <BillingEmailLog
        subscriberId={SUBSCRIBER_ID}
        target={{ kind: 'RECIBO', paymentId: PAYMENT_ID }}
      />,
    );
    expect(await screen.findByText('Aún no hay envíos por correo.')).toBeInTheDocument();
    unmount();
    mockEmailLog.mockRejectedValueOnce(new ApiError(503, 'BILLING_PRIVACY_UNAVAILABLE', 'x'));
    render(<BillingEmailLog subscriberId={SUBSCRIBER_ID} target={{ kind: 'ESTADO_CUENTA' }} />);
    expect(
      await screen.findByText(
        'No fue posible verificar los datos protegidos del titular. Intenta en unos minutos.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

const ISSUED: BillingDocumentResponse = {
  id: DOCUMENT_ID,
  tenantId: '22222222-2222-4222-8222-222222222222',
  periodId: '33333333-3333-4333-8333-333333333333',
  contractId: '44444444-4444-4444-8444-444444444444',
  subscriberId: SUBSCRIBER_ID,
  status: 'EMITIDO',
  number: 'DC-1',
  dueDate: '2026-11-19',
  periodStart: '2026-10-05',
  periodEnd: '2026-11-04',
  coveredStart: '2026-10-05',
  paymentState: 'PENDIENTE',
  buyerProtected: false,
  subtotal: '100.00',
  taxTotal: '19.00',
  total: '119.00',
  pendingAmount: '119.00',
  unbilledAdditionalCount: 0,
  issueDate: '2026-11-05',
  createdAt: '2026-11-05T12:00:00.000Z',
  updatedAt: '2026-11-05T12:00:00.000Z',
};

describe('BillingDocumentTable — envío por correo (CA-4, CA-6)', () => {
  it('en la ficha envía un emitido y muestra el rechazo sin datos personales', async () => {
    const user = userEvent.setup();
    mockSendDocument.mockResolvedValue(
      entry({ status: 'RECHAZADO', reasonCode: 'SIN_CORREO', recipientMasked: null }),
    );
    render(
      <BillingDocumentTable
        documents={[ISSUED]}
        onChanged={jest.fn()}
        subscriberId={SUBSCRIBER_ID}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Enviar por correo la factura DC-1' }));
    expect(mockSendDocument).toHaveBeenCalledWith(DOCUMENT_ID);
    expect(await screen.findByText('No se envió el correo')).toBeInTheDocument();
    expect(
      screen.getByText(
        'El cliente no tiene correo registrado. Regístralo en sus datos y vuelve a enviarlo.',
      ),
    ).toBeInTheDocument();
  });

  it('traduce el 503 de la cola de correo', async () => {
    const user = userEvent.setup();
    mockSendDocument.mockRejectedValue(new ApiError(503, 'BILLING_EMAIL_QUEUE_UNAVAILABLE', 'x'));
    render(
      <BillingDocumentTable
        documents={[ISSUED]}
        onChanged={jest.fn()}
        subscriberId={SUBSCRIBER_ID}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Enviar por correo la factura DC-1' }));
    expect(
      await screen.findByText(
        'El envío de correos no está disponible en este momento. Intenta en unos minutos.',
      ),
    ).toBeInTheDocument();
  });

  it('el detalle muestra la fecha de emisión y el registro de envíos del documento', async () => {
    const user = userEvent.setup();
    mockDocument.mockResolvedValue(ISSUED);
    render(
      <BillingDocumentTable
        documents={[ISSUED]}
        onChanged={jest.fn()}
        subscriberId={SUBSCRIBER_ID}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText('Fecha de emisión')).toBeInTheDocument();
    expect(screen.getByText('5 de noviembre de 2026')).toBeInTheDocument();
    const log = await screen.findByRole('region', { name: 'Envíos por correo' });
    expect(within(log).getAllByRole('row')).toHaveLength(6);
  });

  it('fuera de la ficha, o sin permiso de gestión, no ofrece el envío', () => {
    const { unmount } = render(<BillingDocumentTable documents={[ISSUED]} onChanged={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Enviar por correo/u })).not.toBeInTheDocument();
    unmount();
    mockGranted.current = new Set([AccessPermissionKey.BILLING_INVOICES_READ]);
    render(
      <BillingDocumentTable
        documents={[ISSUED]}
        onChanged={jest.fn()}
        subscriberId={SUBSCRIBER_ID}
      />,
    );
    expect(screen.queryByRole('button', { name: /Enviar por correo/u })).not.toBeInTheDocument();
  });

  it('D11: un lector sin gestión ve el registro del documento pero no el botón de envío', async () => {
    const user = userEvent.setup();
    mockGranted.current = new Set([AccessPermissionKey.BILLING_INVOICES_READ]);
    mockDocument.mockResolvedValue(ISSUED);
    render(
      <BillingDocumentTable
        documents={[ISSUED]}
        onChanged={jest.fn()}
        subscriberId={SUBSCRIBER_ID}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));
    const log = await screen.findByRole('region', { name: 'Envíos por correo' });
    expect(within(log).getAllByRole('row')).toHaveLength(6);
    expect(mockEmailLog).toHaveBeenCalledWith(SUBSCRIBER_ID);
    expect(screen.queryByRole('button', { name: /Enviar por correo/u })).not.toBeInTheDocument();
  });

  it('un histórico importado no se envía', () => {
    render(
      <BillingDocumentTable
        documents={[{ ...ISSUED, status: 'IMPORTADO', number: null, externalNumber: 'UISP-7' }]}
        onChanged={jest.fn()}
        subscriberId={SUBSCRIBER_ID}
      />,
    );
    expect(screen.queryByRole('button', { name: /Enviar por correo/u })).not.toBeInTheDocument();
  });
});
