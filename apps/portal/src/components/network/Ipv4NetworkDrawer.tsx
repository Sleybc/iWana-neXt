'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CONTROL_METHODS,
  CreateIpv4NetworkBodySchema,
  UpdateIpv4NetworkBodySchema,
} from '@iwana/shared';
import type {
  CreateIpv4NetworkBody,
  Ipv4NetworkExtendedDto,
  RouterDto,
  RouterInterfaceDto,
  UpdateIpv4NetworkBody,
} from '@iwana/shared';
import { Input } from '@iwana/ui';
import { useForm } from 'react-hook-form';
import { collectListPages } from '@/lib/list-meta';
import { networkApi } from '@/lib/api-client';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import {
  NetworkCatalogDrawerFrame,
  NetworkFormField,
  networkFormControlProps,
} from './NetworkCatalogDrawerFrame';
import {
  getNetworkApiErrorMessage,
  getControlMethodLabel,
  getInterfaceStatusLabel,
  NETWORK_CATALOG_FIELD_HINTS,
} from './network-catalog-labels';
import { AssistedIpv4NetworkDrawer } from './AssistedIpv4NetworkDrawer';

interface Ipv4NetworkDrawerProps {
  open: boolean;
  network: Ipv4NetworkExtendedDto | null;
  routerContext?: RouterDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface NetworkFormValues {
  routerId: string;
  interfaceId: string;
  name: string;
  cidr: string;
  gateway: string;
  assignableFrom: string;
  assignableTo: string;
  excludedIpsText: string;
  defaultControlMethod: (typeof CONTROL_METHODS)[number];
}

function splitExcludedIps(value: string): string[] | undefined {
  const addresses = value
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
  return addresses.length > 0 ? addresses : undefined;
}

const networkFormSchema = z
  .object({
    routerId: z.string(),
    interfaceId: z.string(),
    name: z.string(),
    cidr: z.string(),
    gateway: z.string(),
    assignableFrom: z.string(),
    assignableTo: z.string(),
    excludedIpsText: z.string(),
    defaultControlMethod: z.enum(CONTROL_METHODS),
  })
  .superRefine((values, context) => {
    const excludedIps = splitExcludedIps(values.excludedIpsText);
    const candidate = {
      routerId: values.routerId,
      name: values.name.trim(),
      cidr: values.cidr.trim(),
      gateway: values.gateway.trim(),
      assignableFrom: values.assignableFrom.trim(),
      assignableTo: values.assignableTo.trim(),
      ...(excludedIps ? { excludedIps } : {}),
      defaultControlMethod: values.defaultControlMethod,
    };
    const result = CreateIpv4NetworkBodySchema.safeParse(candidate);
    if (result.success) return;

    for (const issue of result.error.issues) {
      const field = issue.path[0];
      const formField = field === 'excludedIps' ? 'excludedIpsText' : field;
      if (
        formField === 'routerId' ||
        formField === 'name' ||
        formField === 'cidr' ||
        formField === 'gateway' ||
        formField === 'assignableFrom' ||
        formField === 'assignableTo' ||
        formField === 'excludedIpsText' ||
        formField === 'defaultControlMethod'
      ) {
        const message =
          formField === 'routerId'
            ? 'Selecciona un router activo.'
            : formField === 'name' && issue.code === 'too_small'
              ? 'Ingresa un nombre para la red.'
              : formField === 'name' && issue.code === 'too_big'
                ? 'El nombre puede tener hasta 120 caracteres.'
                : formField === 'excludedIpsText' && issue.code === 'too_big'
                  ? 'Puedes excluir hasta 256 direcciones IPv4.'
                  : formField === 'defaultControlMethod'
                    ? 'Selecciona un método de control válido.'
                    : issue.message;
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [formField],
          message,
        });
      }
    }
  });

