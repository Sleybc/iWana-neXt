# DS — Densidad tablas comerciales (Wave 2 · W2.4)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.0 |
| **Estado** | **GO** carril rápido → FE-PLATFORM |
| **Fecha** | 2026-07-23 |
| **Autor** | AI-DS-OWNER |
| **Módulo** | MOD06 Comercial · tablas operativas portal |
| **Alcance** | Class-tokens en `portal-ui.tsx` (sin tokens de marca, sin `tailwind.config.js`) |
| **Origen** | Prompt Wave 2 DS-FE · inconsistencias `tbody` / fila inactiva |

**Postura:** consolidación anti-duplicación. Promover a `portal-ui` (no alias commercial-only). Valores solo de tokens/patrones ya vivos: `dark-surface-*`, superficies blancas del shell, divisores soft alineados al thead.

---

## 1. Problema

Las tablas comerciales no comparten un contrato de cuerpo / fila inactiva:

| Variante actual | Dónde |
| --- | --- |
| `tbody` `divide-gray-100` + `dark:bg-dark-surface-2/80` | Bundles, Promotions, Compatibility, TaxApplication, TaxCatalog |
| `tbody` `divide-gray-200` + `dark:bg-dark-surface-2` (opaco) | AdditionalProducts, AdditionalServices |
| Filas con `border-t border-gray-100` (sin `divide-*` en tbody) | PlanCatalog |
| Fila inactiva `opacity-55` | PlanCatalog |
| Fila inactiva `opacity-70` | AdditionalProducts, AdditionalServices |
| Sin atenuación (solo Badge) | Bundles, Promotions, Compatibility, Tax* |

---

## 2. Decisión (contrato congelado)

### 2.1 Tokens a añadir en `apps/portal/src/components/shared/portal-ui.tsx`

Junto a `portalDataTableShellClassName` / `portalDataTableHeadRowClassName` / `portalDataTableCellClassName`:

```ts
/** Cuerpo `<tbody>` — divisores soft (alineados a `border-gray-100` del thead); fondo opaco = shell. */
export const portalDataTableBodyClassName =
  'divide-y divide-gray-100 bg-white dark:divide-dark-border dark:bg-dark-surface-2';

/** Fila inactiva (`!isActive`) — atenuación legible; combinar con hover vía `cn(...)`. */
export const portalDataTableInactiveRowClassName = 'opacity-70';
```

### 2.2 Justificación

| Eje | Elección | Por qué |
| --- | --- | --- |
| Divisor filas | `divide-gray-100` | Misma familia soft que `portalDataTableHeadRowClassName` (`border-gray-100`). El borde externo del shell sigue en `border-gray-200` (jerarquía: exterior > interior). |
| Dark body | `dark:bg-dark-surface-2` **opaco** | Elevación 1 del shell (`portalDataTableShellClassName`). **Prohibido** `dark-surface-2/80` en tbody: translucidez innecesaria sobre el mismo token, stacking inconsistente. |
| Inactiva | `opacity-70` | Atenuación visible sin castigar contraste de Badge / texto secundario / acciones. `opacity-55` (PlanCatalog) queda **deprecado**. |
| Ubicación | `portal-ui` | El paquete de class-tokens de DataTable portal ya existe; commercial no debe redefinir densidad. |

### 2.3 Uso requerido

```tsx
<tbody className={portalDataTableBodyClassName}>
  <tr
    className={cn(
      portalTableRowHoverClassName, // o alias commercialTableRowHoverClassName
      !item.isActive && portalDataTableInactiveRowClassName,
    )}
  >
```

- No inventar `opacity-*` ni `divide-gray-*` locales en commercial.
- PlanCatalog: migrar de `border-t` por fila a `portalDataTableBodyClassName` en `<tbody>` (eliminar `border-t border-gray-100` de cada `<tr>` salvo estados especiales como focus ring).
- Managers que hoy solo usan Badge: **aplicar también** `portalDataTableInactiveRowClassName` al unificar (paridad visual catálogo ↔ ofertas/reglas).

### 2.4 Fuera de alcance

- Tokens de marca nuevos / hex en docs de app.
- Cambio de `portalDataTableShellClassName` / thead (W2.1 aparte).
- `PortalNavListRow` (Wave 3).
- `tailwind.config.js`.

---

## 3. Consumidores FE (migración W2.4)

Reemplazar class strings locales por los dos tokens:

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/commercial/BundlesManager.tsx` | `tbody` → body; filas `!isActive` → inactive |
| `apps/portal/src/components/commercial/PromotionsManager.tsx` | idem |
| `apps/portal/src/components/commercial/CompatibilityRulesManager.tsx` | idem |
| `apps/portal/src/components/commercial/TaxCatalogManager.tsx` | `tbody` → body (quitar `/80`) |
| `apps/portal/src/components/commercial/TaxApplicationRulesManager.tsx` | `tbody` → body; filas inactivas → inactive |
| `apps/portal/src/components/commercial/catalog/PlanCatalogPanel.tsx` | tbody + inactive; quitar `opacity-55` y `border-t` por fila |
| `apps/portal/src/components/commercial/catalog/AdditionalProductsPanel.tsx` | tbody + inactive (ya `opacity-70`) |
| `apps/portal/src/components/commercial/catalog/AdditionalServicesPanel.tsx` | tbody + inactive (ya `opacity-70`) |

**No obligatorio en esta ola:** inventory / users / assurance (misma familia visual; consolidación portal-wide puede seguir en deuda FE).

---

## 4. Veredicto carril rápido

| Criterio | Resultado |
| --- | --- |
| Alcance / contrato de datos / boundary | Sin cambio |
| Tokens de marca | Sin cambio |
| Stack / ADR | N/A |
| **GO / NO-GO FE** | **GO** |

FE-PLATFORM puede implementar W2.4 contra este contrato sin re-gate EM-ARCH. Cambio post-congelación de estas class strings → versionar esta spec y notificar FE + SR-QA vía orquestador.
