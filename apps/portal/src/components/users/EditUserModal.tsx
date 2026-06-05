// apps/portal/src/components/users/EditUserModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Copy, PencilLine, ShieldAlert, X } from 'lucide-react';
import { type AccessPermissionKey, DocumentType, UserRole } from '@iwana/shared';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@iwana/ui';
import {
  usersApi,
  type AccessPermissionsCatalog,
  type AccessProfileView,
  type InternalUser,
  type UpdateInternalUserDto,
  ApiError,
} from '@/lib/api-client';
import {
  getPortalUserRoleLabel,
  getPortalUserStatusLabel,
  PORTAL_PLATFORM_ROLES,
  PORTAL_TENANT_ASSIGNABLE_ROLES,
  PORTAL_USER_STATUSES,
} from '@/lib/user-labels';
import { PortalAlert } from '@/components/shared/portal-ui';
import { CompanyRolesAssignmentSection } from './CompanyRolesAssignmentSection';

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

interface EditUserModalProps {
  isOpen: boolean;
  user: InternalUser;
  onClose: () => void;
  onSubmit: (dto: UpdateInternalUserDto, companyRoleIds: string[]) => Promise<void>;
  onEmailChanged?: () => void;
  isSubmitting: boolean;
  error: string | null;
  accessCatalog: AccessPermissionsCatalog | null;
  availableProfiles: AccessProfileView[];
  initialCompanyRoleIds: string[];
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
  'flex h-11 w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-2 text-sm',
  'text-gray-900 placeholder:text-gray-400',
  'transition-all focus:outline-none focus:ring-2 focus:ring-iwana-secondary/35 focus:border-iwana-secondary focus:bg-white',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
  'dark:placeholder:text-gray-500 dark:focus:ring-iwana-secondary/25 dark:focus:border-iwana-secondary',
].join(' ');

