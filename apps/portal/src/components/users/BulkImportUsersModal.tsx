'use client';

import { useCallback, useId, useRef, useState } from 'react';
import { Download, Upload, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parse } from 'csv-parse/browser/esm/sync';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@iwana/ui';
import { DocumentType, UserRole } from '@iwana/shared';
import {
  usersApi,
  type CreateInternalUserDto,
  type BulkCreateUsersApiResponse,
  ApiError,
} from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';

const MAX_FILE_SIZE_BYTES = 1_048_576; // 1MB
const MAX_USERS = 100;

const VALID_ROLES = Object.values(UserRole) as string[];

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
}

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

function validateRow(row: ParsedRow): ValidatedRow {
  const errors: string[] = [];

  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
    errors.push('Email inválido');
  }
  if (row.email.length > 255) {
    errors.push('Email demasiado largo (max 255)');
  }

  if (!row.role) {
    errors.push('Rol requerido');
  } else if (!VALID_ROLES.includes(row.role)) {
    errors.push(`Rol inválido: "${row.role}"`);
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

  return { ...row, isValid: errors.length === 0, errors };
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

type Step = 'upload' | 'preview' | 'processing' | 'result';

export function BulkImportUsersModal({ isOpen, onClose, onSuccess }: BulkImportUsersModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<ValidatedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateUsersApiResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);

  const resetState = useCallback(() => {
    setStep('upload');
    setRows([]);
    setFileError(null);
    setResult(null);
    setActionError(null);
    setDragOver(false);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

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
          rowIndex: i + 2, // +2 porque headers son fila 1, datos empiezan en fila 2
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

    setStep('processing');
    setActionError(null);

    try {
      const dtos = validRows.map(mapToDto);
      const response = await usersApi.bulkCreate(dtos);
      setResult(response);
      setStep('result');
      if (response.summary.succeeded > 0) {
        onSuccess();
      }
    } catch (error: unknown) {
      setStep('preview');
      if (error instanceof ApiError) {
        setActionError(error.message);
      } else {
        setActionError('No fue posible completar la importación. Intenta de nuevo.');
      }
    }
  };

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.length - validCount;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent aria-labelledby="bulk-import-title" className="max-w-2xl">
        <DialogHeader className="mb-4 flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 flex-1">
            <p className="portal-eyebrow">Gestión de accesos</p>
            <DialogTitle id="bulk-import-title">Importar usuarios desde CSV</DialogTitle>
            <DialogDescription>
              Carga un archivo CSV con los datos de los usuarios y revísalos antes de confirmar.
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="mt-1 shrink-0 rounded-xl p-2 text-gray-500 hover:bg-gray-100 transition-colors dark:hover:bg-dark-surface-3"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        {actionError && step !== 'result' && (
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
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 text-sm font-medium text-iwana-secondary-700 hover:text-iwana-secondary-800 transition-colors dark:text-iwana-secondary-400 dark:hover:text-iwana-secondary-300"
            >
              <Download className="h-4 w-4" />
              Descargar plantilla CSV
            </button>

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
              <Upload className="h-8 w-8 text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Arrastra tu archivo CSV aquí
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  o haz clic para seleccionarlo
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
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
                <span className="inline-flex items-center gap-2 rounded-xl bg-iwana-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-iwana-primary-600 cursor-pointer">
                  <Upload className="h-4 w-4" />
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
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {validCount} válidos
                </span>
                {invalidCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {invalidCount} con errores
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="text-sm font-medium text-iwana-secondary-700 hover:text-iwana-secondary-800 transition-colors dark:text-iwana-secondary-400"
              >
                Volver atrás
              </button>
            </div>

            <div className="max-h-80 overflow-auto rounded-2xl border border-gray-200 dark:border-dark-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-dark-surface-3">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Fila
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Rol
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {row.rowIndex}
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[180px] truncate">
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
                          {row.role || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[150px] truncate">
                        {[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Válido
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-medium"
                            title={row.errors.join(' · ')}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
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
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={validCount === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-iwana-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-iwana-primary-600 disabled:pointer-events-none disabled:opacity-50"
              >
                Importar {validCount} usuario{validCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-iwana-primary" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Importando {validCount} usuario{validCount !== 1 ? 's' : ''}...
            </p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  Importación completada
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {result.summary.succeeded} creado{result.summary.succeeded !== 1 ? 's' : ''}
                  {result.summary.failed > 0 &&
                    ` · ${result.summary.failed} fallido${result.summary.failed !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            {result.succeeded.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Usuarios creados ({result.succeeded.length})
                </p>
                <div className="max-h-40 overflow-auto rounded-2xl border border-gray-200 dark:border-dark-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-dark-surface-3">
                      <tr>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Nombre
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Contraseña temporal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                      {result.succeeded.map((item) => (
                        <tr key={item.email} className="bg-white dark:bg-dark-surface-2">
                          <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[180px] truncate">
                            {item.email}
                          </td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                            {[item.firstName, item.lastName].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {item.temporaryPassword ? (
                              <code className="break-all font-mono text-xs text-gray-900 dark:text-white select-all">
                                {item.temporaryPassword}
                              </code>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 text-xs">
                                Proporcionada por el usuario
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.failed.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Errores ({result.failed.length})
                </p>
                <div className="max-h-40 overflow-auto rounded-2xl border border-gray-200 dark:border-dark-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-red-50 dark:bg-red-900/10">
                      <tr>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Fila
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Causa
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
                      {result.failed.map((item, i) => (
                        <tr key={i} className="bg-red-50/50 dark:bg-red-900/5">
                          <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                            {item.rowIndex}
                          </td>
                          <td className="px-3 py-2 text-gray-900 dark:text-white max-w-[180px] truncate">
                            {item.email}
                          </td>
                          <td className="px-3 py-2 text-sm text-red-700 dark:text-red-400">
                            {item.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-2xl bg-iwana-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-iwana-primary-600"
            >
              Entendido
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
