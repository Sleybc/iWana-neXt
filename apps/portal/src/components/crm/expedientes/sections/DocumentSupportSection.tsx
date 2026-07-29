'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button } from '@iwana/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileBadge2,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  crmApi,
  type DocumentReviewStatus,
  type ExpedienteDocumentItem,
  type ExpedienteDocumentSupportResponse,
} from '@/lib/api-client';

interface DocumentSupportSectionProps {
  expedienteId: string;
  personType?: string | null;
  onSaved?: () => void | Promise<void>;
}

function isLegalEntityPersonType(value: string | null | undefined): boolean {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  return (
    normalized === 'PERSONA_JURIDICA' ||
    normalized === 'JURIDICA' ||
    normalized === 'PERSONAJURIDICA' ||
    normalized === 'TIPO_PERSONA_JURIDICA'
  );
}

function getStatusVariant(status: DocumentReviewStatus) {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'OBSERVED':
      return 'warning';
    case 'REJECTED':
      return 'error';
    case 'UPLOADED':
      return 'info';
    default:
      return 'neutral';
  }
}

function getStatusLabel(status: DocumentReviewStatus) {
  switch (status) {
    case 'APPROVED':
      return 'Aprobado';
    case 'OBSERVED':
      return 'Observado';
    case 'REJECTED':
      return 'Rechazado';
    case 'UPLOADED':
      return 'Cargado';
    default:
      return 'Pendiente';
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getSummaryVariant(
  blockStatus: ExpedienteDocumentSupportResponse['summary']['blockStatus'],
) {
  if (blockStatus === 'COMPLETO') return 'success';
  if (blockStatus === 'OBSERVADO') return 'warning';
  if (blockStatus === 'EN_REVISION') return 'info';
  return 'neutral';
}

function getSummaryLabel(blockStatus: ExpedienteDocumentSupportResponse['summary']['blockStatus']) {
  if (blockStatus === 'COMPLETO') return 'Completo';
  if (blockStatus === 'OBSERVADO') return 'Observado';
  if (blockStatus === 'EN_REVISION') return 'En revisión';
  return 'Pendiente';
}

function buildLocalDocumentSummary(
  items: ExpedienteDocumentItem[],
): ExpedienteDocumentSupportResponse['summary'] {
  const requiredCount = items.length;
  const uploadedCount = items.filter((item) => item.versions.length > 0).length;
  const approvedCount = items.filter((item) => item.versions[0]?.status === 'APPROVED').length;
  const hasObservedVersion = items.some((item) => {
    const currentVersion = item.versions[0];
    return currentVersion?.status === 'OBSERVED' || currentVersion?.status === 'REJECTED';
  });

  if (requiredCount > 0 && approvedCount === requiredCount) {
    return { requiredCount, uploadedCount, approvedCount, blockStatus: 'COMPLETO' };
  }

  if (hasObservedVersion) {
    return { requiredCount, uploadedCount, approvedCount, blockStatus: 'OBSERVADO' };
  }

  if (uploadedCount > 0) {
    return { requiredCount, uploadedCount, approvedCount, blockStatus: 'EN_REVISION' };
  }

  return { requiredCount, uploadedCount, approvedCount, blockStatus: 'PENDIENTE' };
}

function buildPayloadAfterDelete(
  currentPayload: ExpedienteDocumentSupportResponse | null,
  documentKey: string,
  versionId: string,
): ExpedienteDocumentSupportResponse | null {
  if (!currentPayload) {
    return null;
  }

  const items = currentPayload.items.map((item) =>
    item.key === documentKey
      ? {
          ...item,
          versions: item.versions.filter((version) => version.id !== versionId),
        }
      : item,
  );

  return {
    ...currentPayload,
    items,
    summary: buildLocalDocumentSummary(items),
  };
}

function getDocumentKeyFromSavingKey(savingKey: string | null): string | null {
  if (!savingKey) {
    return null;
  }

  if (savingKey.startsWith('delete:')) {
    const [, documentKey] = savingKey.split(':');
    return documentKey ?? null;
  }

  const [documentKey] = savingKey.split(':');
  return documentKey ?? null;
}

export function DocumentSupportSection({
  expedienteId,
  personType,
  onSaved,
}: DocumentSupportSectionProps) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());
  const [payload, setPayload] = useState<ExpedienteDocumentSupportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocumentSupports = async ({
    showLoader = true,
  }: {
    showLoader?: boolean;
  } = {}) => {
    try {
      if (showLoader) {
        setLoading(true);
      }
      const response = await crmApi.getDocumentSupports(expedienteId, undefined, personType);
      setPayload(response.data);
      setError(null);
      return response.data;
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'No fue posible cargar los soportes.',
      );
      return null;
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadDocumentSupports();
  }, [expedienteId, personType]);

  const items = payload?.items ?? [];
  const summary = payload?.summary ?? {
    requiredCount: 0,
    uploadedCount: 0,
    approvedCount: 0,
    blockStatus: 'PENDIENTE' as const,
  };

  const toggleHistory = (documentKey: string) => {
    setExpandedHistoryIds((current) => {
      const next = new Set(current);
      if (next.has(documentKey)) {
        next.delete(documentKey);
      } else {
        next.add(documentKey);
      }
      return next;
    });
  };

  const handleUpload = async (documentKey: string, file: File) => {
    try {
      setSavingKey(documentKey);
      const response = await crmApi.uploadDocumentSupport(
        expedienteId,
        documentKey,
        file,
        undefined,
        personType,
      );
      setPayload(response.data);
      setError(null);
      await onSaved?.();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : 'No fue posible subir el archivo.',
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleStatusChange = async (
    documentKey: string,
    versionId: string,
    status: DocumentReviewStatus,
  ) => {
    try {
      setSavingKey(`${documentKey}:${status}`);
      const response = await crmApi.updateDocumentSupportStatus(
        expedienteId,
        documentKey,
        versionId,
        {
          status,
        },
        undefined,
        personType,
      );
      setPayload(response.data);
      setError(null);
      await onSaved?.();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : 'No fue posible actualizar el estado del soporte.',
      );
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteVersion = async (
    documentKey: string,
    documentLabel: string,
    versionId: string,
    fileName: string,
  ) => {
    if (
      !window.confirm(
        `¿Eliminar la versión "${fileName}" de ${documentLabel}? Si existe una versión previa, quedará activa de nuevo.`,
      )
    ) {
      return;
    }

    try {
      setSavingKey(`delete:${documentKey}:${versionId}`);
      const response = await crmApi.deleteDocumentSupport(
        expedienteId,
        documentKey,
        versionId,
        undefined,
        personType,
      );
      const nextPayload = response.data ?? buildPayloadAfterDelete(payload, documentKey, versionId);

      if (nextPayload) {
        // La respuesta del borrado pasa a ser la fuente de verdad inmediata para evitar reintroducir estado obsoleto.
        setPayload(nextPayload);
      }

      setError(null);
      await onSaved?.();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No fue posible eliminar la versión del soporte.',
      );
    } finally {
      setSavingKey(null);
    }
  };

  const orderedItems = useMemo(() => items, [items]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] border border-gray-100 bg-white px-4 py-4 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
        Cargando soportes documentales del expediente.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="flex items-start gap-2 rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="rounded-[18px] border border-gray-100 bg-iwana-surface-soft px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3/60">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Soportes requeridos para{' '}
              {isLegalEntityPersonType(personType) ? 'persona jurídica' : 'persona natural'}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              El equipo interno carga, reemplaza y revisa cada soporte. El historial conserva
              versiones previas para auditoría operativa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">
              {summary.uploadedCount} de {summary.requiredCount} cargados
            </Badge>
            <Badge variant={getSummaryVariant(summary.blockStatus)}>
              {getSummaryLabel(summary.blockStatus)}
            </Badge>
            <Badge variant="success">{summary.approvedCount} aprobados</Badge>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {orderedItems.map((document: ExpedienteDocumentItem) => {
          const versions = document.versions ?? [];
          const currentVersion = versions[0];
          const currentStatus = currentVersion?.status ?? 'PENDING';
          const isHistoryOpen = expandedHistoryIds.has(document.key);
          const isDocumentBusy = getDocumentKeyFromSavingKey(savingKey) === document.key;

          return (
            <div
              key={document.key}
              className="rounded-[18px] border border-gray-100 bg-white p-4 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-iwana-secondary/10 text-iwana-secondary-700 dark:bg-iwana-secondary/20 dark:text-iwana-secondary">
                      <FileBadge2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {document.label}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{document.hint}</p>
                    </div>
                    <Badge variant={getStatusVariant(currentStatus)}>
                      {getStatusLabel(currentStatus)}
                    </Badge>
                  </div>

                  {currentVersion ? (
                    <div className="mt-4 grid gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3 text-xs text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300 md:grid-cols-3">
                      <div>
                        <p className="font-medium text-gray-400 dark:text-gray-500">
                          Archivo actual
                        </p>
                        <p className="mt-1 truncate font-semibold text-gray-900 dark:text-white">
                          {currentVersion.fileName}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-400 dark:text-gray-500">Última carga</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                          {formatDateTime(currentVersion.uploadedAt)}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-400 dark:text-gray-500">Responsable</p>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                          {currentVersion.uploadedBy}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-4 text-xs text-gray-500 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400">
                      Aún no se ha cargado un archivo para este requisito.
                    </div>
                  )}
                </div>

                <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[220px]">
                  <input
                    ref={(node) => {
                      inputRefs.current[document.key] = node;
                    }}
                    type="file"
                    className="hidden"
                    aria-label={`Cargar documento para ${document.label}`}
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) {
                        return;
                      }
                      void handleUpload(document.key, file);
                      event.target.value = '';
                    }}
                  />

                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={savingKey === document.key}
                    disabled={isDocumentBusy}
                    onClick={() => inputRefs.current[document.key]?.click()}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    {currentVersion ? 'Reemplazar archivo' : 'Subir archivo'}
                  </Button>

                  {currentVersion?.downloadUrl ? (
                    <Button type="button" variant="secondary" size="sm" asChild>
                      <a href={currentVersion.downloadUrl} target="_blank" rel="noreferrer">
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        Ver archivo
                      </a>
                    </Button>
                  ) : null}

                  <Button
                    type="button"
                    variant="softDestructive"
                    size="sm"
                    loading={
                      currentVersion
                        ? savingKey === `delete:${document.key}:${currentVersion.id}`
                        : false
                    }
                    disabled={!currentVersion || isDocumentBusy}
                    aria-label={`Eliminar versión actual de ${document.label}`}
                    title={`Eliminar versión actual de ${document.label}`}
                    onClick={() =>
                      currentVersion &&
                      void handleDeleteVersion(
                        document.key,
                        document.label,
                        currentVersion.id,
                        currentVersion.fileName,
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Eliminar archivo
                  </Button>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={savingKey === `${document.key}:OBSERVED`}
                      disabled={!currentVersion || isDocumentBusy}
                      onClick={() =>
                        currentVersion &&
                        void handleStatusChange(document.key, currentVersion.id, 'OBSERVED')
                      }
                    >
                      Observar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      loading={savingKey === `${document.key}:APPROVED`}
                      disabled={!currentVersion || isDocumentBusy}
                      onClick={() =>
                        currentVersion &&
                        void handleStatusChange(document.key, currentVersion.id, 'APPROVED')
                      }
                    >
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      loading={savingKey === `${document.key}:REJECTED`}
                      disabled={!currentVersion || isDocumentBusy}
                      onClick={() =>
                        currentVersion &&
                        void handleStatusChange(document.key, currentVersion.id, 'REJECTED')
                      }
                    >
                      Rechazar
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => toggleHistory(document.key)}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {isHistoryOpen ? 'Ocultar historial' : `Ver historial (${versions.length})`}
                  </Button>
                </div>
              </div>

              {isHistoryOpen ? (
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-dark-border">
                  {versions.length > 0 ? (
                    versions.map((version, index) => (
                      <div
                        key={version.id}
                        className="flex flex-col gap-2 rounded-2xl border border-gray-100 px-4 py-3 text-xs text-gray-600 dark:border-dark-border dark:text-gray-300 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-gray-900 dark:text-white">
                            V{versions.length - index} · {version.fileName}
                          </p>
                          <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                            {formatDateTime(version.uploadedAt)} · {version.uploadedBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getStatusVariant(version.status)}>
                            {getStatusLabel(version.status)}
                          </Badge>
                          <a
                            href={version.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-iwana-secondary-700 hover:underline dark:text-iwana-secondary"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            Abrir
                          </a>
                          {version.note ? (
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              Nota: {version.note}
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant="softDestructive"
                            size="sm"
                            loading={savingKey === `delete:${document.key}:${version.id}`}
                            disabled={isDocumentBusy}
                            aria-label={`Eliminar versión ${versions.length - index} de ${document.label}`}
                            title={`Eliminar versión ${versions.length - index} de ${document.label}`}
                            onClick={() =>
                              void handleDeleteVersion(
                                document.key,
                                document.label,
                                version.id,
                                version.fileName,
                              )
                            }
                          >
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-4 text-xs text-gray-500 dark:border-dark-border dark:text-gray-400">
                      No hay versiones previas registradas para este soporte.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-[18px] border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-400">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
        <p>
          Usa Aprobado cuando el soporte sea legible y vigente. Marca Observado si requiere
          corrección y Rechazado cuando el archivo no sea válido para continuar el expediente.
        </p>
      </div>
    </div>
  );
}
