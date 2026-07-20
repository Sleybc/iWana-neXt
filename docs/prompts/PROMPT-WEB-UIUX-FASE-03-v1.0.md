# PROMPT — WEB-UIUX — Fase 03: auth secundario a shell canónico y tokens — v1.0

## Módulo

- Nombre: Consola de plataforma (apps/web) — remediación UI/UX
- Código: WEB-UIUX
- Fase: 03
- Versión: 1.0
- Fecha: 2026-07-20
- Generado por: AI-EM-ARCH (Engineering Manager / Orchestrator)
- Agente destinatario: AI-FE-PLATFORM (instancia C)

---

## 1. Objetivo exacto de la fase

- **Resultado esperado:** change-password, forgot-password y mfa/verify comparten el shell canónico del login (`AuthPremiumShell`/patrón de `PlatformLoginExperience`), sin hex de marca crudos ni dark plano `#181818`; el copy visible del flujo lleva ortografía correcta.
- **Lo que sí entra:** lo listado en §3.
- **Lo que no entra:** cambios de lógica de auth (mfaRequired/mfaSetupRequired, tokens, redirecciones); el login principal (`PlatformLoginExperience`) salvo reutilización; resto de la app (fases 01/02).

## 2. Artefactos de entrada obligatorios

- Skill: `.agents/skills/iwana-identity-ui-review/SKILL.md` + `references/tokens.md` (receta #12: auth admite decoración que las vistas operativas no)
- Patrón canónico: `apps/web/src/components/auth/PlatformLoginExperience.tsx` (ya usa `AuthPremiumShell`)
- Tokens reales: `packages/ui/src/styles/globals.css`
- Plan padre: `docs/plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md`

## 3. Instrucciones

1. **Migrar las tres páginas (P2, causa raíz):** `app/auth/change-password/page.tsx`, `app/auth/forgot-password/page.tsx`, `app/auth/mfa/verify/page.tsx` al shell canónico del login (mismo componente de shell/brand header que `PlatformLoginExperience`), conservando exactamente los formularios y su lógica.
2. **Extinguir `LoginBrandPanel.tsx`:** si tras la migración queda sin consumidores, eliminarlo; si algún uso persiste, tokenizarlo (`bg-[#181818]`→`bg-dark-surface`, `text-[#A5C330]`→`text-iwana-secondary-300` sobre oscuro / `-700` sobre claro, degradados→utilities existentes).
3. **Strays de hex del flujo (P2):** `MfaVerifyForm.tsx:104` (`#6A7A1C`→`iwana-secondary-700`, `#A5C330`→`iwana-secondary`), `mfa/verify/page.tsx:27-29` (`#EEEEFA`→`iwana-primary-100`, `#17163A`→`iwana-primary`, `#181818`→`dark-surface`).
4. **Copy (derivado de system-vocabulary):** corregir tildes y ortografía visible en `change-password/page.tsx` ("contrasena"→"contraseña", "Politica"→"Política", etc.) sin cambiar significado; sentence case.
5. **Preservar a11y existente:** errores inline con `role="alert"`, autocomplete y estados de envío ya correctos — no regresionar.
6. Documentar desvíos y decisiones al final (resumen para el informe de fase).

## 4. Restricciones no negociables

- Cero cambios de lógica/estado de auth: el controller propaga `mfaRequired`/`mfaSetupRequired` explícitamente (gotcha del repo) — no tocar nada de ese cableado.
- Solo tokens existentes en `globals.css`; sin `tailwind.config.js`.
- No tocar archivos de fases 01/02.
- Sin credenciales ni PII en fixtures o ejemplos.

## 5. Entregables técnicos obligatorios

- Tres páginas migradas + strays tokenizados + copy corregido.
- `PlatformLoginExperience.spec.tsx` y cualquier spec de auth en verde.

## 6. Entregables documentales obligatorios

- Resumen de fase en la respuesta final — el orquestador lo consolida en `docs/informes/INFORME-WEB-UIUX-REMEDIACION-v1.0.md`.

## 7. Criterios de aceptación

- CA-301: `grep -rn "#17163A\|#A5C330\|#181818\|#EEEEFA\|#EAF5CC\|#6A7A1C" apps/web/src/app/auth apps/web/src/components/auth` → 0 resultados.
- CA-302: las tres páginas comparten el shell canónico; `LoginBrandPanel` eliminado o tokenizado.
- CA-303: copy del flujo sin errores ortográficos visibles.
- CA-304: `pnpm --filter @iwana/web lint && typecheck` y specs de auth en verde; script `audit-ui.mjs` sin `brand-hex` en el flujo auth.

## 8. Criterio de stop/go

- **Detenerse si:** la migración exige cambiar props o comportamiento de `AuthPremiumShell` (vive en `@iwana/ui`/compartido) — escalar a AI-EM-ARCH/AI-DS-OWNER en lugar de forkear el shell.
- **Documentar causa en:** resumen de fase. **Escalar a:** AI-EM-ARCH.

## 9. Criterio de salida de la fase

- CA-301…304 cumplidos, tests en verde, resumen entregado.
