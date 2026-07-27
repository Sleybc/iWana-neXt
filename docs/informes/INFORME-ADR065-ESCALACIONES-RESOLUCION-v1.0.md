# INFORME — Resolucion de escalaciones abiertas de ADR-065

**Version:** 1.2
**Estado:** Cerrado — 4 de 4 escalaciones resueltas en decision; E-1 pendiente de ejecucion (ADR-066)
**Fecha:** 2026-07-24
**Modo activo:** Orchestrator + Architect
**Autor:** AI-EM-ARCH
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (Aprobado CTO 2026-07-24)
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](../plans/2026-07-24-paginacion-numerada-adopcion.md)
**Plan de escalaciones:** [2026-07-24-escalaciones-abiertas-paginacion.md](../plans/2026-07-24-escalaciones-abiertas-paginacion.md)
**Clasificacion:** Uso interno
**Changelog v1.1 → v1.2 (2026-07-24):** alinea estado de E-1 / ADR-066 con la firma del CTO (Aprobado); declara supuestos no medidos (volumen DDL, p95 eventos); reformula «Ola 2 desbloqueada» como decision vs ejecucion. Cierra la contradiccion viva detectada en [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md) C-1…C-4.

---

## 1. Objetivo

Cerrar las cuatro escalaciones que ADR-065 dejo abiertas por caer fuera de su alcance de arquitectura. Dos son decisiones de plataforma/producto, dos son deuda detectada.

---

## 2. Decisiones tomadas

| Escalacion | Decision | Estado | Referencia |
|---|---|---|---|
| E-1 `runner.ts` y `CREATE INDEX CONCURRENTLY` | Extender runner con flag `transactional` (default true) para soportar `CREATE INDEX CONCURRENTLY`. Volumen **estimado** 1M+ filas en `stock_movements` / `audit_logs` (supuesto de escala objetivo; medicion diferida) | **ADR-066 Aprobado** por CTO (2026-07-24). Cerrada en **decision**; pendiente **ejecucion** en `runner.ts` / `revert.ts` | [ADR-066](../adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md) |
| E-2 `TasksTable` | **Feed.** PRD MOD11 usa "bandeja" y "cola operativa". Orden cronologico, «Cargar mas», sin busqueda por codigo ni multi-filtro. Conserva `PortalTablePagination` | **Cerrada** | PRD MOD11 §3, ADR-065 §Escalaciones |
| E-3 «todos» en `SeguimientoTab` | **Excepcion de preview por criterio** (cardinalidad acotada por modelo). p95 de eventos **no medido** — se adopta opcion 2 sin el dato que el plan exigia; revisar si el timeline crece | **Cerrada con reparo de evidencia** | ADR-065 §Excepciones, PRD MOD05 |
| E-4 pickers con soft-cap | **Plan propio.** Fuera del camino critico de ADR-065. P1 independiente | **Plan emitido** | [2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md) |

---

## 3. E-1: runner.ts y CREATE INDEX CONCURRENTLY — ADR-066 Aprobado

### Contexto

`packages/database/src/migrations/tenant/runner.ts:225` envuelve cada migracion en `queryRunner.startTransaction()`. PostgreSQL prohibe `CREATE INDEX CONCURRENTLY` dentro de una transaccion. La Ola 2 de ADR-065 necesita ~14 indices de paginacion mas los de orden.

### Evidencia recabada

- runner.ts: 345 lineas, 86 migraciones tenant (000-086), transaccion incondicional en linea 225.
- Cero uso de `CONCURRENTLY` en todo el historial de migraciones.
- No existe mecanismo para saltar la transaccion por migracion.
- **Supuesto (no medicion):** `stock_movements` y `audit_logs` alcanzan 1M+ filas por tenant en operadores maduros (escala objetivo del producto). La medicion de duracion de DDL sobre un tenant representativo (procedimiento del plan) **se diferio** a la ventana de ejecucion de la Ola 2; el CTO firmo ADR-066 sobre este supuesto.
- `inventory_items`: tabla de catalogo, baja cardinalidad (cientos a miles). Ya tiene 6+1 indices. No requiere `CONCURRENTLY`.
- `CREATE INDEX` bloqueante sobre 1M+ filas = decenas de segundos a minutos con tabla bloqueada para escritura. Inviable en operacion continua ISP **bajo el supuesto anterior**.

### Decision

**[DESEMPATE] Opcion B: flag `transactional` en migraciones + bifurcacion condicional en runner y revert.**

Se descarto la medicion previa de AI-PLAT-OPS **como prerequisito de firma**, no como trabajo cancelado: el supuesto de volumen ya era concluyente para el CTO. La medicion permanece como **verificacion en la ventana de Ola 2** (ver ADR-066 §Contexto).

