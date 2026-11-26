import {
  MIGRATION_ERROR_CODES,
  MIGRATION_IMPORT_LIMITS,
  MigrationRevertBlockerSchema,
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
  type MigrationBatchStatus,
  type MigrationBatchSummary,
  type MigrationEntity,
  type MigrationErrorCode,
  type MigrationFileRejectionReason,
  type MigrationMappingAction,
  type MigrationMappingKind,
  type MigrationObservation,
  type MigrationProcessingState,
  type MigrationRejectionReason,
  type MigrationRevertBlockReason,
  type MigrationRevertBlocker,
  type MigrationTicketAttachmentSkipReason,
} from '@iwana/shared';
import { ApiError } from '@/lib/api-client';

/**
 * Vocabulario visible de «Importaciones» (ADR-110; plan 2026-11-12 bloque F). Ningún código
 * interno llega a la pantalla: todo estado, motivo o tipo pasa por estas tablas.
 */
export const MIGRATION_SETTINGS_HREF = '/dashboard/settings/imports';

export function migrationBatchHref(batchId: string): string {
  return `${MIGRATION_SETTINGS_HREF}/${encodeURIComponent(batchId)}`;
}

export const MIGRATION_COPY = {
  pageTitle: 'Importaciones',
  pageSubtitle:
    'Trae suscriptores, servicios, facturas, pagos, tickets y soportes desde UISP. Cada lote se simula primero; nada pasa a iWana hasta que lo promuevas.',
  forbiddenTitle: 'No tienes acceso a las importaciones',
  forbiddenDescription:
    'Solo un administrador con el permiso de importación de datos puede subir y promover lotes.',
} as const;

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary';

export const MIGRATION_BATCH_STATUS_LABELS: Record<
  MigrationBatchStatus,
  { label: string; variant: BadgeVariant }
> = {
  SIMULADO: { label: 'Simulado', variant: 'info' },
  CARGADO: { label: 'Promoviendo', variant: 'warning' },
  PROMOVIDO: { label: 'Promovido', variant: 'primary' },
  CONCILIADO: { label: 'Conciliado', variant: 'success' },
  REVERTIDO: { label: 'Revertido', variant: 'neutral' },
};

/**
 * Estado visible del lote: el procesamiento en curso o fallido de la simulación prevalece sobre
 * el estado persistido (`counts.procesamiento`).
 */
export function migrationBatchStatusPresentation(
  status: MigrationBatchStatus,
  processing: MigrationProcessingState,
  promotionProcessing?: MigrationProcessingState,
): { label: string; variant: BadgeVariant } {
  if (status === 'CARGADO' && promotionProcessing === 'FALLIDO') {
    return { label: 'Promoción fallida', variant: 'error' };
  }
  if (processing === 'PENDIENTE') return { label: 'Procesando', variant: 'warning' };
  if (processing === 'FALLIDO') return { label: 'Procesamiento fallido', variant: 'error' };
  return MIGRATION_BATCH_STATUS_LABELS[status];
}

/**
 * Se puede eliminar un lote simulado (con la simulación terminada) o revertido (ADR-110 v1.4
 * D16); los cargados, promovidos o conciliados se revierten primero.
 */
export function isBatchDeletable(
  batch: Pick<MigrationBatchSummary, 'status' | 'processing'>,
): boolean {
  return (
    (batch.status === 'SIMULADO' && batch.processing !== 'PENDIENTE') ||
    batch.status === 'REVERTIDO'
  );
}

/**
 * Texto visible del valor de UISP de un pendiente: su nombre si lo hay; el ciclo como «Día N
 * del mes»; el método de pago sin nombre con un código corto, no el UUID completo.
 */
export function migrationPendingValueLabel(value: {
  kind: MigrationMappingKind;
  externalValue: string;
  externalLabel: string | null;
}): string {
  if (value.externalLabel) return value.externalLabel;
  if (value.kind === 'CICLO' && /^\d{1,2}$/u.test(value.externalValue)) {
    return `Día ${Number(value.externalValue)} del mes`;
  }
  if (value.kind === 'METODO_PAGO' && value.externalValue.length > 12) {
    return `Método de UISP sin nombre (${value.externalValue.slice(0, 8)})`;
  }
  return value.externalValue;
}

