'use client';

import { useMemo, useState } from 'react';
import { Button } from '@iwana/ui';
import { StockIssueStatus, StockLocationType } from '@iwana/shared';
import type {
  CreateStockIssueDto,
  DispatchStockIssueDto,
  InventoryItemRecord,
  SerializedAssetRecord,
  StockBalanceRecord,
  StockIssueDetailRecord,
  StockIssueRecord,
  StockLocationRecord,
  UpdateStockIssueDto,
} from '@/lib/api-client';
import { PortalAlert, PortalPanel } from '@/components/shared/portal-ui';
import { filterStockIssues, hasActiveIssueFilters, type StockIssueFilters } from './issue-filters';
import { getStockIssueStatusLabel } from './inventory-labels';
import { PurchaseCreateModeShell } from './PurchaseCreateModeShell';
import { StockIssueComposer } from './StockIssueComposer';
import { StockIssueCreateModeHeader } from './StockIssueCreateModeHeader';
import { StockIssueDetailDrawer } from './StockIssueDetailDrawer';
import { StockIssuesSummary } from './StockIssuesSummary';
import { StockIssuesTable } from './StockIssuesTable';
import { StockIssuesToolbar } from './StockIssuesToolbar';

const EMPTY_FILTERS: StockIssueFilters = {};

type StockIssuesWorkspaceMode = 'inbox' | 'create' | 'edit';

export interface StockIssuesWorkspaceProps {
  items: InventoryItemRecord[];
  balances: StockBalanceRecord[];
  assets: SerializedAssetRecord[];
  locations: StockLocationRecord[];
  issues: StockIssueRecord[];
  issueItemFrequency?: Record<string, number>;
  isLoading: boolean;
  isRefreshing?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  onCreate: (dto: CreateStockIssueDto) => Promise<void>;
  onUpdate: (id: string, dto: UpdateStockIssueDto) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDispatch: (id: string, dto: DispatchStockIssueDto) => Promise<void>;
  onOpenDetail: (id: string) => Promise<StockIssueDetailRecord>;
  onRefresh: () => void;
}

