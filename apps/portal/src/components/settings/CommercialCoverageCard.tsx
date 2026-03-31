'use client';

import { useEffect, useMemo, useState } from 'react';
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
        <CardTitle>Cobertura comercial</CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Gestiona nodos y zonas para factibilidad comercial inicial sin invadir provisioning.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando cobertura...</p>
        )}
        {!loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Nodos activos
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {activeNodes}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 p-3 dark:border-dark-border">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Zonas activas
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                {activeZones}
              </p>
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
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mapa de cobertura</h3>
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

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
