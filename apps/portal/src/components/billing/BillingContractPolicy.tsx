'use client';

import { useCallback, useState, type FormEvent } from 'react';
import {
  BillingContractPolicyUpdateSchema,
  type BillingContractPolicyResponse,
} from '@iwana/shared';
import { Button } from '@iwana/ui';
import { PortalAlert, PortalSidePeek } from '@/components/shared/portal-ui';
import { billingApi } from '@/lib/api-client';
import {
  BillingLoadState,
  billingInputClass,
  useBillingLoad,
  useBillingMutation,
} from './billing-ui';

type Policy = BillingContractPolicyResponse['data'];

export function BillingContractPolicy({
  contractId,
  contractLabel,
  canManage,
  onClose,
}: {
  contractId: string;
  contractLabel: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const load = useCallback(() => billingApi.contractPolicy(contractId), [contractId]);
  const { data, loading, error, reload } = useBillingLoad(load);
  const mutation = useBillingMutation();
  const [saved, setSaved] = useState(false);
  return (
    <PortalSidePeek
      open
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
      title="Política de facturación"
      description={contractLabel}
    >
      <BillingLoadState loading={loading} error={error} onRetry={reload} />
      {saved ? <PortalAlert variant="success" title="Política guardada" /> : null}
      {data ? (
        <PolicyForm
          key={data.updatedAt ?? contractId}
          policy={data}
          canManage={canManage}
          mutation={mutation}
          onSaved={() => {
            setSaved(true);
            reload();
          }}
        />
      ) : null}
    </PortalSidePeek>
  );
}

function PolicyForm({
  policy,
  canManage,
  mutation,
  onSaved,
}: {
  policy: Policy;
  canManage: boolean;
  mutation: ReturnType<typeof useBillingMutation>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    periodTiming: policy.periodTiming ?? '',
    generationLeadDays: policy.generationLeadDays?.toString() ?? '',
    paymentTermDays: policy.paymentTermDays?.toString() ?? '',
    graceDays: policy.graceDays?.toString() ?? '',
    cutoffEnabled: policy.cutoffEnabled?.toString() ?? '',
    firstPeriodMode: policy.firstPeriodMode ?? '',
    billingStartDate: policy.billingStartDate ?? '',
  });
  const set = (key: keyof typeof draft, value: string) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    const parsed = BillingContractPolicyUpdateSchema.safeParse({
      periodTiming: draft.periodTiming || null,
      generationLeadDays: draft.generationLeadDays ? Number(draft.generationLeadDays) : null,
      paymentTermDays: draft.paymentTermDays ? Number(draft.paymentTermDays) : null,
      graceDays: draft.graceDays ? Number(draft.graceDays) : null,
      cutoffEnabled: draft.cutoffEnabled ? draft.cutoffEnabled === 'true' : null,
      firstPeriodMode: draft.firstPeriodMode || null,
      billingStartDate: draft.billingStartDate || null,
      ...(policy.updatedAt ? { expectedUpdatedAt: policy.updatedAt } : {}),
    });
    if (!parsed.success) {
      mutation.setError('Revisa los valores de la política de facturación.');
      return;
    }
    void mutation.run(
      parsed.data,
      (key) => billingApi.updateContractPolicy(policy.contractId, parsed.data, key),
      onSaved,
    );
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="text-sm">Los valores sin completar heredan la política de la empresa.</p>
      <fieldset disabled={mutation.busy || !canManage} className="space-y-3">
        <label className="block space-y-1 text-sm">
          Momento del cobro
          <select
            className={billingInputClass}
            value={draft.periodTiming}
            onChange={(event) => set('periodTiming', event.target.value)}
          >
            <option value="">Heredar</option>
            <option value="ANTICIPADO">Cobro anticipado</option>
            <option value="VENCIDO">Cobro al final del periodo</option>
          </select>
        </label>
        {(
          [
            ['generationLeadDays', 'Días de anticipación para generar', 15],
            ['paymentTermDays', 'Plazo para pagar (días)', 60],
            ['graceDays', 'Días de gracia tras vencimiento', 30],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key} className="block space-y-1 text-sm">
            {label}
            <input
              type="number"
              min={0}
              max={max}
              placeholder="Heredar"
              className={billingInputClass}
              value={draft[key]}
              onChange={(event) => set(key, event.target.value)}
            />
          </label>
        ))}
        <label className="block space-y-1 text-sm">
          Corte programado
          <select
            className={billingInputClass}
            value={draft.cutoffEnabled}
            onChange={(event) => set('cutoffEnabled', event.target.value)}
          >
            <option value="">Heredar</option>
            <option value="true">Habilitado</option>
            <option value="false">Deshabilitado</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Primer periodo incompleto
          <select
            className={billingInputClass}
            value={draft.firstPeriodMode}
            onChange={(event) => set('firstPeriodMode', event.target.value)}
          >
            <option value="">Heredar</option>
            <option value="SEPARADO">Documento inicial separado</option>
            <option value="JUNTO_AL_SIGUIENTE">Unir al siguiente periodo</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Fecha de inicio de cobro
          <input
            type="date"
            className={billingInputClass}
            value={draft.billingStartDate}
            onChange={(event) => set('billingStartDate', event.target.value)}
          />
        </label>
      </fieldset>
      {mutation.error ? <PortalAlert variant="error" title={mutation.error} /> : null}
      {canManage ? (
        <Button className="min-h-11" type="submit" disabled={mutation.busy} loading={mutation.busy}>
          Guardar cambios
        </Button>
      ) : null}
    </form>
  );
}
