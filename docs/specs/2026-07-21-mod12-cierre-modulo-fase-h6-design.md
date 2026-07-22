# SPEC — MOD12 · Cierre de módulo: control de bajas, alertas en SQL y evidencia E2E — Fase H6

**Versión:** 1.0
**Estado:** Diseño en remediación H6-R1 — **G7 NO-GO 2026-07-21** (enmiendas D-H6-5 / CA-H6-06 / CA-H6-07)
**Fecha:** 2026-07-21
**Módulo:** MOD12 Inventario / SCM
**Autor:** AI-EM-ARCH
**ADR:** [ADR-060](../adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md) (**Aprobado CTO 2026-07-21**)
**Auditoría de origen:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (N1, N2, N3, H6)
**Prompt:** [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md) (**EJECUTABLE**)

## 1. Problema

MOD12 tiene los 22 RF MVP construidos, pero no puede declararse cerrado: la aprobación de bajas es más laxa que la de un ajuste, el panel de alertas de vida útil carga el tenant completo y alerta sobre equipos que ya no existen, hay dos migraciones sin ADR, y la suite E2E propia del módulo arrastra 11 fallos declarados «preexistentes» que nadie ha verificado desde la Fase 05.

## 2. Objetivo

Dejar MOD12 en condiciones de emitir su informe de cierre de módulo (ADR-016): sin deuda alta abierta, sin cambios de esquema sin aprobación y con la suite E2E propia en verde o con sus fallos atribuidos con evidencia.

## 3. Decisiones de diseño (D-H6)

| ID | Decisión | Justificación |
| --- | --- | --- |
| **D-H6-1** | `approve` y `reject` de bajas pasan a `@Roles(UserRole.ADMIN)`. Solicitud y consultas conservan ADMIN/NOC/SUPPORT. | ADR-060 D-060-1. Quien detecta en campo documenta; quien consume inventario decide. |
| **D-H6-2** | La segregación aprobador ≠ solicitante **no se relaja**, tampoco para ADMIN. | Un control que se desactiva cuando estorba no es un control. El caso «tenant con un solo ADMIN» se resuelve designando un segundo, y se documenta en el runbook. |
| **D-H6-3** | El portal oculta las acciones Aprobar y Rechazar cuando el usuario no es ADMIN, con el mismo patrón de gateo por rol ya usado en `canAdjustStock` (Existencias F3A). | Evita que el usuario descubra el permiso por un 403. El API sigue siendo la autoridad: el gateo de UI no sustituye el `@Roles`. |
| **D-H6-4** | `listUsefulLifeAlerts` se reescribe con QueryBuilder: predicado de vencimiento en SQL, exclusión de `WRITTEN_OFF`/`LOST`/`SOLD`, exclusión de filas sin `purchase_date` o sin `useful_life_months`, `COUNT` y `LIMIT/OFFSET` en la consulta. | ADR-060 D-060-2. Elimina la carga O(n) y el ruido de alertas sobre activos fuera de operación. |
| **D-H6-5** | Semántica de vida útil **día-exacta** (enmienda G7 2026-07-21). Fecha de vencimiento = `purchase_date + useful_life_months` (alineada a `date + INTERVAL` de PostgreSQL). `calculateUsefulLife` deriva `monthsRemaining` / estado desde esa fecha; es la **única** fuente de clasificación. El predicado SQL de alertas usa la misma expresión indexable y **debe** coincidir con el helper. CA-H6-06 se verifica **contra Postgres real** (patrón EV-1), con bordes en días 1, 28, 29, 30 y 31 — no basta un espejo TypeScript del predicado ni acotar a día 1. | Evita divergencia helper↔SQL (falsos negativos en el panel). Sin ADR nuevo: corrección de lógica dentro del diseño aprobado. |
| **D-H6-6** | El shape de la respuesta de alertas **no cambia**: `{ data, total, page, pageSize, limit }` con los mismos campos por fila. | El panel del portal ya lo consume; la fase es correctiva, no de contrato. |
| **D-H6-7** | Sin migración. Si el predicado exige un índice nuevo para rendir, **se detiene y escala**: eso abre gate de ADR propio. | Coherente con el criterio aplicado en las fases 5A/5B. |
| **D-H6-8** | Los 11 E2E rojos de compras/RFQ se **resuelven o se atribuyen con evidencia**. Atribuir significa: causa raíz identificada, módulo responsable, y registro como deuda con dueño; no basta con «preexistente» ni con «ajeno» sin causa. | Es la condición que impide cerrar el módulo con calidad no declarada. |
| **D-H6-9** | El informe de cierre de módulo se emite **después** de que los gates queden verdes, e incluye deuda declarada, limitaciones conocidas y estado de despliegue. | Perfil §7: el informe de cierre exige evidencia funcional, de calidad y de despliegue. Nada de MOD12 se ha desplegado: eso debe decirse, no omitirse. |

