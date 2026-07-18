# PROMPT - MOD12 Compras: Restaurar DRAFT real y fusionar "Cotización"/"Cotizaciones" en "Cotizar" (Fase 10)

**Version:** 1.0
**Estado:** Aprobado e implementado (GO CTO 2026-07-17)
**Fecha:** 2026-07-17
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH (sesion de brainstorming, skill `brainstorming`)
**Aprobado por:** CTO (2026-07-17)
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL) + Frontend Platform (AI-FE-PLATFORM)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md`
**Habilitada por:** Diseño aprobado por el usuario en sesion de brainstorming — ver `docs/specs/2026-07-17-mod12-compras-cotizar-fase10-design.md`

---

## 0. Estado de gobernanza (resuelto 2026-07-17)

Al redactar este prompt, `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (roadmap) mostraba la Fase 07 como "Emitido — pendiente GO CTO". El CTO confirmó el GO de Fase 07 el mismo día (ver PRD, roadmap actualizado, y `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-07-v1.0.md` para el cierre funcional: 185/185 tests, commit `97e1883f`). La Regla de Completitud (ADR-016) queda satisfecha para efectos de esta Fase 10.

**Nota de numeracion:** esta fase se nombra **"Fase 10"** (no "Fase 08") porque `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` ya reserva Fase 08 (reabastecimiento bajo demanda) y Fase 09 (metricas de proveedor) en su propio roadmap. Este trabajo no forma parte de ese PRD; continua la numeracion global del submodulo Compras (02→03→04→05→06→07→**10**), dejando 08 y 09 intactas para su PRD de origen.

## 1. Objetivo exacto

Corregir un gap de la maquina de estados que hace que la pestana "Cotizacion" (RFQ) de `PurchaseRequestWorkbenchDrawer` sea inalcanzable en produccion (toda solicitud nace en `PENDING_QUOTES`, nunca en `DRAFT`, pese a que el resto del codigo ya asume `DRAFT` como real), y fusionar las pestanas "Cotizacion" (RFQ saliente) y "Cotizaciones" (ofertas recibidas) en una sola pestana **"Cotizar"** con dos zonas. Sin abrir capacidades fuera de este alcance (multiples rondas de RFQ, envio real al proveedor y comparacion por item son fases 11/12/13, ver §4).

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`, `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`
- `docs/specs/2026-07-17-mod12-compras-cotizar-fase10-design.md` (spec de diseno de esta fase — fuente primaria de alcance)
- `docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md` (alcance RFQ vigente, no se modifica)
- `docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (contexto del flujo "Trabajar solicitud"; ver §0 sobre su roadmap)
- `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md` §18 (addendum de esta fusion)
- `.github/instructions/api.instructions.md`, `database.instructions.md`, `frontend.instructions.md`, `portal.instructions.md`, `testing.instructions.md`
- **Skills a leer y aplicar** (`.agents/skills/`): `nestjs-expert`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `i18n-localization`, `wcag-audit-patterns`, `testing-patterns`, `e2e-testing-patterns`.
- **Referencia de reuso — backend:** `apps/api/src/modules/inventory/services/purchasing.service.ts` (`createPurchaseRequest` linea 86-144, `addSupplierQuote` linea 184-232), `apps/api/src/modules/inventory/services/rfq.service.ts` (`send` linea 191-247, no requiere cambios), `packages/shared/src/enums/inventory/purchase-request-status.enum.ts` (enum ya contiene `DRAFT`, no se modifica).
- **Referencia de reuso — portal:** `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx` (`canStartRfq` linea 74, no cambia), `QuoteComparisonPanel.tsx`, `AwardLinesPanel.tsx`, `PurchaseRequestWorkbenchDrawer.tsx` (render de pestanas linea 380-806, especificamente `rfq` 526-535 y `quotes`), `purchase-workbench.ts` (`PurchaseWorkbenchTab` linea 6-14, `PURCHASE_WORKBENCH_TAB_LABELS` 23-32, `getPurchaseNextAction` 39-155).
- **Tests existentes a no romper:** `apps/api/src/modules/inventory/tests/purchasing.service.spec.ts`, `rfq.service.spec.ts` (usan `PurchaseRequestStatus.DRAFT` como fixture — verificar que ya cubren el nuevo comportamiento real o ampliarlos).

