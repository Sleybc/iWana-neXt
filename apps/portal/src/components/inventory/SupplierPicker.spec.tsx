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

    await waitFor(
      () => {
        expect(screen.getByRole('option', { name: /Proveedor Alfa/i })).toBeInTheDocument();
      },
      { timeout: 5_000 },
    );

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('supplier-1', 'Proveedor Alfa');
  });

  it('navega con flechas y selecciona la opción resaltada', async () => {
    const onChange = jest.fn();

    render(<SupplierPicker label="Proveedor" value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.change(input, { target: { value: 'Proveedor' } });

    await waitFor(
      () => {
        expect(screen.getByRole('option', { name: /Proveedor Beta/i })).toBeInTheDocument();
      },
      { timeout: 5_000 },
    );

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('supplier-2', 'Proveedor Beta');
  });

  it('en error de búsqueda muestra mensaje inline y no listbox vacío', async () => {
    purchasingApiMock.searchSuppliers.mockRejectedValueOnce(new Error('network'));

    render(<SupplierPicker label="Proveedor" value={null} onChange={jest.fn()} />);

    const input = screen.getByRole('combobox', { name: 'Proveedor' });
    fireEvent.change(input, { target: { value: 'macro' } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No fue posible cargar proveedores.');
    });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin resultados para esta búsqueda.')).not.toBeInTheDocument();
    expect(screen.queryByText('Búsqueda de proveedor')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('mientras carga muestra skeleton y no el mensaje de sin resultados', async () => {
    let resolveSearch!: (value: {
      data: Array<{ partyRefId: string; displayName: string; status: PartyStatus }>;
      total: number;
      page: number;
      limit: number;
    }) => void;

    purchasingApiMock.searchSuppliers.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        }),
    );

    render(<SupplierPicker label="Proveedor" value={null} onChange={jest.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Proveedor' }), {
      target: { value: 'macro' },
    });

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    });

    expect(screen.queryByText('Sin resultados para esta búsqueda.')).not.toBeInTheDocument();
    expect(screen.queryByText('Buscando proveedores…')).not.toBeInTheDocument();

    resolveSearch({
      data: [
        {
          partyRefId: 'supplier-1',
          displayName: 'Macrotics SAS',
          status: PartyStatus.ACTIVE,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Macrotics SAS/i })).toBeInTheDocument();
    });
  });
});
