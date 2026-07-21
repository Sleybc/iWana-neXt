# PROMPT — WEB-DASHBOARD-DELTA — Identidad + UX Centro de control — v1.0

## Módulo

- Nombre: Centro de control (`apps/web` `/dashboard`) — delta post WEB-UIUX
- Código: WEB-DASHBOARD-DELTA
- Fase: 01 (única)
- Versión: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH
- Agente destinatario: AI-FE-PLATFORM

---

## 1. Objetivo

Cerrar el residual de identidad Firma iWana y los bloqueantes UX del Centro de control, sin reabrir [`PLAN-WEB-UIUX-REMEDIACION-v1.0`](../plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md) (ya cerrado).

## 2. Artefactos de entrada (congelados)

- [`docs/specs/2026-07-20-web-dashboard-centro-control-ux-spec.md`](../specs/2026-07-20-web-dashboard-centro-control-ux-spec.md)
- [`docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md)
- Skill: `.agents/skills/iwana-identity-ui-review/SKILL.md`
- Tokens: `packages/ui/src/styles/globals.css`

## 3. Instrucciones (resumen)

1. Carril rápido DS: barra lima sidebar blanco, sombras `shadow-iwana*`, tokens semánticos SystemStatus, `interactiveFocusClassName` + `SkeletonBlock` en `@iwana/ui`, vocabulario auditoría.
2. CA-01..CA-03, CA-05, CA-09 según UX spec.
3. CA-04 diferido.
4. No sidebar azul noche, no fusión MetricCard, no unificar PanelCard/PortalPanel.

## 4. Restricciones

- Solo tokens existentes; sin `tailwind.config.js`.
- No tocar auth / users modals / tenant create forms.
- Copy español, sentence case.

## 5. Criterios de aceptación

- CA UX bloqueantes de la UX spec cumplidos.
- Checklist DS del contrato Fase-1.
- `audit-ui.mjs` limpio en rutas tocadas.
- `pnpm --filter @iwana/ui typecheck` + `pnpm --filter @iwana/web lint|typecheck` + Jest dashboard en verde.

## 6. Stop/go

- Detenerse si un cambio en `@iwana/ui` rompe portal de forma no equivalente → escalar EM-ARCH.
- Documentar desvíos en el informe de fase.
