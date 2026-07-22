# ADR-060: Control de bajas, consultas operativas y ratificación de esquema MOD12

**Version:** 1.0
**Estado:** ✅ Aprobado
**Aprobado por:** CTO Humano (2026-07-21)
**Fecha:** 2026-07-21
**Fecha de aprobación CTO:** 2026-07-21
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM
**Auditoría de origen:** docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md (hallazgos N1, N2, N3)
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
**Spec de diseño:** docs/specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md (**EJECUTABLE**)

---

## Contexto

La auditoría de estado del 2026-07-21, verificada contra código, encontró tres asuntos que deben resolverse antes de cerrar MOD12 como módulo (ADR-016). Dos son decisiones de arquitectura y uno es un vacío de gobierno:

**1. La aprobación de bajas está abierta a tres roles.** La Fase H3 entregó el documento de baja con segregación de funciones real (`assertApproverDistinct` en `write-off.service.ts:98`: el aprobador no puede ser el solicitante). Pero `POST /inventory/write-offs/:id/approve` y `/reject` llevan `@Roles(ADMIN, NOC, SUPPORT)` — los mismos roles que solicitan. Un usuario SUPPORT puede aprobar la baja pedida por otro SUPPORT.

Esto es inconsistente con el criterio que el propio módulo ya fijó: el PRD de Existencias (decisión D2) reserva los **ajustes de inventario a ADMIN** por ser «la única operación que altera saldo sin documento origen». Una baja no solo altera el saldo: destruye valor de forma definitiva y es la operación con mayor exposición a fraude interno del módulo. Tener un control más débil que el de un ajuste es una inversión de la relación riesgo/control.

**2. Las alertas de vida útil cargan el tenant completo en memoria.** `SerializedAssetService.listUsefulLifeAlerts` ejecuta `find(SerializedAsset, { where: { tenantId } })` sin predicado ni límite, resuelve los ítems relacionados y luego filtra y pagina en JavaScript. Además **no excluye estados terminales**, de modo que activos ya dados de baja, vendidos o perdidos aparecen como alertas de vida útil vigentes.

Es un defecto doble: funcional (ruido operativo que degrada el panel — se alerta sobre equipos que ya no existen para la operación) y de escala (RNF-INV-08 exige consultas tenant-aware apoyadas en índices; la escala objetivo declarada es de cientos de miles de activos por tenant).

**3. Tres fases con cambio de esquema cerraron sin ADR.** Las fases H3 y H4 introdujeron las migraciones tenant **081** (`stock_movement_id` en `asset_lifecycle_events`, índice único parcial de idempotencia en `asset_loan_assignments`) y **082** (extensión del payload de `inventory_write_offs`), y cambiaron el comportamiento observable de un endpoint existente: `POST /inventory/write-offs` pasó de aplicar el movimiento al ledger de inmediato a crear un documento en `PENDING_APPROVAL`.

El precedente del módulo es inequívoco: ADR-054 por el modelo de conteo físico, ADR-055 por el invariante de reservas y ADR-059 por **una sola columna** (`average_cost`). El ADR es el instrumento por el cual el CTO aprueba un cambio de esquema o de contrato; tres fases llegaron a estado cerrado sin él. Este ADR corrige ese vacío de forma consolidada en lugar de emitir tres ADR retroactivos separados.

---

## Decision

### D-060-1 — La aprobación y el rechazo de bajas son exclusivos de ADMIN

`POST /inventory/write-offs/:id/approve` y `POST /inventory/write-offs/:id/reject` pasan a `@Roles(UserRole.ADMIN)`.

La **solicitud** (`POST /inventory/write-offs`) y las consultas (`GET /write-offs`, `GET /write-offs/:id`) conservan `ADMIN, NOC, SUPPORT`: quien detecta el daño o la pérdida en campo debe poder documentarlo; lo que se restringe es la decisión que consume inventario.

La segregación de funciones vigente (aprobador ≠ solicitante) **se mantiene y no se relaja para ADMIN**: un ADMIN que solicita una baja necesita a otro ADMIN para aprobarla. En un tenant con un único usuario ADMIN esto bloquea el flujo por diseño; es el comportamiento correcto para un control interno y se documenta como tal en el runbook, no se soluciona con una excepción en código.

### D-060-2 — Las consultas de alerta operativa se resuelven en SQL, nunca en memoria

`listUsefulLifeAlerts` se reescribe para que Postgres haga el trabajo:

- Predicado de vencimiento calculado en SQL sobre `purchase_date + useful_life_months * INTERVAL '1 month'`, comparado contra la fecha de referencia y el umbral de «por vencer» (3 meses, umbral vigente de `calculateUsefulLife`).
- Exclusión de estados terminales: `WRITTEN_OFF`, `LOST`, `SOLD`. Un activo que salió de la operación no genera alertas de vida útil.
- Exclusión de filas sin datos suficientes (`purchase_date IS NULL` o `useful_life_months IS NULL`), que hoy se descartan igualmente pero después de traerlas.
- `COUNT` y `LIMIT/OFFSET` en la consulta, no `Array.slice`.

**Regla normativa derivada, aplicable a todo MOD12 y a los módulos que lo tomen como referencia:** ninguna consulta de listado puede cargar el conjunto completo de una entidad del tenant para filtrarlo o paginarlo en memoria. El filtro y la paginación viven en SQL. Esta regla es verificable en revisión de código y su incumplimiento es motivo de bloqueo en G5.

