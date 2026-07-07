# MOD12 Compras Captura Masiva Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redisenar `Nueva solicitud de compra` para soportar captura masiva con tabs `Sugeridos` y `Catalogo`, seleccion compartida y edicion posterior en tabla compacta de lineas.

**Architecture:** La ejecucion se concentra en `apps/portal/src/components/inventory` y reaprovecha contratos vigentes del portal. La fase 1 evita cambios de schema y nuevos endpoints si `items`, `balances` y `catalogOptions` cubren el flujo; el trabajo fuerte es descomponer `PurchaseRequestComposer` en un estado de borrador reusable y subcomponentes de captura masiva.

**Tech Stack:** Next.js App Router, React, TypeScript strict, `@iwana/ui`, portal primitives, Jest, Testing Library, pnpm.

---

## File Map

- Modify `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`.
- Modify `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx`.
- Modify `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`.
- Modify `apps/portal/src/components/inventory/InventoryClient.tsx`.
- Modify `apps/portal/src/components/inventory/InventoryClient.spec.tsx`.
- Modify `apps/portal/src/components/inventory/purchase-catalog-selector.ts`.
- Create `apps/portal/src/components/inventory/purchase-request-draft.ts`.
- Create `apps/portal/src/components/inventory/purchase-request-draft.spec.ts`.
- Create `apps/portal/src/components/inventory/purchase-suggestions.ts`.
- Create `apps/portal/src/components/inventory/purchase-suggestions.spec.ts`.
- Create `apps/portal/src/components/inventory/PurchaseSourceTabs.tsx`.
- Create `apps/portal/src/components/inventory/PurchaseSuggestionList.tsx`.
- Create `apps/portal/src/components/inventory/PurchaseCatalogBulkTable.tsx`.
- Create `apps/portal/src/components/inventory/PurchaseSelectionBar.tsx`.
- Create `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx`.
- Modify `apps/portal/src/components/shared/portal-ui.tsx` only if a reusable primitive is clearly justified by at least two inventory surfaces.
- Modify `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`.
- Create `docs/informes/INFORME-MOD12-COMPRAS-CAPTURA-MASIVA-v1.0.md`.

---

## Task 1: Freeze scope and write failing draft-state tests

**Files:**
- Create: `apps/portal/src/components/inventory/purchase-request-draft.ts`
- Create: `apps/portal/src/components/inventory/purchase-request-draft.spec.ts`
- Create: `apps/portal/src/components/inventory/purchase-suggestions.ts`
- Create: `apps/portal/src/components/inventory/purchase-suggestions.spec.ts`

- [ ] **Step 1: Inspect current purchase composer responsibilities**

Run:

```powershell
rg -n "createLineDraft|handleCatalogSelection|setLines|sourceKind|productSearch|suggestedPartyRefId" apps/portal/src/components/inventory/PurchaseRequestComposer.tsx
```

Expected: confirm the current composer owns line creation, search and submit shaping in one file.

- [ ] **Step 2: Write failing tests for draft-state behavior**

Create `apps/portal/src/components/inventory/purchase-request-draft.spec.ts` with:

