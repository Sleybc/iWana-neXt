# INFORME-MOD12-CATALOGO-ALTA-COPY-F2-v1.0

**Fecha:** 2026-09-02
**Módulo:** MOD12 Inventario / SCM — alta de producto y veracidad de copy
**Fase:** F2 — sanear el alta de producto y el copy engañoso
**Prompt maestro:** `docs/prompts/PROMPT-MOD12-CATALOGO-FASE-F2-ALTA-Y-COPY-v1.0.md`
**Ejecutado por:** AI-FE-PLATFORM (implementación sobre decisiones D1–D5 de AI-PROD-UX)
**Estado:** DONE

---

## 1. Alcance ejecutado

Se implementó **literalmente** el spec aprobado de PROD-UX (D1–D5). No se rediseñó nada, no se
tocó el algoritmo del SKU, su inmutabilidad, DTO (salvo la cadena Swagger autorizada), entidad,
migraciones, capas Z ni H4/H5 (ADR-075). Todo lo entregado por la Fase A del drawer
(`useDiscardChangesGuard`, `usePortalSideDrawerA11y`, `PortalDiscardChangesDialog`, reset al abrir,
autoselección de primera categoría activa, creación inline de categoría con debounce 300 ms)
permanece intacto.

## 2. Antes / después de cada texto

### 2.1 Diálogo «Nuevo producto» — `InventoryCreateProductDialog.tsx`

| # | Ubicación | Antes | Después |
| --- | --- | --- | --- |
| a | Header del drawer | «Crea un producto para agregarlo al catálogo. Podrás completar compras, inventario y **otros datos** después.» | «Crea un producto para agregarlo al catálogo. Podrás completar compras, inventario y **activos fijos** después.» |
| b | `Input` Modelo | Pleno sin helper, dentro del `<details>` | Pleno, fuera del `<details>`, con `helperText`: «Opcional. Ambos forman parte del código del producto, que no se puede modificar después.» |
| c | Caption del well «Código sugerido» | «**Se asignará** automáticamente al crear el producto.» | «**Se asigna** automáticamente al crear el producto.» |
| d | Título del `<details>` | «Agregar descripción, **marca y modelo**» | «Agregar descripción» |
| e | Subtítulo del `<details>` | «**Estos datos son opcionales y puedes completarlos más adelante.**» | «**La puedes completar más adelante. No forma parte del código del producto.**» |

`Input` Marca: pasa a `Input` pleno fuera del `<details>`, sin helper (sin cambios de copy).

### 2.2 Copy contable — composers de salidas

| Archivo:línea | Antes | Después |
| --- | --- | --- |
| `StockIssueComposer.tsx` (antes :590) | «Tipo, origen y destino. **El movimiento contable se genera al despachar.**» | «Tipo, origen y destino. **Al despachar se genera el movimiento de inventario y se registra el costo operativo de la salida.**» |
| `StockIssueFormDrawer.tsx` (antes :234) | «Registra la intención y el destino. **El movimiento contable se genera al despachar.**» | «Registra la intención y el destino. **Al despachar se genera el movimiento de inventario y se registra el costo operativo de la salida.**» |

### 2.3 Swagger — `apps/api/src/modules/inventory/dto/index.ts` (D5)

| Antes (formato v1 superado) | Después (formato compuesto vigente, ADR-INV-SKU-COMPUESTO) |
| --- | --- |
| «Codigo del producto. Si se omite o envia vacio, se autogenera como **{prefijo-categoria}-NNNNNN**.» | «Codigo del producto. Si se omite o envia vacio, se autogenera **con el formato compuesto {CAT}-{TIPO}-{NOMBRE}-{MARCA}-{MODELO}; MARCA y MODELO se omiten si no estan disponibles. Ante colision se agrega un sufijo -001 a -999. No se puede modificar despues de crear el producto.**» |

> **Nota 2026-09-02 (corrección post code review):** corregido tras code review — el límite real de
> reintentos es 3 (`SKU_GENERATION_RETRY_LIMIT = 3`, `inventory-item.service.ts:59`; sufijos
> `-001`/`-002` máximo y luego 409), ver `inventory-item.service.ts:59`. La afirmación «sufijo
> -001 a -999» de la cadena registrada arriba era falsa respecto del código y se corrigió en
> `apps/api/src/modules/inventory/dto/index.ts`; la descripción vigente de
> `CreateInventoryItemDto.sku` ahora dice: «Ante colision se reintenta con sufijo -001 o -002; si
> persiste, la operacion devuelve 409.»

