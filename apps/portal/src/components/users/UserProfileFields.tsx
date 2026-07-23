'use client';

import { DocumentType } from '@iwana/shared';
import { Select } from '@iwana/ui';
import type { FieldErrors, FieldValues, Path, UseFormRegister } from 'react-hook-form';
import { getPortalDocumentTypeLabel } from '@/lib/user-labels';

type ProfileFieldName =
  | 'jobTitle'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'documentType'
  | 'documentNumber'
  | 'mfaRequired'
  | 'isOperationalResource';

interface UserProfileFieldsProps<TFieldValues extends FieldValues> {
  idPrefix: 'create' | 'edit';
  register: UseFormRegister<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
  isSubmitting: boolean;
  inputClassName: string;
  selectClassName: string;
  /** Texto de ayuda del flag operativo (create/edit difieren a propósito). */
  operationalResourceDescription: string;
  /** Create usa ancho completo; edit mantiene 2 columnas con tipo de documento. */
  documentNumberFullWidth?: boolean;
  phonePlaceholder?: string;
}

function fieldPath<TFieldValues extends FieldValues>(name: ProfileFieldName): Path<TFieldValues> {
  return name as Path<TFieldValues>;
}

/**
 * Campos de perfil compartidos por CreateUserModal y EditUserModal.
 * Conserva prefijos de id (`create-` / `edit-`) y tipografía vía className.
 */
export function UserProfileFields<TFieldValues extends FieldValues>({
  idPrefix,
  register,
  errors,
  isSubmitting,
  inputClassName,
  selectClassName,
  operationalResourceDescription,
  documentNumberFullWidth = false,
  phonePlaceholder,
}: UserProfileFieldsProps<TFieldValues>) {
  const phoneError = errors[fieldPath<TFieldValues>('phone')];
  const documentNumberError = errors[fieldPath<TFieldValues>('documentNumber')];

  return (
    <>
      <div>
        <label
          htmlFor={`${idPrefix}-jobTitle`}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Cargo
        </label>
        <input
          id={`${idPrefix}-jobTitle`}
          type="text"
          disabled={isSubmitting}
          {...register(fieldPath<TFieldValues>('jobTitle'))}
          className={inputClassName}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-firstName`}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Nombre
        </label>
        <input
          id={`${idPrefix}-firstName`}
          type="text"
          disabled={isSubmitting}
          {...register(fieldPath<TFieldValues>('firstName'))}
          className={inputClassName}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-lastName`}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Apellido
        </label>
        <input
          id={`${idPrefix}-lastName`}
          type="text"
          disabled={isSubmitting}
          {...register(fieldPath<TFieldValues>('lastName'))}
          className={inputClassName}
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-phone`}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Teléfono
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          placeholder={phonePlaceholder}
          disabled={isSubmitting}
          {...register(fieldPath<TFieldValues>('phone'))}
          className={inputClassName}
        />
        {phoneError?.message ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {String(phoneError.message)}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-documentType`}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Tipo de documento
        </label>
        <Select
          id={`${idPrefix}-documentType`}
          disabled={isSubmitting}
          {...register(fieldPath<TFieldValues>('documentType'))}
          aria-label="Tipo de documento"
          className={selectClassName}
        >
          <option value="">Selecciona</option>
          {Object.values(DocumentType).map((dt) => (
            <option key={dt} value={dt}>
              {getPortalDocumentTypeLabel(dt)}
            </option>
          ))}
        </Select>
      </div>

      <div className={documentNumberFullWidth ? 'col-span-full' : undefined}>
        <label
          htmlFor={`${idPrefix}-documentNumber`}
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Número de documento
        </label>
        <input
          id={`${idPrefix}-documentNumber`}
          type="text"
          placeholder="123456789"
          disabled={isSubmitting}
          {...register(fieldPath<TFieldValues>('documentNumber'))}
          className={inputClassName}
        />
        {documentNumberError?.message ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {String(documentNumberError.message)}
          </p>
        ) : null}
      </div>

      <div className="col-span-full">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            disabled={isSubmitting}
            {...register(fieldPath<TFieldValues>('mfaRequired'))}
            className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:focus:ring-iwana-primary"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Requerir verificación en dos pasos
          </span>
        </label>
      </div>

      <div className="col-span-full rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-dark-border dark:bg-dark-surface-3/70">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            disabled={isSubmitting}
            {...register(fieldPath<TFieldValues>('isOperationalResource'))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:focus:ring-iwana-primary"
          />
          <span className="space-y-1">
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
              Disponible para despacho operativo
            </span>
            <span className="block text-sm text-gray-600 dark:text-gray-300">
              {operationalResourceDescription}
            </span>
          </span>
        </label>
      </div>
    </>
  );
}
