// Cierre de venta fase 2 (spec 2026-11-11 B, D-F2, CA-2, CA-3): textos y avisos del contrato
// automático. Fuente única para la ficha, la tarjeta de servicio, el detalle y el paso «Contrato».
import Link from 'next/link';
import type { ContractAutoCreationIssue, ContractAutoCreationMissingField } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import { FISCAL_MISSING_FIELD_LABELS } from './subscriber-fiscal';

export const CONTRACT_AUTO_CREATION_FIELD_LABELS: Record<ContractAutoCreationMissingField, string> =
  {
    PLAN: 'Plan de la oportunidad',
    INSTALLATION_ADDRESS: 'Dirección del punto de servicio',
    SERVICE_USAGE: 'Uso del servicio (tipo de persona, segmento y estrato)',
    CONTRACTUAL_AUTHORIZATION: 'Autorización de tratamiento contractual',
    ...FISCAL_MISSING_FIELD_LABELS,
  };

/** IVA y RUT se completan en Tributario; el resto, en Datos. */
export function contractAutoCreationCompletionTab(
  missing: readonly ContractAutoCreationMissingField[],
): 'tributario' | 'datos' {
  return missing.some((field) => field === 'VAT_RESPONSIBILITY' || field === 'RUT_RESPONSIBILITIES')
    ? 'tributario'
    : 'datos';
}

export const BILLING_CYCLE_MISSING_COPY = {
  title: 'Falta ciclo de facturación',
  reason: 'Asigna el ciclo de facturación del contrato antes de firmarlo.',
} as const;

interface ContractAutoCreationIssueNoticeProps {
  issue: ContractAutoCreationIssue;
  onCompleteData: () => void;
  /** Destino del alta manual; null si el usuario no puede crear contratos. */
  createContractHref: string | null;
}

/** Aviso «No se pudo crear el contrato automáticamente» con lo que falta (CA-3). */
export function ContractAutoCreationIssueNotice({
  issue,
  onCompleteData,
  createContractHref,
}: ContractAutoCreationIssueNoticeProps) {
  return (
    <PortalAlert
      variant="warning"
      title="No se pudo crear el contrato automáticamente"
      description={
        <div className="space-y-1">
          <p>Completa estos datos o crea el contrato a mano:</p>
          <ul aria-label="Datos que faltan para el contrato" className="list-disc pl-5">
            {issue.missing.map((field) => (
              <li key={field}>{CONTRACT_AUTO_CREATION_FIELD_LABELS[field]}</li>
            ))}
          </ul>
        </div>
      }
      action={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="min-h-11" onClick={onCompleteData}>
            Completar datos
          </Button>
          {createContractHref ? (
            <Button asChild className="min-h-11">
              <Link href={createContractHref}>Crear contrato</Link>
            </Button>
          ) : null}
        </div>
      }
    />
  );
}

/** Aviso «Falta ciclo de facturación» con su motivo (CA-2). */
export function BillingCycleMissingNotice({
  className,
  announce = false,
}: {
  className?: string;
  /** true donde el aviso aparece tras una acción (409 de la firma) y debe anunciarse. */
  announce?: boolean;
}) {
  return (
    <PortalAlert
      variant="warning"
      density="compact"
      live={announce ? 'polite' : 'off'}
      title={BILLING_CYCLE_MISSING_COPY.title}
      description={BILLING_CYCLE_MISSING_COPY.reason}
      {...(className ? { className } : {})}
    />
  );
}
