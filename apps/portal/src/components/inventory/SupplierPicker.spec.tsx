import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyStatus } from '@iwana/shared';
import { purchasingApi } from '@/lib/api-client';
import { SupplierPicker } from './SupplierPicker';

jest.mock('@/lib/api-client', () => ({
  purchasingApi: {
    searchSuppliers: jest.fn(),
  },
  mapPickerSearchResponse: ({
    data,
    total,
  }: {
    data: Array<{ id: string; label: string; sublabel?: string | null }>;
    total: number;
  }) => ({ items: data, total }),
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

  it('no busca con menos de 2 caracteres (umbral E-4)', async () => {
    render(<SupplierPicker label="Proveedor" value={null} onChange={jest.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
      target: { value: 'A' },
    });

    await waitFor(() => {
      expect(screen.getByText('Escribe al menos 2 caracteres')).toBeInTheDocument();
    });
    expect(purchasingApiMock.searchSuppliers).not.toHaveBeenCalled();
  });

  it('muestra resultados y selecciona con clic', async () => {
    const onChange = jest.fn();

    render(<SupplierPicker label="Proveedor" value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.change(input, { target: { value: 'Alfa' } });

    await waitFor(() => {
      expect(purchasingApiMock.searchSuppliers).toHaveBeenCalledWith(
        { search: 'Alfa', page: 1 },
        undefined,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
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

    await waitFor(
      () => {
        expect(screen.getByRole('option', { name: /Proveedor Alfa/i })).toBeInTheDocument();
      },
      { timeout: 5_000 },
    );

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('supplier-1', 'Proveedor Alfa');
  });

  it('en error de búsqueda muestra mensaje recuperable y Reintentar', async () => {
    purchasingApiMock.searchSuppliers.mockRejectedValueOnce(new Error('network'));

    render(<SupplierPicker label="Proveedor" value={null} onChange={jest.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
      target: { value: 'macro' },
    });

    await waitFor(() => {
      expect(screen.getByText(/No fue posible cargar proveedores/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