## 3. Alcance exacto

### 3.1 Backend — maquina de estados

- `PurchasingService.createPurchaseRequest`: cambiar el `status` inicial de `PurchaseRequestStatus.PENDING_QUOTES` a `PurchaseRequestStatus.DRAFT` (linea 116).
- `PurchasingService.addSupplierQuote`: ampliar la condicion de la linea 222 de `request.status === PurchaseRequestStatus.PENDING_QUOTES` a `[PurchaseRequestStatus.PENDING_QUOTES, PurchaseRequestStatus.DRAFT].includes(request.status)`, manteniendo la misma transicion a `PENDING_APPROVAL`. No tocar el branch de `rfqInvitationId` (linea 216-221).
- No se modifica `RfqService.send()`, `reject`, `cancel`, ni `editableStatuses` — ya contemplaban `DRAFT` correctamente.
- **Sin migracion de schema**: `PurchaseRequestStatus.DRAFT` ya existe en el enum compartido.
- Actualizar/ampliar tests unitarios de `purchasing.service.spec.ts` para cubrir: creacion en `DRAFT`, transicion `DRAFT→PENDING_APPROVAL` via cotizacion manual, y `DRAFT→PENDING_QUOTES` via RFQ enviada (camino ya cubierto indirectamente, confirmar).

### 3.2 Frontend — entrada y bifurcacion

- `PurchaseRequestWorkbenchDrawer.tsx`: ampliar la condicion `canAddQuote` (formulario "Nueva oferta") para incluir `PurchaseRequestStatus.DRAFT` ademas de `PENDING_QUOTES`.
- No se modifica `canStartRfq` en `RfqInvitationsPanel.tsx` — ya apunta a `DRAFT`, se vuelve alcanzable automaticamente.

### 3.3 Frontend — fusion de pestanas "Cotizar"

- `purchase-workbench.ts`: fusionar los valores `rfq` y `quotes` de `PurchaseWorkbenchTab` en un unico valor `cotizar`; actualizar `PURCHASE_WORKBENCH_TAB_LABELS` (etiqueta "Cotizar"); actualizar `getPurchaseNextAction()` para que los casos que hoy sugieren `rfq` o `quotes` sugieran `cotizar`.
- `PurchaseRequestWorkbenchDrawer.tsx`: reemplazar el render separado de la pestana `rfq` (linea 526-535, monta `RfqInvitationsPanel`) y de la pestana `quotes` (monta `QuoteComparisonPanel` + formulario "Nueva oferta") por un unico render bajo `cotizar` con dos zonas: "Invitar proveedores" (`RfqInvitationsPanel` sin cambios de props/logica) y "Ofertas registradas" (`QuoteComparisonPanel` + formulario "Nueva oferta", sin cambios de logica). **No se reescribe la logica interna de ninguno de los dos componentes**, solo se re-monta bajo el mismo tab.
- Layout exacto de las dos zonas (orden, spacing, colapsables): sin contrato de componente formal de AI-DS-OWNER a la fecha de este prompt — usar por defecto el orden "Invitar proveedores" arriba, "Ofertas registradas" abajo, con el mismo `PortalSectionHeader` que ya usan ambos paneles, hasta que llegue el contrato formal (carril rapido DS-OWNER puede reemplazarlo despues sin gate de las 7 etapas, `Protocolo_Colaboracion_Multiagente_v1.md` §3bis regla 3).
- Actualizar el copy del `PortalEmptyState` de la zona "Invitar proveedores" (hoy "Sin ronda activa" / "No hay una solicitud de cotización activa para esta compra") a un texto que no implique una accion rota — ver §4.4 de la spec de diseno para el criterio; redaccion final libre dentro de ese criterio (no requiere copy exacto de AI-PROD-UX para este prompt, es texto de bajo riesgo).

