---
description: "R-13 añadir pnpm test a ci.yml — solo tras R-14 GO — AI-PLAT-OPS"
name: "R-13 CI unit tests"
agent: "plat-ops"
---

# PROMPT — AI-PLAT-OPS · R-13

**Emisor:** AI-EM-ARCH  
**Prerrequisito duro:** [R-14 GO](../../docs/informes/INFORME-ADR065-R13-R14-DISPOSICION-v1.0.md) — **no ejecutar este prompt si R-14 está abierto**.  
**Disposición:** mismo informe.

## Objetivo

Enforcement en CI del stop/go «suite verde» y del espíritu de AGENTS.md (tests en merge gate). Hoy `ci.yml` no corre `pnpm test`.

## Alcance

1. Añadir paso de unit tests en `.github/workflows/ci.yml` tras lint/typecheck (y tras `build` si los paquetes lo requieren — verificar).
2. Comando: `pnpm test` monorepo o turbo filtrado a paquetes con suite real (`@iwana/api`, `@iwana/portal`, `@iwana/web`, `@iwana/db`, …). Fallo = job rojo.
3. Env: reutilizar/extender lo ya presente para API/migraciones (`MFA_ENCRYPTION_KEY`, etc.) si la suite lo exige.
4. Actualizar nombre/comentario del job (ya no solo Lint+Typecheck+Build).
5. **No** exigir cobertura 80% en este PR (fase posterior).

## Prohibido

- `continue-on-error: true` en el paso de test
- Meter R-13 sin evidencia de R-14 GO en el handoff

## Stop / Go

Workflow válido; documentar en el PR. Sin commit forzado si el orquestador no lo pide — entregar diff.

Si R-14 aún no está GO: responder `[BLOQUEO]` y no tocar `ci.yml`.
