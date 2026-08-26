# INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0

## Auditoría de identidad, accesibilidad, copy y UX — detalle de oportunidad y suscriptores

**Versión:** 1.0  
**Estado:** Vigente  
**Fecha:** 2026-08-19  
**Modo activo:** Ejecutor  
**Autor de consolidación:** Cursor  
**Módulo:** MOD05 — CRM (detalle de oportunidad + suscriptores)  
**Superficie:** `/dashboard/crm/expedientes/[id]` y `/dashboard/crm/subscribers`  
**Skills aplicadas:** `iwana-identity-ui-review` · `system-vocabulary-review` · `docs-architect`

**Artefactos relacionados:**

- [INFORME-MOD05-CRM-LANDING-AUDITORIA-UIUX-v1.0](./INFORME-MOD05-CRM-LANDING-AUDITORIA-UIUX-v1.0.md) — landing ya remediada
- [PRD-MOD05-CRM-DEFINICION-v2.0](../prds/PRD-MOD05-CRM-DEFINICION-v2.0.md)
- [ADR-065 — Paginación numerada y orden por columna](../adrs/ADR-065-Paginacion-Numerada-Tablas-Operativas.md)
- Vocabulario de producto: `Expediente*` → **oportunidad**; `Subscriber*` → **suscriptor**

---

# Review UI — Detalle de oportunidad y suscriptores (MOD05)

## Resumen ejecutivo

Esta entrega continúa la realineación de la landing CRM sobre las dos superficies que quedaron fuera de alcance: el **detalle de oportunidad** y **suscriptores**. La tarea del detalle es completar, avanzar y abrir la ficha; la de suscriptores es encontrar o crear un suscriptor y abrirlo.

El listado de suscriptores ya tenía ADR-065; el problema era composición (header «Radar»), búsqueda sin primitiva, spinner de tabla y copy con «CRM». El detalle mezclaba expediente / pipeline / Originador / UUID, pestañas lima (navegación, no avance) y carga con spinner de página.

**Modo:** código.  
**Script (archivos remediados):** 0 deterministas · 0 heurísticos confirmados.  
**Puntaje post-remediación (superficies tocadas):** 100/100 (P0: 0, P1: 0, P2: 0, P3: 0 en `audit-ui.mjs` sobre header, tabs, listado, detalle y conversión).

---

## 1. Alcance y método

### 1.1 Alcance

- Detalle de oportunidad: header, tabs, copy visible, estados de carga/error, timeline, seguimiento, banner de conversión.
- Listado de suscriptores: panel operativo, búsqueda, vacíos, skeleton, copy.
- Detalle de suscriptor: header, tabs, vínculo a oportunidad de origen (sin UUID).

**Fuera de alcance:** reescritura de las 8 secciones de captura, drawers de contrato, TaxProfileBlock, Programación/WFM.

### 1.2 Fuentes de evidencia

| Fuente | Resultado |
| --- | --- |
| `audit-ui.mjs` sobre header/tabs/listado/detalle remediados | 0 P0 · 0 P1 · 0 P2 · 0 P3 |
| Jest | `page.spec.tsx` detalle + `ExpedienteConversionBanner` + `SubscribersListClient` en verde |
| Playwright | banner de conversión + seguimiento (Asesor de origen / Estados) en verde |
| Typecheck portal | `tsc --noEmit` exit 0 |

---

## Hallazgos críticos (P0)

Ninguno.

---

## Hallazgos (diagnóstico — remediados)

### [P1][Identidad] Pestañas lima en detalle (oportunidad y suscriptor)

- **Evidencia (antes):** `ExpedienteTabsContainer` / `SubscriberTabsContainer` con `border-iwana-secondary` y barra lima. El lima es avance, no navegación de módulo.
- **Remediación:** `portalTabActiveClassName` / `portalTabInactiveClassName` (underline navy), `role="tablist"`, `interactiveFocusClassName`.
- **Esfuerzo:** S
- **Estado:** cerrado.

### [P1][Accesibilidad] Búsqueda de suscriptores sin primitiva de label

- **Evidencia (antes):** `Input` con `aria-label` y `items-end` frente a selects con label visible.
- **Remediación:** `PortalSearchField` (`label="Buscar suscriptor"`); filtros con `aria-label` y `lg:items-center`.
- **Esfuerzo:** S
- **Estado:** cerrado.

