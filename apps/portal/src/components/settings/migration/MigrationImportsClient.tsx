'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Badge, Button } from '@iwana/ui';
import { FileArchive, Upload } from 'lucide-react';
import { MIGRATION_IMPORT_LIMITS, type MigrationBatchSummary } from '@iwana/shared';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { migrationApi } from '@/lib/api-client';
import {
  MIGRATION_COPY,
  formatMigrationDate,
  MIGRATION_MAX_ZIP_LABEL,
  isBatchInProgress,
  migrationBatchHref,
  migrationBatchStatusPresentation,
  migrationErrorMessage,
  validateMigrationFiles,
} from './migration-labels';
import { MIGRATION_POLL_INTERVAL_MS, useMigrationAccess } from './useMigrationAccess';

function filesCopy(count: number): string {
  return count === 1 ? '1 archivo' : `${count} archivos`;
}

function UploadBatchForm({ onCreated }: { onCreated: (batch: MigrationBatchSummary) => void }) {
  const inputId = useId();
  const helpId = `${inputId}-ayuda`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const localError = validateMigrationFiles(files);
    if (localError) {
      setError(localError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const batch = await migrationApi.createBatch(files);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
      onCreated(batch);
    } catch (uploadError) {
      setError(
        migrationErrorMessage(uploadError, 'No pudimos subir los archivos. Intenta de nuevo.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3" aria-busy={saving}>
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-900 dark:text-white">
          Archivos ZIP de clientes de UISP
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept=".zip,application/zip"
          disabled={saving}
          aria-describedby={helpId}
          className="block w-full text-sm text-gray-900 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:text-sm file:font-medium dark:text-white dark:file:bg-dark-surface-3 dark:file:text-white"
          onChange={(event) => {
            setError(null);
            setFiles(Array.from(event.target.files ?? []));
          }}
        />
        <p id={helpId} className="text-sm text-gray-500 dark:text-gray-400">
          Hasta {MIGRATION_IMPORT_LIMITS.maxZipsPerBatch} archivos de {MIGRATION_MAX_ZIP_LABEL} cada
          uno. Los archivos se conservan {MIGRATION_IMPORT_LIMITS.retentionDays} días.
        </p>
      </div>
      {files.length > 0 ? (
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {filesCopy(files.length)} seleccionados.
        </p>
      ) : null}
      {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
      <Button type="submit" className="min-h-11" loading={saving} disabled={files.length === 0}>
        <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
        Subir y simular
      </Button>
    </form>
  );
}

export function MigrationImportsClient() {
  const router = useRouter();
  const access = useMigrationAccess();
  const [batches, setBatches] = useState<MigrationBatchSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await migrationApi.listBatches({ page: 1, limit: 50 });
      setBatches(response.data);
      setError(null);
    } catch (loadError) {
      setError(migrationErrorMessage(loadError, 'No pudimos cargar los lotes.'));
    }
  }, []);

  useEffect(() => {
    if (access.ready && access.allowed) void load();
  }, [access.ready, access.allowed, load]);

  const inProgress = batches?.some(isBatchInProgress) ?? false;
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => void load(), MIGRATION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [inProgress, load]);

  if (!access.ready) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={MIGRATION_COPY.pageTitle} subtitle="Cargando…" />
        <PortalSkeletonBlock className="h-48" />
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title={MIGRATION_COPY.pageTitle} subtitle={MIGRATION_COPY.pageSubtitle} />
        <PortalAlert
          variant="warning"
          title={MIGRATION_COPY.forbiddenTitle}
          description={MIGRATION_COPY.forbiddenDescription}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={MIGRATION_COPY.pageTitle} subtitle={MIGRATION_COPY.pageSubtitle} />

      <PortalPanel
        title="Nuevo lote"
        description="Exporta cada cliente desde UISP y sube los ZIP. Primero verás una simulación por entidad y motivo."
      >
        <UploadBatchForm onCreated={(batch) => router.push(migrationBatchHref(batch.id))} />
      </PortalPanel>

      <PortalPanel title="Lotes" labelled>
        <p role="status" aria-live="polite" className="sr-only">
          {inProgress ? 'Hay lotes en proceso; la lista se actualiza sola.' : ''}
        </p>
        {error ? (
          <PortalAlert
            variant="error"
            title={error}
            action={
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Reintentar
              </Button>
            }
          />
        ) : batches === null ? (
          <div aria-busy="true" className="space-y-2">
            <PortalSkeletonBlock className="h-14" />
            <PortalSkeletonBlock className="h-14" />
          </div>
        ) : batches.length === 0 ? (
          <PortalEmptyState
            embedded
            icon={FileArchive}
            title="Aún no hay lotes"
            description="Sube los ZIP de tus clientes de UISP para ver la simulación."
          />
        ) : (
          <ul
            aria-label="Lotes de importación"
            className="divide-y divide-gray-100 dark:divide-dark-border"
          >
            {batches.map((batch) => {
              const status = migrationBatchStatusPresentation(
                batch.status,
                batch.processing,
                batch.promotionProcessing ?? undefined,
              );
              const created = formatMigrationDate(batch.createdAt);
              return (
                <li
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Lote del {created}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {filesCopy(batch.filesReceived)}
                      {batch.purgedAt ? ' · archivos eliminados por retención' : ''}
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <Link
                    href={migrationBatchHref(batch.id)}
                    className={portalPanelDenseActionClassName}
                    aria-label={`Ver informe del lote del ${created}`}
                  >
                    Ver informe
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PortalPanel>
    </div>
  );
}
