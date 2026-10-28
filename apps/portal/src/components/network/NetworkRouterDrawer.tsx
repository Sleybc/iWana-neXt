'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CONTROL_METHODS, CreateRouterBodySchema, UpdateRouterBodySchema } from '@iwana/shared';
import type {
  ControlMethod,
  CreateRouterBody,
  RouterDto,
  RouterSiteOptionDto,
  UpdateRouterBody,
} from '@iwana/shared';
import { z } from 'zod';
import { Button, Input } from '@iwana/ui';
import { useForm } from 'react-hook-form';
import type { CoverageAdminConfig, CoverageNodeConfig } from '@/lib/api-client';
import { networkApi, tenantSelfApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  NetworkCatalogDrawerFrame,
  NetworkFormField,
  networkFormControlProps,
} from './NetworkCatalogDrawerFrame';
import {
  getNetworkApiErrorMessage,
  getControlMethodLabel,
  getOrganizationSiteTypeLabel,
  NETWORK_CATALOG_FIELD_HINTS,
} from './network-catalog-labels';

interface NetworkRouterDrawerProps {
  open: boolean;
  router: RouterDto | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRouterCreated?: (router: RouterDto) => void;
}

type RouterFormValues = CreateRouterBody;

const routerFormSchema = CreateRouterBodySchema.superRefine((values, context) => {
  if (!values.name.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['name'],
      message: 'El nombre es obligatorio.',
    });
  }
});

const EMPTY_FORM: RouterFormValues = {
  name: '',
  managementHost: '',
  supportedControlMethods: [CONTROL_METHODS[0]],
};

function mapRouterValues(router: RouterDto): RouterFormValues {
  return {
    name: router.name,
    managementHost: router.managementHost,
    supportedControlMethods: router.supportedControlMethods,
    ...(router.organizationSiteId ? { organizationSiteId: router.organizationSiteId } : {}),
    ...(router.commercialNodeId ? { commercialNodeId: router.commercialNodeId } : {}),
    ...(router.notes !== null ? { notes: router.notes } : {}),
  };
}