### [P2][Copy] Detalle: expediente / pipeline / Originador / UUID

| Antes | Ahora |
| --- | --- |
| Originador | Asesor de origen |
| Acciones de pipeline / filtro Pipeline | Acciones de estado / Estados |
| Este expediente ya fue convertido… | Esta oportunidad ya fue convertida… |
| Subtítulo con UUID recortado | Sin UUID |
| Volver al listado | Volver a oportunidades |
| Nuevo potencial (select) | Nuevo (alineado a `EXPEDIENTE_STATUS_META`) |

- **Estado:** cerrado en la superficie de detalle y seguimiento.

### [P2][Copy] Suscriptores: CRM en UI y origen con UUID

| Antes | Ahora |
| --- | --- |
| Radar de suscriptores / CRM · Suscriptores | Título de página + «Suscriptor de la empresa» |
| Origen del expediente + UUID completo | Oportunidad de origen (estado + enlace, sin código) |
| Ir al expediente origen | Abrir oportunidad de origen |
| Interés comercial del expediente | Interés comercial de la oportunidad |

- **Estado:** cerrado.

### [P2][UX] Spinner de página/tabla

- **Remediación:** `PortalSkeletonBlock` en detalle, `loading.tsx` de ruta, listado y detalle de suscriptor; `PortalEmptyState` con CTA en el listado; `PortalAlert` de error con reintentar.
- **Estado:** cerrado en las cargas primarias tocadas.

### [P3][Identidad] Texto lima sin sufijo AA en viabilidad técnica

- **Evidencia:** estrella `text-iwana-secondary` y hover equivalente.
- **Remediación:** `text-iwana-secondary-700`.
- **Estado:** cerrado. El hex del marcador Leaflet (`#6A7A1C`) permanece: Leaflet no consume tokens Tailwind; no se puntúa como deuda nueva de esta fase.

## Quick wins

Ejecutados: copy de tabs/timeline/banner, `PortalSearchField`, skeleton de listado, tabs navy.

## Mejoras estratégicas

Ninguna primitive nueva. Tabs de detalle reutilizan el mismo contrato visual que la landing de oportunidades.

## Por verificar

1. Contraste computado en navegador.
2. Copy residual en Programación (`Este expediente ya tiene un evento…`) — cerrado en [INFORME-MOD09-PROGRAMACION-AUDITORIA-UIUX-v1.0](./INFORME-MOD09-PROGRAMACION-AUDITORIA-UIUX-v1.0.md).
3. Spinners de acción puntual en paneles de consentimiento/contacto/contratos: no son carga primaria de página.

## Veredicto

**Aprobada** en las superficies remediadas. El comercial abre una oportunidad sin UUID ni «pipeline» en botones; el listado de suscriptores usa el mismo panel operativo que Usuarios/Oportunidades.

---

## 2. Verificación ejecutada

| Comando | Resultado |
| --- | --- |
| `audit-ui.mjs` (archivos remediados) | `{ P0:0, P1:0, P2:0, P3:0 }` |
| Jest detalle + conversión + listado suscriptores | 14 passed (`page.spec` + `SubscribersListClient`) |
| Playwright (banner conversión + seguimiento) | 4 passed |
| `tsc --noEmit` portal | exit 0 |

---

## 3. Decisión y disposición

**Decisión:** aprobar detalle de oportunidad y listado/detalle de suscriptores tras la realineación de copy y primitivas.

**Disposición:**

- Conservar `Expediente*` / `pipeline` en tipos, rutas y API.
- No reintroducir lima como indicador de pestaña activa.
- No mostrar UUID de oportunidad en subtítulos ni fichas 360.
- No colocar botones en `PageHeader` ni en el encabezado de `PortalPanel` (alta de suscriptor en el cuerpo del panel).

---

## 4. Límites

- No se reescribieron las secciones de captura ni los diálogos de contrato más allá del copy visible.
- Esta revisión no sustituye una auditoría WCAG formal ni E2E de todo CRM.

**Veredicto final:** **Aprobada — 0 P0 · 0 P1 · 0 P2 · 0 P3 accionables** en los archivos remediados.

No se incluyen PII, secretos, credenciales ni tokens en este informe.
