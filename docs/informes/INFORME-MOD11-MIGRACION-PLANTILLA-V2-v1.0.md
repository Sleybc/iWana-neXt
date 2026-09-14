# Política de migración — `INSTALACION_ESTANDAR` v2 (MOD11 T1 B2)

**Versión:** 1.0
**Estado:** Entregado (CA-07)
**Fecha:** 2026-09-14
**Autor:** AI-SR-FULL (sr-backend)
**Alcance:** bloque B2 del tramo T1 — pasos 6 a 10 de `docs/prompts/PROMPT-MOD11-ACTA-INSTALACION-T1-v1.0.md`

**Trazabilidad:**

- Spec: `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0 §4.2 + §4.4 (Aprobada por el CTO)
- ADR: `docs/adrs/ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md` (Aprobado), R1/R2
- Plan: `docs/plans/2026-09-14-mod11-acta-instalacion.md` v1.0 §3.2 B2
- Contrato consumido: `packages/shared/src/contracts/operations/execution-orders.ts` v1.2 (B1, `finalDisposition` opcional en MATERIAL)
- Migración: `packages/database/src/migrations/tenant/131_publish_instalacion_estandar_v2.ts`

---

## 1. Qué publica la migración 131

Una **versión 2 `PUBLISHED`** sobre la plantilla canónica (`key = 'INSTALACION_ESTANDAR'`) de **cada tenant**, con los 5 requisitos de spec §4.2 y copy B4 literal:

| # | key | Requisito | Kind / config | Requerido |
| --- | --- | --- | --- | --- |
| 1 | `installed-equipment` | Equipos instalados en el sitio del cliente | `MATERIAL` `{"itemCategory":"CPE","finalDisposition":"INSTALLED_AT_CUSTOMER"}` | Sí |
| 2 | `service-test` | Prueba de servicio en el sitio | `EVIDENCE` `{"evidenceType":"PHOTO"}` | Sí |
| 3 | `work-photo` | Fotos del trabajo realizado | `EVIDENCE` `{"evidenceType":"PHOTO"}` | Sí |
| 4 | `CUSTOMER_SIGNATURE` | Acta de conformidad firmada por el cliente | `EVIDENCE` `{"evidenceType":"SIGNATURE"}` | Sí |
| 5 | `installation-activity` | Registro de la actividad en bitácora (NO requerido) | `ACTIVITY` `{"activityType":"INSTALLATION"}` | **No** |

CA-06 queda cubierto por construcción: la bitácora pasa a `required = FALSE` y su etiqueta describe un registro ("Registro de la actividad en bitácora"), no una verificación de trabajo; el sufijo "(NO requerido)" lo hace explícito en pantalla (ADR-088 §D4).

## 2. Qué pasa con las OT vivas bajo v1 (respuesta CA-07)

**Nada. Por diseño, no por omisión.**

- El snapshot de requisitos se congela al crear la OT (`execution-orders.service.ts`) y `publishVersion` no toca `execution_orders`. La 131 tampoco: su `up()` no contiene ningún `UPDATE`/`DELETE` sobre `execution_orders` (verificado en test: `up nunca re-snapshotea OT`).
- Toda OT creada **antes** de la 131 —viva, no iniciada, en curso o cerrada— conserva su snapshot v1 y su criterio de cierre v1 hasta que termine su ciclo de vida.
- **Ninguna OT se re-crea, re-snapshotea ni migra.** Cambiar el criterio de cierre bajo una orden en curso es peor que la convivencia (spec §4.4).

## 3. Convivencia v1/v2

- La v1 **no se retira ni se modifica**: sigue como fila `PUBLISHED` para auditoría de las OT que la referencian.
- Las OT creadas **después** de la 131 congelan el snapshot de la v2: `getActiveVersionForWorkType` resuelve la versión `PUBLISHED` con `version DESC`, es decir, la v2.
- Durante la transición conviven dos definiciones de cierre. Es una garantía deliberada (snapshot inmutable), no un defecto. Ventana: hasta que la última OT bajo v1 se cierra; no hay fecha de apagado de la v1 porque las filas históricas nunca se borran.
- Progreso y cierre aplican el mismo criterio dentro de cada OT (su snapshot), así que CA-04 no se ve afectado por la convivencia.

## 4. Acto por tenant, sin migración transversal

Publicar la v2 es un acto **por tenant** (spec §6, ADR-088): la 131 corre dentro de cada schema tenant vía el runner (`SET LOCAL search_path` por el runner; la migración fija `search_path` al schema validado y resuelve el `tenant_id` canónico desde `public.tenants`). No hay escritura transversal ni plantilla global.

Casos declarados:

- Tenant estándar (canónica `PUBLISHED` en v1) → recibe la v2. Caso general.
- Tenant con definición propia activa y **sin** plantilla canónica → la 131 emite `NOTICE` y **no toca nada**. Su definición se conserva intacta; adopta la v2 por API (`createVersion` + `publishVersion`) cuando lo decida.
- Tenant cuya canónica ya evolucionó a v2 o más (manual o re-run) → `NOTICE`, sin clobberar la definición vigente. Re-ejecución idempotente.
- Tenant cuya canónica no está `PUBLISHED`, o sin versiones → `NOTICE` / excepción fail-closed respectivamente; ambos visibles en el log del migrador, nunca silenciosos.

## 5. Rollback

`down()` ejercitado (evidencia §7): elimina **solo** la v2 sembrada por esta migración (requisitos + versión, identificados por uuid determinista + `version = 2`).

- Falla cerrado si hay OT **abiertas** referenciando la v2 (mismo guarda que la 118); las cerradas no bloquean.
- Sin v2 presente es no-op con `NOTICE`: sin `throw` incondicional.
- Revertir nunca restaura snapshots de OT (no los tocó) y nunca toca la v1.
- Procedimiento operador: `migration:tenant:revert` sobre **un schema** (la ruta de revert nunca itera tenants por diseño).

## 6. Decisiones técnicas fijadas por B2 (no re-litigables aquí, reversibles vía v3)

1. `itemCategory: "CPE"` — código canónico de equipos en sitio de cliente (familia 047/052 de inventario). El evaluador lo resuelve contra el catálogo real vía `getItemCategoryReceipt`; la migración solo declara el código, nunca infiere categorías.
2. Requisito 2 como `EVIDENCE PHOTO` — el medio de captura probado en v1. `MEASUREMENT` requerido produciría OT incerrables (ADR-088 R4: `measurements: []` sin vía de captura) y `DOCUMENT` no tiene ruta ejercitada en portal. Si a futuro existe captura de mediciones, una v3 puede cambiar el config sin tocar el gate.
3. Claves `work-photo`, `CUSTOMER_SIGNATURE`, `installation-activity` reutilizadas de v1 para continuidad de evidencias y bitácora; `installed-equipment` y `service-test` son claves nuevas sin colisión.
4. Sin `MEASUREMENT`/`FIELD` requeridos, sin requisito de contrato legal (ADR-088 §D1/R5), sin tocar el tramo de línea de tiempo (`execution-orders.service.ts` solo se lee, no se escribe en B2).

## 7. Evidencia de verificación (B2)

- Unitario: `pnpm --filter @iwana/db exec jest src/migrations/tenant/131_publish_instalacion_estandar_v2.spec.ts src/migrations/tenant/migration-order.spec.ts --ci --runInBand` → **10 passed** (4 de la 131 + 6 de orden/completitud del runner).
- Integración real (PostgreSQL dev `127.0.0.1:5433/dbiw`, schema efímero `tenant_it131_*`, fila efímera en `public.tenants`, ambos eliminados en `afterAll` — verificado 0 residuos): `pnpm --filter @iwana/db test:integration -- src/migrations/tenant/131_publish_instalacion_estandar_v2.integration.spec.ts --ci --runInBand` → **6 passed**: v2 publicada con los 5 requisitos exactos; v1/plantilla/OT viva intactas; idempotencia; `down` bloqueado con OT abierta; `down` ejercitado; `up` tras `down`.
- Typecheck: `pnpm --filter @iwana/db typecheck` → limpio.
- Boundaries: la migración solo toca `execution_order_templates*` del propio schema tenant (MOD11, owner `ExecutionOrder`); sin imports cruzados, sin tablas ajenas, sin PII.

## 8. Deuda por severidad

| Sev | Deuda | Dueño siguiente |
| --- | --- | --- |
| Media | Escala (spec §6 / plan R4): `buildMaterialEvaluationUsages` consulta el catálogo **una vez por consumo en cada lectura del detalle**; generalizar `MATERIAL` multiplica esas consultas por `GET`. Medir antes de publicar la v2 en tenants con volumen. | AI-SR-FULL / AI-PLAT-OPS |
| Media | Tenants con plantilla propia no reciben la v2 automáticamente (§4): adopción por API pendiente de decisión operativa. | AI-EM-ARCH |
| Baja | Captura en portal de las claves nuevas (`installed-equipment`, `service-test`): el backend las evalúa desde hoy, la superficie de captura llega con la Ola 2 de la spec hermana. | AI-FE-PLATFORM |
| Baja | Requisito 2 como `PHOTO` es reversible vía v3 cuando exista captura de mediciones (§6.2). | AI-EM-ARCH |
| Informativa | Culminación de instalación, contrato legal verificable y Provisioning siguen en tramos 2–3 (spec §9); este documento no los adelanta. | CTO / roadmap |

**STOP/GO B2 — GO:** migración reversible entregada (`131_publish_instalacion_estandar_v2.ts`, registrada en `runner.ts`), `down()` ejercitado contra PostgreSQL real, y política de migración entregada como artefacto (este documento): OT vivas bajo v1 intactas, convivencia declarada, cero OT re-creadas. CA-06 y CA-07 cubiertos.
