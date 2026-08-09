'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import { ApiError, usersApi, type UpdateUserPayload, type UserListItem } from '@/lib/api-client';
import {
  getWebUserRoleLabel,
  getWebUserStatusLabel,
  WEB_USER_ROLE_OPTIONS,
  WEB_USER_ROLES,
  WEB_USER_STATUS_OPTIONS,
  WEB_USER_STATUSES,
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  FORM_ALERT_ERROR_CLASS,
  FORM_ALERT_SUCCESS_CLASS,
  FORM_ALERT_WARNING_CLASS,
  FORM_ERROR_CLASS,
  FORM_HELP_CLASS,
  FORM_INPUT_CLASS,
  FORM_LABEL_CLASS,
  FORM_MICROCOPY_CLASS,
  FORM_SECTION_CARD_CLASS,
} from '@/lib/form-styles';

/** Alineado a USER_PHONE_E164_PATTERN del backend. */
const USER_PHONE_E164_PATTERN = /^\+\d{7,15}$/;

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
  { value: 'CE', label: 'Cédula de Extranjería (CE)' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'NIT_PERSONA', label: 'NIT Persona Natural' },
];

function normalizePhoneE164(raw: string): string {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('+') ? cleaned : `+57${cleaned}`;
}

/**
 * Incluye el campo en el payload solo si tiene contenido o si el usuario lo limpió
 * (el backend interpreta '' como clear vía trim → null).
 */
function optionalChangedTextField(
  next: string | undefined,
  previous: string | null | undefined,
): string | undefined {
  const trimmed = next?.trim() ?? '';
  const prev = previous?.trim() ?? '';
  if (trimmed === prev) {
    return trimmed ? trimmed : undefined;
  }
  return trimmed;
}

const updateUserSchema = z.object({
  role: z.enum(WEB_USER_ROLES),
  status: z.enum(WEB_USER_STATUSES),
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .max(20, 'Máximo 20 caracteres')
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => {
        if (!val?.trim()) return true;
        return USER_PHONE_E164_PATTERN.test(normalizePhoneE164(val));
      },
      { message: 'Usa formato internacional, por ejemplo +573001234567' },
    ),
  jobTitle: z.string().max(150).optional().or(z.literal('')),
  documentType: z.enum(['CC', 'CE', 'PASAPORTE', 'NIT_PERSONA']).optional().or(z.literal('')),
  documentNumber: z.string().max(30, 'Máximo 30 caracteres').optional().or(z.literal('')),
  avatarUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  mfaRequired: z.boolean().default(false),
});

type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

