import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentSupportSection } from './DocumentSupportSection';

type CrmApi = typeof import('@/lib/api-client').crmApi;
type GetDocumentSupports = CrmApi['getDocumentSupports'];
type UploadDocumentSupport = CrmApi['uploadDocumentSupport'];
type UpdateDocumentSupportStatus = CrmApi['updateDocumentSupportStatus'];
type DeleteDocumentSupport = CrmApi['deleteDocumentSupport'];
type DocumentSupportResponse = import('@/lib/api-client').ExpedienteDocumentSupportResponse;
type DocumentVersion = import('@/lib/api-client').ExpedienteDocumentVersion;

const mockGetDocumentSupports: jest.MockedFunction<GetDocumentSupports> = jest.fn();
const mockUploadDocumentSupport: jest.MockedFunction<UploadDocumentSupport> = jest.fn();
const mockUpdateDocumentSupportStatus: jest.MockedFunction<UpdateDocumentSupportStatus> = jest.fn();
const mockDeleteDocumentSupport: jest.MockedFunction<DeleteDocumentSupport> = jest.fn();

jest.mock('@/lib/api-client', () => ({
  crmApi: {
    getDocumentSupports: (...args: Parameters<GetDocumentSupports>) =>
      mockGetDocumentSupports(...args),
    uploadDocumentSupport: (...args: Parameters<UploadDocumentSupport>) =>
      mockUploadDocumentSupport(...args),
    updateDocumentSupportStatus: (...args: Parameters<UpdateDocumentSupportStatus>) =>
      mockUpdateDocumentSupportStatus(...args),
    deleteDocumentSupport: (...args: Parameters<DeleteDocumentSupport>) =>
      mockDeleteDocumentSupport(...args),
  },
}));

function buildVersion(
  overrides: Partial<{
    id: string;
    fileName: string;
    status: 'PENDING' | 'UPLOADED' | 'OBSERVED' | 'APPROVED' | 'REJECTED';
    uploadedAt: string;
    uploadedBy: string;
    note: string | null;
  }> = {},
): DocumentVersion {
  return {
    id: overrides.id ?? 'version-1',
    fileName: overrides.fileName ?? 'documento.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    uploadedAt: overrides.uploadedAt ?? '2026-05-10T10:00:00.000Z',
    uploadedBy: overrides.uploadedBy ?? 'Equipo operaciones',
    status: overrides.status ?? 'UPLOADED',
    note: overrides.note ?? null,
    downloadUrl: `https://example.test/${overrides.id ?? 'version-1'}.pdf`,
  };
}

function buildPayload(
  versions = [buildVersion()],
  overrides: Partial<{
    personType: string | null;
    key: string;
    label: string;
    hint: string;
  }> = {},
): { data: DocumentSupportResponse } {
  return {
    data: {
      personType: overrides.personType ?? 'PERSONA_NATURAL',
      items: [
        {
          key: overrides.key ?? 'cedula_ciudadania',
          label: overrides.label ?? 'Cédula de ciudadanía',
          hint: overrides.hint ?? 'Documento principal del titular',
          versions,
        },
      ],
      summary: {
        requiredCount: 1,
        uploadedCount: versions.length > 0 ? 1 : 0,
        approvedCount: versions.filter((version) => version.status === 'APPROVED').length,
        blockStatus: versions.length > 0 ? 'EN_REVISION' : 'PENDIENTE',
      },
    },
  };
}

