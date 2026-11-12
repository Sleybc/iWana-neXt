import { createHmac } from 'node:crypto';
import type { MigrationMappingAction, MigrationMappingKind } from '@iwana/shared';
import {
  SYNTHETIC_METHOD_ID,
  buildSyntheticUispZip,
  type UispFixtureOptions,
} from '../test/uisp-zip.fixture';
import { readZipEntries } from '../zip/safe-zip-reader';
import { parseUispPackage, type ParseUispResult } from './uisp-parser';
import {
  buildMappingIndex,
  collectTitularKeys,
  coordinatesInColombia,
  extractTitularFacts,
  simulateBatch,
  type SimulationContext,
} from './uisp-simulation';

const hmacKey = Buffer.alloc(32, 7);
const hmacOf = (value: string) => createHmac('sha256', hmacKey).update(value).digest('hex');

const FULL_MAPPINGS: Array<{
  kind: MigrationMappingKind;
  externalValue: string;
  action: MigrationMappingAction;
}> = [
  { kind: 'PLAN', externalValue: '501', action: 'EQUIVALE' },
  { kind: 'PLAN', externalValue: '502', action: 'EQUIVALE' },
  { kind: 'CICLO', externalValue: '5', action: 'EQUIVALE' },
  { kind: 'METODO_PAGO', externalValue: SYNTHETIC_METHOD_ID, action: 'EQUIVALE' },
  { kind: 'ETIQUETA', externalValue: '11', action: 'DESCARTAR' },
];

function context(overrides: Partial<SimulationContext> = {}): SimulationContext {
  return {
    mappings: buildMappingIndex(FULL_MAPPINGS),
    hmacOf,
    existingHmacs: new Set(),
    anonymizedExternalIds: new Set(),
    importedExternalIds: new Set(),
    ...overrides,
  };
}

async function parsed(options: UispFixtureOptions = {}): Promise<ParseUispResult> {
  return parseUispPackage(await readZipEntries(await buildSyntheticUispZip(options)));
}

