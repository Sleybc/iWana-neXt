# INFORME — MOD11 Operaciones · Auditoría de ejecución contra los artefactos de diseño

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-EM-ARCH (review arquitectónico de segunda capa, perfil §3.3)
**Objeto:** ejecución de las olas 1–5 contra la spec aprobada y los contratos congelados
**Método:** verificación **contra el código real en `main`** (HEAD `45d54c99`), no contra los informes de los agentes
**Artefactos de referencia:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) · contratos congelados del plan §2 · `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1

---

## 1. Veredicto

**La arquitectura original se cumplió.** No hay desviación estructural que exija rehacer trabajo, ningún requerimiento bloqueante omitido y ninguna falla de integración activa.

El hallazgo dominante no está en el código: **la spec v1.0 aprobada describe, en tres puntos, un estado que la implementación ya no tiene**, y nadie la versionó. Las tres divergencias están trazadas en consolidaciones de ola y son mejoras o correcciones legítimas — el defecto es que el artefacto normativo quedó atrás. Es exactamente lo que ADR-056 y el protocolo §9 persiguen: dos lecturas vigentes del mismo documento.

**Ajuste necesario: spec a v1.1**, con v1.0 marcada superada en el mismo acto.

## 2. Conformidad verificada (sin hallazgo)

| Requerimiento de diseño | Verificación en `main` |
| --- | --- |
| §4.1 — siete archivos de ruta | Los siete existen, con la jerarquía exacta |
| §4.1 — gate por sub-ruta, no por módulo | `PagePermissionGate` con `OPERATIONS_TASKS_READ` en `tasks/layout.tsx` y `OPERATIONS_EXECUTION_ORDERS_READ` en `execution-orders/layout.tsx`; el layout raíz **sin** gate, como se diseñó |
| §4.2 — `redirect()` 307, nunca 308 | `page.tsx:40` usa `redirect()`; cero apariciones de `permanentRedirect` |
| §4.3 — pestañas con `data-state` manual | `OperationsModuleTabs.tsx` compone shell + track + trigger píldora; **no** mezcla `portalTabActiveClassName`; `aria-current="page"` en la activa |
| §4.5 — monolito eliminado sin shim | `OperationsClient.tsx` ausente del disco |
| §4.5 — `ExecutionOrderDrawer` y `ExecutionOrderSummary` no se mueven | Último commit de `ExecutionOrderSummary.tsx` es `827d9407` (MOD12): MOD11 no lo tocó |
| §4.7.1 — `@Get()` antes de las rutas con `:id` | Línea 146, antes de `:id/evidences` (187) y `:id` (202) |
| §4.7.2 — `@ExecutionOrderTenantScoped()` obligatorio | Presente en 147, con el porqué documentado en 134 |
| §4.7.1 — `cursor` no expuesto | Declarado y justificado en el DTO (ADR-065 §10) |
| §4.7.1 — proyección sin N+1 | El servicio declara y respeta la prohibición de `getCompletion`/`getSyncState`/`getInventoryReconciliation` en el path del listado |
| §4.7.1 — `sortableFields` vacío | `[]` en las tres construcciones de `meta` |
| §4.7.3 — contrato congelado intacto | `execution-orders.ts` sin commits de MOD11 |
| §4.7.3 — re-export sin cambiar consumidores | Cero declaraciones locales de los nueve tipos; importados y re-exportados desde `@iwana/shared` |
| §4.6 — cierre no destructivo | `mergeUrlSearchParams` en los cinco puntos que retiran parámetro |
| §4.8 / CA-08 — fin del crawl | **Cero** `usersApi.list` en el módulo; 17 usos de `searchForPicker` (typeahead bajo demanda) |
| §4.9 — Sidebar sin tocar | Último commit `f9f42b33`, ajeno a MOD11 |
| §4.2 — emisores actualizados | Los tres apuntan a `/execution-orders` y `/tasks/new` |
| Deep link legado vivo | `?executionOrderId=` probado en el e2e de flujo de campo (dos casos) |
| ADR-066 — migración no transaccional | `transactional = false` + `CREATE/DROP INDEX CONCURRENTLY`, con nota de estado `INVALID` |
| CA-07 | `/tasks/new` importa solo `TaskIntakeClient`: no monta el árbol de OT |
| CA-11 | `audit-ui.mjs` re-ejecutado en esta auditoría: **sin hallazgos, exit 0** |

## 3. Desviaciones estructurales

Ninguna compromete la arquitectura. Las cuatro exigen ajuste **documental**, no de código.

### D-1 — `use-operational-users.ts` no existe *(media)*

**Diseño:** §4.5 lo lista entre los trece archivos del split; §4.8 describe su «memo a nivel de módulo de la promesa»; la directriz **D-A6** de la ola 2 añadió que ese memo debía invalidarse al cambiar de sesión, por higiene multi-tenant.

**Realidad:** el archivo no existe. F5 retiró el crawl por completo y lo sustituyó por `searchForPicker` bajo demanda, con lo que el hook de directorio quedó sin objeto — y con él, el riesgo que D-A6 mitigaba.

**Lectura:** es **mejor** que lo diseñado. Un typeahead bajo demanda no puede filtrar el directorio de un tenant a la sesión siguiente porque no hay directorio que memorizar. La consolidación de la ola 3 lo declaró como evidencia de CA-08, pero la spec nunca se corrigió.

**Ajuste:** en la spec v1.1, retirar el archivo de §4.5, reescribir §4.8 al mecanismo real y declarar **D-A6 sin objeto** con su razón. Sin esto, un lector futuro buscará un hook que no existe y podrá concluir que falta higiene multi-tenant.

### D-2 — Tres archivos no previstos por §4.5 *(baja)*

| Archivo | Origen trazado |
| --- | --- |
| `OperationsCreateTaskAction.tsx` | Veredicto **D2** de AI-PROD-UX (ola 1): «Crear tarea» es CTA del header, no pestaña |
| `OperationsUserPicker.tsx` | Directriz **D-P1** (ola 3): degradación visible del 403 para NOC/SUPPORT |
| `operations-table-pagination.ts` | Contrato de componente **H4 §4.1**: unión discriminada que hace imposible montar dos pies |

Ninguno es improvisación: los tres derivan de decisiones tomadas en gates y registradas. **Ajuste:** §4.5 de la spec v1.1 debe reflejar el conjunto real de archivos.

### D-3 — `TaskDetailDrawer.tsx` cambió, y la spec dice que no *(baja)*

**Diseño:** §4.6 afirma literalmente que «`TaskDetailDrawer.tsx` **no cambia**: sigue controlado por props; cambia únicamente quién calcula `open`».

**Realidad:** cambió en `5704e8df` (+18 / −2): se añadió `DialogClose` con botón de cierre visible de ≥44 px.

**Lectura:** el cambio es **PROD-UX #1**, uno de los siete bloqueantes de la ola 4 resueltos en la correctiva 4.1, y está trazado en el propio código con comentario que cita UX spec §8.2/§11.3. Está autorizado. El defecto es que contradice una afirmación literal de un artefacto aprobado que nadie marcó como superada.

**Ajuste:** corregir la frase de §4.6 en la v1.1, citando la resolución que la superó.

### D-4 — La referencia protegida del e2e se desplazó *(baja, trazabilidad)*

**Diseño y órdenes:** todas las órdenes de despacho protegen «las líneas 876 y 975» de `portal-field-flow-ticket-ot-inventory.spec.ts` como prueba del deep link legado.

**Realidad:** el deep link legado vive hoy en las líneas **949 y 1076**; se desplazó por eliminaciones anteriores en el archivo, ajenas a esas aserciones.

**Lectura:** **la regla se cumplió en sustancia** — el deep link legado sigue probado, dos veces. Pero la referencia por número de línea es frágil y ya es falsa.

**Ajuste:** citar por contenido (`gotoAuthedDashboard(... /dashboard/operations?executionOrderId=)`) y no por número de línea, en la spec y en cualquier orden futura.

## 4. Requerimientos omitidos

**Ninguno bloqueante.** Los cuatro candidatos son diferimientos con decisión explícita, no olvidos:

| Candidato | Estado real |
| --- | --- |
| Orden por columna (`sortableFields`) | **Vacío por diseño.** ADR-065 §22-bis declara la lista vacía como estado conforme; sin medición de p95 no hay tramo. No es omisión: es cumplimiento |
| Cuadrillas en el scoping | Diferido a **v2** por la directriz **D1**, con su razón: la membresía pertenece a WFM y `assertActorAccess` declara que no es inferible. El criterio de aceptación aplicado —ninguna fila listada da 404 al abrirse— se verificó |
| `executionOrderId` en `OperationalTaskRecord` | No implementado, con **veredicto explícito** de la directriz D-P2: ningún CA ni flujo lo exige, y no se inventó el campo en el frontend (anti-patrón ADR-068 respetado) |
| Enlace bandeja de tareas → OT | Consecuencia del anterior; registrado como mejora futura sujeta a cambio de contrato |

Los once criterios de aceptación de la spec §6 tienen test nombrado (matriz en `docs/quality/2026-09-13-mod11-operaciones-ola4-matriz-ca-test.md`). Esta auditoría re-verificó directamente CA-07, CA-08, CA-10 y CA-11.

## 5. Fallas de integración

**Ninguna activa.** Los cinco puntos donde este trabajo tocaba superficie ajena están sanos: contrato congelado intacto, emisores actualizados sin romper el legado, re-export sin cambio en consumidores, Sidebar sin tocar, e2e de flujo de campo con sus dos casos vivos.

**Un riesgo de integración no atribuible a MOD11**, señalado para el cierre: el push que habilitó G6.5 llevó a `main` tres tracks ajenos (Docker/PLAT-OPS, MOD12 picking, capturas). La corrida `d211f403` los incluye. G6.5 se decidió sobre jobs verdes, así que no hay contradicción — pero el SHA que acredita el merge readiness de MOD11 **no contiene solo MOD11**, y eso debe constar en el informe de cierre.

## 6. Ajustes necesarios

| # | Ajuste | Dueño | Esfuerzo |
| --- | --- | --- | --- |
| **1** | **Spec a v1.1**: §4.5 con el conjunto real de archivos (D-1, D-2), §4.8 con el mecanismo real del picker y D-A6 declarada sin objeto, §4.6 corregida (D-3), referencias del e2e por contenido (D-4). v1.0 marcada **superada** en el mismo acto | AI-EM-ARCH | S |
| **2** | Registrar en el informe de cierre que el SHA de G6.5 contiene tres tracks ajenos | AI-EM-ARCH | S |
| **3** | Actualizar los comentarios de cabecera de tablas y helper que citan el contrato **v1.0** (vigente: v1.1) | AI-FE-PLATFORM | S |

Ninguno exige rehacer implementación. El 1 y el 2 son míos y los ejecuto al abrir el expediente de cierre; el 3 es higiene de trazabilidad ya registrada como deuda HIGIENE en la ola 4.

## 7. Lo que esta auditoría no cubre

- **No re-ejecuté las suites de tests**: la evidencia de G6 y G6.5 está en sus consolidaciones con conteo real y `Cached: 0`. Esta auditoría verifica **estructura y conformidad de diseño**, no cobertura.
- **No audité los tres tracks ajenos** que viajaron en el mismo push: quedan fuera de este plan y de sus gates.
- **No evalúo G7**: sus condiciones son de plataforma y arrastran la deuda transversal del plan §13.4.
