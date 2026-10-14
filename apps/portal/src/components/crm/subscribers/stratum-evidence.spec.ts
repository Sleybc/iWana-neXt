import { ApiError } from '@/lib/api-client';
import {
  STRATUM_EVIDENCE_ACCEPT,
  STRATUM_EVIDENCE_MAX_BYTES,
  STRATUM_EVIDENCE_SIZE_MESSAGE,
  STRATUM_EVIDENCE_TYPE_MESSAGE,
  STRATUM_EVIDENCE_UPLOAD_FAILED_MESSAGE,
  stratumEvidenceFileError,
  stratumEvidenceUploadErrorMessage,
} from './stratum-evidence';

describe('reglas del soporte de estrato (C-MEDIA-1 v1.0)', () => {
  it('declara en el selector exactamente PDF, JPG, PNG y WEBP', () => {
    expect(STRATUM_EVIDENCE_ACCEPT).toBe('application/pdf,image/jpeg,image/png,image/webp');
  });

  it('fija el tope en 10 MiB', () => {
    expect(STRATUM_EVIDENCE_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it.each([['application/pdf'], ['image/jpeg'], ['image/png'], ['image/webp']])(
    'admite un archivo %s dentro del límite',
    (type) => {
      expect(stratumEvidenceFileError({ type, size: 1024 })).toBeNull();
    },
  );

  it('admite un archivo de exactamente 10 MiB', () => {
    expect(
      stratumEvidenceFileError({ type: 'application/pdf', size: STRATUM_EVIDENCE_MAX_BYTES }),
    ).toBeNull();
  });

  it.each([
    ['image/gif'],
    ['image/x-icon'],
    ['image/vnd.microsoft.icon'],
    ['image/heic'],
    ['text/plain'],
    [''],
  ])('rechaza el tipo %j con el mensaje de negocio', (type) => {
    expect(stratumEvidenceFileError({ type, size: 1024 })).toBe(STRATUM_EVIDENCE_TYPE_MESSAGE);
  });

  it('rechaza un archivo admitido que supera 10 MiB con el mensaje de tamaño', () => {
    expect(
      stratumEvidenceFileError({ type: 'application/pdf', size: STRATUM_EVIDENCE_MAX_BYTES + 1 }),
    ).toBe(STRATUM_EVIDENCE_SIZE_MESSAGE);
  });

  it('escribe los mensajes en lenguaje de negocio, sin códigos MIME', () => {
    expect(STRATUM_EVIDENCE_TYPE_MESSAGE).toBe(
      'Ese tipo de archivo no está admitido. Formatos admitidos: PDF o imagen JPG, PNG o WEBP, hasta 10 MB.',
    );
    expect(STRATUM_EVIDENCE_TYPE_MESSAGE).not.toMatch(/\//);
    expect(STRATUM_EVIDENCE_SIZE_MESSAGE).not.toMatch(/\//);
  });
});

describe('stratumEvidenceUploadErrorMessage', () => {
  it('traduce el 422 STRATUM_EVIDENCE_TYPE_NOT_ALLOWED sin reenviar el texto del servidor', () => {
    const message = stratumEvidenceUploadErrorMessage(
      new ApiError(
        422,
        'STRATUM_EVIDENCE_TYPE_NOT_ALLOWED',
        'application/x-msdownload no admitido',
      ),
    );

    expect(message).toBe(STRATUM_EVIDENCE_TYPE_MESSAGE);
    expect(message).not.toContain('x-msdownload');
  });

  it('usa el mensaje genérico para otros errores de validación del servidor', () => {
    expect(
      stratumEvidenceUploadErrorMessage(
        new ApiError(422, 'VALIDATION_ERROR', 'serviceUsage no válido'),
      ),
    ).toBe(STRATUM_EVIDENCE_UPLOAD_FAILED_MESSAGE);
  });

  it('usa el mensaje genérico para errores del servidor y fallos de red', () => {
    expect(stratumEvidenceUploadErrorMessage(new ApiError(500, 'UNKNOWN', 'boom'))).toBe(
      STRATUM_EVIDENCE_UPLOAD_FAILED_MESSAGE,
    );
    expect(stratumEvidenceUploadErrorMessage(new TypeError('Failed to fetch'))).toBe(
      STRATUM_EVIDENCE_UPLOAD_FAILED_MESSAGE,
    );
  });
});
