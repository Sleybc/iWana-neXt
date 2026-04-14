'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPinned, Orbit } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';
import {
  type CoverageNodeConfig,
  type CoverageZoneConfig,
  type CreateCommercialNodeDto,
  type CreateCoverageZoneDto,
  tenantSelfApi,
  type UpdateCommercialNodeDto,
  type UpdateCoverageZoneDto,
} from '@/lib/api-client';
import { CoverageCheckSection } from './CoverageCheckSection';
import { CoverageMapWrapper } from './CoverageMapWrapper';
import { CoverageNodeDialog } from './CoverageNodeDialog';
import { CoverageNodeTable } from './CoverageNodeTable';
import { CoverageZoneDialog } from './CoverageZoneDialog';
import { CoverageZoneTable } from './CoverageZoneTable';

interface CommercialCoverageCardProps {
  canEdit: boolean;
}

export function CommercialCoverageCard({ canEdit }: CommercialCoverageCardProps) {
  const [nodes, setNodes] = useState<CoverageNodeConfig[]>([]);
  const [zones, setZones] = useState<CoverageZoneConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickNodeSaving, setQuickNodeSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isNodeDialogOpen, setIsNodeDialogOpen] = useState(false);
  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<CoverageNodeConfig | null>(null);
  const [editingZone, setEditingZone] = useState<CoverageZoneConfig | null>(null);
  const [draftCoordinates, setDraftCoordinates] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const activeNodes = useMemo(() => nodes.filter((item) => item.isActive).length, [nodes]);
  const activeZones = useMemo(() => zones.filter((item) => item.isActive).length, [zones]);

  useEffect(() => {
    void loadCoverage();
  }, []);

  async function loadCoverage() {
    setLoading(true);
    setError(null);
    try {
      const data = await tenantSelfApi.getCoverage();
      setNodes(data.nodes);
      setZones(data.zones);
    } catch {
      setError('No fue posible cargar la cobertura comercial.');
    } finally {
      setLoading(false);
    }
  }

  const runCheck = async (params: { address: string; latitude?: number; longitude?: number }) => {
    setSaving(true);
    setError(null);
    try {
      return await tenantSelfApi.checkCoverage(params);
    } catch {
      setError('No fue posible validar cobertura para la dirección ingresada.');
      throw new Error('coverage-check-failed');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCreateNode = () => {
    setEditingNode(null);
    setDraftCoordinates(null);
    setIsNodeDialogOpen(true);
  };

  const handleNodeFromMap = (latlng: { lat: number; lng: number }) => {
    if (!canEdit) {
      return;
    }

    setEditingNode(null);
    setDraftCoordinates(latlng);
    setIsNodeDialogOpen(true);
  };

  const handleNodeSubmit = async (payload: CreateCommercialNodeDto | UpdateCommercialNodeDto) => {
    setSaving(true);
    setError(null);

    try {
      const next = editingNode
        ? await tenantSelfApi.updateCoverageNode(editingNode.id, payload)
        : await tenantSelfApi.createCoverageNode(payload as CreateCommercialNodeDto);

      setNodes(next.nodes);
      setZones(next.zones);
      setIsNodeDialogOpen(false);
      setEditingNode(null);
      setDraftCoordinates(null);
    } catch {
      setError('No fue posible guardar el nodo comercial.');
    } finally {
      setSaving(false);
    }
  };

  const handleZoneSubmit = async (payload: CreateCoverageZoneDto | UpdateCoverageZoneDto) => {
    setSaving(true);
    setError(null);

    try {
      const next = editingZone
        ? await tenantSelfApi.updateCoverageZone(editingZone.id, payload)
        : await tenantSelfApi.createCoverageZone(payload as CreateCoverageZoneDto);

      setNodes(next.nodes);
      setZones(next.zones);
      setIsZoneDialogOpen(false);
      setEditingZone(null);
    } catch {
      setError('No fue posible guardar la zona comercial.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!canEdit) {
      return;
    }

    const previousNodes = nodes;
    setNodes((prev) => prev.filter((node) => node.id !== nodeId));

    setSaving(true);
    setError(null);
    try {
      await tenantSelfApi.deleteCoverageNode(nodeId);
    } catch {
      setNodes(previousNodes);
      setError('No fue posible eliminar el nodo comercial.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!canEdit) {
      return;
    }

    const previousZones = zones;
    setZones((prev) => prev.filter((zone) => zone.id !== zoneId));

    setSaving(true);
    setError(null);
    try {
      await tenantSelfApi.deleteCoverageZone(zoneId);
    } catch {
      setZones(previousZones);
      setError('No fue posible eliminar la zona comercial.');
    } finally {
      setSaving(false);
    }
  };

  // Mutaciones de estado activo siguen el mismo contrato PATCH para mantener consistencia de API.
  // Optimistic update: el estado local se actualiza de inmediato sin esperar al servidor.
  // Si la API devuelve error se revierte al valor original para mantener consistencia.
  const handleToggleNode = async (nodeId: string, isActive: boolean) => {
    if (!canEdit) {
      return;
    }

    // Actualización optimista: refleja el cambio de inmediato en la UI
    const previousNodes = nodes;
    const previousZones = zones;
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, isActive } : n)));

    setSaving(true);
    setError(null);
    try {
      await tenantSelfApi.updateCoverageNode(nodeId, { isActive });
    } catch {
      // Revertir al estado anterior si la API falla
      setNodes(previousNodes);
      setZones(previousZones);
      setError('No fue posible actualizar el estado del nodo.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleZone = async (zoneId: string, isActive: boolean) => {
    if (!canEdit) {
      return;
    }

    // Actualización optimista: refleja el cambio de inmediato en la UI
    const previousNodes = nodes;
    const previousZones = zones;
    setZones((prev) => prev.map((z) => (z.id === zoneId ? { ...z, isActive } : z)));

    setSaving(true);
    setError(null);
    try {
      await tenantSelfApi.updateCoverageZone(zoneId, { isActive });
    } catch {
      // Revertir al estado anterior si la API falla
      setNodes(previousNodes);
      setZones(previousZones);
      setError('No fue posible actualizar el estado de la zona.');
    } finally {
      setSaving(false);
    }
  };

  async function createQuickNode() {
    setQuickNodeSaving(true);
    setError(null);
    try {
      const next = await tenantSelfApi.createCoverageNode({
        name: `Nodo Comercial ${new Date().toLocaleTimeString('es-CO')}`,
        latitude: 4.60971,
        longitude: -74.08175,
        isActive: true,
      });
      setNodes(next.nodes);
      setZones(next.zones);
    } catch {
      setError('No fue posible crear el nodo comercial.');
    } finally {
      setQuickNodeSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
          Factibilidad comercial
        </p>
        <CardTitle className="text-xl font-semibold">Cobertura comercial</CardTitle>
        <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
          Gestiona nodos y zonas para factibilidad comercial inicial sin invadir provisioning.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && (
          <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-[#f8faf5] px-4 py-5 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin text-iwana-primary" aria-hidden="true" />
            Estamos cargando la red comercial y sus zonas configuradas.
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 rounded-[24px] border border-red-200 bg-red-50/90 px-4 py-4 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {!loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-iwana-primary/10 text-iwana-primary dark:bg-iwana-primary/20 dark:text-iwana-primary-300">
                  <MapPinned className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                Nodos activos
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {activeNodes}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4 shadow-iwana-soft dark:border-dark-border dark:bg-dark-surface-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-iwana-secondary-100 text-iwana-secondary-700 dark:bg-iwana-secondary-900/30 dark:text-iwana-secondary-300">
                  <Orbit className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                Zonas activas
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {activeZones}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <CoverageCheckSection canEdit={canEdit} onCheck={runCheck} />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Nodos comerciales</h3>
            {canEdit && (
              <Button type="button" data-testid="add-node-btn" onClick={handleOpenCreateNode}>
                Agregar nodo
              </Button>
            )}
          </div>

          <CoverageNodeTable
            nodes={nodes}
            canEdit={canEdit}
            onEdit={(node) => {
              setEditingNode(node);
              setDraftCoordinates(null);
              setIsNodeDialogOpen(true);
            }}
            onDelete={(nodeId) => void handleDeleteNode(nodeId)}
            onToggle={(nodeId, isActive) => void handleToggleNode(nodeId, isActive)}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Zonas comerciales</h3>
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                data-testid="add-zone-btn"
                onClick={() => {
                  setEditingZone(null);
                  setIsZoneDialogOpen(true);
                }}
              >
                Agregar zona
              </Button>
            )}
          </div>

          <CoverageZoneTable
            zones={zones}
            canEdit={canEdit}
            onEdit={(zone) => {
              setEditingZone(zone);
              setIsZoneDialogOpen(true);
            }}
            onDelete={(zoneId) => void handleDeleteZone(zoneId)}
            onToggle={(zoneId, isActive) => void handleToggleZone(zoneId, isActive)}
          />
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mapa de cobertura</h3>
            <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
              Superficie operativa para revisar nodos, zonas y capturar nuevas ubicaciones desde el mapa.
            </p>
          </div>
          <CoverageMapWrapper
            nodes={nodes}
            zones={zones}
            readonly={!canEdit}
            onNodeClick={(node) => {
              if (!canEdit) {
                return;
              }
              setEditingNode(node);
              setDraftCoordinates(null);
              setIsNodeDialogOpen(true);
            }}
            onMapClick={handleNodeFromMap}
          />
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              loading={quickNodeSaving}
              disabled={saving || quickNodeSaving}
              onClick={() => void createQuickNode()}
            >
              Crear nodo de prueba
            </Button>
          </div>
        )}

        <CoverageNodeDialog
          open={isNodeDialogOpen}
          canEdit={canEdit}
          isSubmitting={saving}
          node={editingNode}
          defaultCoordinates={draftCoordinates}
          onOpenChange={setIsNodeDialogOpen}
          onSubmit={handleNodeSubmit}
        />

        <CoverageZoneDialog
          open={isZoneDialogOpen}
          canEdit={canEdit}
          isSubmitting={saving}
          zone={editingZone}
          onOpenChange={setIsZoneDialogOpen}
          onSubmit={handleZoneSubmit}
        />

      </CardContent>
    </Card>
  );
}
