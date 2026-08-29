// apps/portal/src/components/users/EditUserModal.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronDown, ShieldAlert } from 'lucide-react';
import {
  type AccessPermissionKey,
  PLATFORM_ONLY_ROLES,
  TENANT_ASSIGNABLE_ROLES,
  UserRole,
} from '@iwana/shared';
import { Button, Select, cn } from '@iwana/ui';
import {
  accessControlApi,
  usersApi,
  type AccessPermissionsCatalog,
  type AccessProfileView,
  type EffectivePermissionsSummary,
  type InternalUser,
  type UpdateInternalUserDto,
  ApiError,
} from '@/lib/api-client';
import { ensureIdempotencyKey } from '@/lib/idempotency-key';
import { getAccessProfileDisplayName } from '@/lib/system-vocabulary';
import {
  getPortalUserRoleLabel,
  getPortalUserStatusLabel,
  PORTAL_USER_STATUSES,
} from '@/lib/user-labels';
import {
  PortalAlert,
  PortalSidePeek,
  portalFieldClassName,
  portalSelectTriggerClassName,
} from '@/components/shared/portal-ui';
import { EffectivePermissionsPanel } from '@/components/access-control/EffectivePermissionsPanel';
import { CompanyRolesAssignmentSection } from './CompanyRolesAssignmentSection';
import { UserProfileFields } from './UserProfileFields';