Diseno aprobado:

- Flag `transactional = false` en la migracion (default `true`).
- Runner bifurca: camino transaccional (existente) vs camino no transaccional (DDL fuera de transaccion, bookkeeping en transaccion aparte).
- Idempotencia obligatoria (`IF NOT EXISTS` / `IF EXISTS`).
- Sin DML en migraciones no transaccionales.
- Mismo contrato en `revert.ts`.

### ADR

[ADR-066 — Migraciones No Transaccionales en Runner Multi-Tenant](../adrs/ADR-066-Migraciones-No-Transaccionales-Runner.md) (**Aprobado** por CTO, 2026-07-24).

### Precisión de cierre

E-1 esta **cerrada en decision** y **abierta en ejecucion**: `runner.ts:225` sigue con `startTransaction()` incondicional. La Ola 2 queda **desbloqueada en gobierno**; su **primer entregable** es implementar ADR-066 en `runner.ts` y `revert.ts` (AI-PLAT-OPS / AI-SR-FULL segun prompt de Ola 2). No iniciar indices de Ola 2 hasta ese entregable.

---

## 4. E-2: Clasificacion de TasksTable — CERRADA

### Contexto

`TasksTable.tsx` es el unico caso hibrido de ADR-065: si el orden por defecto es cronologico descendente → feed → "Cargar mas"; si es por codigo de OT o estado → directorio → paginas numeradas. La decision es del PRD, no del codigo.

### Evidencia recabada

- `ORDER BY` por defecto: `task.created_at DESC` (`tasks.service.ts` — verificado 2026-07-24). Sin parametros de orden expuestos.
- PRD MOD11 (v1.1, Aprobado 2026-06-24): Ejecucion Operativa / Tareas.
- HLD MOD11: "tabla densa como vista principal → drawer para detalle/timeline/handoff".
- UI: titulo "Bandeja de tareas", subtitulo "Cola operativa". Unico filtro expuesto: `status`.
- Solo se expone "Cargar mas" (`PortalTablePagination`). Sin navegacion numerada, sin busqueda por codigo, sin multi-filtro en UI.

### Decision

**[DESEMPATE] Feed.** TasksTable conserva «Cargar mas» (`PortalTablePagination`).

El PRD MOD11 define la tabla como **bandeja operativa** que el operador consume por orden cronologico, trabaja las tareas mas recientes, y las completa. El vocabulario del producto ("bandeja", "cola") y el patron de interaccion ("Cargar mas" + orden `created_at DESC`) confirman el patron feed.

No es un directorio: no hay busqueda por codigo de OT en la UI, no hay filtro por responsable, y el operador no necesita deep-link a una pagina arbitraria. Si en el futuro el producto require busqueda por codigo y navegacion numerada, se reconsidera en ese PRD.

**Registro:** en Ola 5, TasksTable **no migra** a `PortalTablePager`. Adopta el contrato de envelope unico pero conserva `PortalTablePagination` con `randomAccess: false`.

---

## 5. E-3: Opcion «todos» de SeguimientoTab — CERRADA CON REPARO

### Contexto

`SeguimientoTab.tsx` ofrece `timelinePageSize = 'all'` que materializa el conjunto completo en memoria. El **contrato DS** (`docs/specs/2026-07-24-paginacion-numerada-ds-contrato.md`) no contempla «todos»; ADR-064 §8 (vigente al momento del hallazgo) prohibe materializar listados sin cota.

### Evidencia recabada

- La timeline se construye en cliente fusionando 5 fuentes independientes.
- Page size por defecto: **5 entradas**. Opciones: [5, 10, 20, 50, 'all'].
- Volumen tipico por expediente: 5-15 eventos (moderado), 20-50+ (muy activo). El modelo de negocio acota naturalmente el volumen.
- **Supuesto (no medicion):** el p95 esta por debajo de 100 eventos por expediente. El plan exigia ese p95 antes de elegir; **no se midio**. El cierre adopta la opcion 2 **por criterio de dominio** (detalle de un registro singular, no directorio).
- Segun ADR-065, Ola 5: este paginador adopta `PortalTablePager`.

### Decision

**[DESEMPATE] Opcion 2: excepcion de preview por criterio** (no por p95 medido).

El SeguimientoTab es un **detalle de expediente**, no un directorio. El usuario consulta la historia completa de un registro singular, no navega un listado de entidades independientes. La cardinalidad esta naturalmente acotada por el modelo de negocio.

