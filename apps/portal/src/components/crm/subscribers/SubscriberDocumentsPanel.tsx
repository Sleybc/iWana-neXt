'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { FileText, Upload } from 'lucide-react';
import {
  AccessPermissionKey,
  type BillingAccountStatement,
  type BillingDocumentResponse,
  type SignedContractDocument,
  type SignedContractDownloadRestriction,
} from '@iwana/shared';
import { ApiError, crmApi, type Contract, type ExpedienteDocumentItem } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { downloadBillingDocumentPdf } from '@/components/billing/billing-document-pdf';
import { getSafeCrmErrorMessage } from '@/components/crm/expedientes/crm-error-message';
import {
  PortalAlert,
  PortalEmptyState,
  portalFieldClassName,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { RemoteCard, useCardLoad } from './SubscriberOverviewCards';
import { contractServiceName } from './subscriber-lifecycle-ui';
import { formatSubscriberDate } from './subscriber-ui';
import { STRATUM_EVIDENCE_FORMATS_LABEL, stratumEvidenceFileError } from './stratum-evidence';

/**
 * Documentos del suscriptor (spec §3 F): reúne en una lista los soportes del expediente
 * de origen, la evidencia de estrato de cada servicio y los PDF de cobro. Solo lista y
 * sube; las plantillas llegan con «Cierre de venta» (D4).
 */
export type SubscriberDocumentAction =
  | { kind: 'link'; href: string }
  | { kind: 'pdf'; document: Pick<BillingDocumentResponse, 'id' | 'number'> }
  | { kind: 'signed-contract'; contractId: string };

export interface SubscriberDocumentRow {
  key: string;
  type: string;
  date: string | null;
  author: string | null;
  version: string;
  /** No existe portal del titular: hoy ningún documento le es visible. */
  visibleToTitular: boolean;
  action?: SubscriberDocumentAction;
  /** Por qué la fila no se puede descargar (p. ej. contrato firmado sin permiso). */
  note?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identificador interno no es un autor legible: se muestra «Sin dato». */
function readableAuthor(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text && !UUID_PATTERN.test(text) ? text : null;
}

/** Solo rutas relativas del mismo origen o https; nunca `javascript:` ni `//host`. */
export function safeDocumentHref(value: string | null | undefined): string | null {
  if (!value) return null;
  // `//` y `/\` los navegadores los resuelven como URL de otro origen.
  if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')) return value;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function supportRows(items: ExpedienteDocumentItem[]): SubscriberDocumentRow[] {
  return items.flatMap((item) =>
    item.versions.map((version, index) => {
      const href = safeDocumentHref(version.downloadUrl);
      return {
        key: `soporte:${version.id}`,
        type: item.label,
        date: version.uploadedAt,
        author: readableAuthor(version.uploadedBy),
        version:
          index === 0
            ? `Versión ${item.versions.length} (vigente)`
            : `Versión ${item.versions.length - index}`,
        visibleToTitular: false,
        ...(href ? { action: { kind: 'link', href } as const } : {}),
      };
    }),
  );
}

export function stratumRows(contracts: Contract[], anonymized: boolean): SubscriberDocumentRow[] {
  return contracts
    .filter((contract) => Boolean(contract.stratumEvidenceMediaId))
    .map((contract) => ({
      key: `estrato:${contract.id}`,
      type: anonymized
        ? 'Soporte de estrato'
        : `Soporte de estrato · ${contractServiceName(contract)}`,
      date: null,
      author: null,
      version: 'Vigente',
      visibleToTitular: false,
    }));
}

export function billingRows(statement: BillingAccountStatement): SubscriberDocumentRow[] {
  return statement.documents
    .filter((document) => document.status === 'EMITIDO')
    .map((document) => ({
      key: `cobro:${document.id}`,
      type: `Documento de cobro ${document.number ?? ''}`.trim(),
      date: document.issueDate ?? document.createdAt,
      author: null,
      version: 'Emitido',
      visibleToTitular: false,
      action: { kind: 'pdf', document },
    }));
}

const SIGNED_CONTRACT_RESTRICTION_NOTES: Record<SignedContractDownloadRestriction, string> = {
  DOCUMENT_NUMBER_RESTRICTED:
    'Sin descarga: incluye el número de documento y no tienes permiso para verlo.',
  TITULAR_RESTRICTED: 'Sin descarga: los datos de este suscriptor están restringidos.',
};

/** Filas «Contrato firmado» (bloque G; CA-9): una por contrato, con la fecha de la firma. */
export function signedContractRows(
  items: SignedContractDocument[],
  contracts: Contract[],
  anonymized: boolean,
): SubscriberDocumentRow[] {
  return items.map((item) => {
    const contract = contracts.find((candidate) => candidate.id === item.contractId);
    return {
      key: `contrato-firmado:${item.contractId}`,
      type:
        contract && !anonymized
          ? `Contrato firmado · ${contractServiceName(contract)}`
          : 'Contrato firmado',
      date: item.signedAt,
      author: null,
      version: `Plantilla ${item.templateVersion}`,
      visibleToTitular: false,
      ...(item.downloadable
        ? { action: { kind: 'signed-contract', contractId: item.contractId } as const }
        : {
            note: item.restriction
              ? SIGNED_CONTRACT_RESTRICTION_NOTES[item.restriction]
              : 'Sin descarga disponible.',
          }),
    };
  });
}

/** Descarga el PDF del contrato firmado; la API verifica la huella antes de servirlo. */
async function downloadSignedContractPdf(contractId: string): Promise<void> {
  const blob = await crmApi.signedContractPdf(contractId);
  const url = URL.createObjectURL(blob);
  try {
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'contrato-firmado.pdf';
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function signedContractErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permiso para descargar el contrato firmado.';
  }
  if (error instanceof ApiError && error.status === 409) {
    return 'El contrato firmado no pasó la verificación de integridad o no está disponible. Contacta a soporte.';
  }
  return 'No pudimos descargar el contrato firmado. Intenta de nuevo.';
}

const EMPTY_VALUE = <span className="text-gray-500 dark:text-gray-400">Sin dato</span>;

interface SupportsSnapshot {
  items: ExpedienteDocumentItem[];
  forbidden: boolean;
}

interface SubscriberDocumentsPanelProps {
  /** Sin él no se consultan los contratos firmados (bloque G). */
  subscriberId?: string | null;
  expedienteId: string | null;
  contracts: Contract[];
  anonymized: boolean;
  restricted: boolean;
  /** Estado de cuenta ya cargado por la ficha; sin él no hay PDF de cobro que listar. */
  statement: BillingAccountStatement | null;
  /** Cambia cada vez que «Registrar ▾ → Documento» pide llevar el foco aquí. */
  focusRequest?: number;
}

export function SubscriberDocumentsPanel({
  subscriberId = null,
  expedienteId,
  contracts,
  anonymized,
  restricted,
  statement,
  focusRequest = 0,
}: SubscriberDocumentsPanelProps) {
  const { hasPermission } = usePermissions();
  const canReadSupports = hasPermission(AccessPermissionKey.CRM_EXPEDIENTES_READ);
  const canUpload =
    hasPermission(AccessPermissionKey.CRM_EXPEDIENTES_MANAGE) && !anonymized && !restricted;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [signed, setSigned] = useState<{
    items: SignedContractDocument[];
    error: boolean;
  }>({ items: [], error: false });

  // Carga aparte de los soportes: si falla, el resto de documentos se sigue mostrando.
  useEffect(() => {
    if (!subscriberId) return;
    let active = true;
    crmApi.getSignedContracts(subscriberId).then(
      (response) => {
        if (active) setSigned({ items: response.data.items, error: false });
      },
      () => {
        if (active) setSigned({ items: [], error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [subscriberId]);

  const loadSupports = useCallback(async (): Promise<SupportsSnapshot> => {
    if (!expedienteId || !canReadSupports) return { items: [], forbidden: false };
    try {
      const response = await crmApi.getDocumentSupports(expedienteId);
      return { items: response.data.items, forbidden: false };
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) return { items: [], forbidden: true };
      throw error;
    }
  }, [expedienteId, canReadSupports]);
  const load = useCardLoad(loadSupports, true);

  useEffect(() => {
    if (focusRequest > 0) {
      titleRef.current?.focus();
      titleRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [focusRequest]);

  const supportItems = load.data?.items ?? [];
  const uploadAvailable = canUpload && Boolean(expedienteId) && supportItems.length > 0;

  async function downloadSigned(contractId: string) {
    if (downloading) return;
    setPdfError(null);
    setDownloading(contractId);
    try {
      await downloadSignedContractPdf(contractId);
    } catch (error) {
      setPdfError(signedContractErrorMessage(error));
    } finally {
      setDownloading(null);
    }
  }

  async function download(document: Pick<BillingDocumentResponse, 'id' | 'number'>) {
    if (downloading) return;
    setPdfError(null);
    setDownloading(document.id);
    try {
      await downloadBillingDocumentPdf(document);
    } catch {
      setPdfError('No pudimos descargar el PDF. Intenta de nuevo.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <RemoteCard
        title="Documentos"
        titleRef={titleRef}
        load={load}
        errorTitle="No pudimos cargar los documentos"
        errorDescription="Reintenta en unos minutos."
        actions={
          uploadAvailable ? (
            <button
              type="button"
              className={`${portalPanelDenseActionClassName} gap-1`}
              onClick={() => setUploadOpen(true)}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Subir
            </button>
          ) : undefined
        }
      >
        {(snapshot) => {
          const rows = [
            ...supportRows(snapshot.items),
            ...signedContractRows(signed.items, contracts, anonymized),
            ...stratumRows(contracts, anonymized),
            ...(statement && !anonymized ? billingRows(statement) : []),
          ];
          return (
            <div className="space-y-3">
              {snapshot.forbidden ? (
                <PortalAlert
                  variant="warning"
                  title="No tienes acceso a los soportes de la oportunidad de origen"
                  description="Se muestran solo los demás documentos del suscriptor."
                />
              ) : null}
              {signed.error ? (
                <PortalAlert
                  variant="warning"
                  title="No pudimos cargar los contratos firmados"
                  description="Se muestran los demás documentos del suscriptor."
                />
              ) : null}
              {pdfError ? <PortalAlert variant="error" title={pdfError} /> : null}
              {rows.length === 0 ? (
                <PortalEmptyState
                  embedded
                  icon={FileText}
                  title="Aún no hay documentos"
                  description="Aquí aparecen los soportes de la venta, el soporte de estrato y los documentos de cobro emitidos."
                />
              ) : (
                <ul
                  aria-label="Documentos del suscriptor"
                  className="divide-y divide-gray-100 dark:divide-dark-border"
                >
                  {rows.map((row) => (
                    <li
                      key={row.key}
                      className="flex flex-wrap items-start justify-between gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-gray-900 dark:text-white">
                          {row.type}
                        </p>
                        <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500 dark:text-gray-400">
                          <div className="flex gap-1">
                            <dt>Fecha:</dt>
                            <dd className="text-gray-900 dark:text-white">
                              {row.date ? formatSubscriberDate(row.date) : EMPTY_VALUE}
                            </dd>
                          </div>
                          <div className="flex gap-1">
                            <dt>Autor:</dt>
                            <dd className="text-gray-900 dark:text-white">
                              {row.author ?? EMPTY_VALUE}
                            </dd>
                          </div>
                          <div className="flex gap-1">
                            <dt>Versión:</dt>
                            <dd className="text-gray-900 dark:text-white">{row.version}</dd>
                          </div>
                          <div className="flex gap-1">
                            <dt>Visible para el titular:</dt>
                            <dd className="text-gray-900 dark:text-white">
                              {row.visibleToTitular ? 'Sí' : 'No'}
                            </dd>
                          </div>
                        </dl>
                        {row.note ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            {row.note}
                          </p>
                        ) : null}
                      </div>
                      {row.action?.kind === 'link' ? (
                        <a
                          href={row.action.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={portalPanelDenseActionClassName}
                          aria-label={`Abrir ${row.type}`}
                        >
                          Abrir
                        </a>
                      ) : row.action?.kind === 'pdf' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          aria-label={`Descargar PDF de ${row.type}`}
                          disabled={downloading !== null}
                          loading={downloading === row.action.document.id}
                          onClick={() => {
                            if (row.action?.kind === 'pdf') void download(row.action.document);
                          }}
                        >
                          Descargar PDF
                        </Button>
                      ) : row.action?.kind === 'signed-contract' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          aria-label={`Descargar PDF de ${row.type}`}
                          disabled={downloading !== null}
                          loading={downloading === row.action.contractId}
                          onClick={() => {
                            if (row.action?.kind === 'signed-contract') {
                              void downloadSigned(row.action.contractId);
                            }
                          }}
                        >
                          Descargar PDF
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }}
      </RemoteCard>
      {uploadAvailable && expedienteId ? (
        <UploadDocumentDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          expedienteId={expedienteId}
          items={supportItems}
          onUploaded={() => {
            setUploadOpen(false);
            load.reload();
          }}
        />
      ) : null}
    </>
  );
}

function UploadDocumentDialog({
  open,
  onOpenChange,
  expedienteId,
  items,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expedienteId: string;
  items: ExpedienteDocumentItem[];
  onUploaded: () => void;
}) {
  const typeId = useId();
  const fileId = useId();
  const fileHelpId = `${fileId}-ayuda`;
  const [documentKey, setDocumentKey] = useState(items[0]?.key ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDocumentKey(items[0]?.key ?? '');
      setFile(null);
      setError(null);
    }
  }, [open, items]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !documentKey || saving) return;
    const localError = stratumEvidenceFileError(file);
    if (localError) {
      setError(localError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await crmApi.uploadDocumentSupport(expedienteId, documentKey, file);
      onUploaded();
    } catch (uploadError) {
      setError(
        getSafeCrmErrorMessage(uploadError, 'No pudimos subir el documento. Intenta de nuevo.'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>
            Se guarda como una nueva versión en los soportes de la oportunidad de origen.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor={typeId} className="text-sm font-medium text-gray-900 dark:text-white">
              Tipo de documento
            </label>
            <select
              id={typeId}
              value={documentKey}
              disabled={saving}
              className={portalFieldClassName}
              onChange={(event) => setDocumentKey(event.target.value)}
            >
              {items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={fileId} className="text-sm font-medium text-gray-900 dark:text-white">
              Archivo
            </label>
            <input
              id={fileId}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              disabled={saving}
              aria-describedby={fileHelpId}
              className="block w-full text-sm text-gray-900 dark:text-white"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p id={fileHelpId} className="text-sm text-gray-500 dark:text-gray-400">
              {STRATUM_EVIDENCE_FORMATS_LABEL}.
            </p>
          </div>
          {error ? <PortalAlert variant="error" live="assertive" title={error} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11" loading={saving} disabled={!file}>
              Subir
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
