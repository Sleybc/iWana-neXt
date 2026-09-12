import { PurchaseRequestAwardCoverage, PurchaseRequestLineStatus } from '@iwana/shared';
import {
  resolveAwardCoverage,
  resolvePurchaseRequestConversion,
} from './purchase-request-award-coverage';

function line(lineStatus: PurchaseRequestLineStatus) {
  return { lineStatus };
}

describe('resolveAwardCoverage', () => {
  it('sin líneas devuelve NOT_AWARDED', () => {
    expect(resolveAwardCoverage([])).toBe(PurchaseRequestAwardCoverage.NOT_AWARDED);
  });

  it('con todas las líneas canceladas o rechazadas devuelve NOT_AWARDED', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.CANCELLED),
        line(PurchaseRequestLineStatus.REJECTED),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.NOT_AWARDED);
  });

  it('excluye CANCELLED y REJECTED del cálculo entre líneas elegibles', () => {
    // La cancelada/rechazada no cuentan: 2 AWARDED de 2 elegibles → FULLY_AWARDED.
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.CANCELLED),
        line(PurchaseRequestLineStatus.REJECTED),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.FULLY_AWARDED);
  });

  it('solo líneas OPEN o PENDING_QUOTE devuelve NOT_AWARDED', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.OPEN),
        line(PurchaseRequestLineStatus.PENDING_QUOTE),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.NOT_AWARDED);
  });

  it('todas las elegibles AWARDED devuelve FULLY_AWARDED', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.AWARDED),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.FULLY_AWARDED);
  });

  it('alguna AWARDED y queda alguna OPEN devuelve PARTIALLY_AWARDED', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.OPEN),
        line(PurchaseRequestLineStatus.PENDING_QUOTE),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.PARTIALLY_AWARDED);
  });

  it('todas las elegibles ordenadas o recibidas devuelve FULLY_ORDERED', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.PARTIALLY_RECEIVED),
        line(PurchaseRequestLineStatus.RECEIVED),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.FULLY_ORDERED);
  });

  it('caso canónico 2 de 4 ordenadas devuelve PARTIALLY_ORDERED', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.AWARDED),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.PARTIALLY_ORDERED);
  });

  it('lo ordenado gana sobre lo adjudicado pendiente aunque quede OPEN', () => {
    expect(
      resolveAwardCoverage([
        line(PurchaseRequestLineStatus.RECEIVED),
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.OPEN),
      ]),
    ).toBe(PurchaseRequestAwardCoverage.PARTIALLY_ORDERED);
  });
});

describe('resolvePurchaseRequestConversion', () => {
  it('sin líneas elegibles devuelve false', () => {
    expect(resolvePurchaseRequestConversion([])).toBe(false);
    expect(resolvePurchaseRequestConversion([line(PurchaseRequestLineStatus.CANCELLED)])).toBe(
      false,
    );
  });

  it('todas las elegibles ordenadas o recibidas devuelve true (ADR-087 propuesto, D3)', () => {
    expect(
      resolvePurchaseRequestConversion([
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.PARTIALLY_RECEIVED),
        line(PurchaseRequestLineStatus.RECEIVED),
        line(PurchaseRequestLineStatus.CANCELLED),
      ]),
    ).toBe(true);
  });

  it('basta una elegible AWARDED u OPEN para devolver false', () => {
    expect(
      resolvePurchaseRequestConversion([
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.AWARDED),
        line(PurchaseRequestLineStatus.AWARDED),
      ]),
    ).toBe(false);
    expect(
      resolvePurchaseRequestConversion([
        line(PurchaseRequestLineStatus.ORDERED),
        line(PurchaseRequestLineStatus.OPEN),
      ]),
    ).toBe(false);
  });
});
