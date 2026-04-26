'use client';

import {
  BadgePlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  KeyRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Select } from '@iwana/ui';
import { ApiError, usersApi, type CreateUserPayload, type UserListItem } from '@/lib/api-client';
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

const createUserSchema = z.object({
  // Credenciales
  email: z.string().email('Email inválido'),
  role: z.string().min(1),
  password: z.string().min(10, 'Mínimo 10 caracteres').optional().or(z.literal('')),
  // Perfil (opcionales)
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().max(20, 'Máximo 20 caracteres').optional().or(z.literal('')),
  jobTitle: z.string().max(150).optional().or(z.literal('')),
  documentType: z.enum(['CC', 'CE', 'PASAPORTE', 'NIT_PERSONA']).optional(),
  documentNumber: z.string().max(30).optional().or(z.literal('')),
  avatarUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  mfaRequired: z.boolean().default(false),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

const USER_ROLES = [
  'ADMIN',
  'NOC',
  'SUPPORT',
  'TECHNICIAN',
  'SALES',
  'ACCOUNTANT',
  'HR',
  'SUBSCRIBER',
  'CONTRACTOR',
  'PARTNER',
  'AUDITOR',
  'INVESTOR',
];

const MODAL_PANEL_CLASS =
  'w-full max-w-2xl overflow-y-auto rounded-[28px] border border-gray-100 bg-white p-5 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none max-h-[90vh] sm:p-6';

const accordionTriggerClass =
  'flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition hover:bg-white/70 dark:hover:bg-dark-surface-2/80';

export function UserCreateModal({
  tenantSlug,
  open,
  onClose,
  onCreated,
}: {
  tenantSlug: string;
  open: boolean;
  onClose: () => void;
  onCreated: (user: UserListItem) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  /**
   * Estado de éxito con contraseña temporal.
   * Cuando está presente se muestra la pantalla de confirmación en lugar del formulario.
   * El admin DEBE hacer clic en "Entendido" — así no pierde la clave antes de copiarla.
   */
  const [createdResult, setCreatedResult] = useState<{
    user: UserListItem;
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema) as never,
    defaultValues: { role: 'NOC', password: '', mfaRequired: false },
  });

  useEffect(() => {
    if (!open) {
      setError(null);
      setCreatedResult(null);
      setShowProfile(false);
      reset({ email: '', role: 'NOC', password: '', mfaRequired: false });
    }
  }, [open, reset]);

  if (!open) {
    return null;
  }

  const onSubmit = async (values: CreateUserFormValues) => {
    setError(null);

    try {
      const payload: CreateUserPayload = {
        email: values.email,
        role: values.role,
        ...(values.password ? { password: values.password } : {}),
        ...(values.firstName ? { firstName: values.firstName } : {}),
        ...(values.lastName ? { lastName: values.lastName } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.jobTitle ? { jobTitle: values.jobTitle } : {}),
        ...(values.documentType ? { documentType: values.documentType } : {}),
        ...(values.documentNumber ? { documentNumber: values.documentNumber } : {}),
        ...(values.avatarUrl ? { avatarUrl: values.avatarUrl } : {}),
        mfaRequired: values.mfaRequired ?? false,
      };

      const created = await usersApi.create(tenantSlug, payload, crypto.randomUUID());

      if (created.temporaryPassword) {
        /**
         * Contraseña temporal: NO cerrar el modal todavía.
         * Se muestra la clave en pantalla hasta que el admin confirme que la copió.
         */
        setCreatedResult({
          user: created,
          email: values.email,
          temporaryPassword: created.temporaryPassword,
        });
      } else {
        // El admin asignó su propia contraseña — cerrar directamente
        onCreated(created);
        reset({ email: '', role: values.role, password: '' });
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible crear el usuario.');
    }
  };

  /** El admin confirmó que ya copió la clave temporal — cerrar y refrescar lista */
  const handleConfirmTempPassword = () => {
    if (createdResult) {
      onCreated(createdResult.user);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-create-modal-title"
    >
      <div className={MODAL_PANEL_CLASS}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 dark:border-dark-border">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              <BadgePlus className="h-4 w-4" aria-hidden="true" />
              <span>Operación de plataforma</span>
            </div>
            <h3
              id="user-create-modal-title"
              className="mt-2 text-xl font-semibold text-iwana-primary dark:text-white"
            >
              Crear usuario
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Registra un nuevo operador de plataforma y define si usará contraseña temporal o una
              credencial asignada manualmente.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {/* ── Pantalla de éxito con contraseña temporal ─────────────── */}
        {createdResult ? (
          <div className="mt-5 space-y-4">
            <div className={FORM_ALERT_SUCCESS_CLASS}>
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Usuario creado exitosamente</p>
                <p className="mt-1">
                  <strong>Email:</strong> {createdResult.email}
                </p>
              </div>
            </div>

            <div className={FORM_ALERT_WARNING_CLASS}>
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="w-full">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em]">
                  Contraseña temporal — copia esta clave antes de cerrar
                </p>
                {/* select-all permite seleccionar y copiar con un solo clic */}
                <p
                  className="select-all rounded-2xl border border-amber-300/80 bg-white/90 px-4 py-3 font-mono text-lg font-bold tracking-[0.25em] text-amber-900 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-amber-200"
                  aria-label="Contraseña temporal"
                >
                  {createdResult.temporaryPassword}
                </p>
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                  El usuario deberá cambiar esta contraseña en su primer ingreso al portal.
                </p>
              </div>
            </div>

            <Button type="button" size="lg" onClick={handleConfirmTempPassword}>
              Entendido, cerrar
            </Button>
          </div>
        ) : (
          /* ── Formulario de creación ────────────────────────────────── */
          <>
            {error && (
              <div role="alert" className={`${FORM_ALERT_ERROR_CLASS} mt-4`}>
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>{error}</p>
              </div>
            )}

            <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {/* ── Credenciales ────────────────────────────────────────── */}
              <div className={FORM_SECTION_CARD_CLASS}>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Credenciales
                </p>
                <p className={`mt-1 ${FORM_HELP_CLASS}`}>
                  Define acceso, rol operativo y si el usuario deberá completar MFA en su primer
                  ingreso.
                </p>

                <div className="mt-4">
                  <label htmlFor="uc-email" className={`block ${FORM_LABEL_CLASS}`}>
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="uc-email"
                    type="email"
                    className={FORM_INPUT_CLASS}
                    placeholder="usuario@ejemplo.com"
                    autoComplete="off"
                    {...register('email')}
                  />
                  {errors.email && <p className={FORM_ERROR_CLASS}>{errors.email.message}</p>}
                </div>

                <div className="mt-4">
                  <label htmlFor="uc-role" className={`block ${FORM_LABEL_CLASS}`}>
                    Rol <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    control={control}
                    name="role"
                    render={({ field, fieldState }) => (
                      <Select
                        id="uc-role"
                        options={USER_ROLES.map((role) => ({ value: role, label: role }))}
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

                <div className="mt-4">
                  <label htmlFor="uc-password" className={`block ${FORM_LABEL_CLASS}`}>
                    Contraseña{' '}
                    <span className={FORM_MICROCOPY_CLASS}>
                      (dejar vacío para generar una temporal)
                    </span>
                  </label>
                  <input
                    id="uc-password"
                    type="password"
                    className={FORM_INPUT_CLASS}
                    placeholder="Mín. 10 caracteres"
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  {errors.password && <p className={FORM_ERROR_CLASS}>{errors.password.message}</p>}
                </div>

                <div className="mt-4 rounded-2xl border border-gray-200 bg-white/80 p-3 dark:border-dark-border dark:bg-dark-surface-2/80">
                  <label className="flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-iwana-primary focus:ring-iwana-primary/30 dark:border-dark-border dark:bg-dark-surface-3"
                      {...register('mfaRequired')}
                    />
                    Requerir verificación en dos pasos (MFA)
                  </label>
                  <p className={`mt-2 ${FORM_MICROCOPY_CLASS}`}>
                    Si se activa, el usuario será redirigido al setup de MFA en su primer ingreso.
                  </p>
                </div>
              </div>

              {/* ── Perfil (colapsable) ─────────────────────────────────── */}
              <div className={FORM_SECTION_CARD_CLASS}>
                <button
                  type="button"
                  className={accordionTriggerClass}
                  onClick={() => setShowProfile((v) => !v)}
                  aria-expanded={showProfile}
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
                      Datos de perfil
                    </p>
                    <p className={`mt-1 ${FORM_MICROCOPY_CLASS}`}>
                      Información complementaria para identificar al usuario en la operación
                      interna.
                    </p>
                  </div>
                  {showProfile ? (
                    <ChevronUp
                      className="h-4 w-4 text-gray-500 dark:text-gray-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <ChevronDown
                      className="h-4 w-4 text-gray-500 dark:text-gray-400"
                      aria-hidden="true"
                    />
                  )}
                </button>

                {showProfile && (
                  <div className="space-y-4 border-t border-gray-100 px-4 pb-4 pt-4 dark:border-dark-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="uc-firstname" className={`block ${FORM_LABEL_CLASS}`}>
                          Nombres
                        </label>
                        <input
                          id="uc-firstname"
                          className={FORM_INPUT_CLASS}
                          placeholder="Carlos"
                          {...register('firstName')}
                        />
                        {errors.firstName && (
                          <p className={FORM_ERROR_CLASS}>{errors.firstName.message}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="uc-lastname" className={`block ${FORM_LABEL_CLASS}`}>
                          Apellidos
                        </label>
                        <input
                          id="uc-lastname"
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
                      <label htmlFor="uc-jobtitle" className={`block ${FORM_LABEL_CLASS}`}>
                        Cargo
                      </label>
                      <input
                        id="uc-jobtitle"
                        className={FORM_INPUT_CLASS}
                        placeholder="Técnico de soporte"
                        {...register('jobTitle')}
                      />
                      {errors.jobTitle && (
                        <p className={FORM_ERROR_CLASS}>{errors.jobTitle.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="uc-phone" className={`block ${FORM_LABEL_CLASS}`}>
                        Teléfono (E.164)
                      </label>
                      <input
                        id="uc-phone"
                        type="tel"
                        className={FORM_INPUT_CLASS}
                        placeholder="+573001234567"
                        {...register('phone')}
                      />
                      {errors.phone && <p className={FORM_ERROR_CLASS}>{errors.phone.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="uc-doctype" className={`block ${FORM_LABEL_CLASS}`}>
                          Tipo de documento
                        </label>
                        <Controller
                          control={control}
                          name="documentType"
                          render={({ field, fieldState }) => (
                            <Select
                              id="uc-doctype"
                              options={[
                                { value: '', label: 'Sin definir' },
                                { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
                                { value: 'CE', label: 'Cédula de Extranjería (CE)' },
                                { value: 'PASAPORTE', label: 'Pasaporte' },
                                { value: 'NIT_PERSONA', label: 'NIT Persona Natural' },
                              ]}
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
                        <label htmlFor="uc-docnum" className={`block ${FORM_LABEL_CLASS}`}>
                          Número de documento
                        </label>
                        <input
                          id="uc-docnum"
                          className={FORM_INPUT_CLASS}
                          {...register('documentNumber')}
                        />
                        {errors.documentNumber && (
                          <p className={FORM_ERROR_CLASS}>{errors.documentNumber.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="uc-avatar" className={`block ${FORM_LABEL_CLASS}`}>
                        URL de avatar
                      </label>
                      <input
                        id="uc-avatar"
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
                )}
              </div>

              <div className="flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-dark-border">
                <Button type="submit" size="lg" loading={isSubmitting}>
                  Crear usuario
                </Button>
                <Button type="button" variant="secondary" size="lg" onClick={onClose}>
                  Cerrar
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
