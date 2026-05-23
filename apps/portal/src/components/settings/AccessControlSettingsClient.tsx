'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, RefreshCcw, Save, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { AccessPermissionAvailability, UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  auditApi,
  accessControlApi,
  ApiError,
  type AuditLogEntry,
  usersApi,
  type AccessPermissionCatalogEntry,
  type AccessPermissionsCatalog,
  type AccessProfileView,
  type CreateAccessProfileDto,
  type EffectivePermissionsSummary,
  type InternalUser,
  type UpdateAccessProfileDto,
} from '@/lib/api-client';
import { EffectivePermissionsPanel } from '@/components/access-control/EffectivePermissionsPanel';
import { ProfileChangeEvidence } from '@/components/access-control/ProfileChangeEvidence';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { PORTAL_TENANT_ASSIGNABLE_ROLES, getPortalUserRoleLabel } from '@/lib/user-labels';
import {
  getAccessModuleLabel,
  getAccessPermissionAvailabilityLabel,
} from './mod00-settings-labels';

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

const profileFormSchema = z.object({
  name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(120, 'Maximo 120 caracteres.'),
  description: z.string().trim().max(1000, 'Maximo 1000 caracteres.').optional(),
  baseRoleConstraint: z.nativeEnum(UserRole),
  isActive: z.boolean(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

const roleOptions = PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: getPortalUserRoleLabel(role),
}));

function mapAccessControlError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) {
      return error.message && error.message !== 'Forbidden resource'
        ? error.message
        : 'Solo Administrador puede gestionar usuarios y acceso.';
    }
    return error.message;
  }

  return 'No fue posible cargar la vista de usuarios y acceso.';
}

function createDefaultProfileFormValues(): ProfileFormValues {
  return {
    name: '',
    description: '',
    baseRoleConstraint: UserRole.NOC,
    isActive: true,
  };
}

function toProfileFormValues(profile: AccessProfileView): ProfileFormValues {
  return {
    name: profile.name,
    description: profile.description ?? '',
    baseRoleConstraint: profile.baseRoleConstraint ?? UserRole.NOC,
    isActive: profile.isActive,
  };
}

function getUserDisplayName(user: InternalUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email;
}

