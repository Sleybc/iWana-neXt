# Plan de fase — Remediación del perfil propio del portal (MOD04)

**Modo de operación:** AI-EM-ARCH — EM + Orchestrator
**Fecha:** 2026-09-03
**Origen:** [INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0](../informes/INFORME-MOD04-PERFIL-PORTAL-AUDITORIA-v1.0.md)
**Objetivo de salida:** reemitir el cierre de MOD04, hoy **reabierto** por haberse firmado sobre alcance incompleto.

---

## 1. Qué se está arreglando

17 hallazgos: 3 Altos, 7 Medios, 7 Bajos, 0 críticos. La pantalla de perfil propio nunca entró en ningún turno de auditoría y quedó dentro de un módulo declarado cerrado el 2026-07-23.

**El defecto que explica a los demás es de proceso:** el módulo tiene cero tests y el comando de gate que un plan vigente usaba para verificarlo ejecutaba cero tests y salía 0. Por eso este plan **empieza por reparar la compuerta**, no por arreglar código: remediar bajo un gate que no puede fallar es repetir la causa raíz.

## 2. Tracks y dueños

| Track | Prompt (G4 emitido) | Dueño | Superficie |
| --- | --- | --- | --- |
| **T1 · Compuerta y pruebas** | [PERFIL-TESTS](../prompts/PROMPT-MOD04-PERFIL-TESTS-v1.0.md) | AI-SR-QA | `package.json`, `jest.config.js`, `**/*.spec.tsx`, `e2e/` |
| **T2 · Defectos funcionales** | [PERFIL-P0](../prompts/PROMPT-MOD04-PERFIL-P0-v1.0.md) | AI-FE-PLATFORM | `components/profile/`, `AuthProvider.tsx`, `api-client.ts`, `packages/shared/constants` |
| **T3 · Credenciales y auditoría** | [PERFIL-SEGURIDAD](../prompts/PROMPT-MOD04-PERFIL-SEGURIDAD-v1.0.md) | AI-SR-FULL (+ revisión AI-SEC-ENG) | `apps/api/**` |
| **T4 · Consolidación DS** | [PERFIL-CONSOLIDACION-DS](../prompts/PROMPT-MOD04-PERFIL-CONSOLIDACION-DS-v1.0.md) | AI-FE-PLATFORM | `packages/ui`, `components/profile/`, `packages/shared/schemas`, `next.config.ts` |
| **T5 · Avatar** | [TRANSVERSAL-AVATAR](../prompts/PROMPT-TRANSVERSAL-AVATAR-CONTRATO-v1.0.md) | AI-DS-OWNER → AI-FE-PLATFORM | `docs/specs/`, luego `packages/ui` y 6 sitios |

**Contratos congelados de la fase** (§3bis: sin artefacto localizable y citado, un contrato no está congelado):

- **Contrato de componente:** [`docs/specs/2026-09-03-contrato-formstatus-sectionheader.md`](../specs/2026-09-03-contrato-formstatus-sectionheader.md) **v1.0** → consume T4.
- **Contrato de API:** sin cambios. Ningún track modifica el shape de `/users/me`; T3 solo añade validación y auditoría.
- **Contrato de `Avatar`:** **no congelado todavía** — lo produce el acto 1 de T5.

## 3. Secuencia — por qué este orden y no otro

```
Ola 0   T1 Paso 1 ── reparar la compuerta
          │
Ola 1   T1 resto ── red de pruebas EN ROJO
          │
Ola 2   ├── T2 (FE) ─┐  paralelo: superficies disjuntas
        └── T3 (API) ─┘  los 9 rojos pasan a verde
          │
Ola 3   T4 ── consolidación DS (los tests deben seguir verdes)
          │
Ola 4   T5 acto 2 ── migración de Avatar

  T5 acto 1 (contrato, documental) ── puede correr desde el día 1, en paralelo con todo
```

**Ola 0 antes que nada.** `apps/portal/package.json:10` lleva `--passWithNoTests`. Mientras siga ahí, cualquier evidencia que produzcan los demás tracks es indistinguible de una corrida vacía.

