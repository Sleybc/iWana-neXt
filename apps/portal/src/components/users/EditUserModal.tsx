// apps/portal/src/components/users/EditUserModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserRole, UserStatus, DocumentType } from '@iwana/shared';
import {
  usersApi,
  type InternalUser,
  type UpdateInternalUserDto,
  ApiError,
} from '@/lib/api-client';

const editUserSchema = z.object({
  email: z.string().trim().email('Ingresa un correo valido.'),
  status: z.string().optional(),
  role: z.string().optional(),
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

type EditUserFormValues = z.infer<typeof editUserSchema>;

const ROLE_LABELS: Record<string, string> = {
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

/** Roles reservados para la plataforma. No asignables por administradores de tenant. */
const PLATFORM_ROLES = new Set([UserRole.SYSTEM_ADMIN, UserRole.IWANA_SUPPORT]);

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING_VERIFICATION: 'Pendiente',
  SUSPENDED: 'Suspendido',
  INACTIVE: 'Inactivo',
};

interface EditUserModalProps {
  isOpen: boolean;
  user: InternalUser;
  onClose: () => void;
  onSubmit: (dto: UpdateInternalUserDto) => Promise<void>;
  onEmailChanged?: () => void;
  isSubmitting: boolean;
  error: string | null;
}

function mapError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Tu sesion expiró. Inicia sesion nuevamente.';
    if (err.status === 403) return 'No tienes permisos para gestionar usuarios.';
    if (err.status === 409) return err.message;
    return err.message;
  }
  return 'No fue posible completar la operacion. Intenta de nuevo.';
}

const inputClass = [
  'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
  'text-gray-900 placeholder:text-gray-400',
  'transition-colors focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
  'dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary',
].join(' ');