Único cambio autorizado en ese archivo. Las demás modificaciones sin commitear presentes en el
mismo archivo (bloque `ListExecutorCustodyQuery*`, trabajo de custodia) **no fueron tocadas**.

## 3. Decisiones D1–D5 (autoría AI-PROD-UX; implementación literal)

| Decisión | Contenido | Implementación |
| --- | --- | --- |
| **D1** | Marca y Modelo salen del `<details>` y pasan a `Input` plenos; la descripción queda sola en el `<details>` retitulado | Marca y Modelo renderizados tras «Unidad de medida»; `<details>` solo contiene la textarea de Descripción (igual a la original) |
| **D2** | El copy dice la verdad: marca/modelo forman parte del código y el código no se puede cambiar después | `helperText` del Modelo con la cadena exacta de PROD-UX; sin `required` añadido (siguen opcionales, ADR) |
| **D3** | Orden final: Nombre → Categoría (+ creación inline intacta) → Tipo de producto → Control de material → Unidad de medida → Marca → Modelo (helper b) → Código sugerido (well, caption c) → `<details>` Descripción (título d, subtítulo e) | Solo se movió JSX; la lógica `skuPreview` con `watch()` NO cambió; el well conserva sus tokens (`rounded-2xl border-iwana-primary-100 bg-iwana-primary-50`, valor `font-mono`) |
| **D4** | Retirar la promesa de contabilidad; describir lo que sí ocurre (movimiento de inventario + costo operativo) | Cadenas exactas de PROD-UX en los dos composers |
| **D5** | Descripción Swagger de `sku` al formato compuesto vigente | Cadena exacta de PROD-UX |

## 4. Tests

- `InventoryCreateProductDialog.spec.tsx`:
  - Header viejo fijado en L59 → actualizado a la cadena nueva (a).
  - Re-grep de «Agregar descripción, marca y modelo», «Estos datos son opcionales» y «Se asignará»:
    **0 asertos** en specs (nada más que actualizar). «Código sugerido» en :135 no cambia.
  - Nuevo test «muestra marca y modelo fuera del acordeón, antes del código sugerido, con copy
    veraz»: verifica el `helperText` del Modelo visible, el título y subtítulo nuevos del
    `<details>`, que los `Input` de Marca/Modelo **no** están dentro del `<details>` y que ambos
    aparecen **antes** del well «Código sugerido» (orden DOM vía `compareDocumentPosition`).
  - Total: 11 tests en verde (antes 10).
- Specs de composers: verificado por grep que **no fijan** el copy contable; no requirieron cambios.
- Control SKU: sin cambios (ver gate 3).

## 5. Evidencia de gates

| # | Gate | Resultado |
| --- | --- | --- |
| 1 | `pnpm --filter @iwana/portal test -- --no-cache src/components/inventory/InventoryCreateProductDialog.spec.tsx` | ✅ 1 suite, **11/11 tests passed**, corrida con `--no-cache`, sin «(cached)» |
| 2 | Specs de los dos composers: `StockIssueComposer.spec.tsx` + `StockIssueFormDrawer.spec.tsx` (con `--no-cache`) | ✅ 2 suites, **5/5 tests passed**, sin caché. Los warnings `act(...)` en consola del Composer son ruido preexistente del spec, no fallos |
| 3 | Control SKU (sin cambios) | ✅ Nota de trazabilidad: el spec citado en el prompt (`packages/shared/src/inventory/inventory-item-sku.spec.ts`) **no existe** en el árbol; el control real vive en `apps/portal/src/components/inventory/inventory-item-sku.spec.ts` (**6/6 passed**) y, como control adicional de backend, `apps/api/src/modules/inventory/tests/inventory-item.sku-generator.spec.ts` (**5/5 passed**). Ambos corridos con `--no-cache`, **cero cambios** en el algoritmo |
| 4 | `Select-String "movimiento contable"` sobre `apps/portal/src` | ✅ **0 resultados** |
| 5 | `pnpm --filter @iwana/portal typecheck` | ✅ `tsc --noEmit` limpio |
| 6 | `pnpm lint` | ✅ 8/8 tasks successful, **0 errores**. 68 warnings preexistentes en archivos ajenos a esta fase (db, worker, api, web, portal). El único warning en un archivo tocado (`InventoryCreateProductDialog.tsx:193`, dependencia `selectableCategories` de un `useEffect`) corresponde al effect de reset de la **Fase A**, línea no modificada en F2 |
| 7 | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los 3 archivos portal tocados | ✅ «sin hallazgos en las rutas analizadas», exit code 0 → **P0 = 0, P1 = 0** (CA-F2-10) |
| 8 | E2E `portal-inventory-scm.spec.ts` | ⚠️ **No bloqueante.** El caso «crea producto comprable en catalogo» está roto de forma **preexistente** (evidencia A/B con stash en `INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0.md` §3). No se usó `git stash` en esta sesión; se documenta como preexistente |

