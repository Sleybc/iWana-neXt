# PLAN — Remediación UI/UX consola de plataforma (apps/web)

**Versión:** 1.0
**Estado:** Cerrado — fases 01–05 GO (2026-07-20) — ver `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md`
**Fecha:** 2026-07-20
**Origen:** Review multiagente UI/UX de `apps/web` (AI-PROD-UX + AI-DS-OWNER + AI-FE-PLATFORM + script `audit-ui.mjs`), consolidado por AI-EM-ARCH. Resultado: P0: 1, P1: 6, P2: 15, P3: 4+; veredicto "Aprobada con cambios".

## Objetivo

Cerrar el P0 y los 6 P1 del review, más los P2 de tipo quick win, filtros/export server-side de auditoría, variante lima de `Button`, y afinamiento (skeletons/empty/URL/targets) en superficies clave — dejando `apps/web` alineada a la identidad iWana (spec Firma, ADR-056).

## Fases y asignación

| Fase | Alcance | Agente | Archivos (disjuntos entre fases) | Estado |
| --- | --- | --- | --- | --- |
| 01 | Identidad, dark ADR-056, shell y auditoría | AI-FE-PLATFORM (A) | `components/audit/*`, `components/layout/*`, `app/(protected)/layout.tsx`, `app/(protected)/audit-logs/page.tsx`, `components/dashboard/*`, `components/users/UsersTable.tsx`, `packages/ui/src/components/{Badge,Card}.tsx` | **Cerrada** — G5 GO (2026-07-20) |
| 02 | Modales de usuarios, confirmación destructiva, toast | AI-FE-PLATFORM (B) | `components/users/{UserCreateModal,UserManagementModal}.tsx`, `components/tenants/{TenantSettingsForm,TenantCreateSummary}.tsx`, `app/(protected)/tenants/page.tsx`, nuevo `components/shared/ConfirmDialog.tsx` | **Cerrada** — G5 GO (2026-07-20); hotfix CA-101 en `TenantCreateSummary` |
| 03 | Auth secundario a AuthPremiumShell + tokens | AI-FE-PLATFORM (C) | `app/auth/*`, `components/auth/*` | **Cerrada** — G5 GO (2026-07-20) |
| 04 | Filtrado y export server-side de auditoría | AI-SR-FULL + AI-FE-PLATFORM | API audit + `AuditLogsTable` | **Cerrada** — G5 GO (2026-07-20); list+export CSV server-side |
| 05 | Auditoría de verificación + afinamiento de diseño | AI-EM-ARCH orquesta; AI-DS-OWNER/AI-PROD-UX revisan; AI-SR-QA valida | — | **Cerrada** — G6 GO (2026-07-20); quick wins UX + deuda P2 Badge/UsersTable saldada |

## RACI

- **Responsable de ejecución:** AI-FE-PLATFORM (fases 01–03; tres instancias con alcances de archivos disjuntos).
- **Aprobador de identidad:** AI-DS-OWNER — los cambios de fase 01 quick win quedaron pre-aprobados por carril rápido en su informe; la tokenización de `Badge`/`Card` en `@iwana/ui` usa los valores canónicos que él fijó.
- **Verificación:** AI-SR-QA + re-review de identidad en fase 05. El aprobador del gate nunca es el productor.
- **Variante lima de `Button`:** resuelta sin invertir `primary` — nueva `variant="lime"` (CTA de página, Firma); `primary` sigue = acción de sección. Sin escalado CTO.

## Gates de cierre por fase

1. `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` limpio (o hallazgos justificados) sobre los archivos tocados.
2. `pnpm --filter @iwana/web lint` y `typecheck` en verde; specs Jest existentes de los componentes tocados en verde; `@iwana/ui` compila si se tocó.
3. Sin cambios de contrato de API, sin PII, sin `tailwind.config.js`, sin tokens inventados (solo los existentes en `packages/ui/src/styles/globals.css`).
4. Informe corto de fase dentro del informe vivo `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md` (se crea al cierre de la fase 05, consolidado).

## Impacto declarado

- **Multi-tenant:** sin impacto — cambios de presentación en consola de plataforma.
- **Seguridad:** mejora — confirmaciones destructivas y semántica de diálogo accesible; sin cambios de auth flows (fase 03 es visual).
- **Escala:** sin impacto.
- **Regulación:** sin impacto.

## Prompts de ejecución

- `docs/prompts/PROMPT-WEB-UIUX-FASE-01-v1.0.md`
- `docs/prompts/PROMPT-WEB-UIUX-FASE-02-v1.0.md`
- `docs/prompts/PROMPT-WEB-UIUX-FASE-03-v1.0.md`
- `docs/prompts/PROMPT-WEB-UIUX-FASE-05-v1.0.md`
- `docs/prompts/PROMPT-WEB-UIUX-FASE-04-v1.0.md`
