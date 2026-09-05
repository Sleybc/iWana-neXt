# Secuencia de ejecución — MOD12: catálogo de artículos y navegación

> **Modo AI-EM-ARCH:** EM + Orchestrator
> **Fecha:** 2026-09-02
> **Versión:** 1.0
> **Estado:** Vigente — orden de lanzamiento de los siete prompts emitidos el 2026-09-02
> **Naturaleza:** documento de orquestación. No sustituye a ningún prompt: fija **en qué orden** se lanzan y **por qué ese orden no es libre**.

---

## Contexto

Las auditorías del 2026-09-01 y 2026-09-02 produjeron siete prompts de ejecución sobre MOD12,
repartidos en dos ejes: **navegación** (subnav de Inventario) y **catálogo maestro de artículos**.

El orden de lanzamiento no es discrecional. Lo determinan tres cosas:

1. **Un gate duro** entre F5a y F5b, normativo por [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) D5.
2. **Una dependencia invertida**: F1 expone los dos campos que activan el defecto que F5 corrige.
3. **Solapamiento de archivos** entre fases que, lanzadas a la vez, colisionarían.

Este documento existe para que quien ejecute no tenga que reconstruir ese razonamiento.

---

## Los siete prompts

| Prompt | Eje | Destinatarios | Estado |
| --- | --- | --- | --- |
| [F3 · Diagnóstico de SKU](../prompts/PROMPT-MOD12-CATALOGO-FASE-F3-DIAGNOSTICO-SKU-v1.0.md) | Catálogo | DATA-ENG o SR-QA | Pendiente |
| [F2 · Alta y copy](../prompts/PROMPT-MOD12-CATALOGO-FASE-F2-ALTA-Y-COPY-v1.0.md) | Catálogo | PROD-UX → FE-PLATFORM | Pendiente |
| [2A · Reagrupación del subnav](../prompts/PROMPT-MOD12-FASE-2A-REAGRUPACION-SUBNAV-v1.0.md) | Navegación | PROD-UX + DS-OWNER → FE-PLATFORM | Pendiente |
| [2A-bis · RBAC de Proveedores](../prompts/PROMPT-MOD12-FASE-2A-BIS-RBAC-PROVEEDORES-v1.0.md) | Navegación | SR-FULL + SEC-ENG | Pendiente — **condicional, ver §Reglas** |
| [F1 · Secciones del drawer](../prompts/PROMPT-MOD12-CATALOGO-FASE-F1-SECCIONES-DRAWER-v1.0.md) | Catálogo | PROD-UX + DS-OWNER → FE-PLATFORM | Pendiente — **se lanza recortado** |
| [F5a · Catálogo de UoM y migración](../prompts/PROMPT-MOD12-UOM-FASE-F5A-CATALOGO-Y-MIGRACION-v1.0.md) | Catálogo | DATA-ENG + SR-FULL | Pendiente |
| [F5b · Dimensión y conversión](../prompts/PROMPT-MOD12-UOM-FASE-F5B-DIMENSION-Y-CONVERSION-v1.0.md) | Catálogo | SR-FULL + SR-QA | Pendiente — **gate duro de entrada** |
| [F4 · Código de barras](../prompts/PROMPT-MOD12-CATALOGO-FASE-F4-CODIGO-BARRAS-v1.0.md) | Catálogo | SR-FULL → FE-PLATFORM | Pendiente |

---

## Orden de lanzamiento

### Tramo 1 — Ahora, los dos en paralelo

| # | Prompt | Por qué primero |
| --- | --- | --- |
| 1 | **F3 · Diagnóstico de SKU** | Solo lectura: no bloquea a nadie y su resultado alimenta una decisión que sigue abierta |
| 2 | **F2 · Alta y copy** | **Es lo único que produce daño nuevo cada día.** Cada producto creado antes de esta corrección recibe un SKU degradado **irreversible** |

No comparten archivos: F2 toca el diálogo de alta, los dos composers de salidas y una línea de
documentación en `dto/index.ts`; F3 no escribe nada.

### Tramo 2 — Superficie, secuencial entre sí

| # | Prompt | Nota |
| --- | --- | --- |
| 3 | **2A · Reagrupación del subnav** | Absorbe el 403 de Proveedores al aplicar el gate por grupo |
| 4 | **F1 · Secciones del drawer** — **recortado** | Ver el recorte obligatorio, abajo |

Secuenciales porque ambos pueden tocar `InventoryClient.tsx`.

> ### Recorte obligatorio de F1
>
> **F1 se lanza sin `purchaseUnitOfMeasure` ni `purchaseToBaseUomFactor`.**
>
> Esos dos campos son los que activan el defecto de conversión que F5 corrige. Hoy está latente
> **solo** porque nadie puede llenarlos desde la UI. Exponerlos antes de F5 convierte un defecto
> dormido en saldos incorrectos. ADR-085 lo deja fijado en su restricción de secuencia.
>
> El recorte cuesta poco: 2 campos de 17. Los otros 15 entran completos — **incluido `minimumStock`,
> que es el que revive StockLow**, el valor principal de F1.

### Tramo 3 — Unidades de medida, estrictamente secuencial