## 4. Alcance

**Entra**

- RBAC de `approve`/`reject` de bajas (API) + gateo de UI por rol (portal).
- Reescritura de `listUsefulLifeAlerts` a SQL con exclusión de estados terminales.
- Tests: RBAC por rol, bordes de clasificación SQL↔helper, exclusión de terminales, paginación en servidor.
- Triaje de los 11 E2E de compras/RFQ.
- Informe de cierre de módulo MOD12.

**No entra**

- Migraciones, índices nuevos, materialización de alertas.
- Notificaciones push de `StockLow` y consumidor Billing de `inventory.asset-sold` (fuera de MVP, dependen de otro módulo).
- RF-ACT-13 (fecha esperada de recuperación del comodato).
- RF-INV-24 y RF-INV-25 (Fase 2 del PRD padre).
- Backfill de comodatos o bajas históricas (ADR-060 D-060-4).

## 5. Contrato

Sin cambios de shape. Cambios observables:

| Ruta | Cambio |
| --- | --- |
| `POST /inventory/write-offs/:id/approve` | 403 para NOC y SUPPORT (antes 201) |
| `POST /inventory/write-offs/:id/reject` | 403 para NOC y SUPPORT (antes 201) |
| `GET /inventory/assets/useful-life-alerts` | Deja de incluir activos en estado `WRITTEN_OFF`, `LOST` o `SOLD`. `total` refleja el conteo real filtrado en SQL. |

## 6. Criterios de aceptación

- **CA-H6-01:** un usuario NOC o SUPPORT recibe 403 al aprobar o rechazar una baja; un ADMIN distinto del solicitante la aprueba correctamente.
- **CA-H6-02:** un ADMIN que solicitó la baja recibe 400 al intentar aprobarla él mismo (comportamiento vigente, ahora cubierto por test explícito).
- **CA-H6-03:** el portal no muestra Aprobar/Rechazar a usuarios no ADMIN.
- **CA-H6-04:** un activo con vida útil vencida y estado `WRITTEN_OFF`, `LOST` o `SOLD` **no** aparece en las alertas.
- **CA-H6-05:** con N activos en el tenant, la consulta de alertas devuelve como máximo `pageSize` filas desde SQL; `total` es un `COUNT` de la consulta, no la longitud de un arreglo en memoria.
- **CA-H6-06:** SQL (Postgres real) y `calculateUsefulLife` clasifican igual los bordes sin dato / vigente / por vencer / vencida, incluyendo fechas de compra en días **1, 28, 29, 30 y 31** (EV-1). Un espejo TypeScript del predicado **no** satisface este CA.
- **CA-H6-07 (enmienda G7 2026-07-21):** la suite E2E **propia de MOD12** (`e2e/tests/portal-inventory-scm.spec.ts`, cluster compras/RFQ/proveedores/comodato/inventario del spec) queda en verde, o cada fallo de ese alcance tiene causa raíz, módulo responsable y deuda con dueño. Los fallos del resto de la suite portal (~29: WFM, settings, comercial, …) **quedan fuera de CA-H6-07** y se registran como **deuda cross-módulo con dueño** en el informe de remediación — no como «ajenos» sin atribución.
- **CA-H6-08:** gates completos en verde: Jest API inventario (incluidas las suites EV-1 con `EV1_REAL_DB=1`), Jest portal inventario, lint y typecheck. La evidencia E2E de CA-H6-07 debe ser **reproducible** por un verificador distinto del productor (Chromium instalado).

### Addendum G7 NO-GO (2026-07-21)

Veredicto **NO-GO** documentado en [INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md](../informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-G5-G6-G7-v1.0.md) v1.2. Remediación: [PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md](../prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md).

## 7. Impacto declarado

| Eje | Declaración |
| --- | --- |
| Multi-tenant | Sin cambio. La consulta reescrita mantiene `runInTenantSchema` y `tenant_id` dentro del SQL; se exige prueba de aislamiento sobre la ruta de alertas. |
| Seguridad | Cambio **restrictivo** de RBAC; no amplía superficie. Sin PII nueva. |
| Escala | Elimina el único punto conocido de carga O(n) por tenant del módulo. |
| Regulación | Sin impacto. El posible efecto DIAN de la baja sigue marcado «requiere verificación con fuente oficial». |

## 8. Riesgo principal

Que el triaje de los 11 E2E destape un defecto real en compras y la fase se desborde. Mitigación: el triaje es **primero**, antes de tocar RBAC y alertas; si aparece un defecto funcional de compras, se detiene y se escala a AI-EM-ARCH para decidir si abre fase propia en vez de absorberlo aquí.
