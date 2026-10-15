import { render, screen } from '@testing-library/react';
import {
  ExpedienteConversionBanner,
  getExpedienteConversionFailureMessage,
} from './ExpedienteConversionBanner';

const pendingFailure = {
  eventName: 'crm.expediente.ready-for-installation',
  errorCode: 'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED',
  attempts: 2,
  lastFailedAt: '2026-10-15T12:00:00.000Z',
};

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('ExpedienteConversionBanner', () => {
  it('renders CTA when subscriber summary exists', () => {
    render(
      <ExpedienteConversionBanner
        status="INSTALACION_AGENDADA"
        subscriberSummary={{ id: 'sub-1', status: 'PROSPECT', fullName: 'Laura Pérez' }}
      />,
    );
    expect(
      screen.getByText('Esta oportunidad ya fue convertida a suscriptor.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al suscriptor' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/sub-1',
    );
  });

  it('renders banner without CTA when no subscriber summary', () => {
    render(<ExpedienteConversionBanner status="CLIENTE_ACTIVO" />);
    expect(
      screen.getByText('Esta oportunidad ya fue convertida a suscriptor.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ir al suscriptor' })).not.toBeInTheDocument();
  });

  it('returns null for non-converted statuses', () => {
    const { container } = render(<ExpedienteConversionBanner status="NUEVO_POTENCIAL" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('returns null for PRECALIFICADO status', () => {
    const { container } = render(<ExpedienteConversionBanner status="PRECALIFICADO" />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    [
      'SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED',
      'crm.expediente.ready-for-installation',
      'No se creó el suscriptor: falta la autorización de tratamiento de datos. Regístrala en Consentimientos y vuelve a intentarlo.',
    ],
    [
      'PRIVACY_LEGAL_TEXT_NOT_PUBLISHED',
      'crm.expediente.ready-for-installation',
      'No se creó el suscriptor: la empresa no tiene publicado el texto de autorización. Pide a quien administra la privacidad que lo publique.',
    ],
    [
      'SUBSCRIBER_CONTACT_REQUIRED',
      'crm.expediente.activated',
      'El suscriptor no se activó: registra al menos un teléfono o un correo.',
    ],
    [
      'CONVERSION_FAILED',
      'crm.expediente.ready-for-installation',
      'No se pudo completar la conversión. Vuelve a intentarlo; si el problema continúa, contacta a soporte.',
    ],
  ])('muestra copy de producto para %s', (errorCode, eventName, expectedMessage) => {
    const failure = { ...pendingFailure, errorCode, eventName };
    render(
      <ExpedienteConversionBanner status="LISTO_PARA_INSTALACION" conversionFailure={failure} />,
    );

    expect(screen.getByText(expectedMessage)).toBeInTheDocument();
    expect(screen.queryByText(errorCode)).not.toBeInTheDocument();
    expect(screen.queryByText(eventName)).not.toBeInTheDocument();
  });

  it('usa el mensaje general si falta el contacto en otro evento', () => {
    expect(
      getExpedienteConversionFailureMessage({
        ...pendingFailure,
        errorCode: 'SUBSCRIBER_CONTACT_REQUIRED',
      }),
    ).toBe(
      'No se pudo completar la conversión. Vuelve a intentarlo; si el problema continúa, contacta a soporte.',
    );
  });

  it('ofrece reintentar solo cuando el usuario tiene permiso y ejecuta la acción', () => {
    const onRetryConversion = jest.fn();
    const { rerender } = render(
      <ExpedienteConversionBanner
        status="LISTO_PARA_INSTALACION"
        conversionFailure={pendingFailure}
        canRetryConversion
        onRetryConversion={onRetryConversion}
      />,
    );

    screen.getByRole('button', { name: 'Reintentar conversión' }).click();
    expect(onRetryConversion).toHaveBeenCalledTimes(1);

    rerender(
      <ExpedienteConversionBanner
        status="LISTO_PARA_INSTALACION"
        conversionFailure={pendingFailure}
        canRetryConversion={false}
        onRetryConversion={onRetryConversion}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reintentar conversión' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Pide a un administrador que reintente la conversión.'),
    ).toBeInTheDocument();
    expect(onRetryConversion).toHaveBeenCalledTimes(1);
  });

  it('muestra el siguiente paso para usuarios sin acción de reintento', () => {
    render(
      <ExpedienteConversionBanner
        status="LISTO_PARA_INSTALACION"
        conversionFailure={pendingFailure}
      />,
    );

    expect(
      screen.getByText(getExpedienteConversionFailureMessage(pendingFailure)),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pide a un administrador que reintente la conversión.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar conversión' })).not.toBeInTheDocument();
  });
});
