'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AssistedCreateIpv4NetworkBodySchema,
  CONTROL_METHODS,
  Ipv4AddressWithPrefixSchema,
} from '@iwana/shared';
import type {
  AssistedCreateIpv4NetworkBody,
  ControlMethod,
  RouterDto,
  RouterInterfaceDto,
  RouterInterfaceIpv4AddressDto,
} from '@iwana/shared';
import { Button, Input, RadioCardGroup } from '@iwana/ui';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PortalAlert, PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { collectListPages } from '@/lib/list-meta';
import { ApiError, networkApi } from '@/lib/api-client';
import {
  getControlMethodLabel,
  getCatalogIpProtectionState,
  getInterfaceStatusLabel,
  getNetworkApiErrorMessage,
  NETWORK_CATALOG_FIELD_HINTS,
} from './network-catalog-labels';
import {
  NetworkCatalogDrawerFrame,
  NetworkFormField,
  networkFormControlProps,
} from './NetworkCatalogDrawerFrame';

type NetworkSourceMode = 'INTERFACE_ADDRESS' | 'IP_PREFIX' | 'MANUAL_CIDR';

interface AssistedIpv4NetworkDrawerProps {
  open: boolean;
  routerContext: RouterDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface FormValues {
  routerId: string;
  interfaceId: string;
  sourceMode: NetworkSourceMode;
  sourceAddressId: string;
  addressWithPrefix: string;
  cidr: string;
  gateway: string;
  assignableFrom: string;
  assignableTo: string;
  excludedIpsText: string;
  defaultControlMethod: ControlMethod | '';
  name: string;
}

const formSchema = z.object({
  routerId: z.string().min(1, 'Selecciona un router.'),
  interfaceId: z.string(),
  sourceMode: z.enum(['INTERFACE_ADDRESS', 'IP_PREFIX', 'MANUAL_CIDR']),
  sourceAddressId: z.string(),
  addressWithPrefix: z.string(),
  cidr: z.string().min(1, 'Ingresa el bloque IPv4.'),
  gateway: z.string().min(1, 'Ingresa la puerta de enlace.'),
  assignableFrom: z.string().min(1, 'Ingresa la primera dirección asignable.'),
  assignableTo: z.string().min(1, 'Ingresa la última dirección asignable.'),
  excludedIpsText: z.string(),
  defaultControlMethod: z.string().min(1, 'Selecciona un método de control.'),
  name: z.string().max(120, 'El nombre puede tener hasta 120 caracteres.'),
});

const INITIAL_VALUES: FormValues = {
  routerId: '',
  interfaceId: '',
  sourceMode: 'MANUAL_CIDR',
  sourceAddressId: '',
  addressWithPrefix: '',
  cidr: '',
  gateway: '',
  assignableFrom: '',
  assignableTo: '',
  excludedIpsText: '',
  defaultControlMethod: '',
  name: '',
};

function splitExcludedIps(value: string): string[] | undefined {
  const addresses = value
    .split(',')
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
  return addresses.length > 0 ? addresses : undefined;
}

function ipToNumber(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function numberToIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function deriveAssignableCidr(addressWithPrefix: string): string | null {
  const parsed = Ipv4AddressWithPrefixSchema.safeParse(addressWithPrefix);
  if (!parsed.success) return null;
  const [host, prefixRaw] = parsed.data.split('/');
  const prefix = Number(prefixRaw);
  if (!host || prefix < 16 || prefix > 30) return null;
  const hostNumber = ipToNumber(host);
  if (hostNumber === null) return null;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return `${numberToIp(hostNumber & mask)}/${prefix}`;
}

function getApiFieldName(issuePath: PropertyKey[]): keyof FormValues | null {
  const field = issuePath[0];
  if (
    field === 'interfaceId' ||
    field === 'source' ||
    field === 'assignableFrom' ||
    field === 'assignableTo' ||
    field === 'defaultControlMethod' ||
    field === 'name'
  ) {
    return field === 'source' ? 'sourceAddressId' : field;
  }
  if (field === 'excludedIps') return 'excludedIpsText';
  return null;
}

function readCandidateHost(address: RouterInterfaceIpv4AddressDto): string {
  return address.host;
}

function modeLabel(mode: NetworkSourceMode): string {
  switch (mode) {
    case 'INTERFACE_ADDRESS':
      return 'Dirección registrada';
    case 'IP_PREFIX':
      return 'IP explícita con prefijo';
    case 'MANUAL_CIDR':
      return 'Bloque y puerta de enlace';
  }
}

export function AssistedIpv4NetworkDrawer({
  open,
  routerContext,
  onClose,
  onSaved,
}: AssistedIpv4NetworkDrawerProps) {
  const formId = `assisted-ipv4-network-${useId()}`;
  const initialFocusRef = useRef<HTMLInputElement | null>(null);
  const cidrEdited = useRef(false);
  const gatewayEdited = useRef(false);
  const sourceModeManuallySelected = useRef(false);
  const submitSummaryRef = useRef<HTMLDivElement | null>(null);
  const routerContextRequestId = useRef(0);
  const addressRequestId = useRef(0);
  const [routers, setRouters] = useState<RouterDto[]>([]);
  const [routerOptionsLoading, setRouterOptionsLoading] = useState(false);
  const [routerOptionsError, setRouterOptionsError] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<RouterInterfaceDto[]>([]);
  const [interfacesLoading, setInterfacesLoading] = useState(false);
  const [interfacesError, setInterfacesError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<RouterInterfaceIpv4AddressDto[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState<string | null>(null);
  const [catalogMetaState, setCatalogMetaState] = useState<'unknown' | 'pending' | 'active'>(
    'unknown',
  );
  const [catalogMetaError, setCatalogMetaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { register, handleSubmit, reset, setValue, setError, clearErrors, watch, formState } =
    useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: INITIAL_VALUES });
  const values = watch();
  const routerFieldId = `${formId}-router`;
  const interfaceFieldId = `${formId}-interface`;
  const sourceAddressId = `${formId}-source-address`;
  const cidrFieldId = `${formId}-cidr`;
  const gatewayFieldId = `${formId}-gateway`;
  const methodFieldId = `${formId}-method`;
  const cidrRegistration = register('cidr', {
    onChange: () => {
      cidrEdited.current = true;
    },
  });
  const selectedRouter = useMemo(
    () => routerContext ?? routers.find((item) => item.id === values.routerId) ?? null,
    [routerContext, routers, values.routerId],
  );
  const activeInterfaces = interfaces.filter((item) => item.status === 'ACTIVE');
  const selectedInterface = activeInterfaces.find((item) => item.id === values.interfaceId) ?? null;
  const candidates = useMemo(
    () =>
      addresses.map((address) => ({
        address,
        cidr: deriveAssignableCidr(address.addressWithPrefix),
      })),
    [addresses],
  );
  const validCandidates = useMemo(
    () =>
      candidates.filter(
        (item): item is { address: RouterInterfaceIpv4AddressDto; cidr: string } =>
          item.cidr !== null,
      ),
    [candidates],
  );
  const selectedCandidate = validCandidates.find(
    (item) => item.address.id === values.sourceAddressId,
  );
  const candidateChoiceRequired = values.sourceMode === 'INTERFACE_ADDRESS' && !selectedCandidate;
  const multipleCandidateChoiceRequired =
    values.sourceMode === 'INTERFACE_ADDRESS' && validCandidates.length > 1 && !selectedCandidate;
  const derivedFromCandidate =
    values.sourceMode === 'INTERFACE_ADDRESS' && selectedCandidate ? selectedCandidate : null;
  const derivedFromManualAddress =
    values.sourceMode === 'IP_PREFIX' ? deriveAssignableCidr(values.addressWithPrefix) : null;
  const explicitManualAddress =
    values.sourceMode === 'IP_PREFIX'
      ? Ipv4AddressWithPrefixSchema.safeParse(values.addressWithPrefix.trim())
      : null;
  const explicitManualHost = explicitManualAddress?.success
    ? (explicitManualAddress.data.split('/')[0] ?? '')
    : '';
  const suggestionCidr = derivedFromCandidate?.cidr ?? derivedFromManualAddress;
  const suggestionGateway = derivedFromCandidate
    ? readCandidateHost(derivedFromCandidate.address)
    : explicitManualHost;
  const suggestedName = values.cidr
    ? `${selectedInterface ? `${selectedInterface.name} · ` : ''}${values.cidr}`
    : '';
  const assignableCount = useMemo(() => {
    const from = ipToNumber(values.assignableFrom.trim());
    const to = ipToNumber(values.assignableTo.trim());
    return from !== null && to !== null && to >= from ? to - from + 1 : null;
  }, [values.assignableFrom, values.assignableTo]);
  const gatewayOrigin = derivedFromCandidate
    ? gatewayEdited.current
      ? 'Editada por ti'
      : `Propuesto desde ${selectedInterface?.name ?? 'la interfaz'} · ${derivedFromCandidate.address.addressWithPrefix}`
    : explicitManualHost
      ? gatewayEdited.current
        ? 'Editada por ti'
        : `Propuesto desde ${values.addressWithPrefix}`
      : 'Ingresada por ti';

  const loadRouters = useCallback(async () => {
    setRouterOptionsLoading(true);
    setRouterOptionsError(null);
    try {
      const result = await collectListPages(
        (page) => networkApi.listRouters({ page, limit: 100 }),
        {
          maxPages: 50,
          limit: 100,
        },
      );
      setRouters(result.data.filter((item) => item.status === 'ACTIVE'));
    } catch (error) {
      setRouterOptionsError(
        getNetworkApiErrorMessage(error, 'No pudimos cargar los routers disponibles.'),
      );
    } finally {
      setRouterOptionsLoading(false);
    }
  }, []);

  const loadRouterContext = useCallback(async (routerId: string) => {
    const requestId = ++routerContextRequestId.current;
    addressRequestId.current += 1;
    if (!routerId) {
      setInterfaces([]);
      setAddresses([]);
      setInterfacesLoading(false);
      setAddressesLoading(false);
      return;
    }
    setInterfacesLoading(true);
    setInterfacesError(null);
    setAddresses([]);
    setAddressesLoading(false);
    setAddressesError(null);
    const [interfacesResult, metaResult] = await Promise.allSettled([
      collectListPages((page) => networkApi.listRouterInterfaces(routerId, { page, limit: 100 }), {
        maxPages: 50,
        limit: 100,
      }),
      networkApi.getCatalogMeta(),
    ]);
    if (requestId !== routerContextRequestId.current) return;
    if (interfacesResult.status === 'fulfilled') {
      setInterfaces(interfacesResult.value.data);
    } else {
      setInterfaces([]);
      setInterfacesError(
        getNetworkApiErrorMessage(
          interfacesResult.reason,
          'No pudimos cargar las interfaces del router. Puedes ingresar el bloque y la puerta de enlace por separado.',
        ),
      );
    }
    if (metaResult.status === 'fulfilled') {
      const state = getCatalogIpProtectionState(metaResult.value);
      setCatalogMetaState(state);
      setCatalogMetaError(
        state === 'unknown'
          ? 'No pudimos verificar la protección de direcciones de infraestructura. No registres ni cambies IP locales desde este flujo.'
          : null,
      );
    } else {
      setCatalogMetaState('unknown');
      setCatalogMetaError(
        'No pudimos verificar la protección de direcciones de infraestructura. No registres ni cambies IP locales desde este flujo.',
      );
    }
    setInterfacesLoading(false);
  }, []);

  const loadAddresses = useCallback(async (routerId: string, interfaceId: string) => {
    const requestId = ++addressRequestId.current;
    if (!routerId || !interfaceId) return;
    setAddressesLoading(true);
    setAddressesError(null);
    try {
      const result = await collectListPages(
        (page) =>
          networkApi.listRouterInterfaceAddresses(routerId, interfaceId, {
            page,
            limit: 100,
          }),
        { maxPages: 50, limit: 100 },
      );
      if (requestId !== addressRequestId.current) return;
      setAddresses(result.data);
    } catch (error) {
      if (requestId !== addressRequestId.current) return;
      setAddressesError(
        getNetworkApiErrorMessage(
          error,
          'No pudimos cargar las direcciones de esta interfaz. Reintenta o ingresa el bloque y la puerta de enlace.',
        ),
      );
    } finally {
      if (requestId === addressRequestId.current) setAddressesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    reset({ ...INITIAL_VALUES, routerId: routerContext?.id ?? '' });
    cidrEdited.current = false;
    gatewayEdited.current = false;
    sourceModeManuallySelected.current = false;
    setSubmitError(null);
    setSuccessMessage(null);
    if (!routerContext) void loadRouters();
  }, [loadRouters, open, reset, routerContext]);

  useEffect(() => {
    if (!open || !values.routerId) {
      routerContextRequestId.current += 1;
      addressRequestId.current += 1;
      setInterfaces([]);
      setAddresses([]);
      setInterfacesLoading(false);
      setAddressesLoading(false);
      return;
    }
    void loadRouterContext(values.routerId);
    return () => {
      routerContextRequestId.current += 1;
      addressRequestId.current += 1;
    };
  }, [loadRouterContext, open, values.routerId]);

  useEffect(() => {
    sourceModeManuallySelected.current = false;
  }, [routerContext?.id, values.routerId]);

  useEffect(() => {
    if (!open || !values.interfaceId) {
      addressRequestId.current += 1;
      setAddresses([]);
      setAddressesLoading(false);
      setAddressesError(null);
      return;
    }
    setValue('sourceAddressId', '');
    setAddresses([]);
    setAddressesError(null);
    void loadAddresses(values.routerId, values.interfaceId);
    return () => {
      addressRequestId.current += 1;
    };
  }, [loadAddresses, open, setValue, values.interfaceId, values.routerId]);

  useEffect(() => {
    if (!values.interfaceId || addressesLoading) return;
    const available = validCandidates;
    const selectedAddressIsAvailable = available.some(
      (item) => item.address.id === values.sourceAddressId,
    );
    if (values.sourceMode === 'INTERFACE_ADDRESS') {
      if (selectedAddressIsAvailable) return;
      if (available.length === 1) {
        const candidate = available[0];
        if (candidate) setValue('sourceAddressId', candidate.address.id);
      } else {
        setValue('sourceAddressId', '');
        if (available.length === 0) setValue('sourceMode', 'MANUAL_CIDR');
      }
      return;
    }
    if (sourceModeManuallySelected.current) return;
    if (available.length > 0) {
      setValue('sourceMode', 'INTERFACE_ADDRESS');
      if (available.length === 1) {
        const candidate = available[0];
        if (candidate) setValue('sourceAddressId', candidate.address.id);
      }
    }
  }, [
    addressesLoading,
    setValue,
    validCandidates,
    values.interfaceId,
    values.sourceAddressId,
    values.sourceMode,
  ]);

  useEffect(() => {
    if (suggestionCidr && !cidrEdited.current) {
      setValue('cidr', suggestionCidr, { shouldDirty: false, shouldValidate: true });
    }
    if (suggestionGateway && !gatewayEdited.current) {
      setValue('gateway', suggestionGateway, { shouldDirty: false, shouldValidate: true });
    }
  }, [setValue, suggestionCidr, suggestionGateway]);

  useEffect(() => {
    if (!suggestedName || formState.dirtyFields.name) return;
    setValue('name', suggestedName.slice(0, 120), { shouldDirty: false, shouldValidate: true });
  }, [formState.dirtyFields.name, setValue, suggestedName]);

  useEffect(() => {
    if (selectedRouter?.supportedControlMethods.length === 1) {
      setValue('defaultControlMethod', selectedRouter.supportedControlMethods[0] ?? '', {
        shouldDirty: false,
      });
    }
  }, [selectedRouter, setValue]);

  const changeSourceMode = (mode: NetworkSourceMode) => {
    sourceModeManuallySelected.current = true;
    clearErrors(['sourceAddressId', 'addressWithPrefix', 'cidr', 'gateway']);
    setValue('sourceMode', mode, { shouldDirty: true });
    setSubmitError(null);
    if (mode === 'MANUAL_CIDR') {
      cidrEdited.current = true;
      gatewayEdited.current = true;
    }
  };

  const saveForm = handleSubmit(
    async (formValues) => {
      setIsSubmitting(true);
      setSubmitError(null);
      setSuccessMessage(null);
      const selectedInterfaceForSubmit = activeInterfaces.find(
        (item) => item.id === formValues.interfaceId,
      );
      let source: AssistedCreateIpv4NetworkBody['source'];
      if (formValues.sourceMode === 'INTERFACE_ADDRESS') {
        const candidate = validCandidates.find(
          (item) => item.address.id === formValues.sourceAddressId,
        );
        if (!candidate || !selectedInterfaceForSubmit) {
          setError('sourceAddressId', {
            type: 'manual',
            message: 'Elige una dirección registrada o cambia a ingreso manual.',
          });
          setIsSubmitting(false);
          return;
        }
        source = {
          mode: 'INTERFACE_ADDRESS',
          interfaceAddressId: candidate.address.id,
          interfaceAddressVersion: candidate.address.version,
          confirmedCidr: formValues.cidr.trim(),
          confirmedGateway: formValues.gateway.trim(),
        };
      } else if (formValues.sourceMode === 'IP_PREFIX') {
        const parsedAddress = Ipv4AddressWithPrefixSchema.safeParse(
          formValues.addressWithPrefix.trim(),
        );
        const suggestedCidr = deriveAssignableCidr(formValues.addressWithPrefix.trim());
        if (!parsedAddress.success || !suggestedCidr) {
          setError('addressWithPrefix', {
            type: 'manual',
            message:
              'Esta dirección no define un bloque para los servicios. Ingresa el bloque IPv4 y confirma la puerta de enlace.',
          });
          setIsSubmitting(false);
          return;
        }
        source = {
          mode: 'IP_PREFIX',
          addressWithPrefix: parsedAddress.data,
          confirmedCidr: formValues.cidr.trim(),
          confirmedGateway: formValues.gateway.trim(),
        };
      } else {
        source = {
          mode: 'MANUAL_CIDR',
          cidr: formValues.cidr.trim(),
          gateway: formValues.gateway.trim(),
        };
      }

      try {
        const body = AssistedCreateIpv4NetworkBodySchema.parse({
          ...(selectedInterfaceForSubmit
            ? {
                interfaceId: selectedInterfaceForSubmit.id,
                interfaceVersion: selectedInterfaceForSubmit.version,
              }
            : {}),
          ...(formValues.name.trim() ? { name: formValues.name.trim() } : {}),
          assignableFrom: formValues.assignableFrom.trim(),
          assignableTo: formValues.assignableTo.trim(),
          ...(splitExcludedIps(formValues.excludedIpsText)
            ? { excludedIps: splitExcludedIps(formValues.excludedIpsText) }
            : {}),
          defaultControlMethod: formValues.defaultControlMethod,
          source,
        });
        await networkApi.createAssistedIpv4Network(formValues.routerId, body);
        setSuccessMessage('Red IPv4 guardada.');
        await onSaved();
        onClose();
      } catch (error) {
        if (error instanceof z.ZodError) {
          for (const issue of error.issues) {
            const field = getApiFieldName(issue.path);
            if (field) setError(field, { type: 'manual', message: issue.message });
          }
          setSubmitError('Revisa los campos señalados antes de guardar.');
        } else {
          if (error instanceof ApiError && error.code === 'IP_PROTECTION_PENDING') {
            setCatalogMetaState('pending');
          }
          setSubmitError(
            getNetworkApiErrorMessage(
              error,
              'No pudimos guardar la red. El router sigue guardado; puedes reintentar solo esta red.',
            ),
          );
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    () => {
      setSubmitError('Revisa los campos señalados antes de guardar.');
    },
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (candidateChoiceRequired) {
      event.preventDefault();
      setError('sourceAddressId', {
        type: 'manual',
        message: 'Elige una dirección registrada o cambia a ingreso manual.',
      });
      setSubmitError('Elige una dirección registrada o cambia a ingreso manual.');
      return;
    }
    return saveForm(event);
  };

  const candidateOptions = candidates.map(({ address, cidr }) => ({
    value: address.id,
    title: `${selectedInterface?.name ?? 'Interfaz'} · ${address.addressWithPrefix}`,
    description: `Registrada en ${selectedInterface?.name ?? 'esta interfaz'}`,
    meta: address.addressWithPrefix,
    ...(cidr
      ? { disabled: false as const }
      : {
          disabled: true as const,
          disabledReason:
            address.prefixLength === 32
              ? 'No define un bloque para los servicios.'
              : 'El bloque derivado debe tener una máscara entre /16 y /30.',
        }),
  }));
  const noInterfacesLoaded = !interfacesLoading && !interfacesError && interfaces.length === 0;
  const statusText =
    catalogMetaState === 'active'
      ? 'El servidor habilitó la administración de direcciones IP locales. El estado del catálogo sigue siendo independiente.'
      : catalogMetaState === 'pending'
        ? 'La protección de direcciones de infraestructura está pendiente. Este formulario no registra IP locales.'
        : 'No pudimos verificar la protección de direcciones de infraestructura. El ingreso manual de bloque y puerta de enlace sigue disponible.';

  const submitErrorFields = [
    { field: 'routerId', id: routerFieldId, label: 'Router' },
    { field: 'sourceAddressId', id: `${sourceAddressId}-group`, label: 'Dirección base' },
    { field: 'addressWithPrefix', id: `${formId}-address-prefix`, label: 'IP con prefijo' },
    { field: 'cidr', id: cidrFieldId, label: 'Bloque IPv4' },
    { field: 'gateway', id: gatewayFieldId, label: 'Puerta de enlace' },
    { field: 'assignableFrom', id: `${formId}-from`, label: 'Primera dirección asignable' },
    { field: 'assignableTo', id: `${formId}-to`, label: 'Última dirección asignable' },
    { field: 'excludedIpsText', id: `${formId}-excluded`, label: 'IP excluidas de asignación' },
    { field: 'defaultControlMethod', id: methodFieldId, label: 'Método de control por defecto' },
    { field: 'name', id: `${formId}-name`, label: 'Nombre de la red' },
  ].filter(({ field }) => Boolean(formState.errors[field as keyof FormValues]));

  useEffect(() => {
    if (!submitError) return;
    submitSummaryRef.current?.focus();
  }, [submitError]);

  return (
    <NetworkCatalogDrawerFrame
      open={open}
      title="Registrar red IPv4"
      description="Completa la primera red del router sin cambiar sus datos guardados."
      formId={formId}
      submitLabel={
        multipleCandidateChoiceRequired ? 'Elige la dirección base para continuar' : 'Guardar red'
      }
      submitAriaDisabled={multipleCandidateChoiceRequired}
      submitting={isSubmitting}
      onSubmit={onSubmit}
      onClose={onClose}
      initialFocusRef={initialFocusRef}
    >
      <div className="space-y-5">
        {successMessage ? (
          <PortalAlert variant="success" title="Cambios guardados" description={successMessage} />
        ) : null}
        {submitError ? (
          <div ref={submitSummaryRef} tabIndex={-1}>
            <PortalAlert
              variant="error"
              title="No se guardó la red"
              live="assertive"
              description={
                <div className="space-y-2">
                  <p>{submitError}</p>
                  <ul className="list-inside list-disc space-y-1">
                    {submitErrorFields.length > 0 ? (
                      submitErrorFields.map(({ field, id, label }) => {
                        const message = formState.errors[field as keyof FormValues]?.message;
                        return (
                          <li key={field}>
                            <a className="font-medium underline" href={`#${id}`}>
                              {label}
                              {typeof message === 'string' ? `: ${message}` : ''}
                            </a>
                          </li>
                        );
                      })
                    ) : (
                      <li>
                        <a className="font-medium underline" href={`#${formId}`}>
                          Volver al formulario para reintentar
                        </a>
                      </li>
                    )}
                  </ul>
                </div>
              }
            />
          </div>
        ) : null}
        {routerOptionsError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar los routers"
            description={routerOptionsError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadRouters()}
              >
                Reintentar
              </Button>
            }
          />
        ) : null}
        {routerContext ? (
          <div className="rounded-xl border border-gray-200 bg-iwana-surface-soft p-3 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Router: {routerContext.name} ·{' '}
              {routerContext.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </p>
            <Link
              className="mt-2 inline-flex min-h-11 items-center font-medium text-iwana-secondary-700 underline dark:text-iwana-secondary-400"
              href={`/dashboard/network/routers?routerId=${encodeURIComponent(routerContext.id)}`}
            >
              Ver router
            </Link>
          </div>
        ) : values.routerId && selectedRouter ? (
          <div className="rounded-xl border border-gray-200 bg-iwana-surface-soft p-3 dark:border-dark-border dark:bg-dark-surface-3">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              Router: {selectedRouter.name} ·{' '}
              {selectedRouter.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
            </p>
          </div>
        ) : (
          <NetworkFormField
            id={routerFieldId}
            label="Router"
            error={formState.errors.routerId?.message}
          >
            <select
              {...register('routerId')}
              id={routerFieldId}
              className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
              disabled={routerOptionsLoading || routers.length === 0}
              aria-invalid={formState.errors.routerId ? true : undefined}
              aria-describedby={formState.errors.routerId ? `${routerFieldId}-error` : undefined}
            >
              <option value="">Selecciona un router</option>
              {routers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · Activo
                </option>
              ))}
            </select>
            {routerOptionsLoading ? <PortalSkeletonBlock className="mt-2 h-8 w-full" /> : null}
            {!routerOptionsLoading && routers.length === 0 && !routerOptionsError ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                No hay routers activos. Activa un router o registra uno nuevo.
              </p>
            ) : null}
          </NetworkFormField>
        )}

        {selectedRouter ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">{statusText}</p>
            {catalogMetaError ? (
              <PortalAlert
                variant="warning"
                title="Protección sin verificar"
                description={catalogMetaError}
              />
            ) : null}
            {values.routerId && interfacesError ? (
              <PortalAlert
                variant="warning"
                title="No pudimos cargar las interfaces"
                description={`${interfacesError} Puedes continuar con ingreso manual.`}
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => void loadRouterContext(values.routerId)}
                  >
                    Reintentar
                  </Button>
                }
              />
            ) : null}

            {activeInterfaces.length > 0 ? (
              <NetworkFormField
                id={interfaceFieldId}
                label="Interfaz asociada"
                hint="Opcional. Solo puedes asociar una interfaz activa de este router."
              >
                <select
                  {...register('interfaceId')}
                  id={interfaceFieldId}
                  className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
                  disabled={interfacesLoading}
                  aria-describedby={`${interfaceFieldId}-hint`}
                >
                  <option value="">Sin interfaz asociada</option>
                  {activeInterfaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {getInterfaceStatusLabel(item.status)}
                    </option>
                  ))}
                </select>
              </NetworkFormField>
            ) : null}

            {routerContext && !interfacesError && noInterfacesLoaded ? (
              <PortalAlert
                variant="info"
                title="Este router aún no tiene interfaces registradas"
                description="Puedes ingresar el bloque IPv4 y la puerta de enlace directamente."
              />
            ) : null}

            <section className="space-y-3">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  Origen del bloque
                </legend>
                {selectedInterface && validCandidates.length > 0 ? (
                  <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 dark:border-dark-border dark:text-gray-100">
                    <input
                      type="radio"
                      name={`${formId}-mode`}
                      value="INTERFACE_ADDRESS"
                      checked={values.sourceMode === 'INTERFACE_ADDRESS'}
                      onChange={() => changeSourceMode('INTERFACE_ADDRESS')}
                      className="h-4 w-4 accent-iwana-primary"
                    />
                    Usar una dirección registrada
                  </label>
                ) : null}
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 dark:border-dark-border dark:text-gray-100">
                  <input
                    type="radio"
                    name={`${formId}-mode`}
                    value="IP_PREFIX"
                    checked={values.sourceMode === 'IP_PREFIX'}
                    onChange={() => changeSourceMode('IP_PREFIX')}
                    className="h-4 w-4 accent-iwana-primary"
                  />
                  Ingresar IP explícita con prefijo
                </label>
                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 dark:border-dark-border dark:text-gray-100">
                  <input
                    type="radio"
                    name={`${formId}-mode`}
                    value="MANUAL_CIDR"
                    checked={values.sourceMode === 'MANUAL_CIDR'}
                    onChange={() => changeSourceMode('MANUAL_CIDR')}
                    className="h-4 w-4 accent-iwana-primary"
                  />
                  Ingresar bloque y puerta de enlace
                </label>
              </fieldset>

              {values.sourceMode === 'INTERFACE_ADDRESS' ? (
                <>
                  {addressesLoading ? (
                    <div aria-busy="true">
                      <PortalSkeletonBlock className="h-20 w-full" />
                    </div>
                  ) : null}
                  {addressesError ? (
                    <PortalAlert
                      variant="error"
                      title="No pudimos cargar las direcciones de la interfaz"
                      description={addressesError}
                      action={
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11"
                          onClick={() => void loadAddresses(values.routerId, values.interfaceId)}
                        >
                          Reintentar
                        </Button>
                      }
                    />
                  ) : addresses.length > 0 ? (
                    <>
                      <div id={`${sourceAddressId}-group`}>
                        <RadioCardGroup
                          legend="Dirección base de la red"
                          name={sourceAddressId}
                          value={values.sourceAddressId || null}
                          onChange={(value) => {
                            clearErrors('sourceAddressId');
                            setSubmitError(null);
                            setValue('sourceAddressId', value, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                          options={candidateOptions}
                          aria-describedby={
                            formState.errors.sourceAddressId
                              ? `${sourceAddressId}-hint ${sourceAddressId}-error`
                              : `${sourceAddressId}-hint`
                          }
                          aria-invalid={Boolean(formState.errors.sourceAddressId)}
                        />
                      </div>
                      <p
                        id={`${sourceAddressId}-hint`}
                        className="text-sm text-gray-600 dark:text-gray-300"
                      >
                        {multipleCandidateChoiceRequired
                          ? 'Elige la dirección base para continuar.'
                          : 'Cada opción muestra la interfaz y la dirección de origen.'}
                      </p>
                      {formState.errors.sourceAddressId?.message ? (
                        <p
                          id={`${sourceAddressId}-error`}
                          className="text-sm font-medium text-red-700 dark:text-red-300"
                        >
                          {formState.errors.sourceAddressId.message}
                        </p>
                      ) : null}
                    </>
                  ) : !addressesLoading && !addressesError ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Esta interfaz no tiene direcciones registradas. Ingresa el bloque y la puerta
                      de enlace.
                    </p>
                  ) : null}
                </>
              ) : null}

              {values.sourceMode === 'IP_PREFIX' ? (
                <NetworkFormField
                  id={`${formId}-address-prefix`}
                  label="IP con prefijo"
                  hint="Solo se usa como propuesta. No registra una dirección local ni una interfaz."
                  error={formState.errors.addressWithPrefix?.message}
                >
                  <Input
                    {...register('addressWithPrefix', {
                      onChange: (event) => {
                        const address = event.target.value.trim();
                        const parsed = Ipv4AddressWithPrefixSchema.safeParse(address);
                        const cidr = deriveAssignableCidr(address);
                        if (parsed.success && !gatewayEdited.current) {
                          setValue('gateway', parsed.data.split('/')[0] ?? '', {
                            shouldValidate: true,
                          });
                        }
                        if (cidr) {
                          if (!cidrEdited.current) setValue('cidr', cidr, { shouldValidate: true });
                        }
                      },
                    })}
                    {...networkFormControlProps(
                      `${formId}-address-prefix`,
                      formState.errors.addressWithPrefix?.message,
                      true,
                    )}
                    placeholder="192.0.2.10/24"
                    autoComplete="off"
                  />
                  {values.addressWithPrefix && !deriveAssignableCidr(values.addressWithPrefix) ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Esta dirección no define un bloque para los servicios. Ingresa el bloque IPv4
                      y confirma la puerta de enlace.
                    </p>
                  ) : null}
                </NetworkFormField>
              ) : null}

              {derivedFromCandidate || derivedFromManualAddress ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Propuesto desde{' '}
                  {derivedFromCandidate
                    ? `${selectedInterface?.name ?? 'la interfaz'} · ${selectedCandidate?.address.addressWithPrefix}`
                    : values.addressWithPrefix}
                </p>
              ) : null}
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <NetworkFormField
                id={cidrFieldId}
                label="Bloque IPv4 (CIDR)"
                hint={NETWORK_CATALOG_FIELD_HINTS.cidr}
                error={formState.errors.cidr?.message}
              >
                <Input
                  {...cidrRegistration}
                  {...networkFormControlProps(cidrFieldId, formState.errors.cidr?.message, true)}
                  ref={(element) => {
                    cidrRegistration.ref(element);
                    initialFocusRef.current = element;
                  }}
                  placeholder="192.0.2.0/24"
                  autoComplete="off"
                />
              </NetworkFormField>
              <NetworkFormField
                id={gatewayFieldId}
                label="Puerta de enlace"
                hint={NETWORK_CATALOG_FIELD_HINTS.gateway}
                error={formState.errors.gateway?.message}
              >
                <Input
                  {...register('gateway', {
                    onChange: () => {
                      gatewayEdited.current = true;
                    },
                  })}
                  {...networkFormControlProps(
                    gatewayFieldId,
                    formState.errors.gateway?.message,
                    true,
                  )}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </NetworkFormField>
            </div>
            {suggestedName && (cidrEdited.current || gatewayEdited.current) ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                onClick={() => {
                  cidrEdited.current = false;
                  gatewayEdited.current = false;
                  setValue('cidr', suggestionCidr ?? '', {
                    shouldDirty: false,
                    shouldValidate: true,
                  });
                  setValue('gateway', suggestionGateway, {
                    shouldDirty: false,
                    shouldValidate: true,
                  });
                }}
              >
                Restaurar sugerencia
              </Button>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <NetworkFormField
                id={`${formId}-from`}
                label="Primera dirección asignable"
                error={formState.errors.assignableFrom?.message}
              >
                <Input
                  {...register('assignableFrom')}
                  {...networkFormControlProps(
                    `${formId}-from`,
                    formState.errors.assignableFrom?.message,
                  )}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </NetworkFormField>
              <NetworkFormField
                id={`${formId}-to`}
                label="Última dirección asignable"
                error={formState.errors.assignableTo?.message}
              >
                <Input
                  {...register('assignableTo')}
                  {...networkFormControlProps(
                    `${formId}-to`,
                    formState.errors.assignableTo?.message,
                  )}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </NetworkFormField>
            </div>
            <NetworkFormField
              id={`${formId}-excluded`}
              label="IP excluidas de asignación"
              hint="Opcional. Para equipos u otros usos. Hasta 256 direcciones del bloque."
              error={formState.errors.excludedIpsText?.message}
            >
              <Input
                {...register('excludedIpsText')}
                {...networkFormControlProps(
                  `${formId}-excluded`,
                  formState.errors.excludedIpsText?.message,
                  true,
                )}
                placeholder="192.0.2.20, 192.0.2.21"
                autoComplete="off"
              />
            </NetworkFormField>
            <NetworkFormField
              id={methodFieldId}
              label="Método de control por defecto"
              error={formState.errors.defaultControlMethod?.message}
            >
              <select
                {...register('defaultControlMethod')}
                id={methodFieldId}
                className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="">
                  {selectedRouter.supportedControlMethods.length > 1
                    ? 'Selecciona un método'
                    : 'Sin método disponible'}
                </option>
                {selectedRouter.supportedControlMethods.map((method) => (
                  <option key={method} value={method}>
                    {getControlMethodLabel(method)}
                  </option>
                ))}
              </select>
            </NetworkFormField>
            <NetworkFormField
              id={`${formId}-name`}
              label="Nombre de la red"
              hint={
                formState.dirtyFields.name
                  ? 'Editado por ti.'
                  : suggestedName
                    ? 'Sugerido. Puedes cambiarlo.'
                    : 'Se sugerirá al definir el bloque.'
              }
              error={formState.errors.name?.message}
            >
              <Input
                {...register('name')}
                {...networkFormControlProps(`${formId}-name`, formState.errors.name?.message, true)}
                maxLength={120}
                placeholder="Se sugerirá al definir el bloque"
              />
              {suggestedName && formState.dirtyFields.name ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-1 min-h-11"
                  onClick={() =>
                    setValue('name', suggestedName.slice(0, 120), {
                      shouldDirty: false,
                      shouldValidate: true,
                    })
                  }
                >
                  Restaurar sugerencia
                </Button>
              ) : null}
            </NetworkFormField>
            <section
              aria-labelledby={`${formId}-summary-title`}
              className="space-y-3 rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 dark:border-dark-border dark:bg-dark-surface-3"
            >
              <h3
                id={`${formId}-summary-title`}
                className="text-sm font-semibold text-gray-900 dark:text-white"
              >
                Revisa antes de guardar
              </h3>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">Router</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">{selectedRouter.name}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">Interfaz</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {selectedInterface?.name ?? 'Sin interfaz asociada'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Bloque IPv4
                  </dt>
                  <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                    {values.cidr.trim() || 'Pendiente'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Puerta de enlace
                  </dt>
                  <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                    {values.gateway.trim() || 'Pendiente'}
                  </dd>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{gatewayOrigin}</p>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Origen del bloque
                  </dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">
                    {modeLabel(values.sourceMode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Rango para servicios
                  </dt>
                  <dd className="mt-1 font-mono text-gray-900 dark:text-white">
                    {values.assignableFrom.trim() || 'Pendiente'} –{' '}
                    {values.assignableTo.trim() || 'Pendiente'}
                  </dd>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {assignableCount === null
                      ? 'Capacidad estimada pendiente de un rango válido.'
                      : `Capacidad estimada: ${assignableCount.toLocaleString('es-CO')} direcciones. El servidor confirma la disponibilidad al guardar.`}
                  </p>
                </div>
              </dl>
            </section>
          </>
        ) : null}
      </div>
    </NetworkCatalogDrawerFrame>
  );
}
