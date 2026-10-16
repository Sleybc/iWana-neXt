import type React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DataSubjectRequestDetail, ErasurePreview } from '@iwana/shared';
import { ApiError, privacyApi } from '@/lib/api-client';
import { PrivacyRequestDetail } from './PrivacyRequestDetail';

jest.mock('@/components/shared/portal-ui', () => {
  const actual = jest.requireActual<typeof import('@/components/shared/portal-ui')>(
    '@/components/shared/portal-ui',
  );
  return {
    ...actual,
    PortalSidePeek: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div>{children}</div> : null,
  };
});

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const candidateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const requestDetail: DataSubjectRequestDetail = {
  request: {
    id: requestId,
    partyId: null,
    requesterKind: 'TITULAR',
    kind: 'RECLAMO',
    right: 'SUPRIMIR',
    purpose: null,
    status: 'EN_TRAMITE',
    receivedAt: '2026-10-15T15:00:00.000Z',
    completeAt: null,
    dueAt: '2026-10-30',
    impersonationComplaintDueAt: null,
    suspendedContractIds: [],
    extendedUntil: null,
    infoRequiredAt: null,
    desistAt: null,
    responseText: null,
    responseChannel: null,
    resolvedAt: null,
    resolvedBy: null,
    transferredTo: null,
    legalBasis: null,
    transferDueAt: '2026-10-19',
    transferredLate: null,
    erasedAt: null,
    erasureCategories: [],
    identityStatus: 'VERIFICADA',
    identityVerificationMethod: null,
    identityVerifiedAt: null,
    hasRequesterEvidence: false,
    requester: null,
  },
  events: [],
  tasks: [],
};

const eligiblePreview: ErasurePreview = {
  eligible: true,
  blockers: [],
  candidateExpedienteIds: [candidateId],
  counts: {
    IDENTIFICACION: 1,
    CONTACTO: 2,
    UBICACION: 0,
    FISCAL: 0,
    COMERCIAL: 1,
    EVIDENCIA_CONSENTIMIENTO: 0,
    CUENTA_USUARIO: 0,
    EVIDENCIA_DOCUMENTAL: 0,
    OPERACION_CAMPO: 0,
  },
  categories: ['IDENTIFICACION', 'CONTACTO', 'COMERCIAL'],
};

const getRequestMock = jest.spyOn(privacyApi, 'getRequest');
const getErasurePreviewMock = jest.spyOn(privacyApi, 'getErasurePreview');
const resolveRequestMock = jest.spyOn(privacyApi, 'resolveRequest');

function renderDetail() {
  return render(
    <PrivacyRequestDetail
      requestId={requestId}
      open
      onClose={jest.fn()}
      canManage
      onChanged={jest.fn()}
    />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  getRequestMock.mockResolvedValue(requestDetail);
  getErasurePreviewMock.mockResolvedValue(eligiblePreview);
  resolveRequestMock.mockResolvedValue(undefined);
});

describe('PrivacyRequestDetail · supresión', () => {
  it('muestra el conteo por categoría y habilita la confirmación solo al aceptar la irreversibilidad', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Resolver' }));

    expect(await screen.findByRole('dialog', { name: 'Revisar supresión de datos' })).toBeVisible();
    expect(getErasurePreviewMock).toHaveBeenCalledWith(requestId);
    expect(screen.getByText('Expedientes encontrados:')).toBeInTheDocument();
    expect(screen.getByText('Identificación')).toBeInTheDocument();
    expect(screen.getByText('Contacto')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Resolver y anonimizar' });
    expect(submit).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', {
        name: /entiendo que los datos personales se anonimizarán de forma irreversible/i,
      }),
    );
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(resolveRequestMock).toHaveBeenCalledWith(
        requestId,
        expect.objectContaining({
          responseChannel: 'EMAIL',
          erasure: { confirm: true, expedienteIds: [candidateId] },
        }),
      ),
    );
  });

  it('mantiene deshabilitada la resolución cuando hay bloqueos y muestra sus rótulos en español', async () => {
    const user = userEvent.setup();
    getErasurePreviewMock.mockResolvedValueOnce({
      ...eligiblePreview,
      eligible: false,
      blockers: ['UNRECONCILED_TITULAR', 'ACTIVE_USER_ACCOUNT', 'TOO_MANY_CANDIDATES'],
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Resolver' }));

    expect(
      await screen.findByText('No fue posible conciliar los datos con una única persona titular.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('La persona titular tiene una cuenta de usuario activa.'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Hay demasiados expedientes para resolver desde la pantalla. Usa el procedimiento de emergencia del Oficial de protección de datos',
      ),
    ).toBeVisible();
    expect(screen.queryByText('ACTIVE_USER_ACCOUNT')).not.toBeInTheDocument();
    expect(screen.queryByText('TOO_MANY_CANDIDATES')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', {
        name: /entiendo que los datos personales se anonimizarán de forma irreversible/i,
      }),
    );
    expect(screen.getByRole('button', { name: 'Resolver y anonimizar' })).toBeDisabled();
    expect(resolveRequestMock).not.toHaveBeenCalled();
  });

  it('recarga la vista previa y exige una nueva confirmación si cambian los expedientes', async () => {
    const user = userEvent.setup();
    getErasurePreviewMock
      .mockResolvedValueOnce(eligiblePreview)
      .mockResolvedValueOnce({ ...eligiblePreview, candidateExpedienteIds: [] });
    resolveRequestMock.mockRejectedValueOnce(
      new ApiError(409, 'PRIVACY_ERASURE_CANDIDATES_CHANGED', 'El alcance cambió.'),
    );
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Resolver' }));
    await screen.findByText('Conteo por categoría');
    await user.click(
      screen.getByRole('checkbox', {
        name: /entiendo que los datos personales se anonimizarán de forma irreversible/i,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Resolver y anonimizar' }));

    await waitFor(() => expect(getErasurePreviewMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(
        'El alcance cambió mientras revisabas la solicitud. Revisa el resumen actualizado antes de confirmar.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: /entiendo que los datos personales se anonimizarán de forma irreversible/i,
      }),
    ).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Resolver y anonimizar' })).toBeDisabled();
  });

  it('traduce el plazo, el traslado extemporáneo y las categorías de una supresión ejecutada', async () => {
    getRequestMock.mockResolvedValueOnce({
      ...requestDetail,
      request: {
        ...requestDetail.request,
        status: 'RESUELTA',
        erasedAt: '2026-10-16T12:00:00.000Z',
        erasureCategories: ['IDENTIFICACION', 'OPERACION_CAMPO'],
        transferredLate: true,
      },
    });
    renderDetail();

    expect(await screen.findByText('Plazo de traslado:')).toBeInTheDocument();
    expect(screen.getByText('Traslado extemporáneo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Supresión ejecutada' })).toBeInTheDocument();
    expect(screen.getByText('Identificación')).toBeInTheDocument();
    expect(screen.getByText('Operación en campo')).toBeInTheDocument();
    expect(screen.queryByText('IDENTIFICACION')).not.toBeInTheDocument();
  });
});
