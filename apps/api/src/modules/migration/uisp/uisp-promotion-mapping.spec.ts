import {
  amount,
  centsToMoney,
  civilDate,
  contractDates,
  contractStatus,
  documentKind,
  individualPrice,
  instant,
  invoiceLines,
  invoiceServiceId,
  isPdf,
  paymentCovers,
  serviceAddress,
  serviceAlias,
  suspensionPeriods,
  ticketComments,
  ticketStatus,
} from './uisp-promotion-mapping';

describe('uisp-promotion-mapping (ADR-110 D3, D5; spec §3.2)', () => {
  it('civilDate toma la fecha civil de UISP y descarta fechas imposibles', () => {
    expect(civilDate('2023-02-01T00:00:00-0500')).toBe('2023-02-01');
    expect(civilDate('2023-02-30')).toBeNull();
    expect(civilDate('ayer')).toBeNull();
    expect(civilDate(20230201)).toBeNull();
  });

  it('instant y amount normalizan o devuelven null', () => {
    expect(instant('2023-03-01T00:00:00-0500')).toBe('2023-03-01T05:00:00.000Z');
    expect(instant('x')).toBeNull();
    expect(instant(null)).toBeNull();
    expect(amount('80.005')).toBe(80.01);
    expect(amount('')).toBeNull();
    expect(amount('abc')).toBeNull();
    expect(amount(undefined)).toBeNull();
  });

  it('centsToMoney conserva el signo y los centavos', () => {
    expect(centsToMoney(8000)).toBe('80.00');
    expect(centsToMoney(-8005)).toBe('-80.05');
    expect(centsToMoney(0)).toBe('0.00');
  });

  it('contractStatus: 1 activo, 3 suspendido, 2/5/8 terminado, resto borrador', () => {
    expect(contractStatus(1)).toBe('ACTIVE');
    expect(contractStatus('3')).toBe('SUSPENDED');
    for (const status of [2, 5, 8]) expect(contractStatus(status)).toBe('TERMINATED');
    expect(contractStatus(0)).toBe('DRAFT');
    expect(contractStatus(undefined)).toBe('DRAFT');
  });

  it('suspensionPeriods ignora inicios inválidos y fines anteriores al inicio', () => {
    expect(
      suspensionPeriods({
        suspensionPeriods: [
          { startDate: '2023-05-01', endDate: '2023-05-10' },
          { startDate: '2023-06-10', endDate: '2023-06-01' },
          { startDate: 'mal' },
          { startDate: '2023-07-01' },
        ],
      }),
    ).toEqual([
      { startDate: '2023-05-01', endDate: '2023-05-10' },
      { startDate: '2023-06-10', endDate: null },
      { startDate: '2023-07-01', endDate: null },
    ]);
    expect(suspensionPeriods(null)).toEqual([]);
  });

  it('fechas, precio individual, dirección y alias del servicio', () => {
    expect(contractDates({ invoicingStart: '2022-02-01', activeTo: '2024-01-31' })).toEqual({
      startDate: '2022-02-01',
      endDate: '2024-01-31',
    });
    expect(
      contractDates({ activeFrom: '2022-01-15', invoicingStart: '2022-02-01' }).startDate,
    ).toBe('2022-01-15');
    expect(individualPrice({ individualPrice: '75.5' })).toBe(75.5);
    expect(individualPrice({ individualPrice: -1 })).toBeNull();
    expect(individualPrice({})).toBeNull();
    expect(serviceAddress({ street1: ' Calle 1 ' })).toBe('Calle 1');
    expect(serviceAddress({ fullAddress: 'Completa', street1: 'Corta' })).toBe('Completa');
    expect(serviceAlias({ name: '  ' })).toBeNull();
  });

  it('invoiceLines usa los renglones válidos o uno solo por el total', () => {
    expect(
      invoiceLines(
        {
          items: [
            { label: 'Servicio', price: 80, quantity: 1, total: 80 },
            { label: 'Malo', total: 'x' },
            { total: 5 },
          ],
        },
        85,
      ),
    ).toEqual([
      { description: 'Servicio', quantity: 1, unitPrice: 80, total: 80 },
      { description: 'Concepto importado', quantity: 1, unitPrice: 5, total: 5 },
    ]);
    expect(invoiceLines({}, 40)).toEqual([
      { description: 'Factura importada', quantity: 1, unitPrice: 40, total: 40 },
    ]);
  });

  it('invoiceServiceId toma el primer serviceId seguro', () => {
    expect(invoiceServiceId({ items: [{ serviceId: '../x' }, { serviceId: 77 }] })).toBe('77');
    expect(invoiceServiceId({ items: [] })).toBeNull();
  });

  it('paymentCovers ignora notas crédito y montos no positivos', () => {
    expect(
      paymentCovers({
        paymentCovers: [
          { invoiceId: 10, amount: 80 },
          { creditNoteId: 3, amount: 5 },
          { invoiceId: 11, amount: 0 },
        ],
      }),
    ).toEqual([{ invoiceId: '10', amount: 80 }]);
  });

  it('ticketStatus y ticketComments respetan public (privado → interno)', () => {
    expect(ticketStatus(2)).toBe('PENDING_CUSTOMER');
    expect(ticketStatus(3)).toBe('CLOSED');
    expect(ticketStatus(0)).toBe('OPEN');
    const raw = {
      public: true,
      activity: [
        { public: true, comment: { body: 'Visible' }, createdAt: '2023-03-01T00:00:00Z' },
        { public: false, comment: { body: 'Privado' } },
        { public: true, comment: { body: '   ' } },
        { public: true },
      ],
    };
    expect(ticketComments(raw)).toEqual([
      { body: 'Visible', internal: false, createdAt: '2023-03-01T00:00:00.000Z' },
      { body: 'Privado', internal: true, createdAt: null },
    ]);
    // Un ticket no público deja todos sus comentarios internos.
    expect(ticketComments({ ...raw, public: false }).every((c) => c.internal)).toBe(true);
  });

  it('documentKind decide por la firma del contenido, nunca por el nombre', () => {
    expect(documentKind(Buffer.from('%PDF-1.4\n'))).toMatchObject({
      kind: 'PDF',
      extension: 'pdf',
    });
    expect(documentKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({
      kind: 'IMAGEN',
      contentType: 'image/jpeg',
    });
    expect(
      documentKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toMatchObject({ contentType: 'image/png' });
    expect(documentKind(Buffer.from('RIFF0000WEBPVP8 '))).toMatchObject({
      contentType: 'image/webp',
    });
    expect(documentKind(Buffer.from('<html>'))).toEqual({
      kind: 'OTRO',
      contentType: 'application/octet-stream',
      extension: 'bin',
    });
    expect(isPdf(Buffer.from('%PDF-'))).toBe(true);
    expect(isPdf(Buffer.from('MZ'))).toBe(false);
  });
});
