import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyStatus } from '@iwana/shared';
import { purchasingApi } from '@/lib/api-client';
import { SupplierPicker } from './SupplierPicker';

jest.mock('@/lib/api-client', () => ({
  purchasingApi: {
    searchSuppliers: jest.fn(),
  },
}));

const purchasingApiMock = purchasingApi as jest.Mocked<typeof purchasingApi>;

describe('SupplierPicker', () => {
  beforeEach(() => {
    purchasingApiMock.searchSuppliers.mockResolvedValue({
      data: [
        {
          partyRefId: 'supplier-1',
          displayName: 'Proveedor Alfa',
          status: PartyStatus.ACTIVE,
        },
        {
          partyRefId: 'supplier-2',
          displayName: 'Proveedor Beta',
          status: PartyStatus.ACTIVE,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });
  });

  it('no busca proveedores con texto vacío', async () => {
    render(<SupplierPicker label="Proveedor" value={null} onChange={jest.fn()} />);

    await waitFor(() => {
      expect(purchasingApiMock.searchSuppliers).not.toHaveBeenCalled();
    });
  });

  it('muestra resultados y selecciona con clic', async () => {
    const onChange = jest.fn();

    render(<SupplierPicker label="Proveedor" value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, { target: { value: 'Alfa' } });

    await waitFor(() => {
      expect(purchasingApiMock.searchSuppliers).toHaveBeenCalledWith({ search: 'Alfa', page: 1 });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Proveedor Alfa/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('option', { name: /Proveedor Alfa/i }));

    expect(onChange).toHaveBeenCalledWith('supplier-1', 'Proveedor Alfa');
  });

  it('selecciona la primera opción resaltada con Enter', async () => {
    const onChange = jest.fn();

    render(<SupplierPicker label="Proveedor" value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.change(input, { target: { value: 'Proveedor' } });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Proveedor Alfa/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('supplier-1', 'Proveedor Alfa');
  });

  it('navega con flechas y selecciona la opción resaltada', async () => {
    const onChange = jest.fn();

    render(<SupplierPicker label="Proveedor" value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.change(input, { target: { value: 'Proveedor' } });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Proveedor Beta/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('supplier-2', 'Proveedor Beta');
  });
});
