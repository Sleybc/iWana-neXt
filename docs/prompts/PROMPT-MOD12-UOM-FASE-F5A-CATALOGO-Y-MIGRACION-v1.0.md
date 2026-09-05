# PROMPT DE EJECUCIÓN — MOD12 UoM · F5a · Catálogo canónico de unidades y migración de normalización

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — unidades de medida
- **Código:** MOD12
- **Fase:** F5a — **D1 y D4 de ADR-085**: catálogo canónico y migración de normalización
- **Destinatarios:** **AI-DATA-ENG** (diagnóstico y migración) + **AI-SR-FULL** (catálogo, entidad, DTO)
- **Autorización:** [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) **Aprobado por el CTO el 2026-09-02**
- **Riesgo:** **el más alto del programa de catálogo.** Toca la base de cálculo de existencias. Léase §4 antes que nada.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que las unidades de medida dejen de ser texto libre y pasen a un catálogo
canónico con dimensión física declarada, y que los datos ya escritos queden normalizados **sin
adivinar ni una sola equivalencia**.

**Esta fase NO aplica el factor de conversión.** Eso es F5b, y ejecutarlo antes que esto es, en
palabras del ADR, «el peor orden posible»: convertiría cantidades usando factores declarados entre
unidades no validadas, propagando el error en vez de corregirlo.

**Lo que sí entra:** catálogo canónico en `@iwana/shared` (D1); diagnóstico previo por tenant;
migración de normalización (D4); adaptación de entidad, DTO y superficies que hoy escriben texto libre.

**Lo que no entra:** la validación dimensional (D2) y la aplicación del factor en recepción (D3) —
ambas en F5b. Tampoco el recálculo de saldos históricos, prohibido por D4.

---

## 2. Artefactos de entrada obligatorios

