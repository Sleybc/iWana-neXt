'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Download, Loader2, Upload, X } from 'lucide-react';
import { parse } from 'csv-parse/browser/esm/sync';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import {
  DocumentType,
  type UsersBulkJobResultResponse,
  type UsersBulkJobStatusResponse,
} from '@iwana/shared';
import { usersApi, type CreateInternalUserDto, ApiError } from '@/lib/api-client';
import { ensureIdempotencyKey } from '@/lib/idempotency-key';
import { getPortalUserRoleLabel, resolveUserRoleFromCsv } from '@/lib/user-labels';
import { PortalAlert } from '@/components/shared/portal-ui';
import { readActiveBulkJobId, writeActiveBulkJobId } from './bulk-import-job-storage';

const MAX_FILE_SIZE_BYTES = 1_048_576; // 1MB
const MAX_USERS = 100;
const POLL_INTERVAL_MS = 2000;

const VALID_DOCUMENT_TYPES = Object.values(DocumentType) as string[];

interface ParsedRow {
  rowIndex: number;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
  jobTitle: string;
  documentType: string;
  documentNumber: string;
}

interface ValidatedRow extends ParsedRow {
  isValid: boolean;
  errors: string[];
}

interface BulkImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Notifica al listado para mostrar/ocultar el banner de progreso. */
  onActiveJobChange?: (jobId: string | null) => void;
  /** Job en curso al reabrir desde el banner. */
  resumeJobId?: string | null;
}

type Step = 'upload' | 'preview' | 'progress' | 'credentials' | 'failure' | 'claimed';

type ConfirmCloseMode = 'progress' | 'secrets' | null;

