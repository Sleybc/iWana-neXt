import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PurchaseRequestLineSourceKind, PurchaseRequestLineStatus } from '@iwana/shared';
import type { PurchaseRequestLineRecord } from '@/lib/api-client';
import {
  buildQuoteLinesPayload,
  SupplierQuoteLinesEditor,
  sumQuoteLinesTotal,
} from './SupplierQuoteLinesEditor';

function buildLine(overrides: Partial<PurchaseRequestLineRecord> = {}): PurchaseRequestLineRecord {
  return {
    id: 'line-1',
    tenantId: 'tenant-1',
    purchaseRequestId: 'req-1',
    sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
    inventoryItemId: null,
    freeTextDescription: 'Cable UTP',
    quantityRequested: '10',
    unitOfMeasure: 'UND',
    suggestedPartyRefId: null,
    lineStatus: PurchaseRequestLineStatus.OPEN,
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SupplierQuoteLinesEditor', () => {
  it('renderiza líneas y calcula el total', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const lines = [
      buildLine({ id: 'line-1', freeTextDescription: 'Cable UTP', quantityRequested: '10' }),
      buildLine({ id: 'line-2', freeTextDescription: 'Conector RJ45', quantityRequested: '5' }),
    ];

    const { rerender } = render(
      <SupplierQuoteLinesEditor requestLines={lines} value={{}} onChange={onChange} />,
    );

    expect(screen.getByText('Cable UTP')).toBeInTheDocument();
    expect(screen.getByText('Conector RJ45')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Costo unitario de Cable UTP'), '1000');
    expect(onChange).toHaveBeenCalled();

    rerender(
      <SupplierQuoteLinesEditor
        requestLines={lines}
        value={{ 'line-1': '1000', 'line-2': '200' }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText(/Total de la cotización:/i)).toBeInTheDocument();
    expect(sumQuoteLinesTotal({ 'line-1': '1000', 'line-2': '200' }, lines)).toBe(11000);
  });

  it('buildQuoteLinesPayload omite costos vacíos o inválidos', () => {
    const lines = [
      buildLine({ id: 'line-1' }),
      buildLine({ id: 'line-2', freeTextDescription: 'Otro' }),
    ];

    expect(
      buildQuoteLinesPayload({ 'line-1': '1500', 'line-2': '', 'line-x': '9' }, lines),
    ).toEqual([{ purchaseRequestLineId: 'line-1', unitCost: 1500 }]);
  });
});
