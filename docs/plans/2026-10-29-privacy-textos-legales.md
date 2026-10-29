# Plan — Privacy · Textos legales consumibles por el sistema

**Versión:** 1.2 (2026-10-29: P1 de B4, decisión D-B4-1 y bloque correctivo B6; v1.1: D-B1-1 y reanudación de la Ola 2)
**Fecha:** 2026-10-29
**Estado:** Vigente
**Emitido por:** AI-EM-ARCH (modo EM + Orchestrator)
**Spec (contrato congelado):** [`docs/specs/2026-10-29-privacy-textos-legales.md`](../specs/2026-10-29-privacy-textos-legales.md) v1.2
**Anexo de textos:** [`docs/specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md`](../specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md) v1.0
**Prompt de ejecución:** [`PROMPT-PRIVACY-TEXTOS-LEGALES-v1.2.md`](../prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.2.md) · **Launcher:** [`PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.3.md`](../prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.3.md)

## 1. Objetivo

Dejar «Textos legales» (`/dashboard/privacy?view=legal`) listo para que el sistema consuma la Política, el Aviso y la Autorización de cada ISP. Para eso:

- formato fiel;
- lectura de la versión vigente sin el 403 que hoy bloquea a quien captura;
- finalidades por empresa, alineadas con su política;
- textos fuente de Iwana S.A.S. listos para publicar en su tenant.

## 2. Decisiones de partida (usuario, 2026-10-29)

| ID | Decisión |
| --- | --- |
| D1 | AI-EM-ARCH redacta el Aviso y la Autorización desde la política; quedan en borrador hasta que los aprueben el ISP y el dictamen jurídico |
| D2 | Finalidades habilitadas por empresa (tenant); la captura solo ofrece las habilitadas |
| D3 | Markdown seguro, sin HTML crudo; el hash sigue calculándose sobre el texto fuente |

## 3. Bloques

| # | Responsable | Encargo | Salida | Depende de |
| --- | --- | --- | --- | --- |
| B0 | AI-EM-ARCH | Spec v1.0, anexo, este plan, prompt de ejecución y launcher | `docs/specs/…`, `docs/plans/…`, `docs/prompts/…` | — (**cerrado** el 2026-10-29) |
| B1 | `sr-backend` | Prompt §B1: migración (C1 + C3), contratos shared, `current` abierto, `purposes` y su puerto, validación en `authorizations`, OpenAPI | código + `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B1-v1.0.md` | spec v1.1 (D-B1-1) |
| B2 | `fe-platform` | Prompt §B2: `LegalTextContent`, `LegalTextsSurface` (C5), los tres consumidores (C6) | código + `INFORME-PRIVACY-TEXTOS-LEGALES-B2-v1.0.md` | spec v1.1 (E1 cerrada) |
| B3 | `sr-qa` | Prompt §B3: pruebas de CA-LT-07 a CA-LT-12 y E2E | tests + `INFORME-PRIVACY-TEXTOS-LEGALES-B3-QA-v1.0.md` | B1 y B2 cerrados |
| B4 | `sec-eng` | Prompt §B4: revisión de C2, C3 y C4 | `INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md` | B3 |
| B6 | `sr-backend` | Prompt v1.2 §B6 (correctivo D-B4-1): `RolesGuard` en los 9 controladores de `privacy` + pruebas HTTP de plataforma/ADMIN/AUDITOR/SUPPORT | código + `INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md` | P1 de B4 |
| B5 | Humano: Oficial de protección de datos / ADMIN del tenant de Iwana | Aprobar el Aviso y la Autorización; configurar finalidades; publicar los 3 textos del anexo | acta del runbook, Paso 7 | G6.5 de B1–B4 + aprobación jurídica |

## 4. Matriz de dispatch (agente × skill)

Todas las skills se verificaron contra disco (`ls .agents/skills/<nombre>/SKILL.md`) el 2026-10-29.

