// apps/portal/src/components/users/CreateUserModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2, Copy, UserPlus, X } from 'lucide-react';
import { type AccessPermissionKey, TENANT_ASSIGNABLE_ROLES, UserRole } from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
} from '@iwana/ui';
import type {
  AccessPermissionsCatalog,
  AccessProfileView,
  CreateInternalUserDto,
} from '@/lib/api-client';
import { getPortalUserRoleLabel } from '@/lib/user-labels';
import { PortalAlert } from '@/components/shared/portal-ui';
import { CompanyRolesAssignmentSection } from './CompanyRolesAssignmentSection';
import { UserProfileFields } from './UserProfileFields';

const createUserSchema = z.object({
  email: z.string().trim().email('Ingresa un correo válido.'),
  role: z.string().min(1, 'Selecciona un rol.'),
  firstName: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  lastName: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  phone: z.string().max(15, 'Máximo 15 caracteres.').optional().or(z.literal('')),
  jobTitle: z.string().trim().max(150, 'Máximo 150 caracteres.').optional().or(z.literal('')),
  documentType: z.string().optional(),
  documentNumber: z.string().trim().max(20, 'Máximo 20 caracteres.').optional().or(z.literal('')),
  mfaRequired: z.boolean().optional(),
  isOperationalResource: z.boolean().optional(),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

function getDefaultOperationalResource(role: string | UserRole | ''): boolean {
  return role === UserRole.TECHNICIAN || role === UserRole.CONTRACTOR;
}

const selectClass = [
  'h-10 rounded-lg border-gray-300 bg-white shadow-none',
  'dark:bg-dark-surface-3',
].join(' ');

const createInputClass = [
  'flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm',
  'text-gray-900 placeholder:text-gray-400 transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-iwana-primary focus:border-transparent',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'dark:border-dark-border dark:bg-dark-surface-3 dark:text-white',
  'dark:placeholder:text-gray-500 dark:focus:ring-iwana-primary',
].join(' ');

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateInternalUserDto, companyRoleIds: string[]) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  accessCatalog: AccessPermissionsCatalog | null;
  availableProfiles: AccessProfileView[];
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
  accessCatalog,
  availableProfiles,
  tempPassword,
  tempPasswordEmail,
  onDismissSuccess,
}: CreateUserModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedCompanyRoleIds, setSelectedCompanyRoleIds] = useState<string[]>([]);
  const [secretsSaved, setSecretsSaved] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, dirtyFields },
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
      isOperationalResource: false,
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
        isOperationalResource: false,
      });
      setServerError(null);
      setCopied(false);
      setShowSuccess(false);
      setSelectedCompanyRoleIds([]);
      setSecretsSaved(false);
      setConfirmClose(false);
    }
  }, [isOpen, reset]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  useEffect(() => {
    // Mantener el estado de éxito sincronizado con las props evita estados stale
    // cuando el padre limpia la clave temporal al cerrar el flujo.
    const nextShowSuccess = Boolean(tempPassword && tempPasswordEmail);
    setShowSuccess(nextShowSuccess);
    if (!nextShowSuccess) {
      setSecretsSaved(false);
      setConfirmClose(false);
      setCopied(false);
    }
  }, [tempPassword, tempPasswordEmail]);

  const selectedBaseRole = watch('role') as UserRole | '';
  const isOperationalResource = watch('isOperationalResource');

  useEffect(() => {
    if (dirtyFields.isOperationalResource) {
      return;
    }

    const suggestedValue = getDefaultOperationalResource(selectedBaseRole);
    if (isOperationalResource === suggestedValue) {
      return;
    }

    setValue('isOperationalResource', suggestedValue, { shouldDirty: false });
  }, [dirtyFields.isOperationalResource, isOperationalResource, selectedBaseRole, setValue]);

  useEffect(() => {
    if (!selectedBaseRole) {
      setSelectedCompanyRoleIds([]);
      return;
    }

    // Guard: si los perfiles aun no cargaron no filtrar la seleccion actual para evitar limpiar
    // una seleccion valida ante un fallo de red transitorio.
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

  const onFormSubmit = async (values: CreateUserFormValues) => {
    setServerError(null);
    const dto: CreateInternalUserDto = {
      email: values.email.trim(),
      role: values.role,
    };
    if (values.firstName?.trim()) dto.firstName = values.firstName.trim();
    if (values.lastName?.trim()) dto.lastName = values.lastName.trim();
    if (values.phone?.trim()) {
      const raw = values.phone.trim().replace(/\s/g, '');
      // Normalizar a E.164 con prefijo Colombia si el usuario no lo incluyó
      dto.phone = raw.startsWith('+') ? raw : `+57${raw}`;
    }
    if (values.jobTitle?.trim()) dto.jobTitle = values.jobTitle.trim();
    if (values.documentType) dto.documentType = values.documentType;
    if (values.documentNumber?.trim()) dto.documentNumber = values.documentNumber.trim();
    if (values.mfaRequired) dto.mfaRequired = values.mfaRequired;
    if (values.isOperationalResource !== undefined) {
      dto.isOperationalResource = values.isOperationalResource;
    }

    await onSubmit(dto, selectedCompanyRoleIds);
  };

  function toggleCompanyRole(profileId: string) {
    setSelectedCompanyRoleIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    );
  }

  const handleCopy = async () => {
    if (tempPassword) {
      try {
        await navigator.clipboard.writeText(tempPassword);
        setCopied(true);
        setSecretsSaved(true);
        setConfirmClose(false);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Sin feedback de error aquí: el usuario puede seleccionar y copiar manualmente.
      }
    }
  };

  const handleDismiss = () => {
    setConfirmClose(false);
    setShowSuccess(false);
    onDismissSuccess?.();
    onClose();
  };

  const requestClose = () => {
    if (showSuccess && tempPassword && !secretsSaved) {
      setConfirmClose(true);
      return;
    }
    if (showSuccess) {
      handleDismiss();
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          requestClose();
        }
      }}
    >
      <DialogContent aria-labelledby="create-user-title">
        <DialogHeader className="mb-6 flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 flex-1">
            <p className="portal-eyebrow">Gestión de accesos</p>
            <DialogTitle id="create-user-title" className="mt-1">
              {showSuccess ? 'Usuario creado' : 'Crear usuario interno'}
            </DialogTitle>
            {!showSuccess ? (
              <DialogDescription className="mt-1 leading-6">
                Registra un nuevo colaborador con su rol, datos base y política inicial de
                verificación en dos pasos.
              </DialogDescription>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-gray-400 transition-colors hover:bg-iwana-surface-soft hover:text-gray-700 dark:hover:bg-dark-surface-3 dark:hover:text-gray-200"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </DialogHeader>

        {confirmClose && (
          <PortalAlert
            variant="warning"
            title="Contraseña temporal"
            description="¿Ya guardaste la contraseña temporal? No podrás verla de nuevo."
            className="mb-4"
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmClose(false)}
                >
                  Seguir aquí
                </Button>
                <Button type="button" variant="lime" size="sm" onClick={handleDismiss}>
                  Ya la guardé
                </Button>
              </div>
            }
          />
        )}

        {showSuccess && tempPassword ? (
          <div className="space-y-4">
            {serverError ? (
              <PortalAlert
                variant="error"
                title="Asignación de roles incompleta"
                description={serverError}
                icon={AlertTriangle}
              />
            ) : null}
            <PortalAlert
              variant="success"
              title="Usuario creado"
              description={
                <>
                  Comparte la siguiente clave temporal con <strong>{tempPasswordEmail}</strong>. El
                  usuario deberá cambiarla al primer inicio de sesión.
                </>
              }
              icon={CheckCircle2}
            />

            <PortalAlert
              variant="warning"
              title="Contraseña de un solo uso"
              description="Esta contraseña solo se muestra una vez. El usuario deberá cambiarla en el próximo inicio de sesión."
            />

            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-5 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">
                Clave temporal
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-base font-mono font-bold tracking-wider text-gray-900 dark:border-amber-700 dark:bg-dark-surface-3 dark:text-white">
                  {tempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
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
            <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
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
                  Correo electrónico <span className="text-red-500">*</span>
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
                  Categoría base <span className="text-red-500">*</span>
                </label>
                <Select
                  id="create-role"
                  disabled={isSubmitting}
                  {...register('role')}
                  aria-label="Categoría base"
                  aria-invalid={errors.role ? 'true' : undefined}
                  className={selectClass}
                >
                  <option value="">Selecciona una categoría base</option>
                  {TENANT_ASSIGNABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {getPortalUserRoleLabel(role)}
                    </option>
                  ))}
                </Select>
                {errors.role && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {errors.role.message}
                  </p>
                )}
              </div>

              <div className="col-span-full">
                <CompanyRolesAssignmentSection
                  baseRole={selectedBaseRole || null}
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

              <UserProfileFields
                idPrefix="create"
                register={register}
                errors={errors}
                isSubmitting={isSubmitting}
                inputClassName={createInputClass}
                selectClassName={selectClass}
                documentNumberFullWidth={true}
                phonePlaceholder="3001234567"
                operationalResourceDescription="Si lo activas, esta persona podrá aparecer en agenda diaria, capacidad visible y recomendaciones operativas. Si lo desactivas, seguirá disponible para agenda general."
              />
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
      </DialogContent>
    </Dialog>
  );
}
