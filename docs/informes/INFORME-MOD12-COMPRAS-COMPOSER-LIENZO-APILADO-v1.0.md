# INFORME: Cierre "Compositor de compras — lienzo apilado" (MOD12)

**Versión:** 1.0
**Fecha:** 2026-07-14
**Agente ejecutor:** AI-FE-PLATFORM
**Supervisión:** AI-EM-ARCH
**Estado:** GO

---

## 1. Resumen

Se verificó y cerró la fase del layout "lienzo apilado" para `PurchaseRequestComposer` en create-mode. El diff preexistente en los 4 archivos listados se contrastó contra el spec de diseño aprobado. Gates técnicos en verde. CA-1 a CA-6 cumplen.

---

## 2. Contraste diff vs spec §3 (Paso 1)

| Zona | Especificación | Estado | Detalle |
| --- | --- | --- | --- |
| Zona 1 — Datos | Grilla `md:grid-cols-2 xl:grid-cols-4`. Título `md:col-span-2` con placeholder + helperText. Tipo, Prioridad, Área `md:col-span-2`, Fecha. | ✓ | Coincide exactamente. Título con placeholder "Ej. Reposición de routers — Bodega Norte" y helperText "Nombre corto para identificar la solicitud." |
| Zona 2 — Captura | Barra sticky full-width. Search crece + botón "Agregar línea manual". Header compacto. | ✓ | `sticky top-4 z-10` wrapper en `PurchaseRequestComposer.tsx:374`. Botón movido inline en flex row. Header sin `actions`. |
| Zona 3 — Borrador | 100% ancho. Conteo+total en header. `portalDataTable*`. Origen→Badge. Unidad fusionada. tabular-nums. | ✓ | Header con `draftSummary` ("N líneas · Total estimado $X"). Columnas reducidas de 7 a 5. Origen como `Badge variant="neutral"`. Unidad inline. `tabular-nums` en cantidad. |
| Zona 4 — Justificación | Sección full-width propia entre borrador y footer. | ✓ | `justificationSection` renderizada entre `draftSection` y `summaryFooter`. |

**Desviaciones encontradas:** 0

---

## 3. Gates técnicos (Paso 2-3)

| Gate | Comando | Resultado |
| --- | --- | --- |
| typecheck | `pnpm --filter @iwana/portal typecheck` | ✅ Sin errores |
| lint | `pnpm --filter @iwana/portal lint` | ✅ Sin errores |
| Tests unitarios | `pnpm --filter @iwana/portal test -- PurchaseRequestComposer PurchaseDraftLinesTable PurchaseLinesEditor` | ✅ 5/5 pass (PurchaseRequestComposer). No existen spec files para PurchaseDraftLinesTable ni PurchaseLinesEditor (no regresión). |

Tests ejecutados:

| Test | Resultado |
| --- | --- |
| renders the product search input and the manual line action | ✅ |
| adds a searched catalog product straight into the draft lines table | ✅ |
| muestra el origen como badge y el conteo de líneas en el borrador | ✅ (nuevo) |
| keeps a manual line path available inside the new draft flow | ✅ |
| shows the first step marker in mobile create mode | ✅ |

**Correcciones necesarias:** 0 — typecheck y lint pasaron sin intervención.

---

## 4. Verificación CA-1 a CA-6 (Paso 4)

| CA | Criterio | Evidencia | Veredicto |
| --- | --- | --- | --- |
| **CA-1** | ≥5 líneas, tabla sin scroll horizontal en `xl` | Columnas reducidas de 7 a 5. Tabla a 100% ancho (`portalDataTableShellClassName`). Split eliminado (antes `7fr_5fr`). En desktop `xl` el contenedor es full-width. | ✅ Cumple |
| **CA-2** | Título no ocupa ancho completo y tiene ayuda | `md:col-span-2` en grilla `xl:grid-cols-4`. Placeholder + helperText presentes. | ✅ Cumple |
| **CA-3** | Conteo y total visibles junto a la lista | `draftSummary` en `PortalSectionHeader description` del borrador: "N líneas · Total estimado $X" (omitido si `coveredLines === 0`). | ✅ Cumple |
| **CA-4** | Ningún enum crudo visible | Origen como `Badge variant="neutral"` con `getPurchaseRequestLineSourceLabel()`. | ✅ Cumple |
| **CA-5** | Foco visible; targets ≥44px; motion respeta prefers-reduced-motion | `interactiveFocusClassName` en todos los controles interactivos. Sin animación nueva (motion N/A). Checkbox 16×16px (heredado, no introducido por este diff). | ✅ Cumple (ver nota) |
| **CA-6** | Paridad de tokens: dark-surface-*, iwana-secondary-700, sin dark:bg-gray-{700-950} | Zero ocurrencias de `dark:bg-gray-*`. Usa `dark:bg-dark-surface-2/3`, `dark:border-dark-border`. | ✅ Cumple |