| Bloque | Subagente | Skills obligatorias | Apoyo (condición) | Descartadas y por qué | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| B1 | `sr-backend` | `nestjs-expert`, `postgresql`, `database-migration`, `backend-security-coder`, `openapi-spec-generation` | `auth-implementation-patterns` (al retirar `@Roles` de `current`); `test-driven-development` (CA-LT-01 a CA-LT-06) | `bullmq-specialist`: no hay colas. `data-eng`: el modelo es trivial (una columna y una tabla de 4 filas) | `iwana-test-evidence` sobre `api`, `shared` y `database` con `Cached: 0`; integración Postgres de la migración |
| B2 | `fe-platform` | `frontend-dev-guidelines`, `frontend-security-coder`, `iwana-identity-ui-review`, `core-components`, `tailwind-patterns`, `system-vocabulary-review` | `wcag-audit-patterns` (tablas, peek e interruptores); `i18n-localization` (si se extraen textos) | `ui-ux-pro-max`: no hay dirección visual nueva. `senior-ui-systems-designer`: no hay lenguaje visual nuevo. `nextjs-app-router-patterns`: la superficie es cliente y no cambia rutas | `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre los archivos tocados; `iwana-test-evidence` portal |
| B3 | `sr-qa` | `testing-patterns`, `playwright-skill`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns` (a11y del peek) | `iwana-matriz-motivos`: no es MOD11↔MOD12 | conteo real sin caché; E2E con su conteo por spec |
| B4 | `sec-eng` | `security-auditor`, `backend-security-coder`, `frontend-security-coder` | `auth-implementation-patterns` (revisión de C2) | — | informe con hallazgos P0–P3; si un hallazgo exige código, se abre un bloque para el dueño |
| B6 | `sr-backend` | `nestjs-expert`, `auth-implementation-patterns`, `backend-security-coder`, `testing-patterns`, `iwana-test-evidence` | `systematic-debugging` (si la regresión rompe specs existentes) | `database-migration`/`postgresql`: sin cambios de datos. `openapi-spec-generation`: no cambia el contrato, solo la autorización | regresión `modules/privacy` + invariante + E2E B3, `Cached: 0` |

## 5. Olas, ruta crítica y sincronización

| Ola | Bloques | Paralelo | Cierre |
| --- | --- | --- | --- |
| 1 | B0 + escalación E1 | — | **B0 y E1 cerrados** (2026-10-29) |
| 2 | B1 ∥ B2 | Sí: B2 usa mocks derivados de los tipos de `@iwana/shared` que fija la spec | **Cerrada el 2026-10-29**: informes B1 y B2 v1.1 (CA-LT-01 a 06 y 13). AI-EM-ARCH re-ejecutó invariante + `privacy/purposes` + `legal-texts` (6 suites, 30 pruebas), `privacy-schemas` (8) y `LegalTextContent` (2), sin caché. Cobertura no medida → asignada a B3 |
| 3 | B3 → B4 → **B6 → B4 (re-verificación)** | No | B3 **cerrado** (CA-LT-07 a 12; cobertura API 96,26 % líneas / 85,14 % ramas, shared 100 %, portal 89,94 % / 80,58 %). B4 (LAUNCH v1.2) emitió P1 → B6 y re-verificación (LAUNCH v1.3). **Cerrada el 2026-10-29:** B6 con `RolesGuard` en 9/9 controladores; B4 v1.1 sin P0/P1. AI-EM-ARCH re-ejecutó `modules/privacy` + invariante sin caché (36 suites, 187 pruebas) y comprobó el orden de guards en los 9. **G6: GO** el 2026-10-29 (ver §6 e informe de fase). |
| 4 | B5 | — | G6.5 (CI de `main` verde por SHA) y aprobación jurídica |

