# PROMPT — Ejecución refinamiento UI sistémico portal · Fase 02

**Versión:** 1.0  
**Estado:** Listo para ejecución  
**Fecha:** 2026-05-04  
**Generado por:** Engineering Manager + Senior UI Systems Designer  
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)  
**Convención documental:** `PROMPT-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md`

## Módulo

- Nombre: Portal empresarial tenant-aware
- Código: TRANSVERSAL-PORTAL-REFINAMIENTO-UI
- Fase: 02 — Unificación visual operativa
- Versión: 1.0
- Fecha: 2026-05-04
- Generado por: Engineering Manager
- Nombre de archivo destino: `PROMPT-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md`

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** `apps/portal` debe quedar alineado a la dirección “Portal operativo sobrio”, con shell, superficies, estados, foco, densidad y copy visualmente consistentes en dashboard, comercial, CRM, configuración, usuarios, perfil y auth.
- **Lo que sí entra:**
  - Primitives visuales locales para paneles, alertas, empty states, skeletons y focus-visible.
  - Normalización de layout interno de pantallas hijas.
  - Refinamiento visual de dashboard, commercial, CRM, settings, users, profile y auth login.
  - Corrección de focus-visible en header, dropdowns, notificaciones y cards-link.
  - Ajuste de semántica de `NotificationBell` y eliminación de rutas no implementadas.
  - Evidencia visual before/after y actualización del informe vivo.
- **Lo que no entra:**
  - Cambios de endpoints, DTOs, roles, permisos, multi-tenancy o contratos de auth.
  - Cambio de stack, Tailwind config, tokens globales o librería UI.
  - Extracción obligatoria a `packages/ui` si basta con primitives locales del portal.
  - Rediseño funcional de CRM, Commercial, Settings o Users.

## 2. Artefactos de entrada obligatorios

