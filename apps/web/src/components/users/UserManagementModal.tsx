'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Select } from '@iwana/ui';
import { ApiError, usersApi, type UpdateUserPayload, type UserListItem } from '@/lib/api-client';
import {
  getWebUserRoleLabel,
  getWebUserStatusLabel,
  WEB_USER_ROLE_OPTIONS,
  WEB_USER_STATUS_OPTIONS,
} from '@/lib/user-labels';
import {
  BadgePlus,
  CheckCircle2,
  CircleAlert,
  Clock3,
  KeyRound,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_SUCCESS_CLASS,
  FORM_ERROR_CLASS,
  FORM_HELP_CLASS,
  FORM_INPUT_CLASS,
  FORM_LABEL_CLASS,
  FORM_MICROCOPY_CLASS,
  FORM_SECTION_CARD_CLASS,
} from '@/lib/form-styles';

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
  { value: 'CE', label: 'Cédula de Extranjería (CE)' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT_PERSONA', label: 'NIT Persona Natural' },
];

const DOCUMENT_TYPE_VALUES = new Set(DOCUMENT_TYPES.map((item) => item.value));

const updateUserSchema = z.object({
  role: z.string().min(1),
  status: z.string().min(1),
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
  jobTitle: z.string().max(150).optional().or(z.literal('')),
  documentType: z.enum(['CC', 'CE', 'PASAPORTE', 'NIT_PERSONA']).optional().or(z.literal('')),
  documentNumber: z.string().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  avatarUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  mfaRequired: z.boolean().default(false),
});

type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

const MODAL_PANEL_CLASS =
  'w-full max-w-3xl overflow-y-auto rounded-[28px] border border-gray-100 bg-white p-5 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none max-h-[90vh] sm:p-6';

const DOCUMENT_TYPE_OPTIONS = [
  { value: '', label: 'Sin definir' },
  ...DOCUMENT_TYPES.map((dt) => ({ value: dt.value, label: dt.label })),
];

