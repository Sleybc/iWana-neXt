import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DocumentSupportSection } from './DocumentSupportSection';

type CrmApi = typeof import('@/lib/api-client').crmApi;
type GetDocumentSupports = CrmApi['getDocumentSupports'];
type UploadDocumentSupport = CrmApi['uploadDocumentSupport'];
type UpdateDocumentSupportStatus = CrmApi['updateDocumentSupportStatus'];
type DeleteDocumentSupport = CrmApi['deleteDocumentSupport'];
type DocumentSupportResponse = import('@/lib/api-client').ExpedienteDocumentSupportResponse;
type DocumentVersion = import('@/lib/api-client').ExpedienteDocumentVersion;
type DocumentItem = DocumentSupportResponse['items'][number];

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

function buildItem(
  versions = [buildVersion()],
  overrides: Partial<{
    key: string;
    label: string;
    hint: string;
  }> = {},
): DocumentItem {
  return {
    key: overrides.key ?? 'cedula_ciudadania',
    label: overrides.label ?? 'Cédula de ciudadanía',
    hint: overrides.hint ?? 'Documento principal del titular',
    versions,
  };
}

function buildPayloadFromItems(items: DocumentItem[]): { data: DocumentSupportResponse } {
  return {
    data: {
      personType: 'PERSONA_NATURAL',
      items,
      summary: {
        requiredCount: items.length,
        uploadedCount: items.filter((item) => item.versions.length > 0).length,
        approvedCount: items.filter((item) => item.versions[0]?.status === 'APPROVED').length,
        blockStatus: items.some((item) => item.versions[0]?.status === 'OBSERVED')
          ? 'OBSERVADO'
          : items.some((item) => item.versions.length > 0)
            ? 'EN_REVISION'
            : 'PENDIENTE',
      },
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('DocumentSupportSection', () => {
  beforeEach(() => {
    mockGetDocumentSupports.mockReset();
    mockUploadDocumentSupport.mockReset();
    mockUpdateDocumentSupportStatus.mockReset();
    mockDeleteDocumentSupport.mockReset();
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
      expect(mockGetDocumentSupports).toHaveBeenCalledTimes(1);
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
    mockDeleteDocumentSupport.mockResolvedValueOnce(buildPayload([currentVersion, baseVersion]));

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
      expect(mockGetDocumentSupports).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('documento-vigente.pdf')).toBeInTheDocument();
    expect(screen.queryByText(/V2 · documento-anterior\.pdf/)).not.toBeInTheDocument();
  });

  it('mantiene el estado correcto con la respuesta del borrado sin depender de un refetch adicional', async () => {
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

    mockGetDocumentSupports.mockResolvedValueOnce(buildPayload([currentVersion, previousVersion]));
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
      expect(mockGetDocumentSupports).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it('bloquea solo las acciones del mismo documento mientras una eliminación está en progreso', async () => {
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
    const secondDocumentVersion = buildVersion({
      id: 'version-rut',
      fileName: 'rut.pdf',
      uploadedAt: '2026-05-09T09:00:00.000Z',
    });
    const deleteDeferred = createDeferred<{ data: DocumentSupportResponse }>();

    mockGetDocumentSupports.mockResolvedValueOnce(
      buildPayloadFromItems([
        buildItem([currentVersion, previousVersion]),
        buildItem([secondDocumentVersion], {
          key: 'rut',
          label: 'RUT',
          hint: 'Registro tributario',
        }),
      ]),
    );
    mockDeleteDocumentSupport.mockReturnValueOnce(deleteDeferred.promise);

    render(<DocumentSupportSection expedienteId="expediente-1" personType="PERSONA_NATURAL" />);

    expect(await screen.findByText('documento-vigente.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver historial (2)' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Eliminar versión actual de Cédula de ciudadanía' }),
    );

    await waitFor(() => {
      expect(mockDeleteDocumentSupport).toHaveBeenCalledWith(
        'expediente-1',
        'cedula_ciudadania',
        'version-actual',
        undefined,
        'PERSONA_NATURAL',
      );
    });

    const [firstReplaceButton, secondReplaceButton] = screen.getAllByRole('button', {
      name: 'Reemplazar archivo',
    });
    const [firstApproveButton, secondApproveButton] = screen.getAllByRole('button', {
      name: 'Aprobar',
    });

    expect(
      screen.getByRole('button', { name: 'Eliminar versión actual de Cédula de ciudadanía' }),
    ).toBeDisabled();
    expect(firstReplaceButton).toBeDisabled();
    expect(firstApproveButton).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Eliminar versión 1 de Cédula de ciudadanía' }),
    ).toBeDisabled();

    fireEvent.click(firstApproveButton!);
    expect(mockUpdateDocumentSupportStatus).not.toHaveBeenCalled();

    expect(secondReplaceButton).not.toBeDisabled();
    expect(secondApproveButton).not.toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Eliminar versión actual de RUT' }),
    ).not.toBeDisabled();

    deleteDeferred.resolve(
      buildPayloadFromItems([
        buildItem([previousVersion]),
        buildItem([secondDocumentVersion], {
          key: 'rut',
          label: 'RUT',
          hint: 'Registro tributario',
        }),
      ]),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Eliminar versión actual de Cédula de ciudadanía' }),
      ).not.toBeDisabled();
    });
  });
});
