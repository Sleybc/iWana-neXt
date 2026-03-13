# INFORME — Adopcion Transversal de TailAdmin

**Version:** 1.0
**Estado:** Dark Mode Surface #181818 Ejecutado
**Fecha creacion:** 2026-03-13
**Fecha ultima actualizacion:** 2026-03-14
**Modo activo:** Mixto
**Agente responsable:** AI-EM-ARCH / Sr. Dev Fullstack
**Referencia al prompt de ejecucion:** `docs/prompts/PROMPT-TRANSVERSAL-ADOPCION-TAILADMIN-FASE-01-v1.0.md`

---

## 1. Contexto

Se documento la arquitectura y la ejecucion por fases para adaptar el shell de dashboard de iWana neXt a la referencia TailAdmin ya disponible en `docs/prototipo/tailadmin/`.

La Fase 01 ha sido ejecutada. Se implemento el shell base compartido para `apps/web` y `apps/portal`, incluyendo sidebar con colapso desktop / drawer mobile, header sticky, dark mode funcional y dropdown de usuario accesible.

En este corte se ejecuto la FASE-06 de calidad extendida: cobertura E2E para portal suscriptor (`login tenant -> dashboard -> notificaciones -> logout`) y ejecucion consolidada web+portal con checks automáticos básicos de accesibilidad por regiones/labels críticas.

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
| TailAdmin prototipo | `docs/prototipo/tailadmin/src/**` | Corregido — viewport accesible normalizado (`width=device-width, initial-scale=1.0`) y nombres accesibles agregados en controles reportados por axe en `form-elements.html` |

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
- **Correccion HTML de referencia:** ejecutada en `docs/prototipo/tailadmin/src/**`; se eliminaron restricciones de zoom (`user-scalable`, `maximum-scale`, `minimum-scale`) y se agregaron atributos de nombre accesible en los controles reportados por axe.
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
| CA-TA-008: dashboard admin tiene layout asimetrico 2 columnas en desktop | CUMPLIDO |
| CA-TA-009: tabla de tenants tiene busqueda, filtro y ordenamiento | CUMPLIDO |
| CA-TA-010: columna derecha muestra estado del sistema y actividad reciente | CUMPLIDO |
| CA-TA-011: portal suscriptor tiene PageHeader y dark mode correcto | CUMPLIDO |
| CA-TA-012: fondo dark mode base = #181818 (token dark-surface) | CUMPLIDO |
| CA-TA-013: escala completa dark-surface (2,3,4) y dark-border (1,2) en @theme | CUMPLIDO |
| CA-TA-014: componentes @iwana/ui normalizados con dark mode (Card, Badge, ThemeToggle) | CUMPLIDO |
| CA-TA-015: norma anti-gray documentada en globals.css para modulos futuros | CUMPLIDO |

---

## 6. Deuda tecnica identificada en Fase 01

| ID | Descripcion | Fase recomendada |
| --- | --- | --- |
| DT-TA-01 | DropdownUser muestra nombre de usuario hardcodeado — debe conectarse al AuthProvider | RESUELTA en FASE-03 |
| DT-TA-02 | Notificaciones son un placeholder — necesitan estado real | RESUELTA en FASE-03 (admin/web) |
| DT-TA-03 | Buscador no tiene accion real — solo affordance visual | RESUELTA en FASE-04 (admin/web) |
| DT-TA-04 | Los HTML de prototipo de login en `docs/identity/` y `docs/prototipo/` conservan estilos inline por ser artefactos visuales de referencia; su saneamiento completo no afecta runtime | Baja prioridad |

---

## 3b. Artefactos generados — Fase 02 (implementacion)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| PanelCard | `apps/web/src/components/dashboard/PanelCard.tsx` | Nuevo — panel de datos tabulados con filas, encabezados opcionales y pie de accion |
| SystemStatusPanel | `apps/web/src/components/dashboard/SystemStatusPanel.tsx` | Nuevo — grilla 2x2 de indicadores de salud con dot + detalle |
| PageHeader web | `apps/web/src/components/layout/PageHeader.tsx` | Nuevo — reemplaza Header inline, compatible con dark mode |
| PageHeader portal | `apps/portal/src/components/layout/PageHeader.tsx` | Nuevo — misma estructura para portal suscriptor |
| TenantsTable web | `apps/web/src/components/dashboard/TenantsTable.tsx` | Refactorizado — busqueda por nombre/slug, filtro por estado, ordenamiento por columna, estado vacio, contador de resultados |
| Dashboard Page web | `apps/web/src/app/dashboard/page.tsx` | Refactorizado — layout asimetrico 12-col (8+4), iconos lucide, PanelCard de actividad y distribucion |
| Dashboard Page portal | `apps/portal/src/app/dashboard/page.tsx` | Refactorizado — PageHeader, dark mode correcto, iconos lucide en accesos rapidos |