export function StockIssuesWorkspace({
  items,
  balances,
  assets,
  locations,
  issues,
  issueItemFrequency = {},
  isLoading,
  isRefreshing = false,
  isSubmitting,
  error,
  onCreate,
  onUpdate,
  onCancel,
  onDispatch,
  onOpenDetail,
  onRefresh,
}: StockIssuesWorkspaceProps) {
  const [workspaceMode, setWorkspaceMode] = useState<StockIssuesWorkspaceMode>('inbox');
  const [editingIssue, setEditingIssue] = useState<StockIssueDetailRecord | null>(null);
  const [composerDirty, setComposerDirty] = useState(false);
  const [draftLineCount, setDraftLineCount] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<StockIssueDetailRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState<StockIssueFilters>(EMPTY_FILTERS);

  const issueLocations = useMemo(
    () => locations.filter((loc) => loc.type !== StockLocationType.CUSTOMER_SITE),
    [locations],
  );

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  const filteredIssues = useMemo(
    () => filterStockIssues(issues, filters, locationMap),
    [issues, filters, locationMap],
  );

  const destinationOptions = useMemo(() => {
    const byType = new Map<StockLocationType, StockLocationRecord[]>();
    issueLocations.forEach((loc) => {
      const next = byType.get(loc.type) ?? [];
      next.push(loc);
      byType.set(loc.type, next);
    });
    return byType;
  }, [issueLocations]);

  function openCreateMode() {
    setDetailOpen(false);
    setDetail(null);
    setEditingIssue(null);
    setWorkspaceMode('create');
  }

  function openEditMode(issue: StockIssueDetailRecord) {
    setDetailOpen(false);
    setDetail(null);
    setEditingIssue(issue);
    setWorkspaceMode('edit');
  }

  function closeComposerMode(force = false) {
    if (!force && composerDirty) {
      const confirmed = window.confirm(
        workspaceMode === 'edit'
          ? 'Hay cambios sin guardar en la edición. ¿Quieres volver al listado y descartarlos?'
          : 'Hay cambios sin guardar en la salida. ¿Quieres volver al listado y descartar este borrador?',
      );
      if (!confirmed) {
        return;
      }
    }

    setWorkspaceMode('inbox');
    setEditingIssue(null);
    setComposerDirty(false);
    setDraftLineCount(0);
  }

  const createAction = (
    <Button type="button" onClick={openCreateMode} disabled={isLoading}>
      Crear salida
    </Button>
  );

  function handleStatusKpiChange(status: StockIssueStatus) {
    setFilters((current) => {
      if (current.status === status) {
        const next = { ...current };
        delete next.status;
        return next;
      }
      return { ...current, status };
    });
  }

  async function openDetail(issueId: string) {
    setDetailError(null);
    setActionError(null);
    try {
      const loaded = await onOpenDetail(issueId);
      setDetail(loaded);
      setDetailOpen(true);
    } catch (err) {
      setDetail(null);
      setDetailOpen(false);
      setDetailError(err instanceof Error ? err.message : 'No fue posible abrir la salida.');
    }
  }

  async function handleCreate(dto: CreateStockIssueDto) {
    setActionError(null);
    try {
      await onCreate(dto);
      closeComposerMode(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No fue posible crear la salida.');
      throw err instanceof Error ? err : new Error('No fue posible crear la salida.');
    }
  }

  async function handleUpdate(issueId: string, dto: UpdateStockIssueDto) {
    setActionError(null);
    try {
      await onUpdate(issueId, dto);
      closeComposerMode(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No fue posible guardar la salida.');
      throw err instanceof Error ? err : new Error('No fue posible guardar la salida.');
    }
  }

  const composer = (
    <StockIssueComposer
      mode={workspaceMode === 'edit' ? 'edit' : 'create'}
      editIssue={workspaceMode === 'edit' ? editingIssue : null}
      items={items}
      balances={balances}
      assets={assets}
      locations={issueLocations}
      destinationOptions={destinationOptions}
      issueItemFrequency={issueItemFrequency}
      isSubmitting={Boolean(isSubmitting)}
      error={actionError}
      onDirtyChange={setComposerDirty}
      onDraftLineCountChange={setDraftLineCount}
      onSubmit={handleCreate}
      onUpdate={handleUpdate}
    />
  );

  return (
    <div className="space-y-6">
      {error ? (
        <PortalAlert variant="error" title="No fue posible cargar salidas" description={error} />
      ) : null}
      {detailError ? (
        <PortalAlert
          variant="warning"
          title="No fue posible abrir la salida"
          description={detailError}
        />
      ) : null}
      {workspaceMode === 'inbox' && actionError ? (
        <PortalAlert
          variant="error"
          title="No fue posible completar la acción"
          description={actionError}
        />
      ) : null}

      {workspaceMode === 'inbox' ? (
        <>
          <StockIssuesSummary
            issues={issues}
            activeStatus={filters.status}
            isLoading={isLoading}
            onStatusFilterChange={handleStatusKpiChange}
          />

          <PortalPanel
            eyebrow="Despachos"
            title="Salidas"
            description="Registra salidas desde bodega principal hacia custodias, oficinas, nodos, venta o consumo interno."
            actions={createAction}
          >
            <div className="space-y-4">
              <StockIssuesToolbar
                filters={filters}
                resultCount={filteredIssues.length}
                totalCount={issues.length}
                isRefreshing={isRefreshing}
                onFiltersChange={setFilters}
                onRefresh={onRefresh}
                onClearFilters={() => setFilters(EMPTY_FILTERS)}
              />
              <StockIssuesTable
                issues={filteredIssues}
                locationMap={locationMap}
                isLoading={isLoading}
                isRefreshing={isRefreshing}
                hasActiveFilters={hasActiveIssueFilters(filters)}
                issuesIsEmpty={issues.length === 0}
                onOpenDetail={(issueId) => void openDetail(issueId)}
                emptyAction={createAction}
                onClearFilters={() => setFilters(EMPTY_FILTERS)}
              />
            </div>
          </PortalPanel>
        </>
      ) : workspaceMode === 'create' ? (
        <PurchaseCreateModeShell
          header={
            <StockIssueCreateModeHeader
              draftLineCount={draftLineCount}
              onBack={() => closeComposerMode()}
            />
          }
        >
          {composer}
        </PurchaseCreateModeShell>
      ) : (
        <PurchaseCreateModeShell
          header={
            <StockIssueCreateModeHeader
              draftLineCount={draftLineCount}
              eyebrow="Edición"
              title="Editar salida"
              description="Ajusta líneas y contexto mientras la salida siga en estado solicitada."
              {...(editingIssue
                ? {
                    referenceLabel: editingIssue.id.slice(0, 8).toUpperCase(),
                    statusLabel: getStockIssueStatusLabel(editingIssue.status),
                  }
                : {})}
              onBack={() => closeComposerMode()}
            />
          }
        >
          {composer}
        </PurchaseCreateModeShell>
      )}

      <StockIssueDetailDrawer
        open={workspaceMode === 'inbox' && detailOpen}
        issue={detail}
        itemsById={itemMap}
        assetsById={assetsById}
        locationsById={locationMap}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        onEdit={(issue) => openEditMode(issue)}
        onCancel={async (issueId) => {
          setActionError(null);
          try {
            await onCancel(issueId);
            setDetailOpen(false);
            setDetail(null);
          } catch (err) {
            setActionError(
              err instanceof Error ? err.message : 'No fue posible cancelar la salida.',
            );
            throw err instanceof Error ? err : new Error('No fue posible cancelar la salida.');
          }
        }}
        onDispatch={async (issueId, dto) => {
          setActionError(null);
          try {
            await onDispatch(issueId, dto);
            const refreshed = await onOpenDetail(issueId);
            setDetail(refreshed);
          } catch (err) {
            setActionError(
              err instanceof Error ? err.message : 'No fue posible despachar la salida.',
            );
            throw err instanceof Error ? err : new Error('No fue posible despachar la salida.');
          }
        }}
      />
    </div>
  );
}
