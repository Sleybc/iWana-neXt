'use client';

import { Input } from '@iwana/ui';
import { EMPTY_VALUE, FIELD_LABELS, FIELD_PLACEHOLDERS } from './constants';
import type { DraftValues } from './types';

interface BillingSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function BillingSection({ draftValues, onChange }: BillingSectionProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        id="billing-paymentMethod"
        label={FIELD_LABELS.paymentMethod!}
        value={draftValues.paymentMethod ?? EMPTY_VALUE}
        onChange={(event) => onChange('paymentMethod', event.target.value)}
        placeholder={FIELD_PLACEHOLDERS.paymentMethod!}
      />
      <Input
        id="billing-billingCycle"
        label={FIELD_LABELS.billingCycle!}
        value={draftValues.billingCycle ?? EMPTY_VALUE}
        onChange={(event) => onChange('billingCycle', event.target.value)}
        placeholder={FIELD_PLACEHOLDERS.billingCycle!}
      />
    </div>
  );
}