---

## 3c. Artefactos generados — Fase 03 (integracion backend)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| AuthProvider web | `apps/web/src/components/auth/AuthProvider.tsx` | Nuevo — contexto de sesion, bootstrap con token local, login/logout y carga de perfil desde `/auth/me` |
| AuthProvider portal | `apps/portal/src/components/auth/AuthProvider.tsx` | Nuevo — contexto de sesion tenant-aware, login/logout y perfil real desde `/auth/me` |
| Root layout web | `apps/web/src/app/layout.tsx` | Actualizado — integra `AuthProvider` sobre el arbol de app |
| Root layout portal | `apps/portal/src/app/layout.tsx` | Actualizado — integra `AuthProvider` sobre el arbol de app |
| API client web | `apps/web/src/lib/api-client.ts` | Refactorizado — `Authorization: Bearer`, refresh en 401 con `/auth/refresh`, `auth.me`, `auth.logout`, `tenantApi.list` |
| API client portal | `apps/portal/src/lib/api-client.ts` | Refactorizado — bearer + `X-Tenant-Slug`, refresh tenant-aware, `auth.me`, `auth.logout` |
| LoginForm web | `apps/web/src/components/auth/LoginForm.tsx` | Refactorizado — usa `useAuth().login` |
| LoginForm portal | `apps/portal/src/components/auth/LoginForm.tsx` | Refactorizado — usa `useAuth().login` con `tenantSlug` |
| DropdownUser web | `apps/web/src/components/layout/DropdownUser.tsx` | Refactorizado — nombre/hash/rol desde AuthProvider + logout real |
| DropdownUser portal | `apps/portal/src/components/layout/DropdownUser.tsx` | Refactorizado — nombre/hash/rol desde AuthProvider + logout real |
| NotificationBell web | `apps/web/src/components/layout/NotificationBell.tsx` | Nuevo — notificaciones operativas basadas en estado real de `/tenants` |
| TopHeader web | `apps/web/src/components/layout/TopHeader.tsx` | Actualizado — reemplaza placeholder de notificaciones por `NotificationBell` |
| DashboardClient web | `apps/web/src/components/dashboard/DashboardClient.tsx` | Nuevo — consume `/tenants` para metricas, actividad, estado y distribucion |
| Dashboard page web | `apps/web/src/app/dashboard/page.tsx` | Refactorizado — delega capa de datos al componente cliente |
| TenantsTable web | `apps/web/src/components/dashboard/TenantsTable.tsx` | Refactorizado — recibe datos reales por props + estados loading/error/retry |

---

## 3d. Artefactos generados — Fase 04 (buscador + notificaciones tenant)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| TopHeader web | `apps/web/src/components/layout/TopHeader.tsx` | Refactorizado — buscador funcional con query param `q` (router + URL state) |
| DashboardClient web | `apps/web/src/components/dashboard/DashboardClient.tsx` | Refactorizado — consume `q` desde URL y aplica filtro global sobre tenants visibles |
| TenantsTable web | `apps/web/src/components/dashboard/TenantsTable.tsx` | Refactorizado — soporta `searchQuery` externo sincronizado desde header |
| API client portal | `apps/portal/src/lib/api-client.ts` | Refactorizado — nuevo `auditApi.list` tenant-aware para consumir `/audit-logs` |
| NotificationBell portal | `apps/portal/src/components/layout/NotificationBell.tsx` | Nuevo — notificaciones reales desde eventos de auditoria del tenant |
| TopHeader portal | `apps/portal/src/components/layout/TopHeader.tsx` | Actualizado — reemplaza campana placeholder por `NotificationBell` |

---

