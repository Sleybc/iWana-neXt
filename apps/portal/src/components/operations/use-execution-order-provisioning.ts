'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessPermissionKey } from '@iwana/shared';
import type {
  ExecutionOrderContract,
  ProvisioningOrderContextDto,
  ServiceProvisioningDto,
  TechnicianProvisioningViewDto,
} from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import { NETWORK_PROVISIONING_COPY } from '@/components/network/network-provisioning-labels';
import { ApiError, contractSigningApi, networkApi } from '@/lib/api-client';
import {
  resolveExecutionOrderContract,
  type ExecutionOrderContractContext,
} from './execution-order-contract-signing';

export interface ProvisioningRequirementSnapshot {
  enabled: boolean | null;
  certified: boolean | null;
}

export interface ExecutionOrderProvisioningState {
  context: ProvisioningOrderContextDto | null;
  technicianView: TechnicianProvisioningViewDto | null;
  loading: boolean;
  loadError: string | null;
  reservationsPaused: boolean | null;
  /** Sube en cada lectura completa del contexto; el cuerpo recarga catálogos con él. */
  loadVersion: number;
  /** Estado que alimenta el gate de cierre y la fila del índice. */
  snapshot: ProvisioningRequirementSnapshot;
  /** Contrato pendiente de firma para el paso «Contrato». */
  contractContext: ExecutionOrderContractContext | null;
  reload: () => Promise<void>;
  applyService: (service: ServiceProvisioningDto) => void;
  markReservationsPaused: () => void;
}

const UNKNOWN: ProvisioningRequirementSnapshot = { enabled: null, certified: null };

function isTechnicianView(
  value: ProvisioningOrderContextDto | TechnicianProvisioningViewDto,
): value is TechnicianProvisioningViewDto {
  return 'executionOrderId' in value;
}

/**
 * Lectura del aprovisionamiento de una instalación (D1, spec 2026-11-18).
 *
 * Vive en el contenedor para que el gate de cierre y el paso «Contrato» no
 * dependan de que el cuerpo del panel esté montado. `active` replica el ciclo
 * de montaje anterior: mientras es falso no se lee nada; cada vez que pasa a
 * verdadero se vuelve a leer, como cuando el panel se montaba de nuevo.
 */
export function useExecutionOrderProvisioning({
  executionOrderId,
  active,
}: {
  executionOrderId: string | null;
  active: boolean;
}): ExecutionOrderProvisioningState {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission(AccessPermissionKey.NETWORK_PROVISIONING_READ);
  const canReadExecutionOrders = hasPermission(
    AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
  );
  const [context, setContext] = useState<ProvisioningOrderContextDto | null>(null);
  const [technicianView, setTechnicianView] = useState<TechnicianProvisioningViewDto | null>(null);
  const [technicianContract, setTechnicianContract] = useState<ExecutionOrderContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settingsEnabled, setSettingsEnabled] = useState<boolean | null>(null);
  const [reservationsPaused, setReservationsPaused] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<ProvisioningRequirementSnapshot>(UNKNOWN);
  const [loadVersion, setLoadVersion] = useState(0);
  // Una lectura de otra orden (o una anterior de la misma) no pisa a la vigente.
  const requestSeq = useRef(0);

  useEffect(() => {
    requestSeq.current += 1;
    setContext(null);
    setTechnicianView(null);
    setTechnicianContract(null);
    setSettingsEnabled(null);
    setReservationsPaused(null);
    setSnapshot(UNKNOWN);
    setLoadError(null);
    setLoading(true);
  }, [executionOrderId]);

  const reload = useCallback(async () => {
    if (!executionOrderId) return;
    if (!canRead && !canReadExecutionOrders) {
      setContext(null);
      setTechnicianView(null);
      setLoadError(NETWORK_PROVISIONING_COPY.readDenied);
      setSnapshot(UNKNOWN);
      setLoading(false);
      return;
    }
    const seq = ++requestSeq.current;
    const current = () => seq === requestSeq.current;
    setLoading(true);
    setLoadError(null);
    setReservationsPaused(null);
    try {
      const result = await networkApi.getProvisioningContext(executionOrderId);
      if (!current()) return;
      if (isTechnicianView(result)) {
        let orderContract: ExecutionOrderContract | null = null;
        try {
          orderContract = await contractSigningApi.getExecutionOrderContract(executionOrderId);
        } catch {
          // Sin contrato legible el paso «Contrato» no se muestra; el resto sigue.
          orderContract = null;
        }
        if (!current()) return;
        setTechnicianContract(orderContract);
        setTechnicianView(result);
        setContext(null);
        setSnapshot({ enabled: null, certified: result.certified });
      } else if (!canRead) {
        // Una cuenta de Operaciones sin lectura de red solo puede recibir la proyección del técnico.
        setContext(null);
        setTechnicianView(null);
        setLoadError(NETWORK_PROVISIONING_COPY.readDenied);
        setSnapshot(UNKNOWN);
      } else {
        setContext(result);
        setTechnicianView(null);
        const certified =
          result.provisioning?.status === 'CERTIFIED' || result.provisioning?.status === 'ACTIVE';
        let enabled: boolean | null;
        try {
          const settings = await networkApi.getSettings();
          enabled = settings.enforceProvisioningOnInstallClose;
        } catch {
          // No se infiere el estado de la guarda si el endpoint no está disponible.
          enabled = null;
        }
        if (!current()) return;
        setSettingsEnabled(enabled);
        setSnapshot({ enabled, certified });
        try {
          const metadata = await networkApi.getProvisioningMeta();
          setReservationsPaused(metadata.reservationsPaused);
        } catch {
          setReservationsPaused(null);
        }
        if (!current()) return;
        setLoadVersion((current) => current + 1);
      }
    } catch (error) {
      if (!current()) return;
      setContext(null);
      setTechnicianView(null);
      setReservationsPaused(null);
      setLoadError(
        error instanceof ApiError && error.status === 403
          ? NETWORK_PROVISIONING_COPY.readDenied
          : NETWORK_PROVISIONING_COPY.loadError,
      );
      setSnapshot(UNKNOWN);
    } finally {
      if (current()) setLoading(false);
    }
  }, [canRead, canReadExecutionOrders, executionOrderId]);

  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);

  const applyService = useCallback(
    (service: ServiceProvisioningDto) => {
      setContext((current) => (current ? { ...current, provisioning: service } : current));
      setSnapshot({
        enabled: settingsEnabled,
        certified: service.status === 'CERTIFIED' || service.status === 'ACTIVE',
      });
    },
    [settingsEnabled],
  );
  const markReservationsPaused = useCallback(() => setReservationsPaused(true), []);

  const contractContext = useMemo(
    () =>
      resolveExecutionOrderContract(
        context,
        technicianView ? { view: technicianView, contract: technicianContract } : null,
      ),
    [context, technicianView, technicianContract],
  );

  return {
    context,
    technicianView,
    loading,
    loadError,
    reservationsPaused,
    loadVersion,
    snapshot,
    contractContext,
    reload,
    applyService,
    markReservationsPaused,
  };
}
