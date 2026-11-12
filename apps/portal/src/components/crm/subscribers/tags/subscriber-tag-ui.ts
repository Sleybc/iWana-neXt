import { ApiError } from '@/lib/api-client';

/** Máximo de chips visibles en una línea antes de resumir el resto con «+N». */
export const SUBSCRIBER_TAG_VISIBLE_MAX = 3;

/** Color sugerido al crear una etiqueta nueva. */
export const SUBSCRIBER_TAG_DEFAULT_COLOR = '#2563EB';

/**
 * Elige texto negro o blanco sobre el color de la etiqueta según el contraste WCAG
 * (luminancia relativa): gana el que dé mayor razón de contraste.
 */
export function subscriberTagTextColor(hex: string): '#000000' | '#FFFFFF' {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return '#000000';
  const value = match[1] as string;
  const channel = (offset: number) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#FFFFFF';
}

/** Mensaje visible para los errores del catálogo y de la asignación de etiquetas. */
export function subscriberTagErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'SUBSCRIBER_TAG_NAME_TAKEN':
        return 'Ya existe una etiqueta con ese nombre.';
      case 'SUBSCRIBER_TAG_CATALOG_FULL':
        return 'Llegaste al máximo de etiquetas. Elimina alguna que ya no uses para crear otra.';
      case 'SUBSCRIBER_TAG_NOT_FOUND':
        return 'Esa etiqueta ya no existe. Actualiza la lista.';
      case 'PRIVACY_TITULAR_ANONYMIZED':
        return 'Los datos de este suscriptor fueron anonimizados; no se pueden cambiar sus etiquetas.';
      case 'PRIVACY_DATA_BLOCKED':
        return 'Los datos de este suscriptor están bloqueados; no se pueden cambiar sus etiquetas.';
      case 'VALIDATION_ERROR':
        return 'Revisa el nombre y el color de la etiqueta.';
      default:
        break;
    }
    if (error.status === 403) return 'No tienes acceso para cambiar etiquetas.';
  }
  return 'No pudimos guardar el cambio. Reintenta en unos minutos.';
}