**Ola 1 antes de la remediación, y en rojo a propósito.** Un test escrito *después* del fix demuestra que el código pasa; escrito *antes*, demuestra que **caza el defecto**. Los 9 casos bloqueantes deben fallar antes de la Ola 2 — ese rojo es el entregable de T1, no un problema.

**T2 y T3 en paralelo**: portal y API son superficies disjuntas. Solo se tocan en los tres cruces de §4.

**T4 después de T2, nunca a la vez.** Ambos editan los cuatro archivos de `components/profile/`. En paralelo colisionan en cada merge.

**T5 acto 1 desde el principio**: es documental, no toca código, y su resultado no bloquea a nadie hasta la Ola 4.

## 4. Cruces entre agentes — los tres puntos donde un track depende de otro

Están declarados como `[CONSULTA]` en los prompts. Si nadie los cierra, el trabajo queda a medias en ambos lados.

| # | Qué | Lo abre | Lo cierra | Si no se cierra |
| --- | --- | --- | --- | --- |
| C-1 | `phone: null` no atraviesa `@Matches` con `@IsOptional()` a secas | T2 | T3 | El borrado de campo (P-06) funciona para `jobTitle` y falla para `phone` |
| C-2 | Retirar `syncCompanyContactEmail: true` fijado en el cliente | T3 | T2 | El cliente sigue imponiendo un efecto sobre `public.tenants` |
| C-3 | Logout tras el cambio voluntario de contraseña | T3 | T2 | El access token sigue vivo 15 min pese al fix del servidor |

**Regla:** quien abre el cruce lo registra en su reporte de fase con el marcador `[CONSULTA]`, y **no cierra su fase** sin que el otro lado lo haya confirmado o sin haberlo escalado a EM-ARCH.

## 5. Definition of ready por ola

Quien **recibe** el handoff verifica su propio DoR; si falta algo emite `[BLOQUEO]` **antes** de empezar, no a mitad.

| Entra a | No arranca sin |
| --- | --- |
| Ola 1 | Script `test` sin `--passWithNoTests` y `coverageThreshold` por glob para `components/profile/**` |
| Ola 2 | Los 9 casos bloqueantes escritos y **fallando**, con su salida adjunta. Semántica de borrado decidida (informe §3.3). ADR-086 con decisión del CTO registrada y firma del 2026-09-04 |
| Ola 3 | Ola 2 cerrada con los 9 en verde. Spec de contrato citada por ruta y versión en el prompt |
| Ola 4 | Contrato de `Avatar` congelado en `docs/specs/`. Turno de perfil cerrado (T4 mergeado) |

## 6. Criterios de salida por ola

| Ola | Sale cuando | Evidencia exigida |
| --- | --- | --- |
| 0 | El gate puede fallar | Corrida contra un spec inexistente que **sale ≠ 0** |
| 1 | 9 casos rojos, con motivo trazable a su hallazgo | Salida de jest con los 9 fallos nombrados |
| 2 | 9 en verde; los 3 cruces cerrados; dictamen de SEC-ENG sin bloqueantes | `jest` directo + `pnpm --filter @iwana/api test` + lint + typecheck |
| 3 | Cobertura `components/profile/**` ≥ 80%; a11y sin violaciones; los 9 siguen verdes tras el refactor | Cobertura sin caché + `jest-axe` + E2E con servidor fresco |
| 4 | 6 sitios migrados, sin cambio funcional en el diff | Suites de ui, portal y web |

**Que los 9 sigan verdes tras la Ola 3 no es un trámite:** es la prueba de que los tests consultan por rol y label, no por estructura del DOM. Si el refactor los rompe, los tests estaban mal escritos y se corrigen ellos, no el refactor.

## 7. Evidencia — cómo se acredita, y cómo no

**Nunca** `pnpm --filter @iwana/portal test`: arrastra `--passWithNoTests`.

```bash
pnpm --filter @iwana/portal exec jest --ci --runInBand --coverage \
  --collectCoverageFrom='components/profile/**/*.tsx' \
  --testPathPattern='components/profile/.*\.spec\.tsx$'
```

