# PRD — MOD12 Inventario / Submódulo Bajas con aprobación

**Version:** 1.0  
**Estado:** ✅ **MVP cerrado** — G5+G6+G7 GO recomendado (2026-07-21)  
**Fecha:** 2026-07-21  
**Modo activo:** Product Architect + Orchestrator  
**Autor:** AI-EM-ARCH  
**Clasificación:** Confidencial — Uso interno  
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](PRD-MOD12-INVENTARIO-SCM-v1.0.md)  
**ADR relacionado:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) — **no se requiere ADR nuevo** salvo que la implementación exija columnas no previstas (ver §9)  
**Auditoría de origen:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (hallazgo **H3**, único Alto abierto)  
**Spec de diseño:** [2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md](../specs/2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md)

---

## 1. Contexto y motivación

Tras cerrar Activos y comodato (5A+5B), el **único hallazgo Alto abierto** de MOD12 es **H3**. El flujo de baja **funciona** — `POST /inventory/write-offs` invoca `StockLedgerService.recordWriteOff`, descuenta stock, transiciona activos serializados, cierra comodatos abiertos y deja rastro en auditoría — pero **no cumple RF-INV-19** porque:

- La tabla `inventory_write_offs` existe desde la migración 047 y la entidad está registrada en `InventoryModule`, pero **nunca se escribe**.
- `WriteOffStatus` define `REQUESTED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `COMPLETED` sin transiciones ni endpoints.
- Un ADMIN puede destruir valor de inventario sin documento de baja ni segundo par de ojos.

**Clasificación:** control interno, no gap funcional del movimiento en sí. El mitigante vigente (ledger inmutable + `AuditInterceptor`) no sustituye el documento ni la aprobación.

## 2. Alcance

### Declaración de arranque

> **Fase siguiente de MOD12: H3 — Bajas con aprobación.**  
> Prompt: [`PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md`](../prompts/PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md) — **EJECUTABLE** al aprobar este PRD.  
> Agentes: **AI-SR-FULL** (backend, líder) + **AI-FE-PLATFORM** (portal).  
> **H4** (vida útil + `StockLow`) y **H5** (pestañas legacy) quedan **después** de H3.

### En scope

- **Documento de baja** persistido en `inventory_write_offs` con payload operativo (ítem/activo, bodega, cantidad, motivo, notas/evidencia mínima).
- **Máquina de estados** sobre `WriteOffStatus` con separación **solicitud → aprobación → aplicación al ledger**.
- **Aplicación al ledger solo en aprobación**, reutilizando `recordWriteOff` (o variante `*WithManager`) en la misma transacción que cierra el documento (`stock_movement_id`, `COMPLETED`).
- **Endpoints** de solicitud, listado, detalle, aprobación y rechazo.
- **Separación de funciones:** el aprobador no puede ser el mismo usuario que solicitó (salvo escalación documentada como deuda si el tenant solo tiene un ADMIN).
- **Portal:** flujo de solicitud + bandeja de pendientes de aprobación; la pestaña **Bajas** deja de aplicar al ledger directamente.
- **Compatibilidad comodato:** la baja aprobada mantiene el cierre de comodato y las reglas de `resolveWriteOffAssetStatus` (`LOST`/`STOLEN` → `LOST`; resto → `WRITTEN_OFF`); desde `INSTALLED_COMODATO` solo `LOST`/`STOLEN` (salvedad RF-ACT-09 / B2).

### Fuera de scope

- Rediseño completo de pestañas legacy Movimientos/Bajas (**H5**).
- Alertas de vida útil, jobs BullMQ, evento `StockLow` (**H4**).
- Adjuntos multimedia / object storage para evidencia (solo `notes` + motivo tipificado en MVP).
- Notificaciones push/email al aprobador.
- Backfill de bajas históricas aplicadas antes de H3 (quedan solo en ledger; declarar limitación).
- Integración contable/fiscal DIAN (verificar con fuente oficial en fase futura).

## 3. Personas y casos de uso

| Persona | Rol | Necesidad |
| --- | --- | --- |
| Almacenista | ADMIN | Solicitar baja de consumible dañado/vencido con motivo y notas |
| Responsable de operaciones | ADMIN / NOC | Revisar solicitudes pendientes y aprobar o rechazar |
| Auditor interno | ADMIN | Listar bajas completadas con solicitante, aprobador, movimiento y motivo |
| Soporte | NOC / SUPPORT | Consultar estado de una solicitud de baja (solo lectura) |

| CU | Actor | Descripción |
| --- | --- | --- |
| CU-WO-01 | Almacenista | Crear solicitud de baja (consumible o activo serializado) |
| CU-WO-02 | Aprobador | Aprobar solicitud → se aplica ledger y queda `COMPLETED` |
| CU-WO-03 | Aprobador | Rechazar solicitud con motivo opcional |
| CU-WO-04 | Auditor | Listar y filtrar documentos de baja por estado, motivo y fechas |
| CU-WO-05 | Operaciones | Ver en ficha 360 del activo la baja vinculada (via movimiento) |

## 4. Requerimientos funcionales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-WO-01 | `POST /inventory/write-offs` crea documento en `PENDING_APPROVAL` **sin** afectar el ledger. | MVP |
| RF-WO-02 | El documento persiste `item_id` o `serialized_asset_id`, `location_id`, `quantity`, `reason`, `notes`, `requested_by_user_id`. | MVP |
| RF-WO-03 | `GET /inventory/write-offs` paginado con filtros `status`, `reason`, rango de fechas, `itemId`, `serializedAssetId`. | MVP |
| RF-WO-04 | `GET /inventory/write-offs/:id` devuelve detalle enriquecido (ítem/activo, bodega, solicitante, aprobador si aplica, movimiento si `COMPLETED`). | MVP |
| RF-WO-05 | `POST /inventory/write-offs/:id/approve` transiciona a `COMPLETED`, invoca ledger en la **misma TX**, persiste `approved_by_user_id`, `approved_at`, `stock_movement_id`. | MVP |
| RF-WO-06 | `POST /inventory/write-offs/:id/reject` transiciona a `REJECTED`; **no** toca el ledger. | MVP |
| RF-WO-07 | El aprobador debe ser distinto del solicitante (`400` si coincide). | MVP |
| RF-WO-08 | Idempotencia en aprobación: reintentar approve sobre documento ya `COMPLETED` devuelve el mismo resultado sin duplicar movimiento. | MVP |
| RF-WO-09 | Validaciones de negocio heredadas del ledger (saldo disponible, activo en estado válido, comodato) se ejecutan **en aprobación**, no en solicitud. | MVP |
| RF-WO-10 | Textos visibles en español; estados y motivos con etiquetas amigables (sin enums crudos). | MVP |

**Trazabilidad PRD padre:** RF-WO-01…10 cierran **RF-INV-19** (parcial → construido).

## 5. Máquina de estados

```text
PENDING_APPROVAL ──approve──► COMPLETED (+ ledger)
       │
       └──reject──► REJECTED

