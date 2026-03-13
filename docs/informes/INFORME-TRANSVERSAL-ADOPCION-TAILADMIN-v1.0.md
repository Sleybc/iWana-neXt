# INFORME — Adopcion Transversal de TailAdmin

**Version:** 1.0
**Estado:** FASE-01 Ejecutada
**Fecha creacion:** 2026-03-13
**Fecha ultima actualizacion:** 2026-03-13
**Modo activo:** Mixto
**Agente responsable:** AI-EM-ARCH / Sr. Dev Fullstack
**Referencia al prompt de ejecucion:** `docs/prompts/PROMPT-TRANSVERSAL-ADOPCION-TAILADMIN-FASE-01-v1.0.md`

---

## 1. Contexto

Se documento la arquitectura y la ejecucion por fases para adaptar el shell de dashboard de iWana neXt a la referencia TailAdmin ya disponible en `docs/prototipo/tailadmin/`.

La Fase 01 ha sido ejecutada. Se implemento el shell base compartido para `apps/web` y `apps/portal`, incluyendo sidebar con colapso desktop / drawer mobile, header sticky, dark mode funcional y dropdown de usuario accesible.

En este corte se aplico una correccion incremental de accesibilidad y calidad sobre el shell implementado. La correccion del prototipo TailAdmin documentado en `docs/prototipo/tailadmin/` queda pendiente para una sesion posterior.

---

## 2. Artefactos generados — Corte arquitectonico

| Artefacto | Archivo | Estado |
| --- | --- | --- |
| ADR de adopcion | `docs/adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md` | En revision |
| HLD transversal | `docs/hlds/HLD-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md` | En revision |
| Plan por fases | `docs/sprints/PLAN-TRANSVERSAL-ADOPCION-TAILADMIN-v1.0.md` | En revision |
| Prompt arquitectonico origen | `docs/prompts/PROMPT-ARCHITECT-TRANSVERSAL-ADOPCION-TAILADMIN.md` | Generado |
| Prompt de ejecucion Fase 01 | `docs/prompts/PROMPT-TRANSVERSAL-ADOPCION-TAILADMIN-FASE-01-v1.0.md` | Ejecutado |

---

## 3. Artefactos generados — Fase 01 (implementacion)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| ThemeProvider | `packages/ui/src/components/ThemeProvider.tsx` | Nuevo — dark mode funcional, persiste en localStorage, respeta prefers-color-scheme |
| Exportacion @iwana/ui | `packages/ui/src/index.ts` | Actualizado — exporta ThemeProvider y useTheme |
| globals.css | `packages/ui/src/styles/globals.css` | Actualizado — variante dark Tailwind 4, utilitario no-scrollbar |
| Root layout web | `apps/web/src/app/layout.tsx` | Actualizado — integra ThemeProvider, suppressHydrationWarning |
| Root layout portal | `apps/portal/src/app/layout.tsx` | Actualizado — integra ThemeProvider, suppressHydrationWarning |
| DashboardLayout web | `apps/web/src/app/dashboard/layout.tsx` | Refactorizado — estado desktop (sidebarDesktopCollapsed) y mobile (sidebarMobileOpen) separados |
| DashboardLayout portal | `apps/portal/src/app/dashboard/layout.tsx` | Refactorizado — misma separacion de estado |
| Sidebar web | `apps/web/src/components/layout/Sidebar.tsx` | Refactorizado — colapso desktop con persistencia localStorage, drawer mobile, aria-label, Escape, sin linea divisoria en bloque logo/nombre y sin boton interno de colapso |
| Sidebar portal | `apps/portal/src/components/layout/Sidebar.tsx` | Refactorizado — misma logica, nav items propios del suscriptor, sin linea divisoria en bloque logo/nombre y sin boton interno de colapso |
| TopHeader web | `apps/web/src/components/layout/TopHeader.tsx` | Refactorizado — props desacopladas, buscador claro, normalizado a Tailwind 4 valido, boton hamburguesa visible en desktop para colapso lateral |
| TopHeader portal | `apps/portal/src/components/layout/TopHeader.tsx` | Refactorizado — misma estructura, placeholder propio del portal, boton hamburguesa visible en desktop para colapso lateral |
| ThemeToggle web | `apps/web/src/components/layout/ThemeToggle.tsx` | Nuevo — usa useTheme, Sun/Moon accesible |
| ThemeToggle portal | `apps/portal/src/components/layout/ThemeToggle.tsx` | Nuevo — misma implementacion |
| DropdownUser web | `apps/web/src/components/layout/DropdownUser.tsx` | Refactorizado — aria-expanded, aria-haspopup, role=menu, Escape, click externo |
| DropdownUser portal | `apps/portal/src/components/layout/DropdownUser.tsx` | Refactorizado — mismo patron accesible |
| MetricCard web | `apps/web/src/components/dashboard/MetricCard.tsx` | Verificado (preexistente) — actualmente sin inline styles y con mapeo de tonos por clases; no modificado en esta sesion |
| TailAdmin prototipo | `docs/prototipo/tailadmin/src/**` | No ejecutado en esta sesion — persisten metas viewport restrictivos (`user-scalable=no`, `maximum-scale=1.0`) y queda pendiente de correccion |

