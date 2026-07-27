# INFORME-PORTAL-USERS-UI-REMEDIACION-v1.0

**Módulo:** Portal — `/dashboard/users`  
**Fase:** Remediación UI Wave 1 + Wave 2  
**Modo:** AI-EM-ARCH Orchestrator (consolidación) · ejecución AI-FE-PLATFORM  
**Fecha:** 2026-07-24  
**Plan:** Auditoría Users UI (plan de remediación adjunto en sesión)

---

## Veredicto

**GO con deuda residual P3.** Las olas Wave 1 y Wave 2 del plan de remediación quedaron implementadas. Script `audit-ui.mjs` sin P0/P1 deterministas en el alcance. Suites Jest `components/users`: **47 passed**.

## Protocolo

| Fase | Agente | Resultado |
| --- | --- | --- |
| Auditoría UX | PROD-UX | Hallazgos U-01…U-14 |
| Contrato DS | DS-OWNER | APROBADO CON DEUDA → remediado |
| Identity + script | Explore / audit-ui | Spinners heurísticos; carga primaria cerrada |
| Implementación W1+W2 | FE-PLATFORM | GO |
| Gate QA local | EM-ARCH / Jest + audit-ui | GO |

## Cierre de hallazgos (plan)

| ID | Estado | Notas |
| --- | --- | --- |
| H-01 / H-02 | Cerrado | Sin reset inline en edit; guardia one-shot create + reset tabla; Entendido pide confirmación si no se copió |
| H-03 | Cerrado | `Button` + `PortalAlert` en Delete / Reset / Edit |
| H-04 | Cerrado | `resolveUserRoleFromCsv` acepta enum o label |
| H-05 | Cerrado | URL canónica `search`/`status`/`role` |
| H-06 / H-07 | Cerrado | `PortalSkeletonBlock` + `PortalSearchField` |
| H-08 | Cerrado | Un `PageHeader`; sin `PortalSectionHeader` competidor |
| H-09 | Cerrado | `portalFieldClassName` en Edit |
| Wave 2 peek | Cerrado | Edit en `PortalSidePeek` |
| Wave 2 create | Cerrado | Progressive disclosure (identidad → perfiles → perfil opcional) |
| Wave 2 foco | Cerrado | Return-focus a trigger de fila |
| Wave 2 tonal / Más | Cerrado | MFA/operativo secondary-700; menú «Más»; blob lima empty |

## Evidencia

```text
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs \
  apps/portal/src/components/users apps/portal/src/app/dashboard/users
→ P0: 0 · P1: 0 · P2: 0 · P3: 2 [revisar] (spinners de acción/job — no carga primaria de tabla)

pnpm --filter @iwana/portal exec jest --testPathPattern=components/users --no-coverage
→ Test Suites: 10 passed | Tests: 47 passed
```

## Deuda residual (no bloqueante)

| Ítem | Severidad | Notas |
| --- | --- | --- |
| Spinners en BulkImport progress / botón Editar busy | P3 | Feedback de control/job; no skeleton de listado |
| Sombra dual en `portalDataTableShellClassName` | P3 | Cambio compartido portal; diferido |
| Perfiles de empresa en CSV | Fuera de alcance | Requiere contrato API (SR-FULL) |
| Vocabulario profundo de permission keys | P3 | Fallback humanizado; labels de catálogo cuando existen |

## Sin escalación CTO

No hay tokens de marca nuevos ni cambio de CTA de página (`primary` vigente post-enmienda lima).
