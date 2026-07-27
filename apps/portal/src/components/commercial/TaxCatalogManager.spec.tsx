import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TaxCatalogManager } from './TaxCatalogManager';
import { EMPTY_LIST_META } from '@/lib/list-meta';

const mockListTaxDefinitions = jest.fn();
const mockCreateTaxDefinition = jest.fn();
const mockUpdateTaxDefinition = jest.fn();
const mockDeleteTaxDefinition = jest.fn();

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  COMMERCIAL_LIST_PAGE_SIZE: 20,
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
    mockListTaxDefinitions.mockResolvedValue({
      data: [
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
      ],
      meta: { ...EMPTY_LIST_META, nextCursor: null, total: 2 },
    });
    mockCreateTaxDefinition.mockResolvedValue(undefined);
    mockUpdateTaxDefinition.mockResolvedValue(undefined);
    mockDeleteTaxDefinition.mockResolvedValue(undefined);
  });

  it('muestra Editar y Eliminar en custom y system', async () => {
    render(<TaxCatalogManager canEdit />);

    await waitFor(() => {
      expect(mockListTaxDefinitions).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true, limit: 20 }),
      );
    });

    expect(
      await screen.findByRole('button', { name: 'Editar definición tributaria ICA Bogotá' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Editar definición tributaria IVA 19%' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar definición tributaria ICA Bogotá' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Eliminar definición tributaria IVA 19%' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 definiciones')).toBeInTheDocument();
  });

  it('ADR-064: concatena página con Cargar más', async () => {
    mockListTaxDefinitions
      .mockResolvedValueOnce({
        data: [
          {
            id: 'tax-1',
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
        ],
        meta: { ...EMPTY_LIST_META, nextCursor: 'tax-cursor-2', total: 2 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'tax-2',
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
        ],
        meta: { ...EMPTY_LIST_META, nextCursor: null, total: 2 },
      });

    render(<TaxCatalogManager canEdit />);

    expect(await screen.findByText('1 de 2 definiciones')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Cargar más' }));

    await waitFor(() => {
      expect(
        mockListTaxDefinitions.mock.calls.some((call) => call[0]?.cursor === 'tax-cursor-2'),
      ).toBe(true);
    });
    expect(await screen.findByText('IVA 19%')).toBeInTheDocument();
    expect(screen.getByText('2 definiciones')).toBeInTheDocument();
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
