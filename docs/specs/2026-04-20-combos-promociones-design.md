# Diseño MVP — Combos y Promociones (MOD06)

**Fecha:** 2026-04-20  
**Módulo:** MOD06 — Comercial  
**Alcance:** Portal (`apps/portal`) + API client (`api-client.ts`)  
**Backend:** Ya implementado — `BundleService`, `PromotionService`, `BundleController`, `PromotionController`  
**Enfoque aprobado:** B — Sub-tabs internos dentro del panel `offers`

---

## 1. Contexto

El tab `offers` de `CommercialTabLayout` actualmente renderiza `CommercialPlaceholderPanel`. El backend tiene implementación completa:

- `GET|POST|PATCH|DELETE /commercial/bundles` + `GET /commercial/bundles/:id/price`
- `GET|POST|PATCH|DELETE /commercial/promotions`

Entidades: `CatalogBundle`, `CatalogBundleItem`, `CatalogPromotion`.  
Enums relevantes: `DiscountType` (`PERCENTAGE | FIXED_AMOUNT | FREE_MONTHS`), `PromotionScope` (`ITEM | BUNDLE | INSTALLATION | ALL`).

---

## 2. Estructura de componentes

```
CommercialTabLayout (offers tab)
└── OffersManager
    ├── tabs internos: [Combos | Promociones]
    ├── BundlesManager          ← tab "Combos"
    │   ├── tabla de bundles activos
    │   ├── CreateBundleModal
    │   └── BundleItemComposer  ← multiselect de CatalogItems activos
    └── PromotionsManager       ← tab "Promociones"
        ├── tabla de promociones activas
        └── CreatePromotionModal
```

### Archivos a crear

| Archivo (relativo a `apps/portal/src/`) | Responsabilidad |
|---|---|
| `components/commercial/OffersManager.tsx` | Shell con sub-tabs Combos / Promociones |
| `components/commercial/BundlesManager.tsx` | Lista + acciones de bundles |
| `components/commercial/CreateBundleModal.tsx` | Formulario de creación de combo |
| `components/commercial/PromotionsManager.tsx` | Lista + acciones de promociones |
| `components/commercial/CreatePromotionModal.tsx` | Formulario de creación de promoción |

### Archivo a modificar

- `components/commercial/CommercialTabLayout.tsx` — reemplazar import de `CommercialPlaceholderPanel` por `OffersManager` en el panel `offers`.

---

## 3. Contratos API — métodos nuevos en `api-client.ts`

```ts
// BUNDLES
getBundles(): Promise<CatalogBundle[]>
  → GET /commercial/bundles

getBundleDetail(id: string): Promise<BundleDetailResult>
  → GET /commercial/bundles/:id

createBundle(dto: CreateBundlePortalDto): Promise<CatalogBundle>
  → POST /commercial/bundles

deactivateBundle(id: string): Promise<void>
  → DELETE /commercial/bundles/:id

getBundlePrice(id: string, segment?: CustomerSegment): Promise<BundlePriceResult>
  → GET /commercial/bundles/:id/price?segment=RESIDENTIAL

// PROMOTIONS
getPromotions(): Promise<CatalogPromotion[]>
  → GET /commercial/promotions

createPromotion(dto: CreatePromotionPortalDto): Promise<CatalogPromotion>
  → POST /commercial/promotions

deactivatePromotion(id: string): Promise<void>
  → DELETE /commercial/promotions/:id
```

Los tipos `CatalogBundle`, `CatalogPromotion`, `BundleDetailResult`, `BundlePriceResult` se definen localmente en `api-client.ts` o en un archivo `types/commercial.types.ts` según el patrón existente del módulo.

---

## 4. Tablas de UI

### Tabla Combos

| Columna | Fuente |
|---|---|
| Nombre | `bundle.name` |
| Ítems | `bundle.items.length` ítems |
| Descuento | formateado: `10%` o `$5.000` según `discountType` |
| Vigencia | `validFrom → validTo` o "Sin vencimiento" |
| Estado | Badge `Activo` |
| Acciones | Ver detalle · Desactivar (solo `canEdit`) |

### Tabla Promociones

| Columna | Fuente |
|---|---|
| Nombre | `promotion.name` |
| Código | `PROMO25` — monospace badge |
| Descuento | `15%` / `$20.000` / `2 meses gratis` |
| Alcance | `Todo` / `Ítem específico` / `Bundle` / `Instalación` |
| Usos | `12 / 50` o `12 / ∞` |
| Vigencia | `validFrom → validTo` |
| Acciones | Desactivar (solo `canEdit`) |

