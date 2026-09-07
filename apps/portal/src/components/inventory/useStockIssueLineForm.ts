'use client';

import { useCallback, useEffect, useState } from 'react';
import { StockBalanceCondition } from '@iwana/shared';
import type { SearchablePickerItem } from '@/components/shared/SearchablePicker';
import {
  fallbackSerializedAssetLabel,
  isSerializedTrackingMode,
  resolveSingleLotIdFromLots,
} from './stock-issue-line-utils';
import { resolveLineSerializedAssetIds, type StockIssueDraftLine } from './stock-issue-draft';

interface StockIssueLineFormSnapshot {
  condition: StockBalanceCondition;
  lotId: string;
  serialIds: string[];
  requestedQty: string;
}

function serialItemsOf(
  line: StockIssueDraftLine | null,
  serialLabelsById: Record<string, string>,
): SearchablePickerItem[] {
  if (!line) {
    return [];
  }
  return resolveLineSerializedAssetIds(line).map((id) => ({
    id,
    label: serialLabelsById[id] ?? fallbackSerializedAssetLabel(id),
  }));
}

function initialLotIdOf(line: StockIssueDraftLine | null): string {
  if (!line) {
    return '';
  }
  const current = line.lotId.trim();
  if (current) {
    return current;
  }
  return resolveSingleLotIdFromLots(line.lots, line.condition);
}

function snapshotOf(
  line: StockIssueDraftLine | null,
  serialLabelsById: Record<string, string>,
): StockIssueLineFormSnapshot | null {
  if (!line) {
    return null;
  }
  const serialIds = resolveLineSerializedAssetIds(line);
  const serialized = isSerializedTrackingMode(line.trackingMode);
  return {
    condition: line.condition,
    lotId: initialLotIdOf(line),
    serialIds,
    // En serializados la cantidad es el tamaño del grupo, no un texto editable.
    requestedQty: serialized
      ? String(serialIds.length)
      : serialIds.length > 0
        ? String(serialIds.length)
        : line.requestedQty,
  };
}

export interface StockIssueLineFormApi {
  condition: StockBalanceCondition;
  lotId: string;
  serials: SearchablePickerItem[];
  requestedQty: string;
  /** Cantidad efectiva: en serializados es el número de seriales elegidos. */
  effectiveQty: string;
  serialized: boolean;
  /** Sucio por comparación contra el snapshot de apertura, no por pestillo. */
  dirty: boolean;
  closeNotice: string;
  setCondition: (next: StockBalanceCondition) => void;
  setLotId: (next: string) => void;
  setSerials: (next: SearchablePickerItem[]) => void;
  setRequestedQty: (next: string) => void;
  handleBeforeClose: () => boolean;
}

/**
 * Estado de captura del panel de línea (S2.1 C1): snapshot por `line.id` con
 * reinicio en fase de render — la hidratación posterior del borrador (lotes,
 * disponibilidad, etiquetas) no reconstruye la captura del operador. Un
 * segundo efecto solo re-etiqueta los seriales por id ante
 * `serialLabelsById` tardío, sin tocar la selección.
 */
export function useStockIssueLineForm(
  line: StockIssueDraftLine | null,
  serialLabelsById: Record<string, string>,
): StockIssueLineFormApi {
  const key = line?.id ?? null;
  const [formKey, setFormKey] = useState<string | null>(key);
  const [snapshot, setSnapshot] = useState<StockIssueLineFormSnapshot | null>(() =>
    snapshotOf(line, serialLabelsById),
  );
  const [condition, setCondition] = useState<StockBalanceCondition>(
    line?.condition ?? StockBalanceCondition.NEW,
  );
  const [lotId, setLotId] = useState<string>(() => initialLotIdOf(line));
  const [serials, setSerials] = useState<SearchablePickerItem[]>(() =>
    serialItemsOf(line, serialLabelsById),
  );
  const [requestedQty, setRequestedQty] = useState<string>(() => {
    const serialIds = line ? resolveLineSerializedAssetIds(line) : [];
    return serialIds.length > 0 ? String(serialIds.length) : (line?.requestedQty ?? '1');
  });
  const [closeNotice, setCloseNotice] = useState('');

  // Reinicio por línea (S2.1 C1): solo cuando cambia el id — la hidratación
  // posterior (mismo id, nuevo objeto) y las etiquetas tardías no reconstruyen
  // la captura del operador (FE03). En efecto (no en fase de render) para
  // evitar el tearing con ids reutilizados entre creación y edición.
  useEffect(() => {
    if (key === formKey) {
      return;
    }
    setFormKey(key);
    setSnapshot(snapshotOf(line, serialLabelsById));
    setCondition(line?.condition ?? StockBalanceCondition.NEW);
    setLotId(initialLotIdOf(line));
    setSerials(serialItemsOf(line, serialLabelsById));
    const serialIds = line ? resolveLineSerializedAssetIds(line) : [];
    setRequestedQty(serialIds.length > 0 ? String(serialIds.length) : (line?.requestedQty ?? '1'));
    setCloseNotice('');
  }, [key, formKey, line, serialLabelsById]);

  // Re-etiquetado tardío (CA-S2.1-FE03): solo el `label` por id; la selección
  // y el orden que lleva el operador se conservan intactos.
  useEffect(() => {
    setSerials((current) => {
      if (current.length === 0) {
        return current;
      }
      let changed = false;
      const next = current.map((item) => {
        const label = serialLabelsById[item.id] ?? fallbackSerializedAssetLabel(item.id);
        if (label === item.label) {
          return item;
        }
        changed = true;
        return { ...item, label };
      });
      return changed ? next : current;
    });
  }, [serialLabelsById]);

  const serialized = line ? isSerializedTrackingMode(line.trackingMode) : false;
  const effectiveQty = serialized ? String(serials.length) : requestedQty;

  const dirty =
    snapshot != null &&
    (condition !== snapshot.condition ||
      lotId !== snapshot.lotId ||
      effectiveQty !== snapshot.requestedQty ||
      serials.map((item) => item.id).join(',') !== snapshot.serialIds.join(','));

  const handleBeforeClose = useCallback((): boolean => {
    if (!dirty) {
      return true;
    }
    setCloseNotice(
      'Hay cambios sin guardar en esta línea. Confírmalos con Agregar al borrador o Guardar cambios, o descártalos con Cancelar.',
    );
    return false;
  }, [dirty]);

  return {
    condition,
    lotId,
    serials,
    requestedQty,
    effectiveQty,
    serialized,
    dirty,
    closeNotice,
    setCondition,
    setLotId,
    setSerials,
    setRequestedQty,
    handleBeforeClose,
  };
}
