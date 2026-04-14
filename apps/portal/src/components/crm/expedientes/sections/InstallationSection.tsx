'use client';

import { Input } from '@iwana/ui';
import { EMPTY_VALUE, FIELD_LABELS, FIELD_PLACEHOLDERS } from './constants';
import type { DraftValues } from './types';

interface InstallationSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function InstallationSection({ draftValues, onChange }: InstallationSectionProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        id="installation-installationAddress"
        label={FIELD_LABELS.installationAddress!}
        value={draftValues.installationAddress ?? EMPTY_VALUE}
        onChange={(event) => onChange('installationAddress', event.target.value)}
        placeholder={FIELD_PLACEHOLDERS.installationAddress!}
      />
      <Input
        id="installation-siteContactName"
        label={FIELD_LABELS.siteContactName!}
        value={draftValues.siteContactName ?? EMPTY_VALUE}
        onChange={(event) => onChange('siteContactName', event.target.value)}
        placeholder={FIELD_PLACEHOLDERS.siteContactName!}
      />
    </div>
  );
}
