'use client';

import { Input } from '@iwana/ui';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { SubscriberFormValues } from './SubscriberForm';

interface JuridicaPersonFieldsProps {
  register: UseFormRegister<SubscriberFormValues>;
  errors: FieldErrors<SubscriberFormValues>;
}

export function JuridicaPersonFields({ register, errors }: JuridicaPersonFieldsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <Input label="NIT" className="h-11" {...register('nit')} />
        {errors.nit && <p className="mt-1 text-xs text-rose-600">{errors.nit.message}</p>}
      </div>
      <div>
        <Input
          label="Dígito de verificación"
          className="h-11"
          {...register('nitVerificationDigit')}
        />
        {errors.nitVerificationDigit && (
          <p className="mt-1 text-xs text-rose-600">{errors.nitVerificationDigit.message}</p>
        )}
      </div>
      <div>
        <Input label="Razón social" className="h-11" {...register('businessName')} />
        {errors.businessName && (
          <p className="mt-1 text-xs text-rose-600">{errors.businessName.message}</p>
        )}
      </div>
      <div>
        <Input label="Nombre comercial" className="h-11" {...register('commercialName')} />
        {errors.commercialName && (
          <p className="mt-1 text-xs text-rose-600">{errors.commercialName.message}</p>
        )}
      </div>
      <div className="md:col-span-2">
        <Input
          label="Representante legal"
          className="h-11"
          {...register('legalRepresentativeId')}
        />
        {errors.legalRepresentativeId && (
          <p className="mt-1 text-xs text-rose-600">{errors.legalRepresentativeId.message}</p>
        )}
      </div>
    </div>
  );
}
