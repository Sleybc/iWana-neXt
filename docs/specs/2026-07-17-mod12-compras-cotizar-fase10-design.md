# SPEC: Rediseño flujo "Cotizar" — MOD12 Compras (Fase 10)

**Versión:** 1.0
**Estado:** Aprobado por CTO (2026-07-17) — implementado (incl. enmiendas B+C1 y remediación UI)
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Submódulo Compras (purchasing)
**Superficie:** Portal tenant → `/dashboard/inventory?tab=purchasing` → "Trabajar solicitud" → pestaña "Cotizar"
**Modo activo:** Architect + Product Architect (combinado)
**Generado por:** AI-EM-ARCH (skill `brainstorming`)
**Aprobado por:** CTO (2026-07-17)
**Clasificación:** Uso interno

---

## 1. Trazabilidad

| Artefacto | Relación |
| --- | --- |
| [ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones](../adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md) | Alcance RFQ vigente (Nivel 1 invitación+seguimiento, Nivel 2 PDF manual); esta spec no lo modifica, corrige un gap de la máquina de estados que impide alcanzarlo |
| [PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0](../prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md) | PRD canónico del flujo "Trabajar solicitud"; su roadmap (§Roadmap de ejecución) reserva Fase 08 (reabastecimiento) y Fase 09 (métricas de proveedor) — **este trabajo no es parte de ese PRD** y continúa la numeración global del módulo como **Fase 10**, sin bloquear ni depender de 08/09 |
| [SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0](./SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md) | Recibe addendum §18 con la fusión de pestañas descrita aquí |
| [PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0](../prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md) | Prompt de ejecución (G4) derivado de esta spec |

**Nota de secuenciación (ADR-016):** al momento de redactar esta spec (2026-07-17), la Fase 07 figuraba en el roadmap de `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` como "Emitido — pendiente GO CTO". El CTO confirmó el GO de Fase 07 el mismo día (ver PRD, roadmap actualizado); el bloqueo de secuenciación queda resuelto — Fase 10 no está bloqueada por Fase 07.

---

## 2. Contexto

Dentro de "Trabajar solicitud" (`PurchaseRequestWorkbenchDrawer`), la pestaña **"Cotización"** (RFQ) no puede usarse en la práctica: toda solicitud nueva se crea con `PurchaseRequestStatus.PENDING_QUOTES` (`purchasing.service.ts:116`), nunca con `DRAFT`. El gate de creación de RFQ (`canStartRfq`, `RfqInvitationsPanel.tsx:74`) exige `DRAFT` — estado que el código de producción nunca produce (`PurchaseRequestStatus.DRAFT` solo aparece en fixtures de test: `purchasing.service.spec.ts:554,886`, `rfq.service.spec.ts:81`). Resultado observado en producción: la pestaña siempre cae en el `PortalEmptyState` "Sin ronda activa" (`RfqInvitationsPanel.tsx:381-386`), sin ninguna acción disponible.

El resto de la máquina de estados sí asume `DRAFT` como real: `editableStatuses` (`purchasing.service.ts:453`) y `cancel allowedFrom` (`purchasing.service.ts:313`) ya lo incluyen, y `getPurchaseNextAction()` (`purchase-workbench.ts:39-155`) ya redacta el copy "DRAFT de la solicitud → invita a abrir RFQ o cotizar manual" — un camino que hoy es inalcanzable. Esto confirma que se trata de una **corrección de una omisión de implementación**, no de un cambio de arquitectura o de alcance de ADR-051.

Adicionalmente, las pestañas **"Cotización"** (RFQ saliente, singular) y **"Cotizaciones"** (ofertas recibidas, plural) son fácilmente confundibles por nombre y viven en paneles separados (`RfqInvitationsPanel` vs `QuoteComparisonPanel`) aunque son parte del mismo paso conceptual del flujo.

## 3. Decisión

Se aprobaron, en sesión de brainstorming con el usuario, dos cambios conjuntos:

