import { BillingDocumentResponseSchema } from './billing-documents.contract';
import {
  BILLING_INSTALLATION_CLOSED_JOB_NAME,
  BillingDocumentInstallationBreakdownSchema,
  BillingInstallationClosedEventSchema,
  SignedBillingInstallationClosedEventSchema,
  canonicalizeBillingInstallationClosedEvent,
} from './billing-installation-consumption.contract';

const item = {
  executionOrderNumber: 'OT-0001',
  position: 1,
  description: 'Router WiFi',
  quantity: '1.00',
  unitOfMeasure: 'UND',
  unitReferenceValue: '180000.00',
  referenceValue: '180000.00',
  valueSource: 'PRECIO_COMERCIAL',
  isLoan: true,
  serialNumbers: ['SN-1'],
};

const breakdown = {
  executionOrders: [{ executionOrderNumber: 'OT-0001', closedAt: '2026-11-13T15:00:00.000Z' }],
  items: [item],
  realValue: '180000.00',
  chargedValue: '119000.00',
  itemsWithoutValue: 0,
  serialsProtected: false,
};

describe('Desglose informativo de la instalación (spec MOD14 2026-11-13 R3, R4)', () => {
  it('acepta el desglose con comodato y un ítem sin valor', () => {
    const parsed = BillingDocumentInstallationBreakdownSchema.parse({
      ...breakdown,
      items: [
        item,
        {
          ...item,
          position: 2,
          isLoan: false,
          valueSource: 'SIN_VALOR',
          unitReferenceValue: null,
          referenceValue: null,
          serialNumbers: [],
        },
      ],
      itemsWithoutValue: 1,
    });
    expect(parsed.items).toHaveLength(2);
  });

  it('rechaza campos extra, origen de valor desconocido y montos negativos', () => {
    expect(
      BillingDocumentInstallationBreakdownSchema.safeParse({ ...breakdown, total: '1.00' }).success,
    ).toBe(false);
    expect(
      BillingDocumentInstallationBreakdownSchema.safeParse({
        ...breakdown,
        items: [{ ...item, valueSource: 'MANUAL' }],
      }).success,
    ).toBe(false);
    expect(
      BillingDocumentInstallationBreakdownSchema.safeParse({ ...breakdown, realValue: '-1.00' })
        .success,
    ).toBe(false);
  });

  it('el documento admite el desglose como campo opcional y nulo', () => {
    const document = {
      id: '00000000-0000-4000-8000-000000000030',
      tenantId: '00000000-0000-4000-8000-000000000001',
      periodId: null,
      contractId: '00000000-0000-4000-8000-000000000032',
      subscriberId: '00000000-0000-4000-8000-000000000033',
      status: 'EMITIDO',
      dueDate: '2026-11-20',
      periodStart: null,
      periodEnd: null,
      coveredStart: null,
      paymentState: null,
      buyerProtected: false,
      subtotal: '100000.00',
      taxTotal: '19000.00',
      total: '119000.00',
      unbilledAdditionalCount: 0,
      createdAt: '2026-11-13T15:00:00.000Z',
      updatedAt: '2026-11-13T15:00:00.000Z',
    };
    expect(BillingDocumentResponseSchema.safeParse(document).success).toBe(true);
    expect(
      BillingDocumentResponseSchema.safeParse({ ...document, installationBreakdown: null }).success,
    ).toBe(true);
    expect(
      BillingDocumentResponseSchema.safeParse({ ...document, installationBreakdown: breakdown })
        .success,
    ).toBe(true);
  });
});

describe('Mensaje firmado del cierre de instalación (spec MOD14 2026-11-13 A)', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const event = {
    eventId: '20000000-0000-4000-8000-000000000002',
    executionOrderId: '30000000-0000-4000-8000-000000000003',
    aggregateVersion: 4,
    occurredAt: '2026-11-13T15:00:00.000Z',
  };

  it('el evento solo admite identificadores, versión positiva y fecha ISO', () => {
    expect(BillingInstallationClosedEventSchema.parse(event)).toEqual(event);
    expect(BillingInstallationClosedEventSchema.safeParse({ ...event, extra: 1 }).success).toBe(
      false,
    );
    expect(
      BillingInstallationClosedEventSchema.safeParse({ ...event, aggregateVersion: 0 }).success,
    ).toBe(false);
    expect(
      BillingInstallationClosedEventSchema.safeParse({ ...event, executionOrderId: 'OT-1' })
        .success,
    ).toBe(false);
    expect(
      BillingInstallationClosedEventSchema.safeParse({ ...event, occurredAt: '2026-11-13' })
        .success,
    ).toBe(false);
    expect(BILLING_INSTALLATION_CLOSED_JOB_NAME).toBe('capture-installation-consumption');
  });

  it('el sobre firmado exige tenant uuid y firma hex de 64 caracteres', () => {
    const signed = { tenantId, envelope: event, signature: 'a'.repeat(64) };
    expect(SignedBillingInstallationClosedEventSchema.safeParse(signed).success).toBe(true);
    for (const signature of ['A'.repeat(64), 'a'.repeat(63), 'g'.repeat(64)]) {
      expect(
        SignedBillingInstallationClosedEventSchema.safeParse({ ...signed, signature }).success,
      ).toBe(false);
    }
    expect(
      SignedBillingInstallationClosedEventSchema.safeParse({ ...signed, tenantId: 'tenant' })
        .success,
    ).toBe(false);
    expect(SignedBillingInstallationClosedEventSchema.safeParse({ ...signed, x: 1 }).success).toBe(
      false,
    );
  });

  it('el JSON canónico fija audiencia, orden de claves y no depende del orden de entrada', () => {
    const canonical = canonicalizeBillingInstallationClosedEvent(tenantId, event);
    expect(canonical).toBe(
      JSON.stringify({
        audience: 'billing-installation-closed',
        envelope: {
          aggregateVersion: 4,
          eventId: event.eventId,
          executionOrderId: event.executionOrderId,
          occurredAt: event.occurredAt,
        },
        tenantId,
      }),
    );
    const reordered = {
      occurredAt: event.occurredAt,
      aggregateVersion: event.aggregateVersion,
      executionOrderId: event.executionOrderId,
      eventId: event.eventId,
    };
    expect(canonicalizeBillingInstallationClosedEvent(tenantId, reordered)).toBe(canonical);
  });

  it('cambiar tenant, OT o versión cambia el mensaje firmado', () => {
    const canonical = canonicalizeBillingInstallationClosedEvent(tenantId, event);
    expect(
      canonicalizeBillingInstallationClosedEvent('10000000-0000-4000-8000-000000000009', event),
    ).not.toBe(canonical);
    expect(
      canonicalizeBillingInstallationClosedEvent(tenantId, {
        ...event,
        executionOrderId: '30000000-0000-4000-8000-000000000009',
      }),
    ).not.toBe(canonical);
    expect(
      canonicalizeBillingInstallationClosedEvent(tenantId, { ...event, aggregateVersion: 5 }),
    ).not.toBe(canonical);
  });
});
