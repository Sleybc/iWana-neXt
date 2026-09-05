# INFORME MOD-OPS — Colapso del formulario "Registrar nueva actividad" con actividades registradas

**Versión:** 1.0
**Fecha:** 2026-09-01
**Módulo:** Operations — drawer de orden de trabajo (`apps/portal`, superficie `/dashboard/operations?executionOrderId=…`)
**Modo de sesión:** Orquestador AI-EM-ARCH (perfil v2.4) — plan aprobado por el CTO; implementación delegada a AI-FE-PLATFORM
**Estado:** Cerrado — gates en verde

---

## 1. Síntoma y decisión

En el drawer de la OT, sección "Trabajo realizado", el formulario **"Registrar nueva actividad"** permanecía siempre expandido aunque ya existieran actividades registradas, ocupando espacio permanentemente. Decisión aprobada: mantener el punto de entrada visible pero **replegado** cuando hay actividades; expandido solo sin actividades (descubribable) o bajo demanda.

## 2. Comportamiento implementado

- **Sin actividades:** formulario expandido (sin toggle ni "Ocultar").
- **Con actividades:** formulario replegado; botón **"Registrar nueva actividad"** con `aria-expanded="false"` lo despliega; botón ghost **"Ocultar"** lo repliega.
- **Tras registrar con éxito:** el formulario se repliega automáticamente y el foco vuelve a la lista.
- La edición inline de actividades (por tarjeta) no cambió; el copy reutilizado es exacto ("Registrar nueva actividad", "Ocultar").

## 3. Cambios (solo apps/portal, sin backend ni contrato)

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx` | Estado `isActivityFormExpanded` + derivado `activityFormExpanded = activities.length === 0 \|\| isActivityFormExpanded` (sin efectos de sincronización; si se eliminan todas las actividades vuelve a expandido por derivación). Toggle `variant="secondary"` con `aria-expanded`; "Ocultar" ghost junto al submit solo con actividades; `handleRegisterActivity` repliega tras éxito. |
| `apps/portal/src/components/operations/ExecutionOrderDrawer.spec.tsx` | 4 casos nuevos en `Block 3 — Trabajo realizado`: replegado con actividades, expandir, auto-repliegue tras registrar, expandido sin actividades. Tests existentes intactos (`renderDrawer` usa `activities={[]}` por defecto). |

## 4. Verificación (gates)

| Gate | Resultado |
| --- | --- |
| Typecheck `@iwana/portal` | Sin errores (exit 0) |
| Tests `ExecutionOrderDrawer.spec.tsx` | **121/121** (incluye 4 nuevos) |
| ESLint (archivos tocados) | 0 errores, 0 warnings |
| Review identidad (`iwana-identity-ui-review`, modo review) | **Aprobada — 100/100, 0 hallazgos**; script `audit-ui.mjs` sin hallazgos; variant/tokens del sistema, sin estilos nuevos |
| PII / seguridad / backend | Sin cambios de datos ni contratos; puramente presentacional |

## 5. Impacto

- **Multi-tenant / seguridad:** sin impacto (visibilidad presentacional gated por `canInteract && canRegisterActivity` ya existente).
- **Escala:** sin impacto; reduce altura del drawer en OTs con historial.
- **Regulación:** sin impacto (trazabilidad de actividades intacta).
- **UX:** el ejecutor conserva el punto de entrada visible sin pérdida de espacio; tras registrar vuelve al listado.

## 6. Deuda / observaciones

1. P3 opcional (no puntúa): agregar `aria-controls` en el toggle apuntando al `id` del formulario.
2. El toggle permanece visible con `aria-expanded="true"` junto al formulario desplegado; el repliegue queda a cargo de "Ocultar" y del registro exitoso.
