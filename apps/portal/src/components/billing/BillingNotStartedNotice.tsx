'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AccessPermissionKey,
  GenerateFirstChargeCommandSchema,
  type BillingAccountStatement,
  type BillingFirstChargeResult,
} from '@iwana/shared';
import { Button } from '@iwana/ui';
import { usePermissions } from '@/components/access-control/permissions-context';
import { PortalAlert } from '@/components/shared/portal-ui';
import { formatBillingDate } from '@/components/crm/subscribers/billing-cycle-ui';
import { billingApi } from '@/lib/api-client';
import { BillingConfirmation } from './BillingConfirmation';
import { formatBillingMoney, moneyCents } from './billing-copy';

export const BILLING_NOT_STARTED_TITLE = 'Contrato activo sin cobros emitidos';
export const BILLING_NOT_STARTED_NOTICE = 'El saldo en cero no significa que esté al día.';
export const BILLING_NOT_STARTED_ASK = 'Pide a facturación que genere el primer cobro.';
export const FIRST_CHARGE_ACTION = 'Generar primer cobro';

type ContractLabel = { id: string; alias: string };
type ResultMessage = { variant: 'success' | 'warning'; title: string; description: string };

/** Mensaje del resultado del primer cobro, sin códigos internos (spec 2026-11-11 R3, R4). */
export function firstChargeResultMessage(result: BillingFirstChargeResult): ResultMessage {
  const { summary, anchorDate, installationFee, fiscalData, regularizedDrafts } = result;
  const stillBlocked = Math.max(summary.blocked - regularizedDrafts.unblocked, 0);
  const incomplete = stillBlocked + summary.failed > 0;
  const title =
    summary.generated > 1
      ? `Se generaron ${summary.generated} documentos de cobro`
      : summary.generated === 1
        ? 'Se generó el primer cobro'
        : regularizedDrafts.unblocked > 0
          ? 'Se regularizaron los cobros en borrador'
          : summary.existing > 0
            ? 'El contrato ya tenía cobros generados'
            : 'No se generaron documentos de cobro';
  const parts: string[] = [];
  if (anchorDate) parts.push(`Se cobra desde el ${formatBillingDate(anchorDate)}.`);
  const amount = installationFee.amount;
  if (installationFee.outcome === 'FROZEN' && amount !== null) {
    parts.push(`Se fijó el cargo de instalación en ${formatBillingMoney(amount)}.`);
  } else if (installationFee.outcome === 'ALREADY_SET') {
    parts.push(
      amount !== null && moneyCents(amount) > 0
        ? `El cargo de instalación ya estaba fijado en ${formatBillingMoney(amount)}.`
        : 'El contrato no tiene cargo de instalación.',
    );
  } else if (installationFee.outcome === 'UNRESOLVED') {
    parts.push(
      'El plan no tiene un cargo de instalación vigente para este servicio, así que no se incluyó.',
    );
  }
  if (fiscalData.outcome === 'FROZEN') {
    parts.push('Se tomaron de la ficha los datos fiscales que le faltaban al contrato.');
  } else if (fiscalData.outcome === 'UNRESOLVED') {
    parts.push('Faltan datos fiscales del titular: complétalos en la ficha.');
  }
  if (regularizedDrafts.unblocked > 0) {
    parts.push(
      regularizedDrafts.unblocked === 1
        ? 'Un borrador quedó listo para emitir.'
        : `${regularizedDrafts.unblocked} borradores quedaron listos para emitir.`,
    );
  }
  if (regularizedDrafts.rescheduled > 0) {
    parts.push('Los periodos cobrados tarde vencen ahora según el plazo de pago desde hoy.');
  }
  if (incomplete) {
    parts.push('Algunos documentos tienen datos incompletos o errores: revísalos en Facturación.');
  }
  return {
    variant:
      (summary.generated > 0 || regularizedDrafts.unblocked > 0) && !incomplete
        ? 'success'
        : 'warning',
    title,
    description: parts.join(' '),
  };
}

/**
 * Aviso «Contrato activo sin cobros emitidos» por contrato afectado y acción «Generar primer
 * cobro» (spec 2026-11-11 R2, R3, CA-1, CA-4). La usan el Estado de cuenta de la Vista general y
 * la pestaña Facturación; debe permanecer montada mientras el estado de cuenta recarga para que
 * el resultado siga visible.
 */
export function BillingNotStartedNotice({
  statement,
  contracts = [],
  onGenerated,
}: {
  statement: BillingAccountStatement | null;
  contracts?: readonly ContractLabel[];
  onGenerated: () => void;
}) {
  const { hasPermission } = usePermissions();
  // Mismo criterio que «Generar documentos» en Facturación.
  const canManage = hasPermission(AccessPermissionKey.BILLING_INVOICES_MANAGE);
  const [target, setTarget] = useState<{ contractId: string; alias: string | null } | null>(null);
  const [result, setResult] = useState<ResultMessage | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!result || target) return;
    // Tras cerrar el diálogo el botón desaparece con la recarga: el foco va al resultado. El
    // temporizador corre después de que el diálogo devuelva el foco al disparador.
    const timer = setTimeout(() => resultRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [result, target]);

  const affected = (statement?.contractSummaries ?? []).filter(
    (summary) => summary.billingNotStarted,
  );
  if (!affected.length && !result) return null;

  return (
    <div className="space-y-2">
      {result ? (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary"
        >
          <PortalAlert
            variant={result.variant}
            density="compact"
            title={result.title}
            description={result.description || undefined}
            action={
              <Button
                size="sm"
                variant="ghost"
                aria-label="Cerrar mensaje del primer cobro"
                onClick={() => setResult(null)}
              >
                Cerrar
              </Button>
            }
          />
        </div>
      ) : null}
      {affected.map((summary) => {
        const alias = contracts.find((contract) => contract.id === summary.contractId)?.alias;
        return (
          <PortalAlert
            key={summary.contractId}
            variant="warning"
            density="compact"
            live="off"
            title={BILLING_NOT_STARTED_TITLE}
            description={[
              alias ? `${alias} · ${BILLING_NOT_STARTED_NOTICE}` : BILLING_NOT_STARTED_NOTICE,
              canManage ? '' : BILLING_NOT_STARTED_ASK,
            ]
              .filter(Boolean)
              .join(' ')}
            action={
              canManage ? (
                <Button
                  size="sm"
                  aria-label={alias ? `${FIRST_CHARGE_ACTION} de ${alias}` : undefined}
                  onClick={() => {
                    setResult(null);
                    setTarget({ contractId: summary.contractId, alias: alias ?? null });
                  }}
                >
                  {FIRST_CHARGE_ACTION}
                </Button>
              ) : undefined
            }
          />
        );
      })}
      {target ? (
        <BillingConfirmation
          title={FIRST_CHARGE_ACTION}
          description={`Se cobrará ${target.alias ? `«${target.alias}»` : 'este contrato'} desde la activación del contrato, con los periodos vencidos hasta hoy. Si el contrato no tiene cargo de instalación, se fijará el vigente del plan y saldrá en el primer cobro.`}
          confirm={FIRST_CHARGE_ACTION}
          onClose={() => setTarget(null)}
          onConfirm={async (key) => {
            const command = GenerateFirstChargeCommandSchema.parse({
              contractId: target.contractId,
            });
            const response = await billingApi.generateFirstCharge(command, key);
            setResult(firstChargeResultMessage(response));
            onGenerated();
          }}
        />
      ) : null}
    </div>
  );
}
