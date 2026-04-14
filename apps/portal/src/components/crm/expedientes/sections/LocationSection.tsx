'use client';

import { Input, Select } from '@iwana/ui';
import {
  DEPARTAMENTO_DEFAULT,
  DEPARTAMENTOS,
  EMPTY_VALUE,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  getMunicipiosByDepartamento,
} from './constants';
import type { DraftValues } from './types';

interface LocationSectionProps {
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  saving: boolean;
  onSave: () => void;
}

export function LocationSection({ draftValues, onChange }: LocationSectionProps) {
  const municipios = getMunicipiosByDepartamento(draftValues.department ?? DEPARTAMENTO_DEFAULT);

  return (
    <div className="grid gap-4 md:grid-cols-12">
      <div className="md:col-span-6">
        <Select
          id="location-department"
          label={FIELD_LABELS.department!}
          value={draftValues.department ?? DEPARTAMENTO_DEFAULT}
          onChange={(e) => onChange('department', e.target.value)}
          disabled
        >
          {DEPARTAMENTOS.map((depto) => (
            <option key={depto.value} value={depto.value}>
              {depto.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="md:col-span-6">
        <Select
          id="location-municipality"
          label={FIELD_LABELS.municipality!}
          value={draftValues.municipality ?? EMPTY_VALUE}
          onChange={(e) => onChange('municipality', e.target.value)}
          placeholder="Selecciona el municipio"
        >
          {municipios.map((muni) => (
            <option key={muni.value} value={muni.value}>
              {muni.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="md:col-span-9">
        <Input
          id="location-address"
          label={FIELD_LABELS.address!}
          value={draftValues.address ?? EMPTY_VALUE}
          onChange={(event) => onChange('address', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.address!}
        />
      </div>
      <div className="md:col-span-3">
        <Input
          id="location-postalCode"
          label={FIELD_LABELS.postalCode!}
          value={draftValues.postalCode ?? EMPTY_VALUE}
          onChange={(event) => onChange('postalCode', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.postalCode!}
          maxLength={12}
        />
      </div>
      <div className="md:col-span-2">
        <Select
          id="location-stratum"
          label={FIELD_LABELS.stratum!}
          value={draftValues.stratum ?? EMPTY_VALUE}
          onChange={(event) => onChange('stratum', event.target.value)}
          placeholder="Selecciona"
        >
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </Select>
      </div>
      <div className="md:col-span-10">
        <Input
          id="location-neighborhood"
          label={FIELD_LABELS.neighborhood!}
          value={draftValues.neighborhood ?? EMPTY_VALUE}
          onChange={(event) => onChange('neighborhood', event.target.value)}
          placeholder={FIELD_PLACEHOLDERS.neighborhood!}
        />
      </div>
    </div>
  );
}
