'use client';

import { useEffect, useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CONTROL_METHODS, CreateRouterBodySchema } from '@iwana/shared';
import type { ControlMethod, CreateRouterBody, RouterDto } from '@iwana/shared';
import { z } from 'zod';
import { Input } from '@iwana/ui';
import { useForm } from 'react-hook-form';
import type {
  CoverageAdminConfig,
  CoverageNodeConfig,
  OrganizationSiteSummary,
} from '@/lib/api-client';
import { networkApi, organizationApi, tenantSelfApi } from '@/lib/api-client';
import { PortalAlert } from '@/components/shared/portal-ui';
import {
  NetworkCatalogDrawerFrame,
  NetworkFormField,
  networkFormControlProps,
} from './NetworkCatalogDrawerFrame';
import { getNetworkApiErrorMessage, getControlMethodLabel } from './network-catalog-labels';

interface NetworkRouterDrawerProps {
  open: boolean;
  router: RouterDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
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
    ...(router.lanInterface !== null ? { lanInterface: router.lanInterface } : {}),
    ...(router.organizationSiteId ? { organizationSiteId: router.organizationSiteId } : {}),
    ...(router.commercialNodeId ? { commercialNodeId: router.commercialNodeId } : {}),
    ...(router.notes !== null ? { notes: router.notes } : {}),
  };
}

function optionalValue(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

export function NetworkRouterDrawer({ open, router, onClose, onSaved }: NetworkRouterDrawerProps) {
  const formId = `network-router-${useId()}`;
  const [sites, setSites] = useState<OrganizationSiteSummary[]>([]);
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
  const methodsError = formState.errors.supportedControlMethods?.message;

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

    void Promise.allSettled([
      organizationApi.list({ page: 1, limit: 100 }),
      tenantSelfApi.getCoverage(),
    ]).then(([siteResult, nodeResult]) => {
      if (!active) return;
      const warnings: string[] = [];
      if (siteResult.status === 'fulfilled') {
        setSites(siteResult.value.data.filter((site) => site.isActive));
      } else {
        warnings.push('No pudimos cargar las sedes. Puedes continuar sin asociar una sede.');
      }
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
  }, [open]);

  const onSubmit = handleSubmit(async (formValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    const body: CreateRouterBody = {
      name: formValues.name.trim(),
      managementHost: formValues.managementHost.trim(),
      supportedControlMethods: formValues.supportedControlMethods,
      ...(optionalValue(formValues.lanInterface ?? '')
        ? { lanInterface: optionalValue(formValues.lanInterface ?? '') }
        : {}),
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
      if (router) {
        await networkApi.updateRouter(router.id, { ...body, version: router.version });
      } else {
        await networkApi.createRouter(body);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setSubmitError(
        getNetworkApiErrorMessage(error, 'No pudimos guardar el router. Intenta nuevamente.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  });

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
      submitLabel={router ? 'Guardar cambios' : 'Registrar router'}
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
        {catalogWarning ? (
          <PortalAlert
            variant="warning"
            title="Referencias no disponibles"
            description={catalogWarning}
          />
        ) : null}

        <NetworkFormField
          id={`${formId}-name`}
          label="Nombre"
          error={formState.errors.name?.message}
        >
          <Input
            {...register('name')}
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

        <NetworkFormField
          id={`${formId}-lan-interface`}
          label="Interfaz LAN"
          hint="Opcional, máximo 64 caracteres."
          error={formState.errors.lanInterface?.message}
        >
          <Input
            {...register('lanInterface')}
            {...networkFormControlProps(
              `${formId}-lan-interface`,
              formState.errors.lanInterface?.message,
              true,
            )}
            maxLength={64}
            autoComplete="off"
          />
        </NetworkFormField>

        <fieldset
          className="space-y-2"
          aria-describedby={methodsError ? `${formId}-methods-error` : undefined}
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

        <NetworkFormField id={siteFieldId} label="Sede" hint="Opcional.">
          <select
            id={siteFieldId}
            className="portal-input-surface min-h-11 w-full px-3 py-2 text-sm text-gray-900 dark:text-white"
            value={selectedSiteId}
            disabled={catalogLoading || (sites.length === 0 && !hasUnknownSite)}
            onChange={(event) =>
              setValue('organizationSiteId', event.target.value || undefined, { shouldDirty: true })
            }
          >
            <option value="">Sin sede asociada</option>
            {hasUnknownSite ? (
              <option value={router?.organizationSiteId ?? ''}>
                Sede asociada (nombre no disponible)
              </option>
            ) : null}
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </NetworkFormField>

        <NetworkFormField id={nodeFieldId} label="Nodo comercial" hint="Opcional.">
          <select
            id={nodeFieldId}
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