## 6. Criterios de aceptación

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-F2-01 | ✅ | Marca y Modelo son `Input` plenos visibles sin interacción, renderizados antes del well (test nuevo) |
| CA-F2-02 | ✅ | Ningún texto del diálogo insinúa que marca/modelo puedan completarse después sin consecuencia (subtítulo del `<details>` ya solo habla de la descripción) |
| CA-F2-03 | ✅ | `helperText` del Modelo: «forman parte del código del producto, que no se puede modificar después» |
| CA-F2-04 | ✅ | Well «Código sugerido» después de los cinco campos que lo alimentan; `skuPreview` sigue en vivo con `watch()` (test de preview intacto en verde) |
| CA-F2-05 | ✅ | Algoritmo sin cambios: control SKU 6/6 portal + 5/5 API en verde |
| CA-F2-06 | ✅ | Gate 4: grep «movimiento contable» = 0 |
| CA-F2-07 | ✅ | El sustituto habla de «movimiento de inventario» y «costo operativo», sin contabilidad ni efecto fiscal |
| CA-F2-08 | ✅ | Cadena Swagger D5 aplicada |
| CA-F2-09 | ✅ | Sin `required` añadido; el test de payload mínimo (marca/modelo `null`) sigue en verde |
| CA-F2-10 | ✅ | Gate 7: audit-ui P0 = 0, P1 = 0 |

## 7. §Bloqueos

Ninguno. No se activó ningún criterio de stop/go del prompt maestro.

## 8. Riesgo futuro anotado por PROD-UX: `helperText` oculto si hubiera error

El `Input` de `@iwana/ui` renderiza el `helperText` solo cuando **no** hay `error`
(`{helperText && !error && …}`, `packages/ui/src/components/Input.tsx:186`); si el campo tuviera
error, el helper se reemplaza por el mensaje de error. En el caso actual el riesgo es teórico
(Modelo es opcional y el schema no genera error para él), pero si en el futuro se le añade
validación al campo, el copy veraz «Opcional. Ambos forman parte del código…» desaparecería justo
cuando el usuario está editando ese campo. Si se necesita simultaneidad helper+error, corresponde
una decisión de ds-owner sobre la API del componente (no se toca en esta fase).

## 9. Hallazgos de self-review

1. **Spec del prompt desactualizado en una ruta:** el control citado
   (`packages/shared/src/inventory/inventory-item-sku.spec.ts`) no existe; el control real está en
   `apps/portal/src/components/inventory/inventory-item-sku.spec.ts` (reubicado por trabajo
   paralelo del árbol sucio). Ambos controles corridos en verde sin modificarlos.
2. **Cirugía verificada:** `git diff` confirma que en `dto/index.ts` solo cambió la cadena Swagger
   (hunk @@ -504); el bloque `ListExecutorCustodyQuery*` (@@ -992, trabajo de custodia ajeno)
   permanece intacto. En los dos composers, exactamente un hunk cada uno. En el diálogo, solo las
   cinco alteraciones del spec + reorden JSX; los hunks restantes del diff vs HEAD pertenecen a la
   Fase A (sin commitear) y no fueron tocados.
3. **Fase A preservada:** guard, a11y, diálogo de descarte, reset, autoselección y creación inline
   con debounce siguen exactamente igual (tests del guard 10/10 en verde dentro de la suite).
4. Sin PII, sin enums crudos en vistas, español con acentuación correcta en todo el copy nuevo.
5. Sin dependencias npm nuevas; sin ADR requerido.

## 10. Trazabilidad

- Prompt maestro: `PROMPT-MOD12-CATALOGO-FASE-F2-ALTA-Y-COPY-v1.0.md` (AI-EM-ARCH).
- Decisiones de copy y orden: AI-PROD-UX (espec literal, sección «Spec aprobada»).
- `ADR-INV-SKU-COMPUESTO-v1.md` (Aprobado) — algoritmo e inmutabilidad intactos.
- ADR-048 / ADR-059 / PRD-MOD12 §2 — base del retiro de la promesa contable (D4).
- Informe del drawer actualizado: `INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0.md` §9 (F2).
