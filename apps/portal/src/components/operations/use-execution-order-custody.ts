import { useMemo, useRef } from 'react';
import type { ListMeta } from '@iwana/shared';
import { INVENTORY_CONSUMPTION_PENDING_THRESHOLD_MS, InventoryItemStatus } from '@iwana/shared';
import type {
  ExecutorCustodyResponse,
  SerializedAssetRecord,
  StockBalanceRecord,
} from '@/lib/api-client';
import { inventoryApi, type ExecutionOrderDetailResponse } from '@/lib/api-client';
import { EMPTY_LIST_META, normalizeListMeta } from '@/lib/list-meta';
import type { RequirementActionDescriptor } from './execution-order-actions';
import type { ExecutionOrderCustodyOption } from './execution-order-console-types';
import { mapOperationsError } from './execution-order-requirements';

type LoadState = 'loading' | 'available' | 'unavailable';
type ConsumptionAction = Extract<RequirementActionDescriptor, { kind: 'consumption' }>;

/** Tamaño de página máximo del contrato de custodia y del catálogo de inventario. */
const PAGE_SIZE = 100;
/** Cotas de seguridad del recorrido: 2.000 filas de custodia y 5.000 ítems/categorías. */
const MAX_CUSTODY_PAGES = 20;
const MAX_CATALOG_PAGES = 50;

/** Indica si un consumo pendiente ya supera la ventana compartida de D7. */
export function isProlongedPendingInventoryConsumption(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) && now - createdAtMs >= INVENTORY_CONSUMPTION_PENDING_THRESHOLD_MS
  );
}

/**
 * Contexto que el adaptador entrega al slot de custodia (R3). Los setters son
 * estables; los valores (`assetsMeta`, `balancesMeta`, `isLoadingMore`,
 * `selectedExecutionOrder`) cambian por render, así que el slot lee de `context`
 * en el momento de usarlos y devuelve un objeto referencialmente estable (el
 * adaptador lo usa como dependencia de `useCallback`).
 */
export interface ExecutionOrderCustodyAdapter {
  selectedExecutionOrder: ExecutionOrderDetailResponse | null;
  requestSequence: { current: number };
  setInventoryState: (value: LoadState) => void;
  setCustodyState: (value: LoadState) => void;
  setCustodyName: (value: string | null) => void;
  setAssets: (
    value:
      | SerializedAssetRecord[]
      | ((current: SerializedAssetRecord[]) => SerializedAssetRecord[]),
  ) => void;
  setAssetsMeta: (value: ListMeta) => void;
  setBalances: (
    value: StockBalanceRecord[] | ((current: StockBalanceRecord[]) => StockBalanceRecord[]),
  ) => void;
  setBalancesMeta: (value: ListMeta) => void;
  setItemOptions: (value: Array<{ value: string; label: string }>) => void;
  setCustodyOptions: (value: ExecutionOrderCustodyOption[]) => void;
  setError: (value: string | null) => void;
  assetsMeta: ListMeta;
  balancesMeta: ListMeta;
  isLoadingMore: boolean;
  setLoadingMore: (value: boolean) => void;
}

/**
 * Slot R3 — política de carga de custodia e inventario de la consola.
 *
 * La custodia NO se consulta al abrir la OT: solo cuando la hoja «Registrar
 * equipo instalado» está abierta sobre un requisito MATERIAL con
 * `REGISTER_ITEM_USAGE` autorizado (UX §6). Contrato con el adaptador:
 * - `openAction(descriptor)` llega al abrir la hoja y `null` al cerrarla; para
 *   `kind: 'consumption'` carga catálogo y custodia, para cualquier otro
 *   descriptor o `null` cancela lo que esté en vuelo. También es la vía de
 *   reintento y de refresco tras una mutación (`refreshOpenCustody`).
 * - `loadOnOpen` solo carga cuando un consumo ya está abierto y la OT se vuelve a
 *   leer (refresco completo); sin acto de consumo abierto no consulta nada. Devuelve
 *   la función que aplica el resultado, de modo que el adaptador confirma el
 *   estado en un único lote y solo si su respuesta no es tardía.
 * - `markUnavailable` se invoca si el detalle no llegó; `reset` al cerrar el drawer.
 * - `loadMore` continúa el recorrido de custodia si la cota de seguridad lo cortó.
 *
 * Reglas de la selección: el responsable técnico/cuadrilla de la OT NO es la
 * ubicación de stock; la ubicación la resuelve `GET /inventory/custody` desde
 * `assignee.id`. Solo se ofrecen ítems ACTIVE de la categoría del requisito que
 * estén en esa custodia. Se recorren todas las páginas: una página sin
 * coincidencias nunca declara el vacío mientras queden más por leer.
 */