| # | Prompt | Gate |
| --- | --- | --- |
| 5 | **F5a · Catálogo de UoM y migración** | Su diagnóstico previo puede **detener** la migración: es un resultado válido, no un fallo |
| 6 | **F5b · Dimensión y conversión** | **Gate duro**: F5a cerrada, migración completa en todos los tenants del entorno, veredicto positivo |

Tramo de mayor riesgo y el único donde el orden es **normativo** (ADR-085 D5). No solapar con el
tramo 2: comparten `inventory-item.service.ts`, `dto/index.ts` y la entidad.

### Tramo 4 — Cierre

| # | Trabajo | Nota |
| --- | --- | --- |
| 7 | **Completar F1** con los dos campos de UoM | Reusar el mismo prompt F1; ya es seguro exponerlos |
| 8 | **F4 · Código de barras** | PRD §11.8: no añadir un campo nuevo a un formulario que aún no expone los que ya tiene |

---

## Reglas de decisión

**R1 · Si el tramo 2 se retrasa, lanzar 2A-bis suelto.**
2A necesita spec de PROD-UX y DS-OWNER antes de tocar código. Si eso demora, lanzar **2A-bis** en el
tramo 1: cierra el 403 vivo de Proveedores por su cuenta y es barato. Queda absorbido cuando 2A
llegue. **No lanzarlo si 2A arranca ya** — harían el mismo trabajo dos veces sobre `inventory-nav.ts`.

**R2 · Si F5a se detiene, F4 puede adelantarse.**
Una parada de F5a por valor de unidad no mapeable no bloquea el tramo 4 entero: el código de barras
no depende de las unidades. Lo único que queda esperando es completar F1.

**R3 · Ninguna fase se solapa con otra que toque sus mismos archivos.**
Ver la matriz de abajo. Ante duda, secuenciar: resolver una colisión por sobrescritura cuesta más que
esperar un turno.

---

## Matriz de archivos compartidos

Los puntos calientes, para no lanzar dos fases que se pisen:

| Archivo | F2 | 2A | 2A-bis | F1 | F5a | F5b | F4 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `apps/api/.../inventory/dto/index.ts` | ▪ doc | | | | ● | ● | ● |
| `apps/portal/.../inventory/InventoryClient.tsx` | | ● | ● | ● | | | |
| `apps/portal/.../inventory/inventory-nav.ts` | | ● | ● | | | | |
| `apps/portal/.../inventory/InventoryCatalogDrawer.tsx` | | | | ● | ● | | ● |
| `apps/portal/.../inventory/InventoryCreateProductDialog.tsx` | ● | | | | ● | | ● |
| `apps/api/.../inventory/services/inventory-item.service.ts` | | | | | ● | | ● |
| `apps/api/.../inventory/services/goods-receipt.service.ts` | | | | | | ● | ● |
| `packages/database/.../inventory-item.entity.ts` + migración | | | | | ● | | ● |
| `apps/portal/.../shared/portal-ui.tsx` | | ● | | | | | |

`●` escribe · `▪ doc` solo una cadena de documentación (`dto/index.ts:506-507`, descripción Swagger del SKU).

**Lecturas de la matriz:**
- `dto/index.ts` lo tocan cuatro fases: es el archivo más disputado. F2 solo cambia una cadena de doc, así que convive; F5a, F5b y F4 **no deben solaparse** entre sí.
- `InventoryClient.tsx` es el punto de colisión del tramo 2 (3.053 líneas, ~120 `useState`): motivo por el que 2A y F1 van secuenciales.
- La entidad y su migración las tocan F5a y F4: **F4 va después de F5a**, nunca a la vez.

---

## Estado de avance

Marcar aquí conforme se cierren; cada fase deja además su informe en `docs/informes/`.

