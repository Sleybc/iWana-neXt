import { BRANDING_SLOT_RULES, validateBrandingFileForUpload } from './branding-validation';

describe('branding-validation', () => {
  it('expone umbrales estrictos por slot', () => {
    expect(BRANDING_SLOT_RULES.logo).toEqual(
      expect.objectContaining({ minWidth: 240, minHeight: 60, maxBytes: 1024 * 1024 }),
    );
    expect(BRANDING_SLOT_RULES.seal).toEqual(
      expect.objectContaining({
        minWidth: 128,
        minHeight: 128,
        square: true,
        maxBytes: 512 * 1024,
      }),
    );
    expect(BRANDING_SLOT_RULES.favicon).toEqual(
      expect.objectContaining({ minWidth: 32, minHeight: 32, square: true, maxBytes: 256 * 1024 }),
    );
    expect(BRANDING_SLOT_RULES.login_background).toEqual(
      expect.objectContaining({ minWidth: 1280, minHeight: 720, maxBytes: 5 * 1024 * 1024 }),
    );
  });

  it('rechaza MIME inválido antes de intentar upload', async () => {
    const file = new File(['plain text'], 'logo.txt', { type: 'text/plain' });

    const validationError = await validateBrandingFileForUpload(file, 'logo');

    expect(validationError).toContain('Formato no permitido');
  });

  it('rechaza archivos por tamaño máximo del slot', async () => {
    const oversized = new File([new Uint8Array(257 * 1024)], 'favicon.png', {
      type: 'image/png',
    });

    const validationError = await validateBrandingFileForUpload(oversized, 'favicon');

    expect(validationError).toBe('El archivo supera el máximo permitido de 256 KB.');
  });

  it('permite favicon ICO delegando validación de dimensiones al backend', async () => {
    const file = new File([new Uint8Array(512)], 'favicon.ico', { type: 'image/x-icon' });

    const validationError = await validateBrandingFileForUpload(file, 'favicon');

    expect(validationError).toBeNull();
  });
});