describe('DocumentSupportSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockUploadDocumentSupport.mockResolvedValue(buildPayload());
    mockUpdateDocumentSupportStatus.mockResolvedValue(buildPayload());
    mockDeleteDocumentSupport.mockResolvedValue(buildPayload());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('elimina la versión actual y promueve la versión previa como archivo activo', async () => {
    const currentVersion = buildVersion({
      id: 'version-actual',
      fileName: 'documento-vigente.pdf',
      uploadedAt: '2026-05-12T09:00:00.000Z',
    });
    const previousVersion = buildVersion({
      id: 'version-previa',
      fileName: 'documento-anterior.pdf',
      uploadedAt: '2026-05-10T09:00:00.000Z',
    });
    const onSaved = jest.fn();

    mockGetDocumentSupports
      .mockResolvedValueOnce(buildPayload([currentVersion, previousVersion]))
      .mockResolvedValueOnce(buildPayload([previousVersion]));

    render(
      <DocumentSupportSection
        expedienteId="expediente-1"
        personType="PERSONA_NATURAL"
        onSaved={onSaved}
      />,
    );

    expect(await screen.findByText('documento-vigente.pdf')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Eliminar versión actual de Cédula de ciudadanía' }),
    );

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        '¿Eliminar la versión "documento-vigente.pdf" de Cédula de ciudadanía? Si existe una versión previa, quedará activa de nuevo.',
      );
    });

    await waitFor(() => {
      expect(mockDeleteDocumentSupport).toHaveBeenCalledWith(
        'expediente-1',
        'cedula_ciudadania',
        'version-actual',
        undefined,
        'PERSONA_NATURAL',
      );
    });

    await waitFor(() => {
      expect(mockGetDocumentSupports).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('documento-anterior.pdf')).toBeInTheDocument();
    expect(screen.queryByText('documento-vigente.pdf')).not.toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('permite eliminar una versión puntual desde el historial', async () => {
    const currentVersion = buildVersion({
      id: 'version-actual',
      fileName: 'documento-vigente.pdf',
      uploadedAt: '2026-05-12T09:00:00.000Z',
    });
    const middleVersion = buildVersion({
      id: 'version-intermedia',
      fileName: 'documento-anterior.pdf',
      uploadedAt: '2026-05-11T09:00:00.000Z',
    });
    const baseVersion = buildVersion({
      id: 'version-base',
      fileName: 'documento-base.pdf',
      uploadedAt: '2026-05-10T09:00:00.000Z',
    });

    mockGetDocumentSupports
      .mockResolvedValueOnce(buildPayload([currentVersion, middleVersion, baseVersion]))
      .mockResolvedValueOnce(buildPayload([currentVersion, baseVersion]));

    render(<DocumentSupportSection expedienteId="expediente-1" personType="PERSONA_NATURAL" />);

    expect(await screen.findByText('documento-vigente.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver historial (3)' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar versión 2 de Cédula de ciudadanía' }),
    );

    await waitFor(() => {
      expect(mockDeleteDocumentSupport).toHaveBeenCalledWith(
        'expediente-1',
        'cedula_ciudadania',
        'version-intermedia',
        undefined,
        'PERSONA_NATURAL',
      );
    });

    await waitFor(() => {
      expect(mockGetDocumentSupports).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText('documento-vigente.pdf')).toBeInTheDocument();
    expect(screen.queryByText(/V2 · documento-anterior\.pdf/)).not.toBeInTheDocument();
  });

  it('mantiene el estado correcto tras eliminar aunque falle el refetch posterior', async () => {
    const currentVersion = buildVersion({
      id: 'version-actual',
      fileName: 'documento-vigente.pdf',
      uploadedAt: '2026-05-12T09:00:00.000Z',
    });
    const previousVersion = buildVersion({
      id: 'version-previa',
      fileName: 'documento-anterior.pdf',
      uploadedAt: '2026-05-10T09:00:00.000Z',
    });
    const onSaved = jest.fn();

    mockGetDocumentSupports
      .mockResolvedValueOnce(buildPayload([currentVersion, previousVersion]))
      .mockRejectedValueOnce(new Error('No fue posible refrescar los soportes.'));
    mockDeleteDocumentSupport.mockResolvedValueOnce(buildPayload([previousVersion]));

    render(
      <DocumentSupportSection
        expedienteId="expediente-1"
        personType="PERSONA_NATURAL"
        onSaved={onSaved}
      />,
    );

    expect(await screen.findByText('documento-vigente.pdf')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Eliminar versión actual de Cédula de ciudadanía' }),
    );

    expect(await screen.findByText('documento-anterior.pdf')).toBeInTheDocument();
    expect(screen.queryByText('documento-vigente.pdf')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockGetDocumentSupports).toHaveBeenCalledTimes(2);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('No fue posible refrescar los soportes.')).toBeInTheDocument();
  });
});
