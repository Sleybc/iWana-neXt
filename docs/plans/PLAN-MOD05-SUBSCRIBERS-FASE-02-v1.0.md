# Plan Tecnico - MOD05 CRM Subscribers Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-17  
**Modo activo:** Mixto

## Trazabilidad

- PRD base: docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0.md
- PRD modulo: docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-v1.0.md
- HLD base: docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md
- Prompt Fase 02: docs/prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-02-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-01-v1.0.md
- Checklist operativo: docs/quality/CHECKLIST-MOD05-SUBSCRIBERS-FASE-02-v1.0.md

---

## Objetivo del sprint

Implementar el frontend completo del modulo Subscribers en el portal empresarial, reutilizando el backend y los schemas compartidos ya existentes, sin introducir nuevos patrones estructurales en el portal ni cambios de alcance en backend.

---

## Decisiones cerradas antes de ejecutar

1. `subscribersApi` se implementa como objeto exportado en `apps/portal/src/lib/api-client.ts`, alineado a `crmApi`.
2. La validacion del formulario reutiliza `CreateSubscriberSchema` y `UpdateSubscriberSchema` desde `@iwana/shared`.
3. `VatTreatmentBanner` es de solo lectura y consume el resultado del backend.
4. La ficha 360 usa stubs para contacts, contracts y habeas data; no se amplian integraciones en esta fase.

---

## Dependencias y blockers

### Blockers explicitos

- Falta `subscribersApi` en `apps/portal/src/lib/api-client.ts`.
- Falta la capa de metadata UI del modulo (`subscriber-ui.ts`).
- La ruta actual de suscriptores sigue siendo un stub de navegacion.

### Dependencias ya resueltas

- Backend con 8 endpoints REST disponible.
- Schemas y enums compartidos disponibles en `packages/shared`.
- Navegacion base y redirect historico ya operativos.

---

## Lanes de ejecucion

### Lane A - Integracion base y contratos

**Prioridad:** P0  
**Responsable sugerido:** Sr. Dev Fullstack

#### BT-SUB-FE2-01 - Tipos y `subscribersApi`

**Archivos objetivo**

- apps/portal/src/lib/api-client.ts

**Criterios de cierre**

- Tipos `SubscriberRecord`, `ListSubscribersParams`, `SearchSubscribersParams` y payloads relacionados disponibles.
- Objeto exportado `subscribersApi` con 8 metodos alineados al backend.
- Uso del mismo envelope y manejo de errores del resto del portal.

#### BT-SUB-FE2-02 - Metadata UI del modulo

**Archivos objetivo**

- apps/portal/src/components/crm/subscribers/subscriber-ui.ts

**Criterios de cierre**

- Metadata de estados, tipos de persona, segmentos, IVA y regimen disponible.
- Helpers de nombre, documento y labels disponibles.
- `ALLOWED_TRANSITIONS` alineado al flujo vigente del backend.

### Lane B - Listado y navegacion funcional

**Prioridad:** P1  
**Responsable sugerido:** Sr. Dev Fullstack

#### BT-SUB-FE2-03 - Listado principal

**Archivos objetivo**

- apps/portal/src/app/dashboard/crm/subscribers/page.tsx
- apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx

**Criterios de cierre**

- Tabla con filtros, busqueda y paginacion.
- CTA a crear nuevo y navegacion al detalle.
- Estados de carga y error consistentes con el portal.

#### BT-SUB-FE2-04 - Navegacion y overview

**Archivos objetivo**

- apps/portal/src/components/crm/CrmOverviewClient.tsx
- apps/portal/src/components/layout/Sidebar.tsx
- apps/portal/src/app/dashboard/subscribers/page.tsx

**Criterios de cierre**

- Sidebar preserva el acceso a suscriptores.
- Redirect historico se mantiene hacia la ruta correcta.
- CRM overview incluye entry point de suscriptores sin reintroducir estados legacy.