export function AccessControlSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [catalog, setCatalog] = useState<AccessPermissionsCatalog | null>(null);
  const [profiles, setProfiles] = useState<AccessProfileView[]>([]);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [draftPermissionKeys, setDraftPermissionKeys] = useState<string[]>([]);
  const [draftUserProfileIdsByUser, setDraftUserProfileIdsByUser] = useState<
    Record<string, string[]>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [effectivePermissions, setEffectivePermissions] =
    useState<EffectivePermissionsSummary | null>(null);
  const [effectivePermissionsError, setEffectivePermissionsError] = useState<string | null>(null);
  const [isLoadingEffectivePermissions, setIsLoadingEffectivePermissions] = useState(false);
  const [evidenceEntries, setEvidenceEntries] = useState<AuditLogEntry[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const isAdmin = user?.role === UserRole.ADMIN;

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: createDefaultProfileFormValues(),
  });

  const loadAccessControl = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [permissionsCatalog, accessProfiles, usersResponse] = await Promise.all([
        accessControlApi.listPermissions(),
        accessControlApi.listProfiles(),
        usersApi.list({ limit: 100 }),
      ]);

      setCatalog(permissionsCatalog);
      setProfiles(accessProfiles);
      setUsers(usersResponse.data);

      const nextSelectedProfileId = selectedProfileId ?? accessProfiles[0]?.id ?? null;
      setSelectedProfileId(nextSelectedProfileId);

      if (nextSelectedProfileId) {
        const selectedProfile = accessProfiles.find(
          (profile) => profile.id === nextSelectedProfileId,
        );
        setDraftPermissionKeys(selectedProfile?.permissions ?? []);
      } else {
        setDraftPermissionKeys([]);
      }
    } catch (loadError) {
      setError(mapAccessControlError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setIsLoading(false);
      setError('No fue posible resolver la sesión del portal.');
      return;
    }

    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    void loadAccessControl();
  }, [authLoading, isAdmin, loadAccessControl, user]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let mounted = true;
    setIsLoadingEvidence(true);
    setEvidenceError(null);

    auditApi
      .list({ limit: 20 })
      .then((entries) => {
        if (!mounted) {
          return;
        }

        setEvidenceEntries(
          entries.filter((entry) =>
            ['access_profile', 'access_profile_permissions', 'user_access_profiles'].includes(
              entry.entityType,
            ),
          ),
        );
      })
      .catch((loadError) => {
        if (!mounted) {
          return;
        }

        setEvidenceError(mapAccessControlError(loadError));
        setEvidenceEntries([]);
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingEvidence(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedUserId) {
      setEffectivePermissions(null);
      setEffectivePermissionsError(null);
      setIsLoadingEffectivePermissions(false);
      return;
    }

    let mounted = true;
    setIsLoadingEffectivePermissions(true);
    setEffectivePermissionsError(null);

    accessControlApi
      .getEffectivePermissions(selectedUserId)
      .then((summary) => {
        if (mounted) {
          setEffectivePermissions(summary);
        }
      })
      .catch((loadError) => {
        if (!mounted) {
          return;
        }

        setEffectivePermissions(null);
        setEffectivePermissionsError(mapAccessControlError(loadError));
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingEffectivePermissions(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedUserId || users.length !== 1) {
      return;
    }

    setSelectedUserId(users[0]!.id);
  }, [selectedUserId, users]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  const permissionEntries = catalog?.permissions ?? [];

  const selectablePermissionEntries = useMemo(() => {
    if (!catalog || !selectedProfile?.baseRoleConstraint) {
      return [] as AccessPermissionCatalogEntry[];
    }

    const allowedKeys = new Set(
      catalog.compatibilityMatrix[selectedProfile.baseRoleConstraint] ?? [],
    );

    return permissionEntries.filter(
      (permission) =>
        permission.isActive &&
        permission.availability === AccessPermissionAvailability.ASSIGNABLE &&
        allowedKeys.has(permission.permissionKey),
    );
  }, [catalog, permissionEntries, selectedProfile]);

  const draftUserProfileIds = selectedUserId
    ? (draftUserProfileIdsByUser[selectedUserId] ?? [])
    : [];

  const compatibleProfiles = useMemo(() => {
    if (!selectedUser) {
      return [] as AccessProfileView[];
    }

    return profiles.filter(
      (profile) => profile.isActive && profile.baseRoleConstraint === selectedUser.role,
    );
  }, [profiles, selectedUser]);

  function openCreateDialog() {
    setEditingProfileId(null);
    reset(createDefaultProfileFormValues());
    setIsDialogOpen(true);
  }

  function openEditDialog(profile: AccessProfileView) {
    setEditingProfileId(profile.id);
    reset(toProfileFormValues(profile));
    setIsDialogOpen(true);
  }

  async function onSubmit(values: ProfileFormValues) {
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const payload: CreateAccessProfileDto | UpdateAccessProfileDto = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        baseRoleConstraint: values.baseRoleConstraint,
        isActive: values.isActive,
      };

      const profile = editingProfileId
        ? await accessControlApi.updateProfile(editingProfileId, payload as UpdateAccessProfileDto)
        : await accessControlApi.createProfile(payload as CreateAccessProfileDto);

      setIsDialogOpen(false);
      setFeedback(
        editingProfileId ? 'Perfil actualizado correctamente.' : 'Perfil creado correctamente.',
      );
      setSelectedProfileId(profile.id);
      await loadAccessControl();
    } catch (submitError) {
      setError(mapAccessControlError(submitError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteProfile(profileId: string) {
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await accessControlApi.deleteProfile(profileId);
      setFeedback('Perfil eliminado correctamente.');
      if (selectedProfileId === profileId) {
        setSelectedProfileId(null);
        setDraftPermissionKeys([]);
      }
      await loadAccessControl();
    } catch (deleteError) {
      setError(mapAccessControlError(deleteError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveProfilePermissions() {
    if (!selectedProfile) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await accessControlApi.replaceProfilePermissions(selectedProfile.id, {
        permissionKeys: draftPermissionKeys as never[],
      });
      setProfiles((current) =>
        current.map((profile) => (profile.id === updated.id ? updated : profile)),
      );
      setSelectedProfileId(updated.id);
      setDraftPermissionKeys(updated.permissions);
      setFeedback('Permisos del perfil actualizados correctamente.');
    } catch (saveError) {
      setError(mapAccessControlError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveUserProfiles() {
    if (!selectedUserId) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await accessControlApi.replaceUserProfiles(selectedUserId, {
        profileIds: draftUserProfileIds,
      });
      setDraftUserProfileIdsByUser((current) => ({
        ...current,
        [selectedUserId]: response.profileIds,
      }));
      setFeedback('Selección de perfiles aplicada correctamente.');
    } catch (saveError) {
      setError(mapAccessControlError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function togglePermission(permissionKey: string) {
    setDraftPermissionKeys((current) =>
      current.includes(permissionKey)
        ? current.filter((item) => item !== permissionKey)
        : [...current, permissionKey],
    );
  }

  function toggleUserProfile(profileId: string) {
    if (!selectedUserId) {
      return;
    }

    setDraftUserProfileIdsByUser((current) => {
      const nextDraft = current[selectedUserId] ?? [];
      const profileIds = nextDraft.includes(profileId)
        ? nextDraft.filter((item) => item !== profileId)
        : [...nextDraft, profileId];

      return {
        ...current,
        [selectedUserId]: profileIds,
      };
    });
  }

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Usuarios y acceso"
          subtitle="Cargando perfiles, permisos y base de usuarios internos"
        />
        <PortalSkeletonBlock className="h-36" />
        <PortalSkeletonBlock className="h-80" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios y acceso" subtitle="Sesión no disponible" />
        <PortalAlert
          variant="error"
          title="No fue posible abrir la vista"
          description={error ?? 'Inicia sesión nuevamente para continuar.'}
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios y acceso" subtitle="Acceso restringido" />
        <PortalAlert
          variant="info"
          title="Solo lectura no disponible"
          description="La Fase 01 expone esta sección únicamente para Administrador porque los contratos de lectura y mutación son ADMIN-only."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios y acceso"
        subtitle="Gestiona perfiles complementarios, catálogo de permisos y la asignación hacia usuarios internos."
        actions={
          <Button type="button" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" aria-hidden={true} />
            Crear perfil
          </Button>
        }
      />

      {feedback ? (
        <PortalAlert variant="success" title="Operación completada" description={feedback} />
      ) : null}

      {error ? (
        <PortalAlert
          variant="error"
          title="No fue posible completar la operación"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void loadAccessControl()}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-300"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              Reintentar
            </button>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <PortalPanel
          title="Perfiles configurables"
          description="Crea perfiles complementarios al rol base y ajusta su alcance operativo."
        >
          {profiles.length === 0 ? (
            <PortalEmptyState
              title="Sin perfiles configurados"
              description="Todavía no hay perfiles configurables en este tenant."
              action={
                <Button type="button" onClick={openCreateDialog}>
                  Crear perfil
                </Button>
              }
              icon={ShieldCheck}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-[#f8faf5] dark:bg-dark-surface-3">
                  <tr>
                    <th className={tableHeadClass}>Perfil</th>
                    <th className={tableHeadClass}>Rol base</th>
                    <th className={tableHeadClass}>Permisos</th>
                    <th className={tableHeadClass}>Estado</th>
                    <th className={tableHeadClass}>Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                  {profiles.map((profile) => {
                    const isSelected = profile.id === selectedProfileId;

                    return (
                      <tr
                        key={profile.id}
                        className={isSelected ? 'bg-[#f8faf5] dark:bg-dark-surface-3/60' : ''}
                      >
                        <td className={cellClass}>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {profile.name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {profile.description || 'Sin descripción'}
                            </p>
                          </div>
                        </td>
                        <td className={cellClass}>
                          {profile.baseRoleConstraint
                            ? getPortalUserRoleLabel(profile.baseRoleConstraint)
                            : 'Sin restricción'}
                        </td>
                        <td className={cellClass}>{profile.permissions.length}</td>
                        <td className={cellClass}>{profile.isActive ? 'Activo' : 'Inactivo'}</td>
                        <td className={cellClass}>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant={isSelected ? 'secondary' : 'ghost'}
                              size="sm"
                              onClick={() => {
                                setSelectedProfileId(profile.id);
                                setDraftPermissionKeys(profile.permissions);
                              }}
                            >
                              {isSelected ? 'Seleccionado' : 'Configurar'}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(profile)}
                            >
                              Editar
                            </Button>
                            {!profile.isSystem ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleDeleteProfile(profile.id)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden={true} />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PortalPanel>

        <div className="space-y-6">
          <PortalPanel
            title="Permisos del perfil"
            description={
              selectedProfile
                ? `Ajusta el set activo para ${selectedProfile.name}.`
                : 'Selecciona un perfil para revisar o modificar sus permisos.'
            }
            actions={
              selectedProfile ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSaveProfilePermissions()}
                  disabled={isSaving}
                >
                  <Save className="mr-2 h-4 w-4" aria-hidden={true} />
                  Guardar permisos
                </Button>
              ) : undefined
            }
          >
            {selectedProfile ? (
              selectablePermissionEntries.length > 0 ? (
                <div className="grid gap-3">
                  {selectablePermissionEntries.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={draftPermissionKeys.includes(permission.permissionKey)}
                        onChange={() => togglePermission(permission.permissionKey)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                      />
                      <span>
                        <span className="block font-medium text-gray-900 dark:text-white">
                          {permission.description}
                        </span>
                        <span className="mt-1 block text-xs uppercase tracking-[0.14em] text-gray-500">
                          {getAccessModuleLabel(permission.moduleKey)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <PortalEmptyState
                  title="Sin permisos compatibles"
                  description="El rol base actual no tiene permisos assignables adicionales en esta fase."
                />
              )
            ) : (
              <PortalEmptyState
                title="Sin perfil seleccionado"
                description="Elige un perfil del listado para editar su set de permisos."
              />
            )}
          </PortalPanel>

          <PortalPanel
            title="Asignación a usuario"
            description="Prepara una nueva selección de perfiles y reemplaza el set activo del usuario elegido."
            actions={
              selectedUserId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSaveUserProfiles()}
                  disabled={isSaving}
                >
                  <UserCog className="mr-2 h-4 w-4" aria-hidden={true} />
                  Aplicar selección
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-4">
              <PortalAlert
                variant="info"
                title="Decisión conservadora"
                description="La API de Fase 01 no expone lectura del set actual de perfiles por usuario. La selección de esta pantalla representa el reemplazo que se enviará al guardar."
              />

              <div>
                <label
                  htmlFor="access-user-select"
                  className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  Usuario
                </label>
                <Select
                  id="access-user-select"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  options={[
                    { value: '', label: 'Selecciona un usuario' },
                    ...users.map((item) => ({
                      value: item.id,
                      label: `${getUserDisplayName(item)} · ${getPortalUserRoleLabel(item.role)}`,
                    })),
                  ]}
                />
              </div>

              {selectedUser ? (
                compatibleProfiles.length > 0 ? (
                  <div className="grid gap-3">
                    {compatibleProfiles.map((profile) => (
                      <label
                        key={profile.id}
                        className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={draftUserProfileIds.includes(profile.id)}
                          onChange={() => toggleUserProfile(profile.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                        />
                        <span>
                          <span className="block font-medium text-gray-900 dark:text-white">
                            {profile.name}
                          </span>
                          <span className="mt-1 block text-sm text-gray-500">
                            {profile.description || 'Sin descripción'}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <PortalEmptyState
                    title="Sin perfiles compatibles"
                    description="No hay perfiles activos compatibles con el rol base del usuario seleccionado."
                  />
                )
              ) : (
                <PortalEmptyState
                  title="Selecciona un usuario"
                  description="Elige un usuario para preparar una nueva selección de perfiles."
                />
              )}
            </div>
          </PortalPanel>

          <EffectivePermissionsPanel
            summary={effectivePermissions}
            catalog={catalog}
            selectedUserLabel={selectedUser ? getUserDisplayName(selectedUser) : null}
            isLoading={isLoadingEffectivePermissions}
            error={effectivePermissionsError}
          />

          <ProfileChangeEvidence
            entries={evidenceEntries}
            isLoading={isLoadingEvidence}
            error={evidenceError}
          />
        </div>
      </div>

      <PortalPanel
        title="Catálogo de permisos"
        description="Referencia operativa del catálogo tenant-aware disponible en MOD00_ACCESS_V1."
      >
        {permissionEntries.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-[#f8faf5] dark:bg-dark-surface-3">
                <tr>
                  <th className={tableHeadClass}>Módulo</th>
                  <th className={tableHeadClass}>Descripción</th>
                  <th className={tableHeadClass}>Disponibilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                {permissionEntries.map((permission) => (
                  <tr key={permission.id}>
                    <td className={cellClass}>{getAccessModuleLabel(permission.moduleKey)}</td>
                    <td className={cellClass}>{permission.description}</td>
                    <td className={cellClass}>
                      {getAccessPermissionAvailabilityLabel(permission.availability)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <PortalEmptyState
            title="Sin catálogo disponible"
            description="No fue posible resolver el catálogo de permisos del tenant."
          />
        )}
      </PortalPanel>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent aria-labelledby="access-profile-dialog-title">
          <DialogHeader>
            <DialogTitle id="access-profile-dialog-title">
              {editingProfileId ? 'Editar perfil' : 'Crear perfil'}
            </DialogTitle>
            <DialogDescription>
              {editingProfileId
                ? 'Actualiza los datos base del perfil seleccionado.'
                : 'Crea un perfil complementario al rol base del usuario interno.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label
                htmlFor="profile-name"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Nombre
              </label>
              <Input id="profile-name" {...register('name')} className="h-11" />
              {errors.name?.message ? (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="profile-description"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Descripción
              </label>
              <Input id="profile-description" {...register('description')} className="h-11" />
              {errors.description?.message ? (
                <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="profile-role"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Rol base compatible
              </label>
              <Controller
                name="baseRoleConstraint"
                control={control}
                render={({ field }) => (
                  <Select
                    id="profile-role"
                    options={roleOptions}
                    name={field.name}
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                )}
              />
              {errors.baseRoleConstraint?.message ? (
                <p className="mt-1 text-sm text-red-600">{errors.baseRoleConstraint.message}</p>
              ) : null}
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:text-gray-200">
              <input
                type="checkbox"
                {...register('isActive')}
                className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
              />
              Mantener perfil activo
            </label>

            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving}>
                {editingProfileId ? 'Guardar cambios' : 'Crear perfil'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