- **ADR:** `docs/adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md` (**Aprobado**) — **D1, D4, D5 y las Reglas de implementación 1, 5, 6, 7, 8 son normativas de esta fase.**
- **PRD:** `docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (**Aprobado**) — RF-CAT-06 y §6 «`purchase_unit_of_measure` sin factor de conversion valido no debe aprobarse».
- **ADRs relacionados:** `ADR-048` (boundaries), `ADR-059` (costeo promedio móvil — consume los saldos), `ADR-054` (conteo físico — compara contra el teórico), `ADR-066` (migraciones no transaccionales y runner).
- **Entidad:** `packages/database/src/entities/inventory-item.entity.ts` — `unit_of_measure` varchar(32) NOT NULL, `purchase_unit_of_measure` varchar(32) nullable.
- **Validación actual:** `apps/api/src/modules/inventory/dto/index.ts:230-274` (`refineInventoryItemMaster`).
- **Migración de referencia:** `packages/database/src/migrations/tenant/053_add_category_code_prefix.ts` — precedente de normalización con backfill sanitizado y desduplicación; y `054_repair_category_code_prefix_legible.ts`, que solo reparó lo que aún no tenía dependencias. **Ambas son el patrón mental correcto.**

---

## 3. Instrucciones

### Paso 1 — Diagnóstico previo, obligatorio y bloqueante

Antes de escribir la migración, **inventariar los valores reales** de `unit_of_measure` y
`purchase_unit_of_measure` por tenant: valores distintos, conteo de artículos por valor, y cuántos
tienen `purchase_to_base_uom_factor` poblado.

Este paso **no es opcional ni informativo**: define si la migración puede completarse. Si aparece
cualquier valor sin equivalencia exacta en el mapa de §3.3, la migración **no se ejecuta** hasta que
haya decisión humana sobre ese valor.

Declarar con precisión el entorno diagnosticado. Un diagnóstico sobre datos sembrados **no es
evidencia sobre producción** y no debe presentarse como tal.

### Paso 2 — Catálogo canónico (D1)

Conjunto cerrado en `packages/shared`, con `code`, etiqueta en español y **dimensión**
(`COUNT`, `LENGTH`, `MASS`, `VOLUME`, `TIME`). Cobertura inicial según el ADR: unidad, caja, rollo,
paquete, metro, kilómetro, kilogramo, gramo, litro, hora.

Es catálogo **del sistema**, no tabla por tenant: el ADR descartó esa alternativa porque haría que
cada tenant reinventara `'unidad'` con su grafía, reintroduciendo el problema que se cierra aquí.

### Paso 3 — Migración de normalización (D4)

Mapeo **por equivalencia exacta**, nunca difusa:

```
'unidad', 'UND', 'und', 'UNIDAD'  → UNIT
'metro', 'm', 'M', 'METRO'        → METER
'caja', 'CAJA'                    → BOX
```

Todo valor fuera del mapa **detiene la migración** y se reporta. Convertir una unidad por
aproximación es corromper existencias en silencio.

**La migración no recalcula ningún saldo histórico** (D4). Los movimientos ya registrados quedan
como están.

### Paso 4 — Adaptar superficies de escritura

Entidad, DTO y los formularios que hoy escriben texto libre pasan a seleccionar del catálogo. Ojo con
las specs que asertan literales `'unidad'` o `'UND'`: hay que actualizarlas, no borrarlas.

---

## 4. Restricciones no negociables

1. **Prohibida la normalización difusa.** Sin `LOWER(TRIM(...))` aproximado, sin similitud, sin
   heurística de prefijos. Equivalencia exacta o parada. Esta es la regla que separa esta fase de
   corromper existencias.
2. **No recalcular saldos ni movimientos históricos** (ADR-085 D4 y Regla 6).
3. **No aplicar el factor de conversión aquí** (es F5b). Si el trabajo empuja hacia ello, es señal de
   que se está saltando el orden de D5.
4. **El catálogo vive en `packages/shared`**; ningún módulo define su propia lista (Regla 1).
5. **Migración aditiva y reversible**, `down()` verificado, sobre schema tenant (Regla 7).
6. **La migración corre por tenant y puede detenerse en uno sin bloquear a los demás.** Una parada es
   un resultado legítimo, no un fallo.
7. **Sin PII ni credenciales** en el informe de diagnóstico. Conteos y valores de unidad, no listados
   de artículos.
8. **Coordinación:** esta fase toca `inventory-item.service.ts`, `dto/index.ts`, la entidad y los
   formularios del catálogo — los mismos archivos que F1 y F4. Sincronizar antes de empezar.

**Contratos congelados:** ADR-085 D1/D4 · `packages/shared/src/enums/inventory/*` · patrón de
migración de la 053.

---

## 5. Entregables

**Técnicos**
- `packages/shared/src/inventory/` — catálogo canónico con dimensión.
- `packages/database/src/entities/inventory-item.entity.ts` — columnas adaptadas al código canónico.
- `packages/database/src/migrations/tenant/` — migración de normalización, reversible, con parada ante valor no mapeable.
- `apps/api/src/modules/inventory/dto/index.ts` — validación contra el catálogo.
- Portal: selección de unidad desde el catálogo en alta y edición.
- Tests: mapeo exacto, comportamiento de parada, `down()`, y specs actualizadas donde asertaban literales.

**Documentales**
- `docs/informes/INFORME-MOD12-UOM-DIAGNOSTICO-F5A-v1.0.md` — resultado del Paso 1: entorno declarado, valores por tenant, conteos, y veredicto explícito de si la migración puede completarse.
- `docs/informes/INFORME-MOD12-UOM-CATALOGO-F5A-v1.0.md` — ejecución, con G6, G6.5 y G7 **por separado** (ADR-069).

---

## 6. Criterios de aceptación

- **CA-F5A-01:** el diagnóstico previo está ejecutado, con entorno declarado sin ambigüedad, y su veredicto es explícito.
- **CA-F5A-02:** el catálogo canónico existe en `packages/shared` con dimensión por unidad; ningún módulo define lista propia.
- **CA-F5A-03:** la migración mapea solo por equivalencia exacta y **se detiene y reporta** ante cualquier valor no mapeable — probado con un caso deliberado.
- **CA-F5A-04:** ningún saldo ni movimiento histórico cambia — verificado por conteo antes y después.
- **CA-F5A-05:** `down()` de la migración probado, sin pérdida.
- **CA-F5A-06:** el alta y la edición seleccionan la unidad del catálogo; ya no se puede escribir texto libre.
- **CA-F5A-07:** **el factor de conversión sigue sin aplicarse** — esta fase no lo toca; verificar que `goods-receipt.service.ts` no cambió.
- **CA-F5A-08:** la migración puede detenerse en un tenant sin bloquear a los demás.

## 7. Criterio de stop/go

**Detenerse inmediatamente si:**
- Aparece un valor de unidad sin equivalencia exacta. **Esto no es un fallo: es el comportamiento esperado.** Reportar el valor, su tenant y su conteo, y escalar para decisión humana.
- No hay entorno con datos representativos para el diagnóstico. Decirlo y parar: normalizar a ciegas es peor que no normalizar.
- El trabajo empuja hacia aplicar el factor de conversión o hacia recalcular saldos.
- Un tenant tuviera unidades genuinamente propias e incompatibles — el ADR declara que eso reabriría la alternativa A (tabla por tenant) y **requiere volver al ADR**, no resolverse en ejecución.

**Documentar causa en:** el informe de diagnóstico o el de ejecución, §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión (protocolo §3).

## 8. Criterio de salida

- **Diagnóstico archivado** con veredicto explícito.
- **Backend:** `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/inventory-item.service.spec.ts` en verde, **con `Cached: 0`**.
- **Base de datos:** migración aplicada por tenant, `down()` probado, `pnpm --filter @iwana/db typecheck` en verde.
- **Saldos intactos:** conteo de `stock_ledger` y de saldos idéntico antes y después.
- **`goods-receipt.service.ts` sin cambios:** `git diff --stat` vacío en ese archivo.
- **Frontend:** specs del catálogo en verde, incluidas las que asertaban literales de unidad.
- **Calidad:** `pnpm --filter @iwana/portal typecheck && pnpm lint` en verde.
- **Gates:** G6, G6.5 y G7 registrados por separado (ADR-069).

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** catálogo del sistema, compartido por definición; datos en schema tenant. La migración corre por tenant y puede detenerse en uno sin bloquear al resto.
- **Seguridad:** sin cambio de superficie ni permisos nuevos. Sin PII.
- **Escala:** sustituye comparación de cadenas por comparación de códigos. Sin impacto.
- **Regulación:** sin impacto directo. La valoración sigue siendo **operativa, no contable ni fiscal** (ADR-059).
- **Riesgo residual asumido (ADR-085):** un tenant que ya compró en unidad de compra tiene saldos incorrectos **desde antes** de este ADR. Esta fase **no los arregla**: los congela y evita que sigan degradándose. Corregirlos exige inventario físico, no migración. **No presentar esta fase como si saneara el histórico.**