---

## 4. Decisiones de implementacion

- **Dark mode:** implementado con `ThemeProvider` en `packages/ui` usando la clase `dark` en `<html>`. Compatible con Tailwind 4 CSS-first via `@variant dark`. No requiere dependencia adicional.
- **Estado sidebar:** separado en `sidebarDesktopCollapsed` (persistido en localStorage por cada app) y `sidebarMobileOpen` (transitorio). Clave distinta por app: `iwana-web-sidebar-collapsed` / `iwana-portal-sidebar-collapsed`.
- **Overlay mobile:** el layout inyecta un overlay semitransparente cuando el drawer mobile esta abierto. El sidebar no maneja su propio overlay para mantener la separacion de responsabilidades.
- **Clases fantasma eliminadas:** `dark:bg-boxdark`, `dark:bg-boxdark-2`, `dark:text-bodydark`, `border-stroke`, `shadow-2`, `z-99999`. Reemplazadas por clases validas de Tailwind 4 + tokens iWana.
- **Identidad iWana conservada:** `bg-iwana-primary` (#17163A) para el sidebar, `text-iwana-secondary` (#A5C330) para items activos.
- **Accesibilidad:** `aria-label`, `aria-expanded`, `aria-controls`, `aria-haspopup`, `role=menu`, `role=menuitem`, cierre por Escape y click externo en todos los componentes interactivos.
- **Control de sidebar en header:** el icono de tres lineas se muestra tanto en mobile como en desktop; en desktop controla `sidebarDesktopCollapsed` y en mobile controla `sidebarMobileOpen`.
- **Fuente unica de colapso:** se retiro el boton chevron interno del sidebar para evitar doble control; el unico disparador de colapso/expansion queda en el header.
- **Correccion HTML de referencia:** pendiente en esta sesion para `docs/prototipo/tailadmin/src/**`; la verificacion detecta que aun existen restricciones de zoom en viewport.
- **Calidad CSS:** `MetricCard` deja de usar estilos inline y la utilidad `no-scrollbar` elimina la propiedad que generaba warning de compatibilidad en el analizador usado por el equipo.

---

## 5. Criterios de aceptacion — resultado

| Criterio | Estado |
| --- | --- |
| CA-TA-001: apps/web y apps/portal comparten patron de shell | CUMPLIDO |
| CA-TA-002: sidebar colapsa en desktop y es drawer overlay en mobile | CUMPLIDO |
| CA-TA-003: dark mode cambia realmente el tema | CUMPLIDO |
| CA-TA-004: buscador con jerarquia visual clara | CUMPLIDO |
| CA-TA-005: menu usuario abre, cierra con Escape y click externo | CUMPLIDO |
| CA-TA-006: typecheck pasa en ambas apps sin errores nuevos | CUMPLIDO |
| CA-TA-007: issues criticos de accesibilidad reportados en header/dropdown quedan corregidos | CUMPLIDO |

---

## 6. Deuda tecnica identificada en Fase 01

| ID | Descripcion | Fase recomendada |
| --- | --- | --- |
| DT-TA-01 | DropdownUser muestra nombre de usuario hardcodeado — debe conectarse al AuthProvider | FASE-02 o cuando se integre AuthProvider |
| DT-TA-02 | Notificaciones son un placeholder — necesitan estado real | FASE-02 |
| DT-TA-03 | Buscador no tiene accion real — solo affordance visual | FASE-02 |
| DT-TA-04 | Los HTML de prototipo de login en `docs/identity/` y `docs/prototipo/` conservan estilos inline por ser artefactos visuales de referencia; su saneamiento completo no afecta runtime | Baja prioridad |

---

## 7. Proxima accion recomendada

Ejecutar FASE-02: adaptar dashboard admin de `apps/web` con metric cards, paneles y tabla principal.

---

## 8. Pendientes de gobernanza

- Aprobacion del ADR-023 por CTO Humano.
- Validacion manual desktop/mobile del shell (responsabilidad del equipo de QA / CTO).