Estados terminales: COMPLETED, REJECTED
Estados REQUESTED / APPROVED: reservados; no usar en MVP salvo migración de datos legacy futura.
```

| Transición | Actor | Efecto |
| --- | --- | --- |
| Crear | Solicitante (`inventory.stock.manage`) | `PENDING_APPROVAL`, sin ledger |
| Aprobar | Aprobador distinto (`inventory.stock.manage`) | Ledger + `COMPLETED` |
| Rechazar | Aprobador distinto | `REJECTED`, sin ledger |

## 6. Contratos de API

Base: `/api/v1/inventory` · Roles: `ADMIN`, `NOC`, `SUPPORT` (lectura); escritura/aprobación `inventory.stock.manage`.

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/write-offs` | Crear solicitud (**cambia semántica** del endpoint actual) |
| GET | `/write-offs` | Listar documentos |
| GET | `/write-offs/:id` | Detalle |
| POST | `/write-offs/:id/approve` | Aprobar y aplicar al ledger |
| POST | `/write-offs/:id/reject` | Rechazar |

**Breaking change controlado:** el `POST /write-offs` deja de aplicar al ledger de inmediato. Actualizar OpenAPI, portal y tests en la misma fase.

## 7. Modelo de datos

### Tabla existente `inventory_write_offs`

Campos vigentes (047 + 048): id, tenant_id, serialized_asset_id, item_id, reason, status, requested_by_user_id, approved_by_user_id, approved_at, stock_movement_id, notes, timestamps.

### Migración tenant **082** (propuesta)

Añadir columnas operativas faltantes para congelar el payload hasta la aprobación:

| Columna | Tipo | Notas |
| --- | --- | --- |
| `location_id` | UUID NOT NULL (nullable en down-migrate) | Bodega origen de la baja |
| `quantity` | NUMERIC NOT NULL DEFAULT 1 | 1 forzado si hay `serialized_asset_id` |
| `idempotency_key` | VARCHAR(160) nullable | Reutilizada al aprobar |
| `rejected_by_user_id` | UUID nullable | Opcional MVP |
| `rejected_at` | TIMESTAMPTZ nullable | Opcional MVP |
| `rejection_notes` | TEXT nullable | Opcional MVP |

Índice sugerido: `(tenant_id, status, created_at DESC)` — evaluar si el existente `(tenant_id, status)` basta.

## 8. UI portal (alcance mínimo)

- **Solicitud:** formulario actual de Bajas pasa a «Solicitar baja» (estado pendiente, sin descuento inmediato).
- **Bandeja:** subvista o panel «Pendientes de aprobación» con acciones Aprobar / Rechazar (patrón compras).
- **Historial:** listado de documentos con filtros por estado.
- **No** requiere carril H5 completo; evitar duodécima pestaña de primer nivel.

## 9. Gates y ADR

| Gate | Criterio |
| --- | --- |
| G5 ARCH | Boundaries respetados; ledger solo desde servicio de inventario; misma TX documento+movimiento |
| G6 UX/DS/QA | Copy español, estados accesibles, E2E solicitud→aprobación |
| G7 EM-ARCH | RF-INV-19 ✅; H3 cerrado en informe maestro |

**ADR:** no obligatorio si la migración 082 es aditiva sobre tabla ya prevista en ADR-048. Escalar ADR solo si se introduce política de aprobación configurable multi-nivel o integración contable.

## 10. Criterios de aceptación (MVP)

- [x] Crear solicitud no modifica `stock_balances`.
- [x] Aprobar solicitud crea exactamente un movimiento `WRITE_OFF` y documento `COMPLETED` con `stock_movement_id`.
- [x] Rechazar no crea movimiento.
- [x] Aprobador = solicitante → `400`.
- [x] Baja aprobada de activo en comodato con `LOST` cierra comodato (regresión EV-1 / unit tests).
- [x] Tests unitarios + integración tenant-aware; E2E portal solicitud→aprobación.
- [x] OpenAPI actualizado; informe de fase `INFORME-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md`.

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Breaking change en `POST /write-offs` | Entrega atómica BE+FE+tests; nota en informe y changelog portal |
| Tenant con un solo ADMIN | Documentar excepción operativa o rol NOC como aprobador; no bloquear MVP |
| Solicitud obsoleta (stock ya movido) | Validar en approve; rechazar con mensaje claro |
| Efecto contable/fiscal | Fuera de alcance; escalar cuando exista fuente DIAN |

---

**Prompt de ejecución:** [PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md](../prompts/PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md)
