# PROMPT — MOD12 Inventario — Bajas con aprobación — Fase H3

> **Estado: CERRADO (G5+G6 GO 2026-07-21) — G7 pendiente.**

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD: `docs/prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md`
- Spec: `docs/specs/2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md` (D-H3-01…09)
- Auditoría: `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` (H3)
- PRD padre: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (RF-INV-19)

## Módulo

- Nombre: Inventario / SCM — submódulo Bajas con aprobación
- Código: MOD12
- Fase: H3
- Versión: 1.0
- Fecha: 2026-07-21
- Generado por: AI-EM-ARCH
- Destinatario: **AI-SR-FULL (backend, líder)** + **AI-FE-PLATFORM (portal)**
- Nombre de archivo destino: `PROMPT-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** toda baja de inventario pasa por un **documento** en `inventory_write_offs` con aprobación de un segundo usuario antes de afectar el ledger. RF-INV-19 deja de estar parcial; H3 se cierra.
- **Sí entra:** migración 082 (payload congelado), `WriteOffService`, endpoints CRUD + approve/reject, refactor de `POST /write-offs` (solo solicitud), portal solicitud + bandeja pendientes, tests y OpenAPI.
- **No entra:** H4 (vida útil / `StockLow`), H5 (rediseño pestañas legacy), adjuntos en storage, notificaciones, backfill histórico, integración DIAN.

> **Stop:** si necesitas más columnas que las de la spec D-H3-04 o cambiar la semántica de estados del enum PostgreSQL, **detente y escala** (gate ADR).

---

## 2. Artefactos de entrada obligatorios

- Cierre 5A+5B con recomendación técnica GO (**cumplido**)
- PRD §4 RF-WO-01…10 y spec D-H3-01…09
- Entidad existente: `packages/database/src/entities/inventory-write-off.entity.ts`
- Motor ledger: `stock-ledger.service.ts` (`recordWriteOff`, `resolveWriteOffAssetStatus`)
- Skills: `nestjs-expert`, `database-migration`, `postgresql`, `testing-patterns`, `openapi-spec-generation`, `frontend-dev-guidelines`, `system-vocabulary-review`

---

## 3. Instrucciones

### Backend (AI-SR-FULL)

1. **Migración 082** — columnas `location_id`, `quantity`, `idempotency_key`, opcionales rechazo (`rejected_by_user_id`, `rejected_at`, `rejection_notes`). Reversible. Verificar número más alto real antes de commitear.
2. **Entidad + shared** — actualizar `InventoryWriteOff`; DTOs/Zod para create, list filters, approve, reject.
3. **`WriteOffService`** — implementar D-H3-02; registrar en `inventory.module.ts`.
4. **Refactor ledger** — exponer `recordWriteOffWithManager(manager, input, actor)`; `recordWriteOff` público puede delegar en TX propia para callers internos futuros, pero **controller ya no lo usa directamente**.
5. **Controller** — rutas según PRD §6; `@Roles(ADMIN, NOC)` lectura; approve/reject con `inventory.stock.manage`.
6. **Reglas** — aprobador ≠ solicitante; approve valida saldo/estado/comodato; idempotencia D-H3-06.
7. **Breaking change** — `POST /write-offs` solo crea `PENDING_APPROVAL`; actualizar specs HTTP existentes que asumían ledger inmediato.
8. **Tests** — matriz D-H3-08; incluir regresión LOST/comodato y WRITTEN_OFF (B1).

### Frontend (AI-FE-PLATFORM)

1. **`api-client.ts`** — tipos documento de baja; métodos list/get/approve/reject; ajustar `writeOff` a solicitud.
2. **Pestaña Bajas** — formulario → «Solicitar baja»; feedback pendiente de aprobación.
3. **Bandeja** — listado `PENDING_APPROVAL` con Aprobar/Rechazar (patrón aprobación compras, vocabulario inventario).
4. **Historial** — filtro por estado; enlace al movimiento cuando `COMPLETED`.
5. **Tests portal** — componente bandeja + flujo solicitud; actualizar specs que mockeaban `writeOff` inmediato.

---

## 4. Restricciones

- Documento y movimiento en la **misma transacción** en approve (D-H3-03).
- Multi-tenant por schema; prueba de aislamiento en rutas nuevas.
- Sin PII; referencias opacas; logs sin payload sensible.
- Texto visible en español, sentence case.
- Cobertura ≥ 80 % en código nuevo core.
- Append-only en archivos compartidos donde aplique.

---

## 5. Entregables

- Código backend + portal + migración 082 + tests
- Informe: `docs/informes/INFORME-MOD12-BAJAS-APROBACION-FASE-H3-v1.0.md`
- OpenAPI actualizado
- E2E: solicitar baja → aprobar con otro usuario → ver saldo/movimiento
- Actualizar informe maestro MOD12 (H3 → cerrado)
- Handoff G5 → G6 → G7 según `CHECKLIST-MOD12-INVENTARIO-EXISTENCIAS-GATES-G6-G7-v1.0.md` o equivalente MOD12

---

## 6. Criterio stop/go

| Stop — escala a AI-EM-ARCH | Go |
| --- | --- |
| Necesitas workflow multi-nivel configurable | MVP binario solicitud/aprobación |
| Quieres backfill de bajas históricas | Limitación declarada D-H3-09 |
| Un solo ADMIN bloquea toda la fase | Documentar excepción; NOC como aprobador alterno |
| Propuesta de adjuntos en MinIO | Fuera de scope; `notes` suficiente en MVP |
| Ledger se escribe en create | Solo en approve |

**Entrada satisfecha:** PRD H3 emitido + Activos/comodato cerrados → **EJECUTABLE**.
