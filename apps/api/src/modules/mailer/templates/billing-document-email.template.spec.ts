import { billingDocumentEmailTemplate } from './billing-document-email.template';

describe('billingDocumentEmailTemplate', () => {
  it('documento de cobro con la razón social del tenant y su número', () => {
    const mail = billingDocumentEmailTemplate({
      kind: 'FACTURA',
      legalName: 'Redes del Valle S.A.S.',
      reference: 'DC-000123',
    });
    expect(mail.subject).toBe('Documento de cobro DC-000123 · Redes del Valle S.A.S.');
    expect(mail.text).toContain('Adjuntamos tu documento de cobro DC-000123.');
    expect(mail.html).toContain('Redes del Valle S.A.S.');
    expect(mail.filename).toBe('documento-de-cobro-DC-000123.pdf');
  });

  it('recibo de pago con su consecutivo', () => {
    const mail = billingDocumentEmailTemplate({ kind: 'RECIBO', legalName: 'ISP', reference: 42 });
    expect(mail.subject).toBe('Recibo de pago N.º 42 · ISP');
    expect(mail.filename).toBe('recibo-de-pago-42.pdf');
  });

  it('estado de cuenta con periodo o hasta una fecha', () => {
    const ranged = billingDocumentEmailTemplate({
      kind: 'ESTADO_CUENTA',
      legalName: 'ISP',
      periodFrom: '2026-01-01',
      periodTo: '2026-03-31',
    });
    expect(ranged.text).toContain('del 01/01/2026 al 31/03/2026');
    expect(ranged.filename).toBe('estado-de-cuenta-2026-03-31.pdf');
    const until = billingDocumentEmailTemplate({
      kind: 'ESTADO_CUENTA',
      legalName: null,
      periodTo: '2026-03-31',
    });
    expect(until.text).toContain('hasta el 31/03/2026');
    expect(until.subject).toBe('Estado de cuenta · Tu proveedor de servicio');
    expect(
      billingDocumentEmailTemplate({ kind: 'ESTADO_CUENTA', legalName: 'ISP' }).text,
    ).toContain('Adjuntamos tu estado de cuenta.');
  });

  it('escapa el HTML y quita saltos de línea del asunto', () => {
    const mail = billingDocumentEmailTemplate({
      kind: 'FACTURA',
      legalName: '<b>ISP</b>\r\nBcc: otro@ejemplo.test',
      reference: 'DC-1',
    });
    expect(mail.subject).not.toMatch(/[\r\n]/u);
    expect(mail.html).not.toContain('<b>');
    expect(mail.html).toContain('&lt;b&gt;ISP&lt;/b&gt;');
  });

  it('acota el asunto a 200 caracteres', () => {
    const mail = billingDocumentEmailTemplate({
      kind: 'FACTURA',
      legalName: 'X'.repeat(500),
      reference: 'DC-1',
    });
    expect(mail.subject.length).toBeLessThanOrEqual(200);
  });
});