```ts
import { PurchaseRequestLineSourceKind } from '@iwana/shared';
import {
  addCatalogSelectionToDraft,
  createEmptyPurchaseDraft,
  removeDraftLine,
} from './purchase-request-draft';

describe('purchase-request-draft', () => {
  it('adds multiple selected products into the draft with quantity 1 defaults', () => {
    const draft = createEmptyPurchaseDraft();

    const next = addCatalogSelectionToDraft(draft, [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
        purchaseUnitOfMeasure: 'caja',
        preferredSupplierRefId: 'supplier-1',
        preferredSupplierName: 'Proveedor Alfa',
      },
      {
        id: 'item-2',
        sku: 'CAB-010',
        name: 'Cable drop',
        unitOfMeasure: 'metro',
        purchaseUnitOfMeasure: null,
        preferredSupplierRefId: null,
        preferredSupplierName: null,
      },
    ], PurchaseRequestLineSourceKind.INVENTORY_ITEM);

    expect(next.lines).toHaveLength(2);
    expect(next.lines[0]).toMatchObject({
      inventoryItemId: 'item-1',
      quantityRequested: '1',
      unitOfMeasure: 'caja',
    });
    expect(next.lines[1]).toMatchObject({
      inventoryItemId: 'item-2',
      quantityRequested: '1',
      unitOfMeasure: 'metro',
    });
  });

  it('removes a draft line without mutating the original order', () => {
    const draft = addCatalogSelectionToDraft(createEmptyPurchaseDraft(), [
      {
        id: 'item-1',
        sku: 'ONT-001',
        name: 'ONT WiFi 6',
        unitOfMeasure: 'unidad',
        purchaseUnitOfMeasure: null,
        preferredSupplierRefId: null,
        preferredSupplierName: null,
      },
    ], PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION);

    const next = removeDraftLine(draft, draft.lines[0]!.id);

    expect(draft.lines).toHaveLength(1);
    expect(next.lines).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Write failing tests for suggestion derivation**

Create `apps/portal/src/components/inventory/purchase-suggestions.spec.ts` with:

```ts
import { InventoryItemKind, InventoryItemStatus, InventoryTrackingMode } from '@iwana/shared';
import { buildPurchaseSuggestions } from './purchase-suggestions';

describe('purchase-suggestions', () => {
  it('returns purchasable low-stock items with visible reasons', () => {
    const suggestions = buildPurchaseSuggestions({
      items: [
        {
          id: 'item-1',
          sku: 'ONT-001',
          name: 'ONT WiFi 6',
          itemKind: InventoryItemKind.SERIALIZED,
          trackingMode: InventoryTrackingMode.SERIALIZED,
          status: InventoryItemStatus.ACTIVE,
          unitOfMeasure: 'unidad',
          purchaseUnitOfMeasure: 'caja',
          minimumStock: '2',
          reorderPoint: '5',
          purchasable: true,
          preferredSupplierRefId: 'supplier-1',
          preferredSupplierName: 'Proveedor Alfa',
        },
      ] as never[],
      balances: [
        {
          itemId: 'item-1',
          quantityOnHand: '1',
        },
      ] as never[],
      limit: 8,
    });

    expect(suggestions[0]).toMatchObject({
      itemId: 'item-1',
      reason: 'Bajo minimo',
      quantityOnHand: 1,
    });
  });
});
```

- [ ] **Step 4: Run the new tests to verify failure**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- purchase-request-draft.spec.ts purchase-suggestions.spec.ts
```

Expected: FAIL because the helper modules do not exist yet.

- [ ] **Step 5: Write minimal helper implementations**

Create `apps/portal/src/components/inventory/purchase-request-draft.ts` with:

```ts
import { PurchaseRequestLineSourceKind } from '@iwana/shared';

export interface PurchaseDraftCatalogSelection {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  purchaseUnitOfMeasure: string | null;
  preferredSupplierRefId: string | null;
  preferredSupplierName: string | null;
}

export interface PurchaseDraftLine {
  id: string;
  sourceKind: PurchaseRequestLineSourceKind;
  inventoryItemId: string;
  productLabel: string;
  quantityRequested: string;
  unitOfMeasure: string;
  suggestedPartyRefId: string;
  suggestedPartyName: string;
  notes: string;
}

export interface PurchaseDraftState {
  lines: PurchaseDraftLine[];
}

function createDraftLineId(): string {
  return `draft-line-${crypto.randomUUID()}`;
}

export function createEmptyPurchaseDraft(): PurchaseDraftState {
  return { lines: [] };
}

export function addCatalogSelectionToDraft(
  draft: PurchaseDraftState,
  selections: PurchaseDraftCatalogSelection[],
  sourceKind: PurchaseRequestLineSourceKind,
): PurchaseDraftState {
  return {
    lines: [
      ...draft.lines,
      ...selections.map((selection) => ({
        id: createDraftLineId(),
        sourceKind,
        inventoryItemId: selection.id,
        productLabel: `${selection.sku} - ${selection.name}`,
        quantityRequested: '1',
        unitOfMeasure: selection.purchaseUnitOfMeasure?.trim() || selection.unitOfMeasure,
        suggestedPartyRefId: selection.preferredSupplierRefId ?? '',
        suggestedPartyName: selection.preferredSupplierName ?? '',
        notes: '',
      })),
    ],
  };
}

export function removeDraftLine(
  draft: PurchaseDraftState,
  lineId: string,
): PurchaseDraftState {
  return {
    lines: draft.lines.filter((line) => line.id !== lineId),
  };
}
```

