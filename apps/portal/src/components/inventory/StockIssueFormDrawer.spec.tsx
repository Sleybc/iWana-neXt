import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StockLocationType } from '@iwana/shared';
import { StockIssueFormDrawer } from './StockIssueFormDrawer';

describe('StockIssueFormDrawer', () => {
  it('excludes the selected source from warehouse-to-warehouse destinations', async () => {
    const user = userEvent.setup();

    render(
      <StockIssueFormDrawer
        open
        items={[
          {
            id: 'item-1',
            tenantId: 'tenant-1',
            sku: 'ONT-001',
            name: 'ONT WiFi 6',
          } as any,
        ]}
        locations={[
          {
            id: 'loc-main',
            tenantId: 'tenant-1',
            code: 'BOD-01',
            name: 'Bodega principal',
            type: StockLocationType.MAIN_WAREHOUSE,
          } as any,
          {
            id: 'loc-office',
            tenantId: 'tenant-1',
            code: 'OFI-01',
            name: 'Oficina central',
            type: StockLocationType.OFFICE_STOCK,
          } as any,
          {
            id: 'loc-node',
            tenantId: 'tenant-1',
            code: 'NOD-01',
            name: 'Nodo norte',
            type: StockLocationType.NODE_STOCK,
          } as any,
        ]}
        destinationOptions={new Map()}
        isSubmitting={false}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Crear salida' });

    await user.click(within(dialog).getByRole('combobox', { name: /^Tipo/ }));
    await user.click(screen.getByRole('option', { name: 'Entre bodegas' }));

    await user.click(within(dialog).getByRole('combobox', { name: /^Origen/ }));
    await user.click(screen.getByRole('option', { name: /BOD-01 · Bodega principal/i }));

    const destinationSelect = document.getElementById(
      'issue-form-destination-native',
    ) as HTMLSelectElement;

    expect(destinationSelect).toBeTruthy();
    expect(
      within(destinationSelect).queryByText(/BOD-01 · Bodega principal/i),
    ).not.toBeInTheDocument();
    expect(within(destinationSelect).getByText(/OFI-01 · Oficina central/i)).toBeInTheDocument();
    expect(within(destinationSelect).getByText(/NOD-01 · Nodo norte/i)).toBeInTheDocument();
  });
});
