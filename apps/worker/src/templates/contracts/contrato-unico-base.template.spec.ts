import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkContractTemplateHtml,
  ContractDocumentSnapshotSchema,
  type ContractDocumentSnapshot,
} from '@iwana/shared';
import { fillContractTemplate, formatMoney } from '../../contracts/contract-template';

/**
 * Plantilla semilla del contrato (cierre de venta, bloque A; spec G6, CA-6, CA-7).
 * Verifica que solo queden los módulos fijos, que esté marcada como prueba no publicada
 * y que rellene con el renderer del worker escapando los valores.
 */
/** Mismo nombre que `CONTRACT_TEMPLATE_FILE` del procesador (contract-pdf.processor.ts). */
const TEMPLATE = readFileSync(join(__dirname, 'contrato-servicio.base.html'), 'utf8');

function snapshot(overrides: Partial<ContractDocumentSnapshot> = {}): ContractDocumentSnapshot {
  return ContractDocumentSnapshotSchema.parse({
    snapshotVersion: 1,
    contractId: '10000000-0000-4000-8000-000000000001',
    executionOrderId: null,
    template: { legalTextId: '20000000-0000-4000-8000-000000000002', version: '0.1-prueba' },
    operator: {
      legalName: 'Operador Sintético SAS',
      nit: '900000001',
      qualityAndCoverageUrl: 'https://operador.example/calidad',
      customerServiceChannels: [{ kind: 'PHONE', value: '6015550000', label: null }],
      reconnectionFee: 15000,
      annualIncreaseCapPercent: 5,
      equipmentIncidentReportChannel: 'Línea de soporte',
      otherConditions: null,
    },
    holder: {
      fullName: 'Titular Sintético',
      documentType: 'CC',
      documentNumber: '1000000001',
      email: 'titular@example.invalid',
      phone: '3000000000',
    },
    service: {
      planId: 'plan-1',
      planName: 'Hogar 300',
      technology: 'FTTH',
      downloadMbps: 300,
      uploadMbps: 150,
      monthlyPrice: 80000,
      vatRatePercent: 19,
      vatAmount: 15200,
      monthlyTotal: 95200,
      stratum: 3,
      serviceUsage: 'RESIDENTIAL',
    },
    installation: { address: 'Calle 1 # 2-3', city: 'Medellín', department: 'Antioquia' },
    equipment: [{ serialNumber: 'SN-1', macAddress: null, model: 'ONT sintética' }],
    permanence: null,
    capturedAt: '2026-11-11T15:00:00.000Z',
    ...overrides,
  });
}

