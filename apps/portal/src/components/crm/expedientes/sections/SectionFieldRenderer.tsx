'use client';

import { Input, Select } from '@iwana/ui';
import { AcquisitionChannel } from '@iwana/shared';
import type { ExpedienteRecord } from '@/lib/api-client';
import {
  ACQUISITION_CHANNEL_OPTIONS,
  DEPARTAMENTO_DEFAULT,
  DEPARTAMENTOS,
  FIELD_LABELS,
  FIELD_PLACEHOLDERS,
  getMunicipiosByDepartamento,
  getProtectedFieldHelper,
} from './constants';
import type { DraftValues } from './types';

interface SectionFieldRendererProps {
  fields: readonly string[];
  draftValues: DraftValues;
  onChange: (field: string, value: string) => void;
  expediente: ExpedienteRecord;
}

export function SectionFieldRenderer({
  fields,
  draftValues,
  onChange,
  expediente,
}: SectionFieldRendererProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields
        .filter((field) => field !== 'personType')
        .map((field) => {
          const protectedFieldHelper = getProtectedFieldHelper(expediente, field);

          if (field === 'altContactName') {
            return (
              <div key={field} className="md:col-span-2 space-y-4">
                <div className="border-t border-gray-200 pt-4" />
                <Input
                  id={`field-${field}`}
                  label={FIELD_LABELS[field] ?? field}
                  value={draftValues[field] ?? ''}
                  onChange={(event) => onChange(field, event.target.value)}
                  maxLength={160}
                  placeholder={
                    FIELD_PLACEHOLDERS[field] ?? `Ingresa ${FIELD_LABELS[field] ?? field}`
                  }
                />
              </div>
            );
          }

          if (field === 'altContactPhone') {
            return (
              <Input
                key={field}
                id={`field-${field}`}
                type="tel"
                maxLength={10}
                pattern="3[0-9]{9}"
                label={FIELD_LABELS[field] ?? field}
                value={draftValues[field] ?? ''}
                onChange={(event) => onChange(field, event.target.value)}
                placeholder={FIELD_PLACEHOLDERS[field] ?? `Ingresa ${FIELD_LABELS[field] ?? field}`}
                {...(protectedFieldHelper ? { helperText: protectedFieldHelper } : {})}
              />
            );
          }

          if (field === 'department') {
            return (
              <Select
                key={field}
                id={`field-${field}`}
                label={FIELD_LABELS[field]!}
                value={draftValues[field] ?? DEPARTAMENTO_DEFAULT}
                onChange={(e) => onChange(field, e.target.value)}
                disabled
              >
                {DEPARTAMENTOS.map((depto) => (
                  <option key={depto.value} value={depto.value}>
                    {depto.label}
                  </option>
                ))}
              </Select>
            );
          }

          if (field === 'municipality') {
            const currentDept = draftValues['department'] ?? DEPARTAMENTO_DEFAULT;
            const municipios = getMunicipiosByDepartamento(currentDept);
            return (
              <Select
                key={field}
                id={`field-${field}`}
                label={FIELD_LABELS[field]!}
                value={draftValues[field] ?? ''}
                onChange={(e) => onChange(field, e.target.value)}
                placeholder="Selecciona el municipio"
              >
                {municipios.map((muni) => (
                  <option key={muni.value} value={muni.value}>
                    {muni.label}
                  </option>
                ))}
              </Select>
            );
          }

          if (field === 'latitude' || field === 'longitude') {
            return (
              <Input
                key={field}
                id={`field-${field}`}
                type="number"
                step="0.0000001"
                label={FIELD_LABELS[field]!}
                value={draftValues[field] ?? ''}
                onChange={(event) => onChange(field, event.target.value)}
                placeholder={FIELD_PLACEHOLDERS[field]!}
              />
            );
          }

          if (field === 'additionalProductIds') {
            const selectedIds: string[] = (() => {
              try {
                const raw = draftValues[field] ?? '[]';
                return JSON.parse(raw);
              } catch {
                return [];
              }
            })();

            return null;
          }

          if (field === 'acquisitionChannel') {
            return (
              <Select
                key={field}
                id={`field-${field}`}
                label={FIELD_LABELS[field]!}
                value={draftValues[field] ?? AcquisitionChannel.OTRO}
                onChange={(event) => onChange(field, event.target.value)}
              >
                {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            );
          }

          return (
            <Input
              key={field}
              id={`field-${field}`}
              label={FIELD_LABELS[field] ?? field}
              value={draftValues[field] ?? ''}
              onChange={(event) => onChange(field, event.target.value)}
              placeholder={FIELD_PLACEHOLDERS[field] ?? `Ingresa ${FIELD_LABELS[field] ?? field}`}
              {...(protectedFieldHelper ? { helperText: protectedFieldHelper } : {})}
            />
          );
        })}
    </div>
  );
}
