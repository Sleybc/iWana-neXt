'use client';

import { useMemo, useState } from 'react';
import { DocumentTypeParty } from '@iwana/shared';
import { createDataSubjectRequestSchema } from '@iwana/shared';
import type { Contract } from '@/lib/api-client';
import { ApiError, privacyApi } from '@/lib/api-client';
import { Button } from '@iwana/ui';
import { PortalAlert, PortalSidePeek } from '@/components/shared/portal-ui';
import { EvidenceUploadField } from './EvidenceUploadField';
import {
  DATA_PURPOSE_LABELS,
  IDENTITY_METHOD_OPTIONS,
  PRIVACY_REQUEST_KINDS,
  PRIVACY_REQUEST_RIGHTS,
  REQUESTER_KIND_OPTIONS,
} from './privacy-labels';

interface RequesterDefaults {
  name?: string | null;
  documentType?: DocumentTypeParty | null;
  document?: string | null;
  contact?: string | null;
}

interface RequestFormProps {
  open: boolean;
  onClose: () => void;
  onCreated: (
    requestId: string,
    outcome: {
      submittedKind: 'CONSULTA' | 'RECLAMO' | 'SUPLANTACION';
      registeredKind: 'CONSULTA' | 'RECLAMO' | 'SUPLANTACION';
      suspendedContractCount: number;
    },
  ) => void;
  partyId?: string;
  requesterDefaults?: RequesterDefaults;
  contracts?: Contract[];
  allowImpersonation?: boolean;
}

const DOCUMENT_OPTIONS: ReadonlyArray<{ value: DocumentTypeParty; label: string }> = [
  { value: DocumentTypeParty.CC, label: 'Cédula de ciudadanía' },
  { value: DocumentTypeParty.CE, label: 'Cédula de extranjería' },
  { value: DocumentTypeParty.NIT, label: 'NIT' },
  { value: DocumentTypeParty.PASAPORTE, label: 'Pasaporte' },
  { value: DocumentTypeParty.TI, label: 'Tarjeta de identidad' },
  { value: DocumentTypeParty.RUT, label: 'RUT' },
  { value: DocumentTypeParty.OTHER, label: 'Otro documento' },
];

const PURPOSES = Object.entries(DATA_PURPOSE_LABELS).filter(
  ([purpose]) => purpose !== 'REPORTE_CENTRALES_RIESGO',
) as Array<[keyof typeof DATA_PURPOSE_LABELS, string]>;

const fieldClassName =
  'portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white';
const labelClassName = 'block space-y-1 text-sm font-medium text-gray-800 dark:text-gray-100';

function getContractLabel(contract: Contract, index: number): string {
  const planName = contract.planSnapshotJson['name'];
  const readableName =
    contract.alias.trim() ||
    (typeof planName === 'string' ? planName : '') ||
    `Servicio ${index + 1}`;
  const status =
    contract.status === 'ACTIVE'
      ? 'Activo'
      : contract.status === 'SUSPENDED'
        ? 'Suspendido'
        : contract.status === 'DRAFT'
          ? 'Borrador'
          : contract.status === 'TERMINATED'
            ? 'Terminado'
            : 'Archivado';
  return `${readableName} · ${status}`;
}

