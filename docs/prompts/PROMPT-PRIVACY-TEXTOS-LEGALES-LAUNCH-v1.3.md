# LAUNCH — `privacy` · Textos legales · Ola 3b (correctivo de seguridad)

**Plan:** `docs/plans/2026-10-29-privacy-textos-legales.md` v1.2 · **Spec:** `docs/specs/2026-10-29-privacy-textos-legales.md` v1.2 · **Prompt:** `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.2.md` · Sucede a LAUNCH v1.2 (cumplido en B3; B4 bloqueado)
**Ola que lanza:** B6 → B4 (re-verificación), secuencial · **Gates:** G1–G4 cubiertos; B0–B3 y E1 cerrados, no re-despachar
**Bloqueos:** el P1 de B4 quedó decidido (D-B4-1, spec §8): `RolesGuard` en los 9 controladores de `privacy`, sin tocar `PermissionsGuard`. Externo a G6: typecheck de API rojo por el fixture WFM de MOD13.
**Estado real al arrancar:** todo el diff de la fase está implementado y sin commitear. CA-LT-01 a 13 en verde y cobertura medida (API 96,26 % / 85,14 % ramas). Un token de plataforma con `X-Tenant-Slug` alcanza hoy todas las rutas de `privacy`.

| # | Subagente | Encargo | Skills a leer antes de empezar | Contrato congelado |
| --- | --- | --- | --- | --- |
| B6 | `sr-backend` | prompt v1.2 §B6 | `nestjs-expert`, `auth-implementation-patterns`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | spec v1.2 §8 D-B4-1 |
| B4 | `sec-eng` | prompt v1.2 §B4 «Re-verificación», **después de cerrar B6** | `security-auditor`, `auth-implementation-patterns`, `backend-security-coder` | spec v1.2 §8 |

**Secuencia:** B4 solo arranca con el informe B6 cerrado. B6 toca únicamente el `@UseGuards` de los 9 controladores y sus pruebas; `sec-eng` no modifica código.
**Cierre de ola:** `INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md` con plataforma 403 en rutas mutantes, ADMIN/AUDITOR (DPO) 200, SUPPORT 403 y regresión `modules/privacy` + invariante + E2E B3 con conteo real sin caché; `INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md` actualizado a v1.1 sin P0/P1. Después, AI-EM-ARCH consolida G6.

---

### Bloque copiar-pegar

> Actúa como `{sr-backend (B6) | sec-eng (B4)}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-29-privacy-textos-legales.md` v1.2, la spec v1.2 §8 (D-B4-1) y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.2.md` §{B6 | B4 «Re-verificación»}.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques la spec. B6: solo `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)` en los 9 controladores de `privacy` y sus pruebas; no toques `PermissionsGuard`, `RolesGuard`, `TenantMiddleware` ni otros módulos. sec-eng: no modifiques código. Si algo exige más, emite `[BLOQUEO]` y para.
> Tokens de prueba firmados como en los specs HTTP existentes; nunca secretos reales. No toques los cambios ajenos de MOD13 ni commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md` (B6) o actualiza `INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md` a v1.1 (B4), con conteo real sin caché y deuda nueva por severidad.