describe('simulateBatch — validación y rechazos por motivo (ADR-110 D4, D11)', () => {
  it('con todas las equivalencias, todo es válido y se cuentan tareas sin fuente', async () => {
    const result = simulateBatch([await parsed()], context());
    expect(result.counts.entidades).toEqual({
      SUSCRIPTOR: { leidos: 1, validos: 1, rechazados: 0 },
      CONTRATO: { leidos: 2, validos: 2, rechazados: 0 },
      DOCUMENTO_COBRO: { leidos: 3, validos: 3, rechazados: 0 },
      PAGO: { leidos: 2, validos: 2, rechazados: 0 },
      TICKET: { leidos: 2, validos: 2, rechazados: 0 },
      SOPORTE_DOCUMENTAL: { leidos: 2, validos: 2, rechazados: 0 },
    });
    expect(result.counts.tareasSinFuente).toBe(3);
    expect(result.counts.observaciones).toEqual({
      TAREAS_SIN_FUENTE: 1,
      ESTRATO_PENDIENTE_EVIDENCIA: 1,
      FACTURA_SIN_PDF: 1,
    });
    expect(result.rejections).toEqual({});
    expect(result.counts.pendientesEquivalencia).toEqual([]);
    expect(result.counts.archivos).toEqual({ recibidos: 1, leidos: 1, rechazados: {} });
  });

  it('usa external_id uisp:<entidad>:<id> y un código estable para documentos', async () => {
    const first = simulateBatch([await parsed()], context());
    const second = simulateBatch([await parsed()], context());
    const ids = first.records.map((record) => record.externalId);
    expect(ids).toContain('uisp:client:9001');
    expect(ids).toContain('uisp:service:90010');
    expect(ids).toContain('uisp:invoice:900101');
    expect(ids).toContain('uisp:payment:9001001');
    expect(ids).toContain('uisp:ticket:90010001');
    const documents = first.records.filter((record) => record.entity === 'SOPORTE_DOCUMENTAL');
    for (const document of documents) {
      expect(document.externalId).toMatch(/^uisp:document:9001-[0-9a-f]{24}$/u);
      expect(document.externalId).not.toMatch(/contrato|foto/u);
    }
    expect(second.records.map((record) => record.externalId)).toEqual(ids);
    for (const id of ids) expect(id).toMatch(/^uisp:[a-z_]+:[A-Za-z0-9._-]{1,64}$/u);
  });

  it('sin equivalencias rechaza por motivo y lista los pendientes sin inventar', async () => {
    const result = simulateBatch([await parsed()], context({ mappings: new Map() }));
    expect(result.rejections).toEqual({
      SUSCRIPTOR: { ETIQUETA_SIN_EQUIVALENCIA: 1 },
      CONTRATO: { PLAN_SIN_EQUIVALENCIA: 2 },
      PAGO: { METODO_PAGO_SIN_EQUIVALENCIA: 2 },
      DOCUMENTO_COBRO: { DEPENDE_DE_TITULAR_RECHAZADO: 3 },
      TICKET: { DEPENDE_DE_TITULAR_RECHAZADO: 2 },
      SOPORTE_DOCUMENTAL: { DEPENDE_DE_TITULAR_RECHAZADO: 2 },
    });
    expect(result.counts.pendientesEquivalencia).toEqual([
      { kind: 'CICLO', externalValue: '5', externalLabel: null, occurrences: 2 },
      { kind: 'ETIQUETA', externalValue: '11', externalLabel: 'Etiqueta 11', occurrences: 1 },
      {
        kind: 'METODO_PAGO',
        externalValue: SYNTHETIC_METHOD_ID,
        externalLabel: null,
        occurrences: 2,
      },
      { kind: 'PLAN', externalValue: '501', externalLabel: 'Plan sintético 501', occurrences: 1 },
      { kind: 'PLAN', externalValue: '502', externalLabel: 'Plan sintético 502', occurrences: 1 },
    ]);
  });

  it('ciclo sin equivalencia rechaza el contrato con su motivo', async () => {
    const result = simulateBatch([await parsed({ cycleDay: 30 })], context());
    expect(result.rejections.CONTRATO).toEqual({ CICLO_SIN_EQUIVALENCIA: 2 });
  });

  it('documento inválido o ausente → cola de datos fiscales y rechazo anticipado de CRM', async () => {
    // La promoción no puede crear el titular sin documento (`chk_subscriber_person_fields`):
    // la simulación lo anticipa con la misma regla en lugar de dejarlo para la promoción.
    const invalid = simulateBatch([await parsed({ document: 'ABC-12' })], context());
    const missing = simulateBatch([await parsed({ document: null })], context());
    for (const result of [invalid, missing]) {
      expect(result.counts.observaciones.DATOS_FISCALES_INCOMPLETOS).toBe(1);
      expect(result.rejections.SUSCRIPTOR).toEqual({ DATOS_OBLIGATORIOS_AUSENTES: 1 });
      expect(result.rejections.CONTRATO).toEqual({ DEPENDE_DE_TITULAR_RECHAZADO: 2 });
      const titular = result.records.find((record) => record.entity === 'SUSCRIPTOR')!;
      expect((titular.payload.derived as { queues: string[] }).queues).toContain(
        'DATOS_FISCALES_INCOMPLETOS',
      );
    }
  });

  it('coordenadas fuera de Colombia se descartan y van a datos incompletos', async () => {
    const result = simulateBatch([await parsed({ lat: 40.4, lon: -3.7 })], context());
    expect(result.counts.observaciones.COORDENADAS_FUERA_DE_COLOMBIA).toBe(1);
    const titular = result.records.find((record) => record.entity === 'SUSCRIPTOR')!;
    expect(titular.status).toBe('VALIDO');
    expect(titular.payload.derived).toMatchObject({
      coordinatesDiscarded: true,
      queues: ['DATOS_INCOMPLETOS'],
    });
  });

  it('titular existente por HMAC → conflicto, nunca fusión', async () => {
    const result = simulateBatch(
      [await parsed({ document: '1.000.000.001' })],
      context({ existingHmacs: new Set([hmacOf('1000000001')]) }),
    );
    expect(result.rejections.SUSCRIPTOR).toEqual({ TITULAR_EXISTENTE: 1 });
    expect(result.rejections.CONTRATO).toEqual({ DEPENDE_DE_TITULAR_RECHAZADO: 2 });
  });

  it('titular ya importado por external_id no es conflicto: observación', async () => {
    const result = simulateBatch(
      [await parsed()],
      context({
        existingHmacs: new Set([hmacOf('1000000001')]),
        importedExternalIds: new Set(['uisp:client:9001']),
      }),
    );
    expect(result.rejections.SUSCRIPTOR).toBeUndefined();
    expect(result.counts.observaciones.YA_IMPORTADO).toBe(1);
  });

  it('titular anonimizado → rechazo', async () => {
    const result = simulateBatch(
      [await parsed()],
      context({ anonymizedExternalIds: new Set(['uisp:client:9001']) }),
    );
    expect(result.rejections.SUSCRIPTOR).toEqual({ TITULAR_ANONIMIZADO: 1 });
  });

  it('estrato entra pendiente de evidencia y no fija IVA', async () => {
    const result = simulateBatch([await parsed({ stratum: '2' })], context());
    const titular = result.records.find((record) => record.entity === 'SUSCRIPTOR')!;
    expect(titular.payload.derived).toMatchObject({ stratum: { value: 2, evidence: 'PENDIENTE' } });
    expect(JSON.stringify(titular.payload.derived)).not.toMatch(/vat|iva/iu);
  });

  it('archivo rechazado y cliente repetido cuentan por motivo de archivo', async () => {
    const result = simulateBatch(
      [await parsed(), { ok: false, reason: 'ZIP_RUTA_NO_PERMITIDA' }, await parsed()],
      context(),
    );
    expect(result.counts.archivos).toEqual({
      recibidos: 3,
      leidos: 1,
      rechazados: { ZIP_RUTA_NO_PERMITIDA: 1, CLIENTE_REPETIDO: 1 },
    });
    expect(result.counts.entidades.SUSCRIPTOR!.leidos).toBe(1);
  });

  it('registro de otro cliente o sin id → DATOS_INVALIDOS', () => {
    const entries = new Map<string, Buffer>([
      [
        'client.json',
        Buffer.from(
          '{"id":1,"tags":[],"firstName":"A","lastName":"B","attributes":[{"name":"Cédula","value":"1000000009"},{"name":"Estrato","value":"2"}]}',
        ),
      ],
      [
        'payments.json',
        Buffer.from(`[{"id":7,"clientId":2,"methodId":"${SYNTHETIC_METHOD_ID}"},{"x":1}]`),
      ],
    ]);
    const result = simulateBatch([parseUispPackage(entries)], context());
    expect(result.rejections.PAGO).toEqual({ DATOS_INVALIDOS: 2 });
    expect(result.records.map((record) => record.externalId)).toContain('uisp:payment:sin-id-0-1');
  });

  it('id duplicado dentro del paquete se cuenta pero no se guarda dos veces', () => {
    const entries = new Map<string, Buffer>([
      [
        'client.json',
        Buffer.from(
          '{"id":1,"tags":[],"firstName":"A","lastName":"B","attributes":[{"name":"Cédula","value":"1000000009"},{"name":"Estrato","value":"2"}]}',
        ),
      ],
      ['tickets.json', Buffer.from('[{"id":3},{"id":3}]')],
    ]);
    const result = simulateBatch([parseUispPackage(entries)], context());
    expect(result.rejections.TICKET).toEqual({ EXTERNAL_ID_DUPLICADO: 1 });
    expect(result.records.filter((record) => record.entity === 'TICKET')).toHaveLength(1);
  });

  it('DATOS_OBLIGATORIOS_AUSENTES: natural sin estrato o nombres, jurídica sin razón social', async () => {
    const noStratum = simulateBatch([await parsed({ stratum: null })], context());
    const noNames = simulateBatch([await parsed({ firstName: '  ', lastName: null })], context());
    const juridicaSinRazon = simulateBatch(
      [await parsed({ clientType: 2, document: '900123456-7' })],
      context(),
    );
    for (const result of [noStratum, noNames, juridicaSinRazon]) {
      expect(result.rejections.SUSCRIPTOR).toEqual({ DATOS_OBLIGATORIOS_AUSENTES: 1 });
      expect(result.rejections.PAGO).toEqual({ DEPENDE_DE_TITULAR_RECHAZADO: 2 });
    }
    // Jurídica con NIT y razón social: sin estrato ni nombres es válida.
    const juridica = simulateBatch(
      [
        await parsed({
          clientType: 2,
          document: '900123456-7',
          stratum: null,
          firstName: null,
          lastName: null,
          companyName: 'Empresa Ficticia',
        }),
      ],
      context(),
    );
    expect(juridica.rejections.SUSCRIPTOR).toBeUndefined();
    // Ya importado: la promoción reutiliza el existente; no se rechaza por datos.
    const imported = simulateBatch(
      [await parsed({ stratum: null })],
      context({ importedExternalIds: new Set(['uisp:client:9001']) }),
    );
    expect(imported.rejections.SUSCRIPTOR).toBeUndefined();
  });

  it('CICLO_SIN_EQUIVALENCIA si el día destino no está activo en CRM', async () => {
    const inactive = simulateBatch(
      [await parsed()],
      context({ cycles: { targetDayOf: new Map([['5', 5]]), activeDays: new Set([10]) } }),
    );
    expect(inactive.rejections.CONTRATO).toEqual({ CICLO_SIN_EQUIVALENCIA: 2 });
    // Con equivalencia: no es un valor pendiente de mapear.
    expect(inactive.counts.pendientesEquivalencia).toEqual([]);
    const noTarget = simulateBatch(
      [await parsed()],
      context({ cycles: { targetDayOf: new Map([['5', null]]), activeDays: new Set([5]) } }),
    );
    expect(noTarget.rejections.CONTRATO).toEqual({ CICLO_SIN_EQUIVALENCIA: 2 });
    const active = simulateBatch(
      [await parsed()],
      context({ cycles: { targetDayOf: new Map([['5', 5]]), activeDays: new Set([5]) } }),
    );
    expect(active.rejections.CONTRATO).toBeUndefined();
  });

  it('el informe no contiene datos del titular', async () => {
    const result = simulateBatch([await parsed()], context({ mappings: new Map() }));
    const report = JSON.stringify({ counts: result.counts, rejections: result.rejections });
    for (const pii of [
      '1000000001',
      'Titular',
      'Sintético',
      'example.invalid',
      '3000000000',
      'Ficticia',
    ]) {
      expect(report).not.toContain(pii);
    }
  });
});

