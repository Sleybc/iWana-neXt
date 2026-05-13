'use client';

import { DatePicker, Input, Select } from '@iwana/ui';
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import type { SubscriberFormValues } from './SubscriberForm';
import { DOCUMENT_TYPE_OPTIONS, STRATUM_OPTIONS } from './subscriber-ui';

interface NaturalPersonFieldsProps {
  control: Control<SubscriberFormValues>;
  register: UseFormRegister<SubscriberFormValues>;
  errors: FieldErrors<SubscriberFormValues>;
}

function toDateFromLocalDateValue(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toLocalDateValue(date: Date | undefined): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function NaturalPersonFields({ control, register, errors }: NaturalPersonFieldsProps) {
  const birthDateError = typeof errors.birthDate?.message === 'string' ? errors.birthDate.message : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Select
          label="Tipo de documento"
          className="h-11"
          options={[...DOCUMENT_TYPE_OPTIONS]}
          {...register('documentType')}
        >
          <option value="">Selecciona</option>
        </Select>
        {errors.documentType && (
          <p className="mt-1 text-xs text-rose-600">{errors.documentType.message}</p>
        )}
      </div>
      <div>
        <Input label="Número de documento" className="h-11" {...register('documentNumber')} />
        {errors.documentNumber && (
          <p className="mt-1 text-xs text-rose-600">{errors.documentNumber.message}</p>
        )}
      </div>
      <div>
        <Input label="Nombre" className="h-11" {...register('firstName')} />
        {errors.firstName && (
          <p className="mt-1 text-xs text-rose-600">{errors.firstName.message}</p>
        )}
      </div>
      <div>
        <Input label="Apellido" className="h-11" {...register('lastName')} />
        {errors.lastName && <p className="mt-1 text-xs text-rose-600">{errors.lastName.message}</p>}
      </div>
      <div>
        <Select
          label="Estrato"
          className="h-11"
          options={[...STRATUM_OPTIONS]}
          {...register('stratum')}
        >
          <option value="">Selecciona</option>
        </Select>
        {errors.stratum && <p className="mt-1 text-xs text-rose-600">{errors.stratum.message}</p>}
      </div>
      <div>
        <Controller
          name="birthDate"
          control={control}
          render={({ field }) => (
            <DatePicker
              id="subscriber-birth-date"
              name={field.name}
              label="Fecha de nacimiento"
              value={toDateFromLocalDateValue(field.value)}
              onChange={(date) => field.onChange(toLocalDateValue(date))}
              onBlur={field.onBlur}
              error={birthDateError}
              placeholder="Selecciona la fecha"
              buttonClassName="h-11"
            />
          )}
        />
      </div>
    </div>
  );
}
