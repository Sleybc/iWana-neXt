# PROMPT — WEB-UIUX — Fase 01: identidad, dark ADR-056 y shell — v1.0

## Módulo

- Nombre: Consola de plataforma (apps/web) — remediación UI/UX
- Código: WEB-UIUX
- Fase: 01
- Versión: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH (Engineering Manager / Orchestrator)
- Agente destinatario: AI-FE-PLATFORM (instancia A)

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** `apps/web` sin grises genéricos en dark (ADR-056 §2), con lienzo y z-index canónicos, campana de notificaciones con semántica de color correcta, tabla técnica de auditoría scrolleable, aviso de alcance en filtros/export de auditoría, búsqueda global accesible en mobile y `Badge`/`Card` de `@iwana/ui` tokenizados.
- **Lo que sí entra:** todo lo listado en las instrucciones (§3).
- **Lo que no entra:** modales de usuarios, flujo tenants (fase 02); páginas auth (fase 03); filtrado server-side (fase 04); skeletons/empty states/persistencia URL (afinamiento post-auditoría). No tocar archivos de esas fases.

## 2. Artefactos de entrada obligatorios

- Skill: `.agents/skills/iwana-identity-ui-review/SKILL.md` + `references/tokens.md`
- Tokens reales: `packages/ui/src/styles/globals.css` (única fuente para afirmar que un token existe)
- ADR-056 §2 (escala dark `dark-surface-*` / `dark-border-*`)
- Spec Firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md` (§3 semántica del lima, §6 superficie)
- Plan padre: `docs/plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md`

## 3. Instrucciones

1. **ADR-056 (P1):** sustitución mecánica en `apps/web/src/components/audit/*` (incl. `helpers/deriveSeverity.ts`), `components/layout/NotificationBell.tsx`, `components/dashboard/TenantsTable.tsx`, `components/users/UsersTable.tsx`: `dark:bg-gray-700→dark:bg-dark-surface-4`, `dark:bg-gray-800→dark:bg-dark-surface-3`, `dark:border-gray-700→dark:border-dark-border-2`, `dark:border-gray-800→dark:border-dark-border` (ajustar peldaño por elevación real, criterio en tokens.md).
2. **Campana (P1):** `NotificationBell.tsx:155-176` — señal de alertas con escala semántica según el peor tono presente (`bg-error-500`/`text-error-600` si hay errores; `warning` si solo advertencias); el lima deja de usarse como alerta.
3. **Tabla técnica auditoría (P1):** `AuditLogsTable.tsx` — wrapper `overflow-x-auto` dentro del shell (patrón de `TenantsTable.tsx:289`).
4. **Aviso de alcance de filtros/export (P1, mitigación):** en `AuditLogsTable.tsx` junto al conteo y en el export CSV, rotular explícitamente que filtros y export operan sobre los registros cargados de la página actual (copy en español, sentence case).
5. **Búsqueda global mobile (P1):** `components/layout/TopHeader.tsx` — trigger (icono lupa, target ≥44px) visible bajo `lg` que abra `GlobalSearch`/overlay a pantalla completa; conservar el montaje desktop actual.
6. **Lienzo (P2):** `app/(protected)/layout.tsx:28,64` — `bg-slate-50` → `bg-iwana-surface-soft`.
7. **Z-index (P2):** escala corta: `Sidebar.tsx:150` `z-[9999]`→`z-40`, backdrop `layout.tsx:42` `z-[9998]`→`z-30`, `TopHeader.tsx:41` `z-[999]`→`z-20`. Verificar apilamiento contra overlays de `@iwana/ui`.
8. **Tokens en `@iwana/ui` (P2):** `Badge.tsx:21-22` — `bg-[#EEEEFA]`→`bg-iwana-primary-100`, `bg-[#EAF5CC] text-[#6A7A1C]`→`bg-iwana-secondary-100 text-iwana-secondary-900`; `Card.tsx:19,40` — sombra inline→`shadow-iwana-card`, `text-[#17163A]`→`text-iwana-primary`. Réplicas fuera de auth: `dashboard/MetricCard.tsx:75`, `layout/Header.tsx:17`, `audit-logs/page.tsx:267,325` (`text-[#181818]`→token de texto correcto).
9. Documentar desvíos y decisiones al final de la ejecución (resumen para el informe de fase).

## 4. Restricciones no negociables

- Solo tokens existentes en `globals.css`; ningún token nuevo, ningún `tailwind.config.js`.
- No cambiar comportamiento funcional ni contratos de datos; solo presentación y a11y.
- No tocar archivos asignados a fases 02/03 (`components/users/{UserCreateModal,UserManagementModal}.tsx`, `components/tenants/*`, `app/(protected)/tenants/page.tsx`, `app/auth/*`, `components/auth/*`).
- Copy visible en español, sentence case, sin enums crudos.

## 5. Entregables técnicos obligatorios

- Código frontend modificado según §3.
- Specs Jest existentes de los componentes tocados en verde (ajustarlas si asertan clases cambiadas).

## 6. Entregables documentales obligatorios

- Resumen de fase (cambios, desvíos, hallazgos nuevos) en la respuesta final — el orquestador lo consolida en `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md`.

## 7. Criterios de aceptación

- CA-101: `grep -r "dark:\(bg\|border\)-gray-\(700\|800\|900\|950\)" apps/web/src` → 0 resultados.
- CA-102: script `audit-ui.mjs apps/web/src` sin hallazgos `dark-gray` ni `z-war`; hex de marca solo quedan en archivos de fases 02/03.
- CA-103: la campana nunca usa `iwana-secondary*` para estados de error/advertencia.
- CA-104: en viewport <1024px existe un trigger de búsqueda operable ≥44px.
- CA-105: `pnpm --filter @iwana/web lint && pnpm --filter @iwana/web typecheck` en verde y `@iwana/ui` compila.

## 8. Criterio de stop/go

- **Detenerse si:** un cambio de token altera visualmente un componente fuera del alcance (p. ej. `Badge` en portal) de forma no equivalente al valor canónico, o si un test falla por comportamiento (no por clase).
- **Documentar causa en:** resumen de fase. **Escalar a:** AI-EM-ARCH. **Recomendación esperada:** opción mínima reversible.

## 9. Criterio de salida de la fase

- Frontend validado (CA-101…105), tests en verde, resumen entregado.
