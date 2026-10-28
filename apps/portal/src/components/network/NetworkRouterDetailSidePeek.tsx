'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CORRECTION_REASONS,
  ConvertLegacyLanBodySchema,
  CreateRouterInterfaceBaseBodySchema,
  CreateRouterInterfaceIpv4AddressBodySchema,
  CorrectRouterInterfaceIpv4AddressBodySchema,
  Ipv4AddressWithPrefixSchema,
} from '@iwana/shared';
import type {
  ConvertLegacyLanBody,
  CreateRouterInterfaceBaseBody,
  CreateRouterInterfaceIpv4AddressBody,
  CorrectRouterInterfaceIpv4AddressBody,
  Ipv4NetworkExtendedDto,
  RouterDetailDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
  RouterInterfaceKind,
} from '@iwana/shared';
import { Badge, Button, Input, OperationalSidePeek } from '@iwana/ui';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { PortalAlert, PortalEmptyState, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { NetworkFormField, networkFormControlProps } from './NetworkCatalogDrawerFrame';
import {
  getCatalogStatusLabel,
  getCatalogIpProtectionState,
  getCatalogStatusVariant,
  getInterfaceKindLabel,
  getInterfaceStatusLabel,
  getNetworkApiErrorMessage,
  getOrganizationSiteTypeLabel,
  getReservationAvailabilityLabel,
} from './network-catalog-labels';
import { networkApi } from '@/lib/api-client';
import { ApiError } from '@/lib/api-client';

interface NetworkRouterDetailSidePeekProps {
  routerId: string | null;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusFallbackRef?: RefObject<HTMLElement | null>;
}

interface AddressPageState {
  items: RouterInterfaceIpv4AddressDto[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

const ROUTER_INTERFACE_KINDS: RouterInterfaceKind[] = ['PHYSICAL', 'BRIDGE', 'VLAN', 'OTHER'];

const CORRECTION_REASON_LABELS: Record<(typeof CORRECTION_REASONS)[number], string> = {
  ERROR_DE_REGISTRO: 'Error de registro',
  CAMBIO_DE_EQUIPO: 'Cambio de equipo',
  REASIGNACION_PLANIFICADA: 'Reasignación planificada',
};

const interfaceFormSchema = CreateRouterInterfaceBaseBodySchema.extend({
  addressWithPrefix: Ipv4AddressWithPrefixSchema.optional(),
});
type InterfaceFormValues = z.infer<typeof interfaceFormSchema>;

const correctionFormSchema = CorrectRouterInterfaceIpv4AddressBodySchema;

function managementError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.code === 'IP_PROTECTION_PENDING') {
    return 'Todavía no puedes registrar direcciones en esta interfaz. Puedes crear la red con bloque y puerta de enlace.';
  }
  return getNetworkApiErrorMessage(error, fallback);
}

function getAddressHost(value: string): string {
  return value.split('/')[0]?.trim() ?? '';
}

export function NetworkRouterDetailSidePeek({
  routerId,
  canManage,
  onOpenChange,
  returnFocusFallbackRef,
}: NetworkRouterDetailSidePeekProps) {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [detail, setDetail] = useState<RouterDetailDto | null>(null);
  const [interfaces, setInterfaces] = useState<RouterInterfaceDto[]>([]);
  const [networks, setNetworks] = useState<Ipv4NetworkExtendedDto[]>([]);
  const [interfacePage, setInterfacePage] = useState(1);
  const [interfacesHaveMore, setInterfacesHaveMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interfacesLoading, setInterfacesLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [interfacesError, setInterfacesError] = useState<string | null>(null);
  const [networksError, setNetworksError] = useState<string | null>(null);
  const [catalogMetaState, setCatalogMetaState] = useState<'unknown' | 'pending' | 'active'>(
    'unknown',
  );
  const [catalogMetaError, setCatalogMetaError] = useState<string | null>(null);
  const [expandedInterfaceId, setExpandedInterfaceId] = useState<string | null>(null);
  const [addressPages, setAddressPages] = useState<Record<string, AddressPageState>>({});
  const [interfaceForm, setInterfaceForm] = useState<'create' | 'convert' | null>(null);
  const [addingAddressTo, setAddingAddressTo] = useState<string | null>(null);
  const [correctingAddress, setCorrectingAddress] = useState<RouterInterfaceIpv4AddressDto | null>(
    null,
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingInterfaceId, setPendingInterfaceId] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!routerId) return;
    setLoading(true);
    setDetailError(null);
    setNetworksError(null);
    setCatalogMetaError(null);
    setCatalogMetaState('unknown');
    const [detailResult, networksResult, metaResult] = await Promise.allSettled([
      networkApi.getRouter(routerId),
      networkApi.listIpv4Networks({ routerId, page: 1, limit: 20 }),
      networkApi.getCatalogMeta(),
    ]);
    if (detailResult.status === 'fulfilled') {
      setDetail(detailResult.value);
    } else {
      setDetail(null);
      setDetailError(
        getNetworkApiErrorMessage(detailResult.reason, 'No pudimos cargar el router. Reintenta.'),
      );
    }
    if (networksResult.status === 'fulfilled') {
      setNetworks(networksResult.value.data);
    } else {
      setNetworks([]);
      setNetworksError(
        getNetworkApiErrorMessage(
          networksResult.reason,
          'No pudimos cargar las redes asociadas. Reintenta.',
        ),
      );
    }
    if (metaResult.status === 'fulfilled') {
      const state = getCatalogIpProtectionState(metaResult.value);
      setCatalogMetaState(state);
      setCatalogMetaError(
        state === 'unknown'
          ? 'No pudimos verificar si las direcciones de infraestructura están protegidas. Por seguridad, no puedes registrar ni cambiar direcciones ahora.'
          : null,
      );
    } else {
      setCatalogMetaState('unknown');
      setCatalogMetaError(
        'No pudimos verificar si las direcciones de infraestructura están protegidas. Por seguridad, no puedes registrar ni cambiar direcciones ahora.',
      );
    }
    setLoading(false);
  }, [routerId]);

  const loadInterfaces = useCallback(
    async (page: number, append: boolean) => {
      if (!routerId) return;
      setInterfacesLoading(true);
      setInterfacesError(null);
      try {
        const result = await networkApi.listRouterInterfaces(routerId, { page, limit: 20 });
        setInterfaces((current) => (append ? [...current, ...result.data] : result.data));
        setInterfacePage(page);
        setInterfacesHaveMore(result.meta.hasMore);
      } catch (error) {
        setInterfacesError(
          getNetworkApiErrorMessage(error, 'No pudimos cargar las interfaces. Reintenta.'),
        );
      } finally {
        setInterfacesLoading(false);
      }
    },
    [routerId],
  );

  useEffect(() => {
    if (!routerId) {
      setDetail(null);
      setInterfaces([]);
      setNetworks([]);
      setAddressPages({});
      return;
    }
    setDetail(null);
    setInterfaces([]);
    setNetworks([]);
    setAddressPages({});
    setInterfacePage(1);
    setExpandedInterfaceId(null);
    setCatalogMetaState('unknown');
    setInterfaceForm(null);
    setAddingAddressTo(null);
    setCorrectingAddress(null);
    setSuccessMessage(null);
    setMutationError(null);
    void loadDetails();
    void loadInterfaces(1, false);
  }, [loadDetails, loadInterfaces, routerId]);

  const loadAddresses = useCallback(
    async (interfaceId: string, page: number, append: boolean) => {
      if (!routerId) return;
      setAddressPages((current) => ({
        ...current,
        [interfaceId]: {
          items: current[interfaceId]?.items ?? [],
          page: current[interfaceId]?.page ?? 1,
          hasMore: current[interfaceId]?.hasMore ?? false,
          loading: true,
          error: null,
        },
      }));
      try {
        const result = await networkApi.listRouterInterfaceAddresses(routerId, interfaceId, {
          page,
          limit: 20,
        });
        setAddressPages((current) => ({
          ...current,
          [interfaceId]: {
            items: append ? [...(current[interfaceId]?.items ?? []), ...result.data] : result.data,
            page,
            hasMore: result.meta.hasMore,
            loading: false,
            error: null,
          },
        }));
      } catch (error) {
        setAddressPages((current) => ({
          ...current,
          [interfaceId]: {
            items: current[interfaceId]?.items ?? [],
            page: current[interfaceId]?.page ?? 1,
            hasMore: current[interfaceId]?.hasMore ?? false,
            loading: false,
            error: getNetworkApiErrorMessage(
              error,
              'No pudimos cargar las direcciones. Reintenta.',
            ),
          },
        }));
      }
    },
    [routerId],
  );

  const toggleInterfaceAddresses = (interfaceId: string) => {
    if (expandedInterfaceId === interfaceId) {
      setExpandedInterfaceId(null);
      return;
    }
    setExpandedInterfaceId(interfaceId);
    if (!addressPages[interfaceId]) void loadAddresses(interfaceId, 1, false);
  };

  const createInterface = async (values: InterfaceFormValues, convert: boolean) => {
    if (!routerId || !detail) return;
    setPendingInterfaceId('new');
    setMutationError(null);
    setSuccessMessage(null);
    try {
      if (convert) {
        const body: ConvertLegacyLanBody = ConvertLegacyLanBodySchema.parse({
          convertLegacyLan: true,
          routerVersion: detail.version,
          name: values.name,
          kind: values.kind,
          ...(values.notes ? { notes: values.notes } : {}),
          ...(values.addressWithPrefix && catalogMetaState === 'active'
            ? { address: { addressWithPrefix: values.addressWithPrefix } }
            : {}),
        });
        await networkApi.convertLegacyLanInterface(routerId, body);
        setSuccessMessage('La referencia LAN anterior se convirtió en una interfaz.');
      } else {
        const body: CreateRouterInterfaceBaseBody = CreateRouterInterfaceBaseBodySchema.parse({
          name: values.name,
          kind: values.kind,
          ...(values.notes ? { notes: values.notes } : {}),
        });
        await networkApi.createRouterInterface(routerId, body);
        setSuccessMessage('Interfaz guardada.');
      }
      setInterfaceForm(null);
      await Promise.all([loadDetails(), loadInterfaces(1, false)]);
    } catch (error) {
      setMutationError(
        managementError(
          error,
          'No pudimos guardar la interfaz. Revisa los datos e intenta nuevamente.',
        ),
      );
    } finally {
      setPendingInterfaceId(null);
    }
  };

  const createAddress = async (
    interfaceId: string,
    values: CreateRouterInterfaceIpv4AddressBody,
  ) => {
    if (!routerId || catalogMetaState !== 'active') return;
    setPendingInterfaceId(interfaceId);
    setMutationError(null);
    setSuccessMessage(null);
    try {
      await networkApi.createRouterInterfaceAddress(routerId, interfaceId, values);
      setAddingAddressTo(null);
      setSuccessMessage('Dirección registrada.');
      await loadAddresses(interfaceId, 1, false);
      await loadDetails();
    } catch (error) {
      setMutationError(
        managementError(
          error,
          'No pudimos registrar la dirección. Revisa los datos e intenta nuevamente.',
        ),
      );
    } finally {
      setPendingInterfaceId(null);
    }
  };

  const correctAddress = async (
    address: RouterInterfaceIpv4AddressDto,
    values: CorrectRouterInterfaceIpv4AddressBody,
  ) => {
    if (!routerId || catalogMetaState !== 'active') return;
    setPendingInterfaceId(address.interfaceId);
    setMutationError(null);
    setSuccessMessage(null);
    try {
      const result = await networkApi.correctRouterInterfaceAddress(
        routerId,
        address.interfaceId,
        address.id,
        values,
      );
      setCorrectingAddress(null);
      setSuccessMessage(
        result.releasedHost
          ? `Dirección corregida. La IP anterior ${result.releasedHost} dejó de estar protegida.`
          : 'Dirección corregida.',
      );
      await loadAddresses(address.interfaceId, 1, false);
      await loadDetails();
    } catch (error) {
      setMutationError(
        managementError(
          error,
          'No pudimos corregir la dirección. Revisa los datos e intenta nuevamente.',
        ),
      );
    } finally {
      setPendingInterfaceId(null);
    }
  };

  const toggleInterfaceStatus = async (item: RouterInterfaceDto) => {
    if (!routerId) return;
    setPendingInterfaceId(item.id);
    setMutationError(null);
    setSuccessMessage(null);
    try {
      await networkApi.setRouterInterfaceStatus(
        routerId,
        item.id,
        item.version,
        item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      );
      setSuccessMessage(
        `Interfaz ${item.name} ${item.status === 'ACTIVE' ? 'inactivada' : 'activada'}.`,
      );
      await loadInterfaces(1, false);
    } catch (error) {
      setMutationError(
        getNetworkApiErrorMessage(error, 'No pudimos actualizar el estado de la interfaz.'),
      );
    } finally {
      setPendingInterfaceId(null);
    }
  };

  const showAddressActions = canManage && catalogMetaState === 'active';
  const isOpen = routerId !== null;

  return (
    <OperationalSidePeek
      open={isOpen}
      onOpenChange={onOpenChange}
      title={detail?.name ?? 'Detalle del router'}
      description="Consulta su catálogo de interfaces, direcciones y redes asociadas."
      eyebrow="Catálogo de red"
      size="wide"
      busy={loading || pendingInterfaceId !== null}
      initialFocusRef={headingRef}
      {...(returnFocusFallbackRef ? { returnFocusFallbackRef } : {})}
    >
      <div className="space-y-6">
        <h3 ref={headingRef} tabIndex={-1} className="sr-only">
          Información del router
        </h3>
        {detailError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar el router"
            description={detailError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadDetails()}
              >
                Reintentar
              </Button>
            }
          />
        ) : loading && !detail ? (
          <section aria-busy="true" className="space-y-3">
            <PortalSkeletonBlock className="h-20 w-full" />
            <PortalSkeletonBlock className="h-32 w-full" />
          </section>
        ) : detail ? (
          <>
            {successMessage ? (
              <PortalAlert
                variant="success"
                title="Cambios guardados"
                description={successMessage}
              />
            ) : null}
            {mutationError ? (
              <PortalAlert
                variant="error"
                title="No se guardaron los cambios"
                description={mutationError}
              />
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Identificación
                </h3>
                <Badge variant={getCatalogStatusVariant(detail.status)}>
                  {getCatalogStatusLabel(detail.status)} en el catálogo
                </Badge>
              </div>
              <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                {detail.status === 'ACTIVE'
                  ? 'Activo en el catálogo. La disponibilidad para reservas se muestra por separado en cada red.'
                  : 'Inactivo en el catálogo. No acepta nuevas reservas y conserva los servicios existentes.'}
              </p>
              <dl className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Dirección de administración
                  </dt>
                  <dd className="mt-1 break-all font-mono text-sm text-gray-900 dark:text-white">
                    {detail.managementHost}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Métodos de control
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {detail.supportedControlMethods
                      .map((method) =>
                        method === 'SIMPLE_QUEUE_STATIC_IP'
                          ? 'Cola simple por IP fija'
                          : 'Lista de direcciones PCQ',
                      )
                      .join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Sede física
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {detail.organizationSiteId
                      ? detail.organizationSite
                        ? `${detail.organizationSite.name} · ${getOrganizationSiteTypeLabel(detail.organizationSite.siteType)} · ${detail.organizationSite.isActive ? 'Activa' : 'Inactiva'}`
                        : 'No disponible'
                      : 'Sin sede física asociada'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Nodo comercial
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white">
                    {detail.commercialNodeId
                      ? detail.commercialNode
                        ? `${detail.commercialNode.name} · ${detail.commercialNode.isActive ? 'Activo' : 'Inactivo'}`
                        : 'No disponible'
                      : 'Sin nodo comercial asociado'}
                  </dd>
                </div>
              </dl>
              {detail.lanInterface ? (
                <div className="rounded-xl border border-gray-200 bg-iwana-surface-soft p-3 dark:border-dark-border dark:bg-dark-surface-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Referencia LAN anterior:{' '}
                    <span className="font-mono">{detail.lanInterface}</span>
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                    Dato heredado. No es una interfaz registrada.
                  </p>
                  {detail.legacyLanInterfaceId ? (
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                      Convertida en una interfaz registrada.
                    </p>
                  ) : canManage ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-3 min-h-11"
                      onClick={() => setInterfaceForm('convert')}
                    >
                      Convertir en interfaz
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="space-y-3" aria-labelledby="router-interfaces-title">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3
                    id="router-interfaces-title"
                    className="text-base font-semibold text-gray-900 dark:text-white"
                  >
                    Interfaces
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Registra las interfaces que ya existen en el router.
                  </p>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="min-h-11"
                    onClick={() => setInterfaceForm('create')}
                  >
                    Añadir interfaz
                  </Button>
                ) : null}
              </div>
              {catalogMetaError ? (
                <PortalAlert
                  variant="warning"
                  title="Protección sin verificar"
                  description={catalogMetaError}
                />
              ) : catalogMetaState === 'pending' ? (
                <PortalAlert
                  variant="warning"
                  title="Registro de direcciones no disponible"
                  description="Todavía no puedes registrar ni cambiar direcciones locales. Puedes continuar registrando interfaces y redes con bloque y puerta de enlace."
                />
              ) : catalogMetaState === 'active' ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  El servidor habilitó la administración de direcciones IP locales. El estado del
                  catálogo del router es independiente.
                </p>
              ) : null}
              {interfacesError ? (
                <PortalAlert
                  variant="error"
                  title="No pudimos cargar las interfaces"
                  description={interfacesError}
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => void loadInterfaces(1, false)}
                    >
                      Reintentar
                    </Button>
                  }
                />
              ) : interfacesLoading && interfaces.length === 0 ? (
                <div aria-busy="true" className="space-y-2">
                  <PortalSkeletonBlock className="h-24 w-full" />
                  <PortalSkeletonBlock className="h-24 w-full" />
                </div>
              ) : interfaces.length === 0 ? (
                <PortalEmptyState
                  title="Este router aún no tiene interfaces registradas."
                  description={
                    canManage
                      ? 'Añade una interfaz para organizar sus direcciones y asociar redes.'
                      : 'Las interfaces aparecerán cuando se registren en el catálogo.'
                  }
                  action={
                    canManage ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => setInterfaceForm('create')}
                      >
                        Añadir interfaz
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-3">
                  {interfaces.map((item) => {
                    const addressPage = addressPages[item.id];
                    const expanded = expandedInterfaceId === item.id;
                    return (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="break-words font-semibold text-gray-900 dark:text-white">
                              {item.name}
                            </h4>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                              {getInterfaceKindLabel(item.kind)} ·{' '}
                              {getInterfaceStatusLabel(item.status)}
                            </p>
                            {item.status === 'INACTIVE' ? (
                              <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                                No admite nuevas reservas. Sus direcciones registradas se conservan.
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-11"
                              onClick={() => toggleInterfaceAddresses(item.id)}
                            >
                              {expanded
                                ? 'Ocultar direcciones'
                                : `Ver direcciones (${item.ipv4AddressCount})`}
                            </Button>
                            {canManage ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-11"
                                disabled={pendingInterfaceId === item.id}
                                onClick={() => void toggleInterfaceStatus(item)}
                                aria-label={`${item.status === 'ACTIVE' ? 'Inactivar' : 'Activar'} interfaz ${item.name}`}
                              >
                                {item.status === 'ACTIVE'
                                  ? 'Inactivar interfaz'
                                  : 'Activar interfaz'}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        {expanded ? (
                          <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-dark-border">
                            {addressPage?.error ? (
                              <PortalAlert
                                variant="error"
                                title="No pudimos cargar las direcciones"
                                description={addressPage.error}
                                action={
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    className="min-h-11"
                                    onClick={() => void loadAddresses(item.id, 1, false)}
                                  >
                                    Reintentar
                                  </Button>
                                }
                              />
                            ) : addressPage?.loading && addressPage.items.length === 0 ? (
                              <div aria-busy="true">
                                <PortalSkeletonBlock className="h-16 w-full" />
                              </div>
                            ) : addressPage?.items.length ? (
                              <ul className="space-y-2">
                                {addressPage.items.map((address) => (
                                  <li
                                    key={address.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-iwana-surface-soft px-3 py-2 dark:bg-dark-surface-3"
                                  >
                                    <span className="font-mono text-sm text-gray-900 dark:text-white">
                                      {address.addressWithPrefix}
                                    </span>
                                    {showAddressActions && item.status === 'ACTIVE' ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="min-h-11"
                                        onClick={() => setCorrectingAddress(address)}
                                      >
                                        Corregir dirección
                                      </Button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-gray-600 dark:text-gray-300">
                                Sin direcciones registradas.
                              </p>
                            )}
                            {showAddressActions && item.status === 'ACTIVE' ? (
                              <Button
                                type="button"
                                variant="secondary"
                                className="min-h-11"
                                onClick={() => setAddingAddressTo(item.id)}
                              >
                                Añadir dirección
                              </Button>
                            ) : null}
                            {addressPage?.hasMore ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-11"
                                disabled={addressPage.loading}
                                onClick={() =>
                                  void loadAddresses(item.id, addressPage.page + 1, true)
                                }
                              >
                                Cargar más direcciones
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                  {interfacesHaveMore ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      disabled={interfacesLoading}
                      onClick={() => void loadInterfaces(interfacePage + 1, true)}
                    >
                      Cargar más interfaces
                    </Button>
                  ) : null}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    Redes IPv4
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    El estado del catálogo y la disponibilidad para reservas se muestran por
                    separado.
                  </p>
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="min-h-11"
                    onClick={() =>
                      router.push(
                        `/dashboard/network/ipv4-networks?networks.routerId=${encodeURIComponent(detail.id)}&networks.create=1`,
                      )
                    }
                  >
                    Añadir red
                  </Button>
                ) : null}
              </div>
              {networksError ? (
                <PortalAlert
                  variant="error"
                  title="No pudimos cargar las redes"
                  description={networksError}
                  action={
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => void loadDetails()}
                    >
                      Reintentar
                    </Button>
                  }
                />
              ) : networks.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Este router aún no tiene redes IPv4 registradas.
                </p>
              ) : (
                <ul className="space-y-2">
                  {networks.map((networkItem) => (
                    <li
                      key={networkItem.id}
                      className="rounded-xl border border-gray-200 bg-white p-3 dark:border-dark-border dark:bg-dark-surface-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {networkItem.name}
                          </p>
                          <p className="mt-1 font-mono text-sm text-gray-700 dark:text-gray-200">
                            {networkItem.cidr} · {networkItem.gateway}
                          </p>
                        </div>
                        <Badge variant={getCatalogStatusVariant(networkItem.status)}>
                          {getCatalogStatusLabel(networkItem.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                        {getReservationAvailabilityLabel(
                          networkItem.reservationAvailability,
                          networkItem.interface?.name,
                        )}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        Interfaz asociada: {networkItem.interface?.name ?? 'Sin interfaz asociada'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                className="inline-flex min-h-11 items-center font-medium text-iwana-secondary-700 underline dark:text-iwana-secondary-400"
                href={`/dashboard/network/ipv4-networks?networks.routerId=${encodeURIComponent(detail.id)}`}
              >
                Ver catálogo de redes IPv4
              </Link>
            </section>
          </>
        ) : null}

        {interfaceForm ? (
          <InterfaceForm
            mode={interfaceForm}
            title={interfaceForm === 'convert' ? 'Convertir referencia LAN' : 'Añadir interfaz'}
            defaultName={interfaceForm === 'convert' ? (detail?.lanInterface ?? '') : ''}
            routerVersion={detail?.version ?? 1}
            allowAddress={catalogMetaState === 'active'}
            busy={pendingInterfaceId === 'new'}
            onCancel={() => setInterfaceForm(null)}
            onSubmit={(values) => void createInterface(values, interfaceForm === 'convert')}
          />
        ) : null}
        {addingAddressTo ? (
          <AddressForm
            busy={pendingInterfaceId === addingAddressTo}
            onCancel={() => setAddingAddressTo(null)}
            onSubmit={(values) => void createAddress(addingAddressTo, values)}
          />
        ) : null}
        {correctingAddress ? (
          <AddressCorrectionForm
            address={correctingAddress}
            busy={pendingInterfaceId === correctingAddress.interfaceId}
            onCancel={() => setCorrectingAddress(null)}
            onSubmit={(values) => void correctAddress(correctingAddress, values)}
          />
        ) : null}
      </div>
    </OperationalSidePeek>
  );
}

interface InterfaceFormProps {
  mode: 'create' | 'convert';
  title: string;
  defaultName: string;
  routerVersion: number;
  allowAddress: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: InterfaceFormValues) => void;
}

function InterfaceForm({
  mode,
  title,
  defaultName,
  routerVersion,
  allowAddress,
  busy,
  onCancel,
  onSubmit,
}: InterfaceFormProps) {
  const formId = `router-interface-${mode}`;
  const { register, handleSubmit, formState } = useForm<InterfaceFormValues>({
    resolver: zodResolver(interfaceFormSchema),
    defaultValues: { name: defaultName, kind: undefined as unknown as RouterInterfaceKind },
  });
  const kindError = formState.errors.kind ? 'Selecciona una clase de interfaz.' : undefined;

  const submit = handleSubmit((values) => {
    if (mode === 'convert') {
      ConvertLegacyLanBodySchema.parse({
        convertLegacyLan: true,
        routerVersion,
        name: values.name,
        kind: values.kind,
        ...(values.notes ? { notes: values.notes } : {}),
        ...(allowAddress && values.addressWithPrefix
          ? { address: { addressWithPrefix: values.addressWithPrefix } }
          : {}),
      });
    } else {
      CreateRouterInterfaceBaseBodySchema.parse({
        name: values.name,
        kind: values.kind,
        ...(values.notes ? { notes: values.notes } : {}),
      });
    }
    onSubmit(values);
  });

  return (
    <section className="space-y-4 rounded-2xl border border-iwana-primary/20 bg-white p-4 shadow-iwana-active dark:border-dark-border dark:bg-dark-surface-2">
      <h4 className="font-semibold text-gray-900 dark:text-white">{title}</h4>
      <form id={formId} onSubmit={submit} className="space-y-3">
        <NetworkFormField
          id={`${formId}-name`}
          label="Nombre de la interfaz"
          error={formState.errors.name?.message}
        >
          <Input
            {...register('name')}
            {...networkFormControlProps(`${formId}-name`, formState.errors.name?.message)}
            maxLength={64}
          />
        </NetworkFormField>
        <NetworkFormField id={`${formId}-kind`} label="Clase de interfaz">
          <select
            {...register('kind')}
            {...networkFormControlProps(`${formId}-kind`, kindError)}
            defaultValue=""
          >
            <option value="">Selecciona una clase</option>
            {ROUTER_INTERFACE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {getInterfaceKindLabel(kind)}
              </option>
            ))}
          </select>
          {kindError ? (
            <p
              id={`${formId}-kind-error`}
              role="alert"
              className="text-xs font-medium text-red-700 dark:text-red-300"
            >
              {kindError}
            </p>
          ) : null}
        </NetworkFormField>
        {mode === 'convert' ? (
          <>
            {allowAddress ? (
              <NetworkFormField
                id={`${formId}-address`}
                label="Dirección con prefijo"
                hint="No se toma del texto anterior. Escríbela solo si la conoces."
                error={formState.errors.addressWithPrefix?.message}
              >
                <Input
                  {...register('addressWithPrefix')}
                  {...networkFormControlProps(
                    `${formId}-address`,
                    formState.errors.addressWithPrefix?.message,
                    true,
                  )}
                  placeholder="192.0.2.10/24"
                  autoComplete="off"
                />
              </NetworkFormField>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                La dirección local podrá registrarse cuando la protección esté activa. La conversión
                no tomará una IP del texto anterior.
              </p>
            )}
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            className="min-h-11"
            loading={busy}
            disabled={busy}
          >
            {mode === 'convert' ? 'Confirmar interfaz' : 'Guardar interfaz'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}

interface AddressFormProps {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: CreateRouterInterfaceIpv4AddressBody) => void;
}

function AddressForm({ busy, onCancel, onSubmit }: AddressFormProps) {
  const formId = 'router-interface-address';
  const { register, handleSubmit, formState } = useForm<CreateRouterInterfaceIpv4AddressBody>({
    resolver: zodResolver(CreateRouterInterfaceIpv4AddressBodySchema),
    defaultValues: { addressWithPrefix: '' },
  });
  return (
    <section className="space-y-4 rounded-2xl border border-iwana-primary/20 bg-white p-4 shadow-iwana-active dark:border-dark-border dark:bg-dark-surface-2">
      <h4 className="font-semibold text-gray-900 dark:text-white">Añadir dirección</h4>
      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <NetworkFormField
          id={`${formId}-address`}
          label="Dirección con prefijo"
          hint="Puedes registrar un /32. El prefijo no define por sí solo un bloque de servicios."
          error={formState.errors.addressWithPrefix?.message}
        >
          <Input
            {...register('addressWithPrefix')}
            {...networkFormControlProps(
              `${formId}-address`,
              formState.errors.addressWithPrefix?.message,
              true,
            )}
            placeholder="192.0.2.10/24"
            autoComplete="off"
          />
        </NetworkFormField>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            className="min-h-11"
            loading={busy}
            disabled={busy}
          >
            Guardar dirección
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}

interface AddressCorrectionFormProps {
  address: RouterInterfaceIpv4AddressDto;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (values: CorrectRouterInterfaceIpv4AddressBody) => void;
}

function AddressCorrectionForm({ address, busy, onCancel, onSubmit }: AddressCorrectionFormProps) {
  const formId = `correct-address-${address.id}`;
  const { register, handleSubmit, watch, setValue, setError, formState } =
    useForm<CorrectRouterInterfaceIpv4AddressBody>({
      resolver: zodResolver(correctionFormSchema),
      defaultValues: {
        newAddress: address.addressWithPrefix,
        version: address.version,
        reason: CORRECTION_REASONS[0],
      },
    });
  const newAddress = watch('newAddress');
  const confirmReleasedHost = watch('confirmReleasedHost') ?? false;
  const hostChanged = getAddressHost(newAddress) !== address.host;
  const submit = handleSubmit((values) => {
    if (hostChanged && !confirmReleasedHost) {
      setError('confirmReleasedHost', {
        type: 'manual',
        message: `Confirma que la IP ${address.host} dejará de estar protegida antes de guardar.`,
      });
      return;
    }
    const payload = CorrectRouterInterfaceIpv4AddressBodySchema.parse({
      newAddress: values.newAddress,
      version: values.version,
      reason: values.reason,
      ...(hostChanged ? { confirmReleasedHost: true } : {}),
    });
    onSubmit(payload);
  });
  return (
    <section className="space-y-4 rounded-2xl border border-iwana-primary/20 bg-white p-4 shadow-iwana-active dark:border-dark-border dark:bg-dark-surface-2">
      <h4 className="font-semibold text-gray-900 dark:text-white">Corregir dirección</h4>
      <form id={formId} onSubmit={submit} className="space-y-3">
        <NetworkFormField id={`${formId}-current`} label="Dirección actual">
          <Input
            id={`${formId}-current`}
            value={address.addressWithPrefix}
            readOnly
            className="portal-input-surface min-h-11 w-full px-3 py-2 font-mono text-sm text-gray-600 dark:text-gray-300"
          />
        </NetworkFormField>
        <NetworkFormField
          id={`${formId}-next`}
          label="Nueva dirección con prefijo"
          error={formState.errors.newAddress?.message}
        >
          <Input
            {...register('newAddress')}
            {...networkFormControlProps(`${formId}-next`, formState.errors.newAddress?.message)}
            autoComplete="off"
          />
        </NetworkFormField>
        <NetworkFormField
          id={`${formId}-reason`}
          label="Motivo del cambio"
          error={formState.errors.reason?.message}
        >
          <select
            {...register('reason')}
            id={`${formId}-reason`}
            className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
          >
            {CORRECTION_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {CORRECTION_REASON_LABELS[reason]}
              </option>
            ))}
          </select>
        </NetworkFormField>
        {hostChanged ? (
          <div className="space-y-2 rounded-xl border border-warning-400 bg-warning-50 p-3 dark:border-warning-400 dark:bg-dark-surface-3">
            <p className="text-sm text-gray-800 dark:text-gray-100">
              La IP <span className="font-mono">{address.host}</span> dejará de estar protegida y
              podrá asignarse a un servicio.
            </p>
            <label className="flex min-h-11 items-center gap-3 text-sm text-gray-900 dark:text-white">
              <input
                type="checkbox"
                checked={confirmReleasedHost}
                onChange={(event) =>
                  setValue('confirmReleasedHost', event.target.checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                className="h-4 w-4 accent-iwana-primary"
              />
              Entiendo que la IP anterior dejará de estar protegida.
            </label>
            {formState.errors.confirmReleasedHost?.message ? (
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {formState.errors.confirmReleasedHost.message}
              </p>
            ) : null}
          </div>
        ) : null}
        {!hostChanged &&
        address.host === getAddressHost(newAddress) &&
        newAddress !== address.addressWithPrefix ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Cambiar solo el prefijo no libera la dirección IP.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            className="min-h-11"
            loading={busy}
            disabled={busy}
          >
            Confirmar corrección
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}