Create `apps/portal/src/components/inventory/purchase-suggestions.ts` with:

```ts
export interface PurchaseSuggestionRecord {
  itemId: string;
  reason: string;
  quantityOnHand: number;
}

export function buildPurchaseSuggestions(input: {
  items: Array<{
    id: string;
    minimumStock: string;
    reorderPoint?: string | null;
    purchasable: boolean;
  }>;
  balances: Array<{ itemId: string; quantityOnHand: string }>;
  limit: number;
}): PurchaseSuggestionRecord[] {
  const quantityByItem = new Map<string, number>();

  input.balances.forEach((balance) => {
    quantityByItem.set(
      balance.itemId,
      (quantityByItem.get(balance.itemId) ?? 0) + Number.parseFloat(balance.quantityOnHand),
    );
  });

  return input.items
    .filter((item) => item.purchasable)
    .map((item) => {
      const quantityOnHand = quantityByItem.get(item.id) ?? 0;
      const threshold = Number.parseFloat(item.reorderPoint || item.minimumStock || '0');
      return { itemId: item.id, reason: quantityOnHand <= threshold ? 'Bajo minimo' : '', quantityOnHand };
    })
    .filter((item) => item.reason)
    .slice(0, input.limit);
}
```

- [ ] **Step 6: Run the tests again**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- purchase-request-draft.spec.ts purchase-suggestions.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/portal/src/components/inventory/purchase-request-draft.ts apps/portal/src/components/inventory/purchase-request-draft.spec.ts apps/portal/src/components/inventory/purchase-suggestions.ts apps/portal/src/components/inventory/purchase-suggestions.spec.ts
git commit -m "feat: add compras bulk-capture draft helpers"
```

---

## Task 2: Build bulk-capture presentation components

**Files:**
- Create: `apps/portal/src/components/inventory/PurchaseSourceTabs.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseSuggestionList.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseCatalogBulkTable.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseSelectionBar.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx`
- Modify: `apps/portal/src/components/inventory/purchase-catalog-selector.ts`

- [ ] **Step 1: Write failing component tests**

Append to `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx`:

```ts
it('renders purchase source tabs and a shared add-to-draft action', () => {
  render(
    <PurchaseRequestComposer
      catalogOptions={catalogOptions}
      supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
      isSubmitting={false}
      error={null}
      onSubmit={jest.fn()}
    />,
  );

  expect(screen.getByRole('tab', { name: /Sugeridos/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Catalogo/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Agregar al borrador/i })).toBeDisabled();
});

it('moves selected catalog products into the draft lines table', async () => {
  const user = userEvent.setup();

  render(
    <PurchaseRequestComposer
      catalogOptions={catalogOptions}
      supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
      isSubmitting={false}
      error={null}
      onSubmit={jest.fn()}
    />,
  );

  await user.click(screen.getByRole('tab', { name: /Catalogo/i }));
  await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT WiFi 6/i }));
  await user.click(screen.getByRole('button', { name: /Agregar 1 producto/i }));

  expect(screen.getByText(/Lineas seleccionadas/i)).toBeInTheDocument();
  expect(screen.getByDisplayValue('1')).toBeInTheDocument();
});

