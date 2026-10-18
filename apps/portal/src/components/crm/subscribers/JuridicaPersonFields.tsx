'use client';

import { useId } from 'react';
import { Input, Select } from '@iwana/ui';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { SubscriberFormValues } from './SubscriberForm';
import { validateNitVerificationDigit } from './subscriber-fiscal';
import { DOCUMENT_TYPE_OPTIONS } from './subscriber-ui';

interface JuridicaPersonFieldsProps {
  register: UseFormRegister<SubscriberFormValues>;
  errors: FieldErrors<SubscriberFormValues>;
  nitValue: string;
  digitValue: string;
  onNitChange: (value: string) => void;
}

export function JuridicaPersonFields({
  register,
  errors,
  nitValue,
  digitValue,
  onNitChange,
}: JuridicaPersonFieldsProps) {
  const nitErrorId = useId();
  // Validación en vivo con la misma regla que la API, solo cuando ya hay algo que validar.
  const liveDigitError =
    nitValue.trim() && digitValue.trim()
      ? validateNitVerificationDigit(nitValue, digitValue)
      : null;
  const digitError = liveDigitError ?? errors.nitVerificationDigit?.message;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Input
            label="NIT"
            className="h-11"
            inputMode="numeric"
            aria-invalid={errors.nit ? true : undefined}
            aria-describedby={errors.nit ? nitErrorId : undefined}
            {...register('nit', { onChange: (event) => onNitChange(event.target.value) })}
          />
          {errors.nit && (
            <p id={nitErrorId} role="alert" className="mt-1 text-xs text-rose-600">
              {errors.nit.message}
            </p>
          )}
        </div>
        <div>
          <Input
            label="Dígito de verificación"
            className="h-11"
            inputMode="numeric"
            maxLength={1}
            required
            aria-required="true"
            aria-invalid={digitError ? true : undefined}
            {...register('nitVerificationDigit')}
          />
          {digitError && (
            <p role="alert" className="mt-1 text-xs text-rose-600">
              {digitError}
            </p>
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
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900 dark:text-white">
          Representante legal
        </legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Input
              label="Nombre completo del representante legal"
              className="h-11"
              required
              aria-required="true"
              {...register('legalRepresentativeFullName')}
            />
            {errors.legalRepresentativeFullName && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.legalRepresentativeFullName.message}
              </p>
            )}
          </div>
          <div>
            <Select
              label="Tipo de documento del representante"
              className="h-11"
              options={[...DOCUMENT_TYPE_OPTIONS]}
              required
              aria-required="true"
              {...register('legalRepresentativeDocumentType')}
            >
              <option value="">Selecciona</option>
            </Select>
            {errors.legalRepresentativeDocumentType && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.legalRepresentativeDocumentType.message}
              </p>
            )}
          </div>
          <div className="md:col-span-2">
            <Input
              label="Número de documento del representante"
              className="h-11"
              required
              aria-required="true"
              {...register('legalRepresentativeDocumentNumber')}
            />
            {errors.legalRepresentativeDocumentNumber && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.legalRepresentativeDocumentNumber.message}
              </p>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