Si se corre por Turbo, `--force --ui=stream` y se adjunta la línea `Cached: 0` — el modo TUI por defecto no la deja en un log capturable. Para E2E, `PW_FORCE_FRESH_SERVER=1`: `playwright.portal.config.ts:67` reutiliza servidor fuera de CI y sirve código anterior.

Las tres son variantes del mismo defecto: una forma de evidencia que no respalda lo que aparenta.

## 8. Restricciones que aplican a todos los tracks

1. **Un track no toca la superficie de otro.** Los `*.spec.tsx` son de T1: FE no los crea en T2 aunque su prompt le pida fijar invariantes — pide el caso a QA. Es la regla que evita el conflicto de merge más probable de esta fase.
2. **Commits separados por ola.** No mezclar remediación funcional con refactor de design system: si algo regresa, el diff que hay que leer debe ser pequeño.
3. **El diff en vuelo entra en la Ola 2.** `PersonalInfoForm.tsx` tiene sin commitear la corrección `updateMe(userId, dto)` → `updateMe(dto)`. Va en el commit de T2 con su test.
4. Tenant desde JWT, nunca desde input. Sin PII real en tests, fixtures ni correos. Texto visible en español, sentence case.
5. **Sin tokens ni radios nuevos.** Los 44 radios arbitrarios y los tres eyebrows están escalados al CTO y quedan fuera de toda ola.

## 9. Decisiones y bloqueos vivos

| Asunto | Estado | Bloquea |
| --- | --- | --- |
| Cédula visible en perfil propio | **Decidido y firmado** (CTO, 2026-09-03 / firma 2026-09-04) → [ADR-086](../adrs/ADR-086-Acceso-Titular-Documento-Perfil-Propio.md) (`Aprobado`) + [PRD v1.2](../prds/PRD-MOD04-USUARIOS-INTERNOS-v1.2.md) | Nada |
| Política de contraseñas min 10 + NIST, servidor incluido | **Aprobado** (CTO, 2026-09-03) | Nada |
| `Avatar` a turno propio | **Aprobado** (CTO, 2026-09-03) | Nada |
| Radios arbitrarios y eyebrows paralelos | **Escalado**, sin decisión | Nada de este plan. Desbloquea el resto del repo |

**Condición que arrastra la decisión de la cédula:** ADR-086 §4 ata la autorización a que la UI renderice el campo, y §5 la ata a cerrar P-07. Si T2 no expone el campo o T3 no audita valores, **la proyección debe retirarse del backend** — no vale dejarlo a medias.

## 10. Riesgos de esta fase

| Riesgo | Señal temprana | Respuesta |
| --- | --- | --- |
| T2 y T4 se solapan en `components/profile/` | Un merge con conflicto en los cuatro archivos | Serializar: T4 no arranca hasta que T2 esté mergeado |
| El tipo de marca de `TenantSlug` se propaga a las 20 funciones del api-client | T2 reporta que el cambio crece | Acotar a `userApi` y declararlo. No ampliar sin consultar |
| Endurecer la política de contraseñas rompe una vía de creación de credencial | Falla el bootstrap o el reset | La validación aplica al fijar, no al verificar: revisar bootstrap, reset y password temporal antes de cerrar T3 |
| Unificar las respuestas del middleware (P-17) degrada los mensajes de login | FE-PLATFORM rechaza el cambio | `[DESEMPATE]` a EM-ARCH; el oráculo es Bajo y puede diferirse |
| Los tests se acoplan al DOM del design system | Se rompen en la Ola 3 | Se corrigen los tests, no el refactor (§6) |

## 11. Cierre de la fase

Al cerrar la Ola 3, AI-EM-ARCH consolida el informe de fase y evalúa la reemisión del cierre de MOD04. **Condición nueva, derivada del defecto que reabrió el módulo:** el informe de cierre debe enumerar **las dos superficies frontend del HLD** — `components/users/` y `components/profile/` — y marcar qué turno cubrió cada una. Una superficie sin turno asociado bloquea el GO.

La Ola 4 (Avatar) es turno propio y **no bloquea** el cierre de MOD04: se registra como deuda con dueño y prompt emitido.