describe('Plantilla base del contrato único (servicios fijos)', () => {
  it('está marcada como versión de prueba no publicada', () => {
    expect(TEMPLATE).toContain('class="draft-banner"');
    expect(TEMPLATE).toMatch(/Versión de prueba — no publicada/u);
  });

  it('pasa la lista blanca de HTML con la que se publica y se renderiza (SEC-2/SEC-4)', () => {
    expect(checkContractTemplateHtml(TEMPLATE)).toEqual({ ok: true });
  });

  it.each([
    'Condiciones comerciales plan servicios móviles',
    'VALOR MENSUAL PLAN<br>SERVICIOS MÓVILES',
    'Para los servicios móviles',
    'portación',
    'Servicios móviles:</b>',
    'Costo reconexión servicios móviles',
    'Sobre tus servicios móviles',
    'Contenidos y aplicaciones',
    'Portabilidad numérica móvil',
    'roaming',
    'Larga distancia (telefonía)',
    'Línea o número móvil',
  ])('no conserva el módulo móvil o no aplicable: %s', (fragment) => {
    expect(TEMPLATE).not.toContain(fragment);
  });

  it('conserva el texto fijo de los módulos de servicios fijos', () => {
    for (const fragment of [
      'Principales obligaciones del usuario',
      'Si no respondemos es porque aceptamos su petición o reclamo.',
      'Esto se llama silencio administrativo positivo.',
      'Ley 679 de 2001',
      'Usted puede cambiar de domicilio y continuar con el servicio siempre que sea técnicamente posible.',
    ]) {
      expect(TEMPLATE).toContain(fragment);
    }
  });

  it('declara la familia tipográfica Calibri con Carlito como sustituta métrica', () => {
    expect(TEMPLATE).toMatch(/font-family:\s*Calibri,\s*Carlito,/u);
  });

  it('no contiene scripts ni manejadores de eventos', () => {
    expect(TEMPLATE).not.toMatch(/<\s*script|\son[a-z]+\s*=|javascript\s*:/iu);
  });

  it('rellena todos los marcadores y omite la permanencia si no se pactó (CA-7)', () => {
    const html = fillContractTemplate(TEMPLATE, snapshot());
    expect(html).not.toMatch(/\{\{|<!--(IF|ENDIF):/u);
    expect(html).toContain('Operador Sintético SAS');
    expect(html).toContain('Hogar 300');
    expect(html).toContain('6015550000');
    expect(html).not.toContain('Cláusula de permanencia mínima');
    expect(html).not.toContain('Otras condiciones');
  });

  it('muestra el cargo de instalación en las condiciones comerciales; sin cargo, «Sin cargo» (R5)', () => {
    const section = (html: string) =>
      html.slice(
        html.indexOf('Condiciones comerciales plan servicios fijos'),
        html.indexOf('<!-- PÁGINA 2 -->'),
      );
    const base = snapshot();
    const charged = fillContractTemplate(
      TEMPLATE,
      snapshot({ service: { ...base.service, installationFee: 150000 } }),
    );
    expect(section(charged)).toContain('CARGO DE INSTALACIÓN');
    expect(section(charged)).toContain(formatMoney(150000));
    for (const installationFee of [0, null]) {
      const free = fillContractTemplate(
        TEMPLATE,
        snapshot({ service: { ...base.service, installationFee } }),
      );
      expect(section(free)).toContain('Sin cargo');
    }
  });

  describe('IVA congelado de instalación y adicionales (spec MOD14 2026-11-12)', () => {
    const section = (html: string) =>
      html.slice(
        html.indexOf('Condiciones comerciales plan servicios fijos'),
        html.indexOf('<!-- PÁGINA 2 -->'),
      );
    const base = snapshot();
    const render = (service: Partial<ContractDocumentSnapshot['service']>) =>
      section(
        fillContractTemplate(TEMPLATE, snapshot({ service: { ...base.service, ...service } })),
      );

    it('instalación gravada: base, IVA 19 % y total', () => {
      const html = render({
        installationFee: 100000,
        installationVat: {
          vatTreatment: 'STANDARD' as never,
          vatRatePercent: 19,
          vatLegalBasis: 'ET_468',
        },
      });
      expect(html).toContain(formatMoney(100000));
      expect(html).toContain('IVA INSTALACIÓN (19 %)');
      expect(html).toContain(formatMoney(19000));
      expect(html).toContain('TOTAL INSTALACIÓN');
      expect(html).toContain(formatMoney(119000));
    });

    it.each([
      ['EXEMPT', 'Exento (0 %) · ET 476 7'],
      ['EXCLUDED', 'Excluido · ET 476 7'],
    ])(
      'instalación %s: muestra el tratamiento y su base legal; total = base',
      (treatment, label) => {
        const html = render({
          installationFee: 100000,
          installationVat: {
            vatTreatment: treatment as never,
            vatRatePercent: 0,
            vatLegalBasis: 'ET_476_7',
          },
        });
        expect(html).toContain(label);
        expect(html).toMatch(/TOTAL INSTALACIÓN<\/td><td class="val">\$\s?100\.000/u);
      },
    );

    it('instantánea previa sin IVA congelado: solo el valor de instalación', () => {
      const html = render({ installationFee: 150000 });
      expect(html).toContain(formatMoney(150000));
      expect(html).not.toContain('IVA INSTALACIÓN');
    });

    it('adicionales: precio, IVA y total; legado sin precio «Sin cobro»; sin adicionales «No contratado»', () => {
      const html = render({
        additionals: [
          {
            name: 'Router <mesh>',
            unitPrice: 50000,
            vatTreatment: 'STANDARD' as never,
            vatRatePercent: 19,
            vatLegalBasis: 'ET_468',
          },
          {
            name: 'Soporte',
            unitPrice: 20000,
            vatTreatment: 'EXCLUDED' as never,
            vatRatePercent: 0,
            vatLegalBasis: 'ET_476_7',
          },
          {
            name: null,
            unitPrice: null,
            vatTreatment: 'STANDARD' as never,
            vatRatePercent: 19,
            vatLegalBasis: 'ET_468',
          },
        ],
      });
      expect(html).toContain('Router &lt;mesh&gt;');
      expect(html).toContain(`IVA 19 % ${formatMoney(9500)}`);
      expect(html).toContain(`Total ${formatMoney(59500)}`);
      expect(html).toContain('IVA Excluido · ET 476 7');
      expect(html).toContain(`Total ${formatMoney(20000)}`);
      expect(html).toContain('Adicional · Sin cobro');
      expect(render({ additionals: [] })).toContain('No contratado');
      expect(render({})).not.toContain('Descripción');
    });
  });

  it('muestra la permanencia con su tabla mes a mes cuando se pactó', () => {
    const schedule = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      amount: 120000 - index * 10000,
    }));
    const html = fillContractTemplate(
      TEMPLATE,
      snapshot({
        permanence: {
          months: 12,
          connectionFee: 150000,
          discountedOrDeferredAmount: 120000,
          startDate: '2026-11-12',
          endDate: '2027-11-12',
          schedule,
        },
      }),
    );
    expect(html).toContain('Cláusula de permanencia mínima');
    expect(html).toContain('12/11/2026');
    expect(html.match(/<tr><td>\d+<\/td><td>\$/gu)).toHaveLength(12);
  });

  it('escapa los valores: un nombre con HTML no inyecta marcado', () => {
    const html = fillContractTemplate(
      TEMPLATE,
      snapshot({
        holder: {
          fullName: '<img src=x onerror=alert(1)>',
          documentType: 'CC',
          documentNumber: '1',
          email: null,
          phone: null,
        },
        operator: {
          ...snapshot().operator,
          otherConditions: '<script>alert(1)</script> {{ holder.fullName }}',
        },
      }),
    );
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Otras condiciones');
  });
});