### Lane C - Alta, edicion y detalle 360

**Prioridad:** P1  
**Responsable sugerido:** Sr. Dev Fullstack

#### BT-SUB-FE2-05 - Rutas `new` y `[id]`

**Archivos objetivo**

- apps/portal/src/app/dashboard/crm/subscribers/new/page.tsx
- apps/portal/src/app/dashboard/crm/subscribers/[id]/page.tsx

**Criterios de cierre**

- Ambas rutas compilan, exponen metadata correcta y montan sus client components.

#### BT-SUB-FE2-06 - Formulario discriminado

**Archivos objetivo**

- apps/portal/src/components/crm/subscribers/SubscriberForm.tsx
- apps/portal/src/components/crm/subscribers/NaturalPersonFields.tsx
- apps/portal/src/components/crm/subscribers/JuridicaPersonFields.tsx
- apps/portal/src/components/crm/subscribers/SharedPersonFields.tsx
- apps/portal/src/components/crm/subscribers/VatTreatmentBanner.tsx

**Criterios de cierre**

- NATURAL y JURIDICA muestran campos correctos.
- Validacion reutiliza shared schemas.
- Banner IVA solo refleja respuesta backend.

#### BT-SUB-FE2-07 - Detalle 360 y transiciones

**Archivos objetivo**

- apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx
- apps/portal/src/components/crm/subscribers/SubscriberHeader.tsx
- apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx
- apps/portal/src/components/crm/subscribers/SubscriberStatusTransitionDialog.tsx

**Criterios de cierre**

- Detalle consume `get360()`.
- Tabs de modulos futuros quedan como stubs informativos.
- Dialogo de transicion respeta restricciones de razon obligatoria.

### Lane D - Cierre, evidencia y validacion

**Prioridad:** P2  
**Responsable sugerido:** Sr. Dev Fullstack + QA/Testing

#### BT-SUB-FE2-08 - Verificacion tecnica

**Archivos objetivo**

- apps/portal/**
- apps/api/src/modules/crm/subscribers/**

**Criterios de cierre**

- `pnpm --filter @iwana/portal typecheck` limpio.
- `pnpm --filter @iwana/portal lint` limpio.
- Suite puntual de subscribers backend sigue pasando.
- Validacion manual de rutas principales completada.

#### BT-SUB-FE2-09 - Evidencia documental

**Archivos objetivo**

- docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-01-v1.0.md

**Criterios de cierre**

- Informe vivo actualizado con resultado de la ejecucion Fase 02 o addendum de avance.
- Evidencia de decisiones tecnicas y verificacion final registrada.

---

## Paralelismo recomendado

1. Ejecutar `BT-SUB-FE2-01` y `BT-SUB-FE2-02` primero; ambas desbloquean la UI real.
2. Luego abrir en paralelo `BT-SUB-FE2-03`, `BT-SUB-FE2-05` y `BT-SUB-FE2-06`.
3. Cuando existan list y detail, completar `BT-SUB-FE2-04` y `BT-SUB-FE2-07`.
4. Cerrar con `BT-SUB-FE2-08` y `BT-SUB-FE2-09`.

---

## Definition of Done

- Listado, detalle, creacion y edicion disponibles en portal.
- Integracion 100% alineada con los 8 endpoints del backend.
- Sin nuevos patrones ajenos al portal actual.
- Sin recalculo client-side de IVA.
- Sin logs con PII.
- Typecheck y lint del portal limpios.
- Informe vivo actualizado.

---

## Riesgos de alcance

- Si durante la implementacion se requieren endpoints adicionales, eso constituye cambio de alcance y debe revalidarse antes de tocar backend.
- Si se intenta mezclar validacion manual con Zod compartido, aumenta el riesgo de drift funcional y regresiones.
- Si el overview busca metricas agregadas no disponibles con el contrato actual, debe degradarse a CTA simple en vez de forzar cambios backend.