it('keeps a manual line path available inside the new draft flow', async () => {
  const user = userEvent.setup();

  render(
    <PurchaseRequestComposer
      catalogOptions={catalogOptions}
      supplierLabels={{ 'supplier-1': 'Proveedor Alfa' }}
      isSubmitting={false}
      error={null}
      onSubmit={jest.fn()}
    />,
  );

  await user.click(screen.getByRole('button', { name: /Agregar linea manual/i }));

  expect(screen.getByLabelText(/Descripcion manual/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the component tests to verify failure**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx
```

Expected: FAIL because the tabs, selection bar and draft lines table do not exist.

- [ ] **Step 3: Implement the tab shell and shared selection bar**

Create `PurchaseSourceTabs.tsx`:

```tsx
import { Tabs, TabsList, TabsTrigger } from '@iwana/ui';

interface PurchaseSourceTabsProps {
  value: 'suggestions' | 'catalog';
  suggestionCount: number;
  catalogCount: number;
  onValueChange: (value: 'suggestions' | 'catalog') => void;
}

export function PurchaseSourceTabs({
  value,
  suggestionCount,
  catalogCount,
  onValueChange,
}: PurchaseSourceTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as 'suggestions' | 'catalog')}>
      <TabsList>
        <TabsTrigger value="suggestions">Sugeridos ({suggestionCount})</TabsTrigger>
        <TabsTrigger value="catalog">Catalogo ({catalogCount})</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

Create `PurchaseSelectionBar.tsx`:

```tsx
import { Button } from '@iwana/ui';
import { PortalActionToolbar } from '@/components/shared/portal-ui';

interface PurchaseSelectionBarProps {
  count: number;
  addLabel: string;
  disabled?: boolean;
  onClear: () => void;
  onAdd: () => void;
}

export function PurchaseSelectionBar({
  count,
  addLabel,
  disabled = false,
  onClear,
  onAdd,
}: PurchaseSelectionBarProps) {
  return (
    <PortalActionToolbar className="sticky bottom-0 z-10 mt-3">
      <span className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        {count} productos seleccionados
      </span>
      <Button type="button" variant="secondary" size="sm" onClick={onClear} disabled={count === 0}>
        Limpiar seleccion
      </Button>
      <Button type="button" size="sm" onClick={onAdd} disabled={disabled || count === 0}>
        {addLabel}
      </Button>
    </PortalActionToolbar>
  );
}
```

- [ ] **Step 4: Implement the suggestions list, catalog table and draft lines table**

Create `PurchaseSuggestionList.tsx`:

```tsx
import { Checkbox } from '@iwana/ui';

interface PurchaseSuggestionListProps {
  suggestions: Array<{
    itemId: string;
    productLabel: string;
    helperLabel: string;
    selected: boolean;
  }>;
  onToggle: (itemId: string) => void;
}

export function PurchaseSuggestionList({ suggestions, onToggle }: PurchaseSuggestionListProps) {
  return (
    <div className="space-y-2">
      {suggestions.map((suggestion) => (
        <label
          key={suggestion.itemId}
          className="flex items-start gap-3 rounded-2xl border border-gray-200 px-4 py-3"
        >
          <Checkbox
            aria-label={`Seleccionar ${suggestion.productLabel}`}
            checked={suggestion.selected}
            onCheckedChange={() => onToggle(suggestion.itemId)}
          />
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{suggestion.productLabel}</p>
            <p className="text-sm text-gray-500">{suggestion.helperLabel}</p>
          </div>
        </label>
      ))}
    </div>
  );
}
```

Create `PurchaseCatalogBulkTable.tsx`:

```tsx
import { Checkbox } from '@iwana/ui';

interface PurchaseCatalogBulkTableProps {
  rows: Array<{
    id: string;
    productLabel: string;
    categoryName: string;
    unitLabel: string;
    supplierLabel: string;
    selected: boolean;
  }>;
  onToggle: (itemId: string) => void;
}

export function PurchaseCatalogBulkTable({ rows, onToggle }: PurchaseCatalogBulkTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">Sel.</th>
            <th className="px-4 py-3 text-left">Producto</th>
            <th className="px-4 py-3 text-left">Categoria</th>
            <th className="px-4 py-3 text-left">Unidad</th>
            <th className="px-4 py-3 text-left">Proveedor sugerido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3">
                <Checkbox
                  aria-label={`Seleccionar ${row.productLabel}`}
                  checked={row.selected}
                  onCheckedChange={() => onToggle(row.id)}
                />
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{row.productLabel}</td>
              <td className="px-4 py-3 text-gray-600">{row.categoryName}</td>
              <td className="px-4 py-3 text-gray-600">{row.unitLabel}</td>
              <td className="px-4 py-3 text-gray-600">{row.supplierLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Create `PurchaseDraftLinesTable.tsx`:

```tsx
import { Button, Input } from '@iwana/ui';
import type { PurchaseDraftLine } from './purchase-request-draft';

interface PurchaseDraftLinesTableProps {
  lines: PurchaseDraftLine[];
  onLabelChange: (lineId: string, value: string) => void;
  onQuantityChange: (lineId: string, value: string) => void;
  onRemove: (lineId: string) => void;
}

export function PurchaseDraftLinesTable({
  lines,
  onLabelChange,
  onQuantityChange,
  onRemove,
}: PurchaseDraftLinesTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">Producto</th>
            <th className="px-4 py-3 text-left">Origen</th>
            <th className="px-4 py-3 text-left">Cantidad</th>
            <th className="px-4 py-3 text-left">Unidad</th>
            <th className="px-4 py-3 text-left">Proveedor sugerido</th>
            <th className="px-4 py-3 text-left">Accion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="px-4 py-3">
                {line.sourceKind === 'FREE_TEXT' ? (
                  <Input
                    aria-label="Descripcion manual"
                    value={line.productLabel}
                    onChange={(event) => onLabelChange(line.id, event.target.value)}
                  />
                ) : (
                  <span className="font-medium text-gray-900">{line.productLabel}</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-600">{line.sourceKind}</td>
              <td className="px-4 py-3">
                <Input
                  aria-label={`Cantidad ${line.productLabel}`}
                  value={line.quantityRequested}
                  onChange={(event) => onQuantityChange(line.id, event.target.value)}
                />
              </td>
              <td className="px-4 py-3 text-gray-600">{line.unitOfMeasure}</td>
              <td className="px-4 py-3 text-gray-600">{line.suggestedPartyName || 'Sin proveedor sugerido'}</td>
              <td className="px-4 py-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(line.id)}>
                  Quitar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run the component test again**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx
```

Expected: still FAIL because `PurchaseRequestComposer` does not wire the new components yet, but the subcomponents compile.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/inventory/PurchaseSourceTabs.tsx apps/portal/src/components/inventory/PurchaseSuggestionList.tsx apps/portal/src/components/inventory/PurchaseCatalogBulkTable.tsx apps/portal/src/components/inventory/PurchaseSelectionBar.tsx apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx apps/portal/src/components/inventory/purchase-catalog-selector.ts apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx
git commit -m "feat: add compras bulk-capture components"
```

---

## Task 3: Refactor PurchaseRequestComposer around bulk selection

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx`

- [ ] **Step 1: Replace line-first state with draft-first state**

In `PurchaseRequestComposer.tsx`, replace the current `lines` array pattern with:

```ts
const [sourceTab, setSourceTab] = useState<'suggestions' | 'catalog'>('suggestions');
const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
const [draft, setDraft] = useState(createEmptyPurchaseDraft());
```

Also add a computed selection count:

```ts
const selectionCount = selectedSuggestionIds.length + selectedCatalogIds.length;
```

- [ ] **Step 2: Build derived rows for suggestions and catalog**

Add code like:

```ts
const suggestionRows = useMemo(
  () =>
    buildPurchaseSuggestions({
      items: catalogOptions.map((option) => ({
        id: option.id,
        minimumStock: '0',
        reorderPoint: null,
        purchasable: true,
      })),
      balances: [],
      limit: 8,
    }).map((suggestion) => ({
      itemId: suggestion.itemId,
      productLabel:
        buildCatalogSelectOptions(catalogOptions).find((option) => option.value === suggestion.itemId)
          ?.label ?? suggestion.itemId,
      helperLabel: suggestion.reason,
      selected: selectedSuggestionIds.includes(suggestion.itemId),
    })),
  [catalogOptions, selectedSuggestionIds],
);
```

Do not keep a `Select` per line for the main capture flow.

- [ ] **Step 3: Wire add-to-draft behavior**

Implement a handler like:

```ts
function handleAddSelectedProducts() {
  const selectedFromCatalog = catalogOptions.filter((option) =>
    selectedCatalogIds.includes(option.id),
  );
  const selectedFromSuggestions = catalogOptions.filter((option) =>
    selectedSuggestionIds.includes(option.id),
  );

  setDraft((current) =>
    addCatalogSelectionToDraft(
      addCatalogSelectionToDraft(
        current,
        selectedFromSuggestions,
        PurchaseRequestLineSourceKind.REPLENISHMENT_SUGGESTION,
      ),
      selectedFromCatalog,
      PurchaseRequestLineSourceKind.INVENTORY_ITEM,
    ),
  );

  setSelectedSuggestionIds([]);
  setSelectedCatalogIds([]);
}
```

Also add a manual-line helper:

```ts
function handleAddManualLine() {
  setDraft((current) => ({
    lines: [
      ...current.lines,
      {
        id: `manual-${crypto.randomUUID()}`,
        sourceKind: PurchaseRequestLineSourceKind.FREE_TEXT,
        inventoryItemId: '',
        productLabel: 'Linea manual',
        quantityRequested: '1',
        unitOfMeasure: 'unidad',
        suggestedPartyRefId: '',
        suggestedPartyName: '',
        notes: '',
      },
    ],
  }));
}
```

- [ ] **Step 4: Render the new anatomy**

Replace the old `Detalle del pedido` section with this shape:

```tsx
<section className="space-y-4">
  <PortalSectionHeader
    eyebrow="Productos"
    title="Agregar productos"
    description="Selecciona primero y ajusta despues."
    actions={
      <Button type="button" variant="secondary" size="sm" onClick={handleAddManualLine}>
        Agregar linea manual
      </Button>
    }
  />

  <PurchaseSourceTabs
    value={sourceTab}
    suggestionCount={suggestionRows.length}
    catalogCount={catalogOptions.length}
    onValueChange={setSourceTab}
  />

  {sourceTab === 'suggestions' ? (
    <PurchaseSuggestionList
      suggestions={suggestionRows}
      onToggle={(itemId) =>
        setSelectedSuggestionIds((current) =>
          current.includes(itemId)
            ? current.filter((value) => value !== itemId)
            : [...current, itemId],
        )
      }
    />
  ) : (
    <PurchaseCatalogBulkTable
      rows={catalogRows}
      onToggle={(itemId) =>
        setSelectedCatalogIds((current) =>
          current.includes(itemId)
            ? current.filter((value) => value !== itemId)
            : [...current, itemId],
        )
      }
    />
  )}

  <PurchaseSelectionBar
    count={selectionCount}
    addLabel={`Agregar ${selectionCount} producto${selectionCount === 1 ? '' : 's'}`}
    onClear={() => {
      setSelectedSuggestionIds([]);
      setSelectedCatalogIds([]);
    }}
    onAdd={handleAddSelectedProducts}
  />
</section>

<section className="space-y-4">
  <PortalSectionHeader
    eyebrow="Borrador"
    title="Lineas seleccionadas"
    description="Aqui ajustas cantidades, unidad y proveedor."
  />
  <PurchaseDraftLinesTable
    lines={draft.lines}
    onLabelChange={(lineId, value) =>
      setDraft((current) => ({
        lines: current.lines.map((line) =>
          line.id === lineId ? { ...line, productLabel: value } : line,
        ),
      }))
    }
    onQuantityChange={(lineId, value) =>
      setDraft((current) => ({
        lines: current.lines.map((line) =>
          line.id === lineId ? { ...line, quantityRequested: value } : line,
        ),
      }))
    }
    onRemove={(lineId) => setDraft((current) => removeDraftLine(current, lineId))}
  />
</section>
```

Inside `PurchaseDraftLinesTable`, render a manual description input when `sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT`:

```tsx
{line.sourceKind === PurchaseRequestLineSourceKind.FREE_TEXT ? (
  <Input
    aria-label="Descripcion manual"
    value={line.productLabel}
    onChange={(event) => onLabelChange(line.id, event.target.value)}
  />
) : (
  <span className="font-medium text-gray-900">{line.productLabel}</span>
)}
```

- [ ] **Step 5: Reshape submit payload from the draft**

Replace the old `lines.map(...)` submit shape with:

```ts
lines: draft.lines.map((line) => ({
  sourceKind: line.sourceKind,
  inventoryItemId: line.inventoryItemId || null,
  freeTextDescription: null,
  quantityRequested: Number(line.quantityRequested || '0'),
  unitOfMeasure: line.unitOfMeasure.trim(),
  suggestedPartyRefId: line.suggestedPartyRefId.trim() || null,
  notes: line.notes.trim() || null,
})),
```

After success:

```ts
setDraft(createEmptyPurchaseDraft());
setSelectedSuggestionIds([]);
setSelectedCatalogIds([]);
```

- [ ] **Step 6: Run the composer tests again**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/portal/src/components/inventory/PurchaseRequestComposer.tsx apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx
git commit -m "feat: refactor compras composer for bulk capture"
```

---

## Task 4: Integrate the new capture flow into the purchases workspace

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseWorkspace.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Write failing integration tests at the workspace level**

Append to `InventoryClient.spec.tsx`:

```ts
it('preserves selected products while moving between sugeridos and catalogo', async () => {
  const user = userEvent.setup();
  render(<InventoryClient />);

  await waitFor(() => {
    expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
  });

  await user.click(screen.getByRole('tab', { name: 'Compras' }));
  await user.click(screen.getByRole('button', { name: 'Nueva solicitud' }));
  await user.click(screen.getByRole('tab', { name: /Catalogo/i }));
  await user.click(screen.getByRole('checkbox', { name: /Seleccionar ONT WiFi 6/i }));
  await user.click(screen.getByRole('tab', { name: /Sugeridos/i }));
  await user.click(screen.getByRole('tab', { name: /Catalogo/i }));

  expect(screen.getByRole('checkbox', { name: /Seleccionar ONT WiFi 6/i })).toBeChecked();
});
```

- [ ] **Step 2: Run the integration test to verify failure**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx
```

Expected: FAIL because the current purchase flow does not expose or preserve this behavior.

- [ ] **Step 3: Set initial source tab by request type**

In `PurchaseRequestComposer.tsx`, add:

```ts
useEffect(() => {
  setSourceTab(
    requestType === PurchaseRequestType.REPLENISHMENT ||
      requestType === PurchaseRequestType.URGENT_OPERATION
      ? 'suggestions'
      : 'catalog',
  );
}, [requestType]);
```

This keeps the default aligned to the approved spec.

- [ ] **Step 4: Keep workspace layout intact while swapping capture anatomy**

Do not replace the overall split in `PurchaseWorkspace.tsx`. Keep:

```tsx
<div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
  {isDesktopComposer ? <div>{composer}</div> : null}
  <PortalPanel
    eyebrow="Operacion"
    title="Bandeja de solicitudes"
    description="Tabla densa con filtros rapidos y acceso al panel lateral de trabajo."
  >
    <div className="space-y-4">
      <PurchaseRequestsToolbar
        filters={filters}
        resultCount={filteredCount}
        totalCount={requests.length}
        isRefreshing={isRefreshing}
        onFiltersChange={setFilters}
        onRefresh={() => void onRefresh()}
        onClearFilters={() => setFilters({})}
        onOpenComposer={() => setComposerOpen(true)}
      />
      <PurchaseRequestsTable
        requests={requests}
        filters={filters}
        selectedRequestId={selectedRequestId}
        isLoading={isLoading}
        onSelectRequest={(requestId) => void openWorkbench(requestId)}
        onCreateRequest={() => setComposerOpen(true)}
      />
    </div>
  </PortalPanel>
</div>
```

Only update copy and composer wiring if needed so the bulk-capture anatomy fits the existing split.

- [ ] **Step 5: Run the workspace and integration tests again**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx PurchaseRequestComposer.spec.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/components/inventory/PurchaseWorkspace.tsx apps/portal/src/components/inventory/InventoryClient.tsx apps/portal/src/components/inventory/InventoryClient.spec.tsx
git commit -m "feat: integrate compras bulk capture into workspace"
```

---

## Task 5: Add polish states, mobile behavior and quality coverage

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx`
- Modify: `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`
- Create: `docs/informes/INFORME-MOD12-COMPRAS-CAPTURA-MASIVA-v1.0.md`

- [ ] **Step 1: Add explicit empty and invalid states**

In `PurchaseRequestComposer.tsx`, render:

```tsx
{draft.lines.length === 0 ? (
  <PortalEmptyState
    title="Aun no hay lineas en el borrador"
    description="Selecciona productos desde Sugeridos o Catalogo para construir la solicitud."
  />
) : (
  <PurchaseDraftLinesTable
    lines={draft.lines}
    onLabelChange={(lineId, value) =>
      setDraft((current) => ({
        lines: current.lines.map((line) =>
          line.id === lineId ? { ...line, productLabel: value } : line,
        ),
      }))
    }
    onQuantityChange={(lineId, value) =>
      setDraft((current) => ({
        lines: current.lines.map((line) =>
          line.id === lineId ? { ...line, quantityRequested: value } : line,
        ),
      }))
    }
    onRemove={(lineId) => setDraft((current) => removeDraftLine(current, lineId))}
  />
)}
```

And block submit with:

```tsx
<Button type="button" disabled={isSubmitting || draft.lines.length === 0} onClick={() => void handleSubmit()}>
  {isSubmitting ? 'Creando solicitud...' : 'Crear solicitud'}
</Button>
```

- [ ] **Step 2: Add mobile-step regression coverage**

Add a focused test:

```ts
it('shows the bulk capture flow inside the mobile dialog', async () => {
  mockMatchMedia(false);
  render(<InventoryClient />);

  await waitFor(() => {
    expect(screen.getByText('Productos catalogados')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('tab', { name: 'Compras' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nueva solicitud' }));

  expect(screen.getByRole('tab', { name: /Sugeridos/i })).toBeInTheDocument();
  expect(screen.getByText(/Lineas seleccionadas/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run the portal quality slice**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx PurchaseRequestComposer.spec.tsx
corepack pnpm --filter @iwana/portal typecheck
```

Expected: tests and typecheck pass for the affected portal inventory slice.

- [ ] **Step 4: Update checklist and report**

Create `docs/informes/INFORME-MOD12-COMPRAS-CAPTURA-MASIVA-v1.0.md` with:

```md
# INFORME - MOD12 Compras Captura Masiva

## Resumen
- Se reemplazo la captura linea por linea por seleccion masiva + borrador compacto.

## Evidencia
- `corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx PurchaseRequestComposer.spec.tsx`
- `corepack pnpm --filter @iwana/portal typecheck`

## Riesgos residuales
- Ranking de sugerencias aun acotado a las senales disponibles en fase 1.
- Catalogo aun puede requerir busqueda server-side en fase 2 si el volumen crece.
```

Add to `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md` a new execution section:

```md
## 6. Captura masiva

- [ ] Tabs `Sugeridos` y `Catalogo` activos en nueva solicitud.
- [ ] Seleccion persistente entre tabs y filtros.
- [ ] Borrador compacto con lineas seleccionadas.
- [ ] CTA principal visible en desktop y mobile.
```

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/components/inventory/PurchaseRequestComposer.tsx apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md docs/informes/INFORME-MOD12-COMPRAS-CAPTURA-MASIVA-v1.0.md
git commit -m "docs: record compras bulk-capture rollout"
```

---

## Task 6: Final verification and spec reconciliation

**Files:**
- Verify all files from Tasks 1-5

- [ ] **Step 1: Run final portal verification**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- purchase-request-draft.spec.ts purchase-suggestions.spec.ts PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
corepack pnpm --filter @iwana/portal typecheck
```

Expected: PASS for all targeted tests and strict typecheck.

- [ ] **Step 2: Re-read the spec against implementation**

Check implementation against:

- `docs/specs/2026-07-02-mod12-compras-captura-masiva-design.md`
- `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`
- `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`

Expected: no gap in:

- tabs `Sugeridos` / `Catalogo`,
- shared selection persistence,
- compact draft lines editor,
- mobile two-step behavior,
- line-manual path still available.

- [ ] **Step 3: Record residual debt if needed**

If any of the following remain unresolved, document them as non-blocking follow-up, not inline pendientes:

```md
- busqueda server-side para catalogo de compras,
- ranking enriquecido de sugerencias,
- acciones masivas avanzadas de proveedor y cantidad,
- total estimado mas confiable.
```

- [ ] **Step 4: Final commit**

```bash
git add docs/specs/2026-07-02-mod12-compras-captura-masiva-design.md docs/plans/2026-07-02-mod12-compras-captura-masiva.md
git commit -m "docs: add compras bulk-capture spec and plan"
```
