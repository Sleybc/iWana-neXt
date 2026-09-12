# SPEC — MOD12 Compras · Layout en 2 columnas para creación (mostrador + solicitudes) — Fase 27

**Versión:** 1.0
**Estado:** Diseño aprobado — contrato congelado para ejecución
**Fecha:** 2026-09-09
**Módulo:** MOD12 Inventario / SCM — Compras (portal)
**Autor:** AI-EM-ARCH (modo ejecutor, con skills `iwana-identity-ui-review` + `senior-ui-systems-designer` + `ui-ux-pro-max` + `system-vocabulary-review` + `brainstorming`)
**Superficie:** `/dashboard/inventory?tab=purchasing` → modos `counter-purchase` (`CounterPurchasePanel`) y `create` (`PurchaseRequestComposer`)
**Precedente aprobado:** `QuoteEconomicsFields` (Fase 25: grid 2 columnas + aside sticky con resumen y CTA)
**ADRs:** Sin cambio de decisión. Tokens y primitives existentes. Sin backend (cero cambios API/DB).

---

## 1. Problema

Los dos flujos de creación de Compras son una sola columna vertical con 4–5 segmentos apilados. En desktop el resumen (subtotal/total estimado) y la acción primaria viven al fondo, fuera del primer viewport, y el operador recorre ~2.5 pantallas de scroll para un caso típico. Además: tras agregar un producto el foco se pierde, los errores de validación solo aparecen en un alert superior sin llevar el foco al campo, y las notas/justificación ocupan espacio vertical permanente aunque suelen ir vacías.

## 2. Objetivo

1. Dividir los segmentos en 2 columnas en desktop (`lg+`) con aside sticky a la derecha (resumen vivo + CTA persistente), replicando la gramática aprobada de `QuoteEconomicsFields`.
2. Foco automático a la cantidad de la línea recién agregada (idea 2).
3. Errores de validación anclados: el alert se mantiene como resumen y el foco va al primer campo inválido (idea 4, WCAG 3.3.1).
4. Notas/justificación colapsables por disclosure progresivo (idea 5).

## 3. Fuera de alcance

- Flujos móviles (`isMobileCreateFlow`, step indicator, capture footer): intactos.
- Modo `inbox` (KPIs + tabla), `PurchaseRequestWorkbenchDrawer`, paneles de cotización/RFQ (ya tienen 2 columnas), `PurchaseOrderDrawer`.
- Layout `panel`/`default` del composer (solo cambia el path `create-mode` en desktop).
- Backend, API, migraciones, OpenAPI: cero cambios.
- Tokens nuevos en `@iwana/ui` o primitives nuevas (se reutiliza `CreateModeSummaryFooter` dentro del aside).

## 4. Decisiones congeladas

### D1. Gramática del grid (idéntica a `QuoteEconomicsFields`)

```html
<div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-start">
  <div className="min-w-0 space-y-6">…flujo principal…</div>
  <aside
    className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2 lg:sticky lg:top-2"
  >
    …resumen + CTA…
  </aside>
</div>
```

En `<lg` el grid apila en una columna (comportamiento actual). El aside lleva `aria-label` propio ("Resumen del ingreso" / "Resumen de la solicitud").

### D2. `CounterPurchasePanel`

- **Izquierda:** Datos del ingreso (grid 2×2 intacto) → Líneas de ingreso (búsqueda + tabla) → Notas (colapsable, D6).
- **Derecha (aside sticky):** Tributos de esta compra → Resumen (Subtotal → tributos → Total estimado hero, `tabular-nums`) → `CreateModeSummaryFooter` con el CTA "Registrar ingreso directo".
- Los alerts (éxito/error/validación) siguen arriba a ancho completo.

### D3. `PurchaseRequestComposer` (solo path `create-mode` en desktop)

- **Izquierda:** Datos de la solicitud → Agregar productos (captura; se retira el wrapper `sticky top-4` actual porque el sticky pasa al aside) → Líneas seleccionadas.
- **Derecha (aside sticky):** Justificación (colapsable, D6) → Estimado (conteo de líneas + total estimado con `formatInventoryCurrency`) → `CreateModeSummaryFooter` con el CTA ("Crear solicitud" / "Actualizar solicitud").
- Path móvil y layouts `panel`/`default`: intactos, sin cambios.

