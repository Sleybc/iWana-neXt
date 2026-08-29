'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, Plus, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  CheckboxCard,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
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
  PortalDataTableHead,
  PortalEmptyState,
  PortalPanel,
  PortalSidePeek,
  PortalSkeletonBlock,
  interactiveFocusClassName,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
  portalModuleTabTriggerClassName,
  portalModuleTabsTrackClassName,
  portalTableRowHoverClassName,
} from '@/components/shared/portal-ui';
import { getAccessProfileDisplayName, getSystemBaseRoleLabel } from '@/lib/system-vocabulary';
import { getPortalActiveBadgeVariant } from '@/lib/portal-status-badge-rules';
import { PORTAL_TENANT_ASSIGNABLE_ROLES } from '@/lib/user-labels';
import { ACCESS_SETTINGS_COPY, getAccessModuleLabel } from './mod00-settings-labels';

const profileFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(120, 'Máximo 120 caracteres.'),
  description: z.string().trim().max(1000, 'Máximo 1000 caracteres.').optional(),
  baseRoleConstraint: z.nativeEnum(UserRole),
  isActive: z.boolean(),
});

type AccessControlErrorContext = 'load' | 'save' | 'delete';

type ProfileFormValues = z.infer<typeof profileFormSchema>;

type CreationDraftState = {
  sourceName: string | null;
  initialPermissionKeys: AccessPermissionKey[];
};

const roleOptions = PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: getSystemBaseRoleLabel(role),
}));

function mapAccessControlError(
  error: unknown,
  context: AccessControlErrorContext = 'load',
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return ACCESS_SETTINGS_COPY.sessionExpiredError;
    }
    if (error.status === 403) {
      return ACCESS_SETTINGS_COPY.forbiddenProfilesError;
    }
  }

  if (context === 'save') {
    return ACCESS_SETTINGS_COPY.saveProfileError;
  }

  if (context === 'delete') {
    return ACCESS_SETTINGS_COPY.deleteProfileError;
  }

  return ACCESS_SETTINGS_COPY.loadProfilesError;
}

function mapAuthenticationPolicyError(
  error: unknown,
  fallback: string = ACCESS_SETTINGS_COPY.authPolicyLoadError,
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return ACCESS_SETTINGS_COPY.sessionExpiredError;
    }
    if (error.status === 403) {
      return ACCESS_SETTINGS_COPY.authPolicyForbiddenError;
    }
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

