// apps/portal/src/components/users/CreateUserModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Copy, UserPlus, X } from 'lucide-react';
import { DocumentType } from '@iwana/shared';
import type { CreateInternalUserDto } from '@/lib/api-client';
import { getPortalUserRoleLabel, PORTAL_TENANT_ASSIGNABLE_ROLES } from '@/lib/user-labels';

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
      <div className="relative mx-4 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-iwana-lg dark:border-dark-border dark:bg-dark-surface-2/95">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              Gestión de accesos
            </p>
            <h2
              id="create-user-title"
              className="mt-1 text-xl font-semibold text-iwana-primary dark:text-white"
            >
              {showSuccess ? 'Usuario creado' : 'Crear usuario interno'}
            </h2>
            {!showSuccess && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Registra un nuevo colaborador con su rol, datos base y política inicial de MFA.
              </p>
            )}
          </div>
          {!showSuccess && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-gray-400 transition-colors hover:bg-[#f8faf5] hover:text-gray-700 dark:hover:bg-dark-surface-3 dark:hover:text-gray-200"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {showSuccess && tempPassword ? (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.98),rgba(209,250,229,0.82))] p-5 shadow-iwana-soft dark:border-emerald-800 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2
                  className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Usuario creado exitosamente
                </p>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                Comparte la siguiente clave temporal con <strong>{tempPasswordEmail}</strong>. El
                usuario debera cambiarla al primer inicio de sesion.
              </p>
            </div>

            <div className="rounded-[24px] border border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.98),rgba(254,243,199,0.78))] p-5 shadow-iwana-soft dark:border-amber-800 dark:bg-amber-900/20">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                Clave temporal
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-base font-mono font-bold tracking-wider text-gray-900 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-white">
                  {tempPassword}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-amber-300 dark:hover:bg-amber-900/30"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
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
                className="inline-flex items-center justify-center rounded-2xl bg-iwana-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-iwana-primary-600 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300"
              >
                Entendido
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-4">
            <div className="flex items-start gap-3 rounded-[24px] border border-gray-200 bg-[#f8faf5] p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                  Alta controlada
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Los campos marcados como obligatorios definen identidad de acceso. Los demás
                  enriquecen el perfil operativo del colaborador.
                </p>
              </div>
            </div>

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
                    {PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {getPortalUserRoleLabel(role)}
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
                    {PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {getPortalUserRoleLabel(role)}
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
              <div className="rounded-2xl border border-red-200/80 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-sm text-red-700 dark:text-red-300">{serverError}</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-iwana-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-iwana-primary-600 disabled:opacity-50 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300"
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
