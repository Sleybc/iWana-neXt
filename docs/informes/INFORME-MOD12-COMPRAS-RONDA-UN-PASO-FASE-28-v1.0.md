# INFORME — MOD12 Compras Fase 28: ronda de cotización en un paso

**Fecha:** 2026-09-09
**Módulo:** MOD12 Inventario / SCM — Compras (purchasing)
**Superficie:** portal tenant → `/dashboard/inventory?tab=purchasing` → Trabajar solicitud → Decidir → Cotizar → Ronda de cotización
**Tipo:** Corrección de defecto de alcanzabilidad (solo `apps/portal`; sin backend, sin OpenAPI, sin migraciones)
**Plan:** [`2026-09-09-mod12-compras-ronda-un-paso-fase-28.md`](../plans/2026-09-09-mod12-compras-ronda-un-paso-fase-28.md)
**Prompt:** [`PROMPT-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md`](../prompts/PROMPT-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md)
**Modo:** Ejecutor subordinado a la gobernanza AI-EM-ARCH; protocolo multiagente v1.5 desplegado por tracks (§8)

## 1. Defecto y causa (confirmados antes de tocar código)

El acordeón «Ronda de cotización» prometía invitar proveedores y no mostraba ninguno. Dos gates de frontend, ninguna capacidad faltante (`SupplierMultiPicker` vivo, backend completo desde Fase 04):

- **G1** — `RfqInvitationsPanel.tsx:168` + picker dentro de `{rfq ? …}` (`:509`): en `DRAFT` sin ronda el formulario solo ofrecía moneda, fecha límite y notas. Agravante: la ronda nacía colapsada (el bloque manual era el primario).
- **G2** — `PurchaseRequestWorkbenchDrawer.tsx:606`: en `PENDING_QUOTES` sin ronda la sección no se renderizaba. El backend sí lo permite. Congelado por `PurchaseRequestWorkbenchDrawer.spec.tsx:305`, que afirmaba lo contrario de lo que el negocio necesita.

## 2. Cambios (ámbito exclusivo `apps/portal/src/components/inventory/` + docs + E2E)

| Archivo | Cambio |
| --- | --- |
| `RfqInvitationsPanel.tsx` | `SupplierMultiPicker` movido al bloque `canStartRfq` como primer campo (misma instancia y mismo estado `selectedSuppliers` para ambos modos); «Crear solicitud de cotización» → **«Crear e invitar»** (deshabilitado sin selección + hint); `handleCreateAndInvite` encadena `createRfq` → `inviteSuppliers` en un `runAction` con tratamiento de fallo parcial (conserva selección, `onRefresh()` al modo ronda existente, error explícito); `canStartRfq` admite `DRAFT` **o** `PENDING_QUOTES`; cabecera ajustada al copy de T1. Máquina `canInvite`/`canSend`/`canClose` y `sendBlockedReason` intactas |
| `PurchaseRequestWorkbenchDrawer.tsx` | `showRondaSection` admite `PENDING_QUOTES`; `canStartRfq` derivado y pasado a la matriz; comentario de `:605` actualizado |
| `purchase-workbench.ts` | `getCotizarPrimarySection` recibe `canStartRfq: boolean`, evaluado tras `hasActiveRfq` y antes de cotizaciones (CA-24-06 intacto) |
| `RfqInvitationsPanel.spec.tsx` | Mock de `SupplierMultiPicker` con interacción (elegir/mostrar) + 5 tests CA-28 (01/03, 02, 04, 05, 08) |
| `PurchaseRequestWorkbenchDrawer.spec.tsx` | Reescritura del test que congelaba G2 → CA-28-05; test DRAFT → CA-28-01; CA-25-14 adaptado al nuevo primario (intención intacta) |
| `purchase-workbench.spec.ts` | Llamadas existentes con el campo nuevo + caso CA-28 (ronda primaria / comparación intacta / ronda activa intacta) |
| `e2e/tests/portal-inventory-scm.spec.ts` | Flujo RFQ al acto único (seleccionar → Crear e invitar → enviar → PDF); caso BLOCKED al fallo parcial con recuperación vía «Invitar seleccionados»; helper `openRfqRoundSection` al botón nuevo |
| `docs/specs/2026-07-25-searchable-picker-ds-contrato.md` | **v1.1 (T2):** cierra la tensión DS §3 vs. UX §5.2 — el multi se cierra tras añadir y reabre al tipar; veredicto GO carril rápido Fase 28 |

