'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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

function getQuoteUnitPriceForLine(
  quote: SupplierQuoteRecord,
  purchaseRequestLineId: string,
): number {
  const quoteLine = quote.lines?.find(
    (entry) => entry.purchaseRequestLineId === purchaseRequestLineId,
  );
  const raw = quoteLine ? quoteLine.unitCost : quote.amount;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY;
}

function formatQuoteUnitLabel(quote: SupplierQuoteRecord, purchaseRequestLineId: string): string {
  const quoteLine = quote.lines?.find(
    (entry) => entry.purchaseRequestLineId === purchaseRequestLineId,
  );
  const amount = quoteLine
    ? `${formatInventoryMoney(quoteLine.unitCost, quote.currency)} / u.`
    : formatInventoryMoney(quote.amount, quote.currency);
  // La moneda es por cotización (COP/USD/EUR): sin el código, dos cifras similares en
  // monedas distintas se leen como comparables cuando no lo son.
  return `${amount} ${quote.currency}`;
}

function buildQuoteOptionLabel(quote: SupplierQuoteRecord, purchaseRequestLineId: string): string {
  return `${quote.quoteNumber} · ${formatQuoteUnitLabel(quote, purchaseRequestLineId)}`;
}

function sortQuotesByUnitPriceForLine(
  quotes: SupplierQuoteRecord[],
  purchaseRequestLineId: string,
): SupplierQuoteRecord[] {
  return [...quotes].sort(
    (a, b) =>
      getQuoteUnitPriceForLine(a, purchaseRequestLineId) -
      getQuoteUnitPriceForLine(b, purchaseRequestLineId),
  );
}

/**
 * Ordenar y marcar «más barato» solo tiene sentido si todas las cotizaciones comparadas
 * usan la misma moneda: no hay conversión de cambio en este módulo, así que comparar un
 * monto en USD contra uno en COP por su valor numérico induciría una recomendación falsa.
 */
function quotesShareCurrency(quotes: SupplierQuoteRecord[]): boolean {
  return new Set(quotes.map((quote) => quote.currency)).size <= 1;
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

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  function toggleLineCollapsed(lineId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  }

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
          const partyQuotesRaw = detail.quotes.filter(
            (quote) => quote.partyRefId === draft.awardedPartyRefId,
          );
          const partyQuotes = quotesShareCurrency(partyQuotesRaw)
            ? sortQuotesByUnitPriceForLine(partyQuotesRaw, line.id)
            : partyQuotesRaw;
          // Sin mezclar monedas en la comparación: con una sola moneda se ordena de más
          // barata a más cara y se marca la primera; con monedas mixtas se conserva el
          // orden original y ninguna se marca «más barata» (no hay tasa de cambio aquí).
          const sameCurrency = quotesShareCurrency(detail.quotes);
          const sortedQuotes = sameCurrency
            ? sortQuotesByUnitPriceForLine(detail.quotes, line.id)
            : detail.quotes;
          const cheapestQuoteId = sameCurrency ? (sortedQuotes[0]?.id ?? null) : null;
          const isCollapsed = collapsedIds.has(line.id);
          const headerId = `award-line-header-${line.id}`;
          const panelId = `award-line-panel-${line.id}`;
          const lineLabel = getLineDisplayLabel(line, items);

          return (
            <div
              key={line.id}
              className="space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-dark-border"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <button
                    id={headerId}
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-controls={panelId}
                    onClick={() => toggleLineCollapsed(line.id)}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-xl text-left',
                      interactiveFocusClassName,
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-900 dark:text-white">
                        {lineLabel}
                      </span>
                      <span className="mt-1 block text-sm text-iwana-secondary-700 dark:text-iwana-secondary-400">
                        Solicitado: {line.quantityRequested} {line.unitOfMeasure}
                        {isCollapsed && draft.awardedPartyLabel
                          ? ` · ${draft.awardedPartyLabel}`
                          : ''}
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                        !isCollapsed && 'rotate-180',
                      )}
                    />
                  </button>
                </div>
                <Badge
                  variant={
                    line.lineStatus === PurchaseRequestLineStatus.AWARDED ? 'success' : 'neutral'
                  }
                >
                  {getPurchaseRequestLineStatusLabel(line.lineStatus)}
                </Badge>
              </div>

              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                hidden={isCollapsed}
                className="space-y-3"
              >
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
                    {sortedQuotes.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {sortedQuotes.map((quote) => {
                          const isCheapest =
                            quote.id === cheapestQuoteId && sortedQuotes.length > 1;
                          return (
                            <button
                              key={quote.id}
                              type="button"
                              title={isCheapest ? 'Opción más barata' : undefined}
                              className={cn(
                                'min-h-11 rounded-full border px-3 py-1 text-xs font-medium text-iwana-primary hover:bg-iwana-primary/5 dark:border-dark-border',
                                isCheapest ? 'border-iwana-secondary-700' : 'border-gray-200',
                                interactiveFocusClassName,
                              )}
                              onClick={() => applyQuote(line.id, quote)}
                            >
                              {`Usar ${quote.quoteNumber} (${formatQuoteUnitLabel(quote, line.id)})${isCheapest ? ' · Más barato' : ''}`}
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
                        options={[
                          { value: '', label: 'Sin cotización vinculada' },
                          ...partyQuotes.map((quote) => ({
                            value: quote.id,
                            label: buildQuoteOptionLabel(quote, line.id),
                          })),
                        ]}
                        onChange={(event) =>
                          updateDraft(line.id, {
                            supplierQuoteId: event.target.value || null,
                          })
                        }
                      />
                    </div>

                    <label className="block space-y-1 text-sm">
                      <span className="font-medium text-gray-900 dark:text-white">
                        Notas de adjudicación
                      </span>
                      <textarea
                        aria-label={`Notas de adjudicación para ${lineLabel}`}
                        className={cn(
                          'w-full rounded-2xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white',
                          interactiveFocusClassName,
                        )}
                        rows={2}
                        value={draft.awardNotes}
                        disabled={disabled}
                        onChange={(event) =>
                          updateDraft(line.id, { awardNotes: event.target.value })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
