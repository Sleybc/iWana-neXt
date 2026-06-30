'use client';

import { Select } from '@iwana/ui';
import { EMPTY_VALUE, FIELD_LABELS } from './constants';
import type { DraftValues } from './types';

interface LegalConsentSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function LegalConsentSection({ draftValues, onChange }: LegalConsentSectionProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Select
        id="legal-identityVerified"
        label={FIELD_LABELS.identityVerified!}
        value={draftValues.identityVerified ?? EMPTY_VALUE}
        onChange={(event) => onChange('identityVerified', event.target.value)}
        placeholder="Selecciona el estado de verificación"
      >
        <option value="">Selecciona una opción</option>
        <option value="VERIFIED">Verificado</option>
        <option value="NOT_VERIFIED">Sin verificar</option>
      </Select>

      <Select
        id="legal-legalComplianceStatus"
        label={FIELD_LABELS.legalComplianceStatus!}
        value={draftValues.legalComplianceStatus ?? EMPTY_VALUE}
        onChange={(event) => onChange('legalComplianceStatus', event.target.value)}
        placeholder="Selecciona la autorización de tratamiento de datos"
      >
        <option value="">Selecciona una opción</option>
        <option value="AUTHORIZED">Autoriza</option>
        <option value="NOT_AUTHORIZED">No autoriza</option>
      </Select>
    </div>
  );
}
