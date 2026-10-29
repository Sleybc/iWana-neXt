import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ConsentChannel,
  CustomerSegment,
  DocumentType,
  PersonType,
  type DataAuthorizationView,
  type RequestKind,
  type RequestStatus,
  type RequestSummary,
} from '@iwana/shared';
import { ApiError, crmApi, privacyApi } from '@/lib/api-client';
import { ConsentsPanel } from '@/components/crm/expedientes/ConsentsPanel';
import { SubscriberForm } from '@/components/crm/subscribers/SubscriberForm';
import { CompliancePanel } from './CompliancePanel';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@iwana/ui', () => {
  const actual = jest.requireActual<typeof import('@iwana/ui')>('@iwana/ui');
  const React = jest.requireActual<typeof import('react')>('react');

  return {
    ...actual,
    Select: React.forwardRef<
      HTMLSelectElement,
      {
        id?: string;
        label?: string;
        value?: string;
        defaultValue?: string;
        name?: string;
        onChange?: React.ChangeEventHandler<HTMLSelectElement>;
        onBlur?: React.FocusEventHandler<HTMLSelectElement>;
        options?: Array<{ value: string; label: string }>;
        placeholder?: string;
        required?: boolean;
        className?: string;
        children?: React.ReactNode;
      }
    >(function TestSelect(
      {
        id,
        label,
        value,
        defaultValue,
        name,
        onChange,
        onBlur,
        options,
        placeholder,
        required,
        className,
        children,
      },
      ref,
    ) {
      return (
        <label>
          {label}
          <select
            id={id}
            ref={ref}
            name={name}
            value={value}
            defaultValue={value === undefined ? defaultValue : undefined}
            onChange={onChange}
            onBlur={onBlur}
            required={required}
            className={className}
            aria-required={required}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {children}
          </select>
        </label>
      );
    }),
  };
});

jest.mock('@/lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  crmApi: {
    listConsents: jest.fn(),
    createConsent: jest.fn(),
    revokeConsent: jest.fn(),
  },
  privacyApi: {
    getCurrentLegalText: jest.fn(),
    listPurposes: jest.fn(),
    createAuthorization: jest.fn(),
    listAuthorizations: jest.fn(),
    getAuthorizationProof: jest.fn(),
    listRequests: jest.fn(),
    uploadEvidence: jest.fn(),
  },
}));

jest.mock('./EvidenceUploadField', () => ({
  EvidenceUploadField: () => <div>Adjuntar evidencia opcional</div>,
}));

const crmMock = crmApi as unknown as {
  listConsents: jest.Mock;
  createConsent: jest.Mock;
  revokeConsent: jest.Mock;
};
const privacyMock = privacyApi as unknown as {
  getCurrentLegalText: jest.Mock;
  listPurposes: jest.Mock;
  createAuthorization: jest.Mock;
  listAuthorizations: jest.Mock;
  getAuthorizationProof: jest.Mock;
};

const legalText = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'AUTORIZACION',
  version: '3.2',
  content: 'Autorizo el tratamiento de mis datos para la prestación del servicio.',
  format: 'PLAIN',
  isCurrent: true,
} as const;

const historicalConsent = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  consentType: 'DATA_TREATMENT',
  status: 'ACCEPTED',
  channel: 'CRM_EXPEDIENTE',
  obtainedAt: '2026-10-01T10:00:00.000Z',
  ipAddress: null,
  legalTextVersion: '2.0',
  evidenceRef: null,
};

