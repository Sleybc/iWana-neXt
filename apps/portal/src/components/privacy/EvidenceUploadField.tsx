'use client';

import { useRef, useState } from 'react';
import { privacyApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);

interface EvidenceUploadFieldProps {
  label?: string;
  onUploaded: (mediaId: string | null) => void;
}

/** Carga privada sin preview ni persistencia del archivo en el estado global. */
export function EvidenceUploadField({
  label = 'Evidencia de identidad',
  onUploaded,
}: EvidenceUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.has(extension)) {
      setError('Elige un archivo PDF, JPEG, PNG o WEBP.');
      onUploaded(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('El archivo no puede superar 10 MiB.');
      onUploaded(null);
      return;
    }

    setBusy(true);
    try {
      await privacyApi.uploadEvidence(file).then(({ mediaId }) => {
        setFileName(file.name);
        onUploaded(mediaId);
      });
    } catch {
      setError('No fue posible cargar la evidencia. Revisa el archivo e inténtalo de nuevo.');
      onUploaded(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-800 dark:text-gray-100">
        {label}
        <span className="mt-1 block text-xs font-normal text-gray-600 dark:text-gray-300">
          PDF, JPEG, PNG o WEBP; hasta 10 MiB.
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
          aria-label={label}
          disabled={busy}
          onChange={(event) => {
            void handleChange(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <button
          type="button"
          className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-iwana-primary hover:bg-iwana-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iwana-primary dark:border-dark-border-2 dark:text-white dark:hover:bg-dark-surface-3"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Cargando evidencia…' : fileName ? 'Cambiar archivo' : 'Elegir archivo'}
        </button>
        {fileName ? (
          <span className="text-sm text-gray-600 dark:text-gray-300">Archivo cargado</span>
        ) : null}
      </div>
      {error ? (
        <PortalAlert variant="error" title="No se cargó el archivo" description={error} />
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? 'Cargando evidencia' : fileName ? 'Evidencia cargada' : ''}
      </p>
    </div>
  );
}
