// apps/portal/src/components/users/CreateUserModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserRole, DocumentType } from '@iwana/shared';
import type { CreateInternalUserDto } from '@/lib/api-client';

const createUserSchema = z.object({
  email: z.string().trim().email('Ingresa un correo valido.'),
  role: z.string().min(1, 'Selecciona un rol.'),
  firstName: z.string().trim().max(100, 'Maximo 100 caracteres.').optional().or(z.literal('')),
  lastName: z.string().trim().max(100, 'Maximo 100 caracteres.').optional().or(z.literal('')),
  phone: z
    .string()
    .min(7, 'Minimo 7 caracteres')
    .max(50, 'Maximo 50 caracteres')
    .optional()
    .or(z.literal('')),
  jobTitle: z.string().trim().max(150, 'Maximo 150 caracteres.').optional().or(z.literal('')),
  documentType: z.string().optional(),
  documentNumber: z.string().trim().max(20, 'Maximo 20 caracteres.').optional().or(z.literal('')),
  mfaRequired: z.boolean().optional(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

// Roles asignables por un administrador de tenant. Se excluyen los roles de
// plataforma (SYSTEM_ADMIN, IWANA_SUPPORT) porque el backend los rechaza con
// 403 y exponerlos en la UI genera una UX que induce a error.
const TENANT_ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  NOC: 'Operador NOC',
  SUPPORT: 'Soporte',
  SALES: 'Ventas',
  TECHNICIAN: 'Tecnico',
  ACCOUNTANT: 'Contabilidad',
  HR: 'Recursos Humanos',
  SUBSCRIBER: 'Suscriptor',
  CONTRACTOR: 'Contratista',
  PARTNER: 'Socio',
  AUDITOR: 'Auditor',
  INVESTOR: 'Inversionista',
};

/** Roles reservados para operación interna de la plataforma. Nunca asignables por tenants. */
const PLATFORM_ROLES = new Set([UserRole.SYSTEM_ADMIN, UserRole.IWANA_SUPPORT]);

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateInternalUserDto) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  tempPassword?: string | null;
  tempPasswordEmail?: string | null;
  onDismissSuccess?: () => void;
}

