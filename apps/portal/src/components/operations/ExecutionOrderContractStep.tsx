'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  CONTRACT_SIGNATURE_IMAGE_MAX_BASE64_CHARS,
  ContractSignerSchema,
  DocumentType,
  type ContractDocumentGeneration,
  type ContractSigner,
} from '@iwana/shared';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import { ApiError, contractSigningApi } from '@/lib/api-client';
import { BillingCycleMissingNotice } from '@/components/crm/subscribers/contract-auto-creation-ui';
import { ensureIdempotencyKey } from '@/lib/idempotency-key';
import { ExecutionOrderSignatureCapture } from './ExecutionOrderSignatureCapture';
import {
  CONTRACT_GENERATION_POLL_LIMIT_MS,
  CONTRACT_SIGNER_DOCUMENT_OPTIONS,
  CONTRACT_STEP_COPY as COPY,
  contractGenerationFailureCopy,
  contractGenerationPollDelay,
  contractSignatureAttemptFingerprint,
  contractStepError,
  fileToDataUrl,
  readApproximateLocation,
  readSigningDevice,
  signerDocumentTypeFrom,
  type ContractStepError,
  type ExecutionOrderContractContext,
} from './execution-order-contract-signing';

// Paso «Contrato» de la consola de OT (cierre de venta, bloque C; CA-1, CA-12; ADR-109).
//
// Flujo: generar → «Generando contrato…» (sondeo con espera progresiva) → leer el PDF con
// el cliente → confirmar quién firma → firmar con el lienzo existente → «Contrato firmado».
// El acta de conformidad y el cierre de la OT no cambian (ADR-088 D3): este paso es aparte.
// El PDF se muestra desde un objeto en memoria, sin enlace de descarga, y se libera al
// firmar o al salir; después de firmar el API niega la lectura (CA-12).

type Phase =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'generating'; slow: boolean }
  | { kind: 'failed'; generation: ContractDocumentGeneration }
  | { kind: 'ready'; generation: ContractDocumentGeneration }
  | { kind: 'signed' }
  /** El contrato ya no está pendiente (firmado en otra sesión o activado): sin documento. */
  | { kind: 'closed'; message: string };

export interface ExecutionOrderContractStepProps {
  executionOrderId: string;
  contract: ExecutionOrderContractContext;
  /** Motivo visible si el paso no se puede operar; null cuando está habilitado. */
  disabledReason: string | null;
  /** El contrato se firmó en esta visita (lo conserva el contenedor). */
  signed: boolean;
  onSigned: (contractId: string) => void;
}

interface SignerDraft {
  fullName: string;
  documentType: ContractSigner['documentType'] | '';
  documentNumber: string;
}

type SignerErrors = Partial<Record<keyof SignerDraft, string>>;

function validateSigner(
  draft: SignerDraft,
): { ok: true; signer: ContractSigner } | { ok: false; errors: SignerErrors } {
  const parsed = ContractSignerSchema.safeParse(draft);
  if (parsed.success) return { ok: true, signer: parsed.data };
  const errors: SignerErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'fullName') errors.fullName = 'Escribe el nombre completo (mínimo 3 letras).';
    if (field === 'documentType') errors.documentType = 'Elige el tipo de documento.';
    if (field === 'documentNumber') {
      errors.documentNumber = 'Escribe de 3 a 20 letras o números, sin puntos ni espacios.';
    }
  }
  return { ok: false, errors };
}

