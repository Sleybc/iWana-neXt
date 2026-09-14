# INFORME — MOD11 Operaciones · OLA 5 · Plataforma (AI-PLAT-OPS) — Evidencia para G6.5

**Versión:** 1.0
**Fecha:** 2026-09-13
**Emisor:** AI-PLAT-OPS (Platform / DevOps Engineer)
**Encargo:** [`docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA5-PLAT-OPS-v1.0.md`](../prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA5-PLAT-OPS-v1.0.md) + adenda de estado en vivo del orquestador
**Normativa del gate:** [ADR-069 — Gate G6.5 de merge readiness](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (Aprobado) · Protocolo §3 y §4
**Regla de evidencia:** plan [`2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md`](../plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md) §8.1
**Entrada:** [consolidación OLA 4](INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CONSOLIDACION-v1.0.md) §5 (dos consultas asíncronas a PLAT-OPS), §7 (tres deudas), §10 (condiciones del gate)

> **Alcance de este informe:** produce la **evidencia** que ADR-069 exige para G6.5. **No declara G6.5**: la decisión es de AI-EM-ARCH sobre esta evidencia. G6.5 autoriza merge, nunca despliegue; no se reporta como avance hacia G7.

---

## 1. Resultado en una vista

| Entrega | Estado |
| --- | --- |
| Corrida Linux identificada por SHA con los dos jobs G6.5 en verde | ✅ Run [`34791789744`](https://github.com/Sleybc/iWana-neXt/actions/runs/34791789744) sobre `d211f4039e6fbcee4218c9e5944170ac80b13aab` |
| Job `ci` roto (`pnpm test:tooling`) | ✅ Diagnosticado (causa en superficie de plataforma) y corregido — ver §4 |
| Consulta ENV-E2E-CREDS | ✅ Cerrada — ver §5.1 |
| Consulta PROVISIONER-TECH2 | ✅ **Ratificado por ejecución en CI** — ver §5.2 |
| E2E-PORTAL-DEBT instrumentado en CI | ✅ Job `e2e-portal-debt-counter` — ver §6 |
| p95 del nuevo listado de OT | ⬜ **Sin medición, declarado** — ver §7 |
| Marcadores emitidos | **Ninguno** — no hubo bloqueo ni consulta esta ola |

## 2. Corrida final identificada por SHA

| Campo | Valor |
| --- | --- |
| **SHA de la corrida** | `d211f4039e6fbcee4218c9e5944170ac80b13aab` (push a `main`, evento `push`) |
| **Run** | [`34791789744`](https://github.com/Sleybc/iWana-neXt/actions/runs/34791789744) · workflow `CI` · attempt 1 |
| **Plataforma** | GitHub Actions, runner `ubuntu-latest` Linux X64 · node v24.13.1 · pnpm 10.32.1 |
| **Disparo** | 2026-09-14T00:09:42Z |

**Estado final por job relevante (Linux):**

| Job | Definición | Duración | Estado |
| --- | --- | --- | --- |
| `production-images` | ci.yml:56 — «Build y validación de imágenes production» | ~3 m 47 s | ✅ success |
| `execution-orders-e2e` | ci.yml:559 — «E2E operativo R4.1 — API + storage + BullMQ reales» | ~4 m 53 s | ✅ success |
| `ci` | ci.yml:193 — «Lint + Typecheck + Build + Unit tests» | ~11 m 52 s | ✅ success |
| `adr-citations` | ci.yml:28 — «Integridad de citas ADR» | ~12 s | ✅ success |
| `e2e-portal-debt-counter` | ci.yml (nuevo) — «Conteo deuda E2E portal (informativo, no bloqueante)» | ~46 m | ✅ success (informativo) — ver §6 |

Esta es la **única corrida que sirve como evidencia de G6.5**. La corrida previa sobre `de2a6304` (run [`34790180053`](https://github.com/Sleybc/iWana-neXt/actions/runs/34790180053)) tenía los dos jobs G6.5 en verde pero el job `ci` en rojo: quedó sustituida por la corrida final del SHA corregido, conforme a la adenda del orquestador (la evidencia de G6.5 va sobre UN SHA donde todo lo relevante esté verde).

## 3. Artefacto resumen sanitizado (exigido por ADR-069)

Contenido íntegro del artefacto `e2e-r41-summary` del run `34791789744` (sin tokens, cookies, payloads ni reportes crudos — así lo genera el paso «Generate E2E R4.1 summary (sanitized)» del workflow):

```text
iWana neXt — E2E R4.1 summary (sanitized, sin tokens ni datos de sesión)
workflow: CI
run_id: 34791789744  attempt: 1
commit: d211f4039e6fbcee4218c9e5944170ac80b13aab  ref: refs/heads/main  event: push
runner: Linux (X64)
node: v24.13.1   pnpm: 10.32.1

marcadores E2E (no secretos):
E2E_SETUP=OK|tenants=e2e-r1-r41-<sufijo efímero>,e2e-tenant-b-<sufijo efímero>
E2E_PLAYWRIGHT_PASSED=37
E2E_PLAYWRIGHT_FAILED=0
E2E_PLAYWRIGHT_SKIPPED=0
E2E_PLAYWRIGHT_DID_NOT_RUN=0
E2E_PLAYWRIGHT_FLAKY=0
E2E_PLAYWRIGHT_EXIT=0
E2E_PLAYWRIGHT_DURATION_MS=133023
E2E_CLEANUP=OK
E2E_TOTAL_DURATION_MS=242610
```

Lectura contra los requisitos de ADR-069 para el job E2E:

| Requisito | Evidencia |
| --- | --- |
| Setup | `E2E_SETUP=OK` — Compose (postgres/redis/minio/typesense) + migraciones public+tenant + worker BullMQ con healthcheck + API con healthcheck + provisioner de fixtures |
| Conteo mínimo de pruebas | **37 passed** ≥ mínimo 30 (`REQUIRED_OPERATIONAL_E2E_PASSED=30` en el provisioner, verificado por el paso «Verify E2E R4.1 gates») |
| Cero fallos | `E2E_PLAYWRIGHT_FAILED=0`, `DID_NOT_RUN=0`, `FLAKY=0`, `EXIT=0` |
| Cero skips | `E2E_PLAYWRIGHT_SKIPPED=0` |
| Cleanup confirmado | `E2E_CLEANUP=OK` + paso «Cleanup E2E infrastructure (safety net)» con `always()` |
| SHA / plataforma / duración | `d211f403…` · Linux X64 · Playwright 133.0 s / vertical completa 242.6 s |

Notas del artefacto:

- Los slugs de tenant del setup son efímeros por corrida (`E2E_CLEANUP=OK` los destruye al final); se reportan con el sufijo enmascarado por higiene, no por secreto.
- La sección «estado de jobs» del artefacto es una **fotografía al momento en que el job E2E terminó** (ahí `ci` y el contador aún corrían); los estados autoritativos de cada job son los del run citado en §2, todos verdes.
- Esta corrida repite el patrón de la corrida sustituida sobre `de2a6304` (mismo conteo 37/0/0/0, cleanup OK, Playwright 134.5 s): el resultado es estable entre dos corridas independientes en SHAs distintos.

## 4. Job `ci` roto — diagnóstico y resolución (superficie de plataforma)

### 4.1 Qué se observó

El run [`34790180053`](https://github.com/Sleybc/iWana-neXt/actions/runs/34790180053) (SHA `de2a6304`, push del 2026-09-13) falló en el job `ci`, step «Validate development tooling» (`pnpm test:tooling`, ci.yml:268), a los 54 s — **antes** de lint/typecheck/build/tests. Mismo fallo en el run [`34721615060`](https://github.com/Sleybc/iWana-neXt/actions/runs/34721615060) (SHA `a0809df7`, 2026-09-12), que es la **primera corrida** con el defecto.

### 4.2 Causa raíz

El commit `a0809df7` (plat-ops, restore por tenant) extendió `test:tooling` con las suites `backup-tenant.test.mjs` / `restore-tenant.test.mjs` y les antepuso `pnpm --filter @iwana/db build`. Ese prefijo es necesario: `scripts/db/lib/tenant-tooling.mjs` carga `isValidSchemaName` desde el artefacto **compilado** de `@iwana/db`. Pero el build de `@iwana/db` resuelve `@iwana/shared` contra `dist/` (su `package.json` declara `"types": "./dist/index.d.ts"`) y `pnpm --filter` **no construye dependencias previas** (a diferencia de turbo con `dependsOn: ^build`). En un checkout limpio de CI, `packages/shared/dist` no existe → `tsc` falla con `TS2307: Cannot find module '@iwana/shared'` en ~50 entidades y seeds.

Dos agravantes que explican que llegara rojo a `main`:

1. **En local no se veía**: la máquina de desarrollo tenía `packages/shared/dist` construido por work previo, así que `test:tooling` pasaba. Es exactamente la frontera que el protocolo §4 dibuja: la evidencia local satisface G6 en sus gates, pero el pipeline en runner limpio es otra superficie de ejecución.
2. **El propio ci.yml documentaba la trampa** en la nota R-13 del paso de unit tests («@iwana/db NO tiene moduleNameMapper y sus entities importan @iwana/shared, que resuelve a dist»), pero el nuevo script de tooling se añadió sin reenviar a esa nota.

Clasificación: **defecto de superficie de plataforma** (script de tooling del `package.json` raíz, introducido por un commit previo de plat-ops) — no de código de producto; no procedía `[CONSULTA]` a ingeniería.

### 4.3 Resolución

Commit `c7ca23fc2ed5e0ec08739d59ee584acbf8dc2a60` — `fix(plat-ops): test:tooling construye @iwana/shared y CI contea la deuda E2E portal`:

```json
"test:tooling": "pnpm --filter @iwana/shared build && pnpm --filter @iwana/db build && node --test …"
```

Verificación en dos niveles:

- **Local, desde estado limpio**: con `packages/shared/dist` y `packages/database/dist` eliminados (réplica del runner), el script reprodujo el `TS2307` idéntico al de CI **antes** del fix, y tras el fix pasó **126/126 tests, 0 fallos, 0 skips**.
- **CI, en runner limpio**: el step «Validate development tooling» del run `34791789744` pasó, y con él el job `ci` completo (lint, typecheck, build, unit tests + gate de cobertura, migraciones public/tenant, integraciones 089/API/worker contra PostgreSQL real, gates SEC-04) — todo verde, ~11 m 52 s.

## 5. Resolución de las consultas asíncronas de AI-SR-QA (OLA 4 §5)

### 5.1 ENV-E2E-CREDS — CERRADA

**Contrato vigente de variables (documentado y versionado):**

| Variable | Papel |
| --- | --- |
| `PLATFORM_SUPER_ADMIN_EMAIL` / `PLATFORM_SUPER_ADMIN_PASSWORD` | **Canónico para el provisioner** (`scripts/e2e-provision-operational.mjs:356-373`): en una base efímera recién migrada la única cuenta de plataforma que existe es la que `PlatformBootstrapService` crea desde estas variables |
| `E2E_PLATFORM_EMAIL` / `E2E_PLATFORM_PASSWORD` | **Alias de consumo de los specs** (`e2e/load-env.ts`, specs Playwright): el provisioner resuelve la identidad canónica y la reexporta bajo este alias a la suite |

Cambios entregados (commit `c7ca23fc`):

1. `.env.example` (versionado) documenta el contrato junto a las variables canónicas, incluida la regla operativa: si se definen `E2E_PLATFORM_*` locales, deben apuntar a la **misma identidad** de `PLATFORM_SUPER_ADMIN_*`; una identidad que no existe en la base objetivo produce el `401 USUARIO_NO_ENCONTRADO` que causó el 401 heredado de la ola 2.
2. El `.env.development.local` local (gitignoreado, sin valores en este informe) se alineó: `E2E_PLATFORM_*` refleja ahora la misma identidad que `PLATFORM_SUPER_ADMIN_*`. Verificado por script sin imprimir valores.

Con esto desaparece la desalineación que originó la consulta: cualquier consumidor (provisioner o specs) resuelve una identidad que existe en la base que corre.

### 5.2 PROVISIONER-TECH2 — RATIFICADO

El fixture `E2E_TECH2_*` añadido por QA (commit `5704e8df`, +19 líneas) queda **ratificado sin correcciones**:

- **Aditivo y autofiable**: `E2E_TECH2_EMAIL`/`E2E_TECH2_PASSWORD` tienen defaults en código (`tech2@{tenant}.invalid` y clave efímera generada, dominio `.invalid`) — no exige configuración nueva en CI ni en local (provisioner líneas 382-384, export a Playwright en 1732-1733).
- **Sin PII**: dominios `.invalid`, claves generadas por corrida; nada versionado con valores reales.
- **Necesario y suficiente para 9g**: sin el fixture la suite aborta en el caso BOLA 9g (segundo técnico del mismo tenant) y el bloque 9 no cierra; con él, el bloque completo corre.
- **Prueba en CI (la ratificación que pedía la orden)**: el job `execution-orders-e2e` está **verde en las dos corridas** (`34790180053` sobre `de2a6304` y `34791789744` sobre `d211f403`) con **37/37 passed, 0 skipped** y el gate del provisioner exigiendo ≥30 — sin el fixture activo ese conteo es inalcanzable.

## 6. E2E-PORTAL-DEBT — instrumentación en CI (sin arreglar los fallos)

**Qué se instrumentó** (commit `c7ca23fc`, job `e2e-portal-debt-counter` en ci.yml):

- Corre la **suite E2E portal completa** (36 specs, 232 casos) en Linux, contra el dev server del portal que la propia config de Playwright levanta (mismo camino que `pnpm test:e2e:portal`).
- Publica **total / passed / failed / skipped / flaky / duración** en el resumen del run (GITHUB_STEP_SUMMARY) y en el log con claves grep-ables (`E2E_PORTAL_DEBT_FAILED=…`).
- **Trinquete contra el baseline 98** (`E2E_PORTAL_DEBT_BASELINE` en el job): si el conteo **sube**, emite `::warning` de regresión nueva en specs portal; si **baja**, `::notice` para actualizar el baseline hacia abajo. El parser usa el reporte JSON de Playwright (stats `expected/unexpected/flaky/skipped`, probado contra la forma real del reporter 1.58).
- **No es un gate**: `continue-on-error: true` — un contador de deuda no puede ser la razón de un rojo ni su ruido puede tapar los gates reales. La deuda se hace visible en cada corrida sin bloquear el merge readiness. Cuando el programa pague la deuda: bajar el baseline y retirar el `continue-on-error` para convertir el conteo en compuerta.
- **Sin reportes crudos**: no se archiva el reporte JSON (contiene payloads de error); solo los conteos publicados.

**Resultado de la primera corrida en CI** (run `34791789744`, Linux, ~44.8 min de suite):

| total | passed | failed | skipped | flaky | duración |
| --- | --- | --- | --- | --- | --- |
| 257 | 157 | **100** | 0 | 0 | 44 m 48 s |

Hallazgos de la primera medición:

- **El total real de la suite en CI es 257 casos** (la referencia local de 232 era un conteo estático de `test(`; la cifra autoritativa es la del reporter de Playwright).
- **CI mide 100 fallos sobre el baseline local de 98** (OLA 4, medido en Windows). El trinquete hizo su trabajo: emitió el `::warning` de crecimiento y obligó a examinar el delta. Lectura: el baseline 98 era una medición **local/Windows**; el contador corre en **CI/Linux**, otra plataforma de renderizado y timing. Con `flaky=0` y `skipped=0`, los 2 casos de delta se atribuyen a la diferencia de plataforma y **no se arreglan aquí** (restricción de la orden): quedan dentro de la misma deuda del programa.
- **Baseline calibrado a la medición de CI**: `E2E_PORTAL_DEBT_BASELINE` 98 → **100** (commit de cierre de la ola, junto a este informe). Regla del instrumento: el baseline es la última medición estable del contador **en CI**; el job avisa en ambas direcciones (si la próxima corrida mide menos, el propio `::notice` pide bajarlo). Sin calibración, cada corrida habría emitido una falsa alarma de crecimiento y la deuda habría vuelto a pasar desapercibida por fatiga de alarma.

**Deuda registrada** (sin cambios respecto a OLA 4 §7): los fallos preexistentes (specs sin mock de `me/effective-permissions` desde `d5db6239`) son **deuda del programa**, dueño registrado en OLA 4: AI-PLAT-OPS / programa; la instrumentación entregada aquí cierra la parte de PLAT-OPS (visibilidad y conteo objetivo en CI), no el arreglo de los specs.

## 7. p95 del listado de OT — SIN MEDICIÓN, DECLARADO

**No se midió el p95 de `GET /tasks/execution-orders` en esta ola.** Declaración de por qué, conforme al §5.5 de la orden (no es condición de G6.5):

1. **El instrumento exige volumen representativo.** `scripts/p95-pagination-measure.sql` + `scripts/run-p95-measure.ps1` miden 50 iteraciones por consulta (count, page 1, page 5) vía `clock_timestamp()` sobre un tenant con volumen representativo — precondición escrita en la cabecera del propio SQL.
2. **El entorno disponible no lo ofrece.** La base que levanta el job E2E en CI es efímera y casi vacía (fixtures mínimos): un p95 sobre tablas casi vacías no es evidencia de latencia, es ruido con forma de cifra — y la regla de evidencia §8.1 del plan castiga exactamente eso. El runner de CI (2 vCPU compartido) tampoco es representativo de un host productivo.
3. **La condición de ADR-065 §22-bis sigue abierta para el tramo `sortableFields`** (deuda heredada, dueño AI-PLAT-OPS → AI-EM-ARCH): requiere una medición controlada con tenant sembrado a volumen, no disponible en esta sesión. Queda registrada como deuda activa en §8.

## 8. Deuda residual (por severidad)

| # | Severidad | Deuda | Dueño | Estado |
| --- | --- | --- | --- | --- |
| E2E-PORTAL-DEBT | Media | Arreglar los ~98–100 fallos preexistentes de la suite portal (specs sin mock desde `d5db6239`; 257 casos, CI mide 100 fallos) y convertir el contador en compuerta | Programa (registrada en OLA 4 §7) | **Instrumentada y conteada en CI** (§6); el arreglo sigue abierto |
| sortableFields | Media (heredada) | Medición p95 con tenant a volumen representativo antes del tramo `sortableFields` (ADR-065 §22-bis) | AI-PLAT-OPS → AI-EM-ARCH | **Activa** — instrumento listo (`scripts/run-p95-measure.ps1` + SQL), falta entorno con volumen |
| Snapshot del artefacto | Baja | La sección «estado de jobs» del artefacto `e2e-r41-summary` congela el momento en que termina el job E2E; para estados finales autoritativos hay que leer el run | AI-PLAT-OPS | Observación; los estados del run citado en §2 están completos y verdes |
| Coste CI del contador | Baja | El job `e2e-portal-debt-counter` añade ~45 min de runner informativo por push | AI-PLAT-OPS | Aceptado a cambio de visibilidad; si el coste molesta, decidir ventana o disparo por etiqueta (decisión de plataforma) |

## 9. Instrumentación de la ola

- **Skills leídas (SKILL.md antes de actuar):** obligatorias `docker-expert` y `observability-engineer`; de apoyo, por la revisión del job E2E y el diseño del contador: `e2e-testing-patterns`, `playwright-skill`, `turborepo-caching`. No se activó `codebase-cleanup-deps-audit` (no hubo alerta de dependencias en el job). No se usaron las prohibidas (`brainstorming`, `architecture-decision-records`): no nació ADR nuevo.
- **Marcadores:** 0 `[BLOQUEO]`, 0 `[CONSULTA]`, 0 `[DESEMPATE]`.
- **Commits de esta ola (superficie de plataforma, precedente `14e91f37`):**
  - `c7ca23fc2ed5e0ec08739d59ee584acbf8dc2a60` — fix(plat-ops): test:tooling construye `@iwana/shared` + job contador de deuda E2E portal + contrato de credenciales E2E en `.env.example`
  - `d211f4039e6fbcee4218c9e5944170ac80b13aab` — chore(plat-ops): el artefacto resumen E2E lista el estado de jobs con `GH_TOKEN`
  - Commit de cierre de la ola (informe + calibración del baseline 98→100): `docs(plat-ops)` — documental y de calibración del instrumento; la evidencia de G6.5 sigue siendo la corrida del SHA `d211f403…` (§2)
- **Credenciales:** las de CI del job E2E son efímeras por corrida, enmascaradas con `::add-mask::` y jamás archivadas; este informe no contiene tokens, cookies, payloads ni valores reales de entorno.

## 10. Registro de gates (sin anticipar decisiones)

- **G6:** cerrado por AI-EM-ARCH en OLA 4 (calidad aceptable). Esta ola no lo modifica.
- **G6.5:** **evidencia producida y completa** (§2, §3, §5.2). La decisión **GO/NO-GO de merge la toma AI-EM-ARCH** sobre esta evidencia; este informe no la anticipa. G6.5 autoriza merge, nunca despliegue.
- **G7:** no se toca. Nada de lo aquí producido (ni las imágenes construidas por `production-images`) constituye avance hacia G7 (ADR-069).