Sin cambios en `apps/api`, `packages/database`, `packages/shared`, OpenAPI ni migraciones (N/A declarado). Sin componentes nuevos ni tokens nuevos. Sin PII en código, tests ni fixtures.

## 3. Verificación de CA-28

| ID | RTL (conteo real) | Navegador (Chromium, Playwright) |
| --- | --- | --- |
| 01 | Drawer: región «Invitar proveedores» expandida + «Crear e invitar» en `DRAFT` sin ronda | El helper E2E encuentra el botón sin expandir: nace expandida |
| 02 | Panel: `createRfq` + `inviteSuppliers` en un acto + mensaje de éxito | Ronda `RFQ-000001` + `Borrador` + `Proveedor Demo` + `Invitado` tras un clic; «Enviar solicitud» → `Enviada`; descarga PDF |
| 03 | Panel: deshabilitado + hint sin selección | Deshabilitado + hint antes de seleccionar |
| 04 | Panel: selección conservada + mensaje parcial + «Invitar seleccionados» sin segundo `createRfq` | Ronda creada + `Sin invitaciones` + 0 invitaciones en estado + «Invitar seleccionados» visible. **Límite ver §5 (D-28-01):** el mensaje y la selección no sobreviven al remount del refresh en navegador |
| 05 | Panel y drawer: `PENDING_QUOTES` sin ronda ofrece el formulario | Solo RTL (el caso E2E usa `DRAFT`) |
| 06 | Matriz: comparación primaria con cotizaciones registradas (CA-24-06 intacto) | Solo RTL |
| 07 | Regresión: ronda activa expande invitaciones, bloquea manual (C1), conserva invitar/enviar/cerrar/ZIP | Envío + descarga verificados en navegador; resto en RTL |
| 08 | Panel: en `PENDING_APPROVAL` no hay formulario (reapertura fuera de alcance) | Solo RTL |

## 4. Evidencia de gates (conteo real, sin caché)

- **Tests:** `purchase-workbench.spec` 15/15 · `RfqInvitationsPanel.spec` 23/23 (18 previos + 5 nuevos) · `PurchaseRequestWorkbenchDrawer.spec` 12/12 · carpeta `inventory` + `SearchablePicker.spec`: **81 suites, 609 pasados, 1 omitido, 0 fallos** (corridas `jest` directas, no restauradas de caché).
- **E2E:** `test:e2e:portal --grep "flujo RFQ|BLOCKED en el RFQ"` → **2/2 en Chromium real** (crear-e-invitar → enviar → PDF; fallo parcial con recuperación).
- **Cobertura** (specs de inventario sobre los 3 archivos tocados): statements **80.21%**, líneas **80.68%**, ramas 73.82%, funciones 64.66%. El resto sin cubrir concentra zonas no tocadas (órdenes/recepciones/adjudicación del drawer).
- **Typecheck:** `pnpm typecheck` → 8/8 tareas en verde. **Lint:** `pnpm lint` → 8/8, 0 errores (7 warnings preexistentes en `apps/api` tributario + 2 `exhaustive-deps` preexistentes en los archivos tocados, sin tocar).
- **Boundary/multi-tenant/seguridad:** sin impacto (mismos endpoints y `INVENTORY_PURCHASING_MANAGE`, mismo `partyRefId` de MOD08 nunca visible, sin PII nueva, sin cambio de aislamiento). Vocabulario: «ronda de cotización»; cero «RFQ»/«OC»/«oferta»/`partyRefId` en texto visible.
- **Stop/go (§8 del prompt):** ningún evento de stop (sin cambios de contrato, sin reapertura, sin tocar la máquina de estados, T2 GO sin variante ni token nuevo).

