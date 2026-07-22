# PROMPT — MOD12 · Cierre de módulo: control de bajas, alertas en SQL y evidencia E2E — Fase H6

> **Estado: Cerrado con defecto — supersedido por H6-R1.** Entrega H6 ejecutada; **G7 = NO-GO** 2026-07-21. Remediación: [`PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md`](PROMPT-MOD12-CIERRE-MODULO-FASE-H6-R1-v1.0.md).

## Vinculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
- ADR: `docs/adrs/ADR-060-Control-Bajas-y-Consultas-Operativas-Inventario.md` (**Aprobado CTO 2026-07-21**)
- Spec: `docs/specs/2026-07-21-mod12-cierre-modulo-fase-h6-design.md` (D-H6-1…9, CA-H6-01…08)
- Auditoría de origen: `docs/informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md` (N1, N2, N3, H6)
- PRD padre: `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md` (RF-INV-18, RF-INV-19)
- Precedente de control: `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` anexo B, decisión D2 (ajustes solo ADMIN)

## Modulo

- Nombre: Inventario / SCM — cierre de módulo
- Codigo: MOD12
- Fase: H6 (Control de bajas, alertas en SQL y evidencia E2E)
- Version: 1.0
- Fecha: 2026-07-21
- Generado por: AI-EM-ARCH
- Destinatario: **AI-SR-FULL (líder)**; AI-FE-PLATFORM para el gateo de UI (D-H6-3); AI-SR-QA consultivo en el triaje E2E (D-H6-8)
- Nombre de archivo destino: `PROMPT-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** MOD12 queda en condiciones de emitir su informe de cierre de módulo — sin deuda alta abierta, sin cambio de esquema sin aprobación, y con la suite E2E propia en verde o con sus fallos atribuidos con evidencia.
- **Sí entra:** RBAC ADMIN en aprobación/rechazo de bajas; gateo de UI por rol; reescritura de `listUsefulLifeAlerts` a SQL con exclusión de estados terminales; tests de todo lo anterior; triaje de los 11 E2E de compras/RFQ; informe de cierre de módulo.
- **No entra:** migraciones o índices nuevos; materialización de alertas; notificaciones push de `StockLow`; consumidor Billing de `inventory.asset-sold`; RF-ACT-13; RF-INV-24/25; backfill de datos históricos.

> **Stop:** no relajes la segregación aprobador ≠ solicitante «para que funcione en tenants de un solo ADMIN». No introduzcas DDL. No cambies el shape de la respuesta de alertas.

---

## 2. Artefactos de entrada obligatorios

- **ADR-060 aprobado por el CTO** ✅ 2026-07-21 — criterio satisfecho.
- Spec D-H6-1…9 y CA-H6-01…08.
- Skills: `nestjs-expert`, `postgresql`, `testing-patterns`, `e2e-testing-patterns`, `backend-security-coder`, `frontend-dev-guidelines`, `docs-architect`.

---

## 3. Instrucciones

Ejecuta en este orden. El paso 1 va primero **a propósito**: si destapa un defecto real de compras, la fase cambia de forma y hay que escalar antes de invertir en el resto.

### Paso 1 — Triaje E2E (D-H6-8) · AI-SR-FULL con AI-SR-QA

1. Ejecuta la suite E2E del portal completa y aísla los 11 fallos declarados «preexistentes» en compras/RFQ/proveedores (ver `INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-G6-REVIEW-v1.0.md`, deuda G6-P2-01).
2. Para cada fallo determina: causa raíz, si es defecto de producto o de arnés de prueba, y módulo responsable.
3. Arregla los que sean de arnés o de MOD12. Los que sean defecto funcional de otro frente: **detente y escala a AI-EM-ARCH** con la lista antes de continuar (§6).
4. Deja constancia del triaje en el informe de fase, fallo por fallo. «Preexistente» no es una causa raíz.

### Paso 2 — Control de bajas (D-H6-1, D-H6-2) · AI-SR-FULL

1. `POST /inventory/write-offs/:id/approve` y `/reject` → `@Roles(UserRole.ADMIN)` en `inventory.controller.ts`. Solicitud y consultas quedan como están.
2. No toques `assertApproverDistinct`: sigue aplicando también entre ADMINs.
3. Swagger: refleja el rol restringido en la descripción de ambas rutas.
4. Tests: NOC y SUPPORT reciben 403 en approve y en reject; un ADMIN distinto del solicitante aprueba correctamente (CA-H6-01); el ADMIN solicitante recibe 400 al aprobar su propia baja (CA-H6-02).

### Paso 3 — Alertas de vida útil en SQL (D-H6-4, D-H6-5, D-H6-6) · AI-SR-FULL

1. Reescribe `SerializedAssetService.listUsefulLifeAlerts` con QueryBuilder:
   - predicado de vencimiento en SQL sobre `purchase_date + useful_life_months * INTERVAL '1 month'`;
   - `currentStatus NOT IN (WRITTEN_OFF, LOST, SOLD)`;
   - descarta `purchase_date IS NULL` o `useful_life_months IS NULL`;
   - `COUNT` y `LIMIT/OFFSET` en la consulta — nada de `Array.slice` sobre el universo del tenant.
2. Resuelve los ítems relacionados **solo de la página devuelta**, no del universo.
3. Mantén el shape exacto de la respuesta y el orden actual (`updated_at DESC`) salvo que el predicado exija otro; si lo cambias, decláralo en el informe.
4. Tests: exclusión de los tres estados terminales (CA-H6-04); `total` proveniente de `COUNT` y página acotada (CA-H6-05); **paridad SQL ↔ `calculateUsefulLife` en los cuatro bordes** (CA-H6-06); prueba de aislamiento tenant sobre la ruta.

### Paso 4 — Gateo de UI (D-H6-3) · AI-FE-PLATFORM

1. Oculta Aprobar y Rechazar en `WriteOffsPanel` cuando el usuario no sea ADMIN, con el patrón de `canAdjustStock` (Existencias F3A).
2. El gateo de UI **no sustituye** al `@Roles`: si el API responde 403, el error se mapea con `mapInventoryError` como hasta ahora.
3. Spec de portal que cubra ambos casos de rol.

### Paso 5 — Informe de cierre de módulo (D-H6-9) · AI-SR-FULL

Emite `docs/informes/INFORME-MOD12-CIERRE-MODULO-v1.0.md` con:

- evidencia funcional (RF-INV-01…25 con su estado) y de calidad (gates con números reales);
- deuda declarada y limitaciones conocidas: sin backfill de comodatos ni de bajas pre-H3, `inventory.asset-sold` sin consumidor, `StockLow` sin notificación, RF-ACT-13 pendiente, RF-INV-24/25 diferidos;
- resultado del triaje E2E del paso 1;
- **estado de despliegue explícito**: MOD12 no ha sido desplegado. Decirlo, no omitirlo.

---

## 4. Restricciones

- **Sin DDL.** Ni migración ni índice nuevo. Si el predicado no rinde sin índice, detente y escala.
- Multi-tenant por schema con helpers vigentes; `tenant_id` dentro del SQL; prueba de aislamiento en la ruta de alertas.
- Sin PII en respuestas, logs, fixtures ni mensajes de error.
- Texto visible en español, sentence case, sin enums crudos.
- Cobertura ≥ 80 % en el código nuevo core.
- Append-only en archivos compartidos (`dto/index.ts`, `inventory.module.ts`, `api-client.ts`).
- Reconstruir `@iwana/db` antes de typecheck (checklist DoD vigente).

---

## 5. Entregables

- Código backend + portal + tests.
- `docs/informes/INFORME-MOD12-CIERRE-MODULO-FASE-H6-v1.0.md` (informe de fase, con el triaje E2E detallado).
- `docs/informes/INFORME-MOD12-CIERRE-MODULO-v1.0.md` (informe de cierre de módulo, ADR-016).
- OpenAPI/Swagger actualizado.
- Handoff G5 → AI-EM-ARCH, luego G6 (PROD-UX / DS-OWNER / SR-QA) y G7 (aprobador ≠ productor), siguiendo `CHECKLIST-MOD12-INVENTARIO-EXISTENCIAS-GATES-G6-G7-v1.0.md`.

**Sobre los gates:** los informes G5/G6/G7 **no** los produce quien implementa. En las fases 05A/05B se emitieron en la misma sesión que el código y la auditoría posterior lo marcó como separación nominal. Entrega el handoff y detente.

---

## 6. Criterio stop/go

| Stop — detente y escala a AI-EM-ARCH | Go |
| --- | --- |
| El triaje destapa un defecto funcional de compras/RFQ | Fallos de arnés corregidos; defectos ajenos escalados con lista |
| Hace falta un índice o una migración para que el predicado rinda | La fase se completa sin DDL |
| Aparece la tentación de exceptuar al ADMIN único de la segregación | El control se mantiene; el caso va al runbook |
| El shape de alertas cambia | Contrato intacto, solo cambia qué filas devuelve |
| SQL y `calculateUsefulLife` clasifican distinto algún borde | CA-H6-06 con evidencia |
| Emites tú mismo los informes de gate | Handoff a AI-EM-ARCH |

**Verificación exigida antes del handoff G5:**

```powershell
EV1_REAL_DB=1 pnpm --filter @iwana/api test -- src/modules/inventory
pnpm --filter @iwana/portal test -- inventory
pnpm lint
pnpm typecheck
npx playwright test --config e2e/playwright.portal.config.ts
```

La última línea corre la suite E2E **completa** del portal, no solo el spec de inventario: el objetivo de la fase incluye saber en qué estado real está.

**Salida de fase:** al cerrar G7 con GO del CTO, MOD12 queda cerrado como módulo (ADR-016) y habilitado el arranque del módulo siguiente.