1. **Restaurar `DRAFT` real** como estado inicial de toda solicitud de compra.
2. **Fusionar** las pestañas "Cotización" y "Cotizaciones" en una sola pestaña **"Cotizar"**, con dos zonas internas.

Ambos se ejecutan juntos porque el segundo no tiene sentido sin el primero: sin `DRAFT` alcanzable, la zona "Invitar proveedores" de la pestaña fusionada seguiría inerte.

## 4. Diseño funcional

### 4.1 Máquina de estados (backend)

- `PurchasingService.createPurchaseRequest` (`purchasing.service.ts:86-144`): estado inicial `PurchaseRequestStatus.DRAFT` (antes `PENDING_QUOTES`, línea 116).
- `PurchasingService.addSupplierQuote` (`purchasing.service.ts:184-232`): el `else if (request.status === PENDING_QUOTES)` de la línea 222 —que transiciona a `PENDING_APPROVAL` al registrar la primera cotización manual sin RFQ— se amplía para incluir también `DRAFT`. Mismo comportamiento (transición directa), ahora alcanzable desde el estado real de creación. **No se rediseña** la colección de múltiples cotizaciones manuales antes de avanzar a aprobación — eso queda para la Fase 13 (comparación por ítem).
- `RfqService.send()` (`rfq.service.ts:191-247`) no cambia: ya transiciona RFQ `DRAFT→SENT` y solicitud `→PENDING_QUOTES`; antes partía de una solicitud ya adelantada a `PENDING_QUOTES`, ahora parte de `DRAFT` real — el efecto observable es el mismo, solo que ahora es alcanzable desde el inicio real del ciclo de vida.
- Sin cambios en `reject`/`cancel`/edición: sus allowlists ya incluían `DRAFT` (líneas 262, 296, 313, 453) — el enum siempre lo asumió.

### 4.2 Entrada y bifurcación (frontend)

- `canStartRfq` (`RfqInvitationsPanel.tsx:74`) no cambia — se vuelve alcanzable automáticamente al llegar solicitudes reales en `DRAFT`.
- `canAddQuote` (condición de habilitación del formulario "Nueva oferta" en `PurchaseRequestWorkbenchDrawer.tsx`) se amplía para incluir `DRAFT`, habilitando el camino "cotizar sin RFQ" que `getPurchaseNextAction()` ya anuncia mediante su copy pero que hoy no está disponible.
- `getPurchaseNextAction()` (`purchase-workbench.ts`): el `suggestedTab` que hoy apunta a `rfq` o `quotes` según el caso pasa a apuntar al nuevo valor único `cotizar` (ver 4.3).

### 4.3 Fusión de pestañas → "Cotizar"

- `PurchaseWorkbenchTab` (`purchase-workbench.ts:6-14`) baja de 8 a 7 valores: los dos valores `rfq` y `quotes` se fusionan en uno, `cotizar`. Se actualiza `PURCHASE_WORKBENCH_TAB_LABELS`.
- El panel fusionado reemplaza el render actual de `RfqInvitationsPanel` (`PurchaseRequestWorkbenchDrawer.tsx:526-535`, pestaña `rfq`) y de `QuoteComparisonPanel` (pestaña `quotes`), con dos zonas dentro de la misma pestaña:
  - **"Invitar proveedores"** (RFQ, opcional): contenido funcional actual de `RfqInvitationsPanel.tsx` sin cambios de lógica (crear ronda, invitar vía `SupplierMultiPicker`, enviar, cerrar, declinar invitación, descargar PDF).
  - **"Ofertas registradas"**: contenido funcional actual de `QuoteComparisonPanel.tsx` sin cambios de lógica (lista de `SupplierQuote`, vengan de RFQ o registradas a mano; selección alimenta `AwardLinesPanel`).