- **Ruta crítica (v1.2):** B6 → B4 re-verificación → G6 (además del typecheck de API, que depende de MOD13) → G6.5 → B5. *Histórica:* B2 (rama `MARKDOWN`) → B3 (CA-LT-07 y CA-LT-08) → B4 → G6.5 → B5.
- **Superficie compartida:** B1 y B2 tocan `packages/shared/src/schemas/privacy/`. **Solo B1 escribe en `packages/shared`.** B2 lee los tipos y, si le falta algo, emite `[BLOQUEO]`. Si B2 arranca antes de que B1 publique los schemas, trabaja con tipos locales de mock idénticos a la spec §3 y los reemplaza al integrar.
- **Árbol sucio:** el 2026-10-29 `main` tiene cambios sin commitear de MOD13 y organización en `apps/api/src/modules/organization`, `network` y `apps/portal/src/lib/api-client.ts`. B2 toca `api-client.ts`: añade funciones y no reescribe las de MOD13. Ningún bloque commitea ni revierte archivos ajenos.

## 6. Bloqueos y escalaciones abiertos

**E1 — dependencia de Markdown: CERRADA el 2026-10-29.** El CTO aprobó la opción (a): `react-markdown` 10.1.0 + `remark-gfm` 4.0.1, registradas en `docs/prds/Stack_Tecnologico.md`, con las condiciones de uso de la spec C4 (`skipHtml`, `allowedElements`, `urlTransform` solo `http`/`https`). B2 implementa la rama `MARKDOWN` sin espera.

**`[BLOQUEO]` de B1 — roles de `PUT /privacy/purposes`: RESUELTO el 2026-10-29 (D-B1-1, spec v1.1 §8).** Se declara `@Roles(ADMIN, AUDITOR)` + `privacy.manage`, igual que los 17 handlers `privacy.manage` del módulo, sin excepción al invariante. No cambia la autorización efectiva: `PermissionsGuard` no evalúa roles y `RolesGuard` no es global. La Ola 2 se reanuda con el prompt v1.1 sobre el árbol existente.

**Para B4:** en `privacy`, `@Roles` es declarativo y no se ejecuta. `sec-eng` evalúa si es un riesgo; aplicarlo sería una decisión aparte, porque cambia a quién llega el perfil «Oficial de protección de datos».

**Ajeno a la ola:** el typecheck de API falla por un fixture WFM afectado por los cambios sin commitear de MOD13 (`findRouterSummariesByIds`). Lo corrige el dueño de MOD13; B1 lo reporta como ajeno y no lo toca.

**`[BLOQUEO]` P1 de B4 — RESUELTO por decisión el 2026-10-29 (D-B4-1, spec v1.2 §8); pendiente de ejecución en B6.** Los 9 controladores de `privacy` carecen de `RolesGuard` y `PermissionsGuard` deja pasar los tokens de plataforma: con `X-Tenant-Slug`, una identidad de plataforma alcanzaba todas las rutas del módulo. Es un defecto heredado de la Fase 1a (G6.5 GO), sin exposición en producción porque G7 está diferido. Se corrige con `RolesGuard` y no se toca `PermissionsGuard`, que es transversal. Ningún usuario de empresa pierde acceso. Residual aceptado: `GET current` y `GET purposes` siguen legibles con un token de plataforma.

**Estado de G6 (2026-10-29): GO re-dictaminado tras B7** (suite completa de API: 435 suites aprobadas y 0 fallidas; informe de fase §9). G6.5 pendiente del CI del commit de B7. *Antes:* REVOCADO tras el push. El CI 40961614745 sobre `4d54799e` falló en `subscribers.module.spec.ts`: el `AuthModule` que B6 importó en `PrivacyModule` arrastra `otplib` (ESM). El correctivo es B7 ([`PROMPT-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md`](../prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-B7-v1.0.md)); detalle en el informe de fase §8. *Antes:* GO, consolidado en [`INFORME-PRIVACY-TEXTOS-LEGALES-v1.0.md`](../informes/INFORME-PRIVACY-TEXTOS-LEGALES-v1.0.md), después de que MOD13 B3 corrigió el fixture WFM y AI-EM-ARCH re-ejecutó typecheck y lint con código 0. *Histórico:* NO-GO por un único gate externo. Todo lo propio de la fase está en verde: CA-LT-01 a 13, cobertura ≥ 80 %, invariante, P1 cerrado y E2E B3 3/3. El typecheck de API (`pnpm --filter @iwana/api typecheck`, salida 2) tiene un solo error, `TS2352` en `src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts:7`: el mock no implementa `findRouterSummariesByIds`. Ese método lo añadió al `OrganizationSiteReadPort` el trabajo sin commitear de MOD13 (retiro de la columna LAN, `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md`), cuyo plan no menciona el consumidor WFM. Es un defecto de esa obra, no de esta fase. **Decisión del usuario (2026-10-29):** lo corrige la obra MOD13, con el bloque B3 del addendum §6 de [`2026-10-28-mod13-routers-retiro-columna-lan.md`](2026-10-28-mod13-routers-retiro-columna-lan.md) v1.1 y el launcher `PROMPT-MOD13-ROUTERS-SEDE-PUERTO-LAUNCH-v1.0.md`. Cuando ese bloque cierre, AI-EM-ARCH vuelve a correr el typecheck y consolida G6 de esta fase.

