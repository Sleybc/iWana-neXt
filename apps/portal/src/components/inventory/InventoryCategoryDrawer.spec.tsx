import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { InventoryCategoryStatus } from '@iwana/shared';
import type { InventoryCategoryRecord } from '@/lib/api-client';
import { inventoryApi } from '@/lib/api-client';
import { InventoryCategoryDrawer } from './InventoryCategoryDrawer';

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      suggestCategoryPrefix: jest.fn(),
    },
  };
});

const inventoryApiMock = inventoryApi as jest.Mocked<typeof inventoryApi>;

function buildCategory(overrides: Partial<InventoryCategoryRecord> = {}): InventoryCategoryRecord {
  return {
    id: 'cat-001',
    tenantId: 'tenant-001',
    code: 'NETWORKING',
    codePrefix: 'NET',
    name: 'Networking',
    description: null,
    status: InventoryCategoryStatus.ACTIVE,
    sortOrder: 0,
    productCount: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderDrawer(overrides: Partial<ComponentProps<typeof InventoryCategoryDrawer>> = {}) {
  const onCreate = jest.fn().mockResolvedValue(undefined);
  const onUpdate = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();

  render(
    <InventoryCategoryDrawer
      open={true}
      category={null}
      isSubmitting={false}
      error={null}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
      {...overrides}
    />,
  );

  return { onCreate, onUpdate, onClose };
}

describe('InventoryCategoryDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    inventoryApiMock.suggestCategoryPrefix.mockResolvedValue({
      code: 'CONSUMIBLESFO',
      codePrefix: 'CFO',
      sortOrder: 2,
    });
  });

  it('suggests the next sort order when opening a new category drawer', async () => {
    renderDrawer({
      existingCategories: [
        buildCategory({ id: 'cat-1', sortOrder: 0 }),
        buildCategory({ id: 'cat-2', sortOrder: 1 }),
      ],
    });

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    expect(screen.getByLabelText('Orden')).toHaveValue(2);
  });

  it('autocompletes legible product prefix when typing the name', async () => {
    renderDrawer();

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Consumibles FO' },
    });

    expect(screen.getByLabelText('Prefijo de código')).toHaveValue('CFO');
    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument();
  });

  it('uses server suggestion when available', async () => {
    inventoryApiMock.suggestCategoryPrefix.mockResolvedValue({
      code: 'CONSUMIBLESRD',
      codePrefix: 'CRD',
      sortOrder: 3,
    });

    renderDrawer({
      existingCategories: [buildCategory({ id: 'cat-existing', codePrefix: 'CFO', sortOrder: 1 })],
    });

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Consumibles RD' },
    });

    await waitFor(() => {
      expect(inventoryApiMock.suggestCategoryPrefix).toHaveBeenCalledWith({
        name: 'Consumibles RD',
        codePrefix: undefined,
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Prefijo de código')).toHaveValue('CRD');
      expect(screen.getByLabelText('Orden')).toHaveValue(3);
    });
  });

  it('stops autocompleting product prefix after manual edit', async () => {
    renderDrawer();

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Consumibles FO' },
    });
    fireEvent.change(screen.getByLabelText('Prefijo de código'), {
      target: { value: 'XYZ' },
    });
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Consumibles RD' },
    });

    expect(screen.getByLabelText('Prefijo de código')).toHaveValue('XYZ');
  });

  it('creates category with legible derived prefix', async () => {
    const { onCreate } = renderDrawer();

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Consumibles FO' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'CONSUMIBLESFO',
          codePrefix: 'CFO',
          name: 'Consumibles FO',
        }),
      );
    });
  });

  it('includes codePrefix in create payload and excludes it on update', async () => {
    const category = buildCategory();
    const { onCreate, onUpdate } = renderDrawer({ category });

    await screen.findByRole('dialog', { name: 'Editar categoría' });

    expect(screen.getByLabelText('Prefijo de código')).toBeDisabled();
    expect(screen.getByLabelText('Código')).toHaveValue('NETWORKING');

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Networking actualizado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        'cat-001',
        expect.objectContaining({
          name: 'Networking actualizado',
        }),
      );
    });
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty('codePrefix');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('blocks submit when product prefix format is invalid', async () => {
    const { onCreate } = renderDrawer();

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'A' },
    });
    fireEvent.change(screen.getByLabelText('Prefijo de código'), {
      target: { value: 'A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(
      await screen.findByText(
        'El prefijo de producto debe tener entre 2 y 3 caracteres alfanuméricos en mayúscula.',
      ),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('pide confirmación antes de descartar cambios sin guardar', async () => {
    renderDrawer();

    await screen.findByRole('dialog', { name: 'Nueva categoría' });

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Consumibles FO' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toBeInTheDocument();
  });
});