- **El layout visual exacto** (orden de zonas, si son colapsables, spacing, breakpoints) **no se fija en esta spec** — es responsabilidad de AI-PROD-UX (flujo) + AI-DS-OWNER (contrato de componente) en la etapa 2 del workflow (`Protocolo_Colaboracion_Multiagente_v1.md` §3). Esta spec fija únicamente la estructura funcional y el criterio de fusión, consistente con el límite del rol AI-EM-ARCH de no diseñar interfaces detalladas.

### 4.4 Solicitudes existentes y copy del estado vacío

- Las solicitudes que ya están en `PENDING_QUOTES` o más allá sin RFQ asociada (dato histórico previo a este fix) seguirán sin poder abrir una RFQ retroactiva — habilitar eso es la pregunta de "múltiples rondas de RFQ" (Fase 11), explícitamente fuera de esta fase.
- El copy del estado vacío de la zona "Invitar proveedores" cambia: de *"Sin ronda activa" / "No hay una solicitud de cotización activa para esta compra"* (suena a acción rota) a un mensaje que describa el hecho sin implicar un error, p. ej. *"Esta solicitud se está cotizando sin una ronda formal de RFQ."* — copy final a cargo de AI-PROD-UX.

## 5. Fuera de alcance de esta fase

| Ítem | Fase futura | Motivo |
| --- | --- | --- |
| Envío real al proveedor (email/WhatsApp) | Fase 12 | Deprioritizado explícitamente por el usuario ("con la descarga del PDF es suficiente por ahora"); requiere infraestructura nueva (cola BullMQ + `MailerService`) y ADR propio (revierte una exclusión explícita de ADR-051) |
| Múltiples rondas de RFQ | Fase 11 | Riesgo dejado pendiente en ADR-051; requiere decisión de producto sobre historial de rondas |
| Comparación de ofertas por ítem | Fase 13 | Cambia el contrato de datos de `SupplierQuote` (hoy por total); mayor alcance, cascada a `AwardLinesPanel` |
| Filtro de proveedores por rubro en `SupplierMultiPicker` | Sin fase asignada (idea suelta) | No forma parte de ningún compromiso de roadmap actual |

**Preparación para Fase 12 (no implementación):** el diseño mantiene "enviar RFQ" como un cambio de estado explícito y auditable (`DRAFT→SENT`) en vez de fusionarlo con la creación de la ronda — esto deja el punto de enganche listo para una cola BullMQ (patrón `SearchQueueModule`/`SearchQueueService`, `apps/api/src/modules/search/search-queue.*`) sin rediseñar el flujo cuando se aborde Fase 12.

## 6. Impacto declarado

- **Multi-tenant:** sin impacto — no se tocan boundaries de tenant; todos los servicios afectados ya usan `TenantContext.getOrThrow()` + `runInTenantSchema`.
- **Seguridad:** sin impacto — no se agregan endpoints ni se cambian roles (`@Roles(ADMIN, NOC, SUPPORT)` se mantiene); no hay PII nueva en juego.
- **Escala:** sin impacto — cambio de valor de enum por defecto y de una condición de máquina de estados; no agrega consultas ni cambia cardinalidad.
- **Regulación:** sin impacto — no toca DIAN/CRC/MinTIC/Ley 1581.
- **Datos:** sin migración de schema — `PurchaseRequestStatus.DRAFT` ya existe en el enum compartido (`@iwana/shared`); no se agregan columnas ni tablas.

## 7. Autorrevisión (skill `brainstorming`)

- **Placeholders:** ninguno pendiente — todas las secciones tienen contenido concreto citando archivo y línea.
- **Consistencia interna:** §3 depende de §4.1 (justificado en el propio §3); §5 no contradice §4 (explícitamente fuera de alcance vs. lo que sí se implementa).
- **Alcance:** acotado a un solo cambio de máquina de estados + una fusión de UI sin cambio de contrato de datos; no requiere descomposición adicional.
- **Ambigüedad:** el único punto ambiguo detectado (estado real de cierre de Fase 07) se declaró explícitamente como bloqueo de gobernanza en §1, no se resolvió por conveniencia.