type PendingConfirm = 'delete' | 'resetPassword' | null;

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
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

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
      role: user ? normalizeWebUserRole(user.role) : 'NOC',
      status: user ? normalizeWebUserStatus(user.status) : 'ACTIVE',
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
      setPendingConfirm(null);
    }
  }, [open, reset]);

  if (!open || !user) return null;

  const firstName = watch('firstName');
  const lastName = watch('lastName');
  const fullName = firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null;
  const currentRole = detail?.role ?? user.role;
  const currentStatus = detail?.status ?? user.status;
  const isPrincipalAdmin = detail?.isPrincipalAdmin === true;

  const handleSave = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const normalizedPhone = values.phone ? normalizePhoneE164(values.phone) : '';
      const firstNameValue = optionalChangedTextField(values.firstName, detail?.firstName);
      const lastNameValue = optionalChangedTextField(values.lastName, detail?.lastName);
      const jobTitleValue = optionalChangedTextField(values.jobTitle, detail?.jobTitle);

      const payload: UpdateUserPayload = {
        role: values.role,
        status: values.status,
        ...(firstNameValue !== undefined ? { firstName: firstNameValue } : {}),
        ...(lastNameValue !== undefined ? { lastName: lastNameValue } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        ...(jobTitleValue !== undefined ? { jobTitle: jobTitleValue } : {}),
        ...(values.documentType ? { documentType: values.documentType } : {}),
        ...(values.documentNumber ? { documentNumber: values.documentNumber } : {}),
        ...(values.avatarUrl?.trim() ? { avatarUrl: values.avatarUrl.trim() } : {}),
        mfaRequired: values.mfaRequired,
      };
      const updated = await usersApi.update(tenantSlug, user.id, payload, crypto.randomUUID());
      // Conservar isPrincipalAdmin si la escritura no lo reenvía (defensa en profundidad).
      const nextDetail: UserListItem = {
        ...updated,
        ...(updated.isPrincipalAdmin !== undefined
          ? { isPrincipalAdmin: updated.isPrincipalAdmin }
          : detail?.isPrincipalAdmin !== undefined
            ? { isPrincipalAdmin: detail.isPrincipalAdmin }
            : {}),
      };
      setDetail(nextDetail);
      reset(mapUserToForm(nextDetail));
      setSuccess('Usuario actualizado correctamente.');
      onSaved(nextDetail);
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
      setPendingConfirm(null);
      onDeleted(user.id);
      onClose();
    } catch (err) {
      setPendingConfirm(null);
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
      setPendingConfirm(null);
      onSaved(updated);
    } catch (err) {
      setPendingConfirm(null);
      setError(err instanceof ApiError ? err.message : 'No fue posible reiniciar la contraseña.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const userLabel = fullName ?? detail?.email ?? user.email;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          className="max-w-3xl p-5 sm:p-6"
          aria-labelledby="user-management-modal-title"
        >
          <DialogHeader className="mb-0 flex flex-row items-start justify-between gap-4 space-y-0 border-b border-gray-100 pb-4 dark:border-dark-border">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                <BadgePlus className="h-4 w-4" aria-hidden="true" />
                <span>Gestión operativa</span>
              </div>
              <DialogTitle
                id="user-management-modal-title"
                className="mt-2 text-xl font-semibold text-iwana-primary dark:text-white"
              >
                {fullName ?? 'Gestión de usuario'}
              </DialogTitle>
              <DialogDescription className={`mt-1 ${FORM_MICROCOPY_CLASS}`}>
                Rol actual: {getWebUserRoleLabel(currentRole)} · Estado:{' '}
                {getWebUserStatusLabel(currentStatus)}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cerrar
              </Button>
            </DialogClose>
          </DialogHeader>

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
              {isPrincipalAdmin && (
                <div role="status" className={FORM_ALERT_WARNING_CLASS}>
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p>
                    Esta cuenta es el administrador principal de la empresa. Para eliminar el
                    usuario, cambiar su correo de acceso o modificar su rol o estado, designa antes
                    otro administrador principal. Puedes actualizar el perfil y generar una
                    contraseña temporal.
                  </p>
                </div>
              )}

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
                    <strong>Actualizado:</strong>{' '}
                    {new Date(detail.updatedAt).toLocaleString('es-CO')}
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
              <div className={`${FORM_SECTION_CARD_CLASS} space-y-3`}>
                <div className="grid gap-3 md:grid-cols-2">
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
                          disabled={isPrincipalAdmin}
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
                          disabled={isPrincipalAdmin}
                          {...(fieldState.error ? { error: fieldState.error.message } : {})}
                        />
                      )}
                    />
                  </div>
                </div>
                {isPrincipalAdmin && (
                  <p className={FORM_MICROCOPY_CLASS}>
                    Rol y estado no se pueden cambiar mientras esta cuenta sea el administrador
                    principal de la empresa.
                  </p>
                )}
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
                    {errors.lastName && (
                      <p className={FORM_ERROR_CLASS}>{errors.lastName.message}</p>
                    )}
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
                  <p className={`mt-1 ${FORM_HELP_CLASS}`}>
                    Formato internacional con código de país. Si omites el +, se asume Colombia
                    (+57).
                  </p>
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
                  {errors.avatarUrl && (
                    <p className={FORM_ERROR_CLASS}>{errors.avatarUrl.message}</p>
                  )}
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
                      disabled={isPrincipalAdmin}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveLoginEmail}
                    loading={isSavingLoginEmail}
                    disabled={isPrincipalAdmin}
                  >
                    Actualizar correo de acceso
                  </Button>
                </div>
                {isPrincipalAdmin && (
                  <p className={FORM_MICROCOPY_CLASS}>
                    El correo de acceso del administrador principal no se puede cambiar desde aquí.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPendingConfirm('resetPassword')}
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
                <div className="space-y-1">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setPendingConfirm('delete')}
                    size="default"
                    loading={isDeleting}
                    disabled={isPrincipalAdmin}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Eliminar usuario
                  </Button>
                  {isPrincipalAdmin && (
                    <p className={FORM_MICROCOPY_CLASS}>
                      No se puede eliminar al administrador principal de la empresa.
                    </p>
                  )}
                </div>
                <Button type="submit" size="lg" loading={isSaving}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingConfirm === 'delete'}
        title="Eliminar usuario"
        description={
          <>
            Se eliminará el usuario <strong>{userLabel}</strong> de esta empresa. Perderá el acceso
            de inmediato y la acción no se puede deshacer.
          </>
        }
        confirmLabel="Sí, eliminar usuario"
        isConfirming={isDeleting}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setPendingConfirm(null)}
      />

      <ConfirmDialog
        open={pendingConfirm === 'resetPassword'}
        title="Generar contraseña temporal"
        description={
          <>
            Se invalidará la contraseña actual de <strong>{userLabel}</strong> y se generará una
            clave temporal. El usuario deberá cambiarla en su siguiente ingreso.
          </>
        }
        confirmLabel="Sí, generar contraseña"
        isConfirming={isResettingPassword}
        onConfirm={() => {
          void handleResetPassword();
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </>
  );
}

function mapUserToForm(user: UserListItem): UpdateUserFormValues {
  return {
    role: normalizeWebUserRole(user.role),
    status: normalizeWebUserStatus(user.status),
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

function normalizeWebUserRole(value: string): UpdateUserFormValues['role'] {
  return (WEB_USER_ROLES as readonly string[]).includes(value)
    ? (value as UpdateUserFormValues['role'])
    : 'NOC';
}

function normalizeWebUserStatus(value: string): UpdateUserFormValues['status'] {
  return (WEB_USER_STATUSES as readonly string[]).includes(value)
    ? (value as UpdateUserFormValues['status'])
    : 'ACTIVE';
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
