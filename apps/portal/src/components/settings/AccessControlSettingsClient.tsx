'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, Plus, RefreshCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  Badge,
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
import { AccessPermissionAvailability, AccessPermissionKey, UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  accessControlApi,
  ApiError,
  tenantSelfApi,
  type AccessPermissionCatalogEntry,
  type AccessPermissionsCatalog,
  type AccessProfileView,
  type CreateAccessProfileDto,
  type TenantSelfSettings,
  type UpdateAccessProfileDto,
} from '@/lib/api-client';
import {
  PortalActionToolbar,
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { getAccessProfileDisplayName, getSystemBaseRoleLabel } from '@/lib/system-vocabulary';
import { getPortalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import { PORTAL_TENANT_ASSIGNABLE_ROLES } from '@/lib/user-labels';
import { ACCESS_SETTINGS_COPY, getAccessModuleLabel } from './mod00-settings-labels';

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

type CreationDraftState = {
  sourceName: string | null;
  initialPermissionKeys: AccessPermissionKey[];
};

const roleOptions = PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: getSystemBaseRoleLabel(role),
}));

function mapAccessControlError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) {
      return error.message && error.message !== 'Forbidden resource'
        ? error.message
        : 'Solo las personas administradoras pueden gestionar perfiles de acceso.';
    }
    return error.message;
  }

  return 'No fue posible cargar la vista de perfiles de acceso.';
}

function mapAuthenticationPolicyError(
  error: unknown,
  fallback: string = ACCESS_SETTINGS_COPY.authPolicyLoadError,
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) {
      return error.message && error.message !== 'Forbidden resource'
        ? error.message
        : 'Solo las personas administradoras pueden cambiar la política de autenticación.';
    }

    return error.message;
  }

  return fallback;
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

