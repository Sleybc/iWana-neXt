# Plan de orquestación — Transversal · Conexiones y efectos dentro de transacciones

**Versión:** 1.0
**Estado:** Aprobado. G0 del CTO el 2026-11-06. Ola A lista para lanzar.
**Fecha:** 2026-11-06
**Autor:** AI-EM-ARCH
**Spec:** [2026-11-06-transacciones-conexiones-y-efectos-spec.md](../specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md)
**Relacionado:** [plan de marcas](2026-11-06-crm-marcas-en-transaccion-orquestacion.md)

## Olas

| Ola | Contenido | Depende de | Prompt |
| --- | --- | --- | --- |
| A | Bloqueo de cuenta y límite de `login` (D1, D2) | — | [Emitido](../prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md) |
| A2 | Límites de peticiones: [spec](../specs/2026-11-06-limites-de-peticiones-spec.md) | G0 ✅ 2026-11-06 | [Emitido](../prompts/PROMPT-AUTH-LIMITES-PETICIONES-v1.0.md) |
| B | Marcas, autorización, catálogo y media (D3) | Commit de MOD14 | [Prompt de marcas](../prompts/PROMPT-CRM-MARCAS-EN-TRANSACCION-v1.0.md), ya ampliado con D3 |
| C | Auditoría y efectos después del commit (D4, D5), por módulo | Ola A | Se emite al abrir la ola |
| D | Lecturas de otros módulos, por módulo, network primero | Ola B | Se emite al abrir la ola |
| E | Regla de arquitectura | Olas C y D | Se emite al abrir la ola |

## Gates

| Gate | Condición | Dueño |
| --- | --- | --- |
| G0 | ✅ 2026-11-06: el CTO aprobó los seis puntos de §8 de la spec, con 10 por minuto por IP en `login` | CTO |
| G6 por ola | Criterios con evidencia propia de AI-EM-ARCH; revisiones sin P0 ni P1 | AI-EM-ARCH |
| G6.5 por ola | CI verde sobre el SHA publicado | AI-EM-ARCH |
| G7 | Diferido a la beta. Las olas A a E son requisito | CTO |

## Matriz de dispatch

| Bloque | Agente | Skills | Depende de |
| --- | --- | --- | --- |
| A1 | `sr-backend` | `nestjs-expert`, `auth-implementation-patterns`, `backend-security-coder`, `test-driven-development`, `iwana-test-evidence`, `verification-before-completion` | — |
| R1 | `sec-eng` | `security-auditor` | A1 |
| R1 | `test-change-reviewer` | — | A1 |
| R1 | `gate-verifier` | `iwana-test-evidence` | Revisiones |

## Seguimiento

