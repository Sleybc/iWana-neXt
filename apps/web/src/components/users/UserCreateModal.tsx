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
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
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
      setTemporaryPassword(null);
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
        setTemporaryPassword(created.temporaryPassword);
      }
      onCreated(created);
      reset({ email: '', role: values.role, password: '' });
      // Cerrar el modal automáticamente después de crear el usuario
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No fue posible crear el usuario.');
    }
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

        {error && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {temporaryPassword && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Contraseña temporal: <strong>{temporaryPassword}</strong>
          </p>
        )}

        <form className="mt-3 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          {/* ── Credenciales ──────────────────────────────────────────── */}
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
                Contraseña <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                id="uc-password"
                type="password"
                className={INPUT_CLASS}
                placeholder="Dejar vacío para generar temporal"
                {...register('password')}
              />
              {errors.password && <p className={ERROR_CLASS}>{errors.password.message}</p>}
            </div>
          </div>

          {/* ── Perfil (colapsable) ───────────────────────────────────── */}
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
                    {errors.firstName && <p className={ERROR_CLASS}>{errors.firstName.message}</p>}
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
                    {errors.lastName && <p className={ERROR_CLASS}>{errors.lastName.message}</p>}
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
                    <select id="uc-doctype" className={INPUT_CLASS} {...register('documentType')}>
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
                    <input id="uc-docnum" className={INPUT_CLASS} {...register('documentNumber')} />
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
                  {errors.avatarUrl && <p className={ERROR_CLASS}>{errors.avatarUrl.message}</p>}
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
      </div>
    </div>
  );
}
