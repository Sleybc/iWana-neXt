import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { commercialApi } from '@/lib/api-client';
import { CommercialInterestSection } from './CommercialInterestSection';

jest.mock('@/lib/api-client', () => ({
  commercialApi: {
    searchPlansForPicker: jest.fn(),
    searchAdditionalProductsForPicker: jest.fn(),
    searchAdditionalServicesForPicker: jest.fn(),
    getPlanById: jest.fn(),
    getCatalogItemById: jest.fn(),
  },
  mapPickerSearchResponse: ({
    data,
    total,
  }: {
    data: Array<{ id: string; label: string; sublabel?: string | null }>;
    total: number;
  }) => ({ items: data, total }),
}));

const commercialApiMock = commercialApi as unknown as {
  searchPlansForPicker: jest.Mock;
  searchAdditionalProductsForPicker: jest.Mock;
  searchAdditionalServicesForPicker: jest.Mock;
  getPlanById: jest.Mock;
  getCatalogItemById: jest.Mock;
};

describe('CommercialInterestSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    commercialApiMock.searchPlansForPicker.mockResolvedValue({
      data: [{ id: 'plan-1', label: 'Plan Fibra 200', sublabel: 'FTTH · ↓200Mbps · ↑100Mbps' }],
      total: 1,
    });
    commercialApiMock.searchAdditionalProductsForPicker.mockResolvedValue({
      data: [{ id: 'prod-1', label: 'Router WiFi' }],
      total: 1,
    });
    commercialApiMock.searchAdditionalServicesForPicker.mockResolvedValue({
      data: [{ id: 'svc-1', label: 'IP fija' }],
      total: 1,
    });
    commercialApiMock.getPlanById.mockResolvedValue({
      id: 'plan-1',
      name: 'Plan Fibra 200',
      technology: 'FTTH',
      downloadSpeedMbps: 200,
      uploadSpeedMbps: 100,
    });
    commercialApiMock.getCatalogItemById.mockImplementation(async (id: string) => ({
      id,
      name: id === 'prod-1' ? 'Router WiFi' : 'IP fija',
      description: null,
    }));
  });

  it('busca planes vía search endpoint al escribir ≥2 caracteres', async () => {
    const onChange = jest.fn();

    render(
      <CommercialInterestSection
        draftValues={{}}
        onChange={onChange}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Plan de interés' }), {
      target: { value: 'Fi' },
    });

    await waitFor(() => {
      expect(commercialApiMock.searchPlansForPicker).toHaveBeenCalledWith(
        { q: 'Fi', isActive: true },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    expect(commercialApiMock.searchPlansForPicker).not.toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
      expect.anything(),
    );
  });

  it('persiste el plan seleccionado en draft sin prefetch limit 100', async () => {
    const onChange = jest.fn();

    render(
      <CommercialInterestSection
        draftValues={{}}
        onChange={onChange}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Plan de interés' }), {
      target: { value: 'Fi' },
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Plan Fibra 200/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('option', { name: /Plan Fibra 200/i }));

    expect(onChange).toHaveBeenCalledWith('interestedPlanId', 'plan-1');
  });

  it('hidrata el plan existente con getPlanById', async () => {
    render(
      <CommercialInterestSection
        draftValues={{ interestedPlanId: 'plan-1' }}
        onChange={jest.fn()}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(commercialApiMock.getPlanById).toHaveBeenCalledWith('plan-1');
    });

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Plan de interés' })).toHaveValue(
        'Plan Fibra 200',
      );
    });
  });
});
