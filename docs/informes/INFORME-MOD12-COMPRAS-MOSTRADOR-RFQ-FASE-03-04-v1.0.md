# Informe de cierre - MOD12 Compras: Mostrador (Fase 03) + RFQ (Fase 04)

**Version:** 1.0
**Fecha:** 2026-07-11
**Estado:** Cerrado — Aprobado
**Modo activo:** Architect (review de segunda capa / cierre)
**Responsable:** AI-EM-ARCH
**Aprobado por:** CTO
**Clasificacion:** Confidencial - Uso interno

---

## Identificacion

- **Modulo:** MOD12 Inventario / SCM (submodulo Compras / Movimientos)
- **Fases:** 03 (Compra de mostrador) y 04 (RFQ Niveles 1 y 2)
- **Commits:** `8a4e89ae` (ejecucion) + `789ac092` (remediacion de auditoria) + `65c0f9fc` (gates CI documentados)
- **Artefactos de gobernanza:**
  - docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md
  - docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md
  - docs/plans/2026-07-11-mod12-compras-mostrador-fase-03.md
  - docs/plans/2026-07-11-mod12-compras-rfq-fase-04.md
  - docs/prompts/PROMPT-MOD12-COMPRA-MOSTRADOR-FASE-03-v1.0.md
  - docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-FASE-04-v1.0.md

## 1. Resumen ejecutivo

Se ejecutaron y auditaron dos fases del submodulo Compras: **compra de mostrador** (ingreso directo de inventario sin OC, conforme a ADR-050) y **RFQ Niveles 1 y 2** (invitacion a proveedores con seguimiento y PDF descargable, conforme a ADR-051). La primera auditoria arquitectonica emitio 5 hallazgos de deuda menor (ninguno critico ni de seguridad). El fullstack remedio los 5; la segunda auditoria confirma la remediacion con evidencia verde. **Se aprueba el cierre.**

## 2. Verificacion de remediacion

| # | Hallazgo original | Severidad | Remediacion verificada |
|---|---|---|---|
| 1 | Mostrador: efectos (lote/activos) antes de deduplicar por idempotencia; riesgo de lotes huerfanos en concurrencia | LOW | `acquireIdempotencyTransactionLock` (`pg_advisory_xact_lock(hashtext($1))`, scope de transaccion) antes del chequeo de existencia, en `inventory-postgres.util.ts`. ✅ |
| 2 | `createFromRequest` / `invite`: carrera concurrente resolvia a 500 en vez de 409 | LOW | `try/catch` con `isPostgresUniqueViolation(...)` sobre `uq_purchase_rfqs_active_request` y `uq_purchase_rfq_invitations_rfq_party` -> `ConflictException`; `invite` re-consulta la fila en carrera (idempotente). ✅ |
| 3 | Transiciones RFQ sin actor (`void actor`) | MINOR | Columnas `sent_by_user_id`, `closed_by_user_id`, `declined_by_user_id` (mig. `061`) e `invited_by_user_id` (mig. `062`), reversibles; `RfqService` las persiste en cada transicion. ✅ |
| 4 | `down()` de mig. `058` recrea el tipo enum; fragil ante futuras dependencias del tipo | NOTE | Nota de mantenimiento agregada a ADR-050 (revisar `down()` si otra tabla/vista adopta `stock_movement_origin`). ✅ |
| 5 | `SupplierMultiPicker.tsx` del File Map ausente (drift) | NOTE | Componente creado: `apps/portal/src/components/inventory/SupplierMultiPicker.tsx`. ✅ |

## 3. Evidencia de calidad

- **Tests:** 37/37 verdes en los specs afectados (`counter-purchase.service`, `counter-purchase.http.integration`, `rfq.service`, `rfq.http.integration`, `rfq-pdf.service`, `purchasing.service`).
- **Typecheck:** `tsc --noEmit` exit 0 en `apps/api`.
- **Migraciones:** `058`–`062` con `up()`/`down()` reversibles; estrategias de reversa documentadas.
- **Boundaries:** sin FK cross-module a Parties; stock solo por `StockLedgerService`; sin nuevos estados en `PurchaseRequestStatus`; entidades registradas por `forFeature` + `autoLoadEntities`.

## 4. Verificacion pendiente (delegada a CI, no bloqueante)

Evidencia local previa (2026-07-11); validacion formal en pipeline CI:

| Item | Evidencia local | Alcance CI |
| --- | --- | --- |
| E2E Playwright + DB | `portal-inventory-scm.spec.ts` → 19/19 OK (~33 s) | Runner Ubuntu con stack completo |
| Cobertura ≥80% core | 87.5% stmts / 87.45% lines (servicios remedidos) | Job de coverage en CI |
| `pnpm lint` completo | 8/8 packages OK | Step en `.github/workflows/ci.yml` |
| OpenAPI | Paths en `/api/v1/docs-json`; specs `*.swagger.spec.ts` en verde | Artefacto o validacion post-build |

Ver detalle en `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-AUDITORIA-ARCH-v1.0.md`.

## 5. Decision

**Cierre aprobado** de las Fases 03 y 04. Sin deuda critica ni de seguridad. Las verificaciones del punto 4 se delegan al pipeline de CI/verificacion previo a despliegue.

## 6. Riesgos post-produccion

- Uso de compra de mostrador como atajo a la politica de aprobacion: mitigado por rol y auditoria; considerar tope de monto configurable en fase futura.
- Comparacion de cotizaciones sigue siendo por total; la cotizacion por linea y la matriz por item quedan para un ADR posterior (fuera de alcance declarado).
- Envio automatico de correo y portal de proveedor: fuera de alcance; requieren decision/ADR propios.

## 7. Referencias

- AGENTS.md
- docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md
- docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md
- docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md
- docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md
- docs/informes/INFORME-MOD12-COMPRAS-CIERRE-AUDITORIA-ARCH-v1.0.md
- apps/api/src/modules/inventory/services/counter-purchase.service.ts
- apps/api/src/modules/inventory/services/rfq.service.ts
- apps/api/src/modules/inventory/services/inventory-postgres.util.ts
- packages/database/src/migrations/tenant/058_add_counter_purchase_origin.ts … 062_add_rfq_invitation_invited_by.ts