function downloadTemplate() {
  const headers = 'email,role,firstName,lastName,phone,jobTitle,documentType,documentNumber';
  const example =
    'usuario@ejemplo.com,Administrador,Nombre,Apellido,+573001234567,Analista,CC,123456789';
  const content = `${headers}\n${example}`;

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla_usuarios.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadCredentialsCsv(items: UsersBulkJobResultResponse['succeeded']): void {
  const header = 'email,role,temporaryPassword';
  const lines = items.map((item) => {
    const email = escapeCsv(item.email);
    const role = escapeCsv(getPortalUserRoleLabel(item.role));
    const password = escapeCsv(item.temporaryPassword ?? '');
    return `${email},${role},${password}`;
  });
  const content = `${header}\n${lines.join('\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'credenciales-temporales-usuarios.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function validateRow(row: ParsedRow): ValidatedRow {
  const errors: string[] = [];
  let resolvedRole = row.role;

  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push('Email inválido');
  }
  if (row.email.length > 255) {
    errors.push('Email demasiado largo (max 255)');
  }

  if (!row.role) {
    errors.push('Rol requerido');
  } else {
    const mapped = resolveUserRoleFromCsv(row.role);
    if (!mapped) {
      errors.push(`Rol inválido: "${row.role}"`);
    } else {
      resolvedRole = mapped;
    }
  }

  if (row.firstName && row.firstName.length > 100) {
    errors.push('Nombre demasiado largo (max 100)');
  }
  if (row.lastName && row.lastName.length > 100) {
    errors.push('Apellido demasiado largo (max 100)');
  }

  if (row.phone && !/^\+\d{7,15}$/.test(row.phone)) {
    errors.push('Teléfono no está en formato E.164 (ej: +573001234567)');
  }

  if (row.jobTitle && row.jobTitle.length > 150) {
    errors.push('Cargo demasiado largo (max 150)');
  }

  if (row.documentType && !VALID_DOCUMENT_TYPES.includes(row.documentType)) {
    errors.push(`Tipo de documento inválido: "${row.documentType}"`);
  }

  if (row.documentNumber && row.documentNumber.length > 30) {
    errors.push('Número de documento demasiado largo (max 30)');
  }

  return { ...row, role: resolvedRole, isValid: errors.length === 0, errors };
}

function mapToDto(row: ParsedRow): CreateInternalUserDto {
  const dto: CreateInternalUserDto = {
    email: row.email.trim().toLowerCase(),
    role: row.role,
  };
  const fn = row.firstName?.trim();
  if (fn) dto.firstName = fn;
  const ln = row.lastName?.trim();
  if (ln) dto.lastName = ln;
  const ph = row.phone?.trim();
  if (ph) dto.phone = ph;
  const jt = row.jobTitle?.trim();
  if (jt) dto.jobTitle = jt;
  const dt = row.documentType?.trim();
  if (dt) dto.documentType = dt;
  const dn = row.documentNumber?.trim();
  if (dn) dto.documentNumber = dn;
  return dto;
}

function clearSecrets(result: UsersBulkJobResultResponse | null): void {
  if (!result) return;
  for (const item of result.succeeded) {
    if ('temporaryPassword' in item) {
      delete item.temporaryPassword;
    }
  }
}

export function BulkImportUsersModal({
  isOpen,
  onClose,
  onSuccess,
  onActiveJobChange,
  resumeJobId = null,
}: BulkImportUsersModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<UsersBulkJobStatusResponse | null>(null);
  const [claimResult, setClaimResult] = useState<UsersBulkJobResultResponse | null>(null);
  const [secretsSaved, setSecretsSaved] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'ok' | 'error' | null>(null);
  const [confirmClose, setConfirmClose] = useState<ConfirmCloseMode>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const idempotencyKeyRef = useRef<string | null>(null);
  const claimingRef = useRef(false);
  const pollAbortRef = useRef(false);

  const notifyJob = useCallback(
    (id: string | null) => {
      writeActiveBulkJobId(id);
      onActiveJobChange?.(id);
    },
    [onActiveJobChange],
  );

  const resetLocalState = useCallback(() => {
    setStep('upload');
    setRows([]);
    setFileError(null);
    setActionError(null);
    setStatusError(null);
    setIsSubmitting(false);
    setJobId(null);
    setStatusSnapshot(null);
    setClaimResult((prev) => {
      clearSecrets(prev);
      return null;
    });
    setSecretsSaved(false);
    setCopyFeedback(null);
    setConfirmClose(null);
    setDragOver(false);
    idempotencyKeyRef.current = null;
    claimingRef.current = false;
  }, []);

  const finishAndClose = useCallback(() => {
    notifyJob(null);
    resetLocalState();
    onClose();
  }, [notifyJob, onClose, resetLocalState]);

  const requestClose = useCallback(() => {
    if (step === 'progress') {
      // Cerrar la vista no cancela el job: se conserva en sessionStorage + banner.
      setConfirmClose('progress');
      return;
    }
    if (
      step === 'credentials' &&
      claimResult &&
      claimResult.summary.succeeded > 0 &&
      !secretsSaved
    ) {
      setConfirmClose('secrets');
      return;
    }
    if (step === 'credentials' || step === 'failure' || step === 'claimed') {
      notifyJob(null);
    }
    resetLocalState();
    onClose();
  }, [claimResult, notifyJob, onClose, resetLocalState, secretsSaved, step]);

  const dismissToBackground = useCallback(() => {
    setConfirmClose(null);
    onClose();
  }, [onClose]);

  const handleSettleClaim = useCallback(
    async (status: UsersBulkJobStatusResponse) => {
      if (claimingRef.current) return;
      claimingRef.current = true;
      setStatusSnapshot(status);

      const succeeded = status.summary?.succeeded ?? 0;

      if (status.status === 'failed') {
        setStatusError(
          status.errorMessage?.trim() ||
            'No se importaron usuarios. Revisa los errores y vuelve a intentar.',
        );
        setStep('failure');
        notifyJob(null);
        claimingRef.current = false;
        return;
      }

      if (status.status !== 'completed') {
        claimingRef.current = false;
        return;
      }

      if (succeeded === 0) {
        setStatusSnapshot(status);
        setStep('failure');
        notifyJob(null);
        onSuccess();
        claimingRef.current = false;
        return;
      }

      if (status.credentialsClaimed) {
        setStep('claimed');
        notifyJob(null);
        onSuccess();
        claimingRef.current = false;
        return;
      }

      try {
        const result = await usersApi.claimBulkJobResult(status.jobId);
        setClaimResult(result);
        setStep('credentials');
        notifyJob(null);
        onSuccess();
      } catch (error: unknown) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
          // Resultado ya reclamado o no disponible: resumen sin secretos.
          setStep('claimed');
          notifyJob(null);
          onSuccess();
        } else {
          setStatusError('No pudimos consultar el estado. Reintentar.');
          setStep('progress');
          claimingRef.current = false;
          return;
        }
      }
      claimingRef.current = false;
    },
    [notifyJob, onSuccess],
  );

  // Reanudar job al abrir desde banner / sessionStorage.
  useEffect(() => {
    if (!isOpen) return;
    if (step === 'credentials' || step === 'failure' || step === 'claimed' || step === 'preview') {
      return;
    }

    const stored = resumeJobId ?? readActiveBulkJobId();
    if (!stored) return;
    if (jobId === stored && step === 'progress') return;

    setJobId(stored);
    setStep('progress');
    setActionError(null);
    setStatusError(null);
    claimingRef.current = false;
  }, [isOpen, resumeJobId, jobId, step]);

  // Polling de estado mientras el modal está abierto en progreso.
  useEffect(() => {
    if (!isOpen || step !== 'progress' || !jobId) return;

    pollAbortRef.current = false;
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await usersApi.getBulkJobStatus(jobId);
        if (cancelled || pollAbortRef.current) return;
        setStatusError(null);
        setStatusSnapshot(status);

        if (status.status === 'completed' || status.status === 'failed') {
          await handleSettleClaim(status);
        }
      } catch {
        if (cancelled || pollAbortRef.current) return;
        setStatusError('No pudimos consultar el estado. Reintentar.');
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      pollAbortRef.current = true;
      window.clearInterval(timer);
    };
  }, [handleSettleClaim, isOpen, jobId, step]);

  const handleFile = useCallback((file: File) => {
    setFileError(null);

    if (!file.name.endsWith('.csv')) {
      setFileError('El archivo debe ser un archivo CSV (.csv).');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError('El archivo supera el límite de 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const records: string[][] = parse(text, {
          delimiter: ',',
          skip_empty_lines: true,
          relax_column_count: true,
        });

        if (records.length < 2) {
          setFileError('El archivo no contiene datos (solo encabezados o vacío).');
          return;
        }

        const headers = (records[0] ?? []).map((h) => h.trim().toLowerCase());
        const emailIndex = headers.indexOf('email');
        const roleIndex = headers.indexOf('role');

        if (emailIndex === -1 || roleIndex === -1) {
          setFileError('El archivo debe tener al menos las columnas "email" y "role".');
          return;
        }

        const firstNameIndex = headers.indexOf('firstname');
        const lastNameIndex = headers.indexOf('lastname');
        const phoneIndex = headers.indexOf('phone');
        const jobTitleIndex = headers.indexOf('jobtitle');
        const documentTypeIndex = headers.indexOf('documenttype');
        const documentNumberIndex = headers.indexOf('documentnumber');

        const dataRows = records.slice(1).filter((r) => r.some((c) => c.trim() !== ''));

        if (dataRows.length === 0) {
          setFileError('El archivo no contiene filas de datos.');
          return;
        }

        if (dataRows.length > MAX_USERS) {
          setFileError(
            `El archivo supera el límite de ${MAX_USERS} usuarios por importación. Divide el archivo en lotes más pequeños.`,
          );
          return;
        }

        const parsed: ParsedRow[] = dataRows.map((row, i) => ({
          rowIndex: i + 2,
          email: (row[emailIndex] ?? '').trim(),
          role: (row[roleIndex] ?? '').trim(),
          firstName: (row[firstNameIndex] ?? '').trim(),
          lastName: (row[lastNameIndex] ?? '').trim(),
          phone: (row[phoneIndex] ?? '').trim(),
          jobTitle: (row[jobTitleIndex] ?? '').trim(),
          documentType: (row[documentTypeIndex] ?? '').trim(),
          documentNumber: (row[documentNumberIndex] ?? '').trim(),
        }));

        const validated = parsed.map((row) => validateRow(row));
        setRows(validated);
        setStep('preview');
      } catch {
        setFileError(
          'No se pudo leer el archivo CSV. Verifica el formato y la codificación (UTF-8).',
        );
      }
    };

    reader.onerror = () => {
      setFileError('Error al leer el archivo.');
    };

    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    const validRows = rows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsSubmitting(true);
    setActionError(null);
    setStatusError(null);

    try {
      const key = ensureIdempotencyKey(idempotencyKeyRef);
      const dtos = validRows.map(mapToDto);
      const accepted = await usersApi.bulkCreate(dtos, key);
      setJobId(accepted.jobId);
      notifyJob(accepted.jobId);
      setStep('progress');
      claimingRef.current = false;

      if (accepted.status === 'completed') {
        const status = await usersApi.getBulkJobStatus(accepted.jobId);
        await handleSettleClaim(status);
      }
    } catch (error: unknown) {
      setStep('preview');
      if (error instanceof ApiError) {
        setActionError(
          error.status === 409
            ? 'Esta importación ya está en curso.'
            : 'No pudimos iniciar la importación. Intenta de nuevo en unos minutos.',
        );
      } else {
        setActionError('No pudimos iniciar la importación. Intenta de nuevo en unos minutos.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryStatus = () => {
    setStatusError(null);
    // El effect de polling reintentará en el próximo tick; forzamos uno inmediato.
    if (jobId) {
      void usersApi
        .getBulkJobStatus(jobId)
        .then((status) => {
          setStatusSnapshot(status);
          if (status.status === 'completed' || status.status === 'failed') {
            return handleSettleClaim(status);
          }
          return undefined;
        })
        .catch(() => {
          setStatusError('No pudimos consultar el estado. Reintentar.');
        });
    }
  };

  const handleRetryFromFailure = () => {
    notifyJob(null);
    setJobId(null);
    setStatusSnapshot(null);
    clearSecrets(claimResult);
    setClaimResult(null);
    idempotencyKeyRef.current = null;
    setStep('upload');
    setRows([]);
    setActionError(null);
    setStatusError(null);
    setFileError(null);
  };

  const handleCopyAll = async () => {
    if (!claimResult) return;
    const text = claimResult.succeeded
      .map(
        (item) =>
          `${item.email}\t${item.temporaryPassword ?? ''}\t${getPortalUserRoleLabel(item.role)}`,
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('ok');
      setSecretsSaved(true);
    } catch {
      setCopyFeedback('error');
    }
  };

  const handleCopyRow = async (password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopyFeedback('ok');
      setSecretsSaved(true);
    } catch {
      setCopyFeedback('error');
    }
  };

  const handleDownloadCredentials = () => {
    if (!claimResult) return;
    downloadCredentialsCsv(claimResult.succeeded);
    setSecretsSaved(true);
  };

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.length - validCount;

  const outcomeKind: 'success' | 'partial' | null = claimResult
    ? claimResult.summary.failed > 0
      ? 'partial'
      : 'success'
    : null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent aria-labelledby="bulk-import-title" className="max-w-2xl">
        <DialogHeader className="mb-4 flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 flex-1">
            <p className="portal-eyebrow">Gestión de accesos</p>
            <DialogTitle id="bulk-import-title">Importar usuarios desde CSV</DialogTitle>
            {step === 'upload' || step === 'preview' ? (
              <DialogDescription>
                Carga un archivo CSV con los datos de los usuarios y revísalos antes de confirmar.
              </DialogDescription>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="mt-1 shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-dark-surface-3"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        {confirmClose === 'progress' && (
          <PortalAlert
            variant="info"
            title="Importación en curso"
            description="La importación sigue en segundo plano. Podrás ver el resultado al volver a este panel."
            className="mb-4"
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClose(null)}
                >
                  Seguir aquí
                </Button>
                <Button type="button" variant="lime" size="sm" onClick={dismissToBackground}>
                  Entendido
                </Button>
              </div>
            }
          />
        )}

        {confirmClose === 'secrets' && (
          <PortalAlert
            variant="warning"
            title="Contraseñas temporales"
            description="¿Ya guardaste las contraseñas temporales? No podrás verlas de nuevo."
            className="mb-4"
            action={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClose(null)}
                >
                  Seguir aquí
                </Button>
                <Button type="button" variant="lime" size="sm" onClick={finishAndClose}>
                  Ya las guardé
                </Button>
              </div>
            }
          />
        )}

        {actionError && step === 'preview' && (
          <PortalAlert
            variant="error"
            title="Error"
            description={actionError}
            icon={AlertTriangle}
            className="mb-4"
          />
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Descargar plantilla CSV
            </Button>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? 'border-iwana-primary bg-iwana-primary/5'
                  : 'border-gray-200 hover:border-iwana-secondary/50 dark:border-dark-border'
              }`}
            >
              <Upload className="h-8 w-8 text-gray-400" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Arrastra un CSV o selecciona un archivo para importar hasta {MAX_USERS} usuarios.
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                  Máximo {MAX_USERS} usuarios · 1 MB · columnas requeridas: email, role
                </p>
              </div>
              <input
                id={inputId}
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInputChange}
                className="hidden"
                aria-label="Seleccionar archivo CSV"
              />
              <label htmlFor={inputId}>
                <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-iwana-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-iwana-primary-600">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Seleccionar archivo
                </span>
              </label>
            </div>

            {fileError && (
              <PortalAlert
                variant="error"
                title="Error con el archivo"
                description={fileError}
                icon={AlertTriangle}
              />
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-gray-600 dark:text-gray-300">
                  {rows.length} registros encontrados
                </span>
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {validCount} válidos
                </span>
                {invalidCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {invalidCount} con errores
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="text-sm font-medium text-iwana-secondary-700 transition-colors hover:text-iwana-secondary-800 dark:text-iwana-secondary-400"
              >
                Volver atrás
              </button>
            </div>

            {validCount === 0 && (
              <PortalAlert
                variant="warning"
                title="Sin filas válidas"
                description="No hay filas válidas para importar. Corrige el archivo o descarga la plantilla."
                icon={AlertTriangle}
              />
            )}

            <div className="max-h-80 overflow-auto rounded-2xl border border-gray-200 dark:border-dark-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-dark-surface-3">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Fila
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Email
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Rol
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Nombre
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                  {rows.map((row) => (
                    <tr
                      key={row.rowIndex}
                      className={
                        row.isValid
                          ? 'bg-white dark:bg-dark-surface-2'
                          : 'bg-red-50 dark:bg-red-900/10'
                      }
                    >
                      <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {row.rowIndex}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-gray-900 dark:text-white">
                        {row.email || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.isValid
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {row.role ? getPortalUserRoleLabel(row.role) : '—'}
                        </span>
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-2 text-gray-900 dark:text-white">
                        {[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Válido
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"
                            title={row.errors.join(' · ')}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            {row.errors[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setStep('upload')}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="lime"
                onClick={() => void handleImport()}
                disabled={validCount === 0 || isSubmitting}
              >
                {isSubmitting
                  ? 'Enviando…'
                  : `Importar ${validCount} usuario${validCount !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        )}

        {step === 'progress' && (
          <div className="space-y-4" role="status" aria-live="polite">
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-white">
                Importación en curso
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Estamos creando los usuarios. Puedes cerrar este panel; te avisaremos cuando
                termine.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
                Procesando lote
                {statusSnapshot?.summary
                  ? ` · ${statusSnapshot.summary.succeeded} de ${statusSnapshot.summary.total}`
                  : null}
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-surface-2"
                aria-hidden="true"
              >
                <div className="h-full w-1/3 animate-pulse rounded-full bg-iwana-primary" />
              </div>
            </div>

            {statusError && (
              <PortalAlert
                variant="error"
                title="Estado no disponible"
                description={statusError}
                icon={AlertTriangle}
                action={
                  <Button type="button" variant="outline" size="sm" onClick={handleRetryStatus}>
                    Reintentar
                  </Button>
                }
              />
            )}
          </div>
        )}

        {step === 'credentials' && claimResult && (
          <div className="space-y-4" role="status" aria-live="polite">
            <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {outcomeKind === 'partial' ? 'Importación parcial' : 'Usuarios importados'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {outcomeKind === 'partial'
                    ? `Se crearon ${claimResult.summary.succeeded} de ${claimResult.summary.total} usuarios. Revisa los que fallaron y guarda las contraseñas de los creados.`
                    : `Se crearon ${claimResult.summary.succeeded} usuarios. Guarda las contraseñas temporales ahora; no podrás verlas de nuevo.`}
                </p>
              </div>
            </div>

            <PortalAlert
              variant="warning"
              title="Entrega única"
              description="Estas contraseñas solo se muestran una vez. El usuario deberá cambiarlas en el próximo inicio de sesión."
            />

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Credenciales temporales ({claimResult.succeeded.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCopyAll()}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copiar todas
                  </Button>
                  <Button
                    type="button"
                    variant="lime"
                    size="sm"
                    onClick={handleDownloadCredentials}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Descargar credenciales
                  </Button>
                </div>
              </div>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                Guárdalo en un lugar seguro. No lo subas al sistema ni lo compartas por canales
                inseguros.
              </p>
              {copyFeedback === 'ok' && (
                <p className="mb-2 text-xs font-medium text-green-700 dark:text-green-400">
                  Contraseñas copiadas al portapapeles.
                </p>
              )}
              {copyFeedback === 'error' && (
                <p className="mb-2 text-xs font-medium text-red-600 dark:text-red-400">
                  No se pudo copiar. Usa la descarga o selecciona el texto.
                </p>
              )}
              <div className="max-h-48 overflow-auto rounded-2xl border border-gray-200 dark:border-dark-border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-dark-surface-3">
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Email
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Rol
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Contraseña temporal
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                    {claimResult.succeeded.map((item) => (
                      <tr key={item.email} className="bg-white dark:bg-dark-surface-2">
                        <td className="max-w-[160px] truncate px-3 py-2 text-gray-900 dark:text-white">
                          {item.email}
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                          {getPortalUserRoleLabel(item.role)}
                        </td>
                        <td className="px-3 py-2">
                          {item.temporaryPassword ? (
                            <code className="select-all break-all font-mono text-xs text-gray-900 dark:text-white">
                              {item.temporaryPassword}
                            </code>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {item.temporaryPassword ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Copiar contraseña de ${item.email}`}
                              onClick={() => void handleCopyRow(item.temporaryPassword ?? '')}
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                              Copiar
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {claimResult.failed.length > 0 && <FailedRowsTable failed={claimResult.failed} />}

            <Button type="button" variant="lime" className="w-full" onClick={requestClose}>
              Entendido
            </Button>
          </div>
        )}

        {step === 'failure' && (
          <div className="space-y-4" role="status" aria-live="polite">
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4 dark:border-red-900/70 dark:bg-red-950/30">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-red-900 dark:text-red-100">
                  No se importaron usuarios
                </p>
                <p className="text-sm text-red-700 dark:text-red-200/90">
                  {statusError ?? 'Ningún usuario se creó. Revisa los errores y vuelve a intentar.'}
                </p>
              </div>
            </div>

            {(statusSnapshot?.failed?.length ?? 0) > 0 && (
              <FailedRowsTable failed={statusSnapshot!.failed} />
            )}

            <Button
              type="button"
              variant="lime"
              className="w-full"
              onClick={handleRetryFromFailure}
            >
              Volver a intentar
            </Button>
          </div>
        )}

        {step === 'claimed' && (
          <div className="space-y-4" role="status" aria-live="polite">
            <PortalAlert
              variant="info"
              title="Importación completada"
              description="Esta importación ya se completó. Las contraseñas temporales no están disponibles."
            />
            {(statusSnapshot?.failed?.length ?? 0) > 0 && (
              <FailedRowsTable failed={statusSnapshot!.failed} />
            )}
            <Button type="button" variant="lime" className="w-full" onClick={finishAndClose}>
              Entendido
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FailedRowsTable({
  failed,
}: {
  failed: Array<{ rowIndex: number; email: string; reason: string }>;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        No se pudieron crear ({failed.length})
      </p>
      <div className="max-h-40 overflow-auto rounded-2xl border border-gray-200 dark:border-dark-border">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-red-50 dark:bg-red-900/10">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Fila
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Email
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Causa
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
            {failed.map((item, i) => (
              <tr key={`${item.rowIndex}-${i}`} className="bg-red-50/50 dark:bg-red-900/5">
                <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {item.rowIndex}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-gray-900 dark:text-white">
                  {item.email}
                </td>
                <td className="px-3 py-2 text-sm text-red-700 dark:text-red-400">{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
