import { fireEvent, render, screen } from '@testing-library/react';
import { ApiError, privacyApi } from '@/lib/api-client';
import { EvidenceUploadField } from './EvidenceUploadField';

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
  privacyApi: { uploadEvidence: jest.fn() },
}));

const uploadEvidence = privacyApi.uploadEvidence as jest.Mock;

function selectPdf() {
  const file = new File(['%PDF-1.7'], 'evidencia.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Evidencia de identidad'), {
    target: { files: [file] },
  });
}

describe('EvidenceUploadField', () => {
  beforeEach(() => uploadEvidence.mockReset());

  it('explica que la carga no está disponible cuando el almacenamiento no es privado', async () => {
    uploadEvidence.mockRejectedValue(
      new ApiError(503, 'PRIVACY_EVIDENCE_STORAGE_MUST_BE_PRIVATE', 'storage'),
    );
    const onUploaded = jest.fn();
    render(<EvidenceUploadField onUploaded={onUploaded} />);

    selectPdf();

    expect(
      await screen.findByText(
        'La carga de evidencias no está disponible en este momento. Contacta al administrador de la plataforma.',
      ),
    ).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(null);
  });

  it('conserva el mensaje genérico ante otros fallos', async () => {
    uploadEvidence.mockRejectedValue(new Error('red'));
    render(<EvidenceUploadField onUploaded={jest.fn()} />);

    selectPdf();

    expect(
      await screen.findByText(
        'No fue posible cargar la evidencia. Revisa el archivo e inténtalo de nuevo.',
      ),
    ).toBeInTheDocument();
  });
});
