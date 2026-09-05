import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import {
  InventoryCategoryStatus,
  InventoryItemKind,
  InventoryItemStatus,
  InventoryTrackingMode,
} from '@iwana/shared';
import type { InventoryCategoryRecord } from '@/lib/api-client';
import { InventoryCreateProductDialog } from './InventoryCreateProductDialog';

function buildCategory(overrides: Partial<InventoryCategoryRecord> = {}): InventoryCategoryRecord {
  return {
    id: 'category-001',
    tenantId: 'tenant-001',
    code: 'NETWORKING',
    codePrefix: 'NET',
    name: 'Networking',
    description: null,
    status: InventoryCategoryStatus.ACTIVE,
    sortOrder: 0,
    productCount: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(
  overrides: Partial<ComponentProps<typeof InventoryCreateProductDialog>> = {},
) {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  const onCreateCategoryClick = jest.fn();

  render(
    <InventoryCreateProductDialog
      open={true}
      categories={[buildCategory()]}
      isSubmitting={false}
      error={null}
      onClose={onClose}
      onSubmit={onSubmit}
      onCreateCategoryClick={onCreateCategoryClick}
      {...overrides}
    />,
  );

  return { onSubmit, onClose, onCreateCategoryClick };
}

describe('InventoryCreateProductDialog', () => {
  it('renders the main quick-create fields', async () => {
    renderDialog();

    expect(await screen.findByRole('dialog', { name: 'Nuevo producto' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Crea un producto para agregarlo al catálogo. Podrás completar compras, inventario y activos fijos después.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Nombre/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Categoría/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Tipo de producto/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Control de material/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Unidad de medida/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear producto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('does not render a sku field', async () => {
    renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument();
  });

  it('shows required validation feedback before submitting', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(await screen.findByText('Revisa el formulario')).toBeInTheDocument();
    expect(screen.getByText('Completa el nombre antes de crear el producto.')).toBeInTheDocument();
    expect(screen.getByText('Completa el nombre del producto.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the minimum payload with the expected defaults', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'Router GPON' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Router GPON',
        categoryId: 'category-001',
        itemKind: InventoryItemKind.STOCK,
        trackingMode: InventoryTrackingMode.CONSUMABLE,
        unitOfMeasure: 'UNIT',
        description: null,
        brand: null,
        model: null,
        barcode: null,
        barcodeType: null,
        purchasable: true,
        inventoryControlled: true,
        status: InventoryItemStatus.ACTIVE,
      });
    });

    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty('sku');
  });

  it('shows the composed code preview while creating a product', async () => {
    renderDialog({
      categories: [buildCategory({ codePrefix: 'CFO', name: 'Consumibles FO' })],
    });

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT Huawei' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: /^Tipo de producto/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Con serial' }));

    await waitFor(() => {
      expect(screen.getByText('Código sugerido')).toBeInTheDocument();
      expect(screen.getByText('CFO-SER-ONTHW')).toBeInTheDocument();
    });
  });

  it('ofrece la unidad base desde el catálogo canónico y envía su código (F5a)', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    // Ya no es texto libre: es selección con etiquetas en español.
    expect(screen.queryByRole('textbox', { name: /^Unidad de medida/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'Cable drop' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: /^Unidad de medida/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Caja' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Cable drop', unitOfMeasure: 'BOX' }),
      );
    });
  });

  it('muestra marca y modelo fuera del acordeón, antes del código sugerido, con copy veraz', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog', { name: 'Nuevo producto' });

    expect(screen.getByText('Agregar descripción')).toBeInTheDocument();
    expect(
      screen.getByText('La puedes completar más adelante. No forma parte del código del producto.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Opcional. Ambos forman parte del código del producto, que no se puede modificar después.',
      ),
    ).toBeInTheDocument();

    const marcaInput = screen.getByRole('textbox', { name: 'Marca' });
    const modeloInput = screen.getByRole('textbox', { name: 'Modelo' });
    const details = dialog.querySelector('details');

    expect(details).not.toBeNull();
    expect(details?.contains(marcaInput)).toBe(false);
    expect(details?.contains(modeloInput)).toBe(false);

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'Router GPON' },
    });

    const codigoSugerido = await screen.findByText('Código sugerido');
    expect(
      marcaInput.compareDocumentPosition(codigoSugerido) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      modeloInput.compareDocumentPosition(codigoSugerido) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the barcode fields as optional with Spanish format labels (F4)', async () => {
    renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    expect(screen.getByRole('textbox', { name: 'Código de barras' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Formato del código' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Opcional. Sirve para identificar el producto al recibir, contar y despachar. No forma parte del código del producto.',
      ),
    ).toBeInTheDocument();
  });

  it('F4: acepta EAN13 válido y lo envía junto a su formato (CA-F4-01)', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT WiFi 6' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '4006381333931' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'EAN-13' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '4006381333931', barcodeType: 'EAN13' }),
      );
    });
  });

  it('F4: acepta UPC-A válido (036000291452) junto a su formato', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT WiFi 6' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '036000291452' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'UPC-A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '036000291452', barcodeType: 'UPCA' }),
      );
    });
  });

  it('F4: rechaza EAN13 con dígito de control inválido (8412345678904, CA-F4-03)', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT WiFi 6' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '8412345678904' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'EAN-13' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(
      await screen.findByText(
        'El dígito de control del código EAN13 no es válido: revisa que el número esté completo y sin errores de tecleo.',
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('F4: rechaza UPC-A con dígito de control inválido (036000291453)', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT WiFi 6' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '036000291453' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'UPC-A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(
      await screen.findByText(
        'El dígito de control del código UPCA no es válido: revisa que el número esté completo y sin errores de tecleo.',
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('F4: rechaza código sin formato (pareja a medias, CA-F4-08)', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT WiFi 6' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Código de barras' }), {
      target: { value: '4006381333931' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(
      await screen.findByText('Indica el formato del código: el formato va junto al código.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('F4: rechaza formato sin código (pareja a medias, CA-F4-08)', async () => {
    const { onSubmit } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'ONT WiFi 6' },
    });
    fireEvent.click(screen.getByRole('combobox', { name: 'Formato del código' }));
    fireEvent.click(await screen.findByRole('option', { name: 'EAN-13' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));

    expect(
      await screen.findByText('Indica el código junto al formato, o deja ambos vacíos.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders submit errors with PortalAlert', async () => {
    renderDialog({ error: 'No se pudo guardar el producto.' });

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    expect(screen.getByText('No fue posible crear el producto')).toBeInTheDocument();
    expect(screen.getByText('No se pudo guardar el producto.')).toBeInTheDocument();
  });

  it('renders and triggers the inline category affordance', async () => {
    const { onCreateCategoryClick } = renderDialog({
      categoryInlineContent: <div>Formulario inline de categoría</div>,
    });

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.click(screen.getByRole('button', { name: 'Crear categoría aquí' }));

    expect(onCreateCategoryClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Formulario inline de categoría')).toBeInTheDocument();
  });

  it('cierra directo cuando el formulario está pristine', async () => {
    const { onClose } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Descartar cambios' })).not.toBeInTheDocument();
  });

  it('pide confirmación antes de descartar cambios sin guardar', async () => {
    const { onClose } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'Router GPON' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('descarta los cambios y cierra al confirmar', async () => {
    const { onClose } = renderDialog();

    await screen.findByRole('dialog', { name: 'Nuevo producto' });

    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'Router GPON' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await screen.findByRole('dialog', { name: 'Descartar cambios' });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('usa layout de dos columnas con spans full en Nombre/Categoría/Unidad/well/details (MOD12 dos columnas)', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog', { name: 'Nuevo producto' });
    const grid = dialog.querySelector('div.grid') as HTMLElement | null;

    expect(grid).not.toBeNull();
    expect(grid?.className).toMatch(/grid-cols-1/);
    expect(grid?.className).toMatch(/gap-4/);
    expect(grid?.className).toMatch(/md:grid-cols-2/);
    expect(grid?.className).not.toMatch(/space-y-4/);

    function gridItemOf(element: Element | null): Element | null {
      let current = element?.parentElement ?? null;
      while (current && current.parentElement !== grid) {
        current = current.parentElement;
      }
      return current;
    }

    const nombreItem = gridItemOf(screen.getByRole('textbox', { name: /^Nombre/ }));
    expect(nombreItem?.className).toMatch(/md:col-span-2/);

    const categoriaItem = gridItemOf(screen.getByRole('combobox', { name: /^Categoría/ }));
    expect(categoriaItem?.className).toMatch(/md:col-span-2/);
    expect(categoriaItem?.className).toMatch(/space-y-2/);

    const unidadItem = gridItemOf(screen.getByRole('combobox', { name: /^Unidad de medida/ }));
    expect(unidadItem?.className).toMatch(/md:col-span-2/);

    // La preview (well) aparece tras sus 5 inputs; el details es full y va al final.
    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), {
      target: { value: 'Router GPON' },
    });
    const codigoSugerido = await screen.findByText('Código sugerido');
    const wellItem = gridItemOf(codigoSugerido);
    expect(wellItem?.className).toMatch(/md:col-span-2/);

    const details = dialog.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.className).toMatch(/md:col-span-2/);
    expect(details?.parentElement).toBe(grid);
  });

  it('empareja Marca|Modelo y Código|Formato en la misma fila sin reordenar el DOM (MOD12 dos columnas)', async () => {
    renderDialog();

    const dialog = await screen.findByRole('dialog', { name: 'Nuevo producto' });
    const grid = dialog.querySelector('div.grid') as HTMLElement | null;
    expect(grid).not.toBeNull();

    function gridItemOf(element: Element | null): Element | null {
      let current = element?.parentElement ?? null;
      while (current && current.parentElement !== grid) {
        current = current.parentElement;
      }
      return current;
    }

    const marcaItem = gridItemOf(screen.getByRole('textbox', { name: 'Marca' }));
    const modeloItem = gridItemOf(screen.getByRole('textbox', { name: 'Modelo' }));
    expect(marcaItem?.parentElement).toBe(grid);
    expect(modeloItem?.parentElement).toBe(grid);
    expect(marcaItem?.className).not.toMatch(/md:col-span-2/);
    expect(modeloItem?.className).not.toMatch(/md:col-span-2/);
    expect(
      marcaItem!.compareDocumentPosition(modeloItem!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const codigoItem = gridItemOf(screen.getByRole('textbox', { name: 'Código de barras' }));
    const formatoItem = gridItemOf(screen.getByRole('combobox', { name: 'Formato del código' }));
    expect(codigoItem?.parentElement).toBe(grid);
    expect(formatoItem?.parentElement).toBe(grid);
    expect(codigoItem?.className).not.toMatch(/md:col-span-2/);
    expect(formatoItem?.className).not.toMatch(/md:col-span-2/);
    expect(
      codigoItem!.compareDocumentPosition(formatoItem!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Orden DOM intacto: Tipo → Control → … → Formato (el tabuleo sigue al ojo).
    const tipoItem = gridItemOf(screen.getByRole('combobox', { name: 'Tipo de producto' }));
    const controlItem = gridItemOf(screen.getByRole('combobox', { name: 'Control de material' }));
    expect(
      tipoItem!.compareDocumentPosition(controlItem!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      controlItem!.compareDocumentPosition(codigoItem!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