export function EditUserModal({
  isOpen,
  user,
  onClose,
  onSubmit,
  onEmailChanged,
  isSubmitting,
  error,
}: EditUserModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailToConfirm, setEmailToConfirm] = useState<string | null>(null);

  // Estados para restablecimiento de contrasena
  const [resetPasswordText, setResetPasswordText] = useState('');
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      email: user.email,
      status: user.status,
      role: user.role,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: user.phone ?? '',
      jobTitle: user.jobTitle ?? '',
      documentType: user.documentType ?? '',
      documentNumber: user.documentNumber ?? '',
      mfaRequired: user.mfaRequired,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        email: user.email,
        status: user.status,
        role: user.role,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        phone: user.phone ?? '',
        jobTitle: user.jobTitle ?? '',
        documentType: user.documentType ?? '',
        documentNumber: user.documentNumber ?? '',
        mfaRequired: user.mfaRequired,
      });
      setServerError(null);
      setEmailError(null);
      setEmailToConfirm(null);
      setResetPasswordText('');
      setResetPasswordResult(null);
      setResetPasswordError(null);
      setCopied(false);
    }
  }, [isOpen, user, reset]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  const onFormSubmit = async (values: EditUserFormValues) => {
    setServerError(null);
    const dto: UpdateInternalUserDto = {};
    if (values.status && values.status !== user.status) dto.status = values.status;
    if (values.role && values.role !== user.role) dto.role = values.role;
    if (values.firstName?.trim() !== (user.firstName ?? ''))
      dto.firstName = values.firstName?.trim() || undefined;
    if (values.lastName?.trim() !== (user.lastName ?? ''))
      dto.lastName = values.lastName?.trim() || undefined;
    if (values.phone?.trim() !== (user.phone ?? '')) dto.phone = values.phone?.trim() || undefined;
    if (values.jobTitle?.trim() !== (user.jobTitle ?? ''))
      dto.jobTitle = values.jobTitle?.trim() || undefined;
    if (values.documentType !== user.documentType)
      dto.documentType = values.documentType || undefined;
    // Persistir cambio de numero de documento (antes se mostraba en UI pero no se enviaba al backend)
    if (values.documentNumber?.trim() !== (user.documentNumber ?? ''))
      dto.documentNumber = values.documentNumber?.trim() || undefined;

    if (Object.keys(dto).length === 0) {
      onClose();
      return;
    }

    await onSubmit(dto);
  };

  const handleSaveEmail = async (email: string) => {
    if (email === user.email) return;
    setEmailError(null);
    setIsSavingEmail(true);
    try {
      // El admin cambia el email sin necesidad de contraseña propia
      await usersApi.changeEmail(user.id, { email });
      onEmailChanged?.();
    } catch (err: unknown) {
      setEmailError(mapError(err));
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleResetPassword = async () => {
    setResetPasswordError(null);
    setResetPasswordResult(null);
    setIsResettingPassword(true);
    try {
      const result = await usersApi.resetPassword(user.id, {
        password: resetPasswordText || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setResetPasswordResult(result.temporaryPassword);
      setResetPasswordText('');
    } catch (err: unknown) {
      setResetPasswordError(mapError(err));
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleCopyPassword = async () => {
    if (resetPasswordResult) {
      await navigator.clipboard.writeText(resetPasswordResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SYSTEM_ADMIN;
  const hasPlatformRole = PLATFORM_ROLES.has(user.role as UserRole);
  const isProtectedRole = isAdmin || hasPlatformRole;
  const tenantAssignableRoles = Object.values(UserRole).filter((r) => !PLATFORM_ROLES.has(r));
  const getRoleLabel = (role: string) => {
    if (role === UserRole.SYSTEM_ADMIN) return 'Admin Plataforma';
    if (role === UserRole.IWANA_SUPPORT) return 'Soporte iWana';
    return ROLE_LABELS[role] ?? role;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
    >
      <div className="relative w-full max-w-lg mx-4 rounded-2xl bg-white border border-gray-200 p-6 shadow-xl dark:bg-dark-surface-2 dark:border-dark-border max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2
              id="edit-user-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Editar usuario
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
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
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-4">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            {/*
              Correo electronico: siempre ancho completo
            */}
            <div className="col-span-full">
              <label
                htmlFor="edit-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Correo electronico
              </label>
              <div className="flex items-center gap-2">
                {errors.email ? (
                  <input
                    id="edit-email"
                    type="email"
                    disabled={isSubmitting}
                    {...register('email')}
                    className={inputClass + ' flex-1'}
                    aria-invalid="true"
                  />
                ) : (
                  <input
                    id="edit-email"
                    type="email"
                    disabled={isSubmitting}
                    {...register('email')}
                    className={inputClass + ' flex-1'}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    const email =
                      (document.getElementById('edit-email') as HTMLInputElement)?.value ?? '';
                    if (email === user.email) return;
                    setEmailToConfirm(email);
                  }}
                  disabled={isSubmitting || isSavingEmail}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-iwana-primary px-4 py-2 text-sm font-medium text-white hover:bg-iwana-primary-600 disabled:opacity-50 transition-colors shrink-0 dark:bg-iwana-primary-400 dark:hover:bg-iwana-primary-300"
                >
                  {isSavingEmail ? 'Guardando...' : 'Restablecer'}
                </button>
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.email.message}
                </p>
              )}
              {emailError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailError}</p>
              )}
            </div>

            {/*
              Confirmacion de cambio de email
            */}
            {emailToConfirm && (
              <div className="col-span-full rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Confirmar restablecimiento de email
                  </p>
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                  Estás a punto de cambiar el email de <strong>{user.email}</strong> a{' '}
                  <strong>{emailToConfirm}</strong>. A partir de ahora, el inicio de sesion se hara
                  con el nuevo email.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEmailToConfirm(null)}
                    className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSaveEmail(emailToConfirm);
                      setEmailToConfirm(null);
                    }}
                    disabled={isSavingEmail}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors dark:bg-amber-500 dark:hover:bg-amber-400"
                  >
                    {isSavingEmail ? 'Guardando...' : 'Confirmar restablecimiento'}
                  </button>
                </div>
              </div>
            )}

            {/*
              Estado y rol en 2 columnas
            */}
            <div>
              <label
                htmlFor="edit-status"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Estado
              </label>
              <select
                id="edit-status"
                disabled={isSubmitting || isProtectedRole}
                {...register('status')}
                className={inputClass + ' cursor-not-allowed'}
                title={
                  isProtectedRole ? 'No puedes cambiar el estado de usuarios protegidos' : undefined
                }
              >
                {Object.values(UserStatus).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] ?? s}
                  </option>
                ))}
              </select>
              {isProtectedRole && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No editable para roles protegidos
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-role"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Rol
              </label>
              <select
                id="edit-role"
                disabled={isSubmitting || isProtectedRole}
                {...register('role')}
                className={inputClass + ' cursor-not-allowed'}
                title={
                  isProtectedRole ? 'No puedes cambiar el rol de usuarios protegidos' : undefined
                }
              >
                {PLATFORM_ROLES.has(user.role as UserRole) && (
                  <option value={user.role}>{getRoleLabel(user.role)}</option>
                )}
                {tenantAssignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {getRoleLabel(r)}
                  </option>
                ))}
              </select>
              {isProtectedRole && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No editable para roles protegidos
                </p>
              )}
            </div>

            {/*
              Cargo y nombre en 2 columnas
            */}
            <div>
              <label
                htmlFor="edit-jobTitle"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Cargo
              </label>
              <input
                id="edit-jobTitle"
                type="text"
                disabled={isSubmitting}
                {...register('jobTitle')}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="edit-firstName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Nombre
              </label>
              <input
                id="edit-firstName"
                type="text"
                disabled={isSubmitting}
                {...register('firstName')}
                className={inputClass}
              />
            </div>

            {/*
              Apellido y telefono en 2 columnas
            */}
            <div>
              <label
                htmlFor="edit-lastName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Apellido
              </label>
              <input
                id="edit-lastName"
                type="text"
                disabled={isSubmitting}
                {...register('lastName')}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="edit-phone"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Telefono
              </label>
              <input
                id="edit-phone"
                type="tel"
                disabled={isSubmitting}
                {...register('phone')}
                className={inputClass}
              />
              {errors.phone && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {errors.phone.message}
                </p>
              )}
            </div>

            {/*
              Tipo de documento y numero de documento en 2 columnas
            */}
            <div>
              <label
                htmlFor="edit-documentType"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Tipo de documento
              </label>
              <select
                id="edit-documentType"
                disabled={isSubmitting}
                {...register('documentType')}
                className={inputClass}
              >
                <option value="">Selecciona</option>
                {Object.values(DocumentType).map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="edit-documentNumber"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Numero de documento
              </label>
              <input
                id="edit-documentNumber"
                type="text"
                placeholder="123456789"
                disabled={isSubmitting}
                {...register('documentNumber')}
                className={inputClass}
              />
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

            {/*
              Separador
            */}
            <div className="col-span-full">
              <hr className="border-gray-200 dark:border-dark-border" />
            </div>

            {/*
              Restablecer contrasena: ancho completo
            */}
            <div className="col-span-full">
              <label
                htmlFor="reset-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Restablecer contrasena
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Ingresa una nueva contrasena (min 10 caracteres) o deja en blanco para generar una
                temporal.
              </p>
              <div className="flex items-center gap-2">
                <input
                  id="reset-password"
                  type="password"
                  value={resetPasswordText}
                  onChange={(e) => setResetPasswordText(e.target.value)}
                  disabled={isResettingPassword}
                  placeholder="Minimo 10 caracteres"
                  className={inputClass + ' flex-1'}
                />
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={
                    isResettingPassword ||
                    (resetPasswordText.length > 0 && resetPasswordText.length < 10)
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors shrink-0 dark:bg-amber-500 dark:hover:bg-amber-400"
                >
                  {isResettingPassword ? (
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
                      Restableciendo...
                    </>
                  ) : (
                    'Restablecer'
                  )}
                </button>
              </div>
              {resetPasswordText.length > 0 && resetPasswordText.length < 10 && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">Minimo 10 caracteres</p>
              )}
              {resetPasswordError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{resetPasswordError}</p>
              )}
            </div>

            {/*
              Resultado de contrasena
            */}
            {resetPasswordResult && (
              <div className="col-span-full rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-2 uppercase tracking-wide">
                  Nueva contrasena
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-white px-4 py-3 text-base font-mono font-bold text-gray-900 border border-green-200 dark:bg-dark-surface-3 dark:text-white dark:border-green-700 tracking-wider">
                    {resetPasswordResult}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-dark-surface-3 dark:text-green-300 dark:hover:bg-green-900/30 transition-colors shrink-0"
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
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                  El usuario debera cambiar esta contrasena al proximo inicio de sesion.
                </p>
              </div>
            )}
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
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
