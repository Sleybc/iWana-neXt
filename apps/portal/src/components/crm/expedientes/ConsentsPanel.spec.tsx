import { render, screen, within } from '@testing-library/react';
import type { DataAuthorizationView } from '@iwana/shared';
import { crmApi, subscribersApi } from '@/lib/api-client';
import { ConsentsPanel } from './ConsentsPanel';

type SubscriberResponse = Awaited<ReturnType<typeof subscribersApi.get360>>;

function authorization(overrides: Partial<DataAuthorizationView> = {}): DataAuthorizationView {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    partyId: '00000000-0000-4000-8000-000000000002',
    purpose: 'TRATAMIENTO_CONTRACTUAL',
    kind: 'GRANT',
    granted: true,
    channel: 'PRESENCIAL',
    legalTextId: null,
    capturedAt: '2026-11-15T12:00:00.000Z',
    ...overrides,
  };
}

function subscriberResponse(
  habeasData: DataAuthorizationView[],
  privacyRestricted = false,
): SubscriberResponse {
  return {
    habeasData,
    privacyDetailsRestricted: false,
    subscriber: { privacyRestricted, anonymizedAt: null },
  } as SubscriberResponse;
}

afterEach(() => jest.restoreAllMocks());

describe('ConsentsPanel de un expediente vinculado', () => {
  it('muestra ambas autorizaciones vigentes del titular sin consultar los registros del expediente', async () => {
    const legacy = jest.spyOn(crmApi, 'listConsents');
    const read = jest.spyOn(subscribersApi, 'get360').mockResolvedValue(
      subscriberResponse([
        authorization(),
        authorization({
          id: '00000000-0000-4000-8000-000000000003',
          purpose: 'CONTACTO_COMERCIAL',
        }),
      ]),
    );
    render(
      <ConsentsPanel
        expedienteId="expediente-1"
        subscriberId="suscriptor-1"
        canReadSubscriberAuthorizations
      />,
    );

    const list = await screen.findByRole('list', { name: 'Autorizaciones por finalidad' });
    expect(within(list).getAllByText('Autorización vigente')).toHaveLength(2);
    expect(read).toHaveBeenCalledWith('suscriptor-1');
    expect(legacy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Ver cumplimiento del suscriptor' })).toHaveAttribute(
      'href',
      '/dashboard/crm/subscribers/suscriptor-1?tab=cumplimiento',
    );
  });

  it('muestra una revocación posterior aunque exista una autorización anterior', async () => {
    jest.spyOn(subscribersApi, 'get360').mockResolvedValue(
      subscriberResponse([
        authorization({
          id: '00000000-0000-4000-8000-000000000003',
          kind: 'REVOCATION',
          granted: false,
          capturedAt: '2026-11-16T12:00:00.000Z',
        }),
        authorization(),
      ]),
    );
    render(
      <ConsentsPanel
        expedienteId="expediente-1"
        subscriberId="suscriptor-1"
        canReadSubscriberAuthorizations
      />,
    );

    expect(await screen.findByText('Retirada')).toBeInTheDocument();
    expect(screen.queryByText('Autorización vigente')).not.toBeInTheDocument();
  });

  it('no solicita la ficha sin permisos de lectura', () => {
    const read = jest.spyOn(subscribersApi, 'get360');
    render(<ConsentsPanel expedienteId="expediente-1" subscriberId="suscriptor-1" />);

    expect(screen.getByText('Autorizaciones restringidas para tu perfil.')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  it('oculta las autorizaciones si la ficha del titular devuelve datos bloqueados', async () => {
    jest
      .spyOn(subscribersApi, 'get360')
      .mockResolvedValue(subscriberResponse([authorization()], true));
    render(
      <ConsentsPanel
        expedienteId="expediente-1"
        subscriberId="suscriptor-1"
        canReadSubscriberAuthorizations
      />,
    );

    expect(
      await screen.findByText('Autorizaciones restringidas para tu perfil.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Autorización vigente')).not.toBeInTheDocument();
  });
});
