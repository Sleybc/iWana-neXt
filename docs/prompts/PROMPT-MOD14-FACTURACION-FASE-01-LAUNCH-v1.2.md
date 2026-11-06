# LAUNCH — MOD14 · Facturación Fase 01 · Ola 2 (B1b ∥ D1-R9)

**Plan:** `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md` (§6) · **Contrato:** `docs/hlds/HLD-MOD14-FACTURACION-v1.1.md` · **Encargo:** `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md` §B1b y §D1-R9
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Sucede a:** LAUNCH v1.1 (Ola 1, cerrada con G1 el 2026-11-03).
**Ola que lanza:** Ola 2, B1b ∥ D1-R9 · **Gates:** G0 del re-sync ✅ 2026-11-03 · **G1 ✅ 2026-11-03** · **Enmienda RS-9 ✅ 2026-11-03** (opción (a): documento del adquirente cifrado en `buyer_document_encrypted`).
**Bloqueos abiertos:** ninguno. SEC-MOD14-03 queda resuelto en diseño por RS-9; D1-R9 lo lleva al esquema y B2 al código. Si B1b ya se lanzó, lanza solo el perfil 2.

| # | Subagente | Encargo | Skills a leer antes | Contrato |
| --- | --- | --- | --- | --- |
| 1 | `sr-backend` | prompt v1.1 §B1b | `nestjs-expert`, `architect-review`, `backend-security-coder`, `openapi-spec-generation`, `test-driven-development`; apoyo `postgresql` | HLD v1.1 §2, §5, §7 y §8 |
| 2 | `data-eng` | prompt v1.1 §D1-R9 | `database-migration`, `postgresql`, `iwana-tenant-migration`, `test-driven-development` | HLD v1.1 §3.1 (RS-9) |

**Paralelo:** 1 ∥ 2, rutas disjuntas: B1b no toca `packages/database`; D1-R9 solo toca la 173, su prueba y `billing-document.entity.ts`.
**Base:** el árbol de la Ola 1 sin commitear (entidades, migraciones 173–175 y `contracts/billing` de `@iwana/shared`). Fuera de lo que asigna D1-R9, no los reescribas: si necesitas un cambio, `[BLOQUEO]` y consulta.
**Cierre de ola (G2):** CA-FAC-01 y 02; adaptador probado contra Postgres real en un esquema propio migrado con `applyTenantMigrationsInOrder` (nunca `tenant_iwana` ni `E2E_TENANT_SLUG`); `lockTitularForBillingWrite` con `FOR SHARE` sobre el `manager` de quien llama (SEC-MOD14-01); revisión de `boundary-reviewer` sobre el adaptador; columna y `CHECK` de RS-9 con integraciones 173–175 sin omisiones; evidencia de `gate-verifier` sin caché y con conteo. Nadie commitea.

```text
===== 1 · sr-backend =====
Actúa como sr-backend. Lee AGENTS.md, el plan y tu encargo §B1b de docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md. Lee los SKILL.md de nestjs-expert, architect-review, backend-security-coder, openapi-spec-generation y test-driven-development; postgresql como apoyo. Contrato: docs/hlds/HLD-MOD14-FACTURACION-v1.1.md (§2, §5, §7, §8); si falta un dato, [BLOQUEO].
Entregas: BillingContractReadPort y su adaptador en crm/contracts (proyección mínima; documento descifrado solo en findByContractId y nunca en logs; RUT vacío → R-99-PN; findBillableForDate sin anonimizados ni terminados antes del periodo; lockTitularForBillingWrite con FOR SHARE y el manager de quien llama); BillingModule con la política (GET/PUT /billing/policy, sobrescrituras, preview, expectedUpdatedAt, 422 BILLING_POLICY_INCOMPATIBLE); permisos de RESERVED a ASSIGNABLE y la sección billing fuera de COMING_SOON; OpenAPI.
BILLING_POLICY_MANAGE ya está en el enum (B1a): no lo dupliques. Las pruebas PG van en esquema y tenant propios, con limpieza en afterAll, IWANA_DB_INTEGRATION_AVAILABLE=true y una base iwana_it_*; una omisión no declarada es fallo. Sin forwardRef nuevos: si el cableado lo exige, [BLOQUEO].
Solo tus rutas; sin commit. Cierras con conteo real de suites y tests, sin caché de turbo, y la prueba de arranque del AppModule.

===== 2 · data-eng =====
Actúa como data-eng. Lee AGENTS.md, el plan y tu encargo §D1-R9 del prompt v1.1. Lee database-migration, postgresql, iwana-tenant-migration y test-driven-development. Contrato: HLD v1.1 §3.1 y RS-9 de §12.
En 173_billing_core.ts añade a billing_documents la columna buyer_document_encrypted varchar(500) NULL y el CHECK con nombre que impide documentNumber en buyer_snapshot; añade buyerDocumentEncrypted a billing-document.entity.ts. La integración de la 173 prueba la columna, el rechazo del CHECK y la ida y vuelta. Si la 173 ya está aplicada en desarrollo, revierte y reaplica 173→175 en orden e infórmalo.
Solo esos tres archivos; sin commit. Cierras con las integraciones 173–175 sin omisiones (en local, CI=true) y la suite de @iwana/db sin caché, con conteo real.
```
