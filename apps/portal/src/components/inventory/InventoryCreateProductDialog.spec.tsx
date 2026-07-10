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
        'Crea un producto para agregarlo al catálogo. Podrás completar compras, inventario y otros datos después.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Nombre/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Categoría/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Tipo de producto/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^Control de material/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Unidad de medida/ })).toBeInTheDocument();
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
        unitOfMeasure: 'unidad',
        description: null,
        brand: null,
        model: null,
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
});