export function RequestForm({
  open,
  onClose,
  onCreated,
  partyId,
  requesterDefaults,
  contracts = [],
  allowImpersonation = false,
}: RequestFormProps) {
  const [kind, setKind] = useState<'CONSULTA' | 'RECLAMO' | 'SUPLANTACION'>('CONSULTA');
  const [right, setRight] = useState<(typeof PRIVACY_REQUEST_RIGHTS)[number]['value']>('CONOCER');
  const [purpose, setPurpose] =
    useState<keyof typeof DATA_PURPOSE_LABELS>('TRATAMIENTO_CONTRACTUAL');
  const [requesterKind, setRequesterKind] =
    useState<(typeof REQUESTER_KIND_OPTIONS)[number]['value']>('TITULAR');
  const [requesterName, setRequesterName] = useState(requesterDefaults?.name ?? '');
  const [documentType, setDocumentType] = useState<DocumentTypeParty>(
    requesterDefaults?.documentType ?? DocumentTypeParty.CC,
  );
  const [document, setDocument] = useState(requesterDefaults?.document ?? '');
  const [contact, setContact] = useState(requesterDefaults?.contact ?? '');
  const [method, setMethod] = useState('');
  const [evidenceMediaId, setEvidenceMediaId] = useState<string | null>(null);
  const [selectedContracts, setSelectedContracts] = useState<string[]>([]);
  const [contextConfirmed, setContextConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contractDowngrade, setContractDowngrade] = useState(false);

  const availableKinds = useMemo(
    () =>
      PRIVACY_REQUEST_KINDS.filter((item) => item.value !== 'SUPLANTACION' || allowImpersonation),
    [allowImpersonation],
  );
  const availableMethods = useMemo(() => {
    if (requesterKind === 'REPRESENTANTE' || requesterKind === 'APODERADO') {
      return IDENTITY_METHOD_OPTIONS.filter((item) => item.value === 'PODER_O_REPRESENTACION');
    }
    if (requesterKind === 'CAUSAHABIENTE') {
      return IDENTITY_METHOD_OPTIONS.filter((item) => item.value === 'DECLARACION_CAUSAHABIENTE');
    }
    return IDENTITY_METHOD_OPTIONS.filter(
      (item) => item.value === 'DOCUMENTO_PRESENCIAL' || item.value === 'COPIA_DOCUMENTO',
    );
  }, [requesterKind]);

  const toggleContract = (id: string) => {
    setSelectedContracts((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 20
          ? current
          : [...current, id],
    );
  };

  const resetAfterSuccess = () => {
    setKind('CONSULTA');
    setRight('CONOCER');
    setPurpose('TRATAMIENTO_CONTRACTUAL');
    setRequesterKind('TITULAR');
    setMethod('');
    setEvidenceMediaId(null);
    setSelectedContracts([]);
    setContextConfirmed(false);
    setError(null);
    setContractDowngrade(false);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setContractDowngrade(false);

    if (partyId && !contextConfirmed) {
      setError('Confirma que la solicitud corresponde a la persona de esta ficha.');
      return;
    }
    if (!requesterName.trim() || !document.trim() || !contact.trim()) {
      setError(
        'Completa el nombre, el documento y el medio de respuesta de la persona solicitante.',
      );
      return;
    }
    if (evidenceMediaId && !method) {
      setError('Selecciona el método de verificación para asociar la evidencia.');
      return;
    }
    if (method && method !== 'DOCUMENTO_PRESENCIAL' && !evidenceMediaId) {
      setError('Este método requiere adjuntar evidencia de identidad.');
      return;
    }

    const actualKind = kind === 'SUPLANTACION' && selectedContracts.length === 0 ? 'RECLAMO' : kind;
    if (actualKind !== kind) setContractDowngrade(true);
    if (
      actualKind === 'SUPLANTACION' &&
      (selectedContracts.length < 1 || selectedContracts.length > 20)
    ) {
      setError(
        'Selecciona de 1 a 20 contratos impugnados para registrar un reporte de suplantación.',
      );
      return;
    }

    const payload = {
      kind: actualKind,
      right,
      ...(right === 'REVOCAR' ? { purpose } : {}),
      requesterKind,
      requesterName: requesterName.trim(),
      requesterDocumentType: documentType,
      requesterDocument: document.trim(),
      requesterContact: contact.trim(),
      ...(evidenceMediaId ? { requesterEvidenceMediaId: evidenceMediaId } : {}),
      ...(method ? { identityVerificationMethod: method } : {}),
      ...(partyId ? { partyId } : {}),
      ...(actualKind === 'SUPLANTACION' ? { disputedContractIds: selectedContracts } : {}),
    };

    const parsed = createDataSubjectRequestSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos de la solicitud.');
      return;
    }

    setBusy(true);
    try {
      const result = await privacyApi.createRequest(parsed.data);
      resetAfterSuccess();
      onCreated(result.request.id, {
        submittedKind: kind,
        registeredKind: actualKind,
        suspendedContractCount: result.suspendedContractIds.length,
      });
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? 'No fue posible registrar la solicitud. Revisa los datos e inténtalo de nuevo.'
          : 'No fue posible registrar la solicitud. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalSidePeek
      open={open}
      onClose={onClose}
      title="Radicar solicitud"
      description="Registra lo recibido. La fecha límite comienza al radicar."
      eyebrow="Privacidad"
      className="md:max-w-[44rem]"
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="privacy-request-form" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar solicitud'}
          </Button>
        </div>
      }
    >
      <form
        id="privacy-request-form"
        className="space-y-6"
        onSubmit={(event) => void submit(event)}
      >
        <section className="space-y-4" aria-labelledby="privacy-request-heading">
          <h3
            id="privacy-request-heading"
            className="text-sm font-semibold text-iwana-primary dark:text-white"
          >
            Solicitud
          </h3>
          <label className={labelClassName}>
            Tipo de solicitud
            <select
              className={fieldClassName}
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
            >
              {availableKinds.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            Derecho de la persona
            <select
              className={fieldClassName}
              value={right}
              onChange={(event) => setRight(event.target.value as typeof right)}
            >
              {PRIVACY_REQUEST_RIGHTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {right === 'REVOCAR' ? (
            <label className={labelClassName}>
              Finalidad que desea retirar
              <select
                className={fieldClassName}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value as typeof purpose)}
              >
                {PURPOSES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        <section className="space-y-4" aria-labelledby="privacy-requester-heading">
          <h3
            id="privacy-requester-heading"
            className="text-sm font-semibold text-iwana-primary dark:text-white"
          >
            Persona solicitante
          </h3>
          {partyId ? (
            <label className="flex min-h-11 items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-dark-border">
              <input
                className="mt-1 h-4 w-4"
                type="checkbox"
                checked={contextConfirmed}
                onChange={(event) => setContextConfirmed(event.target.checked)}
              />
              <span>Confirmo que la solicitud corresponde a la persona de esta ficha.</span>
            </label>
          ) : null}
          <label className={labelClassName}>
            Relación de quien presenta la solicitud
            <select
              className={fieldClassName}
              value={requesterKind}
              onChange={(event) => {
                setRequesterKind(event.target.value as typeof requesterKind);
                setMethod('');
              }}
            >
              {REQUESTER_KIND_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClassName}>
            Nombre completo
            <input
              className={fieldClassName}
              autoComplete="name"
              value={requesterName}
              maxLength={220}
              onChange={(event) => setRequesterName(event.target.value)}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClassName}>
              Tipo de documento
              <select
                className={fieldClassName}
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value as DocumentTypeParty)}
              >
                {DOCUMENT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClassName}>
              Número de documento
              <input
                className={fieldClassName}
                autoComplete="off"
                value={document}
                maxLength={100}
                onChange={(event) => setDocument(event.target.value)}
              />
            </label>
          </div>
          <label className={labelClassName}>
            Correo o dirección para responder
            <input
              className={fieldClassName}
              autoComplete="email"
              value={contact}
              maxLength={220}
              onChange={(event) => setContact(event.target.value)}
            />
          </label>
        </section>

        <section className="space-y-4" aria-labelledby="privacy-verification-heading">
          <h3
            id="privacy-verification-heading"
            className="text-sm font-semibold text-iwana-primary dark:text-white"
          >
            Verificación de identidad
          </h3>
          <label className={labelClassName}>
            Método
            <select
              className={fieldClassName}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="">Verificar después</option>
              {availableMethods.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {kind === 'SUPLANTACION'
              ? 'El reporte de suplantación requiere verificar la identidad al radicar.'
              : 'La solicitud queda registrada y el plazo comienza aunque la verificación se haga después.'}
          </p>
          <EvidenceUploadField onUploaded={setEvidenceMediaId} />
        </section>

        {kind === 'SUPLANTACION' ? (
          <section className="space-y-3" aria-labelledby="privacy-disputed-contracts-heading">
            <div>
              <h3
                id="privacy-disputed-contracts-heading"
                className="text-sm font-semibold text-iwana-primary dark:text-white"
              >
                Contratos impugnados
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Selecciona de 1 a 20 contratos de esta persona.
              </p>
            </div>
            {contracts.length ? (
              <ul className="space-y-2">
                {contracts.map((contract, index) => (
                  <li key={contract.id}>
                    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-dark-border">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedContracts.includes(contract.id)}
                        disabled={
                          !selectedContracts.includes(contract.id) && selectedContracts.length >= 20
                        }
                        onChange={() => toggleContract(contract.id)}
                      />
                      <span>{getContractLabel(contract, index)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No hay contratos para elegir. La solicitud se registrará como reclamo.
              </p>
            )}
            <p aria-live="polite" className="text-sm text-gray-600 dark:text-gray-300">
              Seleccionados: {selectedContracts.length} de 20
            </p>
          </section>
        ) : null}

        {contractDowngrade ? (
          <PortalAlert
            variant="info"
            title="Se registrará como reclamo"
            description="Sin contratos impugnados, el sistema tramita el caso como reclamo."
          />
        ) : null}
        {error ? (
          <PortalAlert variant="error" title="Revisa la solicitud" description={error} />
        ) : null}
      </form>
    </PortalSidePeek>
  );
}
