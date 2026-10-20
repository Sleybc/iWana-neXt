import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemCategory, InventoryItemKind } from '@iwana/shared';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { PurchaseLinesEditor } from './PurchaseLinesEditor';
import { createEmptyPurchaseDraft, type PurchaseDraftState } from './purchase-request-draft';

const catalogOptions: InventoryCatalogOptionRecord[] = [
  {
    id: 'item-patch-cord',
    sku: 'PR-0002',
    name: 'Patch cord',
    categoryId: 'cat-fiber',
    categoryName: 'Fibra óptica',
    categoryCode: 'FIB',
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.SERIALIZED,
    unitOfMeasure: 'unidad',
    purchaseUnitOfMeasure: null,
    standardCost: '1200',
    preferredSupplierRefId: null,
    preferredSupplierName: null,
    supplierSku: null,
  },
];

function Harness() {
  const [draft, setDraft] = useState<PurchaseDraftState>(createEmptyPurchaseDraft());

  return (
    <>
      <label>
        Título
        <input aria-label="Título" />
      </label>
      <PurchaseLinesEditor
        draft={draft}
        onDraftChange={(updater) => setDraft(updater)}
        catalogOptions={catalogOptions}
      />
    </>
  );
}

describe('PurchaseLinesEditor', () => {
  it('enfoca Cantidad tras agregar un producto si el usuario no cambió el foco', async () => {
    const scheduledFrames: FrameRequestCallback[] = [];
    const requestFrame = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      });
    const user = userEvent.setup();

    try {
      render(<Harness />);

      await user.type(screen.getByRole('combobox', { name: /Buscar producto/i }), 'patch');
      await user.click(screen.getByRole('option', { name: /PR-0002 - Patch cord/i }));

      const quantityInput = screen.getByRole('textbox', {
        name: /Cantidad PR-0002 - Patch cord/i,
      });
      act(() => {
        scheduledFrames.forEach((callback) => callback(0));
      });

      expect(quantityInput).toHaveFocus();
      expect(requestFrame).toHaveBeenCalled();
    } finally {
      requestFrame.mockRestore();
    }
  });

  it('no roba el foco si el usuario pasa a otro campo antes del foco automático de cantidad', async () => {
    const scheduledFrames: FrameRequestCallback[] = [];
    const requestFrame = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      });
    const user = userEvent.setup();

    try {
      render(<Harness />);

      await user.type(screen.getByRole('combobox', { name: /Buscar producto/i }), 'patch');
      await user.click(screen.getByRole('option', { name: /PR-0002 - Patch cord/i }));

      const titleInput = screen.getByRole('textbox', { name: 'Título' });
      const quantityInput = screen.getByRole('textbox', {
        name: /Cantidad PR-0002 - Patch cord/i,
      });

      titleInput.focus();
      act(() => {
        scheduledFrames.forEach((callback) => callback(0));
      });

      expect(titleInput).toHaveFocus();
      expect(quantityInput).not.toHaveFocus();
      expect(requestFrame).toHaveBeenCalled();
    } finally {
      requestFrame.mockRestore();
    }
  });
});