**Dictamen jurídico** (ADR-094 §7 punto 3): bloquea B5, no B1–B4.

**Dependencia externa de G6:** el gate de typecheck de API exige que el dueño de MOD13 corrija el fixture `wfm-organization-sites.adapter.spec.ts` (`findRouterSummariesByIds`). AI-EM-ARCH no declara G6 de esta fase con ese gate en rojo, aunque el error sea ajeno.

## 7. Deuda que se registra, no se paga

| Severidad | Deuda |
| --- | --- |
| Media | Legado `crm/habeas-data` con `legalTextVersion` libre (`'v1.0'`) y sin hash, todavía montado en `crm.module.ts` |
| Baja | `valid_from` en `legal_texts`: la vigencia declarada vive en el contenido (spec §6) |
| Baja | Consumo de la Política en `apps/web` y en el PDF del contrato |

## 8. Verificación de cierre

1. Informes B1–B4 con conteo real (`iwana-test-evidence`) y sin pruebas omitidas.
2. Navegador sobre `/dashboard/privacy?view=legal`:
   - publicar en un tenant de QA el bloque A del anexo con `MARKDOWN`;
   - el peek muestra la tabla §10;
   - copiar la huella entrega los 64 caracteres;
   - con `DATOS_BIOMETRICOS` deshabilitada, el alta de suscriptor no ofrece esa finalidad;
   - un usuario comercial captura en el expediente sin el aviso falso de «no hay texto».
3. `gh run list --branch main` en verde sobre el SHA de cierre (G6.5, ADR-069).

## Lanzamiento

> **El archivo [`docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.3.md`](../prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-LAUNCH-v1.3.md) (Ola 3b) es la fuente y prevalece si diverge de este espejo.** Olas anteriores: LAUNCH v1.0 **(superado)**, v1.1 (cumplido) y v1.2 (cumplido en B3; B4 bloqueado por P1).

> Actúa como `{sr-backend (B6) | sec-eng (B4)}`. Lee `AGENTS.md`, el plan `docs/plans/2026-10-29-privacy-textos-legales.md` v1.2, la spec v1.2 §8 (D-B4-1) y tu encargo `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-v1.2.md` §{B6 | B4 «Re-verificación»}.
> Antes de empezar lee los `SKILL.md` de tu fila (en `.agents/skills/<nombre>/SKILL.md`, como documentación, no como tool).
> No modifiques la spec. B6: solo `@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)` en los 9 controladores de `privacy` y sus pruebas; no toques `PermissionsGuard`, `RolesGuard`, `TenantMiddleware` ni otros módulos. sec-eng: no modifiques código. Si algo exige más, emite `[BLOQUEO]` y para.
> Tokens de prueba firmados como en los specs HTTP existentes; nunca secretos reales. No toques los cambios ajenos de MOD13 ni commitees.
> Verifica que la ruta esté libre y reporta en `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B6-v1.0.md` (B6) o actualiza `INFORME-PRIVACY-TEXTOS-LEGALES-B4-SEC-v1.0.md` a v1.1 (B4), con conteo real sin caché y deuda nueva por severidad.
