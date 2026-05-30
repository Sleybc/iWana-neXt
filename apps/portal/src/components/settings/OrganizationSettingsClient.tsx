'use client';

import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Plus, RefreshCcw } from 'lucide-react';
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
import { CompanyProfileForm } from './CompanyProfileForm';
import { OperationalSettingsForm } from './OperationalSettingsForm';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import {
  getOrganizationSiteCapabilityLabel,
  getOrganizationSiteTypeLabel,
} from './mod00-settings-labels';

const tableHeadClass =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500';
const cellClass = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';
const inputClassName =
  'h-11 rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-iwana-secondary focus:outline-none focus:ring-2 focus:ring-iwana-secondary/20 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-100';
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
  name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(160, 'Maximo 160 caracteres.'),
  code: z
    .string()
    .trim()
    .min(2, 'Minimo 2 caracteres.')
    .max(40, 'Maximo 40 caracteres.')
    .regex(/^[A-Z0-9_-]+$/u, 'Usa mayúsculas, números, guion o guion bajo.'),
  siteType: z.nativeEnum(OrganizationSiteType),
  address: z.string().trim().max(240, 'Maximo 240 caracteres.').optional(),
  municipality: z.string().trim().max(120, 'Maximo 120 caracteres.').optional(),
  department: z.string().trim().max(120, 'Maximo 120 caracteres.').optional(),
  coordinates: z
    .string()
    .trim()
    .min(1, 'Las coordenadas son requeridas.')
    .refine(
      (value) => parseCoordinatePair(value) !== null,
      'Usa el formato "latitud, longitud" o "latitud; longitud" si usas coma decimal.',
    ),
  contactName: z.string().min(1, 'El nombre de contacto es requerido').max(160),
  contactPhone: z.string().min(1, 'El teléfono de contacto es requerido').max(32),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});

type SiteFormValues = z.infer<typeof siteFormSchema>;

const siteTypeOptions = Object.values(OrganizationSiteType).map((siteType) => ({
  value: siteType,
  label: getOrganizationSiteTypeLabel(siteType),
}));

const capabilityOptions = Object.values(OrganizationSiteCapability);

function mapOrganizationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente.';
    if (error.status === 403) return 'No tienes permisos para gestionar esta sección.';
    return error.message;
  }

  return 'No pudimos cargar la información de esta sección.';
}

function mapSitesError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return 'No tienes permisos para ver o editar las sedes.';
    }

    if (error.status === 401) {
      return 'Tu sesión expiró antes de cargar las sedes.';
    }

    return error.message;
  }

  return 'No fue posible cargar las sedes en este momento.';
}