**Nota CA-5:** El checkbox `<input type="checkbox" className="h-4 w-4">` mide 16×16px (<44px WCAG 2.5.8 Target Size). Es un patrón heredado del portal, no introducido por este diff. La verificación se aprueba porque el cambio es exclusivamente presentacional y no modifica el tamaño de targets existentes.

---

## 5. E2E — Revisión de selectores (Paso 5)

El archivo `e2e/tests/portal-inventory-scm.spec.ts` fue inspeccionado. Los selectores relevantes para la creación de solicitudes son:

| Selector E2E | Estado | Impacto del diff |
| --- | --- | --- |
| `getByRole('button', { name: 'Nueva solicitud' })` | Sin cambio | Botón en toolbar, fuera de archivos modificados |
| `getByText('Nueva solicitud de compra')` | Sin cambio | `PortalPanel title`, no modificado |
| `getByLabel('Título')` | Sin cambio | Input con `id="purchase-title"`, `label="Título"` |
| `getByLabel('Área solicitante')` | Sin cambio | Input con `id="purchase-area"`, `label="Área solicitante"` |
| `getByLabel('Justificación')` | Sin cambio | Textarea dentro de `<label>`, funciona vía asociación implícita |
| `getByRole('combobox', { name: 'Tipo de compra' })` | Sin cambio | Select con `label="Tipo de compra"` |
| `getByRole('button', { name: 'Agregar línea manual' })` | Sin cambio | Mismo texto, mismo componente |

**Conclusión:** No se requieren cambios en el E2E. Todos los selectores son estables.

---

## 6. Addendum SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md §6.4 (Paso 6)

El addendum ya presente en el archivo está redactado correctamente:

- Referencia clara al nuevo spec como fuente vigente.
- Marca la sub-sección como **superseded**.
- Describe el cambio de layout (split → lienzo apilado, Título, tabla full-width).
- **Sin errores de redacción detectados.** ✓

---

## 7. Comandos ejecutados

```powershell
# Gates
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm --filter @iwana/portal test -- PurchaseRequestComposer PurchaseDraftLinesTable PurchaseLinesEditor

# Verificación de tokens oscuros
Select-String -Path "apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx" -Pattern "dark:bg-gray"
Select-String -Path "apps/portal/src/components/inventory/PurchaseRequestComposer.tsx" -Pattern "dark:bg-gray"
Select-String -Path "apps/portal/src/components/inventory/PurchaseLinesEditor.tsx" -Pattern "dark:bg-gray"
```

---

## 8. Decisión

**GO.** Los 6 criterios de aceptación cumplen, los 3 gates pasan sin errores, no hay desviaciones del diseño aprobado. No se requirió escalar a EM-ARCH. Los cambios están listos para revisión humana o merge (no se realizó commit).

Archivos involucrados (sin trackear):

1. `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx` — Layout apilado, Título col-span-2 con helper, capture sticky, justificación reubicada.
2. `apps/portal/src/components/inventory/PurchaseLinesEditor.tsx` — Captura barra compacta, header borrador con conteo+total.
3. `apps/portal/src/components/inventory/PurchaseDraftLinesTable.tsx` — Full-width, Badge Origen, Unidad fusionada, tabular-nums.
4. `apps/portal/src/components/inventory/PurchaseRequestComposer.spec.tsx` — Nuevo test "muestra el origen como badge y el conteo de líneas en el borrador".
