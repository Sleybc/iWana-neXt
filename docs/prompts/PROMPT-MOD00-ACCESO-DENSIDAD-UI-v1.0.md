# PROMPT MOD00 Acceso — Densidad UI

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`
**Versión:** 1.0
**Estado:** Aprobado para ejecución
**Fecha:** 2026-08-15
**Módulo:** MOD00 Configuración Control Plane
**Fase:** Correctiva — densidad operativa de Acceso
**Generado por:** AI-EM-ARCH
**Nombre de archivo destino:** `PROMPT-MOD00-ACCESO-DENSIDAD-UI-v1.0.md`

**PRD:** `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**HLD:** `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
**ADR:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**Spec:** `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md` (v1.2)
**Plan:** `docs/plans/2026-08-15-mod00-acceso-densidad-ui.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

Contrato de componente congelado: primitivas existentes `PortalPanel compact` y `PortalEmptyState embedded` en `apps/portal/src/components/shared/portal-ui.tsx`. Sin cambio de API tipada.

Ejecutar exclusivamente la compactación visual de `/dashboard/settings/access`.
No crear endpoints, migraciones, tokens, paquetes ni cambios globales del design system.

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** reducir contenedores anidados y aire vertical para que, con 0 perfiles personalizados, `Perfiles sugeridos` entre en el primer viewport desktop 1440×900.
- **Lo que sí entra:** `space-y-4`, `items-start`, empty embebido, Accesos sin empty duplicado, cards sugeridas con CTAs en fila `sm+`, paneles `compact` en vacíos/sugeridos/MFA, tests, E2E, axe, capturas.
- **Lo que no entra:** API, OpenAPI, PostgreSQL, migraciones, tenancy, `portal-ui.tsx`, Organización, colapsar la columna Accesos, reordenar MFA.

## 2. Artefactos de entrada obligatorios

- Spec v1.2: `docs/specs/2026-08-15-mod00-acceso-ui-remediation.md`
- Plan: `docs/plans/2026-08-15-mod00-acceso-densidad-ui.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## 3. Instrucciones por rol

1. **AI-SR-QA:** RED de CA-ACC-UX-13…15; luego Jest, E2E, axe y snapshots.
2. **AI-FE-PLATFORM:** implementar contra spec v1.2 con props existentes; no crear tokens ni primitivas.
3. **AI-DS-OWNER:** verificar §10; P0/P1 de `audit-ui.mjs` = 0; no escribir componentes.
4. **AI-EM-ARCH:** informe vivo v1.64.

## 4. Restricciones no negociables

- Targets ≥44 px.
- No `w-full` en CTAs sugeridos a partir de `sm`.
- Título de card sugerida nunca en la misma fila que botones.
- No tocar `OrganizationSettingsClient.tsx`.
- TDD: RED publicado antes de GREEN.

## 5. Criterios de aceptación

- CA-ACC-UX-01…15 de la spec v1.2.
- Unit, E2E, lint, typecheck verdes.
- AI-PROD-UX y AI-DS-OWNER emiten GO para densidad.