function optionalValue(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

export function NetworkRouterDrawer({
  open,
  router,
  canManage,
  onClose,
  onSaved,
  onRouterCreated,
}: NetworkRouterDrawerProps) {
  const formId = `network-router-${useId()}`;
  const nameFocusRef = useRef<HTMLInputElement | null>(null);
  const [sites, setSites] = useState<RouterSiteOptionDto[]>([]);
  const [siteOptionsPage, setSiteOptionsPage] = useState(0);
  const [siteOptionsHasMore, setSiteOptionsHasMore] = useState(false);
  const [siteOptionsLoading, setSiteOptionsLoading] = useState(false);
  const [siteOptionsError, setSiteOptionsError] = useState<string | null>(null);
  const [siteOptionsRetryPage, setSiteOptionsRetryPage] = useState(1);
  const [nodes, setNodes] = useState<CoverageNodeConfig[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, reset, setValue, watch, formState } = useForm<RouterFormValues>({
    resolver: zodResolver(routerFormSchema),
    defaultValues: EMPTY_FORM,
  });
  const values = watch();
  const siteFieldId = `${formId}-site`;
  const nodeFieldId = `${formId}-node`;
  const methodFieldId = `${formId}-methods-group`;
  const methodsError = formState.errors.supportedControlMethods?.message;
  const nameRegistration = register('name');

  const loadRouterSiteOptions = useCallback(
    async (page: number, append: boolean) => {
      if (!canManage) return;
      setSiteOptionsLoading(true);
      setSiteOptionsRetryPage(page);
      setSiteOptionsError(null);
      try {
        const result = await networkApi.listRouterSiteOptions({ page, limit: 100 });
        setSites((current) => (append ? [...current, ...result.data] : result.data));
        setSiteOptionsPage(result.meta.page ?? page);
        setSiteOptionsHasMore(result.meta.hasMore);
      } catch (error) {
        setSiteOptionsError(
          getNetworkApiErrorMessage(
            error,
            'No pudimos cargar las sedes. Reintenta o continúa sin asociar una.',
          ),
        );
      } finally {
        setSiteOptionsLoading(false);
      }
    },
    [canManage],
  );

  useEffect(() => {
    if (!open) return;
    reset(router ? mapRouterValues(router) : EMPTY_FORM);
    setSubmitError(null);
  }, [open, reset, router]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCatalogLoading(true);
    setCatalogWarning(null);
    setSites([]);
    setSiteOptionsPage(0);
    setSiteOptionsHasMore(false);
    setSiteOptionsError(null);

    void Promise.allSettled([
      canManage ? loadRouterSiteOptions(1, false) : Promise.resolve(),
      tenantSelfApi.getCoverage(),
    ]).then(([, nodeResult]) => {
      if (!active) return;
      const warnings: string[] = [];
      if (nodeResult.status === 'fulfilled') {
        const data = nodeResult.value as CoverageAdminConfig;
        setNodes(data.nodes.filter((node) => node.isActive));
      } else {
        warnings.push('No pudimos cargar los nodos comerciales. Puedes continuar sin asociar uno.');
      }
      setCatalogWarning(warnings.length > 0 ? warnings.join(' ') : null);
      setCatalogLoading(false);
    });

    return () => {
      active = false;
    };
  }, [canManage, loadRouterSiteOptions, open]);

  const saveRouter = async (formValues: RouterFormValues, continueToNetwork: boolean) => {
    setIsSubmitting(true);
    setSubmitError(null);
    const createBody: CreateRouterBody = {
      name: formValues.name.trim(),
      managementHost: formValues.managementHost.trim(),
      supportedControlMethods: formValues.supportedControlMethods,
      ...(optionalValue(formValues.organizationSiteId ?? '')
        ? { organizationSiteId: optionalValue(formValues.organizationSiteId ?? '') }
        : {}),
      ...(optionalValue(formValues.commercialNodeId ?? '')
        ? { commercialNodeId: optionalValue(formValues.commercialNodeId ?? '') }
        : {}),
      ...(optionalValue(formValues.notes ?? '')
        ? { notes: optionalValue(formValues.notes ?? '') }
        : {}),
    };

    try {
      let savedRouter: RouterDto | null = null;
      if (router) {
        const selectedSiteId = optionalValue(formValues.organizationSiteId ?? '');
        const selectedNodeId = optionalValue(formValues.commercialNodeId ?? '');
        const selectedNotes = optionalValue(formValues.notes ?? '');
        const updateBody: UpdateRouterBody = UpdateRouterBodySchema.parse({
          version: router.version,
          ...(formValues.name.trim() !== router.name ? { name: formValues.name.trim() } : {}),
          ...(formValues.managementHost.trim() !== router.managementHost
            ? { managementHost: formValues.managementHost.trim() }
            : {}),
          ...(JSON.stringify(formValues.supportedControlMethods) !==
          JSON.stringify(router.supportedControlMethods)
            ? { supportedControlMethods: formValues.supportedControlMethods }
            : {}),
          ...(selectedSiteId !== (router.organizationSiteId ?? '')
            ? { organizationSiteId: selectedSiteId ?? null }
            : {}),
          ...(selectedNodeId !== (router.commercialNodeId ?? '')
            ? { commercialNodeId: selectedNodeId ?? null }
            : {}),
          ...(selectedNotes !== (router.notes ?? '') && selectedNotes
            ? { notes: selectedNotes }
            : {}),
        });
        savedRouter = await networkApi.updateRouter(router.id, updateBody);
      } else {
        savedRouter = await networkApi.createRouter(createBody);
      }
      await onSaved();
      onClose();
      if (!router && continueToNetwork && savedRouter) onRouterCreated?.(savedRouter);
    } catch (error) {
      setSubmitError(
        getNetworkApiErrorMessage(error, 'No pudimos guardar el router. Intenta nuevamente.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = handleSubmit((formValues) => saveRouter(formValues, !router));
  const saveWithoutContinuing = handleSubmit((formValues) => saveRouter(formValues, false));

  const selectedSiteId = values.organizationSiteId ?? '';
  const selectedNodeId = values.commercialNodeId ?? '';
  const hasUnknownSite = Boolean(
    router?.organizationSiteId && !sites.some((site) => site.id === router.organizationSiteId),
  );
  const hasUnknownNode = Boolean(
    router?.commercialNodeId && !nodes.some((node) => node.id === router.commercialNodeId),
  );

  return (
    <NetworkCatalogDrawerFrame
      open={open}
      title={router ? 'Editar router' : 'Registrar router'}
      description="Define cómo identificar el equipo y dónde opera dentro de la empresa."
      formId={formId}
      submitLabel={router ? 'Guardar cambios' : 'Guardar y añadir red'}
      submitting={isSubmitting}
      {...(router
        ? {}
        : {
            secondaryAction: {
              label: 'Guardar router',
              onClick: () => void saveWithoutContinuing(),
            },
          })}
      initialFocusRef={nameFocusRef}
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
        {catalogWarning ? (
          <PortalAlert
            variant="warning"
            title="Referencias no disponibles"
            description={catalogWarning}
          />
        ) : null}

        <NetworkFormField
          id={`${formId}-name`}
          label="Nombre del router"
          error={formState.errors.name?.message}
        >
          <Input
            {...nameRegistration}
            ref={(element) => {
              nameRegistration.ref(element);
              nameFocusRef.current = element;
            }}
            {...networkFormControlProps(`${formId}-name`, formState.errors.name?.message)}
            maxLength={120}
            autoComplete="off"
          />
        </NetworkFormField>

        <NetworkFormField
          id={`${formId}-management-host`}
          label="Dirección de administración"
          hint="Ingresa una dirección IPv4 o un nombre de dominio completo."
          error={formState.errors.managementHost?.message}
        >
          <Input
            {...register('managementHost')}
            {...networkFormControlProps(
              `${formId}-management-host`,
              formState.errors.managementHost?.message,
              true,
            )}
            maxLength={255}
            autoComplete="url"
          />
        </NetworkFormField>

        {router?.lanInterface ? (
          <section className="space-y-1 rounded-xl border border-gray-200 bg-iwana-surface-soft p-3 dark:border-dark-border dark:bg-dark-surface-3">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              Referencia LAN anterior
            </h3>
            <p className="font-mono text-sm text-gray-800 dark:text-gray-100">
              {router.lanInterface}
            </p>
            <p className="text-xs leading-5 text-gray-600 dark:text-gray-300">
              Dato heredado. No es una interfaz registrada.
            </p>
          </section>
        ) : null}

        <fieldset
          id={methodFieldId}
          role="group"
          tabIndex={-1}
          className="space-y-2"
          aria-describedby={methodsError ? `${formId}-methods-error` : undefined}
          aria-invalid={methodsError ? true : undefined}
        >
          <legend className="text-sm font-medium text-gray-800 dark:text-gray-100">
            Métodos de control admitidos
          </legend>
          <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
            Selecciona al menos un método. Las direcciones se configurarán manualmente en el router.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTROL_METHODS.map((method) => {
              const checked = (values.supportedControlMethods ?? []).includes(method);
              return (
                <label
                  key={method}
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-dark-border dark:text-gray-200"
                >
                  <input
                    type="checkbox"
                    aria-invalid={methodsError ? true : undefined}
                    checked={checked}
                    onChange={(event) => {
                      const current = values.supportedControlMethods ?? [];
                      const next = event.target.checked
                        ? [...current, method]
                        : current.filter((item) => item !== method);
                      setValue('supportedControlMethods', next as ControlMethod[], {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    className="h-4 w-4 accent-iwana-primary"
                  />
                  <span>{getControlMethodLabel(method)}</span>
                </label>
              );
            })}
          </div>
          {methodsError ? (
            <p
              id={`${formId}-methods-error`}
              className="text-xs font-medium text-red-700 dark:text-red-300"
            >
              {methodsError}
            </p>
          ) : null}
        </fieldset>

        <NetworkFormField
          id={siteFieldId}
          label="Sede física"
          hint={NETWORK_CATALOG_FIELD_HINTS.organizationSite}
        >
          <select
            id={siteFieldId}
            aria-describedby={`${siteFieldId}-hint`}
            className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            value={selectedSiteId}
            disabled={!canManage || catalogLoading || siteOptionsLoading}
            onChange={(event) =>
              setValue('organizationSiteId', event.target.value || undefined, { shouldDirty: true })
            }
          >
            <option value="">Sin sede asociada</option>
            {hasUnknownSite ? (
              <option value={router?.organizationSiteId ?? ''}>
                {router?.organizationSite
                  ? `${router.organizationSite.name} · ${getOrganizationSiteTypeLabel(router.organizationSite.siteType)} · ${router.organizationSite.isActive ? 'Activa' : 'Inactiva'}`
                  : 'Sede asociada (nombre no disponible)'}
              </option>
            ) : null}
            {sites
              .filter(
                (site) =>
                  site.isActive || (router?.organizationSiteId === site.id && !site.isActive),
              )
              .map((site) => (
                <option key={site.id} value={site.id} disabled={!site.isActive}>
                  {site.name} · {getOrganizationSiteTypeLabel(site.siteType)} ·{' '}
                  {site.isActive ? 'Activa' : 'Inactiva'}
                </option>
              ))}
          </select>
          {siteOptionsError ? (
            <PortalAlert
              variant="warning"
              title="No pudimos cargar las sedes"
              description={siteOptionsError}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  disabled={siteOptionsLoading}
                  onClick={() =>
                    void loadRouterSiteOptions(siteOptionsRetryPage, siteOptionsPage > 0)
                  }
                >
                  Reintentar
                </Button>
              }
            />
          ) : siteOptionsHasMore ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={siteOptionsLoading || catalogLoading}
              onClick={() => void loadRouterSiteOptions(siteOptionsPage + 1, true)}
            >
              Cargar más sedes
            </Button>
          ) : sites.length === 0 && !siteOptionsLoading ? (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              No hay sedes disponibles para asociar.
            </p>
          ) : null}
        </NetworkFormField>

        <NetworkFormField
          id={nodeFieldId}
          label="Nodo comercial"
          hint={NETWORK_CATALOG_FIELD_HINTS.commercialNode}
        >
          <select
            id={nodeFieldId}
            aria-describedby={`${nodeFieldId}-hint`}
            className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            value={selectedNodeId}
            disabled={catalogLoading || (nodes.length === 0 && !hasUnknownNode)}
            onChange={(event) =>
              setValue('commercialNodeId', event.target.value || undefined, { shouldDirty: true })
            }
          >
            <option value="">Sin nodo comercial asociado</option>
            {hasUnknownNode ? (
              <option value={router?.commercialNodeId ?? ''}>
                Nodo asociado (nombre no disponible)
              </option>
            ) : null}
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </NetworkFormField>

        <NetworkFormField
          id={`${formId}-notes`}
          label="Notas"
          hint="Opcional, máximo 1000 caracteres."
          error={formState.errors.notes?.message}
        >
          <textarea
            {...register('notes')}
            id={`${formId}-notes`}
            aria-invalid={formState.errors.notes ? true : undefined}
            aria-describedby={
              formState.errors.notes
                ? `${formId}-notes-hint ${formId}-notes-error`
                : `${formId}-notes-hint`
            }
            maxLength={1000}
            rows={3}
            className="portal-input-surface min-h-24 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
          />
        </NetworkFormField>
      </div>
    </NetworkCatalogDrawerFrame>
  );
}
