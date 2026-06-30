'use client';

import { Input, Select } from '@iwana/ui';
import { FIELD_LABELS, FIELD_PLACEHOLDERS, EMPTY_VALUE } from './constants';
import type { DraftValues } from './types';

interface ContactSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function ContactSection({ draftValues, onChange, saving, onSave }: ContactSectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="contact-phonePrimary"
          label={FIELD_LABELS.phonePrimary!}
          value={draftValues.phonePrimary ?? EMPTY_VALUE}
          onChange={(event) => onChange('phonePrimary', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.phonePrimary!}
        />
        <Input
          id="contact-emailPrimary"
          label={FIELD_LABELS.emailPrimary!}
          value={draftValues.emailPrimary ?? EMPTY_VALUE}
          onChange={(event) => onChange('emailPrimary', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.emailPrimary!}
        />
      </div>
      <div className="border-t border-gray-200 pt-4 dark:border-dark-border" />
      <div className="grid gap-4 md:grid-cols-2">
        <Input
          id="contact-altContactName"
          label={FIELD_LABELS.altContactName!}
          value={draftValues.altContactName ?? EMPTY_VALUE}
          onChange={(event) => onChange('altContactName', event.target.value)}
          maxLength={160}
          placeholder={FIELD_PLACEHOLDERS.altContactName!}
        />
        <Input
          id="contact-altContactPhone"
          label={FIELD_LABELS.altContactPhone!}
          type="tel"
          maxLength={10}
          pattern="3[0-9]{9}"
          value={draftValues.altContactPhone ?? EMPTY_VALUE}
          onChange={(event) => onChange('altContactPhone', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.altContactPhone!}
        />
      </div>
    </div>
  );
}
