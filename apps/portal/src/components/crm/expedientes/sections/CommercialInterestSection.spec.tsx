import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { commercialApi } from '@/lib/api-client';
import { CommercialInterestSection } from './CommercialInterestSection';
import { clearExpedienteDetailCache } from '../expediente-detail-cache';

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

/** Replica el page: el draft lo actualiza el parent y se lo devuelve a la sección. */
function Harness({ initial = {} }: { initial?: Record<string, string> }) {
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  return (
    <CommercialInterestSection
      draftValues={draft}
      onChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
      saving={false}
      onSave={jest.fn()}
    />
  );
}

describe('CommercialInterestSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearExpedienteDetailCache();
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

  it('persiste el plan seleccionado y muestra tecnología y velocidades en el input', async () => {
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

  it('muestra el label compuesto (plan — tecnología · velocidades) en el input tras seleccionar', async () => {
    render(<Harness />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Plan de interés' }), {
      target: { value: 'Fi' },
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Plan Fibra 200/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('option', { name: /Plan Fibra 200/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Plan de interés' })).toHaveValue(
        'Plan Fibra 200 — FTTH · ↓200Mbps · ↑100Mbps',
      );
    });
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
        'Plan Fibra 200 — FTTH · ↓200Mbps · ↑100Mbps',
      );
    });
  });

  it('renderiza el select de tipo de cliente con las 6 opciones canónicas', async () => {
    render(
      <CommercialInterestSection
        draftValues={{}}
        onChange={jest.fn()}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    const segmentCombobox = screen.getByRole('combobox', { name: 'Tipo de cliente' });
    expect(segmentCombobox).toBeInTheDocument();

    fireEvent.click(segmentCombobox);

    await screen.findByRole('listbox', { name: 'Tipo de cliente' });

    const optionLabels = ['Residencial', 'SOHO', 'PyME', 'Gobierno', 'Corporativo', 'Mayorista'];
    expect(screen.getAllByRole('option')).toHaveLength(optionLabels.length);
    for (const label of optionLabels) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('persiste el segmento seleccionado en el draft', async () => {
    const onChange = jest.fn();

    render(
      <CommercialInterestSection
        draftValues={{}}
        onChange={onChange}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Tipo de cliente' }));

    const pymeOption = await screen.findByRole('option', { name: 'PyME' });
    fireEvent.click(pymeOption);

    expect(onChange).toHaveBeenCalledWith('customerSegment', 'PYME');
  });

  it('precarga el catálogo de planes al montar con q vacío (minChars=0) y muestra tecnología y velocidades', async () => {
    render(
      <CommercialInterestSection
        draftValues={{}}
        onChange={jest.fn()}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(commercialApiMock.searchPlansForPicker).toHaveBeenCalledWith(
        { q: '', isActive: true },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.focus(screen.getByRole('combobox', { name: 'Plan de interés' }));

    expect(
      await screen.findByRole('option', { name: /Plan Fibra 200.*FTTH · ↓200Mbps · ↑100Mbps/i }),
    ).toBeInTheDocument();
  });

  it('abre el catálogo de productos y servicios adicionales al enfocar sin texto (minChars=0)', async () => {
    render(
      <CommercialInterestSection
        draftValues={{}}
        onChange={jest.fn()}
        saving={false}
        onSave={jest.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Productos adicionales' }));

    await waitFor(() => {
      expect(commercialApiMock.searchAdditionalProductsForPicker).toHaveBeenCalledWith(
        { q: '', isActive: true },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    expect(await screen.findByRole('option', { name: 'Router WiFi' })).toBeInTheDocument();

    fireEvent.focus(screen.getByRole('combobox', { name: 'Servicios adicionales' }));

    await waitFor(() => {
      expect(commercialApiMock.searchAdditionalServicesForPicker).toHaveBeenCalledWith(
        { q: '', isActive: true },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    expect(await screen.findByRole('option', { name: 'IP fija' })).toBeInTheDocument();
  });
});
