# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 5 · AI-PLAT-OPS

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 5 — merge readiness
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `plat-ops` (AI-PLAT-OPS)
**Encargo:** ejecutar la corrida Linux de CI que condiciona **G6.5**
**Cierra:** la evidencia de **G6.5** — AI-EM-ARCH consolida y decide

> Este encargo **no tiene prompt de fase**: G6.5 no es una etapa del workflow, es un gate intercalado ([ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md), Aprobado). Esta orden es autosuficiente.

---

## 1. Qué autoriza y qué no

| | |
| --- | --- |
| **G6.5 autoriza** | **Merge** |
| **G6.5 NO autoriza** | **Despliegue.** Nunca. Producción es G7, y la aprueba el CTO |

Un GO de G6.5 **no se reporta como avance hacia G7** (ADR-069). Los informes registran G6, G6.5 y G7 por separado, cada uno con su evidencia.

## 2. Precondición que NO controlas — léela antes de empezar

**G6.5 exige una corrida identificada por SHA.** Al emitirse esta orden, el árbol tiene **141 archivos sin commitear** y `HEAD` es `7314c208` (solo documentación): **el trabajo de las olas 1 a 4 no está versionado**.

Sin commit no hay SHA, y sin SHA no hay G6.5. El commit es **decisión del CTO** y se hace sobre `main` (el proyecto no usa ramas — plan §4.5).

**Si al arrancar el árbol sigue sin commitear, no fuerces nada: emite `[BLOQUEO]` a AI-EM-ARCH y detente.** Correr CI sobre un árbol sucio produce evidencia que no identifica nada.

## 3. Estado de entrada

**G6 CERRADO — calidad aceptable** (`INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CONSOLIDACION-v1.0.md` §9), con la ola correctiva 4.1 incorporada. Conteos locales de referencia, ya verificados por el orquestador:

- API: 314 suites passed + 4 skipped · 3936 passed + 15 skipped · exit 0
- Portal: 267/267 suites · 2440 passed + 1 skipped · exit 0
- E2E API bloque 9: 37 passed / 0 failed / 0 skipped / 0 flaky · `E2E_CLEANUP=OK`
- Lint y typecheck: 8/8 · `Cached: 0 cached, 8 total`

**Correr los gates en local satisface G6; no satisface G6.5** (protocolo §4). Tu trabajo es producir esa misma evidencia **en Linux, en GitHub Actions, por SHA**.