export function UserManagementModal({
  open,
  tenantSlug,
  tenantName,
  user,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  tenantSlug: string;
  tenantName?: string;
  user: UserListItem | null;
  onClose: () => void;
  onSaved: (user: UserListItem) => void;
  onDeleted: (userId: string) => void;
}) {
  const [detail, setDetail] = useState<UserListItem | null>(user);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingLoginEmail, setIsSavingLoginEmail] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [loginEmailDraft, setLoginEmailDraft] = useState('');
  const [generatedTemporaryPassword, setGeneratedTemporaryPassword] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      role: user?.role ?? 'NOC',
      status: user?.status ?? 'ACTIVE',
      firstName: '',
      lastName: '',
      phone: '',
      jobTitle: '',
      documentType: '',
      documentNumber: '',
      avatarUrl: '',
      mfaRequired: user?.mfaRequired ?? false,
    },
  });

  // Carga detalle del usuario al abrir el modal o al cambiar de usuario.
  // Dependencia en user?.id (no el objeto completo) para evitar recargar cuando
  // el padre actualiza la referencia del objeto tras guardar (onSaved → setSelectedUser).
  useEffect(() => {
    if (!open || !tenantSlug || !user) return;

    const loadDetail = async () => {
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      try {
        const current = await usersApi.getOne(tenantSlug, user.id);
        setDetail(current);
        setLoginEmailDraft(current.email);
        setGeneratedTemporaryPassword(null);
        reset(mapUserToForm(current));
        // documentNumber nunca retorna del backend (PII sensible — Ley 1581)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No fue posible cargar el detalle.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetail();
    // user?.id en deps: solo recargar cuando cambia el usuario seleccionado, no su referencia
  }, [open, tenantSlug, user?.id]);

  // Limpiar al cerrar
  useEffect(() => {
    if (!open) {
      setDetail(null);
      reset({
        role: 'NOC',
        status: 'ACTIVE',
        firstName: '',
        lastName: '',
        phone: '',
        jobTitle: '',
        documentType: '',
        documentNumber: '',
        avatarUrl: '',
        mfaRequired: false,
      });
      setError(null);
      setSuccess(null);
      setLoginEmailDraft('');
      setGeneratedTemporaryPassword(null);
    }
  }, [open, reset]);

  if (!open || !user) return null;

  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const fullName = firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;
  const currentRole = detail?.role ?? user.role;
  const currentStatus = detail?.status ?? user.status;

  const handleSave = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const payload: UpdateUserPayload = {
        role: values.role,
        status: values.status,
        ...(values.firstName !== undefined ? { firstName: values.firstName } : {}),
        ...(values.lastName !== undefined ? { lastName: values.lastName } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.jobTitle !== undefined ? { jobTitle: values.jobTitle } : {}),
        ...(values.documentType ? { documentType: values.documentType } : {}),
        ...(values.documentNumber ? { documentNumber: values.documentNumber } : {}),
        ...(values.avatarUrl ? { avatarUrl: values.avatarUrl } : {}),
        mfaRequired: values.mfaRequired,
      };
      const updated = await usersApi.update(tenantSlug, user.id, payload, crypto.randomUUID());
      setDetail(updated);
      reset(mapUserToForm(updated));
      setSuccess('Usuario actualizado correctamente.');
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible actualizar el usuario.');
    } finally {
      setIsSaving(false);
    }
  });

  const handleDelete = async () => {
    setError(null);
    setSuccess(null);
    setIsDeleting(true);
    try {
      await usersApi.remove(tenantSlug, user.id);
      onDeleted(user.id);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible eliminar el usuario.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveLoginEmail = async () => {
    if (!detail) {
      return;
    }

    const normalizedEmail = loginEmailDraft.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('El correo de acceso es obligatorio.');
      return;
    }

    if (normalizedEmail === detail.email.toLowerCase().trim()) {
      setSuccess('El correo de acceso no tuvo cambios.');
      setError(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSavingLoginEmail(true);

    try {
      const updated = await usersApi.changeLoginEmailAsAdmin(
        tenantSlug,
        user.id,
        {
          email: normalizedEmail,
          syncCompanyContactEmail: true,
        },
        crypto.randomUUID(),
      );

      setDetail(updated);
      setLoginEmailDraft(updated.email);
      setSuccess('Correo de acceso actualizado correctamente.');
      onSaved(updated);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No fue posible actualizar el correo de acceso.',
      );
    } finally {
      setIsSavingLoginEmail(false);
    }
  };

  const handleResetPassword = async () => {
    if (!detail) {
      return;
    }

    setError(null);
    setSuccess(null);
    setGeneratedTemporaryPassword(null);
    setIsResettingPassword(true);

    try {
      const result = await usersApi.resetPassword(tenantSlug, user.id, {}, crypto.randomUUID());

      const updated: UserListItem = {
        ...detail,
        passwordResetRequired: true,
      };

      setDetail(updated);
      setGeneratedTemporaryPassword(result.temporaryPassword);
      setSuccess('Se generó una contraseña temporal para el usuario.');
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible reiniciar la contraseña.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-management-modal-title"
    >
      <div className={MODAL_PANEL_CLASS}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 dark:border-dark-border">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              <BadgePlus className="h-4 w-4" aria-hidden="true" />
              <span>Gestión operativa</span>
            </div>
            <h3
              id="user-management-modal-title"
              className="mt-2 text-xl font-semibold text-iwana-primary dark:text-white"
            >
              {fullName ?? 'Gestión de usuario'}
            </h3>
            <p className={`mt-1 ${FORM_MICROCOPY_CLASS}`}>
              Rol actual: {getWebUserRoleLabel(currentRole)} · Estado:{' '}
              {getWebUserStatusLabel(currentStatus)}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {error && (
          <div role="alert" className={`${FORM_ALERT_ERROR_CLASS} mt-4`}>
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div className={`${FORM_ALERT_SUCCESS_CLASS} mt-4`}>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{success}</p>
          </div>
        )}

        {isLoading || !detail ? (
          <div className={`${FORM_SECTION_CARD_CLASS} mt-4`}>
            <p className="text-sm text-gray-500">Cargando detalle...</p>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={handleSave}>
            {/* Info de seguridad */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className={FORM_SECTION_CARD_CLASS}>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Seguridad y acceso</span>
                </div>
                <p>
                  <strong>Empresa:</strong>{' '}
                  <span>{tenantName?.trim() || 'Empresa sin nombre'}</span>
                </p>
                <p>
                  <strong>MFA:</strong> {detail.mfaEnabled ? 'Activo' : 'Inactivo'}
                </p>
                <p>
                  <strong>Correo verificado:</strong> {detail.emailVerified ? 'Sí' : 'No'}
                </p>
                <p>
                  <strong>Restablecimiento de clave:</strong>{' '}
                  {detail.passwordResetRequired ? 'Pendiente' : 'No'}
                </p>
              </div>
              <div className={FORM_SECTION_CARD_CLASS}>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  <span>Trazabilidad</span>
                </div>
                <p>
                  <strong>Creado:</strong> {new Date(detail.createdAt).toLocaleString('es-CO')}
                </p>
                <p>
                  <strong>Actualizado:</strong> {new Date(detail.updatedAt).toLocaleString('es-CO')}
                </p>
                <p>
                  <strong>Último acceso:</strong>{' '}
                  {detail.lastLoginAt
                    ? new Date(detail.lastLoginAt).toLocaleString('es-CO')
                    : 'Nunca'}
                </p>
              </div>
            </div>

            {/* Rol y Estado */}
            <div className={`${FORM_SECTION_CARD_CLASS} grid gap-3 md:grid-cols-2`}>
              <div>
                <label htmlFor="um-role" className={`block ${FORM_LABEL_CLASS}`}>
                  Rol
                </label>
                <Controller
                  control={control}
                  name="role"
                  render={({ field, fieldState }) => (
                    <Select
                      id="um-role"
                      options={WEB_USER_ROLE_OPTIONS}
                      value={field.value}
                      name={field.name}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      {...(fieldState.error ? { error: fieldState.error.message } : {})}
                    />
                  )}
                />
              </div>
              <div>
                <label htmlFor="um-status" className={`block ${FORM_LABEL_CLASS}`}>
                  Estado
                </label>
                <Controller
                  control={control}
                  name="status"
                  render={({ field, fieldState }) => (
                    <Select
                      id="um-status"
                      options={WEB_USER_STATUS_OPTIONS}
                      value={field.value}
                      name={field.name}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      {...(fieldState.error ? { error: fieldState.error.message } : {})}
                    />
                  )}
                />
              </div>
            </div>

            {/* Seguridad */}
            <div className={FORM_SECTION_CARD_CLASS}>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                Seguridad
              </p>
              <label className="mt-3 flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary/30 dark:border-dark-border dark:bg-dark-surface-3"
                  {...register('mfaRequired')}
                />
                Requerir verificación en dos pasos (MFA)
              </label>
              {detail?.mfaEnabled && (
                <p className={`mt-2 ${FORM_MICROCOPY_CLASS}`}>
                  MFA actualmente configurado. Desactivar este toggle no elimina el MFA ya
                  configurado.
                </p>
              )}
            </div>

            {/* Perfil personal */}
            <div className={`${FORM_SECTION_CARD_CLASS} space-y-3`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Datos de perfil
                </p>
                <p className={`mt-1 ${FORM_HELP_CLASS}`}>
                  Edita la información visible y operativa del usuario.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="um-firstname" className={`block ${FORM_LABEL_CLASS}`}>
                    Nombres
                  </label>
                  <input
                    id="um-firstname"
                    className={FORM_INPUT_CLASS}
                    placeholder="Carlos"
                    {...register('firstName')}
                  />
                  {errors.firstName && (
                    <p className={FORM_ERROR_CLASS}>{errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="um-lastname" className={`block ${FORM_LABEL_CLASS}`}>
                    Apellidos
                  </label>
                  <input
                    id="um-lastname"
                    className={FORM_INPUT_CLASS}
                    placeholder="García"
                    {...register('lastName')}
                  />
                  {errors.lastName && <p className={FORM_ERROR_CLASS}>{errors.lastName.message}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="um-jobtitle" className={`block ${FORM_LABEL_CLASS}`}>
                  Cargo
                </label>
                <input
                  id="um-jobtitle"
                  className={FORM_INPUT_CLASS}
                  placeholder="Técnico de soporte"
                  {...register('jobTitle')}
                />
                {errors.jobTitle && <p className={FORM_ERROR_CLASS}>{errors.jobTitle.message}</p>}
              </div>

              <div>
                <label htmlFor="um-phone" className={`block ${FORM_LABEL_CLASS}`}>
                  Teléfono (E.164)
                </label>
                <input
                  id="um-phone"
                  type="tel"
                  className={FORM_INPUT_CLASS}
                  placeholder="+573001234567"
                  {...register('phone')}
                />
                {errors.phone && <p className={FORM_ERROR_CLASS}>{errors.phone.message}</p>}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="um-doctype" className={`block ${FORM_LABEL_CLASS}`}>
                    Tipo de documento
                  </label>
                  <Controller
                    control={control}
                    name="documentType"
                    render={({ field, fieldState }) => (
                      <Select
                        id="um-doctype"
                        options={DOCUMENT_TYPE_OPTIONS}
                        value={field.value ?? ''}
                        name={field.name}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                        {...(fieldState.error ? { error: fieldState.error.message } : {})}
                      />
                    )}
                  />
                </div>
                <div>
                  <label htmlFor="um-docnum" className={`block ${FORM_LABEL_CLASS}`}>
                    N.° de documento <span className={FORM_MICROCOPY_CLASS}>(se cifra)</span>
                  </label>
                  <input
                    id="um-docnum"
                    className={FORM_INPUT_CLASS}
                    placeholder="Dejar vacío para no modificar"
                    {...register('documentNumber')}
                  />
                  {errors.documentNumber && (
                    <p className={FORM_ERROR_CLASS}>{errors.documentNumber.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="um-avatar" className={`block ${FORM_LABEL_CLASS}`}>
                  URL de avatar
                </label>
                <input
                  id="um-avatar"
                  type="url"
                  className={FORM_INPUT_CLASS}
                  placeholder="https://..."
                  {...register('avatarUrl')}
                />
                {errors.avatarUrl && <p className={FORM_ERROR_CLASS}>{errors.avatarUrl.message}</p>}
              </div>
            </div>

            {/* Credenciales de acceso */}
            <div className={`${FORM_SECTION_CARD_CLASS} space-y-3`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Credenciales de acceso
                </p>
                <p className={`mt-1 ${FORM_HELP_CLASS}`}>
                  Gestiona el correo de ingreso y genera una contraseña temporal cuando sea
                  necesario.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div>
                  <label htmlFor="um-login-email" className={`block ${FORM_LABEL_CLASS}`}>
                    Correo de acceso
                  </label>
                  <input
                    id="um-login-email"
                    type="email"
                    className={FORM_INPUT_CLASS}
                    value={loginEmailDraft}
                    onChange={(event) => setLoginEmailDraft(event.target.value)}
                    placeholder="usuario@empresa.com"
                    autoComplete="off"
                  />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveLoginEmail}
                  loading={isSavingLoginEmail}
                >
                  Actualizar correo de acceso
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetPassword}
                  loading={isResettingPassword}
                >
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Generar contraseña temporal
                </Button>
                <p className={FORM_MICROCOPY_CLASS}>
                  El usuario deberá cambiarla en su siguiente ingreso.
                </p>
              </div>

              {generatedTemporaryPassword && (
                <div className="rounded-2xl border border-amber-300/80 bg-amber-50/80 p-4 dark:border-amber-700/70 dark:bg-amber-950/20">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-800 dark:text-amber-200">
                    Contraseña temporal generada
                  </p>
                  <p
                    className="mt-2 select-all rounded-xl border border-amber-300/80 bg-white/90 px-4 py-3 font-mono text-base font-semibold tracking-[0.2em] text-amber-900 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-amber-200"
                    aria-label="Contraseña temporal generada"
                  >
                    {generatedTemporaryPassword}
                  </p>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 dark:border-dark-border">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                size="lg"
                loading={isDeleting}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Eliminar usuario
              </Button>
              <Button type="submit" size="lg" loading={isSaving}>
                Guardar cambios
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function mapUserToForm(user: UserListItem): UpdateUserFormValues {
  return {
    role: user.role,
    status: user.status,
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    phone: user.phone ?? '',
    jobTitle: user.jobTitle ?? '',
    documentType: normalizeDocumentType(user.documentType),
    documentNumber: '',
    avatarUrl: user.avatarUrl ?? '',
    mfaRequired: user.mfaRequired ?? false,
  };
}

function normalizeDocumentType(
  value: string | null | undefined,
): UpdateUserFormValues['documentType'] {
  switch (value) {
    case 'CC':
    case 'CE':
    case 'PASAPORTE':
    case 'NIT_PERSONA':
      return value;
    default:
      return '';
  }
}
