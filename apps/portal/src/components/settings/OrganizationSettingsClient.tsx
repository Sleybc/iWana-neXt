'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm, type SubmitErrorHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, RefreshCcw } from 'lucide-react';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';
import {
  AccessPermissionKey,
  UserRole,
  OrganizationSiteCapability,
  OrganizationSiteType,
  type ListMeta,
} from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  accessControlApi,
  ApiError,
  organizationApi,
  tenantSelfApi,
  type CreateOrganizationSiteDto,
  type OrganizationSiteDetail,
  type OrganizationSiteSummary,
  type TenantSelf,
  type TenantSelfSettings,
  type UpdateOrganizationSiteDto,
} from '@/lib/api-client';
import { EMPTY_LIST_META, listPageWindow, normalizeListMeta } from '@/lib/list-meta';
import { PORTAL_DEFAULT_PAGE_SIZE } from '@/lib/portal-page-size';
import { useTableQueryState } from '@/lib/use-table-query-state';
import { CompanyProfileForm } from './CompanyProfileForm';
import { OperationalSettingsForm } from './OperationalSettingsForm';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPageSizeSelect,
  PortalDataTableHead,
  PortalPanel,
  PortalSkeletonBlock,
  PortalTablePager,
  portalDataTableBodyClassName,
  portalDataTableCellClassName,
  portalDataTableHeadRowClassName,
  portalDataTableShellClassName,
} from '@/components/shared/portal-ui';
import {
  ORGANIZATION_SETTINGS_COPY,
  getOrganizationSiteCapabilityLabel,
  getOrganizationSiteTypeLabel,
} from './mod00-settings-labels';
import { countryOptionsWithCurrent } from './organization-settings-options';

const SITES_RESOURCE = { singular: 'sede', plural: 'sedes' } as const;
const SITES_NAMESPACE = 'sites';

const coordinateTokenPattern = /^[+-]?\d+(?:[.,]\d+)?$/u;

function roundCoordinate(value: number): number {
  return Number(value.toFixed(7));
}

function formatCoordinate(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }

  return roundCoordinate(value).toString();
}

function formatCoordinatePair(latitude: number | null, longitude: number | null): string {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return '';
  }

  return `${formatCoordinate(latitude)}, ${formatCoordinate(longitude)}`;
}

function parseCoordinateToken(value: string): number | null {
  const normalized = value.trim().replace(/\s+/gu, '');

  if (!coordinateTokenPattern.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized.replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return roundCoordinate(parsed);
}

function parseCoordinatePair(value: string): { latitude: number; longitude: number } | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  let latitudeSource: string | undefined;
  let longitudeSource: string | undefined;

  if (trimmed.includes(';')) {
    [latitudeSource, longitudeSource] = trimmed.split(';').map((part) => part.trim());
  } else {
    const pairMatch = trimmed.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$/u);

    if (pairMatch) {
      latitudeSource = pairMatch[1];
      longitudeSource = pairMatch[2];
    }
  }

  if (!latitudeSource || !longitudeSource) {
    return null;
  }

  const latitude = parseCoordinateToken(latitudeSource);
  const longitude = parseCoordinateToken(longitudeSource);

  if (latitude === null || longitude === null) {
    return null;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

const siteFormSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres.').max(160, 'Máximo 160 caracteres.'),
  code: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres.')
    .max(40, 'Máximo 40 caracteres.')
    .regex(/^[A-Z0-9_-]+$/u, 'Usa mayúsculas, números, guion o guion bajo.'),
  siteType: z.nativeEnum(OrganizationSiteType),
  address: z.string().trim().max(240, 'Máximo 240 caracteres.').optional(),
  municipality: z.string().trim().max(120, 'Máximo 120 caracteres.').optional(),
  department: z.string().trim().max(120, 'Máximo 120 caracteres.').optional(),
  country: z.string().trim().length(2, 'Selecciona el país de la sede.'),
  coordinates: z
    .string()
    .trim()
    .min(1, 'Las coordenadas son requeridas.')
    .refine(
      (value) => parseCoordinatePair(value) !== null,
      'Usa el formato "latitud, longitud" o "latitud; longitud" si usas coma decimal.',
    ),
  contactName: z.string().trim().min(1, 'El nombre de contacto es requerido.').max(160),
  contactPhone: z.string().trim().min(1, 'El teléfono de contacto es requerido.').max(32),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});