export function ExecutionOrderContractStep({
  executionOrderId,
  contract,
  disabledReason,
  signed,
  onSigned,
}: ExecutionOrderContractStepProps) {
  const baseId = useId();
  const headingId = `${baseId}-titulo`;
  const statusId = `${baseId}-estado`;
  const { contractId } = contract;
  const [phase, setPhase] = useState<Phase>(signed ? { kind: 'signed' } : { kind: 'loading' });
  const [error, setError] = useState<ContractStepError | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const [signer, setSigner] = useState<SignerDraft>({
    fullName: contract.holderName,
    documentType: signerDocumentTypeFrom(contract.holderDocument?.type) ?? DocumentType.CC,
    documentNumber: contract.holderDocument?.number ?? '',
  });
  const [signerErrors, setSignerErrors] = useState<SignerErrors>({});
  const [signing, setSigning] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // Sin ciclo la firma responde 409 BILLING_CYCLE_REQUIRED (fase 2, CA-2): se bloquea con motivo.
  const [cycleMissing, setCycleMissing] = useState(contract.billingCycleMissing === true);
  const mounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const attemptFingerprint = useRef<string | null>(null);
  const signedHeadingRef = useRef<HTMLHeadingElement>(null);
  const documentHeadingRef = useRef<HTMLHeadingElement>(null);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const focusOutcome = useRef(false);
  const readyGeneration = phase.kind === 'ready' ? phase.generation : null;
  const enabled = disabledReason === null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (signed) setPhase({ kind: 'signed' });
  }, [signed]);

  const stopPolling = () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  };

  const applyGeneration = useCallback((generation: ContractDocumentGeneration | null) => {
    if (!generation) {
      setPhase({ kind: 'idle' });
      return false;
    }
    if (generation.status === 'READY') {
      setPhase({ kind: 'ready', generation });
      setAnnouncement(COPY.ready);
      return false;
    }
    if (generation.status === 'FAILED') {
      // La alerta del fallo se anuncia sola; el estado no la repite.
      setPhase({ kind: 'failed', generation });
      setAnnouncement('');
      return false;
    }
    setPhase({ kind: 'generating', slow: false });
    return true;
  }, []);

  const handleError = useCallback((caught: unknown) => {
    const mapped = contractStepError(caught);
    if (mapped.kind === 'not-draft') {
      setPhase({ kind: 'closed', message: mapped.message });
      setError(null);
      setAnnouncement(mapped.message);
      return;
    }
    setError(mapped);
    setAnnouncement('');
  }, []);

  const poll = useCallback(
    (attempt: number, startedAt: number) => {
      stopPolling();
      if (Date.now() - startedAt >= CONTRACT_GENERATION_POLL_LIMIT_MS) {
        setPhase({ kind: 'generating', slow: true });
        setAnnouncement(COPY.slowGeneration);
        return;
      }
      pollTimer.current = setTimeout(() => {
        void (async () => {
          try {
            const latest = await contractSigningApi.getLatestGeneration(
              contractId,
              executionOrderId,
            );
            if (!mounted.current) return;
            if (applyGeneration(latest)) poll(attempt + 1, startedAt);
          } catch (caught) {
            if (!mounted.current) return;
            setPhase({ kind: 'generating', slow: true });
            handleError(caught);
          }
        })();
      }, contractGenerationPollDelay(attempt));
    },
    [applyGeneration, contractId, executionOrderId, handleError],
  );

  // Retoma el estado de la última generación al abrir la OT (p. ej., tras recargar).
  useEffect(() => {
    if (signed || !enabled) return;
    let cancelled = false;
    setPhase({ kind: 'loading' });
    void (async () => {
      try {
        const latest = await contractSigningApi.getLatestGeneration(contractId, executionOrderId);
        if (cancelled || !mounted.current) return;
        if (applyGeneration(latest)) {
          setAnnouncement(COPY.generating);
          poll(0, Date.now());
        }
      } catch (caught) {
        if (cancelled || !mounted.current) return;
        setPhase({ kind: 'idle' });
        handleError(caught);
      }
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [applyGeneration, contractId, enabled, executionOrderId, handleError, poll, signed]);

  // Carga el PDF sin firmar en memoria mientras la generación esté lista y sin firmar.
  useEffect(() => {
    if (!readyGeneration || signed) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setDocumentError(null);
    void (async () => {
      try {
        const blob = await contractSigningApi.getDocument(
          contractId,
          readyGeneration.generationId,
          executionOrderId,
        );
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setDocumentUrl(objectUrl);
      } catch (caught) {
        if (cancelled) return;
        const mapped = contractStepError(caught);
        if (mapped.kind === 'not-draft') {
          handleError(caught);
          return;
        }
        if (mapped.kind === 'regenerate') {
          setPhase({ kind: 'idle' });
          setError(mapped);
          return;
        }
        setDocumentError(COPY.documentLoadError);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setDocumentUrl(null);
    };
  }, [contractId, documentAttempt, executionOrderId, handleError, readyGeneration, signed]);

  useEffect(() => {
    if (documentUrl) documentHeadingRef.current?.focus();
  }, [documentUrl]);

  // El foco va al resultado solo cuando lo produjo una acción de esta sesión.
  useEffect(() => {
    if ((phase.kind === 'signed' || phase.kind === 'closed') && focusOutcome.current) {
      focusOutcome.current = false;
      signedHeadingRef.current?.focus();
    }
  }, [phase.kind]);

  async function generate() {
    stopPolling();
    setError(null);
    setPhase({ kind: 'requesting' });
    setAnnouncement(COPY.generating);
    idempotencyKey.current = null;
    attemptFingerprint.current = null;
    try {
      const generation = await contractSigningApi.requestGeneration(contractId, executionOrderId);
      if (!mounted.current) return;
      if (applyGeneration(generation)) poll(0, Date.now());
    } catch (caught) {
      if (!mounted.current) return;
      setPhase({ kind: 'idle' });
      handleError(caught);
      generateButtonRef.current?.focus();
    }
  }

  function checkAgain() {
    setError(null);
    setPhase({ kind: 'generating', slow: false });
    setAnnouncement(COPY.generating);
    poll(0, Date.now());
  }

  async function sign(file: File): Promise<boolean> {
    if (!readyGeneration || readyGeneration.documentSha256 === null) return false;
    const validation = validateSigner(signer);
    if (!validation.ok) {
      setSignerErrors(validation.errors);
      setError({ kind: 'final', message: 'Revisa los datos de quien firma.' });
      setAnnouncement('');
      return false;
    }
    setSignerErrors({});
    setError(null);
    setSigning(true);
    setAnnouncement(COPY.signing);
    try {
      const signatureImage = await fileToDataUrl(file);
      if (signatureImage.length > CONTRACT_SIGNATURE_IMAGE_MAX_BASE64_CHARS) {
        setError({
          kind: 'final',
          message: 'La firma es demasiado grande. Límpiala y firma de nuevo.',
        });
        return false;
      }
      const fingerprint = contractSignatureAttemptFingerprint(
        readyGeneration.generationId,
        validation.signer,
        signatureImage,
      );
      // Misma clave mientras el intento no cambie: un reintento tras 503 no firma dos veces.
      if (attemptFingerprint.current !== fingerprint) {
        attemptFingerprint.current = fingerprint;
        idempotencyKey.current = null;
      }
      const location = await readApproximateLocation();
      await contractSigningApi.sign(contractId, {
        idempotencyKey: ensureIdempotencyKey(idempotencyKey),
        generationId: readyGeneration.generationId,
        documentSha256: readyGeneration.documentSha256,
        executionOrderId,
        signatureImage,
        signer: validation.signer,
        location,
        device: readSigningDevice(),
      });
      if (!mounted.current) return true;
      focusOutcome.current = true;
      setPhase({ kind: 'signed' });
      setAnnouncement(COPY.signed);
      onSigned(contractId);
      return true;
    } catch (caught) {
      if (!mounted.current) return false;
      const mapped = contractStepError(caught);
      if (mapped.kind === 'regenerate') {
        setPhase({ kind: 'idle' });
      }
      if (mapped.kind === 'not-draft') focusOutcome.current = true;
      if (
        mapped.kind !== 'retry' ||
        (caught as { code?: string })?.code === 'IDEMPOTENCY_KEY_REUSED'
      ) {
        idempotencyKey.current = null;
        attemptFingerprint.current = null;
      }
      if (caught instanceof ApiError && caught.code === 'BILLING_CYCLE_REQUIRED') {
        // El aviso «Falta ciclo de facturación» explica el bloqueo; no se duplica como error.
        setCycleMissing(true);
        setAnnouncement('');
        return false;
      }
      handleError(caught);
      return false;
    } finally {
      if (mounted.current) setSigning(false);
    }
  }

  const isSigned = phase.kind === 'signed';
  const outcome =
    phase.kind === 'signed'
      ? { title: COPY.signed, description: COPY.signedDescription }
      : phase.kind === 'closed'
        ? { title: phase.message, description: COPY.closedDescription }
        : null;
  const badge = isSigned
    ? { variant: 'lime' as const, label: COPY.signedBadge }
    : phase.kind === 'closed'
      ? { variant: 'neutral' as const, label: COPY.closedBadge }
      : enabled
        ? { variant: 'warning' as const, label: COPY.pendingBadge }
        : { variant: 'neutral' as const, label: COPY.unavailableBadge };
  const failure = phase.kind === 'failed' ? contractGenerationFailureCopy(phase.generation) : null;

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={phase.kind === 'loading' || phase.kind === 'requesting' || signing}
      className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-dark-border"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-iwana-primary dark:text-white">
          {COPY.title}
        </h3>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {outcome ? (
        <div className="space-y-1">
          <h4
            ref={signedHeadingRef}
            tabIndex={-1}
            className="text-sm font-medium text-gray-900 outline-none dark:text-white"
          >
            {outcome.title}
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300">{outcome.description}</p>
        </div>
      ) : !enabled ? (
        <p className="text-sm text-gray-600 dark:text-gray-300">{disabledReason}</p>
      ) : (
        <div className="space-y-3">
          {cycleMissing ? <BillingCycleMissingNotice announce /> : null}
          {error ? (
            <PortalAlert
              variant="error"
              title={error.message}
              live="assertive"
              action={
                error.kind === 'retry' && phase.kind === 'idle' ? (
                  <Button type="button" className="min-h-11" onClick={() => void generate()}>
                    Reintentar
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {phase.kind === 'loading' ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">Consultando el contrato…</p>
          ) : null}

          {phase.kind === 'idle' ? (
            <Button
              ref={generateButtonRef}
              type="button"
              className="min-h-11"
              onClick={() => void generate()}
            >
              {COPY.generate}
            </Button>
          ) : null}

          {phase.kind === 'requesting' || phase.kind === 'generating' ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-200">{COPY.generating}</p>
              {phase.kind === 'generating' && phase.slow ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 dark:text-gray-300">{COPY.slowGeneration}</p>
                  <Button type="button" variant="ghost" className="min-h-11" onClick={checkAgain}>
                    {COPY.checkAgain}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {failure ? (
            <PortalAlert
              variant="error"
              title={failure.title}
              description={
                <div className="space-y-2">
                  {failure.missingFields.length > 0 ? (
                    <ul aria-label="Datos de la empresa que faltan" className="list-disc pl-5">
                      {failure.missingFields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p>{failure.description}</p>
                </div>
              }
              action={
                <Button type="button" className="min-h-11" onClick={() => void generate()}>
                  {COPY.retryGeneration}
                </Button>
              }
            />
          ) : null}

          {readyGeneration ? (
            <div className="space-y-4">
              <h4
                ref={documentHeadingRef}
                tabIndex={-1}
                className="text-sm font-medium text-gray-900 outline-none dark:text-white"
              >
                {COPY.documentTitle}
              </h4>
              <PortalAlert variant="info" title={COPY.readingNotice} live="off" />
              {documentError ? (
                <PortalAlert
                  variant="error"
                  title={documentError}
                  action={
                    <Button
                      type="button"
                      className="min-h-11"
                      onClick={() => setDocumentAttempt((value) => value + 1)}
                    >
                      Reintentar
                    </Button>
                  }
                />
              ) : documentUrl ? (
                <iframe
                  title={COPY.documentTitle}
                  src={`${documentUrl}#toolbar=0&navpanes=0`}
                  className="h-[70vh] min-h-96 w-full rounded-lg border border-gray-200 bg-white dark:border-dark-border"
                />
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">Cargando el contrato…</p>
              )}

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-gray-900 dark:text-white">
                  {COPY.signerLegend}
                </legend>
                <p className="text-xs text-gray-500 dark:text-gray-400">{COPY.signerHint}</p>
                <Input
                  id={`${baseId}-nombre`}
                  label={COPY.signerName}
                  autoComplete="off"
                  value={signer.fullName}
                  error={signerErrors.fullName}
                  disabled={signing}
                  required
                  onChange={(event) =>
                    setSigner((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    id={`${baseId}-tipo-documento`}
                    label={COPY.signerDocumentType}
                    value={signer.documentType}
                    options={CONTRACT_SIGNER_DOCUMENT_OPTIONS}
                    {...(signerErrors.documentType ? { error: signerErrors.documentType } : {})}
                    disabled={signing}
                    onChange={(event) =>
                      setSigner((current) => ({
                        ...current,
                        documentType: event.target.value as SignerDraft['documentType'],
                      }))
                    }
                  />
                  <Input
                    id={`${baseId}-numero-documento`}
                    label={COPY.signerDocumentNumber}
                    autoComplete="off"
                    inputMode="text"
                    value={signer.documentNumber}
                    error={signerErrors.documentNumber}
                    disabled={signing}
                    required
                    onChange={(event) =>
                      setSigner((current) => ({ ...current, documentNumber: event.target.value }))
                    }
                  />
                </div>
              </fieldset>

              <p className="text-xs text-gray-500 dark:text-gray-400">{COPY.locationNotice}</p>
              <ExecutionOrderSignatureCapture
                label="Captura de firma del contrato"
                instructions={COPY.signatureInstructions}
                saveLabel={COPY.sign}
                disabled={signing || documentUrl === null || cycleMissing}
                onSave={sign}
              />
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
