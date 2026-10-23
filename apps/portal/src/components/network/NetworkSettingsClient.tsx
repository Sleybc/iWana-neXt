'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import type { NetworkSettingsDto, PlanProfileDto } from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import { Pencil, Settings2 } from 'lucide-react';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  NetworkCatalogDrawerFrame,
  NetworkFormField,
  networkFormControlProps,
} from '@/components/network/NetworkCatalogDrawerFrame';
import {
  PortalAlert,
  PortalEmptyState,
  PortalPanel,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { collectListPages } from '@/lib/list-meta';
import { ApiError, commercialApi, networkApi } from '@/lib/api-client';
import type { PlanCatalogItem } from '@/lib/api-client';
import { formatNetworkDate } from './network-provisioning-labels';

const PLAN_PAGE_SIZE = 100;

function mapSettingsError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes acceso a los ajustes de red.';
  }
  return fallback;
}

function mapSettingsMutationError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 403) {
    return 'No tienes permiso para cambiar este ajuste.';
  }
  return fallback;
}

export function NetworkSettingsClient() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(AccessPermissionKey.NETWORK_CATALOG_MANAGE);
  const [plans, setPlans] = useState<PlanCatalogItem[]>([]);
  const [profiles, setProfiles] = useState<PlanProfileDto[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [settings, setSettings] = useState<NetworkSettingsDto | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [confirmingValue, setConfirmingValue] = useState<boolean | null>(null);
  const [editingPlan, setEditingPlan] = useState<PlanCatalogItem | null>(null);
  const [draftAddressList, setDraftAddressList] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState('');
  const switchRef = useRef<HTMLButtonElement>(null);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const [planResponse, profileResponse] = await Promise.all([
        collectListPages((page) => commercialApi.getPlans({ page, limit: PLAN_PAGE_SIZE }), {
          limit: PLAN_PAGE_SIZE,
        }),
        networkApi.listPlanProfiles(),
      ]);
      setPlans(planResponse.data);
      setProfiles(profileResponse);
    } catch (error) {
      setPlansError(
        mapSettingsError(error, 'No pudimos cargar los planes y sus listas PCQ. Reintenta.'),
      );
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      setSettings(await networkApi.getSettings());
    } catch (error) {
      setSettingsError(
        mapSettingsError(error, 'No pudimos cargar el requisito de certificación. Reintenta.'),
      );
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
    void loadSettings();
  }, [loadPlans, loadSettings]);

  const profilesByPlanId = useMemo(
    () => new Map(profiles.map((profile) => [profile.planId, profile])),
    [profiles],
  );

  const openProfileEditor = (plan: PlanCatalogItem) => {
    const profile = profilesByPlanId.get(plan.id);
    setEditingPlan(plan);
    setDraftAddressList(profile?.pcqAddressList ?? '');
    setProfileError(null);
    setProfileSuccess('');
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingPlan) return;
    const value = draftAddressList.trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/u.test(value)) {
      setProfileError('Usa de 1 a 64 letras, números, puntos, guiones o guiones bajos.');
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const saved = await networkApi.savePlanProfile(editingPlan.id, { pcqAddressList: value });
      setProfiles((current) => [
        ...current.filter((profile) => profile.planId !== saved.planId),
        saved,
      ]);
      setEditingPlan(null);
      setProfileSuccess('Lista de direcciones PCQ guardada.');
    } catch (error) {
      setProfileError(
        mapSettingsMutationError(
          error,
          'No fue posible guardar la lista de direcciones PCQ. Revisa el valor e intenta nuevamente.',
        ),
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const updateSetting = async () => {
    if (confirmingValue === null) return;
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess('');
    try {
      const updated = await networkApi.updateSettings({
        enforceProvisioningOnInstallClose: confirmingValue,
      });
      setSettings(updated);
      setSettingsSuccess('Ajuste actualizado.');
      setConfirmingValue(null);
    } catch (error) {
      setSettingsError(
        mapSettingsMutationError(error, 'No fue posible actualizar el ajuste. Reintenta.'),
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="portal-eyebrow">Red</p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Ajustes de red</h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          Configura las listas de direcciones de los planes y el requisito para cerrar
          instalaciones.
        </p>
      </header>

      {profileSuccess ? (
        <p className="sr-only" role="status" aria-live="polite">
          {profileSuccess}
        </p>
      ) : null}
      {profileSuccess ? (
        <PortalAlert variant="success" title="Cambios guardados" description={profileSuccess} />
      ) : null}

      <PortalPanel
        eyebrow="Catálogo comercial"
        title="Listas de direcciones PCQ por plan"
        description="Relaciona cada plan con la lista de direcciones que usará el equipo de red."
        contentClassName="space-y-4"
      >
        {plansError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar los planes"
            description={plansError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadPlans()}
              >
                Reintentar
              </Button>
            }
          />
        ) : plansLoading ? (
          <div className="space-y-3" aria-busy="true">
            <p className="sr-only" role="status" aria-live="polite">
              Cargando planes y listas de direcciones
            </p>
            {[0, 1, 2].map((row) => (
              <PortalSkeletonBlock key={row} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <PortalEmptyState
            icon={Settings2}
            title="Todavía no hay planes disponibles para configurar"
            description="Cuando haya planes en el catálogo comercial, podrás asociarles una lista de direcciones PCQ."
          />
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-dark-border"
            role="region"
            aria-label="Planes y listas de direcciones PCQ"
            tabIndex={0}
          >
            <table className="min-w-[520px] w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:bg-dark-surface-3 dark:text-gray-300">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Lista de direcciones PCQ
                  </th>
                  {canManage ? (
                    <th scope="col" className="px-4 py-3">
                      Acciones
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2">
                {plans.map((plan) => {
                  const profile = profilesByPlanId.get(plan.id);
                  return (
                    <tr key={plan.id}>
                      <th
                        scope="row"
                        className="px-4 py-3 text-left font-medium text-gray-900 dark:text-white"
                      >
                        {plan.name}
                      </th>
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">
                        {profile?.pcqAddressList ?? (
                          <span className="font-sans text-gray-500 dark:text-gray-400">
                            Sin configurar
                          </span>
                        )}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11"
                            onClick={() => openProfileEditor(plan)}
                          >
                            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                            {profile ? 'Editar' : 'Configurar'}
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PortalPanel>

      <PortalPanel
        eyebrow="Cierre de instalaciones"
        title="Aprovisionamiento certificado"
        description="Decide si una instalación ejecutada necesita un servicio certificado antes de cerrar la orden."
        contentClassName="space-y-4"
      >
        {settingsError ? (
          <PortalAlert
            variant="error"
            title="No pudimos cargar el ajuste"
            description={settingsError}
            action={
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => void loadSettings()}
              >
                Reintentar
              </Button>
            }
          />
        ) : settingsLoading || !settings ? (
          <div className="space-y-3" aria-busy="true">
            <p className="sr-only" role="status" aria-live="polite">
              Cargando ajustes de red
            </p>
            <PortalSkeletonBlock className="h-16 rounded-xl" />
            <PortalSkeletonBlock className="h-10 w-64 rounded-xl" />
          </div>
        ) : (
          <>
            {settingsSuccess ? (
              <p className="sr-only" role="status" aria-live="polite">
                {settingsSuccess}
              </p>
            ) : null}
            {settingsSuccess ? (
              <PortalAlert
                variant="success"
                title="Ajuste actualizado"
                description={settingsSuccess}
              />
            ) : null}
            <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  Exigir el aprovisionamiento certificado para cerrar instalaciones
                </p>
                <p className="max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-300">
                  Al activarlo, las órdenes de instalación con resultado ejecutado requieren un
                  servicio certificado para cerrarse. También aplica a órdenes que ya están en
                  curso. Las órdenes no ejecutadas no requieren certificación.
                </p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {settings.enforceProvisioningOnInstallClose ? 'Activado' : 'Desactivado'}
                </p>
              </div>
              {canManage ? (
                <Button
                  ref={switchRef}
                  type="button"
                  variant={settings.enforceProvisioningOnInstallClose ? 'primary' : 'secondary'}
                  role="switch"
                  aria-checked={settings.enforceProvisioningOnInstallClose}
                  aria-label="Exigir el aprovisionamiento certificado para cerrar instalaciones"
                  className="min-h-11 shrink-0"
                  onClick={() => {
                    setSettingsSuccess('');
                    setConfirmingValue(!settings.enforceProvisioningOnInstallClose);
                  }}
                >
                  {settings.enforceProvisioningOnInstallClose
                    ? 'Desactivar requisito'
                    : 'Activar requisito'}
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {settings.updatedAt
                ? `Último cambio: ${formatNetworkDate(settings.updatedAt)} · ${settings.updatedBy?.name?.trim() || 'Nombre no disponible'}`
                : 'Sin cambios registrados'}
            </p>
          </>
        )}
      </PortalPanel>

      {profileError ? (
        <p className="sr-only" role="alert">
          {profileError}
        </p>
      ) : null}
      <NetworkCatalogDrawerFrame
        open={editingPlan !== null}
        title={
          editingPlan
            ? `${profilesByPlanId.has(editingPlan.id) ? 'Editar' : 'Configurar'} lista PCQ · ${editingPlan.name}`
            : 'Lista PCQ'
        }
        description="Asocia la lista de direcciones PCQ con este plan."
        formId="network-plan-profile-form"
        submitLabel="Guardar lista"
        submitting={profileSaving}
        onSubmit={(event) => void saveProfile(event)}
        onClose={() => {
          if (!profileSaving) setEditingPlan(null);
        }}
      >
        {editingPlan ? (
          <div className="space-y-4">
            {profileError ? (
              <PortalAlert
                variant="error"
                title="No fue posible guardar la lista"
                description={profileError}
              />
            ) : null}
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Plan:{' '}
              <span className="font-medium text-gray-900 dark:text-white">{editingPlan.name}</span>
            </p>
            <NetworkFormField
              id="network-plan-profile-address-list"
              label="Lista de direcciones PCQ"
              hint="Usa de 1 a 64 letras, números, puntos, guiones o guiones bajos."
              error={profileError ?? undefined}
            >
              <Input
                {...networkFormControlProps(
                  'network-plan-profile-address-list',
                  profileError ?? undefined,
                  true,
                )}
                value={draftAddressList}
                onChange={(event) => {
                  setDraftAddressList(event.target.value);
                  setProfileError(null);
                }}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
              />
            </NetworkFormField>
          </div>
        ) : null}
      </NetworkCatalogDrawerFrame>

      <Dialog
        open={confirmingValue !== null}
        onOpenChange={(open) => !open && !settingsSaving && setConfirmingValue(null)}
      >
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={() => !settingsSaving && setConfirmingValue(null)}
        >
          <DialogHeader>
            <DialogTitle>
              {confirmingValue ? 'Activar requisito' : 'Desactivar requisito'}
            </DialogTitle>
            <DialogDescription>
              {confirmingValue
                ? 'El cierre de una instalación ejecutada quedará pendiente hasta certificar el aprovisionamiento. La regla también aplicará a las órdenes que ya están en curso.'
                : 'El cierre dejará de bloquearse por falta de la certificación del aprovisionamiento.'}
            </DialogDescription>
          </DialogHeader>
          {settingsError ? (
            <PortalAlert
              variant="error"
              title="No fue posible actualizar el ajuste"
              description={settingsError}
            />
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={settingsSaving}
              onClick={() => setConfirmingValue(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="min-h-11"
              loading={settingsSaving}
              disabled={settingsSaving}
              onClick={() => void updateSetting()}
            >
              {confirmingValue ? 'Activar requisito' : 'Desactivar requisito'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