export interface ExecutionOrderCustodySlot {
  loadOnOpen: (detail: Promise<ExecutionOrderDetailResponse>) => Promise<() => void>;
  markUnavailable: () => void;
  reset: () => void;
  openAction: (action: RequirementActionDescriptor | null) => void;
  loadMore: () => Promise<void>;
}

const STALE = Symbol('custody-stale');
type Stale = typeof STALE;
const NOOP = () => undefined;

interface CustodyWalk {
  location: ExecutorCustodyResponse['location'];
  assets: SerializedAssetRecord[];
  balances: StockBalanceRecord[];
  assetsMeta: ListMeta;
  balancesMeta: ListMeta;
  /** Siguiente página por leer si la cota cortó el recorrido; `null` si se agotó. */
  nextPage: number | null;
}

interface CustodySession {
  assigneeId: string;
  compatible: ReadonlyMap<string, string>;
  assets: SerializedAssetRecord[];
  balances: StockBalanceRecord[];
  nextPage: number | null;
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Código de categoría del snapshot -> id de categoría del catálogo (recorre sus páginas). */
async function resolveCategoryId(code: string, isCurrent: () => boolean): Promise<string | Stale> {
  let cursor: string | undefined;
  for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
    const response = await inventoryApi.listCategories({
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    if (!isCurrent()) return STALE;
    const match = response.data.find((category) => category.code === code);
    if (match) return match.id;
    const meta = normalizeListMeta(response.meta, { dataLength: response.data.length });
    if (!meta.hasMore || !meta.nextCursor) return '';
    cursor = meta.nextCursor;
  }
  throw new Error('El catálogo de categorías supera la cota de recorrido.');
}

/** Ítems ACTIVE de la categoría del requisito: id -> etiqueta visible. */
async function loadCompatibleItems(
  category: string,
  isCurrent: () => boolean,
): Promise<Map<string, string> | Stale> {
  const compatible = new Map<string, string>();
  const categoryId = await resolveCategoryId(category, isCurrent);
  if (categoryId === STALE) return STALE;
  // Categoría inexistente en el catálogo: no hay ítems compatibles que ofrecer.
  if (categoryId === '') return compatible;

  let cursor: string | undefined;
  for (let page = 0; page < MAX_CATALOG_PAGES; page += 1) {
    const response = await inventoryApi.listItems({
      status: InventoryItemStatus.ACTIVE,
      categoryId,
      limit: PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    if (!isCurrent()) return STALE;
    for (const item of response.data) {
      if (item.status === InventoryItemStatus.ACTIVE && item.categoryCode === category) {
        compatible.set(item.id, `${item.sku} · ${item.name}`);
      }
    }
    const meta = normalizeListMeta(response.meta, { dataLength: response.data.length });
    if (!meta.hasMore || !meta.nextCursor) return compatible;
    cursor = meta.nextCursor;
  }
  throw new Error('El catálogo de ítems supera la cota de recorrido.');
}

/** Recorre las páginas de custodia del responsable; se detiene si la carga queda obsoleta. */
async function walkCustody(
  responsibleRefId: string,
  startPage: number,
  isCurrent: () => boolean,
): Promise<CustodyWalk | Stale> {
  const assets: SerializedAssetRecord[] = [];
  const balances: StockBalanceRecord[] = [];
  let location: ExecutorCustodyResponse['location'] = null;
  let assetsMeta = EMPTY_LIST_META;
  let balancesMeta = EMPTY_LIST_META;
  let page = startPage;
  for (let walked = 0; walked < MAX_CUSTODY_PAGES; walked += 1) {
    const response = await inventoryApi.getExecutorCustody(responsibleRefId, {
      page,
      limit: PAGE_SIZE,
    });
    if (!isCurrent()) return STALE;
    location = response.location ?? location;
    assets.push(...response.assets.items);
    balances.push(...response.balances.items);
    assetsMeta = response.assets.meta;
    balancesMeta = response.balances.meta;
    page += 1;
    if (!response.assets.meta.hasMore && !response.balances.meta.hasMore) {
      return { location, assets, balances, assetsMeta, balancesMeta, nextPage: null };
    }
  }
  return { location, assets, balances, assetsMeta, balancesMeta, nextPage: page };
}

const compatibleAssets = (
  compatible: ReadonlyMap<string, string>,
  assets: SerializedAssetRecord[],
) => assets.filter((asset) => compatible.has(asset.inventoryItemId));

const compatibleBalances = (
  compatible: ReadonlyMap<string, string>,
  balances: StockBalanceRecord[],
) => balances.filter((balance) => compatible.has(balance.itemId));

/** Opciones del selector: los ítems compatibles que de verdad están en la custodia. */
function custodyItemOptions(
  compatible: ReadonlyMap<string, string>,
  assets: SerializedAssetRecord[],
  balances: StockBalanceRecord[],
) {
  const options = new Map<string, string>();
  for (const itemId of [
    ...assets.map((asset) => asset.inventoryItemId),
    ...balances.map((balance) => balance.itemId),
  ]) {
    options.set(itemId, compatible.get(itemId) ?? itemId);
  }
  return [...options]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

/** El total que se muestra es el de lo compatible, no el de la custodia completa. */
function compatibleMeta(source: ListMeta, shown: number, hasMore: boolean): ListMeta {
  return { ...source, total: shown, totalIsEstimate: hasMore, hasMore };
}

export function useExecutionOrderCustody(
  context: ExecutionOrderCustodyAdapter,
): ExecutionOrderCustodySlot {
  const latest = useRef(context);
  latest.current = context;
  // Cada apertura, cancelación o cierre incrementa la secuencia: una respuesta de
  // una secuencia anterior no aplica nada (cancelación, cambio de OT, reintento).
  const sequence = useRef(0);
  const active = useRef<{ orderId: string; action: ConsumptionAction } | null>(null);
  const session = useRef<CustodySession | null>(null);

  return useMemo<ExecutionOrderCustodySlot>(() => {
    const clearView = () => {
      const ctx = latest.current;
      ctx.setLoadingMore(false);
      ctx.setCustodyName(null);
      ctx.setAssets([]);
      ctx.setAssetsMeta(EMPTY_LIST_META);
      ctx.setBalances([]);
      ctx.setBalancesMeta(EMPTY_LIST_META);
      ctx.setItemOptions([]);
      ctx.setCustodyOptions([]);
    };

    const showUnavailable = () => {
      clearView();
      latest.current.setInventoryState('unavailable');
      latest.current.setCustodyState('unavailable');
    };

    const cancel = () => {
      sequence.current += 1;
      active.current = null;
      session.current = null;
    };

    /**
     * Carga catálogo y custodia del consumo abierto y devuelve la función que
     * aplica el resultado. Nunca rechaza: un fallo se traduce en estado
     * «no disponible» para que el resto de la orden siga operativa.
     */
    const startLoad = async (
      order: ExecutionOrderDetailResponse,
      action: ConsumptionAction,
    ): Promise<() => void> => {
      sequence.current += 1;
      const seq = sequence.current;
      const isCurrent = () => sequence.current === seq;
      session.current = null;
      clearView();
      latest.current.setInventoryState('loading');
      latest.current.setCustodyState('loading');

      if (isOffline()) {
        return () => {
          if (isCurrent()) showUnavailable();
        };
      }

      const assignee = order.assignee ?? null;
      const [itemsResult, custodyResult] = await Promise.allSettled([
        assignee
          ? loadCompatibleItems(action.itemCategory, isCurrent)
          : Promise.resolve(new Map<string, string>()),
        assignee ? walkCustody(assignee.id, 1, isCurrent) : Promise.resolve(null),
      ]);
      if (!isCurrent()) return NOOP;

      const items = itemsResult.status === 'fulfilled' ? itemsResult.value : null;
      const walk = custodyResult.status === 'fulfilled' ? custodyResult.value : null;
      if (items === STALE || walk === STALE) return NOOP;
      // Sin catálogo no se puede decidir qué es compatible; sin custodia no hay
      // qué ofrecer. En ambos casos la selección queda «no disponible».
      if (itemsResult.status === 'rejected' || custodyResult.status === 'rejected' || !items) {
        return () => {
          if (isCurrent()) showUnavailable();
        };
      }

      const emptyWalk: CustodyWalk = {
        location: null,
        assets: [],
        balances: [],
        assetsMeta: EMPTY_LIST_META,
        balancesMeta: EMPTY_LIST_META,
        nextPage: null,
      };
      const loaded = walk ?? emptyWalk;
      const assets = compatibleAssets(items, loaded.assets);
      const balances = compatibleBalances(items, loaded.balances);
      return () => {
        if (!isCurrent()) return;
        const ctx = latest.current;
        const hasMore = loaded.nextPage !== null;
        session.current = {
          assigneeId: assignee?.id ?? '',
          compatible: items,
          assets,
          balances,
          nextPage: loaded.nextPage,
        };
        ctx.setCustodyName(loaded.location?.name ?? null);
        ctx.setAssets(assets);
        ctx.setAssetsMeta(compatibleMeta(loaded.assetsMeta, assets.length, hasMore));
        ctx.setBalances(balances);
        ctx.setBalancesMeta(compatibleMeta(loaded.balancesMeta, balances.length, hasMore));
        ctx.setItemOptions(custodyItemOptions(items, assets, balances));
        ctx.setCustodyOptions(
          assignee
            ? [
                {
                  type: assignee.type,
                  id: assignee.id,
                  label: loaded.location?.name ?? assignee.displayLabel ?? 'Custodia asignada',
                },
              ]
            : [],
        );
        ctx.setInventoryState('available');
        ctx.setCustodyState('available');
      };
    };

    return {
      loadOnOpen: async (detailPromise) => {
        // Sin acto de consumo abierto no se consulta nada: la lectura de la OT,
        // el preinicio, las otras acciones y el cierre no tocan la custodia.
        if (!active.current) return NOOP;
        const detail = await detailPromise;
        const current = active.current;
        if (!current || current.orderId !== detail.id) {
          // Se abrió otra OT: el acto de consumo de la anterior ya no existe.
          cancel();
          return NOOP;
        }
        return startLoad(detail, current.action);
      },
      markUnavailable: () => {
        if (active.current) showUnavailable();
      },
      reset: () => {
        cancel();
        const ctx = latest.current;
        clearView();
        ctx.setInventoryState('loading');
        ctx.setCustodyState('loading');
      },
      openAction: (action) => {
        if (action?.kind !== 'consumption') {
          cancel();
          latest.current.setLoadingMore(false);
          return;
        }
        const order = latest.current.selectedExecutionOrder;
        if (!order) return;
        active.current = { orderId: order.id, action };
        void startLoad(order, action).then((apply) => apply());
      },
      loadMore: async () => {
        const ctx = latest.current;
        const current = session.current;
        if (!current || current.nextPage === null || ctx.isLoadingMore) return;
        const seq = sequence.current;
        const isCurrent = () => sequence.current === seq && session.current === current;
        ctx.setLoadingMore(true);
        try {
          const walk = await walkCustody(current.assigneeId, current.nextPage, isCurrent);
          if (walk === STALE || !isCurrent()) return;
          const assets = [...current.assets, ...compatibleAssets(current.compatible, walk.assets)];
          const balances = [
            ...current.balances,
            ...compatibleBalances(current.compatible, walk.balances),
          ];
          const hasMore = walk.nextPage !== null;
          current.assets = assets;
          current.balances = balances;
          current.nextPage = walk.nextPage;
          ctx.setAssets(assets);
          ctx.setAssetsMeta(compatibleMeta(walk.assetsMeta, assets.length, hasMore));
          ctx.setBalances(balances);
          ctx.setBalancesMeta(compatibleMeta(walk.balancesMeta, balances.length, hasMore));
          ctx.setItemOptions(custodyItemOptions(current.compatible, assets, balances));
        } catch (loadError) {
          if (isCurrent()) ctx.setError(mapOperationsError(loadError));
        } finally {
          ctx.setLoadingMore(false);
        }
      },
    };
  }, []);
}
