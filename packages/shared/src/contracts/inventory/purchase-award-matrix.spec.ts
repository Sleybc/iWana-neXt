import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PurchaseRequestAwardCoverage, PurchaseRequestLineStatus } from '../../enums/inventory';
import type {
  AwardMatrixCell,
  AwardMatrixCellState,
  AwardMatrixQuoteColumn,
  AwardMatrixRow,
  AwardSupplierSummary,
  CreateAwardsRequest,
  CreateAwardsResponse,
  PurchaseAwardErrorCode,
  PurchaseRequestAwardCoverage as PurchaseRequestAwardCoverageFromContract,
  PurchaseRequestLineAwardRecord,
  RevokeAwardRequest,
  RevokeAwardResponse,
} from './purchase-award-matrix.contract';

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const QUOTE_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const QUOTE_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PARTY_1 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PARTY_2 = '11111111-1111-4111-8111-111111111111';
const PARTY_3 = '22222222-2222-4222-8222-222222222222';
const AWARD_1 = '33333333-3333-4333-8333-333333333333';

describe('contrato purchase-award-matrix (MOD12 Compras, Fase 30 T0 — CONGELADO v1.0)', () => {
  it('expone el enum de cobertura con exactamente sus cinco valores derivados (ADR-087 D1)', () => {
    expect(Object.values(PurchaseRequestAwardCoverage)).toEqual([
      'NOT_AWARDED',
      'PARTIALLY_AWARDED',
      'FULLY_AWARDED',
      'PARTIALLY_ORDERED',
      'FULLY_ORDERED',
    ]);
  });

  it('re-exporta el eje de cobertura como tipo autocontenido del contrato', () => {
    // Asignación tipada: el tipo re-exportado por el contrato resuelve al enum.
    const coverage: PurchaseRequestAwardCoverageFromContract =
      PurchaseRequestAwardCoverage.PARTIALLY_AWARDED;
    expect(coverage).toBe('PARTIALLY_AWARDED');
  });

  it('fija los cinco estados de celda de la spec §4.3, sin sinónimos ni extras', () => {
    // Cada literal debe ser miembro del unión (compila) y el Record debe
    // cubrir TODOS los miembros (compila solo si la unión no crece).
    const states: AwardMatrixCellState[] = [
      'sin-cotizar',
      'disponible',
      'seleccionado',
      'adjudicado',
      'ordenado',
    ];
    const exhaustive: Record<AwardMatrixCellState, true> = {
      'sin-cotizar': true,
      disponible: true,
      seleccionado: true,
      adjudicado: true,
      ordenado: true,
    };

    expect(states).toHaveLength(5);
    expect(new Set(states).size).toBe(5);
    expect(Object.keys(exhaustive)).toHaveLength(5);
  });

  it('fija los siete códigos de error del flujo de adjudicación, exactos', () => {
    const codes: PurchaseAwardErrorCode[] = [
      'AWARD_QUOTE_MISMATCH',
      'AWARD_SUPPLIER_MISMATCH',
      'AWARD_QUOTE_LINE_MISSING',
      'AWARD_PARTY_CONFLICT',
      'AWARD_ALREADY_ORDERED',
      'ORDER_EXCEEDS_AWARD',
      'UNIT_COST_MISMATCH',
    ];
    const exhaustive: Record<PurchaseAwardErrorCode, true> = {
      AWARD_QUOTE_MISMATCH: true,
      AWARD_SUPPLIER_MISMATCH: true,
      AWARD_QUOTE_LINE_MISSING: true,
      AWARD_PARTY_CONFLICT: true,
      AWARD_ALREADY_ORDERED: true,
      ORDER_EXCEEDS_AWARD: true,
      UNIT_COST_MISMATCH: true,
    };

    expect(codes).toHaveLength(7);
    expect(new Set(codes).size).toBe(7);
    expect(Object.keys(exhaustive)).toHaveLength(7);
  });

  it('modela fila y columna de la matriz (spec §4.2) con cantidades e importes como cadena decimal', () => {
    const column: AwardMatrixQuoteColumn = {
      quoteId: QUOTE_1,
      supplierPartyRefId: PARTY_1,
      supplierLabel: 'Proveedor 1',
      quoteNumber: 'COT-2026-0193',
      currency: 'COP',
      payableAmount: '1234000.00',
      lines: {
        // La cotización cubre la línea A; la que no cubre no aparece (§6.4).
        [LINE_A]: { unitCost: '308500.00', lineAmount: '1234000.00' },
      },
    };

    const row: AwardMatrixRow = {
      purchaseRequestLineId: LINE_A,
      itemName: 'Router corporativo X',
      sku: 'RED-ROUTER-X',
      quantityRequested: '4.00',
      unitOfMeasure: 'UNIDAD',
      awardedQuantity: '4.00',
      awardedPartyRefId: PARTY_1,
      cells: {
        [QUOTE_1]: { state: 'adjudicado' },
        [QUOTE_2]: { state: 'disponible', cheapest: true },
      },
      awardedQuoteId: QUOTE_1,
    };

    // Celda: datos de precio viven en la columna, estado en la fila.
    expect(row.cells[QUOTE_1]?.state).toBe('adjudicado');
    expect(row.cells[QUOTE_2]?.cheapest).toBe(true);
    expect(column.lines[LINE_A]?.unitCost).toBe('308500.00');
    // «Más barato» solo aplica a disponible/seleccionado y solo con moneda compartida (§6.3).
    const cheapestCell: AwardMatrixCell | undefined = row.cells[QUOTE_2];
    expect(cheapestCell?.state).toBe('disponible');
    // Celda sin marcado: `cheapest` es opcional por claves, no por undefined.
    const bare: AwardMatrixCell = { state: 'disponible' };
    expect(bare.cheapest).toBeUndefined();
    expect(column.lines[LINE_B]).toBeUndefined();
  });

  it('modela el resumen en vivo por proveedor (spec §4.4) con totales separados por moneda (§6.3)', () => {
    const summaries: AwardSupplierSummary[] = [
      {
        supplierPartyRefId: PARTY_1,
        supplierLabel: 'Proveedor 1',
        productCount: 2,
        totalsByCurrency: [{ currency: 'COP', total: '1234000.00' }],
      },
      {
        supplierPartyRefId: PARTY_2,
        supplierLabel: 'Proveedor 2',
        productCount: 1,
        totalsByCurrency: [{ currency: 'USD', total: '320.00' }],
      },
    ];

    // Con monedas mixtas cada píldora totaliza por su propia moneda, nunca suma entre monedas.
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.totalsByCurrency[0]?.currency).toBe('COP');
    expect(summaries[1]?.totalsByCurrency[0]?.currency).toBe('USD');
    // El número de órdenes a generar es el tamaño del arreglo de resúmenes.
    expect(new Set(summaries.map((s) => s.supplierPartyRefId)).size).toBe(2);
  });

  it('soporta la creación en lote (§5.3) con la escotilla de proveedor sin cotización (§7)', () => {
    const request: CreateAwardsRequest = {
      awards: [
        {
          purchaseRequestLineId: LINE_A,
          supplierQuoteId: QUOTE_1,
          awardedPartyRefId: PARTY_1,
          awardedQuantity: '4.00',
        },
        {
          // Escotilla: sin cotización, el cliente aporta el costo unitario (§7).
          purchaseRequestLineId: LINE_B,
          awardedPartyRefId: PARTY_3,
          awardedQuantity: '2.00',
          unitCost: '150000.00',
          awardNotes: 'Compra directa sin cotización',
        },
      ],
    };

    expect(request.awards).toHaveLength(2);
    expect(request.awards[0]?.supplierQuoteId).toBe(QUOTE_1);
    expect(request.awards[0]?.unitCost).toBeUndefined(); // derivado en servidor
    expect(request.awards[1]?.supplierQuoteId).toBeUndefined();
    expect(request.awards[1]?.unitCost).toBe('150000.00');
    // Invariante §5.3: cada línea aparece como máximo una vez.
    const lineIds = request.awards.map((a) => a.purchaseRequestLineId);
    expect(new Set(lineIds).size).toBe(lineIds.length);
  });

  it('modela el eco de creación y la revocación con cobertura derivada', () => {
    const created: PurchaseRequestLineAwardRecord = {
      id: AWARD_1,
      purchaseRequestLineId: LINE_A,
      supplierQuoteId: QUOTE_1,
      awardedPartyRefId: PARTY_1,
      awardedQuantity: '4.00',
      unitCost: '308500.00',
      currency: 'COP',
      awardNotes: null,
      createdAt: '2026-09-11T12:00:00.000Z',
    };
    const createResponse: CreateAwardsResponse = {
      awards: [created],
      coverage: PurchaseRequestAwardCoverage.FULLY_AWARDED,
    };

    const path: RevokeAwardRequest = { requestId: REQUEST_ID, awardId: AWARD_1 };
    const revokeResponse: RevokeAwardResponse = {
      awardId: AWARD_1,
      lineStatusAfter: PurchaseRequestLineStatus.OPEN,
      coverage: PurchaseRequestAwardCoverage.NOT_AWARDED,
    };

    expect(createResponse.awards[0]?.id).toBe(AWARD_1);
    expect(createResponse.coverage).toBe('FULLY_AWARDED');
    expect(path.requestId).toBe(REQUEST_ID);
    // El literal fija el formato en el cable: el enum serializa exactamente 'OPEN'.
    expect(revokeResponse.lineStatusAfter).toBe('OPEN');
    expect(revokeResponse.coverage).toBe('NOT_AWARDED');
  });
});

describe('boundary del contrato purchase-award-matrix (solo tipos)', () => {
  it('no importa @iwana/api, next, react ni zod', () => {
    const source = readFileSync(join(__dirname, 'purchase-award-matrix.contract.ts'), 'utf8');

    // Especificadores reales de import/export-from (el mecanismo replica los
    // specs arquitectónicos del repo que barren código fuente, p. ej.
    // audit-direct-log-pii-keys.arch.spec.ts). El primer patrón tolera
    // cláusulas multilínea: `[^;]` cruza saltos de línea pero no el `;` que
    // cierra cada sentencia.
    const specifierPatterns = [
      /(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
      /(?:^|\n)\s*(?:import|export)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    const specifiers = specifierPatterns.flatMap((pattern) =>
      Array.from(source.matchAll(pattern), (match) => match[1] ?? ''),
    );

    // Sanidad: el barrido vio el import real del contrato.
    expect(specifiers).toContain('../../enums/inventory');

    const forbiddenRoots = ['@iwana/api', 'next', 'react', 'zod'];
    for (const specifier of specifiers) {
      for (const root of forbiddenRoots) {
        expect(specifier).not.toBe(root);
        expect(specifier.startsWith(`${root}/`)).toBe(false);
      }
    }
  });
});
