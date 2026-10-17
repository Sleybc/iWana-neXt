import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsentChannel, CustomerSegment, DocumentType, PersonType } from '@iwana/shared';
import { crmApi, privacyApi } from '@/lib/api-client';
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
  ApiError: class ApiError extends Error {},
  crmApi: {
    listConsents: jest.fn(),
    createConsent: jest.fn(),
    revokeConsent: jest.fn(),
  },
  privacyApi: {
    getCurrentLegalText: jest.fn(),
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
  createAuthorization: jest.Mock;
  listAuthorizations: jest.Mock;
};

const legalText = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'AUTORIZACION',
  version: '3.2',
  content: 'Autorizo el tratamiento de mis datos para la prestación del servicio.',
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

beforeEach(() => {
  jest.clearAllMocks();
  crmMock.listConsents.mockResolvedValue({ data: [historicalConsent] });
  crmMock.createConsent.mockResolvedValue({ data: historicalConsent });
  privacyMock.getCurrentLegalText.mockResolvedValue(legalText);
  privacyMock.createAuthorization.mockResolvedValue({ authorizationId: 'authorization-1' });
  privacyMock.listAuthorizations.mockResolvedValue([]);
});

describe('captura del medio de autorización', () => {
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
