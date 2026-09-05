'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import Link from 'next/link';
import {
  Controller,
  useForm,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Plus, RefreshCcw, Save, ShieldCheck, Trash2 } from 'lucide-react';
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
  portalResourceTabIconClassName,
  portalResourceTabListClassName,
  portalResourceTabTriggerClassName,
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

type NextStepBannerState = {
  origin: 'suggested' | 'scratch';
  profileName: string;
};

const roleOptions = PORTAL_TENANT_ASSIGNABLE_ROLES.map((role) => ({
  value: role,
  label: getSystemBaseRoleLabel(role),
}));

function ProfileIdentityFields({
  register,
  control,
  errors,
  nameInputRef,
}: {
  register: UseFormRegister<ProfileFormValues>;
  control: Control<ProfileFormValues>;
  errors: FieldErrors<ProfileFormValues>;
  nameInputRef: MutableRefObject<HTMLInputElement | null>;
}) {
  const nameRegister = register('name');

  return (
    <div className="space-y-4">
      <Input
        id="profile-name"
        label="Nombre"
        error={errors.name?.message}
        className="h-11"
        {...nameRegister}
        ref={(element) => {
          nameRegister.ref(element);
          nameInputRef.current = element;
        }}
      />

      <Input
        id="profile-description"
        label="Descripción"
        error={errors.description?.message}
        className="h-11"
        {...register('description')}
      />

      <Controller
        name="baseRoleConstraint"
        control={control}
        render={({ field }) => (
          <Select
            id="profile-role"
            label={ACCESS_SETTINGS_COPY.roleFieldLabel}
            helperText={ACCESS_SETTINGS_COPY.roleFieldHelp}
            error={errors.baseRoleConstraint?.message ?? ''}
            options={roleOptions}
            className="min-h-11"
            name={field.name}
            value={field.value}
            onChange={(event) => field.onChange(event.target.value)}
            onBlur={field.onBlur}
            ref={field.ref}
          />
        )}
      />

      <CheckboxCard label={ACCESS_SETTINGS_COPY.keepProfileActiveLabel} {...register('isActive')} />
    </div>
  );
}

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
  const [nextStepBanner, setNextStepBanner] = useState<NextStepBannerState | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creationPeekOpen, setCreationPeekOpen] = useState(false);
  const [creationPeekDetailId, setCreationPeekDetailId] = useState<string | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [creationDraft, setCreationDraft] = useState<CreationDraftState | null>(null);
  const [profilePendingDeletion, setProfilePendingDeletion] = useState<AccessProfileView | null>(
    null,
  );
  const [activePermissionModule, setActivePermissionModule] = useState<string | null>(null);
  const [permissionSearch, setPermissionSearch] = useState('');
  const [draftMfaRequiredAll, setDraftMfaRequiredAll] = useState(false);
  const profileNameInputRef = useRef<HTMLInputElement | null>(null);
  const peekMomentRef = useRef<HTMLDivElement | null>(null);
  const peekWasOpenRef = useRef(false);
  const shouldFocusNameRef = useRef(false);
  const creationDraftRef = useRef<CreationDraftState | null>(null);

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

  useEffect(() => {
    if (!creationDraft || !shouldFocusNameRef.current) {
      return;
    }

    let cancelled = false;
    const tryFocus = () => {
      if (cancelled) {
        return;
      }

      const field = document.getElementById('profile-name');
      if (field instanceof HTMLElement) {
        shouldFocusNameRef.current = false;
        field.focus();
        return;
      }

      window.requestAnimationFrame(tryFocus);
    };

    const frame = window.requestAnimationFrame(tryFocus);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [creationDraft]);

  useEffect(() => {
    const justOpened = creationPeekOpen && !peekWasOpenRef.current;
    peekWasOpenRef.current = creationPeekOpen;

    if (!creationPeekOpen || justOpened) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const root = peekMomentRef.current;
      if (!root) {
        return;
      }

      const firstInChildren = root.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (firstInChildren) {
        firstInChildren.focus();
        return;
      }

      const footerButton = root
        .closest('[role="dialog"]')
        ?.querySelector<HTMLElement>('footer button:not([disabled])');
      footerButton?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [creationPeekDetailId, creationPeekOpen]);

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

    // Ordenar para coincidir con el menú lateral (Sidebar.tsx navGroups)
    const sidebarOrder: Record<string, number> = {
      crm: 0, // Oportunidades / Suscriptores
      wfm: 1, // Programación
      assurance: 2, // Mesa de ayuda
      operations: 3, // Operaciones
      inventory: 4, // Inventario
      settings: 5, // Configuración
      users: 6, // Usuarios
      commercial: 7, // Comercial
      organization: 8,
      access: 9,
      'access-control': 10,
      billing: 11,
    };

    return [...groups].sort((a, b) => {
      const orderA = sidebarOrder[a.moduleKey] ?? 99;
      const orderB = sidebarOrder[b.moduleKey] ?? 99;
      return orderA - orderB;
    });
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
  // SUBSCRIBER/PARTNER/INVESTOR no tienen perfil sugerido; bases desconocidas van al
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

  const creationPeekDetail = useMemo(
    () => systemTemplates.find((profile) => profile.id === creationPeekDetailId) ?? null,
    [creationPeekDetailId, systemTemplates],
  );

  const creationPeekDetailGroups = useMemo(() => {
    if (!creationPeekDetail) {
      return [] as Array<{
        moduleKey: string;
        items: Array<{ key: AccessPermissionKey; description: string }>;
      }>;
    }

    const keys = getTemplatePermissionKeys(creationPeekDetail);
    const groups: Array<{
      moduleKey: string;
      items: Array<{ key: AccessPermissionKey; description: string }>;
    }> = [];
    const byModule = new Map<string, Array<{ key: AccessPermissionKey; description: string }>>();

    for (const key of keys) {
      const entry = permissionEntries.find((permission) => permission.permissionKey === key);
      const moduleKey = entry?.moduleKey ?? 'unknown';
      let bucket = byModule.get(moduleKey);
      if (!bucket) {
        bucket = [];
        byModule.set(moduleKey, bucket);
        groups.push({ moduleKey, items: bucket });
      }
      bucket.push({
        key,
        description: entry?.description ?? ACCESS_SETTINGS_COPY.permissionFallback,
      });
    }

    return groups;
  }, [creationPeekDetail, getTemplatePermissionKeys, permissionEntries]);

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

    setNextStepBanner(null);
    setCreationPeekOpen(false);
    setCreationPeekDetailId(null);
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
    shouldFocusNameRef.current = true;
    setIsDialogOpen(false);
    setFeedback(null);
    setError(null);
  }

  function closeCreationPeek() {
    setCreationPeekOpen(false);
    setCreationPeekDetailId(null);
  }

  function openCreatePeek() {
    setNextStepBanner(null);
    setCreationPeekDetailId(null);
    setCreationPeekOpen(true);
  }

  function startFromScratch() {
    setNextStepBanner(null);
    setCreationPeekOpen(false);
    setCreationPeekDetailId(null);
    setCreationDraft({
      sourceName: null,
      initialPermissionKeys: [],
    });
    setSelectedProfileId(null);
    setEditingProfileId(null);
    reset(createDefaultProfileFormValues());
    setDraftPermissionKeys([]);
    shouldFocusNameRef.current = true;
    setIsDialogOpen(false);
    setFeedback(null);
    setError(null);
  }

  function returnToCreationPeekList() {
    setCreationPeekDetailId(null);
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

      const isCreating = !editingProfileId;
      const createdFromSuggested = Boolean(creationDraft?.sourceName);
      const profile = editingProfileId
        ? await accessControlApi.updateProfile(editingProfileId, payload as UpdateAccessProfileDto)
        : await accessControlApi.createProfile(payload as CreateAccessProfileDto);

      setIsDialogOpen(false);
      setCreationDraft(null);
      if (isCreating) {
        setNextStepBanner({
          origin: createdFromSuggested ? 'suggested' : 'scratch',
          profileName: profile.name,
        });
        setFeedback(null);
      } else {
        setFeedback('Perfil actualizado correctamente.');
      }
      setSelectedProfileId(profile.id);
      await loadAccessControl();
    } catch (submitError) {
      setNextStepBanner(null);
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
      setNextStepBanner(null);
      setFeedback('Perfil eliminado correctamente.');
      if (selectedProfileId === profileId) {
        setSelectedProfileId(null);
        setDraftPermissionKeys([]);
      }
      await loadAccessControl();
    } catch (deleteError) {
      setNextStepBanner(null);
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
      setNextStepBanner(null);
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

      {nextStepBanner ? (
        <PortalAlert
          variant="success"
          live="polite"
          title={ACCESS_SETTINGS_COPY.nextStepBannerTitle}
          description={
            nextStepBanner.origin === 'suggested'
              ? ACCESS_SETTINGS_COPY.nextStepBannerFromSuggestedDescription(
                  nextStepBanner.profileName,
                )
              : ACCESS_SETTINGS_COPY.nextStepBannerFromScratchDescription(
                  nextStepBanner.profileName,
                )
          }
          action={
            <Button asChild={true} size="lg" className="min-h-11">
              <Link href={ACCESS_SETTINGS_COPY.usersPath}>
                {ACCESS_SETTINGS_COPY.nextStepBannerAction}
              </Link>
            </Button>
          }
        />
      ) : null}

      {feedback && !nextStepBanner ? (
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={cancelCreationDraft}
            >
              Cancelar nuevo perfil
            </Button>
          }
        />
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="space-y-4">
          <PortalPanel
            compact={customRoles.length === 0 && !creationDraft}
            className={creationDraft ? 'shadow-iwana-active' : undefined}
            title={ACCESS_SETTINGS_COPY.profilesTitle}
            description={
              customRoles.length === 0 ? undefined : ACCESS_SETTINGS_COPY.profilesDescription
            }
            actions={
              customRoles.length > 0 && !creationDraft ? (
                <Button type="button" size="lg" onClick={openCreatePeek}>
                  <Plus className="h-4 w-4" aria-hidden={true} />
                  {ACCESS_SETTINGS_COPY.createProfileAction}
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-4">
              {creationDraft ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 border-l-4 border-iwana-secondary pl-3">
                    <p className="portal-eyebrow">{ACCESS_SETTINGS_COPY.draftFieldsTitle}</p>
                    <span className="inline-flex items-center rounded-full border border-iwana-secondary/30 bg-iwana-secondary-50 px-3 py-1 text-xs font-semibold text-iwana-secondary-700 dark:border-iwana-secondary/20 dark:bg-iwana-secondary/10 dark:text-iwana-secondary-300">
                      En edición
                    </span>
                  </div>
                  <ProfileIdentityFields
                    register={register}
                    control={control}
                    errors={errors}
                    nameInputRef={profileNameInputRef}
                  />
                </div>
              ) : null}
              {customRoles.length === 0 && !creationDraft ? (
                <PortalEmptyState
                  embedded={true}
                  title={
                    systemTemplates.length > 0
                      ? ACCESS_SETTINGS_COPY.profilesEmptyPostCutTitle
                      : ACCESS_SETTINGS_COPY.profilesEmptyTitle
                  }
                  description={
                    systemTemplates.length > 0
                      ? ACCESS_SETTINGS_COPY.profilesEmptyPostCutDescription
                      : ACCESS_SETTINGS_COPY.profilesEmptyDescription
                  }
                  action={
                    <Button type="button" size="lg" onClick={openCreatePeek}>
                      {ACCESS_SETTINGS_COPY.createProfileAction}
                    </Button>
                  }
                  icon={ShieldCheck}
                />
              ) : customRoles.length > 0 ? (
                <>
                  <div className="grid gap-3 md:hidden">
                    {customRoles.map((profile) => {
                      const isSelected = !creationDraft && profile.id === selectedProfileId;

                      return (
                        <div
                          key={`${profile.id}-mobile`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Gestionar accesos de ${profile.name}`}
                          aria-selected={isSelected}
                          onClick={() => selectProfile(profile)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectProfile(profile);
                            }
                          }}
                          className={`rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2 ${isSelected ? 'border-l-4 border-l-iwana-secondary bg-iwana-surface-soft pl-3' : ''}`}
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
                            <span className="inline-flex items-center rounded-full border border-iwana-primary/10 bg-iwana-primary-50 px-3 py-1 font-medium tabular-nums text-iwana-primary dark:border-iwana-primary-400/20 dark:bg-iwana-primary/10 dark:text-iwana-primary-300">
                              {profile.permissions.length} accesos
                            </span>
                          </div>

                          <PortalActionToolbar compact={true} className="mt-4">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Editar perfil ${profile.name}`}
                              className="min-h-11 min-w-11 justify-center rounded-2xl"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditDialog(profile);
                              }}
                            >
                              <Pencil className="h-4 w-4" aria-hidden={true} />
                            </Button>
                            {!profile.isSystem ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`Eliminar perfil ${profile.name}`}
                                className="w-full justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 min-h-11 dark:hover:bg-red-900/20 dark:hover:text-red-300"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestProfileDeletion(profile);
                                }}
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
                              role="button"
                              tabIndex={0}
                              aria-label={`Gestionar accesos de ${profile.name}`}
                              aria-selected={isSelected}
                              onClick={() => selectProfile(profile)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  selectProfile(profile);
                                }
                              }}
                              className={cn(
                                portalTableRowHoverClassName,
                                'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-inset',
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
                                <span className="inline-flex items-center rounded-full border border-iwana-primary/10 bg-iwana-primary-50 px-3 py-1 text-xs font-medium tabular-nums text-iwana-primary dark:border-iwana-primary-400/20 dark:bg-iwana-primary/10 dark:text-iwana-primary-300">
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
                                <PortalActionToolbar compact={true} align="end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Editar perfil ${profile.name}`}
                                    className="min-h-11 min-w-11 justify-center rounded-2xl"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openEditDialog(profile);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" aria-hidden={true} />
                                  </Button>
                                  {!profile.isSystem ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      aria-label={`Eliminar perfil ${profile.name}`}
                                      className="min-h-11 w-full justify-center rounded-2xl hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300 sm:w-auto"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        requestProfileDeletion(profile);
                                      }}
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
              ) : null}
            </div>
          </PortalPanel>
          <div id="politicas-de-autenticacion">
            <PortalPanel
              compact={true}
              eyebrow={ACCESS_SETTINGS_COPY.authPolicyEyebrow}
              title={ACCESS_SETTINGS_COPY.authPolicyTitle}
              description={ACCESS_SETTINGS_COPY.authPolicyDescription}
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
        </div>

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
          >
            {profileForPermissions ? (
              permissionModules.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-transparent py-2 dark:border-dark-border">
                    <div className="min-w-[180px] flex-1 max-w-[260px]">
                      <Select
                        id="permission-section-select"
                        label="Sección de accesos"
                        value={activePermissionModule ?? ''}
                        onChange={(event) => setActivePermissionModule(event.target.value)}
                        options={permissionModules.map((module) => ({
                          value: module.moduleKey,
                          label: getAccessModuleLabel(module.moduleKey),
                        }))}
                        className="min-h-11"
                      />
                    </div>
                    <span
                      aria-hidden={true}
                      className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-dark-border"
                    />
                    <div
                      role="toolbar"
                      aria-label="Acciones de accesos"
                      className="flex items-center gap-1 sm:gap-2 ml-auto"
                    >
                      <button
                        type="button"
                        aria-label="Limpiar accesos"
                        title="Limpiar accesos de este perfil"
                        className={cn(
                          portalResourceTabTriggerClassName(false),
                          'hover:text-red-600 dark:hover:text-red-300',
                        )}
                        onClick={() => setDraftPermissionKeys([])}
                        disabled={isSaving}
                      >
                        <Trash2
                          className={portalResourceTabIconClassName(false)}
                          aria-hidden={true}
                        />
                        <span className="hidden sm:inline">Limpiar</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Restablecer cambios"
                        title="Restablecer cambios sin guardar"
                        className={portalResourceTabTriggerClassName(false)}
                        onClick={() =>
                          setDraftPermissionKeys(
                            creationDraft?.initialPermissionKeys ??
                              profileForPermissions.permissions,
                          )
                        }
                        disabled={isSaving}
                      >
                        <RefreshCcw
                          className={portalResourceTabIconClassName(false)}
                          aria-hidden={true}
                        />
                        <span className="hidden sm:inline">Restablecer</span>
                      </button>
                      <button
                        type="button"
                        aria-label={
                          creationDraft
                            ? ACCESS_SETTINGS_COPY.saveDraftAction
                            : ACCESS_SETTINGS_COPY.saveChangesAction
                        }
                        title={
                          creationDraft
                            ? ACCESS_SETTINGS_COPY.saveDraftAction
                            : ACCESS_SETTINGS_COPY.saveChangesAction
                        }
                        className={portalResourceTabTriggerClassName(true)}
                        onClick={() => {
                          if (creationDraft) {
                            void handleSubmit(onSubmit)();
                            return;
                          }

                          void handleSaveProfilePermissions();
                        }}
                        disabled={isSaving}
                        aria-busy={isSaving || undefined}
                      >
                        {isSaving ? (
                          <svg
                            className="h-4 w-4 animate-spin"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            aria-hidden={true}
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
                        ) : (
                          <Save
                            className={portalResourceTabIconClassName(true)}
                            aria-hidden={true}
                          />
                        )}
                        <span className="hidden sm:inline">
                          {creationDraft ? 'Guardar' : 'Guardar'}
                        </span>
                      </button>
                    </div>
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
                            Buscar accesos en esta sección
                          </label>
                          <Input
                            id="permission-search"
                            value={permissionSearch}
                            onChange={(event) => setPermissionSearch(event.target.value)}
                            placeholder="Buscar accesos en esta sección"
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

      <PortalSidePeek
        open={creationPeekOpen}
        onClose={closeCreationPeek}
        title={
          creationPeekDetail
            ? getAccessProfileDisplayName(creationPeekDetail)
            : ACCESS_SETTINGS_COPY.templatesTitle
        }
        description={
          creationPeekDetail
            ? ACCESS_SETTINGS_COPY.suggestedMeta(
                getSystemBaseRoleLabel(creationPeekDetail.baseRoleConstraint),
                getTemplatePermissionKeys(creationPeekDetail).length,
              )
            : undefined
        }
        footer={
          creationPeekDetail ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="min-h-11 w-full"
                onClick={() => beginCreationFromTemplate(creationPeekDetail)}
              >
                {ACCESS_SETTINGS_COPY.useThisProfileAction}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 w-full"
                onClick={returnToCreationPeekList}
              >
                {ACCESS_SETTINGS_COPY.backToListAction}
              </Button>
            </div>
          ) : undefined
        }
      >
        {creationPeekDetail ? (
          <div ref={peekMomentRef} className="space-y-6">
            <p className="portal-eyebrow">{ACCESS_SETTINGS_COPY.peekDetailHeading}</p>
            {creationPeekDetailGroups.length > 0 ? (
              <div className="space-y-6">
                {creationPeekDetailGroups.map((group) => (
                  <div key={group.moduleKey} className="space-y-2">
                    <p className="portal-eyebrow-muted">{getAccessModuleLabel(group.moduleKey)}</p>
                    <ul className="divide-y divide-gray-100 dark:divide-dark-border">
                      {group.items.map((item) => (
                        <li
                          key={item.key}
                          className="px-0 py-3 text-sm text-gray-700 dark:text-gray-200"
                        >
                          {item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {ACCESS_SETTINGS_COPY.peekEmptyDescription}
              </p>
            )}
          </div>
        ) : (
          <div ref={peekMomentRef} className="space-y-6">
            <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
              {ACCESS_SETTINGS_COPY.peekListIntro}
            </p>
            <div className={cn(portalDataTableShellClassName, 'overflow-hidden shadow-iwana-card')}>
              <div className={portalDataTableBodyClassName}>
                {orderedSystemTemplates.map((profile) => {
                  const visibleProfileName = getAccessProfileDisplayName(profile);
                  const accessCount = getTemplatePermissionKeys(profile).length;

                  return (
                    <button
                      key={profile.id}
                      type="button"
                      aria-label={ACCESS_SETTINGS_COPY.previewSuggestedAria(visibleProfileName)}
                      className={cn(
                        'group flex w-full min-h-11 items-center gap-3 px-4 py-3 text-left text-sm',
                        portalTableRowHoverClassName,
                        interactiveFocusClassName,
                      )}
                      onClick={() => setCreationPeekDetailId(profile.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-gray-900 dark:text-white">
                          {visibleProfileName}
                        </span>
                        <span className="block text-xs tabular-nums text-gray-500 dark:text-gray-400">
                          {ACCESS_SETTINGS_COPY.suggestedMeta(
                            getSystemBaseRoleLabel(profile.baseRoleConstraint),
                            accessCount,
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium text-gray-500 transition-colors group-hover:text-iwana-secondary-700 group-focus-visible:text-iwana-secondary-700 dark:text-gray-400 dark:group-hover:text-iwana-secondary-300 dark:group-focus-visible:text-iwana-secondary-300">
                        {ACCESS_SETTINGS_COPY.previewAction}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className={cn(
                portalDataTableShellClassName,
                'overflow-hidden bg-iwana-surface-soft shadow-iwana-card dark:bg-dark-surface-3',
              )}
            >
              <button
                type="button"
                aria-label={ACCESS_SETTINGS_COPY.startFromScratchLabel}
                className={cn(
                  'flex w-full min-h-11 items-start gap-3 px-4 py-3 text-left text-sm hover:bg-white/70 dark:hover:bg-dark-surface-2/50',
                  interactiveFocusClassName,
                )}
                onClick={startFromScratch}
              >
                <Plus
                  className="mt-0.5 h-4 w-4 shrink-0 text-iwana-secondary-700 dark:text-iwana-secondary-300"
                  aria-hidden={true}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-gray-900 dark:text-white">
                    {ACCESS_SETTINGS_COPY.startFromScratchLabel}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {ACCESS_SETTINGS_COPY.startFromScratchHelp}
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}
      </PortalSidePeek>

      {editingProfileId ? (
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingProfileId(null);
            }
          }}
        >
          <DialogContent
            aria-labelledby="access-profile-dialog-title"
            initialFocusRef={profileNameInputRef}
          >
            <DialogHeader>
              <DialogTitle id="access-profile-dialog-title">Editar perfil</DialogTitle>
              <DialogDescription>{ACCESS_SETTINGS_COPY.editProfileDescription}</DialogDescription>
            </DialogHeader>

            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <ProfileIdentityFields
                register={register}
                control={control}
                errors={errors}
                nameInputRef={profileNameInputRef}
              />

              <div className="flex justify-end gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className="min-h-11">
                    {ACCESS_SETTINGS_COPY.cancelAction}
                  </Button>
                </DialogClose>
                <Button type="submit" size="lg" loading={isSaving} disabled={isSaving}>
                  {ACCESS_SETTINGS_COPY.saveChangesAction}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

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