- [x] **1 · F3** — diagnóstico de SKU — **EJECUTADO, BLOCKED válido (2026-09-02)**: BD accesible (dev local) con 0 productos; informe `INFORME-MOD12-CATALOGO-DIAGNOSTICO-SKU-F3-v1.0.md` + queries Q0–Q6 reproducibles; requiere staging o dump anonimizado para medir ([BLOQUEO] F3-01)
- [x] **2 · F2** — alta y copy — **DONE aprobado (2026-09-02)**: spec PROD-UX → FE-PLATFORM; spec ✅; calidad ✅ tras fix (Swagger `-001/-002/409` real); informe `INFORME-MOD12-CATALOGO-ALTA-COPY-F2-v1.0.md` + informe drawer actualizado
- [x] **3 · 2A** — reagrupación del subnav — **VERIFIED 8/8 CA (2026-09-02)**: implementada por sesión paralela, verificada independientemente (spec v1.3 congelada, gate por grupo Abastecimiento, audit-ui P0/P1=0, backend intacto) *(2A-bis NO lanzado por R1: 2A arrancó ya)*
- [x] **4 · F1 recortado** — secciones del drawer, sin los dos campos de UoM — **DONE aprobado (2026-09-02)**: spec PROD-UX + DS-OWNER (spec `2026-09-02-mod12-catalogo-drawer-secciones-f1-ux.md` congelada); 14 campos, `buildPayload` 24 claves; spec ✅; calidad ✅ (Ready to merge); CA-F1-04 E2E completo pendiente de caso preexistente roto
- [x] **5 · F5a** — catálogo de UoM y migración — **DONE aprobada (2026-09-02/03)**: catálogo `inventory-unit-of-measure.ts` (10 códigos + dimensión) + migración tenant 122 (equivalencia exacta, parada probada, `down()` verificado, aplicada en vacío local); spec 8/8 ✅; calidad ✅ tras 3 fixes; **despliegue en tenants poblados BLOQUEADO hasta diagnóstico representativo** (gate de despliegue, no de merge)
- [x] **6 · F5b** — dimensión y conversión — **DONE aprobada (2026-09-03)**: gate duro evaluado y superado (F5a cerrada + 122 aplicada en el único tenant + veredicto positivo); D2 autoritativa + D3 en recepción y mostrador (2×100→200 verificado); SR-QA VERIFIED 11/11 ✅; calidad ✅ tras fix de redondeo half-up (escaneo 1M: 0 desviaciones); informe `INFORME-MOD12-UOM-CONVERSION-F5B-v1.0.md`
- [x] **7 · F1 completado** — los dos campos de UoM — **VERIFIED (2026-09-03)**: `purchaseUnitOfMeasure` (Select catálogo) + `purchaseToBaseUomFactor` (decimal > 0) en Compras con guía D2 vía fuente shared; `buildPayload` 26 claves; specs 29/29 + 75/76; docs (§10 informe F1, §9 spec, §8 Fase 01) actualizadas
- [x] **8 · F4** — código de barras — **DONE (2026-09-03)**: backend VERIFIED (migración 123 + índice parcial + dígito GS1 + juntitos + colisión útil + unicidad por tenant; 3 defectos corregidos; ejemplo EAN del prompt corregido: check real 5) + frontend VERIFIED (6 superficies, buscador genérico ya cubría CA-F4-04, 143 tests); calidad **Ready to merge — Yes** con 8 minors como follow-ups (informe F4 §9); G6.5/G7 pendientes por definición

> **Cierre de secuencia 2026-09-03:** los 8 ítems están ejecutados o cerrados con resultado válido (F3: diagnóstico sin datos representativos; F5a: construcción completa, aplicación en poblados pendiente de diagnóstico). Sin commits: el árbol acumula trabajo multi-fase sin commitear; la integración (commits por fase + G6.5 CI Linux + G7) queda como paso siguiente fuera de esta secuencia.
>
> > **Pendiente #2 (E2E `portal-inventory-scm`) — CERRADO 2026-09-03:** suite **41/41 verde** (baseline 30/41). Causas y fixes: (a) caso 3551 — la vista Catálogo aterriza en subtab Categorías (diseño vigente): el test clica tab Productos; (b) 9 casos de salidas — regresión a11y del commit `5c1f8b09` (eliminó `TabsTrigger` exteriores, tabpanels sin nombre): restaurados los 10 nombres desde `INVENTORY_NAV_GROUPS` (fuente única) en `InventoryClient.tsx` + 11 tests unitarios; (c) caso 5007 — `openStockIssueComposer` acotado al `navigation "Secciones de inventario"` con `exact:true` (colisión con tarjeta KPI de `StockIssuesSummary`). Efecto colateral positivo: la aserción `tabpanel[name='Existencias']` (:4465) pasa de vacua a real. Verificación independiente: diff acotado, mecanismo confirmado, subconjunto 11/11 re-ejecutado en verde.

---

## Normativa que fija este orden

| Restricción | Fuente | Estado |
| --- | --- | --- |
| Orden D1 → D2 → D3 de unidades de medida | [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) D5 | Aprobado |
| F1 no expone los campos de UoM hasta ejecutar ADR-085 | ADR-085 §Restricción de secuencia | Aprobado |
| Código de barras después de cerrar la brecha de superficie | [PRD-MOD12-CATALOGO](../prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md) §11.8 | Aprobado (delta v1.1) |
| Las tres secciones del drawer son norma, no alcance nuevo | [HLD-MOD12-CATALOGO](../hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md) §7 | Aprobado |
| G6, G6.5 y G7 registrados por separado en cada fase | [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) | Aprobado |

**Regla transversal de evidencia:** ninguna fase cierra con un `pnpm test` en verde que no declare
`Cached: 0`. Un verde cacheado no prueba que se haya ejecutado nada.

---

## Trabajo relacionado, fuera de esta secuencia

- **Federación de maestros en Settings** — [plan v1.2](2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md) y [ADR-084 v1.1](../adrs/ADR-084-Inventario-Maestros-Federacion-Settings.md). Su Fase 2A es el prompt **2A** de esta secuencia; la activación del alias federado (Fase 2B) depende de una validación UX propia y no forma parte de este orden.
- **Deuda de duplicación** — [plan de dedup](2026-09-01-inventario-dedup-refactors.md) (parcialmente ejecutado). Sin relación bloqueante con esta secuencia.
- **Provider de telemetría** — decisión de tooling pendiente del CTO. Ya no bloquea nada.
