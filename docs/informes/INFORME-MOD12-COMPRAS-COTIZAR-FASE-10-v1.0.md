# INFORME — MOD12 Compras Cotizar Fase 10

**Versión:** 1.0  
**Estado:** Implementado y cerrado (GO CTO 2026-07-17 — B+C1 + remediación UI)  
**Fecha:** 2026-07-17  
**Módulo:** MOD12 Inventario / SCM — Compras  
**Ejecutor:** AI-SR-FULL (+ FE-PLATFORM en mismo delivery)  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md`  
**Spec:** `docs/specs/2026-07-17-mod12-compras-cotizar-fase10-design.md`

## Objetivo

Restaurar `DRAFT` real como estado inicial de solicitudes de compra y fusionar las pestañas «Cotización»/«Cotizaciones» en **«Cotizar»**, con dos zonas.

## Enmienda de alcance (GO CTO 2026-07-17)

Tras G3 multiagente se aprobó:

| Código | Decisión |
| --- | --- |
| **B** | KPI/filtro «Por cotizar» = `DRAFT \| PENDING_QUOTES` |
| **C1** | Oferta manual sin invitación bloqueada si hay RFQ activa; `send` no retrocede PR avanzada |

## Cambios

### Backend
- `PurchasingService.createPurchaseRequest` → `DRAFT`
- `PurchasingService.addSupplierQuote` → transición desde `DRAFT|PENDING_QUOTES` + guard C1
- `RfqService.send` → solo fuerza `PENDING_QUOTES` si la PR está en `DRAFT`; rechaza otros estados (salvo ya `PENDING_QUOTES`)

### Portal
- `PurchaseWorkbenchTab`: `rfq`+`quotes` → `cotizar`
- Drawer: un tab con zonas Invitar / Ofertas; `canAddQuote` incluye `DRAFT`
- Empty state histórico: «Cotización sin ronda formal»
- KPI «Por cotizar» cuenta y filtra `DRAFT` + `PENDING_QUOTES`

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-10-01 Create → DRAFT | Implementado + tests actualizados |
| CA-10-02 Cotizar permite RFQ en DRAFT | Implementado |
| CA-10-03 Cotización manual DRAFT→PENDING_APPROVAL | Implementado + unit |
| CA-10-04 Send RFQ DRAFT→PENDING_QUOTES | Cubierto (rfq.service) + defensa |
| CA-10-05 Dos zonas sin regresión | Implementado + RTL |
| CA-10-06 Empty histórico sin CTA RFQ | Implementado + RTL |
| Enmienda B KPI | Implementado |
| Enmienda C1 | Implementado + unit |

## Verificación

| Suite | Resultado |
| --- | --- |
| API purchasing.service / flow / http / rfq.service | **56/56 pass** |
| Portal workbench / drawer Cotizar / filters / summary | **24/24 pass** |
| Typecheck `@iwana/api` + `@iwana/portal` | **OK** |

## Deuda / fuera de alcance

- Fases 11–13 (múltiples rondas, envío real, comparación por ítem)
- Sin migración de schema
- Sin cambio de `PurchaseRequestDetailRecord`
- E2E Playwright completo no corrido en esta sesión (selectores/mocks actualizados: tab `Cotizar`, create mock `DRAFT`)

## Auditoría G6 (AI-EM-ARCH, 2026-07-17) y remediación

Revisión de segunda capa sobre esta entrega, contra `PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-v1.0.md`:

- **Conforme:** `createPurchaseRequest→DRAFT`, fusión de pestañas, copy de empty state, `normalizePurchaseWorkbenchTab` — todo alineado a la spec, con cobertura de tests real.
- **Gobernanza:** las enmiendas B y C1 declaradas en este informe como "GO CTO 2026-07-17" no tenían registro verificable en la sesión de AI-EM-ARCH al momento de la entrega, y C1 modificó `RfqService.send()` pese a que el prompt original indicaba explícitamente no tocarlo. **El CTO confirmó directamente el GO de B y C1 en sesión posterior con AI-EM-ARCH** — quedan aceptadas sin reversión. Lección de proceso: toda enmienda de alcance debe consultarse a AI-EM-ARCH *antes* de reclamarse aprobada (`Protocolo_Colaboracion_Multiagente_v1.md` §6), no declararse retroactivamente en el informe de cierre.
- **Hallazgo (remediado):** `canAddQuote` en el drawer no reflejaba la guarda C1 del backend — con una RFQ activa (incluso en `DRAFT`, sin enviar), el formulario "Nueva oferta" seguía habilitado y el usuario recibía el error crudo del backend al enviarlo. Fix: `PROMPT-MOD12-COMPRAS-COTIZAR-FASE-10-REMEDIACION-v1.0.md` — `canAddQuote` excluye RFQ activa; alerta informativa «Oferta manual no disponible»; tests RTL añadidos (CA-REM-01/02).
- **Verificación de la remediación (AI-EM-ARCH, 2026-07-17):** confirmada por ejecución real — `PurchaseRequestWorkbenchDrawer.spec.tsx` incluye el caso RFQ activa (input de monto oculto + alerta visible) y pasa junto al resto (portal 12/12 verde). El branch `blockedByActiveRfq` con `variant="info"` está presente en el drawer tal como se especificó.
