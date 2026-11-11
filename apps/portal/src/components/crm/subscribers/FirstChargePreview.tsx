'use client';

import { useCallback, useEffect, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { AccessPermissionKey } from '@iwana/shared';
import { Badge, Button } from '@iwana/ui';
import type { BillingPolicyPreview } from '@iwana/shared';
import type { PlanCatalogItem } from '@/lib/api-client';
import { billingApi } from '@/lib/api-client';
import { usePermissions } from '@/components/access-control/permissions-context';
import { formatBillingMoney } from '@/components/billing/billing-copy';
import {
  PortalAlert,
  PortalEmptyState,
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { formatBillingDate } from './billing-cycle-ui';

type PreviewState =
  | { status: 'idle' | 'loading' }
  | { status: 'error' }
  | { status: 'ready'; preview: BillingPolicyPreview };

interface FirstChargePreviewProps {
  plan: Pick<PlanCatalogItem, 'basePrice' | 'currentPrice' | 'installationFee'> | null;
  billingCycleDay: number | null;
  /**
   * Cargo de instalación congelado en el contrato (fase 2, CA-6). Si el contrato ya existe se
   * pasa su `installationFee` (null = sin cargo) y reemplaza al del catálogo; `undefined` mientras
   * el contrato no exista.
   */
  contractInstallationFee?: number | null;
}

/**
 * Vista previa del primer cobro del alta de contrato (spec MOD05 UISP §3 E, D5).
 * Usa `POST /billing/policy/preview` sin contrato (aún no existe) y toma el ciclo
 * elegido; el valor es el precio del plan, rotulado «Estimado». Sin el permiso de
 * lectura de facturación el bloque no se muestra.
 */
export function FirstChargePreview({
  plan,
  billingCycleDay,
  contractInstallationFee,
}: FirstChargePreviewProps) {
  const { hasPermission } = usePermissions();
  const canReadBilling = hasPermission(AccessPermissionKey.BILLING_INVOICES_READ);
  const ready = canReadBilling && plan !== null && billingCycleDay !== null;
  const [state, setState] = useState<PreviewState>({ status: 'idle' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', preview: await billingApi.preview({}) });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  // La política es la misma para cualquier ciclo: se consulta una vez, cuando ya
  // hay plan y ciclo, y el cambio de ciclo solo elige otra fila de la respuesta.
  useEffect(() => {
    if (ready && state.status === 'idle') void load();
  }, [ready, state.status, load]);

  if (!canReadBilling) return null;

  const price = plan ? (plan.currentPrice ?? plan.basePrice) : null;
  const installationFee =
    contractInstallationFee !== undefined
      ? contractInstallationFee
      : (plan?.installationFee ?? null);
  const cycle =
    state.status === 'ready'
      ? state.preview.cycles.find((item) => item.cycleDay === billingCycleDay)
      : undefined;
  const first = cycle?.items[0];

  return (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title="Primer cobro"
      titleAddon={<Badge variant="neutral">Estimado</Badge>}
      busy={state.status === 'loading'}
    >
      {!ready ? (
        <PortalEmptyState
          embedded
          icon={ReceiptText}
          title="Elige el plan y el ciclo de facturación para estimar el primer cobro"
          description="El estimado usa la política de facturación vigente."
        />
      ) : state.status === 'error' ? (
        <PortalAlert
          variant="error"
          title="No pudimos estimar el primer cobro"
          action={
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => void load()}
            >
              Reintentar
            </Button>
          }
        />
      ) : state.status !== 'ready' ? (
        <div className="space-y-2">
          <p className="sr-only" role="status">
            Calculando el primer cobro
          </p>
          <PortalSkeletonBlock className="h-4" />
          <PortalSkeletonBlock className="h-4" />
          <PortalSkeletonBlock className="h-4" />
        </div>
      ) : !first ? (
        <PortalEmptyState
          embedded
          icon={ReceiptText}
          title="Aún no hay una fecha de cobro para este ciclo"
          description="La fecha aparece cuando la política de facturación la calcule."
        />
      ) : (
        <PortalFieldList>
          <PortalFieldRow label="Periodo">
            {`${formatBillingDate(first.periodStart)} a ${formatBillingDate(first.periodEnd)}`}
          </PortalFieldRow>
          <PortalFieldRow label="Generación">
            {formatBillingDate(first.generationDate)}
          </PortalFieldRow>
          <PortalFieldRow label="Vencimiento">{formatBillingDate(first.dueDate)}</PortalFieldRow>
          <PortalFieldRow label="Valor mensual" mono empty={price == null}>
            {price == null ? null : formatBillingMoney(price)}
          </PortalFieldRow>
          {installationFee != null && installationFee > 0 ? (
            <PortalFieldRow label="Instalación" mono>
              {formatBillingMoney(installationFee)}
            </PortalFieldRow>
          ) : null}
        </PortalFieldList>
      )}
    </PortalPanel>
  );
}
