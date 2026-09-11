# Plan de orquestación — MOD12 Compras Fase 28: ronda de cotización en un paso

**Fecha:** 2026-09-09
**Emisor:** AI-EM-ARCH (modo Architect + Orchestrator)
**Origen:** defecto reportado por el CTO sobre `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Decidir → Cotizar
**Prompt de ejecución:** [`PROMPT-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md`](../prompts/PROMPT-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md)
**ADR rector:** [`ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md`](../adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md) — Aprobado (CTO, 2026-07-11)

---

## 1. El problema en una frase

El acordeón «Ronda de cotización» promete invitar proveedores y no muestra ninguno: el selector existe pero está **detrás de la creación de la ronda**, y en `PENDING_QUOTES` sin ronda la sección entera desaparece — un gate de frontend más estricto que el dominio.

## 2. Qué se verificó antes de decidir

Ningún componente fue eliminado. `git log --diff-filter=D` sobre `apps/portal/src/components/inventory/` no reporta ningún borrado de invitación de proveedores; `RfqInvitationsPanel.tsx` nació en `8a4e89ae` y sigue vivo.

| Capa | Estado | Evidencia |
| --- | --- | --- |
| Entidades y migraciones | **Completo** | `purchase_rfqs`, `purchase_rfq_invitations`; migraciones tenant `059`–`062` |
| Endpoints | **Completo** | crear, invitar, enviar, declinar, cerrar, leer, PDF y ZIP en `purchasing.controller.ts` |
| Cliente de API | **Completo** | `api-client.ts:9555-9602` |
| Componente selector | **Existe y se reutiliza** | `SupplierMultiPicker.tsx:29`, sobre `SearchableMultiPicker` |
| Alcanzabilidad en UI | **Rota** | los dos gates de §3 |

## 3. Las dos líneas que concentran el defecto

| # | Ubicación | Efecto | Introducido en |
| --- | --- | --- | --- |
| **G1** | `RfqInvitationsPanel.tsx:168` (`canStartRfq`) + picker dentro de `{rfq ? …}` en `:509` | En `DRAFT` sin ronda el formulario solo ofrece moneda, fecha límite y notas. El picker aparece **después** de crear la ronda: paso intermedio no señalizado | `8a4e89ae` |
| **G2** | `PurchaseRequestWorkbenchDrawer.tsx:606` (`showRondaSection`) | En `PENDING_QUOTES` sin ronda **la sección no se renderiza**: cero rutas para invitar. El backend sí lo permite (`rfq.service.ts:68` no valida `request.status`; `:238` contempla `PENDING_QUOTES`) | `1e0e1368` — «Evita accordion vacío» |

Agravante de descubribilidad: `getCotizarPrimarySection` (`purchase-workbench.ts:126-135`) hace primario el bloque manual en `DRAFT`, de modo que la ronda **nace colapsada** y el camino visible por defecto es cotizar sin ronda.

**G2 está congelado por un test** que afirma exactamente lo contrario de lo que el negocio necesita: `PurchaseRequestWorkbenchDrawer.spec.tsx:305`.

## 4. Decisión arquitectónica

**Modo:** Architect. **Recomendación:** fusionar creación e invitación en un solo acto de UI y alinear el gate con el dominio para la **primera** ronda en `PENDING_QUOTES`.

| Campo | Contenido |
| --- | --- |
| **Justificación** | El picker existe; el defecto es de secuencia y gating, no de capacidad. Se resuelve íntegramente en `apps/portal`. |
| **Impacto tenant / seguridad / escala / regulación** | **Sin impacto.** Mismos endpoints y permisos (`INVENTORY_PURCHASING_MANAGE`), mismo `partyRefId` de MOD08, sin PII nueva, sin cambio de aislamiento por schema. |
| **Alternativas descartadas** | (a) Solo expandir el acordeón: deja los dos submits y no cumple la promesa del título. (b) Endpoint atómico de crear-con-invitaciones: cambia el contrato de API para resolver un problema de UI. |
| **Requiere ADR** | **No.** Ver §5. |
| **Requiere CTO** | No. |

### 4bis. Por qué `PENDING_QUOTES` no exige ADR

Habilitar la **primera** ronda en `PENDING_QUOTES` **no es multi-ronda**. Multi-ronda es *reabrir* tras `CLOSED` o `CANCELLED` — el riesgo que ADR-051 §L126 dejó abierto y que la Fase 11 debe decidir. Aquí el gate sigue exigiendo que no exista ronda, y la reapertura no se habilita por vía indirecta: al cerrar una ronda la solicitud pasa a `PENDING_APPROVAL`, no a `PENDING_QUOTES`. **Se exige test que fije ese límite** (CA-28-08).

Además, la spec de Fase 24 §L75 ya preveía para «Empty histórico `PENDING_QUOTES` sin ronda» un *«Bloque "Abrir ronda" colapsado (opcional)»* que la implementación omitió: esta fase **cierra lo que esa spec previó**. La desviación real y consciente es frente a la spec de Fase 10 §L70, que remitía el caso a Fase 11 — y se declara como tal.

## 5. Contratos congelados (§3.5 del perfil)

Ninguno cambia. Un cambio en cualquiera de los dos es evento de re-sync y se coordina vía este perfil, nunca se parchea en silencio.

- **API:** `POST /purchasing/requests/:id/rfq`, `.../rfqs/:rfqId/invitations`, `.../rfqs/:rfqId/send` — `api-client.ts:9555-9576`, DTOs en `:8662-8672`. Origen: ADR-051 §L86-93.
- **Componente DS:** `SearchableMultiPicker` v1.0 (`docs/specs/2026-07-25-searchable-picker-ds-contrato.md`). `SupplierMultiPicker` se reutiliza tal cual.

## 6. Ejecución por tracks

| # | Track | Agente | Entregable | Depende de | Estado |
| --- | --- | --- | --- | --- | --- |
| **T1** | Delta de spec UX | **AI-PROD-UX** | `docs/specs/2026-09-09-mod12-compras-ronda-un-paso-design.md`: flujo de un paso, CA-28-01..08, desviación declarada frente a D3 de Fase 24 §L79-84 y a Fase 10 §L70, copy definitivo | — | Pendiente |
| **T2** | Veredicto de carril rápido | **AI-DS-OWNER** | GO sobre alojar el picker en el formulario sin variantes ni tokens nuevos. **Cierre de la tensión abierta** en `INFORME-MOD12-COMPRAS-RFQ-ENVIO-BLOQUEO-v1.0.md:37` (contrato DS §3 vs. spec UX §5.2): versionar a v1.1 o marcar §3 superado — no dejar ambas vigentes | T1 | Pendiente |
| **T3** | Implementación | **AI-FE-PLATFORM** | Cambios 3.1–3.4 del prompt, solo en `apps/portal/src/components/inventory/` | T1, T2 | Pendiente |
| **T4** | Verificación | **AI-SR-QA** | Reescritura del test que congela G2 + cobertura de la brecha + test de límite CA-28-08 + smoke E2E | T3 | Pendiente |
| **T5** | Consolidación | **AI-EM-ARCH** | `docs/informes/INFORME-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md` | T4 | Pendiente |

T1 y T2 son secuenciales y baratos; T3 arranca con el delta de spec congelado. No hay paralelismo real que ganar: los tres tracks tocan la misma superficie.

## 7. Riesgos

| Riesgo | Severidad | Mitigación |
| --- | --- | --- |
| **Fallo parcial deja ronda huérfana sin invitaciones.** `createRfq` no es idempotente: `RfqService.createFromRequest` rechaza una segunda ronda activa (`rfq.service.ts:80-89`), así que un reintento de «Crear e invitar» daría un 400 opaco | **Alto** — es el riesgo propio de la fusión | Tratamiento obligatorio en el prompt §3.1: conservar la selección, refrescar al modo «ronda existente», mensaje explícito. Test CA-28-04 |
| El cambio de bloque primario rompe la comparación (CA-24-06) | Medio | El caso de cotizaciones existentes conserva prioridad sobre `canStartRfq`. Cubierto en `purchase-workbench.spec.ts` |
| `PENDING_QUOTES` se lee como puerta abierta a multi-ronda | Medio | El gate sigue exigiendo que no exista ronda; límite declarado en §4bis y fijado por CA-28-08 |
| Contaminación de scope en el commit | Medio | §8 |

## 8. Higiene de scope — atender antes de commitear

El working copy arrastra **~31 archivos modificados de la Fase 26** (tributos de compra de mostrador) sin commitear, más archivos sin seguimiento. El hallazgo **I-2** de `INFORME-MOD12-COMPRAS-CIERRE-FASE-06-AUDITORIA-ARCH-v1.0.md:56` ya sancionó este patrón: *acotar el commit a sus archivos; lo demás pertenece a otra línea y debe separarse para no arrastrar deuda ajena al PR*. El commit de Fase 28 se acota a los suyos.

## 9. Deuda registrada, no pagada en esta fase

| Deuda | Severidad | Destino |
| --- | --- | --- |
| Ningún PRD/HLD de MOD12 contiene un RF de «invitar proveedores»: la capacidad solo vive en ADR-051 | Media | Enmienda al PRD de cierre de flujo, fase propia |
| Tipos de transporte de la ronda duplicados a mano en `api-client.ts:7778-8672` en vez de `@iwana/shared`; además `PurchaseRfqRecord` no declara `sentByUserId`/`closedByUserId` ni la invitación `invitedByUserId`/`declinedByUserId`, que el backend sí emite | Media | Fase de consolidación de contratos |
| Eje de abastecimiento (`fulfillmentStatus`) sin ADR — solo informe | Media | Preexistente, ajena a esta fase |
| Multi-ronda / reapertura (ADR-051 §L126) | — | Fase 11, decisión de producto del CTO |

## 10. Criterio de cierre

CA-28-01..08 verificados **en navegador**, no solo en RTL; tests en verde **con conteo real de tests ejecutados** (la caché de turbo y `--passWithNoTests` han falseado evidencia verde en este repositorio); `pnpm typecheck` y `pnpm lint` en verde. Gates de `AGENTS.md`: OpenAPI y migraciones **N/A declarado** — la fase no toca backend.