export function CreateUserModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  error,
  tempPassword,
  tempPasswordEmail,
  onDismissSuccess,
}: CreateUserModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      role: '',
      firstName: '',
      lastName: '',
      phone: '',
      jobTitle: '',
      documentType: '',
      documentNumber: '',
      mfaRequired: false,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        email: '',
        role: '',
        firstName: '',
        lastName: '',
        phone: '',
        jobTitle: '',
        documentType: '',
        documentNumber: '',
        mfaRequired: false,
      });
      setServerError(null);
      setCopied(false);
      setShowSuccess(false);
    }
  }, [isOpen, reset]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  useEffect(() => {
    if (tempPassword && tempPasswordEmail) {
      setShowSuccess(true);
    }
  }, [tempPassword, tempPasswordEmail]);

  const onFormSubmit = async (values: CreateUserFormValues) => {
    setServerError(null);
    const dto: CreateInternalUserDto = {
      email: values.email.trim(),
      role: values.role,
    };
    if (values.firstName?.trim()) dto.firstName = values.firstName.trim();
    if (values.lastName?.trim()) dto.lastName = values.lastName.trim();
    if (values.phone?.trim()) dto.phone = values.phone.trim();
    if (values.jobTitle?.trim()) dto.jobTitle = values.jobTitle.trim();
    if (values.documentType) dto.documentType = values.documentType;
    if (values.documentNumber?.trim()) dto.documentNumber = values.documentNumber.trim();
    if (values.mfaRequired) dto.mfaRequired = values.mfaRequired;

    await onSubmit(dto);
  };

  const handleCopy = async () => {
    if (tempPassword) {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDismiss = () => {
    setShowSuccess(false);
    onDismissSuccess?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !showSuccess) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-title"
    >
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white border border-gray-200 p-6 shadow-xl dark:bg-dark-surface-2 dark:border-dark-border max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2
            id="create-user-title"
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {showSuccess ? 'Usuario creado' : 'Crear usuario interno'}
          </h2>
          {!showSuccess && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-surface-3 dark:hover:text-gray-200 transition-colors"
              aria-label="Cerrar"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {showSuccess && tempPassword ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="h-5 w-5 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Usuario creado exitosamente
                </p>
              </div>
              <p className="text-sm text-green-700 dark:text-green-400">
                Comparte la siguiente clave temporal con <strong>{tempPasswordEmail}</strong>. El
                usuario debera cambiarla al primer inicio de sesion.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2 uppercase tracking-wide">
                Clave temporal
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-white px-4 py-3 text-base font-mono font-bold text-gray-900 border border-amber-200 dark:bg-dark-surface-3 dark:text-white dark:border-amber-700 tracking-wider">
                  {tempPassword}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-amber-300 dark:hover:bg-amber-900/30 transition-colors shrink-0"
                >
                  {copied ? (
                    <>
                      <svg
                        className="h-3.5 w-3.5 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Copiado
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                        />
                      </svg>
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex items-center justify-center rounded-xl bg-iwana-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-iwana-primary-600 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-4">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {/*
                Email: siempre ancho completo (campos largos como emails se ven mejor en una fila)
              */}
              <div className="col-span-full">
                <label
                  htmlFor="create-email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Correo electronico <span className="text-red-500">*</span>
                </label>
                {errors.email ? (
                  <input
                    id="create-email"
                    type="email"
                    autoComplete="email"
                    disabled={isSubmitting}
                    {...register('email')}
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                    aria-invalid="true"
                  />
                ) : (
                  <input
                    id="create-email"
                    type="email"
                    autoComplete="email"
                    disabled={isSubmitting}
                    {...register('email')}
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                  />
                )}
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/*
                Campos en 2 columnas: rol y cargo
              */}
              <div>
                <label
                  htmlFor="create-role"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Rol <span className="text-red-500">*</span>
                </label>
                {errors.role ? (
                  <select
                    id="create-role"
                    disabled={isSubmitting}
                    {...register('role')}
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:focus:ring-iwana-primary"
                    aria-invalid="true"
                  >
                    <option value="">Selecciona un rol</option>
                    {Object.values(UserRole)
                      .filter((r) => !PLATFORM_ROLES.has(r))
                      .map((r) => (
                        <option key={r} value={r}>
                          {TENANT_ROLE_LABELS[r] ?? r}
                        </option>
                      ))}
                  </select>
                ) : (
                  <select
                    id="create-role"
                    disabled={isSubmitting}
                    {...register('role')}
                    className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:focus:ring-iwana-primary"
                  >
                    <option value="">Selecciona un rol</option>
                    {Object.values(UserRole)
                      .filter((r) => !PLATFORM_ROLES.has(r))
                      .map((r) => (
                        <option key={r} value={r}>
                          {TENANT_ROLE_LABELS[r] ?? r}
                        </option>
                      ))}
                  </select>
                )}
                {errors.role && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.role.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="create-jobTitle"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Cargo
                </label>
                <input
                  id="create-jobTitle"
                  type="text"
                  disabled={isSubmitting}
                  {...register('jobTitle')}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                />
              </div>

              {/*
                Campos en 2 columnas: nombre y apellido
              */}
              <div>
                <label
                  htmlFor="create-firstName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Nombre
                </label>
                <input
                  id="create-firstName"
                  type="text"
                  disabled={isSubmitting}
                  {...register('firstName')}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="create-lastName"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Apellido
                </label>
                <input
                  id="create-lastName"
                  type="text"
                  disabled={isSubmitting}
                  {...register('lastName')}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                />
              </div>

              {/*
                Campos en 2 columnas: telefono y tipo de documento
              */}
              <div>
                <label
                  htmlFor="create-phone"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Telefono
                </label>
                <input
                  id="create-phone"
                  type="tel"
                  placeholder="3001234567"
                  disabled={isSubmitting}
                  {...register('phone')}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="create-documentType"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Tipo de documento
                </label>
                <select
                  id="create-documentType"
                  disabled={isSubmitting}
                  {...register('documentType')}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:focus:ring-iwana-primary"
                >
                  <option value="">Selecciona</option>
                  {Object.values(DocumentType).map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
              </div>

              {/*
                Numero de documento: ancho completo (campo largo y puede crecer)
              */}
              <div className="col-span-full">
                <label
                  htmlFor="create-documentNumber"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  Numero de documento
                </label>
                <input
                  id="create-documentNumber"
                  type="text"
                  placeholder="123456789"
                  disabled={isSubmitting}
                  {...register('documentNumber')}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary"
                />
                {errors.documentNumber && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.documentNumber.message}
                  </p>
                )}
              </div>

              {/*
                MFA: ancho completo
              */}
              <div className="col-span-full">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isSubmitting}
                    {...register('mfaRequired')}
                    className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary dark:border-dark-border dark:bg-dark-surface-3 dark:focus:ring-iwana-primary"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Requerir autenticacion de dos factores (MFA)
                  </span>
                </label>
              </div>
            </div>

            {serverError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-300">{serverError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-iwana-primary px-4 py-2 text-sm font-medium text-white hover:bg-iwana-primary-600 disabled:opacity-50 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300 transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Creando...
                  </>
                ) : (
                  'Crear usuario'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