### 3.4 Tests y verificacion

- Unit: cobertura ≥80% en los archivos tocados de `purchasing.service.ts` (nuevo estado inicial + transicion ampliada).
- Component/integration del portal: actualizar `PurchaseRequestComposer.spec.tsx`, `CounterPurchasePanel.spec.tsx` u otros specs existentes que asuman `PENDING_QUOTES` como estado post-creacion, si los hay (verificar antes de tocar).
- E2E (si aplica el flujo en Playwright existente): confirmar que crear solicitud → pestana "Cotizar" → invitar proveedor → enviar RFQ sigue funcionando de punta a punta.
- Verificacion manual en portal: crear una solicitud nueva y confirmar que la pestana "Cotizar" permite iniciar una ronda RFQ (antes mostraba "Sin ronda activa" sin accion).

## 4. Fuera de alcance (explicito)

- **Fase 11 — Multiples rondas de RFQ:** no se habilita reabrir una RFQ tras cerrar una sin adjudicar. Riesgo ya documentado en ADR-051, pendiente de decision de producto propia.
- **Fase 12 — Envio real al proveedor:** "enviar RFQ" sigue siendo solo un cambio de estado (`DRAFT→SENT`) sin email/WhatsApp real. No crear modulo de notificaciones, cola BullMQ, ni tocar `MailerService` en esta fase.
- **Fase 13 — Comparacion de ofertas por item:** `QuoteComparisonPanel` sigue comparando por total; no se cambia el contrato de `SupplierQuote`.
- No se toca `SupplierMultiPicker` (filtro por rubro no esta en ningun roadmap vigente).
- No se abre Fase 08 (reabastecimiento) ni Fase 09 (metricas de proveedor) — pertenecen a otro tramo del mismo PRD y siguen bloqueadas por el estado de Fase 07 (§0).

## 5. Criterios de aceptacion

- CA-10-01: Crear una solicitud nueva la deja en `DRAFT` (verificable via `GET /purchasing/requests/:id`).
- CA-10-02: Desde una solicitud en `DRAFT`, la pestana "Cotizar" permite crear una ronda de RFQ (antes bloqueado).
- CA-10-03: Desde una solicitud en `DRAFT`, registrar una cotizacion manual (sin RFQ) transiciona la solicitud a `PENDING_APPROVAL`, igual que hoy ocurre desde `PENDING_QUOTES`.
- CA-10-04: Enviar una RFQ transiciona la solicitud `DRAFT→PENDING_QUOTES` (mismo efecto observable que antes, ahora alcanzable desde el estado real).
- CA-10-05: La pestana "Cotizar" muestra ambas zonas ("Invitar proveedores" y "Ofertas registradas") sin regresion funcional de ninguno de los dos paneles originales.
- CA-10-06: Solicitudes preexistentes en `PENDING_QUOTES`+ sin RFQ muestran el nuevo copy de estado vacio (no el texto "Sin ronda activa") y no ofrecen boton de crear RFQ retroactiva.
- CA-transversal: lint + typecheck + tests verdes; cobertura core ≥80%; sin migracion de schema; sin PII en logs; boundaries Modulith intactos (sin nuevos imports directos entre modulos).

## 6. Stop/Go

**Go solo si**, ademas de los criterios tecnicos habituales:

1. AI-SR-FULL confirma factibilidad (G3) sin objeciones sobre el cambio de estado inicial — en particular, revisar si algun otro flujo del portal (fuera de los archivos listados en §2) asume implicitamente que una solicitud nueva nace en `PENDING_QUOTES` y se romperia con `DRAFT`.

(Punto de gobernanza sobre el cierre de Fase 07 ya resuelto — ver §0.)

**Stop y escalar a AI-EM-ARCH si:** aparece un tercer consumidor no listado en §2 que dependa del estado inicial `PENDING_QUOTES`, o si el cambio de `canAddQuote`/fusion de pestanas requiere tocar el contrato de `PurchaseRequestDetailRecord` (seria cambio de contrato de datos, fuera del alcance "sin cambio de API" declarado aqui).
