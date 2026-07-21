# PROMPT — MOD12 Activos y comodato — Comodato con ciclo de vida — Fase 05B

> **Estado: CERRADO (recomendación técnica GO — auditoría CTO independiente 2026-07-21).**

> ~~**Estado: Emitido (G4) — NO EJECUTABLE.**~~

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- PRD: `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` §7 Fase 5B
- Spec: `docs/specs/2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md` (D-F5-12, 13, 14)
- Auditoría de origen: `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` (H2)
- PRD padre: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (RF-INV-12, RF-INV-13)

## Modulo

- Nombre: Inventario / SCM — submódulo Activos y comodato
- Codigo: MOD12
- Fase: 05B (Comodato con ciclo de vida)
- Version: 1.0
- Fecha: 2026-07-21
- Generado por: AI-EM-ARCH
- Destinatario: **AI-SR-FULL (backend, líder)** + **AI-FE-PLATFORM (portal)**
- Nombre de archivo destino: `PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** cuando un técnico cierra una OT instalando equipo en un cliente, queda un registro de comodato con suscriptor, contrato, fecha y OT; cuando el equipo retorna o se da de baja, ese comodato se cierra solo. Operaciones puede listar qué equipos están en poder de clientes.
- **Sí entra:** alta del comodato en la instalación desde OT y cierre en retorno/baja, ambos en la transacción del ledger; `GET /inventory/loans` paginado con filtros; bandeja de comodatos en el portal; la sección Comodato de la ficha 360 (construida vacía en 5A) pasa a mostrar datos.
- **No entra:** endpoints de escritura manual de comodato; fecha esperada de recuperación y alertas de no devolución (RF-ACT-13, fase futura, **exige migración → ADR**); backfill de comodatos históricos; resolución de nombres de cliente.

> **Stop:** si concluyes que hace falta una columna nueva, **detente y escala** — abre gate de ADR (D-F5-11).

---

## 2. Artefactos de entrada obligatorios

- Cierre G7 de Fase 5A con GO del CTO (**bloqueante**)
- PRD §7 Fase 5B con el contrato ya congelado por AI-EM-ARCH
- Spec D-F5-12, 13, 14
- Skills: `nestjs-expert`, `postgresql`, `testing-patterns`, `frontend-dev-guidelines`, `system-vocabulary-review`, `openapi-spec-generation`

---

## 3. Instrucciones

### Backend (AI-SR-FULL)

1. **Servicio de comodato** (`asset-loan.service.ts`, archivo nuevo) con dos operaciones transaccionales que reciben el `EntityManager` en curso: `openLoanWithManager` y `closeOpenLoanWithManager`. Nunca abren transacción propia.
2. **Alta** — invocada desde la rama `INSTALLED_AT_CUSTOMER` de `recordExecutionOrderMovement` (`stock-ledger.service.ts`), dentro de `recordMovementWithManager`, con `subscriberRefId`, `contractRefId` (si viene en el input), `installedAt`, `executionOrderRefId` y `stockMovementId`. **Idempotente por `stock_movement_id`**: reprocesar el mismo movimiento no duplica (D-F5-12).
3. **Cierre** — invocado desde `recordReturn` y `recordWriteOff` cuando el movimiento afecta un activo serializado: busca el comodato abierto (`removed_at IS NULL`) y lo cierra. **Si no hay comodato abierto, no falla**: el retorno sigue su curso (D-F5-13).
4. **Consulta** — `GET /inventory/loans` (ADMIN, NOC, SUPPORT) con filtros `status`, `subscriberRefId`, `contractRefId`, `serializedAssetId` y paginación `{ data, total, page, limit }`, patrón `SupplierProfileService.list`.
5. **Ficha 360** — la sección `loans` deja de devolver vacío y consulta los comodatos del activo (orden `installed_at DESC`).
6. **Sin endpoints de escritura de comodato** (D-F5-14).
7. **Tests** — alta en instalación, idempotencia por movimiento repetido, cierre en retorno, cierre en baja, retorno sin comodato abierto (no falla), aislamiento tenant sobre `GET /inventory/loans`, y registro del provider nuevo en `inventory.module.spec.ts`.

### Frontend (AI-FE-PLATFORM)

1. Tipos y método `loans` en `api-client.ts`.
2. Bandeja de comodatos: ubicación dentro de la pestaña **Activos** como subvista (no crear una duodécima pestaña de primer nivel — la IA del módulo ya está al límite, ver H5).
3. Columnas: activo (SKU · serial), suscriptor (referencia), contrato (referencia), instalado el, estado, y acceso a la ficha 360 del activo.
4. Sección Comodatos de la ficha 360 con datos reales y su estado vacío intacto.
5. Specs de portal de la bandeja y de la sección.

---

## 4. Restricciones

- **Comodato y movimiento en la misma transacción, siempre.** Nunca un job, un listener ni un `emit` posterior.
- Referencias opacas; sin resolución de nombres; sin PII.
- Multi-tenant por schema con helpers vigentes; prueba de aislamiento en la ruta nueva.
- Texto visible en español, sentence case, sin enums crudos.
- Cobertura ≥ 80 % en el código nuevo core.
- Append-only en archivos compartidos.

---

## 5. Entregables

- Código backend + portal + tests
- Informe de fase: `docs/informes/INFORME-MOD12-COMODATO-FASE-05B-v1.0.md`
- OpenAPI/Swagger actualizado
- E2E: instalar en cliente vía OT y ver el comodato abierto; retornar y verlo cerrado
- Handoff G5 → G6 → G7 según el checklist vigente

---

## 6. Criterio stop/go

| Stop — detente y escala a AI-EM-ARCH | Go |
| --- | --- |
| Hace falta una columna nueva (p. ej. fecha esperada de recuperación) | La fase se completa sin DDL |
| El comodato se escribe fuera de la transacción del movimiento | Misma TX, idempotente por `stockMovementId` |
| Un retorno falla porque no encuentra comodato abierto | El retorno nunca se bloquea por trazabilidad ausente |
| Se propone backfill de comodatos históricos | Limitación declarada, sin datos inventados |
| Se añade una pestaña de primer nivel al módulo | Subvista dentro de Activos |

**Entrada pendiente:** cierre G7 de Fase 5A confirmado por el CTO → recién entonces este prompt pasa a **EJECUTABLE**.