| Entrega | Estado |
| --- | --- |
| Spec, inventario, plan y prompt de la Ola A | Emitidos el 2026-11-06 |
| Ola A | **G6 ✅ 2026-11-06.** AI-EM-ARCH re-ejecutó con `DB_NAME=test`: unitaria 474 / 6.284; integración 69 aprobadas, 4 omisiones declaradas, 463 tests, incluida `auth-login-lockout`; lint con 0 errores, `tsc` y build en verde. `sec-eng` GO y `test-change-reviewer` sin regresiones. Sin commit; G6.5 pendiente |
| Límites inactivos | Hallazgo de `sec-eng`, confirmado: 11 `@Throttle({ default: … })` sin efecto, porque el limitador se llama `global`; caen a 100 por minuto. `platform/login` no tiene límite propio ni bloqueo por cuenta. Ola A2 abierta y aprobada por el CTO el 2026-11-06: `login` pasa a 30 por minuto y se publica junto con la Ola A. **Riesgo para G6.5 de la Ola A:** el límite de `login` puede dejar rojo el E2E de CI, sin medir |
| Deuda de Ola A | Oráculo de tiempo y mensajes que confirman estado de cuenta (Media); `ACCOUNT_LOCKED` duplicado en paralelo; rama de fila no encontrada sin prueba; CA-8 sin aislamiento por IP |
| Ola A2 | L1 y revisiones entregados el 2026-11-06. `sec-eng` y `test-change-reviewer`: aprobado con cambios, sin P0 ni P1. AI-EM-ARCH: 13 límites con la clave `global`, ninguna `default`; suite completa con 69 suites de integración aprobadas y 4 omisiones declaradas. El informe L1 atribuye 8 suites rojas y 4 omisiones a la siembra de su entorno; no se reprodujeron. **CA-7**, que el informe omitió, lo corrió AI-EM-ARCH con el aprovisionador, tres veces. Con `E2E_API_LOG`: 323 aprobadas, 9 fallidas, 8 omitidas, y 0 respuestas 429 en el log de la API. Los 9 fallos son `portal-billing-flow` (§BR-12 de MOD14) y 8 capturas `win32` con línea base anterior a MOD13, que CI no usa. Sin `E2E_API_LOG`, dos corridas dieron 24 fallos, con timeouts y `HTTP 500` en login. **Causa sin demostrar:** la hipótesis es la tubería de la API sin leer durante `spawnSync`; CI también corre sin ese log y pasó en `4557df41` (331 aprobadas). G6 abierto hasta repetir el E2E tras BR-12 |
| Ola A2, G6 | **G6 ✅ 2026-11-06.** CA-7 tras BR-12: AI-EM-ARCH corrió el aprovisionador completo con `E2E_API_LOG`: 331 aprobadas, 8 fallidas, 1 omitida con motivo, 0 sin ejecutar, 0 inestables; `E2E_CLEANUP=OK`; 0 respuestas 429 y 0 errores 500 en el log de la API. Las 8 fallidas son capturas `win32` desactualizadas de `portal-settings-access-ui` y `portal-settings-organization-ui`. CI ya escribe el log de la API a archivo, así que los 24 fallos vistos sin él dejan de ser un modo posible del job; su causa sigue sin demostrar. Ese archivo no se conserva como artefacto: si la API falla en CI, no habrá detalle. Sin commit; se publica junto con la Ola A; G6.5 pendiente |
| Olas A y A2, G6.5 | **✅ 2026-11-06.** Publicadas en `4406a837`. CI de `main` en verde sobre `07794606`, corrida `42295514534`, todos los jobs en `success`, y E2E Web Admin Smoke `42295514359` en `success`. E2E operativo: 339 aprobadas, 0 fallidas, 1 omitida, 0 inestables, `E2E_CLEANUP=OK`, con las capturas `linux` incluidas. Sigue sin conservarse el log de la API como artefacto de CI |
| Deuda de Ola A2 | Antes de la beta: con JWT válido, `login` y `platform/login` usan bucket por `sub` y no por IP (P2-1); la variable E2E solo se rechaza con `NODE_ENV=production` literal, staging la aceptaría (P2-2). P3: prueba de plataforma por HTTP, multiplicador sin fijar en `rate-limit-env.spec.ts:37-38`, describe «CA-8» mal rotulado. Capturas `win32` desactualizadas |

## Lanzamiento

Bloque copiar-pegar de la Ola A en [PROMPT-AUTH-BLOQUEO-INTENTOS-LAUNCH-v1.0.md](../prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-LAUNCH-v1.0.md). Lista para lanzar.

```text
===== 1 · sr-backend, A1 =====
Actúa como sr-backend. Lee AGENTS.md, §3 y §9 de docs/specs/2026-11-06-transacciones-conexiones-y-efectos-spec.md y §A1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md, con las skills nestjs-expert, auth-implementation-patterns, backend-security-coder, test-driven-development, iwana-test-evidence y verification-before-completion. Empieza por CA-1 en rojo. En main, sin commit.

===== 2 · sec-eng =====
Actúa como sec-eng. Revisa A1 según §R1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md. Solo lectura: hallazgos con archivo:línea.

===== 3 · test-change-reviewer =====
Actúa como test-change-reviewer. Revisa A1 según §R1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md. Solo lectura: clasifica cada ajuste con archivo:línea.

===== 4 · gate-verifier =====
Actúa como gate-verifier. Ejecuta los Gates Before Merge sobre @iwana/api según §R1 de docs/prompts/PROMPT-AUTH-BLOQUEO-INTENTOS-v1.0.md, sin caché y con DB_NAME=test. Entrega conteos reales.
```