El umbral de 3 meses permanece **en el servidor y en un solo lugar**: la reescritura no puede duplicar el criterio de `calculateUsefulLife` en SQL sin dejar constancia; si la fórmula se expresa en SQL, el helper deja de ser la fuente de verdad para el listado y ambos deben cubrirse con el mismo caso de prueba.

### D-060-3 — Ratificación retroactiva de las migraciones 081 y 082 y del contrato de bajas

Se ratifican como decisiones de arquitectura aprobadas:

| Cambio | Fase | Ratificación |
| --- | --- | --- |
| Migración tenant **081** — `asset_lifecycle_events.stock_movement_id` (FK + índice parcial) e índice único parcial `uq_asset_loan_assignments_tenant_movement` | Remediación Fase 05 | Cierra la limitación declarada en el PRD de Activos §9 (timeline sin enlace al ledger) y endurece la idempotencia del comodato a nivel de base, no solo de servicio |
| Migración tenant **082** — payload operativo en `inventory_write_offs` (`location_id`, `quantity`, `idempotency_key`, campos de rechazo) | H3 | Necesaria para congelar la intención de la baja entre la solicitud y la aprobación; sin ella el documento no podría reconstruir el movimiento |
| Cambio de contrato de `POST /inventory/write-offs` — de aplicar al ledger a crear documento `PENDING_APPROVAL` | H3 | Es el cambio que cierra el agujero de control interno RF-INV-19; se ratifica como comportamiento correcto y definitivo |

Ambas migraciones están registradas en `runner.ts` y verificadas contra base real. **No se emite migración nueva en la fase H6.**

### D-060-4 — Sin backfill

Se ratifica que no habrá reconstrucción retroactiva de datos: los comodatos anteriores a la Fase 5B y las bajas anteriores a H3 permanecen únicamente como asientos del ledger. Inventar documentos para hechos pasados produciría trazabilidad falsa con apariencia de auditable, que es peor que la ausencia declarada.

---

## Impacto

| Eje | Declaración |
| --- | --- |
| **Multi-tenant** | Sin cambio de estrategia. D-060-2 refuerza el patrón vigente: consulta tenant-aware con `runInTenantSchema` y filtro por `tenant_id` dentro del SQL. |
| **Seguridad** | D-060-1 **endurece** el control interno más sensible del módulo. Reduce el conjunto de usuarios que pueden consumir inventario sin contrapartida, de tres roles a uno, manteniendo la segregación de funciones. Es un cambio restrictivo: no amplía superficie. |
| **Escala** | D-060-2 elimina el único punto conocido de carga O(n) por tenant en MOD12. Con cientos de miles de activos, la diferencia es entre una consulta indexada y traer la tabla a memoria en cada apertura del panel. |
| **Regulación** | Sin impacto directo. La baja de inventario tiene efecto contable/fiscal potencial (DIAN) que **no** se declara cubierto — **requiere verificación con fuente oficial** si en el futuro la baja debe generar soporte tributario. |
| **Compatibilidad** | D-060-1 es *breaking* para clientes NOC/SUPPORT que hoy aprueban: pasarán a recibir 403. Es intencional. Debe reflejarse en el portal ocultando la acción por rol y en el runbook. |

---

## Alternativas descartadas

1. **Dejar la aprobación en los tres roles y confiar en la auditoría.** Descartada: el registro posterior detecta, no previene, y la baja es irreversible en el saldo. El módulo ya decidió lo contrario para una operación de menor impacto (ajustes, D2 de Existencias).
2. **Permitir que un ADMIN único apruebe su propia baja cuando el tenant no tenga un segundo ADMIN.** Descartada: convierte el control en opcional justo en los tenants pequeños, que son la mayoría. Se resuelve en operación (designar un segundo aprobador), no en código.
3. **Materializar las alertas de vida útil en una tabla mantenida por job.** Descartada para este alcance: añade migración, job y riesgo de desincronización para un cálculo que Postgres resuelve con un predicado sobre columnas ya indexables. Reconsiderable si se agregan alertas con notificación push (fuera de MVP).
4. **Emitir tres ADR retroactivos separados (081, 082, contrato de bajas).** Descartada: fragmenta una misma decisión de cierre y multiplica gates sin añadir información. Se consolidan aquí con trazabilidad por fase.

---

## Consecuencias

**Positivas**
- MOD12 puede cerrarse sin deuda alta abierta ni cambios de esquema sin aprobación.
- Queda una regla normativa reutilizable contra el patrón «cargar todo y filtrar en memoria».
- El control de bajas queda alineado con el criterio de riesgo del propio módulo.

**Negativas / costos aceptados**
- Los tenants con un solo ADMIN no podrán completar bajas hasta designar un segundo. Es el costo del control y se documenta en el runbook de cierre.
- Reescribir el predicado de vida útil en SQL introduce un segundo lugar donde vive el umbral de 3 meses; se mitiga con cobertura de prueba compartida (D-060-2).

---

## Requiere ADR: —  ·  Requiere CTO: **Sí — obtenido**

**Aprobado por el CTO el 2026-07-21.** Quedan ratificadas las migraciones 081 y 082 y el cambio de contrato de `POST /inventory/write-offs`, y adoptadas las decisiones D-060-1 (aprobación de bajas exclusiva de ADMIN, sin relajar la segregación de funciones), D-060-2 (consultas de listado resueltas en SQL, con la regla normativa contra el patrón de carga en memoria) y D-060-4 (sin backfill).

La fase H6 queda **EJECUTABLE**: `docs/prompts/PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md`.