/** Orden canónico de los 9 sugeridos (spec MOD00 §3.3, congelado). */
const SYSTEM_TEMPLATE_PROFILE_ORDER: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.SALES,
  UserRole.TECHNICIAN,
  UserRole.ACCOUNTANT,
  UserRole.HR,
  UserRole.CONTRACTOR,
  UserRole.AUDITOR,
];

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
  const [profilePendingDeletion, setProfilePendingDeletion] = useState<AccessProfileView | null>(
    null,
  );
  const [activePermissionModule, setActivePermissionModule] = useState<string | null>(null);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [draftMfaRequiredAll, setDraftMfaRequiredAll] = useState(false);
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
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

  // Orden congelado por tipo de usuario (spec MOD00 §3.3): lista fija en el
  // cliente, invariante ante reordenamientos del array de la API (CA-ACV2-03).
  // SUBSCRIBER/PARTNER/INVESTOR no tienen plantilla; bases desconocidas van al
  // final conservando su orden de llegada.
  const orderedSystemTemplates = useMemo(() => {
    const orderIndex = new Map<UserRole, number>(
      SYSTEM_TEMPLATE_PROFILE_ORDER.map((role, index) => [role, index]),
    );

    return systemTemplates
      .map((profile, index) => ({
        profile,
        rank: orderIndex.get(profile.baseRoleConstraint as UserRole) ?? Number.MAX_SAFE_INTEGER,
        index,
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.profile);
  }, [systemTemplates]);

  const previewTemplate = useMemo(
    () => systemTemplates.find((profile) => profile.id === previewTemplateId) ?? null,
    [previewTemplateId, systemTemplates],
  );

  const templatesGridClassName = 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

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

  function closePreviewTemplate() {
    setPreviewTemplateId(null);

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
    setFeedback(ACCESS_SETTINGS_COPY.chooseSuggestedFeedback);
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
      setError(mapAccessControlError(submitError, 'save'));
    } finally {
      setIsSaving(false);
    }
  }

  function requestProfileDeletion(profile: AccessProfileView) {
    setProfilePendingDeletion(profile);
  }

  function closeDeletionDialog() {
    setProfilePendingDeletion(null);
  }

  async function confirmProfileDeletion() {
    if (!profilePendingDeletion) {
      return;
    }

    const profileId = profilePendingDeletion.id;
    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await accessControlApi.deleteProfile(profileId);
      setProfilePendingDeletion(null);
      setFeedback('Perfil eliminado correctamente.');
      if (selectedProfileId === profileId) {
        setSelectedProfileId(null);
        setDraftPermissionKeys([]);
      }
      await loadAccessControl();
    } catch (deleteError) {
      setError(mapAccessControlError(deleteError, 'delete'));
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
      setError(mapAccessControlError(saveError, 'save'));
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
      <div className="space-y-4">
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
      <div className="space-y-4">
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
      <div className="space-y-4">
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
    <div className="space-y-4">
      <PageHeader
        title={ACCESS_SETTINGS_COPY.pageTitle}
        subtitle={ACCESS_SETTINGS_COPY.pageSubtitle}
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
            <Button
              type="button"
              variant="link"
              size="lg"
              className="min-h-11"
              onClick={() => void loadAccessControl()}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              {ACCESS_SETTINGS_COPY.retryAction}
            </Button>
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
                className="min-h-11"
                onClick={() => setIsDialogOpen(true)}
              >
                Editar datos del nuevo perfil
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={cancelCreationDraft}
              >
                Cancelar nuevo perfil
              </Button>
            </div>
          }
        />
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <PortalPanel
          compact={customRoles.length === 0}
          title={ACCESS_SETTINGS_COPY.profilesTitle}
          description={
            customRoles.length === 0 ? undefined : ACCESS_SETTINGS_COPY.profilesDescription
          }
          actions={
            customRoles.length > 0 ? (
              <Button type="button" size="lg" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" aria-hidden={true} />
                {ACCESS_SETTINGS_COPY.createProfileAction}
              </Button>
            ) : undefined
          }
        >
          {customRoles.length === 0 ? (
            <PortalEmptyState
              embedded={true}
              title={ACCESS_SETTINGS_COPY.profilesEmptyTitle}
              description={ACCESS_SETTINGS_COPY.profilesEmptyDescription}
              action={
                <Button type="button" size="lg" onClick={openCreateDialog}>
                  {ACCESS_SETTINGS_COPY.createProfileAction}
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

                      <PortalActionToolbar compact={true} className="mt-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar accesos de ${profile.name}`}
                          className="w-full justify-center rounded-2xl min-h-11"
                          onClick={() => selectProfile(profile)}
                        >
                          Editar accesos
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar perfil ${profile.name}`}
                          className="w-full justify-center rounded-2xl min-h-11"
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
                            className="w-full justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 min-h-11 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                            onClick={() => requestProfileDeletion(profile)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden={true} />
                          </Button>
                        ) : null}
                      </PortalActionToolbar>
                    </div>
                  );
                })}
              </div>

              <div className={`${portalDataTableShellClassName} hidden md:block`}>
                <table className="min-w-full">
                  <thead className={portalDataTableHeadRowClassName}>
                    <tr>
                      <PortalDataTableHead>Perfil</PortalDataTableHead>
                      <PortalDataTableHead>
                        {ACCESS_SETTINGS_COPY.roleColumnLabel}
                      </PortalDataTableHead>
                      <PortalDataTableHead>Accesos</PortalDataTableHead>
                      <PortalDataTableHead>Estado</PortalDataTableHead>
                      <PortalDataTableHead>Acciones</PortalDataTableHead>
                    </tr>
                  </thead>
                  <tbody className={portalDataTableBodyClassName}>
                    {customRoles.map((profile) => {
                      const isSelected = !creationDraft && profile.id === selectedProfileId;

                      return (
                        <tr
                          key={profile.id}
                          className={cn(
                            portalTableRowHoverClassName,
                            isSelected && 'bg-iwana-surface-soft dark:bg-dark-surface-3/60',
                          )}
                        >
                          <td
                            className={cn(
                              portalDataTableCellClassName,
                              isSelected
                                ? 'border-l-4 border-iwana-secondary bg-iwana-surface-soft pl-3 dark:bg-dark-surface-3/40'
                                : 'border-l-4 border-transparent',
                            )}
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
                          <td className={portalDataTableCellClassName}>
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200">
                              {getSystemBaseRoleLabel(profile.baseRoleConstraint)}
                            </span>
                          </td>
                          <td className={portalDataTableCellClassName}>
                            <span className="inline-flex items-center rounded-full border border-iwana-primary/10 bg-iwana-primary-50 px-3 py-1 text-xs font-medium text-iwana-primary dark:border-iwana-primary-400/20 dark:bg-iwana-primary/10 dark:text-iwana-primary-300">
                              {profile.permissions.length} accesos
                            </span>
                          </td>
                          <td className={portalDataTableCellClassName}>
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
                          <td className={portalDataTableCellClassName}>
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
                                className="min-h-11 w-full justify-center rounded-2xl sm:w-auto"
                                onClick={() => selectProfile(profile)}
                              >
                                Editar accesos
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Editar perfil ${profile.name}`}
                                className="min-h-11 w-full justify-center rounded-2xl sm:w-auto"
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
                                  className="min-h-11 w-full justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300 sm:w-auto"
                                  onClick={() => requestProfileDeletion(profile)}
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

        <div className="space-y-4">
          <PortalPanel
            compact={!profileForPermissions}
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
                      className="min-h-11 rounded-full px-3 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                      onClick={() => setDraftPermissionKeys([])}
                      disabled={isSaving}
                    >
                      Limpiar accesos
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 rounded-full px-3"
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
                        className="min-h-11 rounded-full px-3"
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
                    size="lg"
                    onClick={() => {
                      if (creationDraft) {
                        void handleSubmit(onSubmit, () => setIsDialogOpen(true))();
                        return;
                      }

                      void handleSaveProfilePermissions();
                    }}
                    disabled={isSaving}
                  >
                    {creationDraft
                      ? ACCESS_SETTINGS_COPY.saveDraftAction
                      : ACCESS_SETTINGS_COPY.saveChangesAction}
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
                      className="no-scrollbar overflow-x-auto"
                    >
                      <nav
                        role="tablist"
                        aria-label="Secciones de acceso"
                        className={cn(portalModuleTabsTrackClassName, 'min-w-max flex-nowrap')}
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
                              data-state={isActive ? 'active' : 'inactive'}
                              tabIndex={isActive ? 0 : -1}
                              className={cn(
                                portalModuleTabTriggerClassName,
                                'group min-h-11 whitespace-nowrap px-3',
                              )}
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
                              <span className="ml-2 text-xs font-normal normal-case text-gray-600 group-data-[state=active]:text-white dark:text-gray-300 dark:group-data-[state=active]:text-white">
                                {selectedCount}/{module.permissions.length}
                              </span>
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
                            className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-iwana-primary/10 bg-white/92 text-iwana-primary-700 backdrop-blur-sm transition hover:border-iwana-primary/20 hover:bg-iwana-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-0 dark:border-dark-border dark:bg-dark-surface-2/92 dark:text-gray-200 dark:hover:bg-dark-surface-3"
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
                            className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-iwana-primary/10 bg-white/92 text-iwana-primary-700 backdrop-blur-sm transition hover:border-iwana-primary/20 hover:bg-iwana-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-0 dark:border-dark-border dark:bg-dark-surface-2/92 dark:text-gray-200 dark:hover:bg-dark-surface-3"
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
                              <CheckboxCard
                                key={permission.id}
                                label={permission.description}
                                description={
                                  isEnabled
                                    ? undefined
                                    : 'Solo el perfil Administrador general puede crear, editar o desactivar perfiles de acceso.'
                                }
                                checked={draftPermissionKeys.includes(permission.permissionKey)}
                                onChange={() => togglePermission(permission.permissionKey)}
                                disabled={!isEnabled}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <PortalEmptyState
                          embedded={true}
                          title={ACCESS_SETTINGS_COPY.searchEmptyTitle}
                          description="Ajusta el texto de búsqueda o cambia de sección para seguir editando accesos."
                          action={
                            <Button
                              type="button"
                              variant="link"
                              size="lg"
                              className="min-h-11"
                              onClick={() => setPermissionSearch('')}
                            >
                              {ACCESS_SETTINGS_COPY.clearSearchAction}
                            </Button>
                          }
                        />
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <PortalEmptyState
                  embedded={true}
                  title={ACCESS_SETTINGS_COPY.noCompatiblePermissionsTitle}
                  description={ACCESS_SETTINGS_COPY.noCompatiblePermissionsDescription}
                />
              )
            ) : null}
          </PortalPanel>
        </div>
      </div>

      {systemTemplates.length > 0 ? (
        <div id="templates-section">
          <PortalPanel
            compact={true}
            title={ACCESS_SETTINGS_COPY.templatesTitle}
            description={ACCESS_SETTINGS_COPY.templatesDescription}
          >
            <div className={templatesGridClassName}>
              {orderedSystemTemplates.map((profile) => {
                const visibleProfileName = getAccessProfileDisplayName(profile);
                const templatePermissionKeys = getTemplatePermissionKeys(profile);

                return (
                  <div
                    key={profile.id}
                    className="flex h-full flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-dark-border dark:bg-dark-surface-2"
                  >
                    <div className="min-w-0">
                      <p className="text-base font-semibold leading-6 text-pretty text-gray-900 dark:text-white">
                        {visibleProfileName}
                      </p>
                    </div>

                    <div>
                      <p className="line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                        {profile.description || ACCESS_SETTINGS_COPY.templateFallbackDescription}
                      </p>
                    </div>

                    <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {getSystemBaseRoleLabel(profile.baseRoleConstraint)} ·{' '}
                        {templatePermissionKeys.length} accesos
                      </span>
                    </div>

                    <div className="mt-auto flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11 w-full justify-center border border-gray-200/80 bg-iwana-surface-soft hover:bg-iwana-secondary-50 dark:border-dark-border dark:bg-dark-surface-3 dark:hover:bg-dark-surface-4"
                        aria-label={`${ACCESS_SETTINGS_COPY.previewAction} ${visibleProfileName}`}
                        onClick={(event) => {
                          previewTriggerRef.current = event.currentTarget;
                          setPreviewTemplateId(profile.id);
                        }}
                      >
                        {ACCESS_SETTINGS_COPY.previewAction}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="min-h-11 w-full justify-center"
                        aria-label={`${ACCESS_SETTINGS_COPY.createFromTemplateAction} ${visibleProfileName}`}
                        onClick={() => beginCreationFromTemplate(profile)}
                      >
                        {ACCESS_SETTINGS_COPY.createFromTemplateAction}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </PortalPanel>
        </div>
      ) : null}

      <div id="politicas-de-autenticacion">
        <PortalPanel
          compact={true}
          eyebrow={ACCESS_SETTINGS_COPY.authPolicyEyebrow}
          title={ACCESS_SETTINGS_COPY.authPolicyTitle}
          description={ACCESS_SETTINGS_COPY.authPolicyDescription}
          actions={
            <span
              className={
                draftMfaRequiredAll
                  ? 'inline-flex items-center rounded-full bg-iwana-secondary-100 px-3 py-1 text-xs font-semibold text-iwana-secondary-900'
                  : 'inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-200'
              }
            >
              {draftMfaRequiredAll
                ? ACCESS_SETTINGS_COPY.authPolicyStatusEnabled
                : ACCESS_SETTINGS_COPY.authPolicyStatusDisabled}
            </span>
          }
        >
          <div className="space-y-4">
            <CheckboxCard
              label={ACCESS_SETTINGS_COPY.authPolicyToggleTitle}
              description={ACCESS_SETTINGS_COPY.authPolicyToggleDescription}
              aria-label={ACCESS_SETTINGS_COPY.authPolicyToggleLabel}
              checked={draftMfaRequiredAll}
              disabled={!tenantSettings || isPolicySaving}
              onChange={(event) => {
                setDraftMfaRequiredAll(event.target.checked);
                setPolicyError(null);
                setFeedback(null);
              }}
            />

            {policyError ? (
              <PortalAlert
                variant="error"
                title="No fue posible actualizar la política"
                description={policyError}
              />
            ) : null}

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ACCESS_SETTINGS_COPY.authPolicyAdminHint}
              </p>
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
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

      <PortalSidePeek
        open={Boolean(previewTemplate)}
        onClose={closePreviewTemplate}
        title={previewTemplate ? getAccessProfileDisplayName(previewTemplate) : ''}
        eyebrow={ACCESS_SETTINGS_COPY.peekEyebrow}
        footer={
          previewTemplate ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => {
                const template = previewTemplate;
                closePreviewTemplate();
                beginCreationFromTemplate(template);
              }}
            >
              {ACCESS_SETTINGS_COPY.createFromTemplateAction}
            </Button>
          ) : null
        }
      >
        {previewTemplate ? (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span>
                {getSystemBaseRoleLabel(previewTemplate.baseRoleConstraint)} ·{' '}
                {getTemplatePermissionKeys(previewTemplate).length} accesos
              </span>
            </div>
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
                      {entry?.description ?? ACCESS_SETTINGS_COPY.permissionFallback}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">{ACCESS_SETTINGS_COPY.peekEmptyDescription}</p>
            )}
          </div>
        ) : null}
      </PortalSidePeek>

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
              className={cn(
                'flex w-full items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left hover:border-iwana-primary hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3',
                interactiveFocusClassName,
              )}
            >
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-iwana-primary"
                aria-hidden={true}
              />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {ACCESS_SETTINGS_COPY.useSuggestedSelector}
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  {ACCESS_SETTINGS_COPY.useSuggestedHelp}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={startFromScratch}
              className={cn(
                'flex w-full items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left hover:border-iwana-primary hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-surface-3',
                interactiveFocusClassName,
              )}
            >
              <Plus className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden={true} />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {ACCESS_SETTINGS_COPY.startFromScratchLabel}
                </p>
                <p className="mt-0.5 text-sm text-gray-500">
                  {ACCESS_SETTINGS_COPY.startFromScratchHelp}
                </p>
              </div>
            </button>
          </div>
          <div className="flex justify-end pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="min-h-11">
                {ACCESS_SETTINGS_COPY.cancelAction}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent aria-labelledby="access-profile-dialog-title">
          <DialogHeader>
            <DialogTitle id="access-profile-dialog-title">
              {editingProfileId ? 'Editar perfil' : ACCESS_SETTINGS_COPY.createProfileAction}
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

            <CheckboxCard
              label={ACCESS_SETTINGS_COPY.keepProfileActiveLabel}
              {...register('isActive')}
            />

            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="min-h-11">
                  {ACCESS_SETTINGS_COPY.cancelAction}
                </Button>
              </DialogClose>
              <Button type="submit" size="lg" disabled={isSaving}>
                {editingProfileId
                  ? ACCESS_SETTINGS_COPY.saveChangesAction
                  : ACCESS_SETTINGS_COPY.createProfileAction}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={profilePendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeletionDialog();
          }
        }}
      >
        <DialogContent aria-labelledby="access-profile-delete-dialog-title" className="max-w-md">
          <DialogHeader>
            <DialogTitle id="access-profile-delete-dialog-title">
              {profilePendingDeletion
                ? ACCESS_SETTINGS_COPY.deleteDialogTitle(profilePendingDeletion.name)
                : ''}
            </DialogTitle>
            <DialogDescription>{ACCESS_SETTINGS_COPY.deleteDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={isSaving}
              onClick={closeDeletionDialog}
            >
              {ACCESS_SETTINGS_COPY.cancelAction}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              loading={isSaving}
              disabled={isSaving}
              onClick={() => void confirmProfileDeletion()}
            >
              {ACCESS_SETTINGS_COPY.deleteConfirmAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