type SiteFormValues = z.infer<typeof siteFormSchema>;
type PermissionsState = 'loading' | 'granted' | 'read-only' | 'denied' | 'unavailable';

const siteTypeOptions = Object.values(OrganizationSiteType).map((siteType) => ({
  value: siteType,
  label: getOrganizationSiteTypeLabel(siteType),
}));

const capabilityOptions = Object.values(OrganizationSiteCapability);
const SITE_INVALID_FOCUS_ORDER = [
  'name',
  'code',
  'siteType',
  'country',
  'coordinates',
  'contactName',
  'contactPhone',
] as const satisfies ReadonlyArray<keyof SiteFormValues>;

function mapOrganizationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Tu sesión expiró. Inicia sesión nuevamente.';
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permisos para consultar esta sección.';
  }
  return 'No pudimos cargar la información de la empresa. Intenta nuevamente.';
}

function mapSitesError(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permisos para consultar las sedes.';
  }
  return 'No pudimos cargar las sedes. Intenta nuevamente.';
}

function mapSiteSubmitError(editing: boolean, error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ya existe una sede con ese código. Usa uno diferente.';
  }
  return editing
    ? 'No pudimos actualizar la sede. Revisa la información e intenta nuevamente.'
    : 'No pudimos crear la sede. Revisa la información e intenta nuevamente.';
}

function createDefaultSiteFormValues(country = 'CO'): SiteFormValues {
  return {
    name: '',
    code: '',
    siteType: OrganizationSiteType.OFFICE,
    address: '',
    municipality: '',
    department: '',
    country,
    coordinates: '',
    contactName: '',
    contactPhone: '',
    isPrimary: false,
    isActive: true,
  };
}

function toSiteFormValues(site: OrganizationSiteDetail): SiteFormValues {
  return {
    name: site.name,
    code: site.code,
    siteType: site.siteType,
    address: site.address ?? '',
    municipality: site.municipality ?? '',
    department: site.department ?? '',
    country: site.country,
    coordinates: formatCoordinatePair(site.latitude, site.longitude),
    contactName: site.contactName ?? '',
    contactPhone: site.contactPhone ?? '',
    isPrimary: site.isPrimary,
    isActive: site.isActive,
  };
}

function formatSiteLocation(
  site: Pick<OrganizationSiteSummary, 'address' | 'municipality' | 'department'>,
) {
  const address = site.address?.trim() ?? '';
  const region = [site.municipality, site.department].filter(Boolean).join(', ');

  if (address) {
    return {
      primary: address,
      secondary: region || null,
    };
  }

  if (region) {
    return {
      primary: region,
      secondary: null,
    };
  }

  return {
    primary: 'Sin ubicación registrada',
    secondary: null,
  };
}

const organizationReadableRoles = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
  UserRole.ACCOUNTANT,
  UserRole.HR,
]);

export function OrganizationSettingsClient() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <PageHeader
            title="Perfil empresarial y organización"
            subtitle="Cargando información de la empresa y sus sedes"
          />
          <PortalSkeletonBlock className="h-36" />
          <PortalSkeletonBlock className="h-80" />
        </div>
      }
    >
      <OrganizationSettingsClientInner />
    </Suspense>
  );
}