export function AccessControlSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const [catalog, setCatalog] = useState<AccessPermissionsCatalog | null>(null);
  const [profiles, setProfiles] = useState<AccessProfileView[]>([]);
  const [tenantSettings, setTenantSettings] = useState<TenantSelfSettings | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draftPermissionKeys, setDraftPermissionKeys] = useState<AccessPermissionKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPolicySaving, setIsPolicySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creationSelectorOpen, setCreationSelectorOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [creationDraft, setCreationDraft] = useState<CreationDraftState | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [activePermissionModule, setActivePermissionModule] = useState<string | null>(null);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [draftMfaRequiredAll, setDraftMfaRequiredAll] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const permissionTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const permissionTabsScrollRef = useRef<HTMLDivElement | null>(null);
  const creationDraftRef = useRef<CreationDraftState | null>(null);
  const [permissionTabsOverflow, setPermissionTabsOverflow] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const isAdmin = user?.role === UserRole.ADMIN;
  const tenantMfaRequiredAll = tenantSettings?.features.mfa_required_all ?? false;
  const isPolicyDirty = tenantSettings ? draftMfaRequiredAll !== tenantMfaRequiredAll : false;

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: createDefaultProfileFormValues(),
  });

  const watchedName = watch('name');
  const watchedDescription = watch('description');
  const watchedBaseRoleConstraint = watch('baseRoleConstraint');
  const watchedIsActive = watch('isActive');

  useEffect(() => {
    creationDraftRef.current = creationDraft;
  }, [creationDraft]);

  const loadAccessControl = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [permissionsCatalog, accessProfiles] = await Promise.all([
        accessControlApi.listPermissions(),
        accessControlApi.listProfiles(),
      ]);

      setCatalog(permissionsCatalog);
      setProfiles(accessProfiles);

      if (creationDraftRef.current) {
        return;
      }

      const customProfiles = accessProfiles.filter((p) => !p.isSystem);
      const nextSelectedProfileId = selectedProfileId ?? customProfiles[0]?.id ?? null;
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

  const loadAuthenticationPolicy = useCallback(async () => {
    setPolicyError(null);

    try {
      const settings = await tenantSelfApi.getSettings();
      setTenantSettings(settings);
    } catch (loadError) {
      setTenantSettings(null);
      setPolicyError(mapAuthenticationPolicyError(loadError));
    }
  }, []);

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

    void Promise.all([loadAccessControl(), loadAuthenticationPolicy()]);
  }, [authLoading, isAdmin, loadAccessControl, loadAuthenticationPolicy, user]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
  }, [isAdmin]);

  useEffect(() => {
    setDraftMfaRequiredAll(tenantMfaRequiredAll);
  }, [tenantMfaRequiredAll]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const draftProfile = useMemo<AccessProfileView | null>(() => {
    if (!creationDraft) {
      return null;
    }

    const fallbackName = creationDraft.sourceName
      ? `Basado en ${creationDraft.sourceName}`
      : 'Nuevo perfil';

    return {
      id: 'draft-profile',
      name: watchedName?.trim() || fallbackName,
      description: watchedDescription?.trim() || null,
      baseRoleConstraint: watchedBaseRoleConstraint ?? UserRole.NOC,
      scopeSiteId: null,
      isSystem: false,
      isActive: watchedIsActive ?? true,
      permissions: draftPermissionKeys,
      createdAt: '',
      updatedAt: '',
    };
  }, [
    creationDraft,
    draftPermissionKeys,
    watchedBaseRoleConstraint,
    watchedDescription,
    watchedIsActive,
    watchedName,
  ]);

  const profileForPermissions = draftProfile ?? selectedProfile;

  const permissionEntries = catalog?.permissions ?? [];

  const getTemplatePermissionKeys = useCallback(
    (profile: AccessProfileView): AccessPermissionKey[] => {
      if (
        profile.permissions.length > 0 ||
        !profile.isSystem ||
        !profile.baseRoleConstraint ||
        !catalog
      ) {
        return profile.permissions;
      }

      return catalog.compatibilityMatrix[profile.baseRoleConstraint] ?? [];
    },
    [catalog],
  );

  const assignablePermissionEntries = useMemo(
    () =>
      permissionEntries.filter(
        (permission) =>
          permission.isActive &&
          permission.availability === AccessPermissionAvailability.ASSIGNABLE,
      ),
    [permissionEntries],
  );

  const canEnablePermission = useCallback(
    (permissionKey: AccessPermissionKey): boolean => {
      if (permissionKey !== AccessPermissionKey.ACCESS_PROFILES_MANAGE) {
        return true;
      }

      return profileForPermissions?.baseRoleConstraint === UserRole.ADMIN;
    },
    [profileForPermissions?.baseRoleConstraint],
  );

  const selectablePermissionEntries = useMemo(() => {
    if (!catalog || !profileForPermissions) {
      return [] as AccessPermissionCatalogEntry[];
    }

    if (creationDraft || !profileForPermissions.isSystem) {
      return assignablePermissionEntries;
    }

    if (!profileForPermissions.baseRoleConstraint) {
      return [] as AccessPermissionCatalogEntry[];
    }

    const allowedKeys = new Set(
      catalog.compatibilityMatrix[profileForPermissions.baseRoleConstraint] ?? [],
    );

    return assignablePermissionEntries.filter((permission) =>
      allowedKeys.has(permission.permissionKey),
    );
  }, [assignablePermissionEntries, catalog, creationDraft, profileForPermissions]);

  const permissionModules = useMemo(() => {
    const groups: Array<{
      moduleKey: string;
      permissions: AccessPermissionCatalogEntry[];
    }> = [];
    const byModule = new Map<string, AccessPermissionCatalogEntry[]>();

    for (const entry of selectablePermissionEntries) {
      let bucket = byModule.get(entry.moduleKey);

      if (!bucket) {
        bucket = [];
        byModule.set(entry.moduleKey, bucket);
        groups.push({ moduleKey: entry.moduleKey, permissions: bucket });
      }

      bucket.push(entry);
    }

    return groups;
  }, [selectablePermissionEntries]);

  const activePermissionModuleConfig = useMemo(
    () => permissionModules.find((module) => module.moduleKey === activePermissionModule) ?? null,
    [activePermissionModule, permissionModules],
  );

  const filteredActivePermissions = useMemo(() => {
    if (!activePermissionModuleConfig) {
      return [] as AccessPermissionCatalogEntry[];
    }

    const normalizedSearch = permissionSearch.trim().toLocaleLowerCase('es');

    if (!normalizedSearch) {
      return activePermissionModuleConfig.permissions;
    }

    return activePermissionModuleConfig.permissions.filter((permission) =>
      permission.description.toLocaleLowerCase('es').includes(normalizedSearch),
    );
  }, [activePermissionModuleConfig, permissionSearch]);

  const systemTemplates = useMemo(() => profiles.filter((profile) => profile.isSystem), [profiles]);

  const previewTemplate = useMemo(
    () => systemTemplates.find((profile) => profile.id === previewTemplateId) ?? null,
    [previewTemplateId, systemTemplates],
  );

  const templatesGridClassName = useMemo(() => {
    if (systemTemplates.length >= 4) {
      return 'grid gap-3 md:grid-cols-2 xl:grid-cols-4';
    }

    if (systemTemplates.length === 3) {
      return 'grid gap-3 md:grid-cols-2 xl:grid-cols-3';
    }

    if (systemTemplates.length === 2) {
      return 'grid gap-3 md:grid-cols-2';
    }

    return 'grid gap-3';
  }, [systemTemplates.length]);

  const customRoles = useMemo(() => profiles.filter((profile) => !profile.isSystem), [profiles]);

  useEffect(() => {
    if (!profileForPermissions || permissionModules.length === 0) {
      setActivePermissionModule(null);
      return;
    }

    const preferredPermissionKeys =
      creationDraft?.initialPermissionKeys ?? selectedProfile?.permissions ?? [];

    const preferredModule =
      permissionModules.reduce<{
        moduleKey: string;
        permissions: AccessPermissionCatalogEntry[];
        selectedCount: number;
      } | null>((best, module) => {
        const selectedCount = module.permissions.filter((permission) =>
          preferredPermissionKeys.includes(permission.permissionKey),
        ).length;

        if (!best || selectedCount > best.selectedCount) {
          return { ...module, selectedCount };
        }

        return best;
      }, null) ?? null;

    setActivePermissionModule(
      preferredModule?.selectedCount
        ? preferredModule.moduleKey
        : (permissionModules[0]?.moduleKey ?? null),
    );
  }, [creationDraft, permissionModules, profileForPermissions, selectedProfile]);

  useEffect(() => {
    setPermissionSearch('');
  }, [activePermissionModule, creationDraft, selectedProfileId]);

  useEffect(() => {
    if (canEnablePermission(AccessPermissionKey.ACCESS_PROFILES_MANAGE)) {
      return;
    }

    setDraftPermissionKeys((current) =>
      current.filter(
        (permissionKey) => permissionKey !== AccessPermissionKey.ACCESS_PROFILES_MANAGE,
      ),
    );
  }, [canEnablePermission]);

  const updatePermissionTabsOverflow = useCallback(() => {
    const element = permissionTabsScrollRef.current;

    if (!element) {
      setPermissionTabsOverflow({
        hasOverflow: false,
        canScrollLeft: false,
        canScrollRight: false,
      });
      return;
    }

    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    const hasOverflow = maxScrollLeft > 1;
    const canScrollLeft = element.scrollLeft > 1;
    const canScrollRight = element.scrollLeft < maxScrollLeft - 1;

    setPermissionTabsOverflow({
      hasOverflow,
      canScrollLeft: hasOverflow && canScrollLeft,
      canScrollRight: hasOverflow && canScrollRight,
    });
  }, []);

  useEffect(() => {
    const element = permissionTabsScrollRef.current;

    if (!element) {
      return;
    }

    updatePermissionTabsOverflow();

    const handleScroll = () => {
      updatePermissionTabsOverflow();
    };

    element.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      element.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [permissionModules.length, updatePermissionTabsOverflow]);

  useEffect(() => {
    const moduleIndex = permissionModules.findIndex(
      (module) => module.moduleKey === activePermissionModule,
    );

    if (moduleIndex < 0) {
      return;
    }

    const activeTabElement = permissionTabRefs.current[moduleIndex];

    if (!activeTabElement) {
      return;
    }

    if (typeof activeTabElement.scrollIntoView === 'function') {
      activeTabElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }

    requestAnimationFrame(updatePermissionTabsOverflow);
  }, [activePermissionModule, permissionModules, updatePermissionTabsOverflow]);

  useEffect(() => {
    if (!previewTemplateId) return;

    document.body.classList.add('overflow-hidden');
    const focusFrame = window.requestAnimationFrame(() => {
      previewCloseButtonRef.current?.focus();
    });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closePreviewTemplate();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.classList.remove('overflow-hidden');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closePreviewTemplate, previewTemplateId]);

  const focusPermissionTabAt = useCallback(
    (index: number) => {
      if (permissionModules.length === 0) {
        return;
      }

      const nextIndex = (index + permissionModules.length) % permissionModules.length;
      const nextModule = permissionModules[nextIndex];

      if (!nextModule) {
        return;
      }

      setActivePermissionModule(nextModule.moduleKey);
      permissionTabRefs.current[nextIndex]?.focus();
    },
    [permissionModules],
  );

  const scrollPermissionTabs = useCallback((direction: 'left' | 'right') => {
    const element = permissionTabsScrollRef.current;

    if (!element) {
      return;
    }

    const delta = Math.max(120, Math.round(element.clientWidth * 0.65));

    element.scrollBy({
      left: direction === 'right' ? delta : -delta,
      behavior: 'smooth',
    });
  }, []);

  const handleSaveAuthenticationPolicy = useCallback(async () => {
    if (!tenantSettings) {
      return;
    }

    setIsPolicySaving(true);
    setPolicyError(null);
    setFeedback(null);

    try {
      const updated = await tenantSelfApi.updateSettings({
        features: { mfa_required_all: draftMfaRequiredAll },
      });

      setTenantSettings(updated);
      setFeedback(ACCESS_SETTINGS_COPY.authPolicySaveSuccess);
    } catch (saveError) {
      setPolicyError(
        mapAuthenticationPolicyError(saveError, ACCESS_SETTINGS_COPY.authPolicySaveError),
      );
    } finally {
      setIsPolicySaving(false);
    }
  }, [draftMfaRequiredAll, tenantSettings]);

  function selectProfile(profile: AccessProfileView) {
    setCreationDraft(null);
    setIsDialogOpen(false);
    setSelectedProfileId(profile.id);
    setDraftPermissionKeys(profile.permissions);
  }

  function cancelCreationDraft() {
    setCreationDraft(null);
    setIsDialogOpen(false);
    reset(createDefaultProfileFormValues());
    setDraftPermissionKeys(selectedProfile?.permissions ?? []);
  }

  function beginCreationFromTemplate(profile: AccessProfileView) {
    const visibleProfileName = getAccessProfileDisplayName(profile);
    const initialPermissionKeys = getTemplatePermissionKeys(profile);

    setCreationDraft({
      sourceName: visibleProfileName,
      initialPermissionKeys,
    });
    setSelectedProfileId(null);
    setEditingProfileId(null);
    reset({
      name: `Basado en ${visibleProfileName}`,
      description: profile.description ?? '',
      baseRoleConstraint: profile.baseRoleConstraint ?? UserRole.NOC,
      isActive: true,
    });
    setDraftPermissionKeys(initialPermissionKeys);
    setCreationSelectorOpen(false);
    setIsDialogOpen(true);
    setFeedback(null);
    setError(null);
  }

  function closePreviewTemplate(restoreFocus = true) {
    setPreviewTemplateId(null);

    if (!restoreFocus) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (previewTriggerRef.current?.isConnected) {
        previewTriggerRef.current.focus();
      }
    });
  }

  function openCreateDialog() {
    setCreationSelectorOpen(true);
  }

  function startFromScratch() {
    setCreationSelectorOpen(false);
    setCreationDraft(null);
    setEditingProfileId(null);
    reset(createDefaultProfileFormValues());
    setDraftPermissionKeys([]);
    setIsDialogOpen(true);
  }

  function startFromTemplate() {
    setCreationSelectorOpen(false);
    setFeedback('Elige una plantilla y pulsa "Usar como base" para comenzar.');
    setTimeout(() => {
      document
        .getElementById('templates-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function openEditDialog(profile: AccessProfileView) {
    setCreationDraft(null);
    setEditingProfileId(profile.id);
    reset(toProfileFormValues(profile));
    setIsDialogOpen(true);
  }

  async function onSubmit(values: ProfileFormValues) {
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const basePayload = {
        name: values.name.trim(),
        description: values.description?.trim() || null,
        baseRoleConstraint: values.baseRoleConstraint,
      };

      const payload: CreateAccessProfileDto | UpdateAccessProfileDto = editingProfileId
        ? { ...basePayload, isActive: values.isActive }
        : creationDraft
          ? { ...basePayload, permissionKeys: draftPermissionKeys }
          : basePayload;

      const profile = editingProfileId
        ? await accessControlApi.updateProfile(editingProfileId, payload as UpdateAccessProfileDto)
        : await accessControlApi.createProfile(payload as CreateAccessProfileDto);

      setIsDialogOpen(false);
      setCreationDraft(null);
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
        permissionKeys: draftPermissionKeys,
      });
      setProfiles((current) =>
        current.map((profile) => (profile.id === updated.id ? updated : profile)),
      );
      setSelectedProfileId(updated.id);
      setDraftPermissionKeys(updated.permissions);
      setFeedback('Accesos del perfil actualizados correctamente.');
    } catch (saveError) {
      setError(mapAccessControlError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function togglePermission(permissionKey: AccessPermissionKey) {
    setDraftPermissionKeys((current) =>
      current.includes(permissionKey)
        ? current.filter((item) => item !== permissionKey)
        : [...current, permissionKey],
    );
  }

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={ACCESS_SETTINGS_COPY.pageTitle}
          subtitle={ACCESS_SETTINGS_COPY.loadingSubtitle}
        />
        <PortalSkeletonBlock className="h-36" />
        <PortalSkeletonBlock className="h-80" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title={ACCESS_SETTINGS_COPY.pageTitle} subtitle="Sesión no disponible" />
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
        <PageHeader title={ACCESS_SETTINGS_COPY.pageTitle} subtitle="Acceso restringido" />
        <PortalAlert
          variant="info"
          title={ACCESS_SETTINGS_COPY.restrictedTitle}
          description={ACCESS_SETTINGS_COPY.restrictedDescription}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ACCESS_SETTINGS_COPY.pageTitle}
        subtitle={ACCESS_SETTINGS_COPY.pageSubtitle}
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

      {creationDraft ? (
        <PortalAlert
          variant="info"
          title={ACCESS_SETTINGS_COPY.draftBannerTitle}
          description={ACCESS_SETTINGS_COPY.draftBannerDescription(creationDraft.sourceName)}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsDialogOpen(true)}
              >
                Editar datos del nuevo perfil
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelCreationDraft}>
                Cancelar nuevo perfil
              </Button>
            </div>
          }
        />
      ) : null}

      <div id="politicas-de-autenticacion">
        <PortalPanel
          eyebrow={ACCESS_SETTINGS_COPY.authPolicyEyebrow}
          title={ACCESS_SETTINGS_COPY.authPolicyTitle}
          description={ACCESS_SETTINGS_COPY.authPolicyDescription}
          className="border-iwana-secondary/20 bg-white dark:border-iwana-secondary/15 dark:bg-dark-surface-2"
          actions={
            <span className="inline-flex items-center rounded-full border border-iwana-secondary/30 bg-white px-3 py-1 text-xs font-semibold text-iwana-secondary-700 dark:border-iwana-secondary/20 dark:bg-dark-surface-3 dark:text-iwana-secondary-300">
              {draftMfaRequiredAll
                ? ACCESS_SETTINGS_COPY.authPolicyStatusEnabled
                : ACCESS_SETTINGS_COPY.authPolicyStatusDisabled}
            </span>
          }
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
              <label
                htmlFor="access-auth-policy-mfa"
                className="flex items-start justify-between gap-4"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {ACCESS_SETTINGS_COPY.authPolicyToggleTitle}
                  </p>
                  <p
                    id="access-auth-policy-mfa-description"
                    className="mt-1 text-sm text-gray-500 dark:text-gray-400"
                  >
                    {ACCESS_SETTINGS_COPY.authPolicyToggleDescription}
                  </p>
                </div>
                <input
                  id="access-auth-policy-mfa"
                  type="checkbox"
                  aria-label={ACCESS_SETTINGS_COPY.authPolicyToggleLabel}
                  aria-describedby="access-auth-policy-mfa-description"
                  checked={draftMfaRequiredAll}
                  disabled={!tenantSettings || isPolicySaving}
                  onChange={(event) => {
                    setDraftMfaRequiredAll(event.target.checked);
                    setPolicyError(null);
                    setFeedback(null);
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                />
              </label>
            </div>

            {policyError ? (
              <PortalAlert
                variant="error"
                title="No fue posible actualizar la política"
                description={policyError}
              />
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ACCESS_SETTINGS_COPY.authPolicyAdminHint}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSaveAuthenticationPolicy()}
                disabled={!tenantSettings || !isPolicyDirty || isPolicySaving}
                loading={isPolicySaving}
              >
                {ACCESS_SETTINGS_COPY.authPolicySaveAction}
              </Button>
            </div>
          </div>
        </PortalPanel>
      </div>

      {systemTemplates.length > 0 ? (
        <div id="templates-section">
          <PortalPanel
            eyebrow="Plantillas base"
            title={ACCESS_SETTINGS_COPY.templatesTitle}
            description={ACCESS_SETTINGS_COPY.templatesDescription}
          >
            <div className={templatesGridClassName}>
              {systemTemplates.map((profile) => {
                const visibleProfileName = getAccessProfileDisplayName(profile);
                const templatePermissionKeys = getTemplatePermissionKeys(profile);

                return (
                  <div
                    key={profile.id}
                    className="flex h-full flex-col gap-3 rounded-2xl border border-iwana-secondary/20 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="portal-eyebrow-muted mb-1 inline-block">Sistema</span>
                        <p className="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                          {visibleProfileName}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          aria-label={`Ver accesos de ${visibleProfileName}`}
                          className="h-8 px-3 text-xs whitespace-nowrap"
                          onClick={(event) => {
                            previewTriggerRef.current = event.currentTarget;
                            setPreviewTemplateId(profile.id);
                          }}
                        >
                          Ver accesos
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          aria-label={`Usar ${visibleProfileName} como base`}
                          className="h-8 px-3 text-xs whitespace-nowrap"
                          onClick={() => beginCreationFromTemplate(profile)}
                        >
                          Usar como base
                        </Button>
                      </div>
                    </div>

                    <div className="min-h-[3.25rem]">
                      <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                        {profile.description || 'Plantilla inicial del sistema'}
                      </p>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{getSystemBaseRoleLabel(profile.baseRoleConstraint)}</span>
                      <span>·</span>
                      <span>{templatePermissionKeys.length} accesos</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </PortalPanel>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <PortalPanel
          eyebrow="Perfiles personalizados"
          title="Perfiles personalizados"
          description={ACCESS_SETTINGS_COPY.profilesDescription}
        >
          {customRoles.length === 0 ? (
            <PortalEmptyState
              title="Aún no has creado perfiles personalizados"
              description={ACCESS_SETTINGS_COPY.profilesEmptyDescription}
              action={
                <Button type="button" onClick={openCreateDialog}>
                  Crear perfil
                </Button>
              }
              icon={ShieldCheck}
            />
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {customRoles.map((profile) => {
                  const isSelected = !creationDraft && profile.id === selectedProfileId;

                  return (
                    <div
                      key={`${profile.id}-mobile`}
                      className={`rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2 ${isSelected ? 'border-l-4 border-l-iwana-secondary bg-iwana-surface-soft pl-3' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {profile.name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {profile.description || 'Sin descripción'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Badge variant={getPortalActiveBadgeVariant(profile.isActive)}>
                            {profile.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                          {isSelected ? (
                            <span className="inline-flex items-center rounded-full border border-iwana-secondary/30 bg-iwana-secondary-50 px-3 py-1 text-xs font-semibold text-iwana-secondary-700 dark:border-iwana-secondary/20 dark:bg-iwana-secondary/10 dark:text-iwana-secondary-300">
                              En edición
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
                          {getSystemBaseRoleLabel(profile.baseRoleConstraint)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-iwana-primary/10 bg-iwana-primary-50 px-3 py-1 font-medium text-iwana-primary dark:border-iwana-primary-400/20 dark:bg-iwana-primary/10 dark:text-iwana-primary-300">
                          {profile.permissions.length} accesos
                        </span>
                      </div>

                      <PortalActionToolbar
                        compact={true}
                        className="mt-4 bg-gray-50/90 dark:bg-dark-surface-3"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar accesos de ${profile.name}`}
                          className="w-full justify-center rounded-2xl"
                          onClick={() => selectProfile(profile)}
                        >
                          Editar accesos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar perfil ${profile.name}`}
                          className="w-full justify-center rounded-2xl"
                          onClick={() => openEditDialog(profile)}
                        >
                          Editar
                        </Button>
                        {!profile.isSystem ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Eliminar perfil ${profile.name}`}
                            className="w-full justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                            onClick={() => void handleDeleteProfile(profile.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden={true} />
                          </Button>
                        ) : null}
                      </PortalActionToolbar>
                    </div>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-2xl border border-gray-200/90 dark:border-dark-border md:block">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                  <thead className="bg-white dark:bg-dark-surface-3">
                    <tr>
                      <th scope="col" className={tableHeadClass}>
                        Perfil
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        {ACCESS_SETTINGS_COPY.roleColumnLabel}
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Accesos
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Estado
                      </th>
                      <th scope="col" className={tableHeadClass}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                    {customRoles.map((profile) => {
                      const isSelected = !creationDraft && profile.id === selectedProfileId;

                      return (
                        <tr
                          key={profile.id}
                          className={`transition-colors hover:bg-gray-50 dark:hover:bg-dark-surface-3 ${isSelected ? 'bg-iwana-surface-soft dark:bg-dark-surface-3/60' : ''}`}
                        >
                          <td
                            className={`${cellClass} ${isSelected ? 'border-l-4 border-iwana-secondary bg-iwana-surface-soft pl-3 dark:bg-dark-surface-3/40' : 'border-l-4 border-transparent'}`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <p className="font-medium text-gray-900 dark:text-white">
                                {profile.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {profile.description || 'Sin descripción'}
                              </p>
                            </div>
                          </td>
                          <td className={cellClass}>
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
                              {getSystemBaseRoleLabel(profile.baseRoleConstraint)}
                            </span>
                          </td>
                          <td className={cellClass}>
                            <span className="inline-flex items-center rounded-full border border-iwana-primary/10 bg-iwana-primary-50 px-3 py-1 text-xs font-medium text-iwana-primary dark:border-iwana-primary-400/20 dark:bg-iwana-primary/10 dark:text-iwana-primary-300">
                              {profile.permissions.length} accesos
                            </span>
                          </td>
                          <td className={cellClass}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={getPortalActiveBadgeVariant(profile.isActive)}>
                                {profile.isActive ? 'Activo' : 'Inactivo'}
                              </Badge>
                              {isSelected ? (
                                <span className="inline-flex items-center rounded-full border border-iwana-secondary/30 bg-iwana-secondary-50 px-3 py-1 text-xs font-semibold text-iwana-secondary-700 dark:border-iwana-secondary/20 dark:bg-iwana-secondary/10 dark:text-iwana-secondary-300">
                                  En edición
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className={cellClass}>
                            <PortalActionToolbar
                              compact={true}
                              align="end"
                              className="bg-gray-50/90 dark:bg-dark-surface-3"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Editar accesos de ${profile.name}`}
                                className="w-full justify-center rounded-2xl sm:w-auto"
                                onClick={() => selectProfile(profile)}
                              >
                                Editar accesos
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Editar perfil ${profile.name}`}
                                className="w-full justify-center rounded-2xl sm:w-auto"
                                onClick={() => openEditDialog(profile)}
                              >
                                Editar
                              </Button>
                              {!profile.isSystem ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  aria-label={`Eliminar perfil ${profile.name}`}
                                  className="w-full justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300 sm:w-auto"
                                  onClick={() => void handleDeleteProfile(profile.id)}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden={true} />
                                </Button>
                              ) : null}
                            </PortalActionToolbar>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PortalPanel>

        <div className="space-y-6">
          <PortalPanel
            eyebrow="Accesos"
            title={creationDraft ? 'Accesos del nuevo perfil' : 'Accesos del perfil'}
            description={
              profileForPermissions
                ? creationDraft
                  ? ACCESS_SETTINGS_COPY.draftSelectedProfileDescription(profileForPermissions.name)
                  : ACCESS_SETTINGS_COPY.selectedProfileDescription(profileForPermissions.name)
                : ACCESS_SETTINGS_COPY.noProfileSelectedDescription
            }
            headerClassName="gap-4"
            actions={
              profileForPermissions ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <PortalActionToolbar compact={true}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full px-3 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                      onClick={() => setDraftPermissionKeys([])}
                      disabled={isSaving}
                    >
                      Limpiar accesos
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-full px-3"
                      onClick={() =>
                        setDraftPermissionKeys(
                          creationDraft?.initialPermissionKeys ?? profileForPermissions.permissions,
                        )
                      }
                      disabled={isSaving}
                    >
                      Restablecer cambios
                    </Button>
                    {creationDraft ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full px-3"
                        onClick={() => setIsDialogOpen(true)}
                        disabled={isSaving}
                      >
                        Editar datos
                      </Button>
                    ) : null}
                  </PortalActionToolbar>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="rounded-full px-4 shadow-[var(--shadow-iwana)]"
                    onClick={() => {
                      if (creationDraft) {
                        void handleSubmit(onSubmit, () => setIsDialogOpen(true))();
                        return;
                      }

                      void handleSaveProfilePermissions();
                    }}
                    disabled={isSaving}
                  >
                    {creationDraft ? 'Guardar perfil' : 'Guardar'}
                  </Button>
                </div>
              ) : undefined
            }
          >
            {profileForPermissions ? (
              permissionModules.length > 0 ? (
                <div className="space-y-4">
                  <div className="relative">
                    <div
                      ref={permissionTabsScrollRef}
                      data-testid="permission-modules-scroll"
                      className="no-scrollbar overflow-x-auto border-b border-gray-200/80 pb-1 dark:border-dark-border"
                    >
                      <nav
                        role="tablist"
                        aria-label="Secciones de acceso"
                        className="-mb-px flex min-w-max gap-4"
                      >
                        {permissionModules.map((module, index) => {
                          const isActive = module.moduleKey === activePermissionModule;
                          const selectedCount = module.permissions.filter((permission) =>
                            draftPermissionKeys.includes(permission.permissionKey),
                          ).length;

                          return (
                            <button
                              key={module.moduleKey}
                              id={`access-permission-tab-${module.moduleKey}`}
                              ref={(element) => {
                                permissionTabRefs.current[index] = element;
                              }}
                              type="button"
                              role="tab"
                              aria-selected={isActive}
                              aria-controls={`access-permission-panel-${module.moduleKey}`}
                              tabIndex={isActive ? 0 : -1}
                              className={
                                isActive
                                  ? 'relative border-b-[3px] border-iwana-secondary px-2 py-3 text-sm font-semibold whitespace-nowrap text-iwana-secondary-700 outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:border-iwana-secondary dark:text-iwana-secondary-300'
                                  : 'relative border-b-[3px] border-transparent px-2 py-3 text-sm font-medium whitespace-nowrap text-gray-500 outline-none transition-colors hover:border-gray-200 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-200'
                              }
                              onClick={() => setActivePermissionModule(module.moduleKey)}
                              onKeyDown={(event) => {
                                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                                  event.preventDefault();
                                  focusPermissionTabAt(index + 1);
                                }

                                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                                  event.preventDefault();
                                  focusPermissionTabAt(index - 1);
                                }

                                if (event.key === 'Home') {
                                  event.preventDefault();
                                  focusPermissionTabAt(0);
                                }

                                if (event.key === 'End') {
                                  event.preventDefault();
                                  focusPermissionTabAt(permissionModules.length - 1);
                                }
                              }}
                            >
                              {getAccessModuleLabel(module.moduleKey)}
                              <span className="ml-2 text-xs font-normal normal-case text-gray-500 dark:text-gray-400">
                                {selectedCount}/{module.permissions.length}
                              </span>
                              {isActive ? (
                                <div className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-full bg-iwana-secondary" />
                              ) : null}
                            </button>
                          );
                        })}
                      </nav>
                    </div>

                    {permissionTabsOverflow.hasOverflow ? (
                      <>
                        <div
                          aria-hidden={true}
                          className={`pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-white via-white/94 to-iwana-primary-50/10 transition-opacity dark:from-dark-surface dark:via-dark-surface dark:to-transparent ${permissionTabsOverflow.canScrollLeft ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <div
                          aria-hidden={true}
                          className={`pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-white via-white/94 to-iwana-surface-soft/60 transition-opacity dark:from-dark-surface dark:via-dark-surface dark:to-transparent ${permissionTabsOverflow.canScrollRight ? 'opacity-100' : 'opacity-0'}`}
                        />

                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-1">
                          <button
                            type="button"
                            aria-label="Desplazar secciones a la izquierda"
                            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-iwana-primary/10 bg-white/92 text-iwana-primary-700 shadow-[var(--shadow-iwana)] backdrop-blur-sm transition hover:border-iwana-primary/20 hover:bg-iwana-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-0 dark:border-dark-border dark:bg-dark-surface-2/92 dark:text-gray-200 dark:hover:bg-dark-surface-3"
                            disabled={!permissionTabsOverflow.canScrollLeft}
                            onClick={() => scrollPermissionTabs('left')}
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden={true} />
                          </button>
                        </div>

                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1">
                          <button
                            type="button"
                            aria-label="Desplazar secciones a la derecha"
                            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-iwana-primary/10 bg-white/92 text-iwana-primary-700 shadow-[var(--shadow-iwana)] backdrop-blur-sm transition hover:border-iwana-primary/20 hover:bg-iwana-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-0 dark:border-dark-border dark:bg-dark-surface-2/92 dark:text-gray-200 dark:hover:bg-dark-surface-3"
                            disabled={!permissionTabsOverflow.canScrollRight}
                            onClick={() => scrollPermissionTabs('right')}
                          >
                            <ChevronRight className="h-4 w-4" aria-hidden={true} />
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {activePermissionModuleConfig ? (
                    <div
                      id={`access-permission-panel-${activePermissionModuleConfig.moduleKey}`}
                      role="tabpanel"
                      aria-labelledby={`access-permission-tab-${activePermissionModuleConfig.moduleKey}`}
                      className="space-y-3"
                    >
                      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-4 dark:border-dark-border dark:bg-dark-surface-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Ajusta solo los accesos de la sección{' '}
                            <span className="font-medium text-gray-700 dark:text-gray-200">
                              {getAccessModuleLabel(activePermissionModuleConfig.moduleKey)}
                            </span>
                            .
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {filteredActivePermissions.length} de{' '}
                            {activePermissionModuleConfig.permissions.length} accesos visibles
                          </p>
                        </div>

                        <div className="w-full md:max-w-xs">
                          <label htmlFor="permission-search" className="sr-only">
                            Buscar acceso dentro de esta sección
                          </label>
                          <Input
                            id="permission-search"
                            value={permissionSearch}
                            onChange={(event) => setPermissionSearch(event.target.value)}
                            placeholder="Buscar acceso dentro de esta sección"
                            className="portal-input-surface h-11"
                          />
                        </div>
                      </div>

                      {filteredActivePermissions.length > 0 ? (
                        <div className="grid gap-2">
                          {filteredActivePermissions.map((permission) => {
                            const isEnabled = canEnablePermission(permission.permissionKey);

                            return (
                              <label
                                key={permission.id}
                                className={`flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-dark-border ${isEnabled ? 'text-gray-700 dark:text-gray-200' : 'bg-gray-50 text-gray-500 dark:bg-dark-surface-3/60 dark:text-gray-400'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={draftPermissionKeys.includes(permission.permissionKey)}
                                  onChange={() => togglePermission(permission.permissionKey)}
                                  disabled={!isEnabled}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                                />
                                <span>
                                  <span className="block font-medium text-gray-900 dark:text-white">
                                    {permission.description}
                                  </span>
                                  {!isEnabled ? (
                                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                                      Solo el perfil Administrador general puede crear, editar o
                                      desactivar perfiles de acceso.
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <PortalEmptyState
                          title="No encontramos accesos en esta sección"
                          description="Ajusta el texto de búsqueda o cambia de sección para seguir editando accesos."
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <PortalEmptyState
                  title={ACCESS_SETTINGS_COPY.noCompatiblePermissionsTitle}
                  description={ACCESS_SETTINGS_COPY.noCompatiblePermissionsDescription}
                />
              )
            ) : (
              <PortalEmptyState
                title="Sin perfil seleccionado"
                description={ACCESS_SETTINGS_COPY.noProfileSelectedDescription}
              />
            )}
          </PortalPanel>
        </div>
      </div>

      {/* Drawer lateral — Vista previa de plantilla */}
      {previewTemplate ? (
        <div
          className="fixed inset-0 z-10000 bg-black/55 backdrop-blur-sm"
          onClick={() => closePreviewTemplate()}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-template-title"
            className="absolute inset-y-0 right-0 z-10001 flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-dark-border dark:bg-dark-surface-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur-sm dark:border-dark-border dark:bg-dark-surface-2/95">
              <div className="min-w-0 flex-1">
                <p className="portal-eyebrow">Accesos de la plantilla</p>
                <h2
                  id="preview-template-title"
                  className="mt-0.5 text-base font-semibold text-gray-900 dark:text-white"
                >
                  {getAccessProfileDisplayName(previewTemplate)}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {previewTemplate.description || 'Plantilla inicial del sistema'}
                </p>
              </div>
              <button
                ref={previewCloseButtonRef}
                type="button"
                aria-label="Cerrar vista previa"
                onClick={() => closePreviewTemplate()}
                className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-400"
              >
                <X className="h-4 w-4" aria-hidden={true} />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-2.5 text-xs text-gray-500 dark:border-dark-border dark:text-gray-400">
              <span>{getSystemBaseRoleLabel(previewTemplate.baseRoleConstraint)}</span>
              <span>·</span>
              <span>{getTemplatePermissionKeys(previewTemplate).length} accesos</span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {getTemplatePermissionKeys(previewTemplate).length > 0 ? (
                <ul className="space-y-2">
                  {getTemplatePermissionKeys(previewTemplate).map((permKey) => {
                    const entry = permissionEntries.find(
                      (permission) => permission.permissionKey === permKey,
                    );
                    return (
                      <li
                        key={permKey}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200"
                      >
                        {entry?.description ?? permKey}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Sin accesos asignados a esta plantilla.</p>
              )}
            </div>

            <div className="border-t border-gray-100 bg-white/95 px-5 py-4 backdrop-blur-sm dark:border-dark-border dark:bg-dark-surface-2/95">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  closePreviewTemplate(false);
                  beginCreationFromTemplate(previewTemplate);
                }}
              >
                Usar {getAccessProfileDisplayName(previewTemplate)} como base
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      <Dialog open={creationSelectorOpen} onOpenChange={setCreationSelectorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nuevo perfil</DialogTitle>
            <DialogDescription>¿Cómo quieres crear este perfil?</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <button
              type="button"
              onClick={startFromTemplate}
              className="flex w-full items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left hover:border-iwana-primary hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3"
            >
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-iwana-primary"
                aria-hidden={true}
              />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Usar una plantilla</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Parte de una plantilla del sistema para configurar el perfil más rápido.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={startFromScratch}
              className="flex w-full items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left hover:border-iwana-primary hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3"
            >
              <Plus className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden={true} />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Empezar desde cero</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Crea el perfil desde cero y define sus accesos paso a paso.
                </p>
              </div>
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancelar
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent aria-labelledby="access-profile-dialog-title">
          <DialogHeader>
            <DialogTitle id="access-profile-dialog-title">
              {editingProfileId ? 'Editar perfil' : 'Crear perfil'}
            </DialogTitle>
            <DialogDescription>
              {editingProfileId
                ? ACCESS_SETTINGS_COPY.editProfileDescription
                : ACCESS_SETTINGS_COPY.createProfileDescription}
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
                {ACCESS_SETTINGS_COPY.roleFieldLabel}
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