- **No se retira «todos»**: degradaria la experiencia de lectura del historial completo sin ganancia de seguridad.
- **No se pone cota dura**: el modelo acota naturalmente; una cota arbitraria (200) seria un numero magico sin fundamento en el dominio.
- **Se documenta en el modulo CRM** como "Timeline de expediente: vista de detalle, cardinalidad acotada por modelo. Conserva 'all' como pageSize maximo."
- **En Ola 5**: el paginador manual adopta `PortalTablePager` con el contrato estandar, conservando la opcion de pageSize maximo como comportamiento de detalle.
- **Reabrir si** el timeline crece (automatizaciones, importaciones masivas) o si una medicion futura muestra p95 ≥ 100.

---

## 6. E-4: Pickers con soft-cap silencioso

### Contexto

Los selectores dentro de modales cargan con `limit` fijo y truncan sin aviso. No es un problema de paginacion: la solucion es busqueda tipo-ahead contra el servidor, que es un patron distinto.

### Decision

Fuera del camino critico de ADR-065. Se emite plan independiente con responsables:

| Que | Quien | Entregable |
|---|---|---|
| Inventariar pickers + cardinalidad real | AI-SR-FULL | Lista de archivos y limites |
| Definir patron de picker con busqueda servidor | AI-PROD-UX | Spec UX de picker |
| Contratar el componente | AI-DS-OWNER | Contrato DS + receta |
| Exponer endpoints de lookup | AI-SR-FULL | Endpoints por modulo |
| Implementar y migrar | AI-FE-PLATFORM | PRs por modulo |

### Plan

[2026-07-24-pickers-softcap-remediacion.md](../plans/2026-07-24-pickers-softcap-remediacion.md)

---

## 7. Impacto en las olas

| Ola | Bloqueo | Estado |
|---|---|---|
| Ola 0 | — | Superada (ADR-065 aprobado; ADR-064 marcado superado) |
| Ola 1 | — | Desbloqueada en gobierno; **gate de auditoria = NO-GO** hasta remediacion (ver [INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0](INFORME-ADR065-OLA1-AUDITORIA-GATE-v1.0.md)) |
| Ola 2 | **E-1 ejecucion** | **Desbloqueada en decision** (ADR-066 Aprobado). Primer entregable = implementar flag `transactional` en `runner.ts` y `revert.ts`. No iniciar indices hasta ese entregable |
| Ola 3 | — | Desbloqueada (no depende de indices) |
| Ola 4 | — | Desbloqueada (suscriptores ya tiene backend) |
| Ola 5 | **E-2** (TasksTable), **E-3** (SeguimientoTab) | **Resueltas.** TasksTable = feed. SeguimientoTab = excepcion de preview por criterio |
| Ola 6 | **E-1 ejecucion** | Misma dependencia que Ola 2 |
| Ola 7 | — | Desbloqueada |

---

## 8. Actualizaciones cruzadas realizadas

| Documento | Ajuste |
|---|---|
| ADR-065 §Escalaciones / §18 | sortableFields = nombres logicos; `applySort` resuelve prefijo con `qb.alias` (Decision 2 del gate 2026-07-24) |
| ADR-066 | **Aprobado** CTO 2026-07-24. Supuesto de volumen declarado en §Contexto (v1.0 + nota) |
| Plan de escalaciones | E-1 cerrada en decision; Ola 2 desbloqueada en decision, no en ejecucion |
| Plan de pickers E-4 | `docs/plans/2026-07-24-pickers-softcap-remediacion.md` |
| Este informe | v1.2 alinea artefactos vigentes (cierra C-1 del gate) |

---

## 9. Checklist interno AI-EM-ARCH

- [x] Modo declarado: Orchestrator + Architect
- [x] Escalabilidad: E-1 evalua impacto en miles de tenants (supuesto declarado). E-3 acotado por modelo (criterio, no p95).
- [x] Seguridad: E-2 y E-3 no introducen superficies nuevas. E-4 mejora seguridad (elimina truncamiento silencioso).
- [x] Consistencia: un solo estado vigente de ADR-066 (Aprobado); sin artefactos contradictorios.
- [x] Impacto de negocio: E-1 es condicion para viabilidad tecnica de la Ola 2. E-2 define la experiencia del operador.
- [x] Delegacion clara: E-1 ejecucion → AI-PLAT-OPS / AI-SR-FULL (prompt Ola 2); E-2 → AI-PROD-UX; E-3 → AI-EM-ARCH; E-4 → plan propio.
- [x] Sin codigo ni diseno detallado generado.
- [x] Regulacion: sin impacto regulatorio en estas cuatro escalaciones.