function createDefaultSiteFormValues(): SiteFormValues {
  return {
    name: '',
    code: '',
    siteType: OrganizationSiteType.OFFICE,
    address: '',
    municipality: '',
    department: '',
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
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<TenantSelf | null>(null);
  const [settings, setSettings] = useState<TenantSelfSettings | null>(null);
  const [sites, setSites] = useState<OrganizationSiteSummary[]>([]);
  const [draftCapabilities, setDraftCapabilities] = useState<OrganizationSiteCapability[]>([]);
  const [hasManageSitesPermission, setHasManageSitesPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [dialogTab, setDialogTab] = useState('informacion');

  const canEdit = user?.role === UserRole.ADMIN;
  const canRead = user?.role ? organizationReadableRoles.has(user.role as UserRole) : false;
  const canManageSites = canEdit && hasManageSitesPermission && !sitesError;

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm<SiteFormValues>({
    resolver: zodResolver(siteFormSchema),
    defaultValues: createDefaultSiteFormValues(),
  });

  const loadOrganization = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSitesError(null);
    setHasManageSitesPermission(false);

    try {
      const [profileResult, settingsResult, permissionsResult] = await Promise.allSettled([
        tenantSelfApi.getProfile(),
        tenantSelfApi.getSettings(),
        canEdit && user ? accessControlApi.getMyEffectivePermissions() : Promise.resolve(null),
      ]);

      if (profileResult.status !== 'fulfilled') {
        throw profileResult.reason;
      }

      if (settingsResult.status !== 'fulfilled') {
        throw settingsResult.reason;
      }

      setProfile(profileResult.value);
      setSettings(settingsResult.value);

      const canReadSitesFromPermissions =
        permissionsResult.status === 'fulfilled' && permissionsResult.value
          ? permissionsResult.value.effectivePermissions.includes(
              AccessPermissionKey.ORGANIZATION_SITES_READ,
            )
          : null;
      const canManageSitesFromPermissions =
        permissionsResult.status === 'fulfilled' && permissionsResult.value
          ? permissionsResult.value.effectivePermissions.includes(
              AccessPermissionKey.ORGANIZATION_SITES_MANAGE,
            )
          : false;

      setHasManageSitesPermission(canManageSitesFromPermissions);

      if (canReadSitesFromPermissions === false) {
        setSites([]);
        setDraftCapabilities([]);
        setSitesError('No tienes permisos para ver o editar las sedes.');
        return;
      }

      const sitesResult = await Promise.allSettled([organizationApi.list()]);
      const sitesResponse = sitesResult[0];

      if (sitesResponse.status !== 'fulfilled') {
        setSites([]);
        setDraftCapabilities([]);
        setSitesError(mapSitesError(sitesResponse.reason));
        return;
      }

      setSites(sitesResponse.value);
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

  function openCreateDialog() {
    setEditingSiteId(null);
    reset(createDefaultSiteFormValues());
    setDraftCapabilities([]);
    setDialogTab('informacion');
    setIsDialogOpen(true);
  }

  async function openEditDialog(siteId: string) {
    setError(null);
    setFeedback(null);

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

    if (!open) {
      setDialogTab('informacion');
    }
  }

  async function onSubmit(values: SiteFormValues) {
    setIsSaving(true);
    setError(null);
    setFeedback(null);

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
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        isPrimary: values.isPrimary,
        isActive: values.isActive,
      };

      const site = editingSiteId
        ? await organizationApi.update(editingSiteId, payload)
        : await organizationApi.create(payload as CreateOrganizationSiteDto);

      setIsDialogOpen(false);
      setFeedback(editingSiteId ? 'Sede actualizada correctamente.' : 'Sede creada correctamente.');
      await loadOrganization();
    } catch (submitError) {
      setError(mapOrganizationError(submitError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteSite(siteId: string, siteName: string) {
    if (!(globalThis.confirm?.(`Dar de baja la sede ${siteName}?`) ?? true)) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      await organizationApi.delete(siteId);
      setFeedback('Sede dada de baja correctamente.');
      await loadOrganization();
    } catch (deleteError) {
      setError(mapOrganizationError(deleteError));
    } finally {
      setIsSaving(false);
    }
  }

  function toggleCapability(capability: OrganizationSiteCapability) {
    setDraftCapabilities((current) =>
      current.includes(capability)
        ? current.filter((item) => item !== capability)
        : [...current, capability],
    );
  }

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
        title="Perfil empresarial y organización"
        subtitle="Gestiona los datos de tu empresa, ajustes generales y sedes."
        actions={
          canManageSites ? (
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" aria-hidden={true} />
              Crear sede
            </Button>
          ) : undefined
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
              onClick={() => void loadOrganization()}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-700 underline decoration-red-300 underline-offset-4 hover:no-underline dark:text-red-300"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden={true} />
              Reintentar
            </button>
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
        <PortalAlert variant="warning" title="Sedes no disponibles" description={sitesError} />
      ) : null}

      {!sitesError ? (
        <PortalPanel
          title="Sedes registradas"
          description="Revisa y administra las sedes de tu empresa."
        >
          {sites.length === 0 ? (
            <PortalEmptyState
              title="Sin sedes registradas"
              description="Todavía no hay sedes creadas."
              action={
                canManageSites ? (
                  <Button type="button" onClick={openCreateDialog}>
                    Crear primera sede
                  </Button>
                ) : undefined
              }
              icon={Building2}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-dark-border">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-iwana-surface-soft dark:bg-dark-surface-3">
                  <tr>
                    <th className={tableHeadClass}>Sede</th>
                    <th className={tableHeadClass}>Tipo</th>
                    <th className={tableHeadClass}>Ubicación</th>
                    <th className={tableHeadClass}>Servicios</th>
                    <th className={tableHeadClass}>Estado</th>
                    <th className={tableHeadClass}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                  {sites.map((site) => {
                    const location = formatSiteLocation(site);

                    return (
                      <tr key={site.id}>
                        <td className={cellClass}>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{site.name}</p>
                            <p className="text-xs uppercase tracking-[0.14em] text-gray-500">
                              {site.code}
                            </p>
                          </div>
                        </td>
                        <td className={cellClass}>{getOrganizationSiteTypeLabel(site.siteType)}</td>
                        <td className={cellClass}>
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
                        <td className={cellClass}>
                          <div className="flex flex-wrap gap-2">
                            {site.capabilities.length > 0 ? (
                              site.capabilities.map((capability) => (
                                <span
                                  key={capability}
                                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-dark-surface-3 dark:text-gray-300"
                                >
                                  {getOrganizationSiteCapabilityLabel(capability)}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-gray-500">Sin servicios activos</span>
                            )}
                          </div>
                        </td>
                        <td className={cellClass}>{site.isActive ? 'Activa' : 'Inactiva'}</td>
                        <td className={cellClass}>
                          {canManageSites ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void openEditDialog(site.id)}
                              >
                                Editar sede
                                <span className="sr-only"> {site.name}</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void handleDeleteSite(site.id, site.name)}
                                disabled={isSaving}
                              >
                                Dar de baja sede
                                <span className="sr-only"> {site.name}</span>
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-500">Sin acciones disponibles</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PortalPanel>
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent aria-labelledby="organization-site-dialog-title" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle id="organization-site-dialog-title">
              {editingSiteId ? 'Editar sede' : 'Crear sede'}
            </DialogTitle>
            <DialogDescription>
              {editingSiteId
                ? 'Actualiza la información principal y los servicios de la sede seleccionada.'
                : 'Registra una nueva sede para tu empresa y define sus servicios activos.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <Tabs value={dialogTab} onValueChange={setDialogTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="informacion">Información de la sede</TabsTrigger>
                <TabsTrigger value="servicios">Servicios</TabsTrigger>
              </TabsList>

              <TabsContent value="informacion" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label
                      htmlFor="site-name"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Nombre
                    </label>
                    <Input id="site-name" {...register('name')} className="h-11" />
                    {errors.name?.message ? (
                      <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="site-code"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Código
                    </label>
                    <Input id="site-code" {...register('code')} className="h-11 uppercase" />
                    {errors.code?.message ? (
                      <p className="mt-1 text-sm text-red-600">{errors.code.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="site-type"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Tipo de sede
                    </label>
                    <Controller
                      name="siteType"
                      control={control}
                      render={({ field }) => (
                        <Select
                          id="site-type"
                          options={siteTypeOptions}
                          name={field.name}
                          value={field.value}
                          onChange={(event) => field.onChange(event.target.value)}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      )}
                    />
                    {errors.siteType?.message ? (
                      <p className="mt-1 text-sm text-red-600">{errors.siteType.message}</p>
                    ) : null}
                  </div>
                  <div className="md:col-span-2">
                    <label
                      htmlFor="site-address"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Dirección
                    </label>
                    <Input id="site-address" {...register('address')} className="h-11" />
                  </div>
                  <div>
                    <label
                      htmlFor="site-municipality"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Municipio
                    </label>
                    <Input id="site-municipality" {...register('municipality')} className="h-11" />
                  </div>
                  <div>
                    <label
                      htmlFor="site-department"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Departamento
                    </label>
                    <Input id="site-department" {...register('department')} className="h-11" />
                  </div>
                  <div className="md:col-span-2">
                    <label
                      htmlFor="site-coordinates"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Coordenadas
                    </label>
                    <Input
                      id="site-coordinates"
                      type="text"
                      placeholder="4.5837296, -74.4454695"
                      {...register('coordinates')}
                      className="h-11"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Usa el formato latitud, longitud. Si escribes coma decimal, separa ambos
                      valores con punto y coma.
                    </p>
                    {errors.coordinates?.message ? (
                      <p className="mt-1 text-sm text-red-600">{errors.coordinates.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="site-contact-name"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Nombre de contacto
                    </label>
                    <Input
                      id="site-contact-name"
                      type="text"
                      {...register('contactName')}
                      className="h-11"
                    />
                    {errors.contactName?.message ? (
                      <p className="mt-1 text-sm text-red-600">{errors.contactName.message}</p>
                    ) : null}
                  </div>
                  <div>
                    <label
                      htmlFor="site-contact-phone"
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
                    >
                      Teléfono de contacto
                    </label>
                    <Input
                      id="site-contact-phone"
                      type="tel"
                      {...register('contactPhone')}
                      className="h-11"
                    />
                    {errors.contactPhone?.message ? (
                      <p className="mt-1 text-sm text-red-600">{errors.contactPhone.message}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border">
                  <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      {...register('isPrimary')}
                      className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
                    />
                    Marcar como sede principal
                  </label>
                  <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="checkbox"
                      {...register('isActive')}
                      className="h-4 w-4 rounded border-gray-300 text-iwana-primary"
                    />
                    Mantener activa
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="servicios" className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft px-4 py-3 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
                  Selecciona los servicios que estarán habilitados para esta sede. El cambio se
                  guardará junto con la información principal.
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {capabilityOptions.map((capability) => {
                    const isChecked = draftCapabilities.includes(capability);

                    return (
                      <label
                        key={capability}
                        className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 dark:border-dark-border dark:text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canManageSites}
                          onChange={() => toggleCapability(capability)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-iwana-primary"
                        />
                        <span>{getOrganizationSiteCapabilityLabel(capability)}</span>
                      </label>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving}>
                {editingSiteId ? 'Guardar cambios' : 'Crear sede'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
