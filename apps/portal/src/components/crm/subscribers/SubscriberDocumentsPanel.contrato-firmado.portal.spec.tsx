/**
 * Contrato firmado en la pestaña Documentos (cierre de venta, bloque G; spec §5 G, CA-9) e
 * insignia «Pendiente de firma» (bloque F; CA-5).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AccessPermissionKey,
  SubscriberStatus,
  type SignedContractDocument,
  type SubscriberListItem,
} from '@iwana/shared';
import { ApiError, crmApi } from '@/lib/api-client';
import type { Contract } from '@/lib/api-client';
import { SubscriberDocumentsPanel, signedContractRows } from './SubscriberDocumentsPanel';
import { deriveSubscriberBadges, deriveSubscriberListBadges } from './subscriber-badges';

const mockGranted = { current: new Set<AccessPermissionKey>() };
jest.mock('@/components/access-control/permissions-context', () => ({
  usePermissions: (() => {
    let ctx: Record<string, unknown> | undefined;
    return () =>
      (ctx ??= {
        hasPermission: (key: AccessPermissionKey) => mockGranted.current.has(key),
      });
  })(),
}));

const SUBSCRIBER_ID = '00000000-0000-4000-8000-0000000000a1';
const CONTRACT = {
  id: '00000000-0000-4000-8000-0000000000c1',
  alias: 'Sede Norte',
  planSnapshotJson: { name: 'Fibra 300' },
  stratumEvidenceMediaId: null,
} as unknown as Contract;

const SIGNED: SignedContractDocument = {
  contractId: CONTRACT.id,
  signedAt: '2026-11-10T15:00:00.000Z',
  templateVersion: '1.0',
  downloadable: true,
  restriction: null,
};

let signedSpy: jest.SpyInstance;

beforeEach(() => {
  mockGranted.current = new Set([AccessPermissionKey.CRM_SUBSCRIBERS_READ]);
  signedSpy = jest
    .spyOn(crmApi, 'getSignedContracts')
    .mockResolvedValue({ data: { items: [SIGNED] } });
});

afterEach(() => jest.restoreAllMocks());

function renderPanel(props: Partial<Parameters<typeof SubscriberDocumentsPanel>[0]> = {}) {
  return render(
    <SubscriberDocumentsPanel
      subscriberId={SUBSCRIBER_ID}
      expedienteId={null}
      contracts={[CONTRACT]}
      anonymized={false}
      restricted={false}
      statement={null}
      {...props}
    />,
  );
}

async function signedRow() {
  const list = await screen.findByRole('list', { name: 'Documentos del suscriptor' });
  const [row] = within(list).getAllByRole('listitem');
  if (!row) throw new Error('Sin fila');
  return row;
}

describe('Documentos — contrato firmado', () => {
  it('muestra una fila por contrato con la fecha de firma y la descarga', async () => {
    renderPanel();
    const row = await signedRow();
    expect(signedSpy).toHaveBeenCalledWith(SUBSCRIBER_ID);
    expect(within(row).getByText(/^Contrato firmado · /)).toBeInTheDocument();
    expect(within(row).getByText('Plantilla 1.0')).toBeInTheDocument();
    expect(within(row).queryByText('Sin dato', { selector: 'dd > span' })).not.toBeNull();
    expect(
      within(row).getByRole('button', { name: /Descargar PDF de Contrato firmado/ }),
    ).toBeEnabled();
  });

  it('descarga el PDF del contrato firmado', async () => {
    const pdfSpy = jest
      .spyOn(crmApi, 'signedContractPdf')
      .mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    const createUrl = jest.fn(() => 'blob:contrato');
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: jest.fn() });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPanel();
    const row = await signedRow();
    await userEvent.click(within(row).getByRole('button', { name: /Descargar PDF/ }));
    await waitFor(() => expect(pdfSpy).toHaveBeenCalledWith(CONTRACT.id));
    expect(click).toHaveBeenCalled();
  });

  it('sin permiso del documento: fila sin descarga y con el motivo', async () => {
    signedSpy.mockResolvedValue({
      data: {
        items: [{ ...SIGNED, downloadable: false, restriction: 'DOCUMENT_NUMBER_RESTRICTED' }],
      },
    });
    renderPanel();
    const row = await signedRow();
    expect(within(row).queryByRole('button', { name: /Descargar/ })).toBeNull();
    expect(
      within(row).getByText(
        'Sin descarga: incluye el número de documento y no tienes permiso para verlo.',
      ),
    ).toBeInTheDocument();
  });

  it('un 403 al descargar muestra un mensaje sin detalles técnicos', async () => {
    jest
      .spyOn(crmApi, 'signedContractPdf')
      .mockRejectedValue(new ApiError(403, 'SIGNED_CONTRACT_DOCUMENT_RESTRICTED', 'prohibido'));
    renderPanel();
    const row = await signedRow();
    await userEvent.click(within(row).getByRole('button', { name: /Descargar PDF/ }));
    expect(
      await screen.findByText('No tienes permiso para descargar el contrato firmado.'),
    ).toBeInTheDocument();
  });

  it('si la consulta de contratos firmados falla, avisa y no oculta lo demás', async () => {
    signedSpy.mockRejectedValue(new Error('caído'));
    renderPanel();
    expect(await screen.findByText('No pudimos cargar los contratos firmados')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay documentos')).toBeInTheDocument();
  });

  it('sin subscriberId no consulta los contratos firmados', async () => {
    renderPanel({ subscriberId: null });
    expect(await screen.findByText('Aún no hay documentos')).toBeInTheDocument();
    expect(signedSpy).not.toHaveBeenCalled();
  });

  it('titular anonimizado: la fila no nombra el servicio', () => {
    const [row] = signedContractRows(
      [{ ...SIGNED, downloadable: false, restriction: 'TITULAR_RESTRICTED' }],
      [CONTRACT],
      true,
    );
    expect(row).toMatchObject({
      type: 'Contrato firmado',
      note: 'Sin descarga: los datos de este suscriptor están restringidos.',
    });
    expect(row?.action).toBeUndefined();
  });
});

describe('Insignia «Pendiente de firma» (CA-5)', () => {
  it('aparece en la ficha cuando pendingSignature=true', () => {
    const badges = deriveSubscriberBadges({
      status: SubscriberStatus.ACTIVE,
      pendingSignature: true,
    });
    expect(badges).toContainEqual({
      id: 'pending-signature',
      label: 'Pendiente de firma',
      variant: 'warning',
    });
  });

  it('no aparece sin el dato ni para un titular anonimizado', () => {
    expect(
      deriveSubscriberBadges({ status: SubscriberStatus.ACTIVE }).map((badge) => badge.id),
    ).not.toContain('pending-signature');
    expect(
      deriveSubscriberBadges({
        status: SubscriberStatus.ACTIVE,
        pendingSignature: true,
        anonymizedAt: '2026-11-01T00:00:00.000Z',
      }),
    ).toEqual([]);
  });

  it('la lista la toma de la fila', () => {
    const item = {
      status: SubscriberStatus.ACTIVE,
      vatTreatment: null,
      contactPending: false,
      anonymizedAt: null,
      primaryService: null,
      pendingSignature: true,
    } as unknown as SubscriberListItem;
    expect(deriveSubscriberListBadges(item).map((badge) => badge.label)).toContain(
      'Pendiente de firma',
    );
  });
});