## 4. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — **§3 tabla de gates de cierre y fila de merge readiness**, §4 gates técnicos, §6.3 marcadores.
3. `docs/adrs/ADR-069-Gates-G6.5-Merge-Readiness.md` (**Aprobado**) — la taxonomía que gobierna este gate.
4. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-CONSOLIDACION-v1.0.md` — **§5 te deja dos consultas abiertas; §7 tres deudas tuyas; §10 las condiciones de este gate**.
5. `.github/workflows/ci.yml` — los dos jobs que condicionan G6.5: **`production-images`** (línea 56) y **`execution-orders-e2e`** (línea 559).
6. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §8 verificación, §8.1 regla de evidencia.

## 5. Alcance

### 5.1 Cerrar las dos consultas asíncronas que AI-SR-QA te dejó

| # | Asunto | Qué se espera |
| --- | --- | --- |
| **ENV-E2E-CREDS** *(media)* | `E2E_PLATFORM_*` de `.env.development.local` desalineadas: login de plataforma devuelve **401 `USUARIO_NO_ENCONTRADO`**. El provisioner prefiere `PLATFORM_SUPER_ADMIN_*`. Fue la causa del 401 heredado de la ola 2 | Alinea el contrato de variables y déjalo documentado. **Sin credenciales ni valores reales en el informe** |
| **PROVISIONER-TECH2** *(media, CI)* | QA añadió el fixture `E2E_TECH2_*` al provisioner (+19 líneas, fixtures `*.invalid`, sin PII). **Sin él, el caso 9g no corre y el job `execution-orders-e2e` queda rojo** | **Ratifícalo o corrígelo.** Es cambio aditivo de infraestructura de tests; el orquestador ya lo aceptó como parte de F6 y queda a tu ratificación para CI |

### 5.2 Ejecutar la corrida Linux por SHA

Sobre el commit que versione el trabajo de las olas 1–4:

- **`production-images`** y **`execution-orders-e2e`** en verde.
- Prerrequisito del fichero E2E: `npx tsx e2e/scripts/provision-execution-template.ts`.
- La corrida debe quedar **identificada por SHA**, no por rama ni por «la última».

### 5.3 Producir el artefacto resumen sanitizado

Contenido exigido por ADR-069 y el protocolo §3:

- Setup, **conteo mínimo de pruebas**, **cero fallos**, **cero skips**, **cleanup confirmado**, SHA, plataforma y duración.
- **Nunca** tokens, cookies, reportes brutos ni payloads. Las credenciales de CI son efímeras y no se archivan.

### 5.4 E2E-PORTAL-DEBT — instrumentar, no arreglar

La suite E2E portal completa arrastra **98 fallos preexistentes** (specs sin mock de `me/effective-permissions`, desde `d5db6239`), **ajenos a este módulo**. No los arregles aquí: **instrumenta el conteo en CI** para que dejen de pasar desapercibidos, y repórtalo como deuda del programa con su dueño.

### 5.5 Opcional, si el entorno lo permite

Medición de **p95** del nuevo `GET /tasks/execution-orders`. Es la condición que ADR-065 §22-bis exige antes de que AI-EM-ARCH pueda autorizar el tramo de `sortableFields`. **No es condición de G6.5**: si no puedes medirlo, decláralo y sigue.

## 6. Skills — leer antes de actuar

**Obligatorias:** `docker-expert`, `observability-engineer`.
**De apoyo:** `e2e-testing-patterns` y `playwright-skill` (para juzgar la salud del job de e2e), `turborepo-caching` (si el caché de CI enmascara ejecuciones), `codebase-cleanup-deps-audit` (solo si aparece una alerta de dependencias en el job).
**No uses:** `brainstorming`, `architecture-decision-records` (no nace ADR nuevo; si crees que hace falta, emite `[BLOQUEO]`).

## 7. Superficie

`.github/workflows/`, `e2e/scripts/` y configuración de entorno. **No toques código de producto** (`apps/api/`, `apps/portal/`, `packages/`): si un job rojo revela un defecto de producto, es hallazgo con dueño — `[CONSULTA]` a AI-SR-FULL o AI-FE-PLATFORM, o `[BLOQUEO]` si impide cerrar el gate.

## 8. Restricciones no negociables

1. **No declares G6.5 cumplido con evidencia local.** Local satisface G6, no G6.5 (protocolo §4).
2. **No uses un push futuro como evidencia** de una corrida que aún no ocurrió, ni una imagen Docker construida como prueba de G7.
3. **No archives tokens, cookies, reportes brutos ni payloads.**
4. **No presentes G6.5 como avance hacia G7.**
5. **No arregles los 98 fallos preexistentes** de la suite portal en esta ola.
6. Sin PII real ni credenciales en informes ni fixtures. Solo `pnpm`.

## 9. Entregable

Informe en `docs/informes/` con:

- **SHA** de la corrida, plataforma, duración y enlace de identificación del run.
- Estado de `production-images` y `execution-orders-e2e`.
- **Artefacto resumen sanitizado** (§5.3).
- Resolución de ENV-E2E-CREDS y PROVISIONER-TECH2.
- Instrumentación de E2E-PORTAL-DEBT.
- Medición p95 si se obtuvo; si no, la declaración de por qué.
- Deuda residual por severidad.

## 10. Stop/go — tu encargo no cierra si

- El árbol no está commiteado y no hay SHA (→ `[BLOQUEO]`, §2).
- Alguno de los dos jobs no está verde en **Linux**.
- El resumen contiene tokens, cookies, reportes brutos o payloads.
- Hay skips sin declarar, o el cleanup no está confirmado.
- PROVISIONER-TECH2 queda sin ratificar (el job `execution-orders-e2e` quedaría rojo en CI).
- Se presenta evidencia local como si fuera de CI.

## 11. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión — **en particular si falta el commit**. `[CONSULTA]` a AI-SR-FULL (orden de migraciones y healthchecks), a AI-FE-PLATFORM (requisitos de build), a AI-SR-QA (requisitos de la suite en CI: tiempos, paralelismo), a AI-SEC-ENG (control de seguridad en infraestructura — **bloqueante**).

## 12. Reporte final

Declara qué skills leíste, el SHA y el estado de cada job, el resumen sanitizado, la resolución de las dos consultas, y la deuda residual. **La decisión de G6.5 la toma AI-EM-ARCH sobre tu evidencia**; tu informe no la anticipa.