export function isBatchInProgress(
  batch: Pick<MigrationBatchSummary, 'status' | 'processing' | 'promotionProcessing'>,
): boolean {
  return (
    batch.processing === 'PENDIENTE' ||
    (batch.status === 'CARGADO' && batch.promotionProcessing !== 'FALLIDO')
  );
}

export const MIGRATION_ENTITY_LABELS: Record<MigrationEntity, string> = {
  SUSCRIPTOR: 'Suscriptores',
  CONTRATO: 'Servicios',
  DOCUMENTO_COBRO: 'Facturas',
  PAGO: 'Pagos',
  TICKET: 'Tickets',
  SOPORTE_DOCUMENTAL: 'Soportes documentales',
};

export const MIGRATION_REJECTION_REASON_LABELS: Record<MigrationRejectionReason, string> = {
  DATOS_INVALIDOS: 'Datos con formato no válido',
  TITULAR_EXISTENTE: 'El suscriptor ya existe en iWana',
  TITULAR_ANONIMIZADO: 'El suscriptor fue anonimizado en iWana',
  DEPENDE_DE_TITULAR_RECHAZADO: 'Su suscriptor no se pudo importar',
  PLAN_SIN_EQUIVALENCIA: 'Plan sin equivalencia',
  METODO_PAGO_SIN_EQUIVALENCIA: 'Método de pago sin equivalencia',
  CICLO_SIN_EQUIVALENCIA: 'Ciclo de facturación sin equivalencia',
  ETIQUETA_SIN_EQUIVALENCIA: 'Etiqueta sin equivalencia',
  EXTERNAL_ID_DUPLICADO: 'Registro repetido en el lote',
  DATOS_OBLIGATORIOS_AUSENTES: 'Faltan datos obligatorios del suscriptor',
  SIN_CONTRATO_ASOCIADO: 'Sin servicio al que asociarlo',
  MONTO_O_FECHA_INVALIDOS: 'Monto o fecha no admitidos',
  ARCHIVO_AUSENTE: 'El archivo ya no está en el lote',
  TITULAR_VINCULADO_A_OTRO_CLIENTE: 'El suscriptor ya está enlazado a otro cliente de UISP',
};

export const MIGRATION_FILE_REJECTION_LABELS: Record<MigrationFileRejectionReason, string> = {
  ZIP_INVALIDO: 'Archivo ZIP dañado o no válido',
  ZIP_DEMASIADO_GRANDE: 'Archivo demasiado grande al descomprimir',
  ZIP_DEMASIADAS_ENTRADAS: 'Archivo con demasiados elementos',
  ZIP_RUTA_NO_PERMITIDA: 'Archivo con rutas no permitidas',
  ZIP_COMPRESION_SOSPECHOSA: 'Archivo con compresión sospechosa',
  ZIP_ENLACE_SIMBOLICO: 'Archivo con enlaces no permitidos',
  CLIENTE_AUSENTE: 'El archivo no trae los datos del cliente',
  JSON_INVALIDO: 'Datos del cliente ilegibles',
  CLIENTE_REPETIDO: 'Cliente repetido en el lote',
};

export const MIGRATION_OBSERVATION_LABELS: Record<MigrationObservation, string> = {
  DATOS_FISCALES_INCOMPLETOS: 'Suscriptores con datos tributarios incompletos',
  COORDENADAS_FUERA_DE_COLOMBIA: 'Ubicaciones fuera de Colombia',
  ESTRATO_PENDIENTE_EVIDENCIA: 'Estrato pendiente de soporte',
  TAREAS_SIN_FUENTE: 'Tareas de UISP que no se importan',
  YA_IMPORTADO: 'Registros ya importados antes',
  FACTURA_SIN_PDF: 'Facturas sin PDF',
  CRUCE_CON_FACTURACION_IWANA: 'Facturas que se cruzan con la facturación de iWana',
  DATO_DISTINTO_EN_UISP: 'Datos distintos en UISP (se conservó el de iWana)',
  USUARIO_UISP_SIN_ENLAZAR: 'Usuarios de UISP sin enlazar',
};

export const MIGRATION_MAPPING_KIND_LABELS: Record<MigrationMappingKind, string> = {
  PLAN: 'Plan',
  METODO_PAGO: 'Método de pago',
  CICLO: 'Ciclo de facturación',
  ETIQUETA: 'Etiqueta',
  TITULAR: 'Titular',
  USUARIO: 'Usuario',
};

