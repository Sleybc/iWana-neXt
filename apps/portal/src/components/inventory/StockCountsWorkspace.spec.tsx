import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StockCountStatus } from '@iwana/shared';
import { StockCountsWorkspace } from './StockCountsWorkspace';

describe('StockCountsWorkspace', () => {
  const locations = [
    {
      id: 'loc-1',
      name: 'Bodega principal',
    },
  ] as never;

  const baseCount = {
    id: 'count-1',
    tenantId: 'tenant-1',
    countNumber: 'CNT-000001',
    status: StockCountStatus.COUNTING,
    locationId: 'loc-1',
    categoryId: null,
    notes: null,
    createdByUserId: 'admin-1',
    closedByUserId: null,
    closedAt: null,
    stockMovementId: null,
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
  };

  it('muestra estado vacío y permite iniciar creación', () => {
    render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        counts={[]}
        isLoading={false}
        canClose
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={jest.fn()}
        onRefresh={jest.fn()}
      />,
    );

    expect(screen.getByText('Sin conteos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo conteo' }));
    expect(screen.getByText('Nuevo conteo físico')).toBeInTheDocument();
  });

  it('oculta cerrar conteo cuando canClose es false', async () => {
    const onOpenDetail = jest.fn().mockResolvedValue({
      ...baseCount,
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          countId: 'count-1',
          itemId: 'item-1',
          lotId: null,
          condition: 'NEW',
          expectedQty: '10.00',
          countedQty: null,
          variance: null,
          itemSku: 'CAB-01',
          itemName: 'Cable',
          createdAt: '2026-07-18T12:00:00.000Z',
        },
      ],
    });

    render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        counts={[baseCount as never]}
        isLoading={false}
        canClose={false}
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={onOpenDetail}
        onRefresh={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => {
      expect(screen.getByText('CNT-000001')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Cerrar conteo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar conteo' })).toBeInTheDocument();
  });

  it('muestra cerrar conteo para admin', async () => {
    const onOpenDetail = jest.fn().mockResolvedValue({
      ...baseCount,
      lines: [
        {
          id: 'line-1',
          tenantId: 'tenant-1',
          countId: 'count-1',
          itemId: 'item-1',
          lotId: null,
          condition: 'NEW',
          expectedQty: '10.00',
          countedQty: '8.00',
          variance: '-2.00',
          itemSku: 'CAB-01',
          itemName: 'Cable',
          createdAt: '2026-07-18T12:00:00.000Z',
        },
      ],
    });

    render(
      <StockCountsWorkspace
        locations={locations}
        categories={[]}
        counts={[baseCount as never]}
        isLoading={false}
        canClose
        onCreate={jest.fn()}
        onUpdate={jest.fn()}
        onClose={jest.fn()}
        onCancel={jest.fn()}
        onOpenDetail={onOpenDetail}
        onRefresh={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar conteo' })).toBeInTheDocument();
    });
  });
});
