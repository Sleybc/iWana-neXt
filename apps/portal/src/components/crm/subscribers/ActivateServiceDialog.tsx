'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import type { Contract } from '@/lib/api-client';
import { ApiError, contractsApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import { BillingCycleField } from './BillingCycleField';
import { useBillingCycles } from './use-billing-cycles';

interface ActivateServiceDialogProps {
  contract: Contract;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export function ActivateServiceDialog({
  contract,
  onClose,
  onSuccess,
}: ActivateServiceDialogProps) {
  const billingCycles = useBillingCycles();
  const initialized = useRef(false);
  const [cycleDay, setCycleDay] = useState('');
  const [cycleError, setCycleError] = useState<string | undefined>();
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationAction, setActivationAction] = useState<'close' | 'draft' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (billingCycles.loading || billingCycles.error || initialized.current) return;
    initialized.current = true;

    const currentCycle = contract.billingCycleDay;
    if (currentCycle == null) return;

    if (billingCycles.cycles.some((cycle) => cycle.cycleDay === currentCycle)) {
      setCycleDay(String(currentCycle));
    } else {
      setCycleError('Este ciclo ya no está disponible. Elige otro.');
    }
  }, [billingCycles.cycles, billingCycles.error, billingCycles.loading, contract.billingCycleDay]);

  const handleCycleChange = (value: string) => {
    setCycleDay(value);
    setCycleError(undefined);
    setActivationError(null);
    setActivationAction(null);
  };

  const handleActivate = async () => {
    if (!cycleDay || saving || billingCycles.loading || billingCycles.error) return;
    const selectedCycle = billingCycles.cycles.find((cycle) => cycle.cycleDay === Number(cycleDay));
    if (!selectedCycle) {
      setCycleDay('');
      setCycleError('Este ciclo ya no está disponible. Elige otro.');
      billingCycles.retry();
      return;
    }

    setSaving(true);
    setCycleError(undefined);
    setActivationError(null);
    setActivationAction(null);
    try {
      await contractsApi.activate(contract.id, { billingCycleDay: selectedCycle.cycleDay });
      await onSuccess();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        if (error.code === 'BILLING_CYCLE_REQUIRED') {
          setCycleError('Elige un ciclo de facturación para continuar.');
          return;
        }
        if (error.code === 'BILLING_CYCLE_INVALID') {
          setCycleDay('');
          setCycleError('Este ciclo ya no está disponible. Elige otro.');
          billingCycles.retry();
          return;
        }
      }
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'SUBSCRIBER_CANCELLED'
      ) {
        setActivationError('No puedes crear ni activar servicios para un suscriptor cancelado.');
        setActivationAction('close');
        return;
      }
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY'
      ) {
        setActivationError(
          'No puedes activar este servicio porque el suscriptor está suspendido por mora. Puedes dejarlo como borrador.',
        );
        setActivationAction('draft');
        return;
      }
      setActivationError(
        error instanceof ApiError
          ? error.message
          : 'No fue posible activar el servicio. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open && !saving ? onClose() : undefined)}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activar servicio</DialogTitle>
          <DialogDescription>Elige el ciclo de facturación para continuar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <BillingCycleField
            cycles={billingCycles.cycles}
            value={cycleDay}
            onChange={handleCycleChange}
            loading={billingCycles.loading}
            catalogError={billingCycles.error}
            onRetry={billingCycles.retry}
            disabled={saving}
            allowUnassigned={false}
            placeholder="Selecciona un ciclo"
            error={cycleError}
            helperText={cycleDay ? undefined : 'Elige un ciclo para calcular la fecha de corte.'}
            showNextCutoff
            id="activate-service-billing-cycle"
          />

          {activationError ? (
            <PortalAlert
              variant="error"
              live="assertive"
              title={
                activationAction === 'draft'
                  ? 'No puedes activar este servicio'
                  : activationAction === 'close'
                    ? 'No puedes crear ni activar servicios'
                    : 'No fue posible activar el servicio'
              }
              description={activationError}
              action={
                activationAction ? (
                  <Button type="button" variant="secondary" className="min-h-11" onClick={onClose}>
                    {activationAction === 'draft' ? 'Dejar como borrador' : 'Cerrar'}
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end dark:border-dark-border">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={saving}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-11"
              loading={saving}
              disabled={!cycleDay || saving || billingCycles.loading || billingCycles.error}
              onClick={() => void handleActivate()}
            >
              Activar servicio
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
