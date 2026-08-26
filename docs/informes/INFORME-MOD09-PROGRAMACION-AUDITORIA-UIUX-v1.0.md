# INFORME-MOD09-PROGRAMACION-AUDITORIA-UIUX-v1.0

## Auditoría de identidad, accesibilidad, copy y UX — Programación

**Versión:** 1.1  
**Estado:** Vigente  
**Fecha:** 2026-08-19  
**Modo activo:** Ejecutor  
**Autor de consolidación:** Cursor  
**Módulo:** MOD09 — Programación  
**Superficie:** `/dashboard/scheduling`, agenda, visitas pendientes y formulario de evento  
**Skills aplicadas:** `iwana-identity-ui-review` · `system-vocabulary-review` · `docs-architect`

**Artefactos relacionados:**

- [INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0](./INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0.md) — residual de copy que originó esta entrega
- [PRD-MOD09-PROGRAMACION-WFM-v1.0](../prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md)
- Vocabulario de producto: `Expediente*` → **oportunidad**; origen `CRM` → **Oportunidades**; `WFM` no se expone en UI

---

# Review UI — Programación (MOD09)

## Resumen ejecutivo

Esta entrega cierra el residual de copy que quedó en Programación tras la realineación de CRM: mensajes, labels de origen y ayudas del formulario hablaban de expediente, CRM, UUID y dashboard WFM. Las pantallas ya usaban `PortalPanel`, `PortalAlert`, `PortalEmptyState` y `PortalSkeletonBlock`; no hacía falta recomponer el calendario ni la matriz.

**Modo:** código.  
**Script (archivos remediados):** 0 deterministas · 0 heurísticos confirmados.  
**Puntaje post-remediación (superficies tocadas):** 100/100 (P0: 0, P1: 0, P2: 0, P3: 0 en `audit-ui.mjs`).

---

## 1. Alcance y método

### 1.1 Alcance

- Copy visible de agenda, visitas pendientes, formulario de evento y lista de carga de campo.
- Labels de origen comercial (`WorkOrderSourceContext.CRM` → Oportunidades).
- Humanización de descripciones legacy con UUID / «expediente» / «desde CRM».
- Sustitución del recuadro dashed de resumen ausente por `PortalAlert`.

**Fuera de alcance:** rediseño de calendario, matriz semanal, drawers de OT y orquestación interna (`expedienteId`, rutas, enums de API).

### 1.2 Fuentes de evidencia

| Fuente | Resultado |
| --- | --- |
| `audit-ui.mjs` sobre archivos remediados | 0 P0 · 0 P1 · 0 P2 · 0 P3 |
| Jest Programación tocado | 9 suites en verde (`scheduling-ui`, sync, bandeja, calendario, carga de campo, cliente, drawer) |
| Typecheck portal | `tsc --noEmit` exit 0 |
| Playwright | no re-ejecutado en esta sesión; se actualizó el assert de copy en `portal-wfm-scheduling.spec.ts` |

---

## Hallazgos críticos (P0)

Ninguno.

---

## Hallazgos (diagnóstico — remediados)

### [P1][Copy] Expediente / CRM / UUID en mensajes y formulario

- **Evidencia (antes):** «Este expediente ya tiene un evento…», «Modo CRM asistido», helpers con «UUID» y «expediente CRM», origen visible `CRM`.
- **Remediación:** oportunidad / perfil / identificador válido; origen `Oportunidades`; humanizer de descripciones legacy en `getSchedulingVisibleDescription`.
- **Esfuerzo:** S
- **Estado:** cerrado.

### [P2][Copy] Siglas internas WFM / OT / Aseguramiento en UI operativa

- **Evidencia (antes):** «dashboard WFM», badge «OT activas», origen «Aseguramiento» distinto de «Mesa de ayuda» en la bandeja; drawer y CTA «Abrir OT».
- **Remediación:** alerta de carga de campo, badge «Órdenes activas», origen unificado a «Mesa de ayuda»; drawer y resumen compartido hablan de **orden de trabajo** / **ejecución en Operaciones**.
- **Esfuerzo:** S
- **Estado:** cerrado en Programación y en `ExecutionOrderSummary` (fuente del CTA). El drawer completo de Operaciones (MOD11) conserva «Cerrar OT» y similares.

### [P2][Ingeniería frontend] Resumen ausente sin primitiva

- **Evidencia (antes):** recuadro dashed ad hoc en `TechnicianWorkList`.
- **Remediación:** `PortalAlert` variant `info`.
- **Esfuerzo:** S
- **Estado:** cerrado.

## Quick wins

Ejecutados: labels de origen, mensajes de bootstrap CRM→oportunidad, validación sin UUID, alerta de carga, reason de timeline «Instalación agendada desde Programación.».

## Mejoras estratégicas

Ninguna primitive nueva. El calendario y la matriz quedan para una auditoría visual aparte.

## Por verificar

1. Contraste computado en navegador.
2. Copy de «OT» en el drawer de Operaciones (`Cerrar OT`, título `OT`, timeline) — MOD11.
3. Playwright de instalación desde oportunidad y del CTA «Abrir orden de trabajo».

## Veredicto

**Aprobada** en copy y primitivas tocadas. El comercial y operaciones ven oportunidad, no expediente ni CRM, al agendar desde el flujo comercial.

---

## 2. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `audit-ui.mjs` (archivos remediados) | `{ P0:0, P1:0, P2:0, P3:0 }` |
| Jest Programación + resumen de orden | 5 suites passed (drawer, resumen, cliente, formulario, diálogo de tarea) + drawer 30/30 |
| `tsc --noEmit` portal | exit 0 |

---

## 3. Decisión y disposición

**Decisión:** aprobar Programación tras la realineación de copy y la alerta de carga.

**Disposición:**

- Conservar `expedienteId`, `WorkOrderSourceContext.CRM` y rutas `/dashboard/scheduling*` en API y query params.
- No reintroducir «CRM», «expediente», «UUID» ni «OT» en textos visibles de Programación.
- Conservar códigos de documento (`OT-001`) como identificador, no como copy.
- El drawer de ejecución de Operaciones (MOD11) queda fuera de esta entrega.

---

## 4. Límites

- No se reescribió el command center ni el drawer de ejecución de Operaciones (MOD11).
- Esta revisión no sustituye una auditoría WCAG formal ni E2E completo de Programación.

**Veredicto final:** **Aprobada — 0 P0 · 0 P1 · 0 P2 · 0 P3 accionables** en los archivos remediados.

No se incluyen PII, secretos, credenciales ni tokens en este informe.
