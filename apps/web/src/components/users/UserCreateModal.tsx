'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@iwana/ui';
import { ApiError, usersApi, type CreateUserPayload, type UserListItem } from '@/lib/api-client';

const createUserSchema = z.object({
  // Credenciales
  email: z.string().email('Email inválido'),
  role: z.string().min(1),
  password: z.string().min(10, 'Mínimo 10 caracteres').optional().or(z.literal('')),
  // Perfil (opcionales)
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, 'Formato E.164 (ej: +573001234567)')
    .optional()
    .or(z.literal('')),
  jobTitle: z.string().max(150).optional().or(z.literal('')),
  documentType: z.enum(['CC', 'CE', 'PASAPORTE', 'NIT_PERSONA']).optional(),
  documentNumber: z.string().max(30).optional().or(z.literal('')),
  avatarUrl: z.string().url('URL inválida').optional().or(z.literal('')),
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

const INPUT_CLASS =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-iwana-primary/30 dark:border-dark-border dark:bg-dark-surface-3';
const LABEL_CLASS = 'block text-xs font-medium text-gray-600 dark:text-gray-400';
const ERROR_CLASS = 'mt-0.5 text-xs text-red-600';

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
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { role: 'NOC', password: '' },
  });

  useEffect(() => {
    if (!open) {
      setError(null);
      setCreatedResult(null);
      setShowProfile(false);
      reset({ email: '', role: 'NOC', password: '' });
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
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-dark-surface-2 max-h-[90vh] overflow-y-auto">
        <h3 id="user-create-modal-title" className="text-lg font-semibold">
          Crear usuario
        </h3>

        {/* ── Pantalla de éxito con contraseña temporal ─────────────── */}
        {createdResult ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                ✓ Usuario creado exitosamente
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                <strong>Email:</strong> {createdResult.email}
              </p>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-700 dark:bg-amber-900/20">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Contraseña temporal — copia esta clave antes de cerrar
              </p>
              {/* select-all permite seleccionar y copiar con un solo clic */}
              <p
                className="select-all rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-lg font-bold tracking-widest text-amber-900 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-amber-200"
                aria-label="Contraseña temporal"
              >
                {createdResult.temporaryPassword}
              </p>
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                El usuario deberá cambiar esta contraseña en su primer ingreso al portal.
              </p>
            </div>

            <Button type="button" onClick={handleConfirmTempPassword}>
              Entendido, cerrar
            </Button>
          </div>
        ) : (
          /* ── Formulario de creación ────────────────────────────────── */
          <>
            {error && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <form className="mt-3 space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {/* ── Credenciales ────────────────────────────────────────── */}
              <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-dark-border">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Credenciales
                </p>

                <div>
                  <label htmlFor="uc-email" className={LABEL_CLASS}>
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="uc-email"
                    type="email"
                    className={INPUT_CLASS}
                    placeholder="usuario@ejemplo.com"
                    autoComplete="off"
                    {...register('email')}
                  />
                  {errors.email && <p className={ERROR_CLASS}>{errors.email.message}</p>}
                </div>

                <div>
                  <label htmlFor="uc-role" className={LABEL_CLASS}>
                    Rol <span className="text-red-500">*</span>
                  </label>
                  <select id="uc-role" className={INPUT_CLASS} {...register('role')}>
                    {USER_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="uc-password" className={LABEL_CLASS}>
                    Contraseña{' '}
                    <span className="text-xs font-normal text-gray-400">
                      (dejar vacío para generar una temporal)
                    </span>
                  </label>
                  <input
                    id="uc-password"
                    type="password"
                    className={INPUT_CLASS}
                    placeholder="Mín. 10 caracteres"
                    autoComplete="new-password"
                    {...register('password')}
                  />
                  {errors.password && <p className={ERROR_CLASS}>{errors.password.message}</p>}
                </div>
              </div>

              {/* ── Perfil (colapsable) ─────────────────────────────────── */}
              <div className="rounded-lg border border-gray-200 dark:border-dark-border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-50 dark:hover:bg-dark-surface-3"
                  onClick={() => setShowProfile((v) => !v)}
                >
                  <span>Datos de perfil (opcional)</span>
                  <span>{showProfile ? '▲' : '▼'}</span>
                </button>

                {showProfile && (
                  <div className="space-y-3 border-t border-gray-200 p-3 dark:border-dark-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="uc-firstname" className={LABEL_CLASS}>
                          Nombres
                        </label>
                        <input
                          id="uc-firstname"
                          className={INPUT_CLASS}
                          placeholder="Carlos"
                          {...register('firstName')}
                        />
                        {errors.firstName && (
                          <p className={ERROR_CLASS}>{errors.firstName.message}</p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="uc-lastname" className={LABEL_CLASS}>
                          Apellidos
                        </label>
                        <input
                          id="uc-lastname"
                          className={INPUT_CLASS}
                          placeholder="García"
                          {...register('lastName')}
                        />
                        {errors.lastName && (
                          <p className={ERROR_CLASS}>{errors.lastName.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="uc-jobtitle" className={LABEL_CLASS}>
                        Cargo
                      </label>
                      <input
                        id="uc-jobtitle"
                        className={INPUT_CLASS}
                        placeholder="Técnico de soporte"
                        {...register('jobTitle')}
                      />
                      {errors.jobTitle && <p className={ERROR_CLASS}>{errors.jobTitle.message}</p>}
                    </div>

                    <div>
                      <label htmlFor="uc-phone" className={LABEL_CLASS}>
                        Teléfono (E.164)
                      </label>
                      <input
                        id="uc-phone"
                        type="tel"
                        className={INPUT_CLASS}
                        placeholder="+573001234567"
                        {...register('phone')}
                      />
                      {errors.phone && <p className={ERROR_CLASS}>{errors.phone.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="uc-doctype" className={LABEL_CLASS}>
                          Tipo de documento
                        </label>
                        <select
                          id="uc-doctype"
                          className={INPUT_CLASS}
                          {...register('documentType')}
                        >
                          <option value="">-- Seleccionar --</option>
                          <option value="CC">Cédula de Ciudadanía (CC)</option>
                          <option value="CE">Cédula de Extranjería (CE)</option>
                          <option value="PASAPORTE">Pasaporte</option>
                          <option value="NIT_PERSONA">NIT Persona Natural</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="uc-docnum" className={LABEL_CLASS}>
                          Número de documento
                        </label>
                        <input
                          id="uc-docnum"
                          className={INPUT_CLASS}
                          {...register('documentNumber')}
                        />
                        {errors.documentNumber && (
                          <p className={ERROR_CLASS}>{errors.documentNumber.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="uc-avatar" className={LABEL_CLASS}>
                        URL de avatar
                      </label>
                      <input
                        id="uc-avatar"
                        type="url"
                        className={INPUT_CLASS}
                        placeholder="https://..."
                        {...register('avatarUrl')}
                      />
                      {errors.avatarUrl && (
                        <p className={ERROR_CLASS}>{errors.avatarUrl.message}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" loading={isSubmitting}>
                  Crear usuario
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
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