function formDefaults(network: Ipv4NetworkExtendedDto | null): NetworkFormValues {
  if (!network) {
    return {
      routerId: '',
      interfaceId: '',
      name: '',
      cidr: '',
      gateway: '',
      assignableFrom: '',
      assignableTo: '',
      excludedIpsText: '',
      defaultControlMethod: CONTROL_METHODS[0],
    };
  }

  return {
    routerId: network.routerId,
    interfaceId: network.interfaceId ?? '',
    name: network.name,
    cidr: network.cidr,
    gateway: network.gateway,
    assignableFrom: network.assignableFrom,
    assignableTo: network.assignableTo,
    excludedIpsText: network.excludedIps.join(', '),
    defaultControlMethod: network.defaultControlMethod,
  };
}

function LegacyIpv4NetworkEditor({ open, network, onClose, onSaved }: Ipv4NetworkDrawerProps) {
  const formId = `ipv4-network-${useId()}`;
  const [routers, setRouters] = useState<RouterDto[]>([]);
  const [routerOptionsLoading, setRouterOptionsLoading] = useState(false);
  const [routerOptionsError, setRouterOptionsError] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<RouterInterfaceDto[]>([]);
  const [interfacesLoading, setInterfacesLoading] = useState(false);
  const [interfacesError, setInterfacesError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, reset, watch, formState } = useForm<NetworkFormValues>({
    resolver: zodResolver(networkFormSchema),
    defaultValues: formDefaults(null),
  });
  const values = watch();
  const routerFieldId = `${formId}-router`;
  const methodFieldId = `${formId}-method`;
  const routerFieldRegistration = register('routerId');
  const methodFieldRegistration = register('defaultControlMethod');
  const excludedIpsRegistration = register('excludedIpsText');

  useEffect(() => {
    if (!open) return;
    reset(formDefaults(network));
    setSubmitError(null);
  }, [network, open, reset]);

  useEffect(() => {
    if (!open || network) return;
    let active = true;
    setRouterOptionsLoading(true);
    setRouterOptionsError(null);
    void collectListPages((page) => networkApi.listRouters({ page, limit: 100 }), {
      maxPages: 50,
      limit: 100,
    })
      .then((result) => {
        if (active) setRouters(result.data.filter((router) => router.status === 'ACTIVE'));
      })
      .catch((error: unknown) => {
        if (active) {
          setRouterOptionsError(
            getNetworkApiErrorMessage(error, 'No pudimos cargar los routers disponibles.'),
          );
        }
      })
      .finally(() => {
        if (active) setRouterOptionsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [network, open]);

  useEffect(() => {
    if (!open || !network) return;
    let active = true;
    setInterfacesLoading(true);
    setInterfacesError(null);
    void networkApi
      .listRouterInterfaces(network.routerId, { page: 1, limit: 100 })
      .then((result) => {
        if (active) setInterfaces(result.data);
      })
      .catch((error: unknown) => {
        if (active) {
          setInterfacesError(
            getNetworkApiErrorMessage(error, 'No pudimos cargar las interfaces del router.'),
          );
        }
      })
      .finally(() => {
        if (active) setInterfacesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [network, open]);

  const onSubmit = handleSubmit(async (formValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    const excludedIps = splitExcludedIps(formValues.excludedIpsText);
    try {
      if (network) {
        const currentInterfaceId = network.interfaceId ?? '';
        const interfaceChanged = formValues.interfaceId !== currentInterfaceId;
        const selectedInterface = interfaces.find((item) => item.id === formValues.interfaceId);
        if (interfaceChanged && formValues.interfaceId && !selectedInterface) {
          throw new Error('No pudimos validar la interfaz seleccionada. Vuelve a cargar la lista.');
        }
        const body: UpdateIpv4NetworkBody = UpdateIpv4NetworkBodySchema.parse({
          name: formValues.name.trim(),
          assignableFrom: formValues.assignableFrom.trim(),
          assignableTo: formValues.assignableTo.trim(),
          ...(excludedIps ? { excludedIps } : { excludedIps: [] }),
          defaultControlMethod: formValues.defaultControlMethod,
          ...(interfaceChanged
            ? formValues.interfaceId && selectedInterface
              ? {
                  interfaceId: selectedInterface.id,
                  interfaceVersion: selectedInterface.version,
                }
              : { interfaceId: null }
            : {}),
          version: network.version,
        });
        await networkApi.updateIpv4Network(network.id, body);
      } else {
        const body: CreateIpv4NetworkBody = CreateIpv4NetworkBodySchema.parse({
          routerId: formValues.routerId,
          name: formValues.name.trim(),
          cidr: formValues.cidr.trim(),
          gateway: formValues.gateway.trim(),
          assignableFrom: formValues.assignableFrom.trim(),
          assignableTo: formValues.assignableTo.trim(),
          ...(excludedIps ? { excludedIps } : {}),
          defaultControlMethod: formValues.defaultControlMethod,
        });
        await networkApi.createIpv4Network(body);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setSubmitError(
        getNetworkApiErrorMessage(
          error,
          'No pudimos guardar la red IPv4. Revisa los datos e intenta nuevamente.',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  });

  const errors = formState.errors;
  const selectedRouterId = values.routerId;
  const selectedMethod = values.defaultControlMethod;

  return (
    <NetworkCatalogDrawerFrame
      open={open}
      title={network ? 'Editar red IPv4' : 'Registrar red IPv4'}
      description="Define el bloque de direcciones y el rango que podrá asignarse."
      formId={formId}
      submitLabel={network ? 'Guardar cambios' : 'Registrar red'}
      submitting={isSubmitting}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div className="space-y-5">
        {submitError ? (
          <PortalAlert
            variant="error"
            title="No se guardaron los cambios"
            description={submitError}
          />
        ) : null}
        {routerOptionsError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar los routers"
            description={routerOptionsError}
          />
        ) : null}

        {network ? (
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Router: {network.routerName}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <NetworkFormField id={`${formId}-cidr`} label="CIDR (solo lectura)">
                <Input
                  id={`${formId}-cidr`}
                  value={network.cidr}
                  readOnly
                  className="portal-input-surface min-h-11 w-full px-3 py-2 font-mono text-sm text-gray-600 dark:text-gray-300"
                />
              </NetworkFormField>
              <NetworkFormField id={`${formId}-gateway`} label="Gateway (solo lectura)">
                <Input
                  id={`${formId}-gateway`}
                  value={network.gateway}
                  readOnly
                  className="portal-input-surface min-h-11 w-full px-3 py-2 font-mono text-sm text-gray-600 dark:text-gray-300"
                />
              </NetworkFormField>
            </div>
            <NetworkFormField
              id={`${formId}-interface`}
              label="Interfaz asociada"
              hint="Opcional. La red conserva su bloque y puerta de enlace al cambiar esta asociación."
            >
              <select
                {...register('interfaceId')}
                id={`${formId}-interface`}
                className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
                disabled={interfacesLoading || Boolean(interfacesError)}
                aria-describedby={interfacesError ? `${formId}-interface-error` : undefined}
              >
                <option value="">Sin interfaz asociada</option>
                {interfaces.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    disabled={item.status !== 'ACTIVE' && item.id !== network.interfaceId}
                  >
                    {item.name} · {getInterfaceStatusLabel(item.status)}
                  </option>
                ))}
              </select>
              {interfacesLoading ? <PortalSkeletonBlock className="mt-2 h-8 w-full" /> : null}
              {interfacesError ? (
                <p
                  id={`${formId}-interface-error`}
                  className="text-sm text-red-700 dark:text-red-300"
                >
                  {interfacesError}
                </p>
              ) : null}
            </NetworkFormField>
          </div>
        ) : (
          <>
            <NetworkFormField id={routerFieldId} label="Router" error={errors.routerId?.message}>
              <select
                {...routerFieldRegistration}
                id={routerFieldId}
                className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
                value={selectedRouterId}
                disabled={routerOptionsLoading || routers.length === 0}
                aria-invalid={errors.routerId ? true : undefined}
                aria-describedby={errors.routerId ? `${routerFieldId}-error` : undefined}
              >
                <option value="">Selecciona un router</option>
                {routers.map((router) => (
                  <option key={router.id} value={router.id}>
                    {router.name} · {router.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                  </option>
                ))}
              </select>
              {routerOptionsLoading ? <PortalSkeletonBlock className="mt-2 h-8 w-full" /> : null}
              {!routerOptionsLoading && routers.length === 0 && !routerOptionsError ? (
                <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Registra un router antes de crear una red.{' '}
                  <Link
                    className="font-medium text-iwana-secondary-700 underline dark:text-iwana-secondary-400"
                    href="/dashboard/network/routers"
                  >
                    Ir al catálogo de routers
                  </Link>
                </p>
              ) : null}
            </NetworkFormField>
          </>
        )}

        <NetworkFormField
          id={`${formId}-name`}
          label="Nombre de la red"
          hint={NETWORK_CATALOG_FIELD_HINTS.networkName}
          error={errors.name?.message}
        >
          <Input
            {...register('name')}
            {...networkFormControlProps(`${formId}-name`, errors.name?.message, true)}
            maxLength={120}
            placeholder="Clientes sector norte"
          />
        </NetworkFormField>

        {!network ? (
          <NetworkFormField
            id={`${formId}-cidr-create`}
            label="Red IPv4 (CIDR)"
            hint={NETWORK_CATALOG_FIELD_HINTS.cidr}
            error={errors.cidr?.message}
          >
            <Input
              {...register('cidr')}
              {...networkFormControlProps(`${formId}-cidr-create`, errors.cidr?.message, true)}
              placeholder="192.168.10.0/24"
              autoComplete="off"
            />
          </NetworkFormField>
        ) : null}

        {!network ? (
          <NetworkFormField
            id={`${formId}-gateway-create`}
            label="Gateway"
            hint={NETWORK_CATALOG_FIELD_HINTS.gateway}
            error={errors.gateway?.message}
          >
            <Input
              {...register('gateway')}
              {...networkFormControlProps(
                `${formId}-gateway-create`,
                errors.gateway?.message,
                true,
              )}
              inputMode="decimal"
              autoComplete="off"
            />
          </NetworkFormField>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <NetworkFormField
            id={`${formId}-assignable-from`}
            label="Primera dirección asignable"
            error={errors.assignableFrom?.message}
          >
            <Input
              {...register('assignableFrom')}
              {...networkFormControlProps(
                `${formId}-assignable-from`,
                errors.assignableFrom?.message,
              )}
              inputMode="decimal"
              autoComplete="off"
            />
          </NetworkFormField>
          <NetworkFormField
            id={`${formId}-assignable-to`}
            label="Última dirección asignable"
            error={errors.assignableTo?.message}
          >
            <Input
              {...register('assignableTo')}
              {...networkFormControlProps(`${formId}-assignable-to`, errors.assignableTo?.message)}
              inputMode="decimal"
              autoComplete="off"
            />
          </NetworkFormField>
        </div>

        <NetworkFormField
          id={`${formId}-excluded-ips`}
          label="Direcciones excluidas"
          hint={NETWORK_CATALOG_FIELD_HINTS.excludedIps}
          error={errors.excludedIpsText?.message}
        >
          <Input
            {...excludedIpsRegistration}
            {...networkFormControlProps(
              `${formId}-excluded-ips`,
              errors.excludedIpsText?.message,
              true,
            )}
            value={values.excludedIpsText}
            maxLength={8192}
            autoComplete="off"
          />
        </NetworkFormField>

        <NetworkFormField id={methodFieldId} label="Método de control por defecto">
          <select
            {...methodFieldRegistration}
            id={methodFieldId}
            className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            value={selectedMethod}
          >
            {CONTROL_METHODS.map((method) => (
              <option key={method} value={method}>
                {getControlMethodLabel(method)}
              </option>
            ))}
          </select>
        </NetworkFormField>
      </div>
    </NetworkCatalogDrawerFrame>
  );
}

export function Ipv4NetworkDrawer({
  open,
  network,
  routerContext = null,
  onClose,
  onSaved,
}: Ipv4NetworkDrawerProps) {
  if (!network) {
    return (
      <AssistedIpv4NetworkDrawer
        open={open}
        routerContext={routerContext}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  return (
    <LegacyIpv4NetworkEditor open={open} network={network} onClose={onClose} onSaved={onSaved} />
  );
}