function OrganizationSettingsClientInner() {
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [settings, setSettings] = useState<TenantSelfSettings | null>(null);
  const [sites, setSites] = useState<OrganizationSiteSummary[]>([]);
  const [sitesMeta, setSitesMeta] = useState<ListMeta>(EMPTY_LIST_META);
  const [draftCapabilities, setDraftCapabilities] = useState<OrganizationSiteCapability[]>([]);
  const [hasManageSitesPermission, setHasManageSitesPermission] = useState(false);
  const [canReadSites, setCanReadSites] = useState(true);
  const [permissionsState, setPermissionsState] = useState<PermissionsState>('loading');
  const [isLoading, setIsLoading] = useState(true);
  const [isSitesInitialLoading, setIsSitesInitialLoading] = useState(true);
  const [isSitesRefreshing, setIsSitesRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [siteDialogError, setSiteDialogError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [sitePendingDeactivation, setSitePendingDeactivation] =
    useState<OrganizationSiteSummary | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [dialogTab, setDialogTab] = useState('informacion');
  const hasLoadedSitesOnceRef = useRef(false);

  const {
    page: sitesPage,
    pageSize: sitesPageSize,
    setPage: setSitesPage,
    setPageSize: setSitesPageSize,
    setQuery: setSitesQuery,
  } = useTableQueryState({
    namespace: SITES_NAMESPACE,
    defaultPageSize: PORTAL_DEFAULT_PAGE_SIZE,
  });

  const canEdit = user?.role === UserRole.ADMIN;
  const canRead = user?.role ? organizationReadableRoles.has(user.role as UserRole) : false;
  const canManageSites = permissionsState === 'granted' && hasManageSitesPermission;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    setFocus,
    formState: { errors },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: createDefaultSiteFormValues(),
  });

  const loadSites = useCallback(
    async (opts?: { soft?: boolean }) => {
      void opts;
      if (!canReadSites) {
        setSites([]);
        setSitesMeta(EMPTY_LIST_META);
        setIsSitesInitialLoading(false);
        setIsSitesRefreshing(false);
        return;
      }

      const initialLoad = !hasLoadedSitesOnceRef.current;
      if (initialLoad) setIsSitesInitialLoading(true);
      if (!initialLoad) setIsSitesRefreshing(true);

      setSitesError(null);

      try {
        const response = await organizationApi.list({
          page: sitesPage,
          limit: sitesPageSize,
        });
        const nextMeta = normalizeListMeta(response.meta, {
          dataLength: response.data.length,
          limit: sitesPageSize,
        });
        // sortableFields: [] — no inventar orden de columnas.
        const totalPages = nextMeta.totalPages ?? 0;

        if (response.data.length === 0 && sitesPage > 1 && nextMeta.total > 0) {
          setSitesQuery({ page: Math.max(1, totalPages || sitesPage - 1) }, { history: 'replace' });
          return;
        }

        setSites(response.data);
        setSitesMeta(nextMeta);
        hasLoadedSitesOnceRef.current = true;
      } catch (loadError) {
        if (initialLoad) {
          setSites([]);
          setSitesMeta(EMPTY_LIST_META);
        }
        setSitesError(mapSitesError(loadError));
      } finally {
        setIsSitesInitialLoading(false);
        setIsSitesRefreshing(false);
      }
    },
    [canReadSites, setSitesQuery, sitesPage, sitesPageSize],
  );

  const loadOrganization = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSitesError(null);
    setHasManageSitesPermission(false);
    setCanReadSites(true);
    setPermissionsState('loading');

    try {
      const [profileResult, settingsResult, permissionsResult] = await Promise.allSettled([
        tenantSelfApi.getProfile(),
        tenantSelfApi.getSettings(),
        canEdit && user ? accessControlApi.getMyEffectivePermissions() : Promise.resolve(null),
      ]);

      if (permissionsResult.status === 'rejected') {
        setPermissionsState('unavailable');
        setHasManageSitesPermission(false);
      } else if (!permissionsResult.value) {
        setPermissionsState('read-only');
        setCanReadSites(true);
      } else if (
        !permissionsResult.value.effectivePermissions.includes(
          AccessPermissionKey.ORGANIZATION_SITES_READ,
        )
      ) {
        setPermissionsState('denied');
        setCanReadSites(false);
        setSites([]);
        setSitesMeta(EMPTY_LIST_META);
        setDraftCapabilities([]);
        setIsSitesInitialLoading(false);
      } else if (
        !permissionsResult.value.effectivePermissions.includes(
          AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
        )
      ) {
        setPermissionsState('read-only');
        setCanReadSites(true);
      } else {
        setPermissionsState('granted');
        setCanReadSites(true);
        setHasManageSitesPermission(true);
      }

      let sectionError: string | null = null;

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        sectionError = mapOrganizationError(profileResult.reason);
      }

      if (settingsResult.status === 'fulfilled') {
        setSettings(settingsResult.value);
      } else if (!sectionError) {
        sectionError = mapOrganizationError(settingsResult.reason);
      }

      if (sectionError) {
        setError(sectionError);
      }
    } catch (loadError) {
      setError(mapOrganizationError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [canEdit, user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setIsLoading(false);
      setError('No pudimos validar tu sesión. Inicia sesión de nuevo.');
      return;
    }

    if (!canRead) {
      setIsLoading(false);
      return;
    }

    void loadOrganization();
  }, [authLoading, canRead, loadOrganization, user]);

  useEffect(() => {
    if (authLoading || isLoading || !user || !canRead || !canReadSites) {
      return;
    }

    void loadSites({ soft: true });
  }, [authLoading, canRead, canReadSites, isLoading, loadSites, user]);

  function openCreateDialog() {
    setSitePendingDeactivation(null);
    setEditingSiteId(null);
    setSiteDialogError(null);
    reset(createDefaultSiteFormValues(profile?.countryCode ?? settings?.country ?? 'CO'));
    setDraftCapabilities([]);
    setDialogTab('informacion');
    setIsDialogOpen(true);
  }

  async function openEditDialog(siteId: string) {
    setError(null);
    setFeedback(null);
    setSiteDialogError(null);
    setSitePendingDeactivation(null);

    try {
      const site = await organizationApi.get(siteId);
      setEditingSiteId(site.id);
      reset(toSiteFormValues(site));
      setDraftCapabilities(site.capabilities);
      setDialogTab('informacion');
      setIsDialogOpen(true);
    } catch (loadError) {
      setError(mapSitesError(loadError));
    }
  }

  function handleDialogOpenChange(open: boolean) {
    setIsDialogOpen(open);
    setSiteDialogError(null);

    if (!open) {
      setDialogTab('informacion');
    }
  }

  async function onSubmit(values: SiteFormValues) {
    setIsSaving(true);
    setError(null);
    setFeedback(null);
    setSiteDialogError(null);

    try {
      const coordinates = parseCoordinatePair(values.coordinates);

      if (!coordinates) {
        setFieldError('coordinates', {
          type: 'manual',
          message: 'Usa el formato "latitud, longitud" o "latitud; longitud" si usas coma decimal.',
        });
        return;
      }

      const payload: CreateOrganizationSiteDto | UpdateOrganizationSiteDto = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        siteType: values.siteType,
        capabilities: draftCapabilities,
        address: values.address?.trim() || null,
        municipality: values.municipality?.trim() || null,
        department: values.department?.trim() || null,
        country: values.country.trim().toUpperCase(),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        isPrimary: values.isPrimary,
        isActive: values.isActive,
      };

      if (editingSiteId) {
        await organizationApi.update(editingSiteId, payload);
      } else {
        await organizationApi.create(payload as CreateOrganizationSiteDto);
      }

      setIsDialogOpen(false);
      setSiteDialogError(null);
      setFeedback(editingSiteId ? 'Sede actualizada correctamente.' : 'Sede creada correctamente.');
      await loadSites({ soft: true });
    } catch (submitError) {
      setSiteDialogError(mapSiteSubmitError(Boolean(editingSiteId), submitError));
    } finally {
      setIsSaving(false);
    }
  }

  function requestSiteDeactivation(site: OrganizationSiteSummary) {
    setIsDialogOpen(false);
    setSitePendingDeactivation(site);
  }

  function closeDeactivationDialog() {
    if (isDeactivating) {
      return;
    }

    setSitePendingDeactivation(null);
  }

  async function confirmSiteDeactivation() {
    if (!sitePendingDeactivation) {
      return;
    }

    setIsDeactivating(true);
    setError(null);
    setFeedback(null);

    try {
      await organizationApi.delete(sitePendingDeactivation.id);
      setSitePendingDeactivation(null);
      setFeedback('Sede dada de baja correctamente.');
      await loadSites({ soft: true });
    } catch (deleteError) {
      setError(mapOrganizationError(deleteError));
    } finally {
      setIsDeactivating(false);
    }
  }

  function toggleCapability(capability: OrganizationSiteCapability) {
    setDraftCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  }

  const onInvalid: SubmitErrorHandler<SiteFormValues> = (formErrors) => {
    setDialogTab('informacion');
    const firstField = SITE_INVALID_FOCUS_ORDER.find((field) => formErrors[field]);
    if (!firstField) {
      return;
    }

    setFocus(firstField);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setFocus(firstField));
    });
  };

  const sitesPageCount = sitesMeta.totalPages ?? (sitesMeta.total > 0 ? 1 : 0);
  const effectiveSitesPage = sitesMeta.page ?? sitesPage;
  const { from: sitesFrom, to: sitesTo } = listPageWindow({
    page: effectiveSitesPage,
    limit: sitesMeta.limit || sitesPageSize,
    total: sitesMeta.total,
  });
  const sitesRandomAccess = sitesMeta.capabilities.randomAccess;
  const showSitesPager = !isLoading && !isSitesInitialLoading && !sitesError && sitesMeta.total > 0;
  const showSitesPageSize =
    showSitesPager && sitesRandomAccess && sitesMeta.total > Math.min(...[10, 20, 50]);
  const showSitesPanel =
    permissionsState !== 'denied' && (isSitesInitialLoading || sites.length > 0 || !sitesError);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Perfil empresarial y organización"
          subtitle="Cargando información de la empresa y sus sedes"
        />
        <PortalSkeletonBlock className="h-36" />
        <PortalSkeletonBlock className="h-80" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="Perfil empresarial y organización" subtitle="Sesión no disponible" />
        <PortalAlert
          variant="error"
          title="No fue posible abrir la vista"
          description={error ?? 'Inicia sesión nuevamente para consultar esta sección.'}
        />
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Perfil empresarial y organización" subtitle="Acceso restringido" />
        <PortalAlert
          variant="info"
          title="Sin autorización"
          description="Tu perfil no tiene acceso a esta sección."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ORGANIZATION_SETTINGS_COPY.pageTitle}
        subtitle={ORGANIZATION_SETTINGS_COPY.pageSubtitle}
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
              onClick={() => void loadOrganization()}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              Reintentar
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        {profile ? (
          <CompanyProfileForm profile={profile} canEdit={canEdit} onUpdated={setProfile} />
        ) : null}

        {settings ? (
          <OperationalSettingsForm settings={settings} canEdit={canEdit} onUpdated={setSettings} />
        ) : null}
      </div>

      {sitesError ? (
        <PortalAlert
          variant="warning"
          title="Sedes no disponibles"
          description={sitesError}
          action={
            canReadSites ? (
              <Button
                type="button"
                variant="link"
                size="lg"
                className="min-h-11"
                onClick={() => void loadSites()}
              >
                <RefreshCcw className="h-4 w-4" aria-hidden={true} />
                {ORGANIZATION_SETTINGS_COPY.retrySitesAction}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {permissionsState === 'denied' ? (
        <PortalAlert
          variant="warning"
          title="Sedes no disponibles"
          description={ORGANIZATION_SETTINGS_COPY.sitesDeniedDescription}
        />
      ) : null}

      {permissionsState === 'unavailable' ? (
        <PortalAlert
          variant="warning"
          title="Permisos no confirmados"
          description={ORGANIZATION_SETTINGS_COPY.sitesPermissionsUnavailable}
          action={
            <Button
              type="button"
              variant="link"
              size="lg"
              className="min-h-11"
              onClick={() => void loadOrganization()}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              {ORGANIZATION_SETTINGS_COPY.retryPermissionsAction}
            </Button>
          }
        />
      ) : null}

      {showSitesPanel ? (
        <PortalPanel
          title={ORGANIZATION_SETTINGS_COPY.sitesPanelTitle}
          description={ORGANIZATION_SETTINGS_COPY.sitesPanelDescription}
          actions={
            canManageSites && sites.length > 0 && !isSitesInitialLoading ? (
              <Button type="button" size="lg" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" aria-hidden={true} />
                {ORGANIZATION_SETTINGS_COPY.createSiteAction}
              </Button>
            ) : undefined
          }
        >
          {isSitesInitialLoading ? (
            <div role="status" aria-live="polite" aria-label="Cargando sedes" className="space-y-4">
              <span className="sr-only">Cargando información de la empresa y sus sedes.</span>
              <PortalSkeletonBlock className="h-14" />
              <PortalSkeletonBlock className="h-56" />
            </div>
          ) : sites.length === 0 && !isSitesRefreshing ? (
            <PortalEmptyState
              title={ORGANIZATION_SETTINGS_COPY.emptySitesTitle}
              description={
                canManageSites
                  ? ORGANIZATION_SETTINGS_COPY.emptySitesDescription
                  : ORGANIZATION_SETTINGS_COPY.emptySitesReadOnlyDescription
              }
              action={
                canManageSites ? (
                  <Button type="button" size="lg" onClick={openCreateDialog}>
                    {ORGANIZATION_SETTINGS_COPY.createFirstSiteAction}
                  </Button>
                ) : undefined
              }
              icon={Building2}
            />
          ) : (
            <div className="space-y-3">
              {permissionsState === 'read-only' ? (
                <PortalAlert
                  variant="info"
                  title={ORGANIZATION_SETTINGS_COPY.sitesReadOnlyNotice}
                />
              ) : null}
              <div className={portalDataTableShellClassName} aria-busy={isSitesRefreshing}>
                <div className="overflow-x-auto">
                  <table className="min-w-[56rem]">
                    <thead className={portalDataTableHeadRowClassName}>
                      <tr>
                        <PortalDataTableHead>Sede</PortalDataTableHead>
                        <PortalDataTableHead>Tipo</PortalDataTableHead>
                        <PortalDataTableHead>Ubicación</PortalDataTableHead>
                        <PortalDataTableHead>Servicios</PortalDataTableHead>
                        <PortalDataTableHead>Estado</PortalDataTableHead>
                        {canManageSites ? (
                          <PortalDataTableHead>Acciones</PortalDataTableHead>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className={portalDataTableBodyClassName}>
                      {sites.map((site) => {
                        const location = formatSiteLocation(site);

                        return (
                          <tr key={site.id}>
                            <td className={portalDataTableCellClassName}>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {site.name}
                                </p>
                                <p className="portal-eyebrow-muted">{site.code}</p>
                              </div>
                            </td>
                            <td className={portalDataTableCellClassName}>
                              {getOrganizationSiteTypeLabel(site.siteType)}
                            </td>
                            <td className={portalDataTableCellClassName}>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {location.primary}
                                </p>
                                {location.secondary ? (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {location.secondary}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className={portalDataTableCellClassName}>
                              <div className="flex flex-wrap gap-2">
                                {site.capabilities.length > 0 ? (
                                  site.capabilities.map((capability) => (
                                    <Badge key={capability} variant="neutral">
                                      {getOrganizationSiteCapabilityLabel(capability)}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {ORGANIZATION_SETTINGS_COPY.noServices}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className={portalDataTableCellClassName}>
                              <Badge variant={site.isActive ? 'success' : 'neutral'}>
                                {site.isActive
                                  ? ORGANIZATION_SETTINGS_COPY.activeStatus
                                  : ORGANIZATION_SETTINGS_COPY.inactiveStatus}
                              </Badge>
                            </td>
                            {canManageSites ? (
                              <td className={portalDataTableCellClassName}>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="min-h-11"
                                    onClick={() => void openEditDialog(site.id)}
                                  >
                                    {ORGANIZATION_SETTINGS_COPY.editSiteAction}
                                    <span className="sr-only"> {site.name}</span>
                                  </Button>
                                  {site.isActive ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="min-h-11"
                                      onClick={() => requestSiteDeactivation(site)}
                                    >
                                      {ORGANIZATION_SETTINGS_COPY.deactivateSiteAction}
                                      <span className="sr-only"> {site.name}</span>
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {showSitesPager && sitesRandomAccess ? (
                <PortalTablePager
                  page={effectiveSitesPage}
                  pageCount={Math.max(1, sitesPageCount)}
                  onPageChange={setSitesPage}
                  from={sitesFrom}
                  to={sitesTo}
                  total={sitesMeta.total}
                  resource={SITES_RESOURCE}
                  loading={isSitesRefreshing}
                  pageSizeControl={
                    showSitesPageSize ? (
                      <PortalPageSizeSelect
                        value={sitesPageSize}
                        onChange={setSitesPageSize}
                        disabled={isSitesRefreshing}
                      />
                    ) : undefined
                  }
                />
              ) : null}
            </div>
          )}
        </PortalPanel>
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent aria-labelledby="organization-site-dialog-title" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle id="organization-site-dialog-title">
              {editingSiteId
                ? ORGANIZATION_SETTINGS_COPY.editDialogTitle
                : ORGANIZATION_SETTINGS_COPY.createDialogTitle}
            </DialogTitle>
            <DialogDescription>
              {editingSiteId
                ? ORGANIZATION_SETTINGS_COPY.editDialogDescription
                : ORGANIZATION_SETTINGS_COPY.createDialogDescription}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
            {siteDialogError ? (
              <PortalAlert
                variant="error"
                live="assertive"
                title={ORGANIZATION_SETTINGS_COPY.siteDialogErrorTitle}
                description={siteDialogError}
              />
            ) : null}
            <Tabs value={dialogTab} onValueChange={setDialogTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="informacion" className="min-h-11">
                  {ORGANIZATION_SETTINGS_COPY.informationTab}
                </TabsTrigger>
                <TabsTrigger value="servicios" className="min-h-11">
                  {ORGANIZATION_SETTINGS_COPY.servicesTab}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="informacion" forceMount className="space-y-6">
                <section className="space-y-4">
                  <p className="portal-eyebrow">Datos básicos</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      id="site-name"
                      label="Nombre"
                      required
                      error={errors.name?.message}
                      className="h-11"
                      containerClassName="md:col-span-2"
                      {...register('name')}
                    />
                    <Input
                      id="site-code"
                      label="Código"
                      required
                      error={errors.code?.message}
                      className="h-11 uppercase"
                      {...register('code')}
                    />
                    <Controller
                      name="siteType"
                      control={control}
                      render={({ field }) => (
                        <Select
                          id="site-type"
                          label="Tipo de sede"
                          required
                          options={siteTypeOptions}
                          name={field.name}
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          error={errors.siteType?.message ?? ''}
                        />
                      )}
                    />
                  </div>
                </section>

                <section className="space-y-4">
                  <div>
                    <p className="portal-eyebrow">Ubicación y contacto del sitio</p>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Completa estos datos para ubicar la sede y dejar un contacto operativo local.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Controller
                      name="country"
                      control={control}
                      render={({ field }) => (
                        <Select
                          id="site-country"
                          label="País"
                          required
                          options={countryOptionsWithCurrent(field.value)}
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                          error={errors.country?.message ?? ''}
                        />
                      )}
                    />
                    <Input
                      id="site-address"
                      label="Dirección"
                      error={errors.address?.message}
                      className="h-11"
                      containerClassName="md:col-span-2"
                      {...register('address')}
                    />
                    <Input
                      id="site-municipality"
                      label="Municipio"
                      error={errors.municipality?.message}
                      className="h-11"
                      {...register('municipality')}
                    />
                    <Input
                      id="site-department"
                      label="Departamento"
                      error={errors.department?.message}
                      className="h-11"
                      {...register('department')}
                    />
                    <Input
                      id="site-coordinates"
                      type="text"
                      label="Coordenadas"
                      required
                      placeholder="4.5837296, -74.4454695"
                      helperText="Usa el formato latitud, longitud. Si escribes coma decimal, separa ambos valores con punto y coma."
                      error={errors.coordinates?.message}
                      className="h-11"
                      containerClassName="md:col-span-2"
                      {...register('coordinates')}
                    />
                    <Input
                      id="site-contact-name"
                      type="text"
                      label="Nombre de contacto"
                      required
                      error={errors.contactName?.message}
                      className="h-11"
                      {...register('contactName')}
                    />
                    <Input
                      id="site-contact-phone"
                      type="tel"
                      label="Teléfono de contacto"
                      required
                      error={errors.contactPhone?.message}
                      className="h-11"
                      {...register('contactPhone')}
                    />
                  </div>
                </section>

                <section className="space-y-3">
                  <p className="portal-eyebrow">Estado de la sede</p>
                  <CheckboxCard
                    label="Marcar como sede principal"
                    description="Identifica esta sede como referencia principal de la empresa."
                    {...register('isPrimary')}
                  />
                  <CheckboxCard label="Mantener activa" {...register('isActive')} />
                </section>
              </TabsContent>

              <TabsContent value="servicios" className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Selecciona los servicios que opera esta sede.
                </p>
                <Badge variant="neutral">
                  {draftCapabilities.length} de {capabilityOptions.length} servicios seleccionados
                </Badge>
                {draftCapabilities.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Aún no has seleccionado servicios para esta sede.
                  </p>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                  {capabilityOptions.map((capability) => (
                    <CheckboxCard
                      key={capability}
                      label={getOrganizationSiteCapabilityLabel(capability)}
                      checked={draftCapabilities.includes(capability)}
                      disabled={!canManageSites}
                      onChange={() => toggleCapability(capability)}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="min-h-11">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" size="lg" disabled={isSaving}>
                {editingSiteId ? 'Guardar cambios' : 'Crear sede'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sitePendingDeactivation !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeactivationDialog();
          }
        }}
      >
        <DialogContent
          aria-labelledby="organization-site-deactivate-dialog-title"
          className="max-w-md"
        >
          <DialogHeader>
            <DialogTitle id="organization-site-deactivate-dialog-title">
              {sitePendingDeactivation
                ? ORGANIZATION_SETTINGS_COPY.deactivateDialogTitle(sitePendingDeactivation.name)
                : ''}
            </DialogTitle>
            <DialogDescription>
              {ORGANIZATION_SETTINGS_COPY.deactivateDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={isDeactivating}
              onClick={closeDeactivationDialog}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              loading={isDeactivating}
              disabled={isDeactivating}
              onClick={() => void confirmSiteDeactivation()}
            >
              {ORGANIZATION_SETTINGS_COPY.deactivateConfirmAction}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