- Plan de fase: [PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md](../plans/PLAN-TRANSVERSAL-PORTAL-REFINAMIENTO-UI-FASE-02-v1.0.md)
- Plantilla base: [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
- Perfil Senior UI: [Perfil_IA_Senior_UI_Systems_Designer_v1.md](../roles/_historico/Perfil_IA_Senior_UI_Systems_Designer_v1.md)
- Skill activa: [.agents/skills/senior-ui-systems-designer/SKILL.md](../../.agents/skills/senior-ui-systems-designer/SKILL.md)
- Stack: [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md)
- ADR UI: [ADR-023-Referencia-TailAdmin-Shell-Dashboard.md](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md)
- HLD dashboard empresa: [HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md)
- Informe vivo: [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md)
- Artefactos faltantes detectados: no hay HLD transversal específico de refinamiento UI portal; se ejecuta como fase correctiva visual gobernada por este plan.

## 3. Instrucciones para Sr. Dev Fullstack

1. **Leer el plan completo antes de codificar.** Ejecutar como refinamiento visual sistémico, no como rediseño libre.
2. **Capturar baseline before:** levantar portal local y guardar evidencia desktop/mobile de `/auth/login`, `/dashboard`, `/dashboard/commercial`, `/dashboard/crm`, `/dashboard/settings` y `/dashboard/users`.
3. **Crear primitives visuales locales:**
   - `PortalPanel`
   - `PortalSectionHeader`
   - `PortalAlert`
   - `PortalSkeletonBlock`
   - `PortalEmptyState`
   - `interactiveFocusClassName` o helper equivalente
4. **Normalizar shell y navegación:**
   - `TopHeader.tsx`: focus-visible y branding mobile tenant-aware.
   - `Sidebar.tsx`: rutas futuras no navegables si no existen.
   - `NotificationBell.tsx`: semántica popover/menu coherente; no usar dialog parcial ni `/support` inexistente.
   - `DropdownUser.tsx`: focus-visible y cierre por teclado consistente.
5. **Normalizar layout interno:** retirar wrappers `main flex-1 p-6` de pantallas hijas y dejar que `app/dashboard/layout.tsx` controle padding y scroll.
6. **Reemplazar estados duplicados:** migrar errores, warnings, success, empty y skeletons a primitives comunes sin gradientes decorativos.
7. **Compactar Commercial y Settings:** priorizar densidad tabular, toolbars y lectura comparativa; reducir cardificación de tablas.
8. **Revisar CRM:** mantener valor ejecutivo, pero evitar que el bloque dominante parezca hero de marketing; debe ser dashboard operativo.
9. **Reescribir login empresarial:** eliminar claims no verificados y usar tono operativo: acceso seguro, políticas activas, MFA y trazabilidad por empresa.
10. **Actualizar documentación:** registrar archivos tocados, evidencia before/after, comandos y resultado en el informe vivo.

## 4. Restricciones no negociables

- Usar `pnpm`, nunca `npm` ni `yarn`.
- No cambiar endpoints, DTOs, roles, permisos ni contratos API.
- No hardcodear tenant, schema, slug, credenciales ni tokens.
- No agregar `tailwind.config.js`; Tailwind v4 CSS-first se conserva.
- No introducir librerías UI nuevas.
- Todo texto visible debe estar en español y sentence case.
- No usar `iwana-secondary` como texto sobre blanco; usar `iwana-secondary-700` o token accesible.
- No dejar rutas visibles que naveguen a páginas inexistentes.
- No usar gradientes decorativos para estados operativos si una primitive simple resuelve el caso.

## 5. Entregables técnicos obligatorios

- Primitives visuales locales en `apps/portal/src/components/shared/` o ruta equivalente.
- `TopHeader.tsx`, `Sidebar.tsx`, `NotificationBell.tsx`, `DropdownUser.tsx` normalizados.
- `DashboardClient`, `DashboardPanel`, `RecentActivityPanel`, `QuickActionsPanel` alineados al sistema común.
- `CommercialClient`, `CommercialTabLayout` y managers comerciales actualizados al patrón compacto.
- `CrmOverviewClient` actualizado a dashboard operativo sobrio.
- `SettingsClient`, `SettingsTabs`, `SettingsOverviewPanel` y forms/managers de settings actualizados.
- Login portal con copy operativo y claims verificables.
- Tests ajustados si cambian estructura, roles ARIA, labels o comportamiento de interacción.

## 6. Entregables documentales obligatorios

- Actualización de [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md).
- Evidencia before/after de rutas principales.
- Lista de comandos ejecutados y resultados.
- Registro de deuda visual aceptada si alguna pantalla queda fuera por alcance.
- Stop/go documentado si aparece bloqueo.

## 7. Criterios de aceptación

- CA-PUI-01: `apps/portal` usa una gramática consistente de superficies en dashboard, commercial, CRM, settings, users y profile.
- CA-PUI-02: No quedan wrappers globales con `<main className="flex-1 p-6">` dentro de pantallas hijas del dashboard.
- CA-PUI-03: Estados error, warning, success, empty y loading usan primitives consistentes sin gradientes decorativos.
- CA-PUI-04: Header, dropdown user, notification bell, quick actions y cards-link tienen focus-visible visible y consistente.
- CA-PUI-05: NotificationBell ya no declara `role="dialog"` sin comportamiento de dialog completo ni navega a rutas inexistentes.
- CA-PUI-06: Header móvil autenticado muestra branding tenant-aware o fallback coherente con `TenantSeal`.
- CA-PUI-07: Login portal usa tono operativo empresarial y no claims técnicos no verificados.
- CA-PUI-08: Tablas y listados de Commercial/Settings priorizan densidad y comparación, sin cardificación excesiva.
- CA-PUI-09: No se agregan dependencias visuales, Tailwind config ni tokens globales sin escalación.
- CA-PUI-10: Informe vivo queda actualizado con evidencia before/after, comandos ejecutados y resultado.

## 8. Criterio de stop/go

- **Detenerse inmediatamente si:**
  - una primitive local requiere cambio transversal de `@iwana/ui`;
  - una corrección visual exige cambiar contrato API, rol, permiso o flujo de auth;
  - el branding mobile requiere datos no disponibles en el layout actual;
  - Playwright detecta rutas rotas nuevas;
  - hay conflicto entre accesibilidad WCAG y dirección visual.
- **Documentar causa en:** [INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md](../informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md)
- **Escalar a:** EM-ARCH; CTO solo por cambios de stack, tokens globales, librería UI o seguridad.
- **Recomendación esperada:** mantener alcance visual y resolver con primitives locales antes de ampliar `packages/ui`.

## 9. Criterio de salida de la fase

- Frontend validado:
  - `pnpm --filter @iwana/portal test`
  - `pnpm --filter @iwana/portal typecheck`
  - `pnpm --filter @iwana/portal lint`
- E2E validado:
  - `pnpm test:e2e:portal`
- Validación visual archivada:
  - screenshots before/after desktop `1440x900`
  - screenshots before/after mobile `390x844`
  - revisión manual de teclado en navegación global, tabs y dropdowns
- Documentación archivada:
  - informe vivo actualizado con resultado y deuda residual.
- Seguridad:
  - sin PII, tokens, credenciales ni slugs hardcodeados en código, tests, docs o capturas.