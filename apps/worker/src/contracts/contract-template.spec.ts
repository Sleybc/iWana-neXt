import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildContractSnapshotFixture } from '../../test/fixtures/contracts/contract-snapshot.fixture';
import {
  buildContractTemplateValues,
  escapeHtml,
  fillContractTemplate,
  formatMoney,
} from './contract-template';

const fixtureTemplate = readFileSync(
  resolve(__dirname, '../../test/fixtures/contracts/contrato-servicio.base.html'),
  'utf8',
);

describe('fillContractTemplate', () => {
  it('rellena todos los campos de la plantilla y escapa el texto del titular', () => {
    const html = fillContractTemplate(fixtureTemplate, buildContractSnapshotFixture());
    expect(html).not.toMatch(/\{\{/u);
    expect(html).toContain('Titular &lt;Sintético&gt; &amp; Cía');
    expect(html).not.toContain('<Sintético>');
    expect(html).toContain('<td>SN-0001</td>');
    expect(html).toContain('Soporte: soporte@operador.example.invalid');
    expect(html).toContain('Teléfono: 6010000000');
  });

  it('omite la sección de permanencia si el cliente no la aceptó', () => {
    const html = fillContractTemplate(fixtureTemplate, buildContractSnapshotFixture());
    expect(html).not.toContain('Cargo ');
    expect(html).not.toContain('<!--IF:');
  });

  it('incluye la permanencia aceptada con su tabla mes a mes', () => {
    const html = fillContractTemplate(
      fixtureTemplate,
      buildContractSnapshotFixture({
        permanence: {
          months: 2,
          connectionFee: 120000,
          discountedOrDeferredAmount: 100000,
          startDate: null,
          endDate: null,
          schedule: [
            { month: 1, amount: 100000 },
            { month: 2, amount: 50000 },
          ],
        },
      }),
    );
    expect(html).toContain('2 meses');
    expect(html).toContain('Desde la activación del servicio');
    expect(html).toContain(`<td>2</td><td>${formatMoney(50000)}</td>`);
  });

  it('escapa los valores dentro de los bloques HTML', () => {
    const html = fillContractTemplate(
      '<table>{{{ equipmentRows }}}</table>',
      buildContractSnapshotFixture({
        equipment: [{ serialNumber: '<script>x</script>', macAddress: null, model: '"m"' }],
      }),
    );
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&quot;m&quot;');
    expect(html).toContain('No aplica');
  });

  it('muestra «Sin equipos entregados» sin equipos', () => {
    expect(
      fillContractTemplate('{{{equipmentRows}}}', buildContractSnapshotFixture({ equipment: [] })),
    ).toContain('Sin equipos entregados');
  });

  it.each([
    ['{{ holder.password }}', /Campo de plantilla desconocido/u],
    ['{{{ rawHolder }}}', /Bloque de plantilla desconocido/u],
    ['<!--IF:secret-->x<!--ENDIF:secret-->', /Sección de plantilla desconocida/u],
    ['<!--IF:permanence-->x', /sin cerrar/u],
  ])('falla cerrado ante %s', (template, error) => {
    expect(() => fillContractTemplate(template, buildContractSnapshotFixture())).toThrow(error);
  });

  it('expone el cargo de instalación congelado; sin él o en instantáneas viejas, «No aplica»', () => {
    const base = buildContractSnapshotFixture();
    const frozen = { ...base, service: { ...base.service, installationFee: 150000 } };
    expect(buildContractTemplateValues(frozen)['service.installationFee']).toBe(
      formatMoney(150000),
    );
    const none = { ...base, service: { ...base.service, installationFee: null } };
    expect(buildContractTemplateValues(none)['service.installationFee']).toBe('No aplica');
    const { installationFee: _omitted, ...legacyService } = frozen.service;
    expect(
      buildContractTemplateValues({ ...base, service: legacyService })['service.installationFee'],
    ).toBe('No aplica');
  });

  it('escapa los caracteres HTML peligrosos', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&\``)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;',
    );
  });
});
