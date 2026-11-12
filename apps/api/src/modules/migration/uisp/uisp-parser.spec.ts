import { buildSyntheticUispZip } from '../test/uisp-zip.fixture';
import { readZipEntries } from '../zip/safe-zip-reader';
import { parseUispPackage, type ParsedUispPackage } from './uisp-parser';

async function parsedFixture(options = {}): Promise<ParsedUispPackage> {
  const result = parseUispPackage(await readZipEntries(await buildSyntheticUispZip(options)));
  if (!result.ok) throw new Error(`fixture rechazado: ${result.reason}`);
  return result.value;
}

describe('parseUispPackage — anatomía del ZIP de UISP (spec §1)', () => {
  it('lee cliente, servicios, facturas con PDF, pagos, tickets con adjuntos y documentos', async () => {
    const pkg = await parsedFixture();
    expect(pkg.client.id).toBe(9001);
    expect(pkg.services).toHaveLength(2);
    expect(pkg.invoices.map((invoice) => invoice.pdfPath)).toEqual([
      'invoices/900101.pdf',
      'invoices/900102.pdf',
      null,
    ]);
    expect(pkg.payments).toHaveLength(2);
    expect(pkg.tickets[0]!.attachmentPaths).toEqual(['tickets/90010001/adjunto.txt']);
    expect(pkg.tickets[1]!.attachmentPaths).toEqual([]);
    expect(pkg.documents.map((document) => document.path)).toEqual([
      'documents/contrato-firmado.pdf',
      'documents/foto-fachada.jpg',
    ]);
    expect(pkg.documents[0]!.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(pkg.jobIds.size).toBe(0);
  });

  it('acepta una carpeta raíz única', async () => {
    const pkg = await parsedFixture({ rootFolder: 'cliente-9001' });
    expect(pkg.services).toHaveLength(2);
    expect(pkg.documents).toHaveLength(2);
  });

  it('empareja el PDF por número de factura si no hay por id', () => {
    const entries = new Map<string, Buffer>([
      ['client.json', Buffer.from('{"id":1}')],
      ['invoices.json', Buffer.from('[{"id":5,"number":"F-5"}]')],
      ['invoices/F-5.pdf', Buffer.from('%PDF')],
    ]);
    const result = parseUispPackage(entries);
    expect(result.ok && result.value.invoices[0]!.pdfPath).toBe('invoices/F-5.pdf');
  });

  it('marca como null un registro con forma inválida sin tumbar el paquete', () => {
    const entries = new Map<string, Buffer>([
      ['client.json', Buffer.from('{"id":1}')],
      ['services.json', Buffer.from('[{"id":2},{"sin":"id"}]')],
    ]);
    const result = parseUispPackage(entries);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.services.map((service) => service.record === null)).toEqual([
        false,
        true,
      ]);
  });

  it('rechaza el paquete sin client.json o con dos raíces', () => {
    expect(parseUispPackage(new Map([['services.json', Buffer.from('[]')]]))).toEqual({
      ok: false,
      reason: 'CLIENTE_AUSENTE',
    });
    expect(
      parseUispPackage(
        new Map([
          ['a/client.json', Buffer.from('{"id":1}')],
          ['b/client.json', Buffer.from('{"id":2}')],
        ]),
      ),
    ).toEqual({ ok: false, reason: 'CLIENTE_AUSENTE' });
  });

  it('rechaza JSON inválido o un arreglo que no es arreglo', () => {
    expect(parseUispPackage(new Map([['client.json', Buffer.from('{no json')]]))).toEqual({
      ok: false,
      reason: 'JSON_INVALIDO',
    });
    expect(
      parseUispPackage(
        new Map([
          ['client.json', Buffer.from('{"id":1}')],
          ['payments.json', Buffer.from('{"id":1}')],
        ]),
      ),
    ).toEqual({ ok: false, reason: 'JSON_INVALIDO' });
  });

  it('tolera BOM al inicio del JSON', () => {
    const result = parseUispPackage(new Map([['client.json', Buffer.from('﻿{"id":3}')]]));
    expect(result.ok).toBe(true);
  });
});
