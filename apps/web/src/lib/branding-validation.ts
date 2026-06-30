export type BrandingSlot = 'logo' | 'seal' | 'favicon' | 'login_background';

export type BrandingSlotRule = {
  allowedMimes: string[];
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatioMin?: number;
  aspectRatioMax?: number;
  square?: boolean;
  helpText: string;
};

/**
 * Reglas de branding tenant para apps/web.
 * Permiten ajustar umbrales por slot en un único punto de configuración.
 */
export const BRANDING_SLOT_RULES: Record<BrandingSlot, BrandingSlotRule> = {
  logo: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 1 * 1024 * 1024,
    minWidth: 240,
    minHeight: 60,
    aspectRatioMin: 1.6,
    aspectRatioMax: 5,
    helpText: 'PNG/JPG/WEBP, máximo 1 MB, mínimo 240x60 px, proporción entre 1.60 y 5.00.',
  },
  seal: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 512 * 1024,
    minWidth: 128,
    minHeight: 128,
    square: true,
    maxWidth: 1024,
    maxHeight: 1024,
    helpText: 'PNG/JPG/WEBP, máximo 512 KB, cuadrado, entre 128x128 y 1024x1024 px.',
  },
  favicon: {
    allowedMimes: ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'],
    maxBytes: 256 * 1024,
    minWidth: 32,
    minHeight: 32,
    square: true,
    maxWidth: 512,
    maxHeight: 512,
    helpText: 'PNG/ICO, máximo 256 KB, cuadrado, entre 32x32 y 512x512 px.',
  },
  login_background: {
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    minWidth: 1280,
    minHeight: 720,
    aspectRatioMin: 1.6,
    aspectRatioMax: 1.9,
    helpText: 'PNG/JPG/WEBP, máximo 5 MB, mínimo 1280x720 px, proporción entre 1.60 y 1.90.',
  },
};

function resolveFileMimeType(file: File): string {
  if (file.type) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'ico') {
    return 'image/x-icon';
  }

  return '';
}

function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudieron validar las dimensiones.'));
    };

    img.src = objectUrl;
  });
}

function formatMaxSize(maxBytes: number): string {
  if (maxBytes >= 1024 * 1024) {
    return `${Math.round(maxBytes / (1024 * 1024))} MB`;
  }

  return `${Math.round(maxBytes / 1024)} KB`;
}

export async function validateBrandingFileForUpload(
  file: File,
  slot: BrandingSlot,
): Promise<string | null> {
  const rule = BRANDING_SLOT_RULES[slot];
  const mimeType = resolveFileMimeType(file);

  if (!rule.allowedMimes.includes(mimeType)) {
    return `Formato no permitido. ${rule.helpText}`;
  }

  if (file.size > rule.maxBytes) {
    return `El archivo supera el máximo permitido de ${formatMaxSize(rule.maxBytes)}.`;
  }

  // Algunos navegadores no decodifican ICO en el objeto Image; backend valida de forma autoritativa.
  if (slot === 'favicon' && mimeType.includes('icon')) {
    return null;
  }

  let dimensions: { width: number; height: number };
  try {
    dimensions = await loadImageDimensions(file);
  } catch {
    return 'No se pudieron validar las dimensiones de la imagen.';
  }

  if (dimensions.width < rule.minWidth || dimensions.height < rule.minHeight) {
    return `La imagen debe ser al menos de ${rule.minWidth}x${rule.minHeight} px.`;
  }

  if (
    typeof rule.maxWidth === 'number' &&
    typeof rule.maxHeight === 'number' &&
    (dimensions.width > rule.maxWidth || dimensions.height > rule.maxHeight)
  ) {
    return `La imagen no puede superar ${rule.maxWidth}x${rule.maxHeight} px.`;
  }

  if (rule.square) {
    const tolerance = Math.max(1, Math.round(dimensions.width * 0.02));
    if (Math.abs(dimensions.width - dimensions.height) > tolerance) {
      return 'La imagen debe ser cuadrada (1:1).';
    }
  }

  if (typeof rule.aspectRatioMin === 'number' && typeof rule.aspectRatioMax === 'number') {
    const aspectRatio = dimensions.width / dimensions.height;
    if (aspectRatio < rule.aspectRatioMin || aspectRatio > rule.aspectRatioMax) {
      return `La proporción debe estar entre ${rule.aspectRatioMin.toFixed(2)} y ${rule.aspectRatioMax.toFixed(2)}.`;
    }
  }

  return null;
}