## 3e. Artefactos generados — Fase 05 (baseline E2E)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| Dependencia Playwright | `package.json` | Actualizado — scripts `test:e2e` y `test:e2e:headed` |
| Config Playwright web | `e2e/playwright.web.config.ts` | Nuevo — baseline de ejecucion E2E para `@iwana/web` |
| Suite E2E auth+dashboard | `e2e/tests/web-auth-dashboard.spec.ts` | Nuevo — valida `login -> dashboard -> filtro por buscador -> logout` |

---

## 3f. Artefactos generados — Fase 06 (cobertura portal + consolidacion)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| Scripts E2E consolidados | `package.json` | Actualizado — `test:e2e:portal` y `test:e2e:all` |
| Config Playwright portal | `e2e/playwright.portal.config.ts` | Nuevo — baseline de ejecucion E2E para `@iwana/portal` |
| Ajuste config web | `e2e/playwright.web.config.ts` | Actualizado — `testMatch` para aislar specs web |
| Suite E2E portal | `e2e/tests/portal-auth-notifications.spec.ts` | Nuevo — valida `login tenant -> dashboard -> notificaciones -> logout` con mocks |

---

## 5b. Criterios de aceptacion — Fase 03

| Criterio | Estado |
| --- | --- |
| CA-TA-012: login y sesion usan endpoints reales (`/auth/platform/login`, `/auth/login`, `/auth/me`, `/auth/logout`) | CUMPLIDO |
| CA-TA-013: dropdown de usuario ya no usa datos hardcodeados | CUMPLIDO |
| CA-TA-014: notificaciones admin provienen de datos reales (`/tenants`) | CUMPLIDO |
| CA-TA-015: dashboard admin consume `/tenants` para tabla y resumen operativo | CUMPLIDO |
| CA-TA-016: typecheck de `@iwana/web` y `@iwana/portal` sin errores nuevos | CUMPLIDO |

---

## 5c. Criterios de aceptacion — Fase 04

| Criterio | Estado |
| --- | --- |
| CA-TA-017: buscador del header admin filtra resultados del dashboard por query global (`q`) | CUMPLIDO |
| CA-TA-018: notificaciones del portal suscriptor consumen datos reales de `/audit-logs` | CUMPLIDO |
| CA-TA-019: typecheck de `@iwana/web` y `@iwana/portal` posterior a FASE-04 sin errores nuevos | CUMPLIDO |

---

## 5d. Criterios de aceptacion — Fase 05

| Criterio | Estado |
| --- | --- |
| CA-TA-020: existe baseline Playwright ejecutable para web admin | CUMPLIDO |
| CA-TA-021: flujo E2E `login -> dashboard -> buscador -> logout` pasa en verde | CUMPLIDO |
| CA-TA-022: la suite E2E es reproducible con mocks de API (sin dependencia backend en vivo) | CUMPLIDO |

---

## 5e. Criterios de aceptacion — Fase 06

| Criterio | Estado |
| --- | --- |
| CA-TA-023: existe suite E2E dedicada para portal suscriptor | CUMPLIDO |
| CA-TA-024: flujo portal `login tenant -> dashboard -> notificaciones -> logout` pasa en verde | CUMPLIDO |
| CA-TA-025: ejecucion consolidada `web + portal` pasa en verde | CUMPLIDO |
| CA-TA-026: el flujo E2E incluye checks automaticos basicos de accesibilidad (regiones/labels) | CUMPLIDO |

---

## 3g. Artefactos generados — Fase 07 (refactor, accesibilidad WCAG AA y axe-core E2E)