describe('extracción de datos del titular', () => {
  it('NIT con dígito de verificación y CC con separadores', () => {
    expect(
      extractTitularFacts({
        id: 1,
        clientType: 2,
        attributes: [{ key: 'nit', value: '900.123.456-7' }],
      }),
    ).toEqual({ documentType: 'NIT', documentNumber: '900123456', stratum: null });
    expect(
      extractTitularFacts({
        id: 1,
        clientType: 1,
        attributes: [{ name: 'Cédula', value: '1.234.567' }],
      }),
    ).toMatchObject({ documentType: 'CC', documentNumber: '1234567' });
    expect(
      extractTitularFacts({ id: 1, attributes: [{ name: 'Cédula', value: '0000000' }] })
        .documentNumber,
    ).toBeNull();
    expect(
      extractTitularFacts({ id: 1, attributes: [{ name: 'Estrato', value: '9' }] }).stratum,
    ).toBeNull();
  });

  it('límites geográficos de Colombia', () => {
    expect(coordinatesInColombia(4.6, -74.08)).toBe(true);
    expect(coordinatesInColombia('12.58', '-81.7')).toBe(true);
    expect(coordinatesInColombia(0, 0)).toBe(false);
    expect(coordinatesInColombia(null, -74)).toBeNull();
  });

  it('collectTitularKeys reúne documentos válidos y external_id', async () => {
    const keys = collectTitularKeys([await parsed(), { ok: false, reason: 'JSON_INVALIDO' }]);
    expect(keys).toEqual({ documents: ['1000000001'], externalIds: ['uisp:client:9001'] });
  });
});
