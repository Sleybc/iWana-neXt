# Plan — Resolución de escalaciones abiertas de ADR-065

**Fecha:** 2026-07-24
**Orquestador:** AI-EM-ARCH (modo Orchestrator)
**ADR:** [ADR-065](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (Aprobado CTO 2026-07-24)
**Plan padre:** [2026-07-24-paginacion-numerada-adopcion.md](2026-07-24-paginacion-numerada-adopcion.md)

Cuatro decisiones quedaron fuera del ADR porque no eran suyas: dos son de plataforma o de producto, y dos son deuda que el ADR detectó pero no gobierna. **E-1…E-3 cerradas** (E-1 también en ejecución del runner). **E-4 en curso** (fuera del camino crítico). Ola 2 desbloqueada; Ola 5 desbloqueada respecto a E-2 (TasksTable = feed).

---

## E-1 · `runner.ts` y `CREATE INDEX CONCURRENTLY` — bloquea la Ola 2

**Problema.** `packages/database/src/migrations/tenant/runner.ts` (ADR-066: flag `transactional`) — `CREATE INDEX CONCURRENTLY` no puede ejecutarse dentro de una transacción. La migración **`089_*`** necesita ~14 índices de paginación más los de orden, sobre tablas que en tenants maduros superan el millón de filas.

**Quién decide:** AI-PLAT-OPS propone, AI-EM-ARCH aprueba el patrón, **CTO aprueba si se toca el runner** (es infraestructura multi-tenant compartida).

**Cómo resolverlo:**

1. AI-PLAT-OPS mide, sobre un tenant representativo, cuánto dura un `CREATE INDEX` bloqueante en las tablas grandes (`stock_movements`, `audit_logs`, `inventory_items`). Ese número decide, no la preferencia.
2. Se elige entre dos patrones, no tres: **(i)** índice bloqueante con ventana de mantenimiento para las tablas pequeñas; **(ii)** modo no transaccional por migración en el runner, para las append-only grandes.
3. Si la medición confirma que (i) sirve para todo, **no se toca el runner** — es la salida barata y hay que descartarla explícitamente antes de tocar infraestructura compartida.
4. Si hace falta (ii), sale **ADR hermano**: cambia el contrato de ejecución de migraciones de todos los tenants, y eso no entra por la puerta de atrás de una migración de índices.

**Entregable:** decisión registrada con la medición que la sostiene + ADR hermano si aplica.
**Fecha límite:** antes de que la Ola 1 cierre, para no dejar la Ola 2 esperando.

---

## E-2 · Clasificación de `TasksTable` — bloquea la Ola 5

**Problema.** `apps/portal/src/components/operations/TasksTable.tsx` es el único caso híbrido: por la regla de clasificación de la spec UX, si el orden por defecto es cronológico descendente es un feed y conserva «Cargar más»; si es por código de OT o por estado, es un directorio y adopta páginas numeradas.

**Quién decide:** el **PRD del módulo de operaciones**, no el criterio del implementador. AI-PROD-UX lo instruye contra ese PRD; AI-EM-ARCH lo ratifica.

**Cómo resolverlo:**

1. Leer el `ORDER BY` por defecto real de `tasks/services/tasks.service.ts:219` — hoy es `created_at DESC`, lo que apunta a feed.
2. Contrastarlo con el PRD: ¿el operador usa esa tabla como **bandeja que se vacía** (feed) o como **directorio de órdenes de trabajo** que consulta por código y estado (directorio)? La respuesta está en el caso de uso, no en el código.
3. Si el PRD dice directorio y el código ordena por fecha, **el defecto es el orden por defecto**, no la clasificación: se corrige el `ORDER BY` y se clasifica como directorio.

**Entregable:** una línea en el informe vivo con la clasificación y el PRD que la sostiene.
**Fecha límite:** antes de la Ola 5.

---

## E-3 · La opción «todos» de `SeguimientoTab` — no bloquea, pero no se porta a ciegas

**Problema.** `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx:246-249` ofrece un tamaño de página «todos» que materializa el conjunto completo en memoria. `PORTAL_PAGE_SIZE_OPTIONS` no lo contempla, y ADR-064 §8 —**que sigue vigente**— prohíbe materializar listados sin cota.

**Quién decide:** AI-PROD-UX propone, AI-EM-ARCH resuelve. No es una decisión de implementación.

**Cómo resolverlo:** son tres salidas y hay que elegir una, no dejarlo al criterio de quien migre:

1. **Retirar «todos»** y adoptar `PortalTablePager` con las opciones estándar. Es lo coherente con la norma; el coste es que quien usaba «todos» para leer el expediente completo de un vistazo pierde esa lectura.
2. **Documentar el timeline como excepción de preview** y dejarlo como está, si el volumen real por expediente es acotado y conocido. Exige un número: cuántos eventos tiene el expediente del percentil 95.
3. **Conservar «todos» con cota dura** (por ejemplo 200) y un aviso cuando se trunca. Es el término medio, y el único que preserva la lectura completa sin violar §8.

**Recomendación:** la 2 si el percentil 95 está por debajo de 100 eventos; la 3 si no. La 1 solo si el timeline resulta crecer sin techo.
**Entregable:** decisión + nota en el módulo. **Dato necesario primero:** distribución real de eventos por expediente.

---

## E-4 · Pickers con soft-cap silencioso — deuda P1 independiente

**Problema.** Los selectores dentro de modales cargan con `limit` fijo (p. ej. `AssuranceClient.tsx` con `limit: 100`) y **truncan sin decirlo y sin ofrecer avance**. Si el tenant tiene 300 usuarios, el operador simplemente no ve 200 de ellos y no hay ninguna señal.

**Por qué no lo arregla ADR-065:** ninguna variante de paginación sirve aquí. Un picker no lleva pie de paginación; la solución es **búsqueda tipo-ahead contra el servidor**, que es un patrón distinto.

**Quién decide:** AI-PROD-UX define el patrón de picker con búsqueda; AI-DS-OWNER contrata el componente; AI-SR-FULL expone los endpoints de lookup.

**Cómo resolverlo:**

1. Inventariar los pickers con soft-cap y su cardinalidad real por tenant — el riesgo es proporcional a cuántos tenants superan el cap.
2. Definir el patrón único de picker con búsqueda servidor (ya existen `crm/subscribers/search` y `purchasing/suppliers/lookup` como precedente: son lookups, no listados).
3. Migrar por módulo.

**Entregable:** plan propio con su ADR si el patrón de picker no está cubierto por una decisión previa.
**Prioridad:** P1, pero **fuera del camino crítico** de ADR-065. No se declara resuelto por esta ola.

---

## Resumen de bloqueos

| Escalación | Bloquea | Decide | Estado |
| --- | --- | --- | --- |
| E-1 `runner.ts` | **Ola 2** | CTO (ADR-066 Aprobado 2026-07-24) | **Cerrada** — runner ADR-066 + migración **089** aplicada/reversible ([INFORME-ADR065-OLA2-INDICES-v1.0](../informes/INFORME-ADR065-OLA2-INDICES-v1.0.md)); deuda: p95 + poblar `sortableFields` + R-5 |
| E-2 `TasksTable` | **Ola 5** | PRD de operaciones | **Cerrada** 2026-07-24 — Feed. PRD MOD11 confirma bandeja operativa cronológica. Conserva «Cargar más» |
| E-3 «todos» | — | AI-PROD-UX → AI-EM-ARCH | **Cerrada con reparo** 2026-07-24 — Excepción de preview **por criterio** (p95 no medido; reabrir si el timeline crece) |
| E-4 pickers | Nada | AI-PROD-UX + AI-DS-OWNER | **GO-CON-DEUDA** 2026-07-25 — F5A+B hechas ([B](../informes/INFORME-E4-PICKERS-FASE5-OLEADA-B-v1.0.md)); residual: categorías + producto comercial embebido (sin search F4); medición p95 pendiente de entorno |

Resolución completa en [INFORME-ADR065-ESCALACIONES-RESOLUCION-v1.0.md](../informes/INFORME-ADR065-ESCALACIONES-RESOLUCION-v1.0.md) (**v1.2**).

**E-1…E-3 cerradas.** **Ola 2 en curso** (índices 089). **E-4 en curso** (plan pickers). Olas 3–7 ADR-065 en cola/paralelo según [kickoff](../informes/INFORME-ADR065-KICKOFF-OLAS-RESTANTES-v1.0.md).