| Artefacto | Archivo | Cambio |
| --- | --- | --- |
| ThemeToggle compartido | `packages/ui/src/components/ThemeToggle.tsx` | Nuevo — componente extraido de ambas apps; no tiene deps Next.js, califica como primitiva compartida |
| Exportacion @iwana/ui | `packages/ui/src/index.ts` | Actualizado — exporta `ThemeToggle` |
| ThemeToggle web (re-export) | `apps/web/src/components/layout/ThemeToggle.tsx` | Convertido a re-export de `@iwana/ui` |
| ThemeToggle portal (re-export) | `apps/portal/src/components/layout/ThemeToggle.tsx` | Convertido a re-export de `@iwana/ui` |
| TopHeader portal | `apps/portal/src/components/layout/TopHeader.tsx` | Actualizado — busqueda conectada a router (`useRouter`, `useSearchParams`, query param `q`); identical behavior to web admin; aria-hidden en decorativos; logo mobile con contraste correcto |
| Sidebar web | `apps/web/src/components/layout/Sidebar.tsx` | WCAG: badge logo `text-[#17163a]` + `aria-hidden`; heading MENU `text-white/60`; bug de brace extra corregido |
| Sidebar portal | `apps/portal/src/components/layout/Sidebar.tsx` | WCAG: mismas correcciones que web Sidebar |
| Button (destructive) | `packages/ui/src/components/Button.tsx` | WCAG: variante destructive `bg-[#DC2626]` hover `bg-[#B91C1C]`; ratio blanco/fondo = 4.84:1 (antes 3.76:1) |
| SystemStatusPanel | `apps/web/src/components/dashboard/SystemStatusPanel.tsx` | WCAG: parrafo detalle `text-gray-700 dark:text-gray-300` (antes `text-gray-500`) |
| TenantsTable | `apps/web/src/components/dashboard/TenantsTable.tsx` | WCAG: contador pie `text-gray-600` (antes `text-gray-400`) |
| PanelCard | `apps/web/src/components/dashboard/PanelCard.tsx` | WCAG: encabezados columna `text-gray-600` (antes `text-gray-400`) |
| TopHeader web | `apps/web/src/components/layout/TopHeader.tsx` | WCAG: `aria-hidden` en icono busqueda y badge de atajo; logo mobile `text-[#17163a]` |
| LoginForm web | `apps/web/src/components/auth/LoginForm.tsx` | WCAG: pie de seguridad `text-slate-600` (antes `text-slate-400`); ratio 7.0:1 |
| LoginForm portal | `apps/portal/src/components/auth/LoginForm.tsx` | WCAG: misma correccion que web LoginForm |
| DashboardClient web | `apps/web/src/components/dashboard/DashboardClient.tsx` | WCAG: metricas `text-green-700` / `text-amber-700` (antes 600); ratio green-700 = 4.84:1 |
| Dashboard portal page | `apps/portal/src/app/dashboard/page.tsx` | WCAG: `aria-hidden="true"` en div indicador WiFi sin role valido (corrige ARIA 4.1.2) |
| Suite E2E web | `e2e/tests/web-auth-dashboard.spec.ts` | Actualizado — axe-core integrado; `AxeBuilder` con `wcag2a`/`wcag2aa`; guards `waitForLoadState('networkidle')` antes de cada escaneo |
| Suite E2E portal | `e2e/tests/portal-auth-notifications.spec.ts` | Actualizado — mismo patron axe-core; 0 violaciones en login y dashboard del portal |
| Dependencia axe-core | `package.json` (root) | Actualizado — `@axe-core/playwright@^4.11.1` como devDependency de workspace |

---

## 5f. Criterios de aceptacion — Fase 07

| Criterio | Estado |
| --- | --- |
| CA-TA-027: `ThemeToggle` vive en `packages/ui`; las apps usan re-export sin duplicacion de logica | CUMPLIDO |
| CA-TA-028: busqueda del portal suscriptor conectada a router con query param `q` (comportamiento identico al admin) | CUMPLIDO |
| CA-TA-029: 14 violaciones WCAG 2.1 AA corregidas — contraste insuficiente (ratio < 4.5:1 texto normal) y atributos ARIA invalidos | CUMPLIDO |
| CA-TA-030: `@axe-core/playwright` integrado en ambas suites E2E; `pnpm test:e2e:all` pasa con 0 violaciones reportadas por axe | CUMPLIDO |

---

## 7. Proxima accion recomendada

FASE-07 ejecutada. Adopcion TailAdmin completada en todas las fases planificadas (FASE-01 a FASE-07).

Proxima accion recomendada: validacion manual QA desktop/mobile del shell (responsabilidad CTO / equipo QA), firma formal del ADR-023 y apertura del siguiente modulo segun ADR-016.

---

## 8. Pendientes de gobernanza

- Validacion manual desktop/mobile del shell (responsabilidad del equipo de QA / CTO).
- Firma formal del ADR-023 por CTO para cerrar la adopcion TailAdmin como decision arquitectonica aprobada.
- Apertura de MOD-N+1 segun ADR-016 solo tras recibir el sign-off del CTO sobre esta adopcion.