const editUserSchema = z.object({
  email: z.string().trim().email('Ingresa un correo válido.'),
  status: z.string().optional(),
  role: z.string().optional(),
  firstName: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  lastName: z.string().trim().max(100, 'Máximo 100 caracteres.').optional().or(z.literal('')),
  phone: z
    .string()
    .min(7, 'Mínimo 7 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .optional()
    .or(z.literal('')),
  jobTitle: z.string().trim().max(150, 'Máximo 150 caracteres.').optional().or(z.literal('')),
  documentType: z.string().optional(),
  documentNumber: z.string().trim().max(20, 'Máximo 20 caracteres.').optional().or(z.literal('')),
  mfaRequired: z.boolean().optional(),
  isOperationalResource: z.boolean().optional(),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

function getDefaultOperationalResource(role: string | UserRole | undefined): boolean {
  return role === UserRole.TECHNICIAN || role === UserRole.CONTRACTOR;
}

function buildProfileSummary(user: InternalUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const parts = [name || null, user.jobTitle || null].filter(Boolean);
  if (parts.length === 0) {
    return 'Nombre, contacto, documento y preferencias';
  }
  return parts.join(' · ');
}

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
    if (err.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (err.status === 403) return 'No tienes permisos para gestionar usuarios.';
    if (err.status === 409) return err.message;
    return err.message;
  }
  return 'No fue posible completar la operación. Intenta de nuevo.';
}

/** Nombres visibles de los perfiles descartados, con fallback del vocabulario. */
function resolveDiscardedProfileNames(
  profileIds: string[],
  availableProfiles: AccessProfileView[],
): string[] {
  return profileIds.reduce<string[]>((names, profileId) => {
    const profile = availableProfiles.find((entry) => entry.id === profileId);
    if (profile) {
      names.push(getAccessProfileDisplayName(profile));
    }
    return names;
  }, []);
}

/** Copy congelado por casos (spec MOD00 §4.5): n = 1 / 2–3 / > 3. */
export function formatDiscardedProfilesMessage(profileNames: string[]): string {
  const count = profileNames.length;
  if (count === 0) {
    return '';
  }

  if (count === 1) {
    return `Al cambiar el tipo de usuario, 1 perfil dejó de ser compatible y se desmarcó: ${profileNames[0]}. Al guardar, quedará sin asignar.`;
  }

  const joined =
    count <= 3
      ? `${profileNames.slice(0, -1).join(', ')} y ${profileNames[count - 1]}`
      : `${profileNames[0]}, ${profileNames[1]}, ${profileNames[2]} y ${count - 3} más`;

  return `Al cambiar el tipo de usuario, ${count} perfiles dejaron de ser compatibles y se desmarcaron: ${joined}. Al guardar, quedarán sin asignar.`;
}

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

  // Panel «Accesos efectivos» (spec MOD00 §4.1): estado guardado del usuario
  // editado; se pide al abrir el peek y se refresca tras un guardado exitoso.
  const [effectiveSummary, setEffectiveSummary] = useState<EffectivePermissionsSummary | null>(
    null,
  );
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [hasSummaryError, setHasSummaryError] = useState(false);

  // Advertencia por descarte de perfiles al cambiar el tipo de usuario
  // (spec MOD00 §4.5 — SOLO edición).
  const [discardedProfileIds, setDiscardedProfileIds] = useState<string[]>([]);

  const changeEmailIdempotencyKeyRef = useRef<string | null>(null);
  const previousRoleRef = useRef<string | undefined>(undefined);
  const selectedCompanyRoleIdsRef = useRef<string[]>([]);
  selectedCompanyRoleIdsRef.current = selectedCompanyRoleIds;

  const loadEffectiveSummary = useCallback(async () => {
    setIsSummaryLoading(true);
    setHasSummaryError(false);
    try {
      const summary = await accessControlApi.getEffectivePermissions(user.id);
      setEffectiveSummary(summary);
    } catch {
      setEffectiveSummary(null);
      setHasSummaryError(true);
    } finally {
      setIsSummaryLoading(false);
    }
  }, [user.id]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty, dirtyFields },
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
      isOperationalResource: user.isOperationalResource,
    },
  });

  const handleClose = () => {
    changeEmailIdempotencyKeyRef.current = null;
    onClose();
  };

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
        isOperationalResource: user.isOperationalResource,
      });
      setServerError(null);
      setEmailError(null);
      setEmailToConfirm(null);
      setSelectedCompanyRoleIds(initialCompanyRoleIds);
      changeEmailIdempotencyKeyRef.current = null;
      previousRoleRef.current = user.role;
      setDiscardedProfileIds([]);
      void loadEffectiveSummary();
    }
  }, [initialCompanyRoleIds, isOpen, user, reset, loadEffectiveSummary]);

  useEffect(() => {
    if (error) setServerError(error);
  }, [error]);

  const selectedBaseRole = watch('role') as UserRole | undefined;
  const emailValue = watch('email');
  const isOperationalResource = watch('isOperationalResource');

  useEffect(() => {
    if (dirtyFields.isOperationalResource) {
      return;
    }

    const suggestedValue =
      dirtyFields.role && selectedBaseRole
        ? getDefaultOperationalResource(selectedBaseRole)
        : user.isOperationalResource;

    if (isOperationalResource === suggestedValue) {
      return;
    }

    setValue('isOperationalResource', suggestedValue, { shouldDirty: false });
  }, [
    dirtyFields.isOperationalResource,
    dirtyFields.role,
    isOperationalResource,
    selectedBaseRole,
    setValue,
    user.isOperationalResource,
  ]);

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

  // Detección del descarte por cambio de tipo de usuario (spec MOD00 §4.5).
  // Se evalúa contra la selección vigente ANTES del filtro de compatibilidad;
  // la alerta desaparece al revertir a un tipo que no descarte nada.
  useEffect(() => {
    const previousRole = previousRoleRef.current;
    previousRoleRef.current = selectedBaseRole ?? undefined;

    if (!selectedBaseRole || !previousRole || previousRole === selectedBaseRole) {
      return;
    }

    const discarded = selectedCompanyRoleIdsRef.current.filter((profileId) => {
      const profile = availableProfiles.find((entry) => entry.id === profileId);
      return !profile || !profile.isActive || profile.baseRoleConstraint !== selectedBaseRole;
    });
    setDiscardedProfileIds(discarded);
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
    if (values.mfaRequired !== user.mfaRequired) {
      dto.mfaRequired = values.mfaRequired;
    }
    if (values.isOperationalResource !== user.isOperationalResource) {
      dto.isOperationalResource = values.isOperationalResource;
    }

    if (Object.keys(dto).length === 0 && !companyRolesChanged) {
      handleClose();
      return;
    }

    await onSubmit(dto, normalizedSelectedCompanyRoleIds);
    // El panel refleja el estado guardado: se refresca tras un guardado
    // exitoso (spec MOD00 §4.1 / CA-USR-01).
    void loadEffectiveSummary();
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
    const idempotencyKey = ensureIdempotencyKey(changeEmailIdempotencyKeyRef);
    try {
      await usersApi.changeLoginEmailAsAdmin(user.id, { email }, idempotencyKey);
      changeEmailIdempotencyKeyRef.current = null;
      onEmailChanged?.();
    } catch (err: unknown) {
      setEmailError(mapError(err));
    } finally {
      setIsSavingEmail(false);
    }
  };

  const requestEmailChange = () => {
    const nextEmail = emailValue.trim();
    if (!nextEmail || nextEmail === user.email) return;
    setEmailToConfirm(nextEmail);
  };

  const hasPlatformRole = PLATFORM_ONLY_ROLES.has(user.role);
  const isAdmin = user.role === UserRole.ADMIN || hasPlatformRole;
  const isProtectedRole = isAdmin || hasPlatformRole;
  const companyRolesUnchanged =
    [...initialCompanyRoleIds].sort().join('|') === [...selectedCompanyRoleIds].sort().join('|');
  const emailUnchanged = emailValue.trim() === user.email;
  const profileSummary = buildProfileSummary(user);

  return (
    <PortalSidePeek
      open={isOpen}
      onClose={handleClose}
      eyebrow="Perfil interno"
      title="Editar usuario"
      description={user.email}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="edit-user-form"
            variant="primary"
            disabled={isSubmitting || (!isDirty && companyRolesUnchanged)}
            loading={isSubmitting}
          >
            Guardar cambios
          </Button>
        </div>
      }
    >
      <form
        id="edit-user-form"
        onSubmit={handleSubmit(onFormSubmit)}
        noValidate
        className="space-y-5"
      >
        {/* 1. Acceso — decisión principal */}
        <section className="space-y-3" aria-labelledby="edit-access-heading">
          <div>
            <h3 id="edit-access-heading" className="portal-eyebrow">
              Acceso
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Estado, categoría base y perfiles de la empresa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-status"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Estado
              </label>
              <Select
                id="edit-status"
                disabled={isSubmitting || isProtectedRole}
                {...register('status')}
                aria-label="Estado"
                className={portalSelectTriggerClassName}
                title={
                  isProtectedRole ? 'No puedes cambiar el estado de usuarios protegidos' : undefined
                }
              >
                {PORTAL_USER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getPortalUserStatusLabel(status)}
                  </option>
                ))}
              </Select>
              {isProtectedRole && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No editable para roles protegidos
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-role"
                className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Categoría base
              </label>
              <Select
                id="edit-role"
                disabled={isSubmitting || isProtectedRole}
                {...register('role')}
                aria-label="Categoría base"
                className={portalSelectTriggerClassName}
                title={
                  isProtectedRole ? 'No puedes cambiar el rol de usuarios protegidos' : undefined
                }
              >
                {PLATFORM_ONLY_ROLES.has(user.role) && (
                  <option value={user.role}>{getPortalUserRoleLabel(user.role)}</option>
                )}
                {TENANT_ASSIGNABLE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {getPortalUserRoleLabel(role)}
                  </option>
                ))}
              </Select>
              {isProtectedRole && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No editable para roles protegidos
                </p>
              )}
            </div>
          </div>

          <CompanyRolesAssignmentSection
            layout="flat"
            baseRole={selectedBaseRole ?? null}
            availableProfiles={availableProfiles}
            selectedProfileIds={selectedCompanyRoleIds}
            compatibilityMatrix={
              accessCatalog?.compatibilityMatrix ?? ({} as Record<UserRole, AccessPermissionKey[]>)
            }
            catalog={accessCatalog}
            onToggleProfile={toggleCompanyRole}
          />

          {discardedProfileIds.length > 0 ? (
            <PortalAlert
              variant="warning"
              title="Perfiles descartados por el cambio de tipo de usuario"
              description={
                <span className="block space-y-1">
                  <span className="block">
                    {formatDiscardedProfilesMessage(
                      resolveDiscardedProfileNames(discardedProfileIds, availableProfiles),
                    )}
                  </span>
                  <span className="block">
                    Usa Cancelar para descartar todos los cambios de esta edición.
                  </span>
                </span>
              }
            />
          ) : null}
        </section>

        {/* Panel de accesos efectivos guardados — colapsado por defecto (spec MOD00 §4.1) */}
        <EffectivePermissionsPanel
          summary={effectiveSummary}
          catalog={accessCatalog}
          availableProfiles={availableProfiles}
          isLoading={isSummaryLoading}
          hasError={hasSummaryError}
          onRetry={() => void loadEffectiveSummary()}
        />

        {/* 2. Correo — flujo sensible, CTA secundaria */}
        <section
          className="space-y-3 border-t border-gray-100 pt-5 dark:border-dark-border"
          aria-labelledby="edit-email-heading"
        >
          <div>
            <h3 id="edit-email-heading" className="portal-eyebrow">
              Correo de inicio de sesión
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Se guarda aparte del resto del perfil. El colaborador usará este correo para entrar.
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-email"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Correo electrónico
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                id="edit-email"
                type="email"
                disabled={isSubmitting}
                {...register('email')}
                className={`${portalFieldClassName} flex-1`}
                aria-invalid={errors.email ? 'true' : undefined}
              />
              <Button
                type="button"
                variant="outline"
                onClick={requestEmailChange}
                disabled={isSubmitting || isSavingEmail || emailUnchanged}
                loading={isSavingEmail}
                className="shrink-0 sm:self-stretch"
              >
                Cambiar correo
              </Button>
            </div>
            {errors.email && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.email.message}</p>
            )}
            {emailError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailError}</p>
            )}
          </div>

          {emailToConfirm && (
            <PortalAlert
              variant="warning"
              title="Confirmar cambio de correo"
              description={
                <>
                  Vas a cambiar el inicio de sesión de <strong>{user.email}</strong> a{' '}
                  <strong>{emailToConfirm}</strong>.
                </>
              }
              icon={ShieldAlert}
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEmailToConfirm(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      void handleSaveEmail(emailToConfirm);
                      setEmailToConfirm(null);
                    }}
                    disabled={isSavingEmail}
                    loading={isSavingEmail}
                  >
                    Confirmar cambio de correo
                  </Button>
                </div>
              }
            />
          )}
        </section>

        {/* 3. Perfil — progressive disclosure */}
        <details className="group border-t border-gray-100 pt-5 dark:border-dark-border">
          <summary
            className={cn(
              'flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary',
            )}
          >
            <div className="min-w-0">
              <p className="portal-eyebrow">Datos de perfil</p>
              <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
                {profileSummary}
              </p>
            </div>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-iwana-primary transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <UserProfileFields
              idPrefix="edit"
              register={register}
              errors={errors}
              isSubmitting={isSubmitting}
              inputClassName={portalFieldClassName}
              selectClassName={portalSelectTriggerClassName}
              operationalResourceDescription="Si está activo, aparece en agenda diaria, capacidad y recomendaciones. Si no, sigue disponible para agenda general."
            />
          </div>
        </details>

        {serverError && (
          <PortalAlert
            variant="error"
            title="No fue posible guardar los cambios"
            description={serverError}
          />
        )}
      </form>
    </PortalSidePeek>
  );
}