---

## 5. Formularios de creación

### CreateBundleModal

| Campo | Tipo | Reglas |
|---|---|---|
| Nombre | text | requerido, max 200 |
| Descripción | textarea | opcional |
| Ítems del combo | multiselect de CatalogItems activos | mínimo 2; checkbox "opcional" por ítem |
| Tipo de descuento | Select | `PERCENTAGE \| FIXED_AMOUNT` (FREE_MONTHS no aplica a bundles) |
| Valor del descuento | número | requerido |
| Vigencia desde | date | requerido |
| Vigencia hasta | date | opcional (null = sin vencimiento) |

**Precio estimado:** badge calculado en tiempo real con `getBundlePrice()` cuando hay al menos 2 ítems y un descuento definido.

### CreatePromotionModal

| Campo | Tipo | Reglas |
|---|---|---|
| Nombre | text | requerido, max 200 |
| Código | text (uppercase) | requerido, max 50, único por tenant |
| Descripción | textarea | opcional |
| Tipo de descuento | Select | `PERCENTAGE \| FIXED_AMOUNT \| FREE_MONTHS` |
| Valor del descuento | número | requerido |
| Alcance | Select | `ITEM \| BUNDLE \| INSTALLATION \| ALL` |
| Ítem objetivo | Select de ítems activos | visible solo si alcance = `ITEM` |
| Bundle objetivo | Select de bundles activos | visible solo si alcance = `BUNDLE` |
| Segmentos objetivo | multiselect `RESIDENTIAL \| BUSINESS` | opcional (vacío = todos) |
| Máximo de usos | número | opcional (vacío = ilimitado) |
| Vigencia desde | date | requerido |
| Vigencia hasta | date | requerido |

---

## 6. Reglas de negocio

- Un bundle requiere mínimo 2 ítems (validado en backend; el form deshabilita "Crear" si hay menos de 2).
- El precio del bundle es calculado dinámicamente; no se almacena un precio fijo.
- Código de promoción siempre en mayúsculas — el campo hace `toUpperCase()` en `onChange` y el servicio lo normaliza antes de guardar.
- `FREE_MONTHS` solo en promociones, no en bundles.
- Crear combos: rol mínimo `ADMIN`. Crear promociones: `ADMIN | ACCOUNTANT`.
- Desactivar ≠ eliminar — ambas operaciones usan `DELETE` que el backend interpreta como soft-delete.
- `getBundles()` solo retorna `isActive: true` (lista limpia, sin archivados).

---

## 7. Orden de implementación

### Fase A — Combos (portal + api-client)
1. Métodos `getBundles`, `createBundle`, `deactivateBundle` en `api-client.ts`
2. `BundlesManager` con tabla (sin detalle ni precio)
3. `CreateBundleModal` con multiselect de ítems (los ítems se cargan de `getCatalogItems` ya existente)
4. `OffersManager` con sub-tabs → integrar en `CommercialTabLayout`

### Fase B — Detalle y precio de bundle
5. Métodos `getBundleDetail`, `getBundlePrice` en `api-client.ts`
6. Vista de detalle de bundle con desglose de precio
7. Badge de precio estimado en `CreateBundleModal`

### Fase C — Promociones (portal + api-client)
8. Métodos `getPromotions`, `createPromotion`, `deactivatePromotion`
9. `PromotionsManager` con tabla
10. `CreatePromotionModal` con selector condicional de alcance

---

## 8. Consideraciones de accesibilidad y UX

- Los sub-tabs de `OffersManager` siguen el patrón de roving focus ya implementado en `CommercialTabLayout`.
- Badge de código de promoción usa `font-mono` y contraste AA.
- Los selectors condicionales en `CreatePromotionModal` usan `aria-expanded` / visibilidad controlada por estado.
- Texto sobre blanco con color secundario usa `iwana-secondary-700` (6.2:1 contraste).

---

## 9. Fuera de alcance (MVP)

- Aplicación de promociones a suscriptores en flujo de venta (MOD05 CRM / MOD07).
- Historial de usos por código de promoción.
- Clonar bundle existente.
- Edición de ítems de un bundle ya creado (solo desactivar y crear nuevo).
