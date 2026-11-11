import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { OperatorContractProfile } from '@iwana/shared';
import { OperatorContractProfileSection } from './OperatorContractProfileSection';

jest.mock('@/lib/api-client', () => ({
  ApiError: class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  organizationApi: {
    getContractProfile: jest.fn(),
    updateContractProfile: jest.fn(),
  },
}));

const { organizationApi, ApiError } = jest.requireMock('@/lib/api-client') as {
  organizationApi: { getContractProfile: jest.Mock; updateContractProfile: jest.Mock };
  ApiError: new (status: number, message: string) => Error;
};

const completeProfile: OperatorContractProfile = {
  legalName: 'Conecta Fibra SAS',
  nit: '900123456',
  qualityAndCoverageUrl: 'https://conecta.co/calidad',
  customerServiceChannels: [{ kind: 'PHONE', value: '6015550000', label: 'Línea' }],
  reconnectionFee: 15000,
  annualIncreaseCapPercent: 5,
  equipmentIncidentReportChannel: 'Línea 6015550000',
  otherConditions: null,
  updatedAt: '2026-11-10T12:00:00.000Z',
};

const emptyProfile: OperatorContractProfile = {
  legalName: 'Conecta Fibra SAS',
  nit: null,
  qualityAndCoverageUrl: null,
  customerServiceChannels: [],
  reconnectionFee: null,
  annualIncreaseCapPercent: null,
  equipmentIncidentReportChannel: null,
  otherConditions: null,
  updatedAt: null,
};

describe('OperatorContractProfileSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('muestra la razón social y el NIT de solo lectura y los datos guardados', async () => {
    organizationApi.getContractProfile.mockResolvedValue({
      data: completeProfile,
      meta: { missingFields: [] },
    });

    render(<OperatorContractProfileSection canEdit />);

    const legalName = await screen.findByLabelText('Razón social');
    expect(legalName).toHaveValue('Conecta Fibra SAS');
    expect(legalName).toBeDisabled();
    expect(screen.getByLabelText('NIT')).toBeDisabled();
    expect(screen.getByLabelText('Web de calidad y cobertura')).toHaveValue(
      'https://conecta.co/calidad',
    );
    expect(screen.getByLabelText('Dato de contacto')).toHaveValue('6015550000');
    expect(screen.queryByText(/Faltan datos obligatorios/)).not.toBeInTheDocument();
  });

  it('avisa los datos obligatorios que faltan con etiquetas legibles', async () => {
    organizationApi.getContractProfile.mockResolvedValue({
      data: emptyProfile,
      meta: { missingFields: ['nit', 'customerServiceChannels', 'reconnectionFee'] },
    });

    render(<OperatorContractProfileSection canEdit />);

    expect(
      await screen.findByText('Faltan datos obligatorios para generar contratos'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Completa: NIT, Medios de atención, Costo de reconexión\. La razón social y el NIT se editan en el perfil de la empresa\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/customerServiceChannels/)).not.toBeInTheDocument();
  });

  it('en solo lectura no ofrece guardar ni agregar medios', async () => {
    organizationApi.getContractProfile.mockResolvedValue({
      data: completeProfile,
      meta: { missingFields: [] },
    });

    render(<OperatorContractProfileSection canEdit={false} />);

    expect(await screen.findByLabelText('Web de calidad y cobertura')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Guardar datos del operador' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Agregar medio de atención' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Solo un administrador/)).toBeInTheDocument();
  });

  it('valida con el esquema compartido y no envía datos inválidos', async () => {
    organizationApi.getContractProfile.mockResolvedValue({
      data: completeProfile,
      meta: { missingFields: [] },
    });

    render(<OperatorContractProfileSection canEdit />);

    fireEvent.change(await screen.findByLabelText('Web de calidad y cobertura'), {
      target: { value: 'no-es-url' },
    });
    fireEvent.change(screen.getByLabelText('Tope de incremento anual (%)'), {
      target: { value: '150' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos del operador' }));

    expect(
      await screen.findByText('Ingresa una dirección web válida que empiece por https://.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ingresa un porcentaje entre 0 y 100, con hasta dos decimales.'),
    ).toBeInTheDocument();
    expect(organizationApi.updateContractProfile).not.toHaveBeenCalled();
  });

  it('guarda con PUT y actualiza los faltantes con la respuesta', async () => {
    organizationApi.getContractProfile.mockResolvedValue({
      data: emptyProfile,
      meta: { missingFields: ['qualityAndCoverageUrl'] },
    });
    organizationApi.updateContractProfile.mockResolvedValue({
      data: { ...emptyProfile, qualityAndCoverageUrl: 'https://conecta.co/calidad' },
      meta: { missingFields: [] },
    });

    render(<OperatorContractProfileSection canEdit />);

    fireEvent.change(await screen.findByLabelText('Web de calidad y cobertura'), {
      target: { value: 'https://conecta.co/calidad' },
    });
    fireEvent.change(screen.getByLabelText('Costo de reconexión (COP)'), {
      target: { value: '15000,50' },
    });
    fireEvent.change(screen.getByLabelText('Otras condiciones (opcional)'), {
      target: { value: '  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos del operador' }));

    await waitFor(() =>
      expect(organizationApi.updateContractProfile).toHaveBeenCalledWith({
        qualityAndCoverageUrl: 'https://conecta.co/calidad',
        customerServiceChannels: [],
        reconnectionFee: 15000.5,
        annualIncreaseCapPercent: null,
        equipmentIncidentReportChannel: null,
        otherConditions: null,
      }),
    );
    expect(
      await screen.findByText('Los datos del operador para contratos quedaron guardados.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Faltan datos obligatorios/)).not.toBeInTheDocument();
  });

  it('agrega medios de atención hasta el máximo de 10', async () => {
    organizationApi.getContractProfile.mockResolvedValue({
      data: emptyProfile,
      meta: { missingFields: [] },
    });

    render(<OperatorContractProfileSection canEdit />);

    const add = await screen.findByRole('button', { name: 'Agregar medio de atención' });
    for (let i = 0; i < 10; i += 1) fireEvent.click(add);

    expect(screen.getAllByLabelText('Dato de contacto')).toHaveLength(10);
    expect(add).toBeDisabled();
    expect(screen.getByText('Puedes registrar hasta 10 medios de atención.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar medio de atención 1' }));
    expect(screen.getAllByLabelText('Dato de contacto')).toHaveLength(9);
  });

  it('muestra error con reintento si la carga falla', async () => {
    organizationApi.getContractProfile.mockRejectedValueOnce(new Error('falla'));
    organizationApi.getContractProfile.mockResolvedValueOnce({
      data: completeProfile,
      meta: { missingFields: [] },
    });

    render(<OperatorContractProfileSection canEdit />);

    expect(await screen.findByText('No se cargaron los datos del operador')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /Reintentar/ });
    // Contraste sobre la alerta de error: color de título de la alerta, no el verde del enlace.
    expect(retry).toHaveClass('text-red-900', 'dark:text-red-100');
    expect(retry).not.toHaveClass('text-iwana-secondary-700');
    fireEvent.click(retry);
    expect(await screen.findByLabelText('Web de calidad y cobertura')).toBeInTheDocument();
  });

  it('informa falta de permiso si la consulta responde 403', async () => {
    organizationApi.getContractProfile.mockRejectedValue(new ApiError(403, 'prohibido'));

    render(<OperatorContractProfileSection canEdit={false} />);

    expect(
      await screen.findByText(
        'No tienes permiso para consultar los datos del operador para contratos.',
      ),
    ).toBeInTheDocument();
  });
});