export function EditUserModal({
  isOpen,
  user,
  onClose,
  onSubmit,
  onEmailChanged,
  isSubmitting,
  error,
  accessCatalog,
  availableProfiles,
  initialCompanyRoleIds,
}: EditUserModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailToConfirm, setEmailToConfirm] = useState<string | null>(null);
  const [selectedCompanyRoleIds, setSelectedCompanyRoleIds] =
    useState<string[]>(initialCompanyRoleIds);

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
    watch,
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
      setSelectedCompanyRoleIds(initialCompanyRoleIds);
    }
  }, [initialCompanyRoleIds, isOpen, user, reset]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  const selectedBaseRole = watch('role') as UserRole | undefined;

  useEffect(() => {
    if (!selectedBaseRole) {
      setSelectedCompanyRoleIds([]);
      return;
    }

    // Guard: si los perfiles aun no cargaron no filtrar la seleccion actual; de lo contrario
    // un fallo de red limpiaria involuntariamente los roles ya asignados al usuario.
    if (availableProfiles.length === 0) return;

    setSelectedCompanyRoleIds((current) =>
      current.filter((profileId) =>
        availableProfiles.some(
          (profile) =>
            profile.id === profileId &&
            profile.isActive &&
            profile.baseRoleConstraint === selectedBaseRole,
        ),
      ),
    );
  }, [availableProfiles, selectedBaseRole]);

  const onFormSubmit = async (values: EditUserFormValues) => {
    setServerError(null);
    const dto: UpdateInternalUserDto = {};
    const normalizedInitialCompanyRoleIds = [...initialCompanyRoleIds].sort();
    const normalizedSelectedCompanyRoleIds = [...selectedCompanyRoleIds].sort();
    const companyRolesChanged =
      normalizedInitialCompanyRoleIds.join('|') !== normalizedSelectedCompanyRoleIds.join('|');

    if (values.status && values.status !== user.status) dto.status = values.status;
    if (values.role && values.role !== user.role) dto.role = values.role;
    if (values.firstName?.trim() !== (user.firstName ?? ''))
      dto.firstName = values.firstName?.trim() || undefined;
    if (values.lastName?.trim() !== (user.lastName ?? ''))
      dto.lastName = values.lastName?.trim() || undefined;
    if (values.phone?.trim() !== (user.phone ?? '')) {
      const raw = values.phone?.trim().replace(/\s/g, '') ?? '';
      // Normalizar a E.164 con prefijo Colombia si el usuario no lo incluyó
      dto.phone = raw ? (raw.startsWith('+') ? raw : `+57${raw}`) : undefined;
    }
    if (values.jobTitle?.trim() !== (user.jobTitle ?? ''))
      dto.jobTitle = values.jobTitle?.trim() || undefined;
    if (values.documentType !== user.documentType)
      dto.documentType = values.documentType || undefined;
    // Persistir cambio de numero de documento (antes se mostraba en UI pero no se enviaba al backend)
    if (values.documentNumber?.trim() !== (user.documentNumber ?? ''))
      dto.documentNumber = values.documentNumber?.trim() || undefined;

    if (Object.keys(dto).length === 0 && !companyRolesChanged) {
      onClose();
      return;
    }

    await onSubmit(dto, normalizedSelectedCompanyRoleIds);
  };

  function toggleCompanyRole(profileId: string) {
    setSelectedCompanyRoleIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    );
  }

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
  const hasPlatformRole = PORTAL_PLATFORM_ROLES.has(user.role as UserRole);
  const isProtectedRole = isAdmin || hasPlatformRole;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent aria-labelledby="edit-user-title">
        <DialogHeader className="mb-6 flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 flex-1">
            <p className="portal-eyebrow">Perfil interno</p>
            <DialogTitle id="edit-user-title" className="mt-1">
              Editar usuario
            </DialogTitle>
            <DialogDescription className="mt-1 leading-6">{user.email}</DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-gray-400 transition-colors hover:bg-iwana-surface-soft hover:text-gray-700 dark:hover:bg-dark-surface-3 dark:hover:text-gray-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
              <PencilLine className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                Ajustes del colaborador
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Puedes modificar perfil, permisos y restablecer credenciales desde una sola vista
                controlada.
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-3/60">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                Perfil y accesos
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                Actualiza la identidad operativa, la categoría base y los perfiles de acceso del
                colaborador.
              </p>
            </div>

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
                <PortalAlert
                  className="col-span-full"
                  variant="warning"
                  title="Confirmar restablecimiento de email"
                  description={
                    <>
                      Estás a punto de cambiar el email de <strong>{user.email}</strong> a{' '}
                      <strong>{emailToConfirm}</strong>. A partir de ahora, el inicio de sesion se
                      hara con el nuevo email.
                    </>
                  }
                  icon={ShieldAlert}
                  action={
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEmailToConfirm(null)}
                        className="inline-flex items-center justify-center rounded-2xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200 dark:hover:bg-dark-surface-4"
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
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-400"
                      >
                        {isSavingEmail ? 'Guardando...' : 'Confirmar restablecimiento'}
                      </button>
                    </div>
                  }
                />
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
                    isProtectedRole
                      ? 'No puedes cambiar el estado de usuarios protegidos'
                      : undefined
                  }
                >
                  {PORTAL_USER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getPortalUserStatusLabel(status)}
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
                  Categoría base
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
                  {PORTAL_PLATFORM_ROLES.has(user.role as UserRole) && (
                    <option value={user.role}>{getPortalUserRoleLabel(user.role)}</option>
                  )}
                  {PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {getPortalUserRoleLabel(role)}
                    </option>
                  ))}
                </select>
                {isProtectedRole && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    No editable para roles protegidos
                  </p>
                )}
              </div>

              <div className="col-span-full">
                <CompanyRolesAssignmentSection
                  baseRole={selectedBaseRole ?? null}
                  availableProfiles={availableProfiles}
                  selectedProfileIds={selectedCompanyRoleIds}
                  compatibilityMatrix={
                    accessCatalog?.compatibilityMatrix ??
                    ({} as Record<UserRole, AccessPermissionKey[]>)
                  }
                  catalog={accessCatalog}
                  onToggleProfile={toggleCompanyRole}
                />
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
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-900/10">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                Credenciales y acceso
              </p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
                Usa este bloque solo para restablecer una contraseña puntual o entregar una temporal
                controlada.
              </p>
            </div>

            <div className="space-y-4">
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

            {resetPasswordResult && (
              <div className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                  Nueva contrasena
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-base font-mono font-bold tracking-wider text-gray-900 dark:border-emerald-700 dark:bg-dark-surface-3 dark:text-white">
                    {resetPasswordResult}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-dark-surface-3 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
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
                <p className="mt-2 text-xs text-green-600 dark:text-green-400">
                  El usuario debera cambiar esta contrasena al proximo inicio de sesion.
                </p>
              </div>
            )}
          </section>

          {serverError && (
            <PortalAlert
              variant="error"
              title="No fue posible guardar los cambios"
              description={serverError}
            />
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
              disabled={
                isSubmitting ||
                (!isDirty &&
                  [...initialCompanyRoleIds].sort().join('|') ===
                    [...selectedCompanyRoleIds].sort().join('|'))
              }
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
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
