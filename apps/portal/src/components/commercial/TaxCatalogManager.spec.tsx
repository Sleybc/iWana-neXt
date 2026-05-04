import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaxCatalogManager } from './TaxCatalogManager';

const mockListTaxDefinitions = jest.fn();
const mockCreateTaxDefinition = jest.fn();
const mockUpdateTaxDefinition = jest.fn();
const mockDeleteTaxDefinition = jest.fn();

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  commercialApi: {
    listTaxDefinitions: (...args: unknown[]) => mockListTaxDefinitions(...args),
    createTaxDefinition: (...args: unknown[]) => mockCreateTaxDefinition(...args),
    updateTaxDefinition: (...args: unknown[]) => mockUpdateTaxDefinition(...args),
    deleteTaxDefinition: (...args: unknown[]) => mockDeleteTaxDefinition(...args),
  },
}));

describe('TaxCatalogManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListTaxDefinitions.mockResolvedValue([
      {
        id: 'tax-custom-1',
        code: 'ICA_BOGOTA',
        name: 'ICA Bogotá',
        category: 'MUNICIPAL',
        jurisdictionLevel: 'MUNICIPAL',
        municipalityCode: null,
        baseRate: '11.0000',
        treatment: 'STANDARD',
        context: 'BOTH',
        origin: 'CUSTOM',
        isActive: true,
        notes: null,
      },
      {
        id: 'tax-system-1',
        code: 'IVA_19',
        name: 'IVA 19%',
        category: 'VAT',
        jurisdictionLevel: 'NATIONAL',
        municipalityCode: null,
        baseRate: '19.0000',
        treatment: 'STANDARD',
        context: 'BOTH',
        origin: 'SYSTEM',
        isActive: true,
        notes: null,
      },
    ]);
    mockCreateTaxDefinition.mockResolvedValue(undefined);
    mockUpdateTaxDefinition.mockResolvedValue(undefined);
    mockDeleteTaxDefinition.mockResolvedValue(undefined);
  });

  it('muestra el botón Editar para impuestos creados y lo oculta en presets del sistema', async () => {
    render(<TaxCatalogManager canEdit />);

    await waitFor(() => {
      expect(mockListTaxDefinitions).toHaveBeenCalledWith({ isActive: true });
    });

    expect(
      await screen.findByRole('button', { name: 'Editar definición tributaria ICA Bogotá' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar definición tributaria IVA 19%' }),
    ).not.toBeInTheDocument();
  });

  it('abre el diálogo de edición al pulsar Editar', async () => {
    render(<TaxCatalogManager canEdit />);

    await waitFor(() => {
      expect(mockListTaxDefinitions).toHaveBeenCalled();
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar definición tributaria ICA Bogotá' }),
    );

    expect(await screen.findByText(/Modifica los campos editables de/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('ICA Bogotá')).toBeInTheDocument();
  });
});
