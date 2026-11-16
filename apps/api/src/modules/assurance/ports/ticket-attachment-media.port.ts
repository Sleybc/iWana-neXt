import type { EntityManager } from 'typeorm';
import type { TicketAttachmentContentType } from '@iwana/shared';

/**
 * Puerto de Soporte hacia el módulo de medios para los adjuntos de tickets (spec MOD09
 * adjuntos 2026-11-16 §2.1, §2.2 y §2.4). Soporte nunca toca `public.media_assets` ni el
 * almacenamiento: el módulo de medios implementa este puerto (`TicketAttachmentMediaProvider`)
 * y lo exporta desde `MediaModule`.
 *
 * Flujo de un comentario con adjuntos (todo o nada):
 * 1. `inspect` de cada archivo, sin E/S: tipo por firma real, límite por tipo y nombre saneado.
 * 2. `store` de cada archivo con el `manager` de la transacción tenant del comentario: la fila
 *    del activo se revierte con ella; el objeto se borra con `removeObjects` si algo falla.
 * 3. `startAnalysis` después del commit: la cuarentena (`QUARANTINED`) la resuelve el worker
 *    `evidence-analysis`, como la evidencia de órdenes de trabajo.
 */
export abstract class TicketAttachmentMediaPort {
  /** Valida un archivo sin E/S. Nunca lanza: devuelve el motivo del rechazo. */
  abstract inspect(file: TicketAttachmentFileInput): TicketAttachmentInspection;

  /**
   * Guarda el objeto y la fila del activo con uso `ticket_attachment`. El activo entra
   * `QUARANTINED` (subida manual) o `AVAILABLE` (importación ya validada por firma, §2.3).
   * Falla cerrado (503) si el almacenamiento no es privado.
   */
  abstract store(
    ctx: TicketAttachmentStoreContext,
    file: TicketAttachmentFileInput,
    accepted: TicketAttachmentAccepted,
  ): Promise<{ mediaAssetId: string }>;

  /** Encola el análisis de cuarentena de los activos (después del commit). */
  abstract startAnalysis(tenantSchema: string, mediaAssetIds: string[]): Promise<void>;

  /**
   * Borra los objetos de los activos indicados, sin tocar la base (compensación de una subida
   * cuya transacción se revirtió, o purga tras retirar). Solo actúa sobre `ticket_attachment`
   * cuyo activo ya no existe o está retirado. No lanza: devuelve cuántos no pudo borrar.
   */
  abstract removeObjects(tenantSchema: string, mediaAssetIds: string[]): Promise<number>;

  /** Estado de cuarentena por activo (`asset_status`); los ausentes o retirados no aparecen. */
  abstract readStatuses(
    tenantSchema: string,
    mediaAssetIds: string[],
  ): Promise<Map<string, string>>;

  /**
   * Enlace firmado de corta duración (≤ 300 s) con `Content-Disposition` y `Content-Type`
   * forzados. `null` si el activo no existe, está retirado o no está `AVAILABLE`.
   */
  abstract signDownload(
    tenantSchema: string,
    mediaAssetId: string,
    options: TicketAttachmentSignOptions,
  ): Promise<{ url: string; expiresAt: Date } | null>;

  /**
   * Retira (soft-delete) los activos en la transacción del llamante. Devuelve cuántos retiró.
   * Los objetos se purgan después del commit con `removeObjects`.
   */
  abstract retire(
    manager: EntityManager,
    tenantSchema: string,
    mediaAssetIds: string[],
  ): Promise<number>;
}

export interface TicketAttachmentFileInput {
  buffer: Buffer;
  /** Tipo que declara el cliente (no confiable). */
  declaredContentType?: string | null;
  /** Nombre original (no confiable): se sanea. */
  originalName: string;
}

export type TicketAttachmentRejectionCode =
  | 'ARCHIVO_VACIO'
  | 'TIPO_NO_PERMITIDO'
  | 'FIRMA_NO_COINCIDE'
  | 'TAMANO_EXCEDIDO';

export interface TicketAttachmentAccepted {
  ok: true;
  /** Tipo real por firma. */
  contentType: TicketAttachmentContentType;
  sizeBytes: number;
  /** Nombre saneado (≤ 200, sin rutas ni control, extensión acorde al tipo real). */
  filename: string;
}

export interface TicketAttachmentRejected {
  ok: false;
  code: TicketAttachmentRejectionCode;
  /** Mensaje en español para la persona, sin el nombre del archivo. */
  message: string;
}

export type TicketAttachmentInspection = TicketAttachmentAccepted | TicketAttachmentRejected;

export interface TicketAttachmentStoreContext {
  manager: EntityManager;
  tenantSchema: string;
  actorId: string;
  initialStatus: 'QUARANTINED' | 'AVAILABLE';
}

export interface TicketAttachmentSignOptions {
  filename: string;
  contentType: TicketAttachmentContentType;
  /** `attachment` fuerza la descarga; `inline` abre PDF y fotos en el navegador. */
  disposition: 'inline' | 'attachment';
}
