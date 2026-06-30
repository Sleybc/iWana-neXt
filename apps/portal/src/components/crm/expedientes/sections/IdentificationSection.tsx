'use client';

import { Input, Select } from '@iwana/ui';
import {
  DOCUMENT_TYPE_OPTIONS,
  EMPTY_VALUE,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  getIdentificationRelevantFields,
} from './constants';
import type { DraftValues } from './types';

interface IdentificationSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function IdentificationSection({
  draftValues,
  onChange,
}: IdentificationSectionProps) {
  const effectivePersonType = draftValues.personType || null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Select
          id="identification-personType"
          label={FIELD_LABELS.personType ?? 'Tipo de persona'}
          value={draftValues.personType ?? EMPTY_VALUE}
          onChange={(event) => onChange('personType', event.target.value)}
          placeholder="Selecciona el tipo de persona"
        >
          <option value="PERSONA_NATURAL">Persona natural</option>
          <option value="PERSONA_JURIDICA">Persona jurídica</option>
        </Select>
        <Select
          id="identification-documentType"
          label={FIELD_LABELS.documentType ?? 'Tipo de documento'}
          value={draftValues.documentType ?? EMPTY_VALUE}
          onChange={(e) => onChange('documentType', e.target.value)}
          placeholder="Selecciona el tipo"
        >
          {DOCUMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Input
          id="identification-documentNumber"
          label={FIELD_LABELS.documentNumber!}
          value={draftValues.documentNumber ?? EMPTY_VALUE}
          onChange={(event) => onChange('documentNumber', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.documentNumber!}
        />
      </div>
      {effectivePersonType === 'PERSONA_JURIDICA' ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Input
            id="identification-companyName"
            label={FIELD_LABELS.companyName!}
            value={draftValues.companyName ?? EMPTY_VALUE}
            onChange={(event) => onChange('companyName', event.target.value)}
            placeholder={FIELD_PLACEHOLDERS.companyName!}
          />
          <Input
            id="identification-primaryContactName"
            label={FIELD_LABELS.primaryContactName!}
            value={draftValues.primaryContactName ?? EMPTY_VALUE}
            onChange={(event) => onChange('primaryContactName', event.target.value)}
            placeholder={FIELD_PLACEHOLDERS.primaryContactName!}
          />
          <Input
            id="identification-primaryContactRole"
            label={FIELD_LABELS.primaryContactRole!}
            value={draftValues.primaryContactRole ?? EMPTY_VALUE}
            onChange={(event) => onChange('primaryContactRole', event.target.value)}
            placeholder={FIELD_PLACEHOLDERS.primaryContactRole!}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            id="identification-firstName"
            label={FIELD_LABELS.firstName!}
            value={draftValues.firstName ?? EMPTY_VALUE}
            onChange={(event) => onChange('firstName', event.target.value)}
            placeholder={FIELD_PLACEHOLDERS.firstName!}
          />
          <Input
            id="identification-lastName"
            label={FIELD_LABELS.lastName!}
            value={draftValues.lastName ?? EMPTY_VALUE}
            onChange={(event) => onChange('lastName', event.target.value)}
            placeholder={FIELD_PLACEHOLDERS.lastName!}
          />
        </div>
      )}
    </div>
  );
}