export const MIGRATION_MAPPING_ACTION_LABELS: Record<MigrationMappingAction, string> = {
  EQUIVALE: 'Asignar equivalente',
  DESCARTAR: 'Descartar',
  NOTA: 'Guardar como nota',
};

/** Solo las etiquetas admiten descartar o guardar como nota (CHECK de la 194). */
export function mappingActionsFor(kind: MigrationMappingKind): MigrationMappingAction[] {
  return kind === 'ETIQUETA' ? ['EQUIVALE', 'DESCARTAR', 'NOTA'] : ['EQUIVALE'];
}

export const MIGRATION_REVERT_BLOCK_LABELS: Record<MigrationRevertBlockReason, string> = {
  PAGO_POSTERIOR: 'Pagos registrados después de la importación',
  APLICACION_POSTERIOR: 'Pagos aplicados después de la importación',
  DOCUMENTO_POSTERIOR: 'Facturas emitidas después de la importación',
  CONTRATO_POSTERIOR: 'Servicios creados después de la importación',
  ORDEN_DE_TRABAJO: 'Órdenes de trabajo asociadas',
  // Cuenta tickets nuevos y adjuntos añadidos a mano en tickets importados (spec MOD09 §2.3).
  TICKET_POSTERIOR: 'Tickets o adjuntos añadidos después de la importación',
  SOPORTE_POSTERIOR: 'Soportes cargados después de la importación',
  ETIQUETA_POSTERIOR: 'Etiquetas asignadas después de la importación',
  DATO_COMPLETADO_MODIFICADO: 'Un dato que completó el lote se editó después',
};