### D4. Foco tras agregar (idea 2)

Tras agregar una línea (catálogo o manual), el foco va a su campo de cantidad:

- Nuevos ids estables: `counter-line-qty-{lineId}` y `counter-line-serials-{lineId}` (`CounterPurchaseLinesTable`); `purchase-draft-qty-{lineId}` y `purchase-draft-label-{lineId}` (`PurchaseDraftLinesTable`).
- Helper compartido `focusLineInput(id)` (`line-focus.ts`): `requestAnimationFrame` + guarda `typeof document === 'undefined'` (jsdom/tests).
- Mostrador: `handleAddProduct` enfoca la cantidad (línea nueva o existente con +1).
- Composer: `onLineAdded` se extiende a `(lineId: string) => void` (prop opcional; el drawer no la usa). Catálogo → cantidad; línea manual → descripción (`purchase-draft-label-{id}`).

### D5. Error anclado al campo (idea 4)

El `PortalAlert` de validación se mantiene (resumen visible + live region). Además cada rama de validación enfoca su campo:

- Mostrador: proveedor → `#counter-purchase-supplier` (nuevo `id` en el `SupplierPicker`, ya soportado); factura → `#counter-purchase-invoice`; bodega → `#counter-purchase-destination`; sin líneas → `#counter-purchase-product-search` (nuevo `id` en el search, ya soportado); seriales → `#counter-line-serials-{lineId}`; tasa inválida → primer `input[id^="quote-tax-rate-"]` visible.
- Composer: título → `#purchase-title`; sin líneas (crear/actualizar) → `#purchase-composer-product-search` (nuevo `id` vía prop `searchInputId` en el hook de secciones).

### D6. Notas/justificación colapsables (idea 5)

Disclosure con `useState<boolean | null>` + botón `aria-expanded`/`aria-controls`:

- Mostrador: botón "Agregar notas (opcional)" ↔ "Ocultar notas". Colapsado por defecto si está vacío; expandido si tiene contenido.
- Composer: botón "Agregar justificación (opcional)" ↔ "Ocultar justificación". Misma regla.
- `null` = automático por contenido; el toggle explícito del usuario siempre gana (colapsar con contenido lo oculta sin borrarlo).
- El contenido se preserva al colapsar; `resetForm`/`resetComposer` vuelve al estado automático vacío.

### D7. Copy congelado (español, sentence case, sin enums)

"Agregar notas (opcional)", "Ocultar notas", "Agregar justificación (opcional)", "Ocultar justificación", "Resumen del ingreso", "Resumen de la solicitud". Resto del vocabulario intacto.

## 5. Criterios de aceptación

| CA       | Descripción                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| CA-27-01 | En `lg+`, mostrador y composer renderizan grid 2 columnas con aside sticky; en `<lg`, una columna          |
| CA-27-02 | El CTA vive en el aside (desktop) y el resumen muestra totales vivos con `tabular-nums`                    |
| CA-27-03 | Agregar producto enfoca la cantidad de la línea (mostrador y composer; línea manual → descripción)         |
| CA-27-04 | Cada error de validación mantiene el alert y enfoca el campo correspondiente                               |
| CA-27-05 | Notas/justificación colapsadas por defecto si vacías, expandibles, contenido preservado                    |
| CA-27-06 | Flujo móvil del composer, layout `panel`/`default` y drawer intactos (tests existentes en verde)           |
| CA-27-07 | Script `audit-ui.mjs` limpio sobre archivos tocados; tokens y primitives existentes; sin `tailwind.config` |

## 6. Impacto

| Eje                         | Impacto                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| Tenant/seguridad/regulación | Ninguno (solo portal, sin datos nuevos)                                           |
| Accesibilidad               | Mejora: foco gestionado, `aria-expanded`/`aria-controls`, asides etiquetados      |
| Tests                       | Se extienden `CounterPurchasePanel.spec.tsx` y `PurchaseRequestComposer.spec.tsx` |
| Rol                         | Frontend puro; DS-OWNER no interviene (sin tokens ni primitives nuevos)           |

## 7. Protocolo

- G4: este spec (no requiere GO de producto: mejora de layout sin cambio de política).
- G5: ejecución directa en esta sesión contra el contrato.
- G6/G7: no aplican (sin backend ni cambio regulatorio).