## 5. Deuda y desviaciones

**D-28-01 (nueva, media): avisos transitorios del panel no sobreviven al refresh en navegador.** El drawer desmonta el contenido de la pestaña mientras `isLoading` (`{request && !isLoading ? …}`), de modo que `success`/`error` y la selección del formulario se pierden en cada `onRefresh()`. Preexistente para todas las acciones del panel (invitar/enviar/cerrar); en Fase 28 degrada CA-28-04 en navegador (sin mensaje explícito ni selección conservada), aunque la propiedad crítica se mantiene: la recuperación va por «Invitar seleccionados» sobre la ronda existente, nunca un 400 opaco. Corregirlo toca la semántica de carga del drawer → **fase propia**, no parche aquí. Evidencia: screenshot y snapshot de la primera corrida E2E (ronda + invitación creadas, sin alerta).

**Desviaciones declaradas (no deuda):** escalón `canStartRfq` frente a la matriz D3 de Fase 24 §L79-84; `PENDING_QUOTES` sin ronda frente a Fase 10 §L70 (acotado a primera ronda; multi-ronda sigue en Fase 11). Continuidad: Fase 24 §L75 ya preveía el bloque «Abrir ronda» que la implementación omitió.

**Deuda reiterada (ajena, no pagada aquí):** sin RF de «invitar proveedores» en PRD/HLD; tipos de transporte de la ronda duplicados en `api-client.ts`; eje `fulfillmentStatus` sin ADR; multi-ronda en Fase 11.

## 6. Higiene de scope para el commit

El working copy arrastra otras líneas (Fase 26 mostrador, lotes, justificación opcional). **El commit de Fase 28 se acota a estos 10 archivos** (8 modificados + 2 nuevos):

- `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx` (+60)
- `apps/portal/src/components/inventory/RfqInvitationsPanel.spec.tsx` (+157)
- `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx` (+15)
- `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.spec.tsx` (+30)
- `apps/portal/src/components/inventory/purchase-workbench.ts` (+12)
- `apps/portal/src/components/inventory/purchase-workbench.spec.ts` (+59)
- `docs/specs/2026-07-25-searchable-picker-ds-contrato.md` (v1.1, T2)
- `e2e/tests/portal-inventory-scm.spec.ts` (+44)
- `docs/specs/2026-09-09-mod12-compras-ronda-un-paso-design.md` (nuevo, T1)
- `docs/informes/INFORME-MOD12-COMPRAS-RONDA-UN-PASO-FASE-28-v1.0.md` (este informe, T5)

## 7. Cierre de gates

- **G6 (calidad): GO** — CA-28-01..08 verificados (RTL completo + navegador en 01/02/03/04/07), tests/lint/typecheck en verde con conteo real, cobertura de la superficie tocada ≥80% en líneas, deuda declarada no bloqueante.
- **G6.5 (merge readiness): pendiente** — requiere la corrida Linux de CI por SHA; no se mergea con solo evidencia local.
- **G7 (despliegue): N/A** — la fase no toca backend ni despliegue.

## 8. Protocolo y skills

Tracks: T1 AI-PROD-UX (spec de diseño) · T2 AI-DS-OWNER (GO carril rápido + contrato v1.1) · T3 AI-FE-PLATFORM (cambios 3.1–3.4) · T4 AI-SR-QA (tests + E2E) · T5 AI-EM-ARCH (consolidación). Sin eventos de re-sync: los contratos congelados (API `api-client.ts:9555-9576` + DTOs `:8662-8672`; DS `SearchableMultiPicker` v1.0→v1.1 por acto propio de T2) no cambiaron durante la ejecución. Skills aplicadas: `docs-architect`, `system-vocabulary-review`, `architect-review`, `frontend-dev-guidelines`, `core-components`, `testing-patterns`, `verification-before-completion`.
