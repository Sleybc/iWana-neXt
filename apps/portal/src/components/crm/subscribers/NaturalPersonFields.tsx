'use client';

import { Input, Select } from '@iwana/ui';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { SubscriberFormValues } from './SubscriberForm';
import { DOCUMENT_TYPE_OPTIONS, STRATUM_OPTIONS } from './subscriber-ui';

interface NaturalPersonFieldsProps {
  register: UseFormRegister<SubscriberFormValues>;
  errors: FieldErrors<SubscriberFormValues>;
}

export function NaturalPersonFields({ register, errors }: NaturalPersonFieldsProps) {
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
        <Input
          label="Fecha de nacimiento"
          type="date"
          className="h-11"
          {...register('birthDate')}
        />
        {errors.birthDate && (
          <p className="mt-1 text-xs text-rose-600">{errors.birthDate.message}</p>
        )}
      </div>
    </div>
  );
}