/** Bloqueos de la reversión desde `details.blockers` del 409; vacío si no vienen o no validan. */
export function revertBlockersFromError(error: unknown): MigrationRevertBlocker[] {
  if (!(error instanceof ApiError) || error.code !== 'MIGRATION_REVERT_BLOCKED') return [];
  const details = error.details as { blockers?: unknown } | undefined;
  if (!details || !Array.isArray(details.blockers)) return [];
  return details.blockers.flatMap((item) => {
    const parsed = MigrationRevertBlockerSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Detalle del 409 cuando bloquea `TICKET_POSTERIOR`: la API explica en `message` si hay adjuntos
 * añadidos a mano que quitar (spec MOD09 2026-11-16 §2.3). Los demás bloqueos no lo usan.
 */
export function revertBlockedDetail(
  error: unknown,
  blockers: MigrationRevertBlocker[],
): string | null {
  if (!(error instanceof ApiError) || error.code !== 'MIGRATION_REVERT_BLOCKED') return null;
  if (!blockers.some((blocker) => blocker.motivo === 'TICKET_POSTERIOR')) return null;
  const message = error.message.trim();
  return message.length > 0 ? message : null;
}

/** Motivos por los que un adjunto de un comentario de ticket no se importó (spec MOD09 §2.3). */
export const MIGRATION_TICKET_ATTACHMENT_SKIP_LABELS: Record<
  MigrationTicketAttachmentSkipReason,
  string
> = {
  ARCHIVO_AUSENTE: 'El archivo no venía en el ZIP',
  TIPO_NO_PERMITIDO: 'Tipo de archivo no permitido',
  TAMANO_EXCEDIDO: 'Supera el tamaño máximo permitido',
  NOMBRE_INVALIDO: 'Nombre de archivo no válido',
  EXCEDE_MAXIMO_POR_COMENTARIO: `Más de ${TICKET_ATTACHMENTS_MAX_PER_COMMENT} archivos en un comentario`,
  COMENTARIO_NO_IMPORTADO: 'Su comentario no se importó',
};

/** Tamaño máximo por ZIP tomado del contrato (no un literal). */
export const MIGRATION_MAX_ZIP_LABEL = `${Math.round(MIGRATION_IMPORT_LIMITS.maxZipBytes / (1024 * 1024))} MB`;
export const MIGRATION_MAX_BATCH_LABEL = `${Math.round(MIGRATION_IMPORT_LIMITS.maxBatchBytes / (1024 * 1024))} MB`;

function isMigrationErrorCode(code: string): code is MigrationErrorCode {
  return (MIGRATION_ERROR_CODES as readonly string[]).includes(code);
}

const ERROR_MESSAGES: Record<MigrationErrorCode, string> = {
  MIGRATION_FILES_REQUIRED: 'Elige al menos un archivo ZIP.',
  MIGRATION_TOO_MANY_FILES: `Sube máximo ${MIGRATION_IMPORT_LIMITS.maxZipsPerBatch} archivos por lote.`,
  MIGRATION_FILE_TOO_LARGE: `Uno de los archivos supera ${MIGRATION_MAX_ZIP_LABEL}.`,
  MIGRATION_BATCH_TOO_LARGE: `Los archivos suman más de ${MIGRATION_MAX_BATCH_LABEL}: divídelos en varios lotes.`,
  MIGRATION_FILE_TYPE_NOT_ALLOWED: 'Solo se admiten archivos ZIP exportados de UISP.',
  MIGRATION_ZIP_REJECTED: 'Uno de los archivos no se pudo leer como ZIP de UISP.',
  MIGRATION_ENQUEUE_FAILED:
    'No pudimos iniciar el procesamiento. Intenta de nuevo en unos minutos.',
  MIGRATION_BATCH_NOT_FOUND: 'El lote ya no existe.',
  MIGRATION_MAPPING_NOT_FOUND: 'La equivalencia ya no existe.',
  MIGRATION_MAPPING_DUPLICATED: 'Ese valor ya tiene una equivalencia guardada.',
  MIGRATION_MAPPING_TARGET_INVALID: 'Elige un destino válido para esta equivalencia.',
  MIGRATION_BATCH_NOT_PROMOTABLE: 'Este lote ya no se puede promover.',
  MIGRATION_BATCH_PURGED: 'Los archivos de este lote ya se eliminaron por retención.',
  MIGRATION_BATCH_NOT_RECONCILABLE: 'Este lote todavía no se puede conciliar.',
  MIGRATION_BATCH_NOT_REVERTIBLE: 'Este lote ya no se puede revertir.',
  MIGRATION_BATCH_NOT_DELETABLE: 'Revierte el lote antes de eliminarlo.',
  MIGRATION_REVERT_BLOCKED:
    'No se puede revertir: hay movimientos posteriores que dependen del lote.',
  MIGRATION_TITULAR_TARGET_INVALID: 'Ese suscriptor no corresponde a este cliente de UISP.',
  MIGRATION_SOURCE_UNREACHABLE: 'No pudimos conectar con UISP. Revisa la dirección.',
  MIGRATION_SOURCE_UNAUTHORIZED: 'UISP rechazó la clave de aplicación.',
  MIGRATION_SOURCE_NOT_CONFIGURED: 'Configura primero la conexión con UISP.',
  MIGRATION_USER_ROLE_NOT_ALLOWED: 'Ese rol no se puede asignar a un usuario importado.',
  MIGRATION_UISP_USER_NOT_FOUND: 'Ese usuario de UISP ya no está en la lista.',
  MIGRATION_UISP_USER_ALREADY_RESOLVED: 'Ese usuario de UISP ya se revisó.',
};

export function migrationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const known = isMigrationErrorCode(error.code) ? ERROR_MESSAGES[error.code] : undefined;
    if (known) return known;
    if (error.status === 403) return 'No tienes permiso para esta acción.';
  }
  return fallback;
}

/** Validación local antes de subir: tipo, tamaño y cantidad (los mismos límites del API). */
export function validateMigrationFiles(files: File[]): string | null {
  if (files.length === 0) return ERROR_MESSAGES.MIGRATION_FILES_REQUIRED;
  if (files.length > MIGRATION_IMPORT_LIMITS.maxZipsPerBatch) {
    return ERROR_MESSAGES.MIGRATION_TOO_MANY_FILES;
  }
  const notZip = files.find((file) => !file.name.toLowerCase().endsWith('.zip'));
  if (notZip) return `«${notZip.name}» no es un archivo ZIP.`;
  const tooLarge = files.find((file) => file.size > MIGRATION_IMPORT_LIMITS.maxZipBytes);
  if (tooLarge) return `«${tooLarge.name}» supera ${MIGRATION_MAX_ZIP_LABEL}.`;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MIGRATION_IMPORT_LIMITS.maxBatchBytes) {
    return `Los archivos suman más de ${MIGRATION_MAX_BATCH_LABEL}: divídelos en varios lotes.`;
  }
  return null;
}

/** `uisp:client:123` → «Cliente 123 de UISP»; nunca se muestra el prefijo interno. */
export function externalClientLabel(externalId: string): string {
  const id = externalId.split(':').pop() ?? externalId;
  return `Cliente ${id} de UISP`;
}

const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
export function formatMigrationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}