function authorizationView(
  suffix: string,
  purpose: DataAuthorizationView['purpose'],
  kind: DataAuthorizationView['kind'],
  granted: boolean,
  channel: string,
): DataAuthorizationView {
  return {
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${suffix.padStart(12, '0')}`,
    partyId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    purpose,
    kind,
    granted,
    channel,
    legalTextId: null,
    capturedAt: '2026-10-20T10:00:00.000Z',
  };
}

function requestSummary(suffix: string, kind: RequestKind, status: RequestStatus): RequestSummary {
  return {
    id: `cccccccc-cccc-4ccc-8ccc-${suffix.padStart(12, '0')}`,
    kind,
    right: 'CONOCER',
    purpose: null,
    status,
    receivedAt: '2026-10-20T10:00:00.000Z',
    dueAt: '2026-11-03',
    extendedUntil: null,
    isOverdue: false,
    transferDueAt: '2026-10-22',
    transferredLate: null,
    erasedAt: null,
    erasureCategories: [],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listConsents.mockResolvedValue({ data: [historicalConsent] });
  crmMock.createConsent.mockResolvedValue({ data: historicalConsent });
  privacyMock.getCurrentLegalText.mockResolvedValue(legalText);
  privacyMock.listPurposes.mockResolvedValue([
    { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
    { purpose: 'CONTACTO_COMERCIAL', enabled: true },
    { purpose: 'REPORTE_CENTRALES_RIESGO', enabled: true },
    { purpose: 'DATOS_BIOMETRICOS', enabled: true },
  ]);
  privacyMock.createAuthorization.mockResolvedValue({ authorizationId: 'authorization-1' });
  privacyMock.listAuthorizations.mockResolvedValue([]);
  privacyMock.getAuthorizationProof.mockResolvedValue({
    legalTextVersion: '2.1-prueba',
    sha256: 'c'.repeat(64),
    evidenceUrl: null,
  });
});

describe('captura del medio de autorización', () => {
  it('indica cuando la ficha no tiene una persona vinculada', async () => {
    render(<CompliancePanel partyId={null} authorizations={[]} requests={[]} canManage={false} />);

    expect(await screen.findByText('No hay una persona vinculada')).toBeInTheDocument();
    expect(privacyMock.getCurrentLegalText).not.toHaveBeenCalled();
  });

  it('mantiene bloqueada la captura cuando no hay texto vigente (404)', async () => {
    privacyMock.getCurrentLegalText.mockRejectedValue(
      new ApiError(404, 'NOT_FOUND', 'No hay texto vigente.'),
    );

    const compliance = render(
      <CompliancePanel
        partyId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        authorizations={[]}
        requests={[]}
        canManage
      />,
    );
    expect(await screen.findByText('No hay un texto de autorización vigente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    compliance.unmount();

    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);
    expect(
      await screen.findByText(
        'No hay un texto de autorización vigente. La captura está bloqueada.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar autorización' })).toBeDisabled();
  });

  it('reintenta errores del servicio de texto y mantiene el texto vigente', async () => {
    privacyMock.getCurrentLegalText
      .mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'Servicio no disponible.'))
      .mockResolvedValue(legalText);
    render(
      <CompliancePanel
        partyId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        authorizations={[]}
        requests={[]}
        canManage
      />,
    );

    expect(await screen.findByText('No fue posible cargar el texto vigente.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText(`Texto vigente · versión ${legalText.version}`),
    ).toBeInTheDocument();
  });

  it('reintenta la carga de finalidades en la ficha 360°', async () => {
    privacyMock.listPurposes
      .mockRejectedValueOnce(new Error('Fallo sintético'))
      .mockResolvedValue([{ purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true }]);
    render(
      <CompliancePanel
        partyId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        authorizations={[]}
        requests={[]}
        canManage
      />,
    );

    expect(await screen.findByText('No fue posible cargar las finalidades.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('checkbox', {
        name: /prestación del servicio, facturación y soporte/i,
      }),
    ).toBeInTheDocument();
  });

  it('reintenta la carga de finalidades en el formulario de alta', async () => {
    privacyMock.listPurposes
      .mockRejectedValueOnce(new Error('Fallo sintético'))
      .mockResolvedValue([{ purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true }]);
    render(<SubscriberForm onSave={jest.fn()} />);

    expect(await screen.findByText('No fue posible cargar las finalidades.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByRole('checkbox', {
        name: /prestar, facturar y dar soporte/i,
      }),
    ).toBeInTheDocument();
  });

  it('muestra el error cuando la API rechaza la captura', async () => {
    const user = userEvent.setup();
    crmMock.createConsent.mockRejectedValueOnce(new Error('Fallo sintético'));
    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);
    await screen.findByText(/Medio histórico/);
    await user.click(screen.getByRole('button', { name: 'Registrar autorización' }));
    fireEvent.change(screen.getByLabelText('Medio por el que la persona otorgó la autorización'), {
      target: { value: ConsentChannel.TELEFONO },
    });
    await user.click(screen.getAllByRole('button', { name: 'Registrar autorización' }).at(-1)!);
    expect(
      await screen.findByText('No fue posible registrar la autorización.'),
    ).toBeInTheDocument();
    expect(crmMock.createConsent).toHaveBeenCalledWith(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      expect.objectContaining({ channel: ConsentChannel.TELEFONO }),
    );
  });

  it('registra una revocación del consentimiento desde el expediente', async () => {
    const user = userEvent.setup();
    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);
    await screen.findByText(/Medio histórico/);
    await user.click(screen.getByRole('button', { name: 'Revocar' }));

    expect(await screen.findByText('Consentimiento revocado correctamente.')).toBeInTheDocument();
    expect(crmMock.revokeConsent).toHaveBeenCalledWith(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      historicalConsent.id,
      'Revocación solicitada desde el portal',
    );
  });

  it('muestra el error si falla la carga de consentimientos', async () => {
    crmMock.listConsents.mockRejectedValueOnce(new Error('Fallo sintético'));
    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);

    expect(
      await screen.findByText('No fue posible cargar los consentimientos.'),
    ).toBeInTheDocument();
  });

  it('presenta estados heredados y actualizados con sus etiquetas traducidas', async () => {
    crmMock.listConsents.mockResolvedValue({
      data: [
        {
          ...historicalConsent,
          consentType: 'TRATAMIENTO_DATOS',
          status: 'ACEPTADO',
          channel: 'PRESENCIAL',
        },
        {
          ...historicalConsent,
          id: 'consent-pending',
          consentType: 'CONTACTO_COMERCIAL',
          status: 'PENDIENTE',
          channel: 'EMAIL',
        },
        {
          ...historicalConsent,
          id: 'consent-revoked',
          consentType: 'CONTACTO_OPERATIVO',
          status: 'REVOCADO',
          channel: 'CANAL_HISTORICO',
        },
      ],
    });
    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);

    expect(await screen.findByText('Aceptado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('Revocado')).toBeInTheDocument();
    expect(screen.getByText('Tratamiento de datos')).toBeInTheDocument();
    expect(screen.getByText('Contacto comercial')).toBeInTheDocument();
    expect(screen.getByText('Contacto operativo')).toBeInTheDocument();
    expect(screen.getByText(/Medio: Presencial/)).toBeInTheDocument();
    expect(screen.getByText(/Medio: Correo electrónico/)).toBeInTheDocument();
    expect(screen.getByText(/Medio: Medio histórico/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Revocar' })).toHaveLength(2);
  });

  it('muestra estados de autorizaciones y solicitudes, y permite consultar su comprobante', async () => {
    const user = userEvent.setup();
    privacyMock.getAuthorizationProof
      .mockRejectedValueOnce(new Error('Fallo sintético'))
      .mockResolvedValue({
        legalTextVersion: '2.1-prueba',
        sha256: 'c'.repeat(64),
        evidenceUrl: null,
      });
    render(
      <CompliancePanel
        partyId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        authorizations={[
          authorizationView('000000000001', 'TRATAMIENTO_CONTRACTUAL', 'GRANT', true, 'TELEFONO'),
          authorizationView('000000000002', 'CONTACTO_COMERCIAL', 'REVOCATION', false, 'LEGACY'),
          authorizationView(
            '000000000003',
            'DATOS_BIOMETRICOS',
            'LEGACY_IMPORT',
            true,
            'CRM_CONVERSION',
          ),
        ]}
        requests={[
          requestSummary('000000000001', 'CONSULTA', 'RESUELTA'),
          requestSummary('000000000002', 'RECLAMO', 'NO_PROCEDENTE'),
          requestSummary('000000000003', 'SUPLANTACION', 'TRASLADADA'),
          requestSummary('000000000004', 'RECLAMO', 'DESISTIDA'),
          requestSummary('000000000005', 'CONSULTA', 'INCOMPLETA'),
          requestSummary('000000000006', 'CONSULTA', 'PRORROGADA'),
          requestSummary('000000000007', 'CONSULTA', 'EN_TRAMITE'),
          requestSummary('000000000008', 'CONSULTA', 'RADICADA'),
        ]}
        canManage={false}
      />,
    );

    expect(await screen.findByText(/Autorización vigente/)).toBeInTheDocument();
    expect(screen.getByText(/Retirada/)).toBeInTheDocument();
    expect(screen.getByText(/Autorización importada/)).toBeInTheDocument();
    expect(screen.getAllByText(/Medio histórico/)).toHaveLength(2);
    expect(screen.getByText(/Respondida/)).toBeInTheDocument();
    expect(screen.getByText(/No procede/)).toBeInTheDocument();
    expect(screen.getByText(/Trasladada/)).toBeInTheDocument();
    expect(screen.getByText(/Cerrada por falta de respuesta/)).toBeInTheDocument();
    expect(screen.getByText(/Necesita información/)).toBeInTheDocument();
    expect(screen.getByText(/Con plazo ampliado/)).toBeInTheDocument();
    expect(screen.getByText(/En trámite/)).toBeInTheDocument();
    expect(screen.getByText(/Recibida/)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Ver comprobante' })[0]!);
    expect(await screen.findByText('No fue posible consultar el comprobante.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Ver comprobante' })[1]!);
    const dialog = await screen.findByRole('dialog', { name: 'Comprobante de autorización' });
    expect(dialog).toHaveTextContent('Versión: 2.1-prueba');
    expect(dialog).toHaveTextContent(`SHA-256: ${'c'.repeat(64)}`);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CA-LT-10: no ofrece la finalidad comercial deshabilitada en las tres superficies', async () => {
    privacyMock.listPurposes.mockResolvedValue([
      { purpose: 'TRATAMIENTO_CONTRACTUAL', enabled: true },
      { purpose: 'CONTACTO_COMERCIAL', enabled: false },
      { purpose: 'REPORTE_CENTRALES_RIESGO', enabled: true },
      { purpose: 'DATOS_BIOMETRICOS', enabled: true },
    ]);

    const { unmount } = render(<SubscriberForm onSave={jest.fn()} />);
    const subscriberAuthorizations = await screen.findByRole('group', {
      name: 'Autorizaciones para el tratamiento de datos',
    });
    expect(
      within(subscriberAuthorizations).queryByText(/ofertas y novedades/i),
    ).not.toBeInTheDocument();
    unmount();

    const compliance = render(
      <CompliancePanel
        partyId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        authorizations={[]}
        requests={[]}
        canManage
      />,
    );
    await screen.findByText(`Texto vigente · versión ${legalText.version}`);
    expect(screen.queryByLabelText(/Contacto comercial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ofertas y novedades/i)).not.toBeInTheDocument();
    compliance.unmount();

    const user = userEvent.setup();
    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);
    await screen.findByText(/Medio histórico/);
    await user.click(screen.getByRole('button', { name: 'Registrar autorización' }));
    const purposeSelect = screen.getByLabelText('Finalidad');
    expect(
      within(purposeSelect).queryByRole('option', { name: 'Contacto comercial' }),
    ).not.toBeInTheDocument();
  });

  it('CA-UX-PRIV-33: solicita un medio real y obligatorio en el expediente, sin mostrar la pantalla de origen como canal', async () => {
    const user = userEvent.setup();
    render(<ConsentsPanel expedienteId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" />);

    await screen.findByText(/Medio histórico/);
    expect(screen.queryByText('CRM_EXPEDIENTE')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar autorización' }));

    const channelSelect = screen.getByLabelText(
      'Medio por el que la persona otorgó la autorización',
    );
    expect(channelSelect).toHaveValue('');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(
      expect.arrayContaining([
        'Teléfono',
        'Presencial',
        'Correo electrónico',
        'Mensaje de texto',
        'Mensajería instantánea',
      ]),
    );
    expect(screen.getByRole('button', { name: 'Registrar autorización' })).toBeDisabled();

    fireEvent.change(channelSelect, { target: { value: ConsentChannel.TELEFONO } });
    await user.click(screen.getByRole('button', { name: 'Registrar autorización' }));

    await waitFor(() =>
      expect(crmMock.createConsent).toHaveBeenCalledWith('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
        consentType: 'DATA_TREATMENT',
        status: 'ACCEPTED',
        channel: ConsentChannel.TELEFONO,
        legalTextVersion: legalText.version,
      }),
    );
  });

  it('CA-UX-PRIV-31: el alta directa muestra el texto versionado, finalidades sin marcar y conserva un solo medio en el payload', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<SubscriberForm onSave={onSave} />);

    await screen.findByText(`Texto vigente · versión ${legalText.version}`);
    // Las finalidades viven en su propio grupo; las responsabilidades del RUT son otro control.
    const checkboxes = within(
      screen.getByRole('group', { name: 'Autorizaciones para el tratamiento de datos' }),
    ).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true);

    const channelSelect = screen.getByLabelText(
      'Medio por el que la persona otorgó la autorización',
    );
    expect(channelSelect).toHaveValue('');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(
      expect.arrayContaining([
        'Teléfono',
        'Presencial',
        'Correo electrónico',
        'Mensaje de texto',
        'Mensajería instantánea',
      ]),
    );

    fireEvent.change(screen.getByLabelText('Tipo de documento'), {
      target: { value: DocumentType.CC },
    });
    fireEvent.change(screen.getByLabelText('Estrato'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Segmento'), {
      target: { value: CustomerSegment.RESIDENTIAL },
    });
    await user.type(screen.getByLabelText('Número de documento'), '1012345678');
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Apellido'), 'Pérez');
    await user.type(screen.getByLabelText('Correo'), 'ana@example.test');
    await user.type(screen.getByLabelText('Teléfono'), '3001234567');
    await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30');
    await user.click(screen.getByRole('radio', { name: 'No responsable' }));
    await user.click(screen.getByRole('checkbox', { name: /No aplica, otros/ }));
    await user.click(screen.getByRole('checkbox', { name: /prestar, facturar y dar soporte/i }));
    fireEvent.change(channelSelect, { target: { value: ConsentChannel.TELEFONO } });
    await user.click(screen.getByRole('button', { name: 'Crear suscriptor' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        personType: PersonType.NATURAL,
        authorizationChannel: ConsentChannel.TELEFONO,
        authorizations: [
          {
            purpose: 'TRATAMIENTO_CONTRACTUAL',
            granted: true,
            legalTextId: legalText.id,
          },
        ],
      }),
    );
  });

  it('CA-UX-PRIV-50: la ficha 360° pide el medio una vez y presenta el rótulo traducido', async () => {
    const user = userEvent.setup();
    render(
      <CompliancePanel
        partyId="dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        authorizations={[
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            partyId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            purpose: 'TRATAMIENTO_CONTRACTUAL',
            kind: 'LEGACY_IMPORT',
            granted: true,
            channel: 'FICHA_360',
            legalTextId: null,
            capturedAt: '2026-10-01T10:00:00.000Z',
          },
        ]}
        requests={[]}
        canManage
      />,
    );

    await screen.findByText(`Texto vigente · versión ${legalText.version}`);
    expect(screen.getByText(/Medio: Medio histórico/)).toBeInTheDocument();
    expect(screen.queryByText('FICHA_360')).not.toBeInTheDocument();
    const channelSelect = screen.getByLabelText(
      'Medio por el que la persona otorgó la autorización',
    );
    expect(channelSelect).toHaveValue('');

    await user.click(screen.getByRole('checkbox', { name: /prestación del servicio/i }));
    fireEvent.change(channelSelect, { target: { value: ConsentChannel.PRESENCIAL } });
    await user.click(screen.getByRole('button', { name: 'Guardar autorizaciones seleccionadas' }));

    await waitFor(() =>
      expect(privacyMock.createAuthorization).toHaveBeenCalledWith({
        partyId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        purpose: 'TRATAMIENTO_CONTRACTUAL',
        granted: true,
        channel: ConsentChannel.PRESENCIAL,
        legalTextId: legalText.id,
      }),
    );
  });
});
