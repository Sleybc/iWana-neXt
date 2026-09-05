'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Input, Select, cn } from '@iwana/ui';
import {
  PurchaseRequestLineStatus,
  PurchaseRequestStatus,
  PurchaseRequestType,
} from '@iwana/shared';
import type {
  InventoryItemRecord,
  PurchaseRequestDetailRecord,
  PurchaseRequestLineAwardInput,
  PurchaseRequestLineAwardRecord,
  PurchaseRequestLineRecord,
  SupplierQuoteRecord,
} from '@/lib/api-client';
import {
  PortalAlert,
  PortalEmptyState,
  PortalSectionHeader,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import {
  formatInventoryMoney,
  getPurchaseRequestLineStatusLabel,
  getSupplierDisplayLabel,
} from './inventory-labels';
import { SupplierPicker } from './SupplierPicker';

interface AwardLineDraft {
  awardedPartyRefId: string | null;
  awardedPartyLabel: string | null;
  awardedQuantity: string;
  supplierQuoteId: string | null;
  awardNotes: string;
}

interface AwardLinesPanelProps {
  detail: PurchaseRequestDetailRecord;
  items: InventoryItemRecord[];
  supplierLabels?: Record<string, string>;
  disabled?: boolean;
  error?: string | null;
  onDraftsChange?: (drafts: PurchaseRequestLineAwardInput[]) => void;
}

function getLineDisplayLabel(
  line: PurchaseRequestLineRecord,
  items: InventoryItemRecord[],
): string {
  if (line.freeTextDescription?.trim()) {
    return line.freeTextDescription.trim();
  }

  if (line.inventoryItemId) {
    const item = items.find((entry) => entry.id === line.inventoryItemId);
    if (item) {
      return `${item.sku} — ${item.name}`;
    }
  }

  return 'Línea de compra';
}

function buildInitialDraft(line: PurchaseRequestLineRecord): AwardLineDraft {
  return {
    awardedPartyRefId: null,
    awardedPartyLabel: null,
    awardedQuantity: line.quantityRequested,
    supplierQuoteId: null,
    awardNotes: '',
  };
}

function parseQuantity(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function isLineFullyAwarded(
  line: PurchaseRequestLineRecord,
  awards: PurchaseRequestLineAwardRecord[],
): boolean {
  const lineAwards = awards.filter((award) => award.purchaseRequestLineId === line.id);
  if (lineAwards.length === 0) {
    return line.lineStatus === PurchaseRequestLineStatus.AWARDED;
  }

  const awardedQty = lineAwards.reduce((sum, award) => sum + Number(award.awardedQuantity), 0);
  const requestedQty = Number(line.quantityRequested);
  return awardedQty >= requestedQty;
}

export function AwardLinesPanel({
  detail,
  items,
  supplierLabels = {},
  disabled = false,
  error = null,
  onDraftsChange,
}: AwardLinesPanelProps) {
  const awardableLines = useMemo(
    () => detail.lines.filter((line) => Boolean(line.inventoryItemId)),
    [detail.lines],
  );

  const [drafts, setDrafts] = useState<Record<string, AwardLineDraft>>(() => {
    const initial: Record<string, AwardLineDraft> = {};
    for (const line of awardableLines) {
      initial[line.id] = buildInitialDraft(line);
    }
    return initial;
  });

  useEffect(() => {
    setDrafts((current) => {
      const next: Record<string, AwardLineDraft> = {};
      for (const line of awardableLines) {
        next[line.id] = current[line.id] ?? buildInitialDraft(line);
      }
      return next;
    });
  }, [awardableLines]);

  const canEdit = !disabled && detail.request.status === PurchaseRequestStatus.APPROVED;

  const validDrafts = useMemo(() => {
    if (!canEdit) {
      return [] as PurchaseRequestLineAwardInput[];
    }

    const lockQuantity = detail.request.requestType !== PurchaseRequestType.PROJECT;
    const result: PurchaseRequestLineAwardInput[] = [];

    for (const line of awardableLines) {
      if (isLineFullyAwarded(line, detail.awards)) {
        continue;
      }

      const draft = drafts[line.id];
      if (!draft?.awardedPartyRefId) {
        continue;
      }

      const quantity = lockQuantity
        ? Number(line.quantityRequested)
        : parseQuantity(draft.awardedQuantity);

      if (quantity === null) {
        continue;
      }

      result.push({
        purchaseRequestLineId: line.id,
        awardedPartyRefId: draft.awardedPartyRefId,
        awardedQuantity: quantity,
        ...(draft.supplierQuoteId ? { supplierQuoteId: draft.supplierQuoteId } : {}),
        ...(draft.awardNotes.trim() ? { awardNotes: draft.awardNotes.trim() } : {}),
      });
    }

    return result;
  }, [awardableLines, canEdit, detail.awards, detail.request.requestType, drafts]);

  useEffect(() => {
    onDraftsChange?.(validDrafts);
  }, [onDraftsChange, validDrafts]);

  function updateDraft(lineId: string, patch: Partial<AwardLineDraft>) {
    setDrafts((current) => {
      const line = awardableLines.find((entry) => entry.id === lineId);
      const base = current[lineId] ?? (line ? buildInitialDraft(line) : null);
      if (!base) {
        return current;
      }

      return {
        ...current,
        [lineId]: {
          ...base,
          ...patch,
        },
      };
    });
  }

  function applyQuote(lineId: string, quote: SupplierQuoteRecord) {
    updateDraft(lineId, {
      awardedPartyRefId: quote.partyRefId,
      awardedPartyLabel: getSupplierDisplayLabel(quote.partyRefId, supplierLabels),
      supplierQuoteId: quote.id,
    });
  }

  if (awardableLines.length === 0) {
    return (
      <PortalEmptyState
        title="Sin líneas adjudicables"
        description="Solo las líneas con producto de catálogo se pueden adjudicar en esta etapa."
      />
    );
  }

  const lockQuantity = detail.request.requestType !== PurchaseRequestType.PROJECT;

  return (
    <div className="space-y-4">
      <PortalSectionHeader
        eyebrow="Adjudicación"
        title="Asignar proveedores por línea"
        description="Define el proveedor adjudicado para cada línea antes de generar la orden de compra."
      />

      {error ? (
        <PortalAlert variant="error" title="No se pudo adjudicar" description={error} />
      ) : null}

      {!canEdit ? (
        <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
          La adjudicación solo está disponible cuando la solicitud está aprobada.
        </p>
      ) : null}

      <div className="space-y-3">
        {awardableLines.map((line) => {
          const lineAwards = detail.awards.filter(
            (award) => award.purchaseRequestLineId === line.id,
          );
          const fullyAwarded = isLineFullyAwarded(line, detail.awards);
          const draft = drafts[line.id] ?? buildInitialDraft(line);
          const partyQuotes = detail.quotes.filter(
            (quote) => quote.partyRefId === draft.awardedPartyRefId,
          );

          return (
            <div
              key={line.id}
              className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {getLineDisplayLabel(line, items)}
                  </p>
                  <p className="mt-1 text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                    Solicitado: {line.quantityRequested} {line.unitOfMeasure}
                  </p>
                </div>
                <Badge
                  variant={
                    line.lineStatus === PurchaseRequestLineStatus.AWARDED ? 'success' : 'neutral'
                  }
                >
                  {getPurchaseRequestLineStatusLabel(line.lineStatus)}
                </Badge>
              </div>

              {lineAwards.length > 0 ? (
                <div className="space-y-2 rounded-2xl bg-iwana-surface-soft p-3 dark:bg-dark-surface-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    Adjudicaciones registradas
                  </p>
                  {lineAwards.map((award) => (
                    <p
                      key={award.id}
                      className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400"
                    >
                      {supplierLabels[award.awardedPartyRefId] ?? 'Proveedor adjudicado'} ·{' '}
                      {award.awardedQuantity} {line.unitOfMeasure}
                      {award.awardNotes ? ` · ${award.awardNotes}` : ''}
                    </p>
                  ))}
                </div>
              ) : null}

              {fullyAwarded ? (
                <p className="text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                  Esta línea ya está adjudicada por completo.
                </p>
              ) : canEdit ? (
                <div className="space-y-3">
                  {detail.quotes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {detail.quotes.map((quote) => {
                        const quoteLine = quote.lines?.find(
                          (entry) => entry.purchaseRequestLineId === line.id,
                        );
                        return (
                          <button
                            key={quote.id}
                            type="button"
                            className={cn(
                              'min-h-11 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-iwana-primary hover:bg-iwana-primary/5 dark:border-dark-border',
                              interactiveFocusClassName,
                            )}
                            onClick={() => applyQuote(line.id, quote)}
                          >
                            Usar {quote.quoteNumber} (
                            {quoteLine
                              ? `${formatInventoryMoney(quoteLine.unitCost)} / u.`
                              : formatInventoryMoney(quote.amount)}
                            )
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <SupplierPicker
                    label="Proveedor adjudicado"
                    value={draft.awardedPartyRefId}
                    selectedLabel={draft.awardedPartyLabel}
                    disabled={disabled}
                    onChange={(partyRefId, displayName) =>
                      updateDraft(line.id, {
                        awardedPartyRefId: partyRefId,
                        awardedPartyLabel: displayName,
                        supplierQuoteId:
                          draft.supplierQuoteId &&
                          detail.quotes.find((quote) => quote.id === draft.supplierQuoteId)
                            ?.partyRefId === partyRefId
                            ? draft.supplierQuoteId
                            : null,
                      })
                    }
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      label="Cantidad adjudicada"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={lockQuantity ? line.quantityRequested : draft.awardedQuantity}
                      disabled={disabled || lockQuantity}
                      onChange={(event) =>
                        updateDraft(line.id, { awardedQuantity: event.target.value })
                      }
                      helperText={
                        lockQuantity
                          ? 'En este tipo de compra la adjudicación cubre la cantidad total.'
                          : undefined
                      }
                    />

                    <Select
                      label="Cotización vinculada (opcional)"
                      value={draft.supplierQuoteId ?? ''}
                      disabled={disabled || !draft.awardedPartyRefId}
                      onChange={(event) =>
                        updateDraft(line.id, {
                          supplierQuoteId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Sin cotización vinculada</option>
                      {partyQuotes.map((quote) => {
                        const quoteLine = quote.lines?.find(
                          (entry) => entry.purchaseRequestLineId === line.id,
                        );
                        return (
                          <option key={quote.id} value={quote.id}>
                            {quote.quoteNumber} ·{' '}
                            {quoteLine
                              ? `${formatInventoryMoney(quoteLine.unitCost)} / u.`
                              : formatInventoryMoney(quote.amount)}
                          </option>
                        );
                      })}
                    </Select>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">
                      Notas de adjudicación
                    </span>
                    <textarea
                      aria-label={`Notas de adjudicación para ${getLineDisplayLabel(line, items)}`}
                      className={cn(
                        'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white',
                        interactiveFocusClassName,
                      )}
                      rows={2}
                      value={draft.awardNotes}
                      disabled={disabled}
                      onChange={(event) => updateDraft(line.id, { awardNotes: event.target.value })}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
