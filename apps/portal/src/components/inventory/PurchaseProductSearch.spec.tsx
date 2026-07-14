import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemCategory, InventoryItemKind } from '@iwana/shared';
import type { InventoryCatalogOptionRecord } from '@/lib/api-client';
import { PurchaseProductSearch } from './PurchaseProductSearch';

const catalogOptions: InventoryCatalogOptionRecord[] = [
  {
    id: 'item-ont',
    sku: 'ONT-001',
    name: 'ONT WiFi 6',
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.SERIALIZED,
    unitOfMeasure: 'unidad',
    purchaseUnitOfMeasure: 'caja',
    standardCost: '120000',
    preferredSupplierRefId: 'supplier-1',
    preferredSupplierName: 'Proveedor Alfa',
    supplierSku: 'SUP-ONT',
  },
  {
    id: 'item-router',
    sku: 'RTR-002',
    name: 'Router WiFi 6',
    categoryId: 'cat-cpe',
    categoryName: 'CPE',
    categoryCode: 'CPE',
    category: InventoryItemCategory.CPE,
    itemKind: InventoryItemKind.SERIALIZED,
    unitOfMeasure: 'unidad',
    purchaseUnitOfMeasure: 'unidad',
    standardCost: '90000',
    preferredSupplierRefId: null,
    preferredSupplierName: null,
    supplierSku: null,
  },
];

describe('PurchaseProductSearch', () => {
  it('no muestra resultados hasta que se escribe una búsqueda', () => {
    render(<PurchaseProductSearch catalogOptions={catalogOptions} onSelect={jest.fn()} />);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filtra por nombre y muestra los resultados coincidentes', async () => {
    const user = userEvent.setup();
    render(<PurchaseProductSearch catalogOptions={catalogOptions} onSelect={jest.fn()} />);

    await user.type(screen.getByRole('combobox', { name: /Buscar producto/i }), 'router');

    expect(screen.getByRole('option', { name: /RTR-002 - Router WiFi 6/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /ONT-001/i })).not.toBeInTheDocument();
  });

  it('selecciona un resultado, dispara onSelect y limpia el input', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<PurchaseProductSearch catalogOptions={catalogOptions} onSelect={onSelect} />);

    const input = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(input, 'ONT');
    await user.click(screen.getByRole('option', { name: /ONT-001 - ONT WiFi 6/i }));

    expect(onSelect).toHaveBeenCalledWith(catalogOptions[0]);
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('permite seleccionar con teclado (flecha abajo + Enter)', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<PurchaseProductSearch catalogOptions={catalogOptions} onSelect={onSelect} />);

    const input = screen.getByRole('combobox', { name: /Buscar producto/i });
    await user.type(input, 'wifi 6');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith(catalogOptions[1]);
  });

  it('muestra estado vacío cuando no hay coincidencias', async () => {
    const user = userEvent.setup();
    render(<PurchaseProductSearch catalogOptions={catalogOptions} onSelect={jest.fn()} />);

    await user.type(screen.getByRole('combobox', { name: /Buscar producto/i }), 'no-existe');

    expect(screen.getByText(/No hay productos que coincidan/i)).toBeInTheDocument();
  });

  it('no entra en bucle infinito cuando el padre recrea onSearchChange en cada render (regresión)', async () => {
    jest.useFakeTimers();
    const onSearchChange = jest.fn();

    // Simula un padre real (como InventoryClient antes de memoizar onCatalogSearch):
    // cada vez que se dispara la búsqueda, el padre actualiza su propio estado y
    // vuelve a renderizar, recreando la prop onSearchChange con una nueva identidad.
    // Con el bug (efecto dependiente de la identidad del callback), esto reinicia el
    // debounce indefinidamente. Con el fix (ref), el efecto solo depende del texto.
    function Harness() {
      const [renderCount, setRenderCount] = useState(0);
      return (
        <PurchaseProductSearch
          catalogOptions={catalogOptions}
          onSelect={jest.fn()}
          onSearchChange={(search) => {
            onSearchChange(search, renderCount);
            setRenderCount((value) => value + 1);
          }}
        />
      );
    }

    const user = userEvent.setup({ delay: null });
    render(<Harness />);

    await user.type(screen.getByRole('combobox', { name: /Buscar producto/i }), 'router');

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenCalledTimes(1);

    // Si el efecto dependiera de la identidad de onSearchChange, el re-render disparado
    // por setRenderCount reiniciaría el timer y produciría una nueva llamada aquí.
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onSearchChange).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });
});
