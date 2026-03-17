# INFORME — Sistema: Normalización Documental + Materialización HLD

# INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md

**Version:** 2.3
**Fecha:** 2026-03-08
**Fecha de última actualización:** 2026-03-17
**Plantilla base:** docs/informes/TEMPLATE-INFORME-FASE-v1.0.md
**Convención documental:** {TIPO}-{MODULO}-{FASE}-v{VERSION}.md
**Política de ejecución:** ADR-022

---

## Identificacion

- Modulo: Sistema (gobernanza documental)
- Fase: Normalización documental + materialización HLD MOD01
- Sprint: Pre-Sprint (Semana -1, previo a Scaffold)
- Fecha: 2026-03-08
- Responsable principal: AI-EM-ARCH (Engineering Manager + Architect Software)

---

## 1. Resumen ejecutivo

- **Objetivo de la fase:** Materializar los tres artefactos documentales bloqueantes para el inicio de la ejecución del Módulo 1 de iWana neXt: el HLD de arquitectura (artefacto de entrada obligatorio para el prompt de ejecución), el prompt de ejecución de la fase Scaffold, y la normalización de los templates de informes a la convención `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.
- **Resultado alcanzado:** Los tres artefactos fueron materializados exitosamente. El HLD cubre las 10 secciones requeridas. El prompt de Scaffold está listo para ejecución. Los dos templates de informes fueron renombrados a la convención correcta.
- **Estado:** Completa

---

## 2. Entregables implementados

- **Backend:** N/A — fase puramente documental, sin código ejecutable.
- **Frontend:** N/A.
- **Base de datos:** N/A.
- **Integraciones:** N/A.

### Artefactos documentales creados

| Artefacto                       | Ruta           | Acción                                               |
| ------------------------------- | -------------- | ---------------------------------------------------- |
| HLD-MOD01-ARQUITECTURA-v1.0.md  | docs/hlds/     | Creado                                               |
| PROMPT-MOD01-SCAFFOLD-v1.0.md   | docs/prompts/  | Creado                                               |
| TEMPLATE-INFORME-FASE-v1.0.md   | docs/informes/ | Creado (reemplaza TEMPLATE-INFORME-FASE-MODULO.md)   |
| TEMPLATE-INFORME-CIERRE-v1.0.md | docs/informes/ | Creado (reemplaza TEMPLATE-INFORME-CIERRE-MODULO.md) |

### Artefactos documentales eliminados

| Artefacto                         | Ruta           | Motivo                                                                   |
| --------------------------------- | -------------- | ------------------------------------------------------------------------ |
| TEMPLATE-INFORME-FASE-MODULO.md   | docs/informes/ | Renombrado — no seguía convención `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md` |
| TEMPLATE-INFORME-CIERRE-MODULO.md | docs/informes/ | Renombrado — no seguía convención `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md` |

---

## 3. Evidencia funcional

- **Flujo probado:** Verificación de estructura del HLD (10 secciones confirmadas con grep).
- **Datos de prueba usados:** Referencias cruzadas verificadas en ADR-022, TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md — sin referencias activas a nombres de templates viejos fuera de documentos históricos de plan.
- **Resultado observado:** Todos los archivos esperados presentes en sus rutas correctas. Archivos obsoletos eliminados.

---

## 4. Evidencia de calidad

- **Unit tests:** N/A — fase documental.
- **Integration tests:** N/A.
- **E2E tests:** N/A.
- **Cobertura:** N/A.
- **Hallazgos abiertos:**
  - Ninguno. Las referencias a nombres viejos (`TEMPLATE-INFORME-FASE-MODULO.md`, `TEMPLATE-INFORME-CIERRE-MODULO.md`) solo existen en dos archivos de plan histórico (`docs/plans/`) que documentan la operación de renombrado como parte de su especificación — son correctos como registros históricos.

---

## 5. Cambios documentales

- **PRD actualizado:** No — el PRD-MOD01-DEFINICION-v1.1.md ya referenciaba `HLD-MOD01-ARQUITECTURA-v1.0.md` anticipadamente (línea 8 del PRD). Sin cambios necesarios.
- **HLD actualizado:** Creado — docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md (nuevo, no existía).
- **ADR nuevo o referenciado:** ADR-022 referenciado. Sin nuevos ADRs — las decisiones de esta fase son aclaraciones de implementación, no decisiones arquitectónicas nuevas.
- **Otros documentos afectados:**
  - docs/informes/TEMPLATE-INFORME-FASE-v1.0.md — creado
  - docs/informes/TEMPLATE-INFORME-CIERRE-v1.0.md — creado
  - docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md — creado

---

## 6. Riesgos y bloqueos

- **Riesgo 1:** El HLD referencia `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md` — este archivo ya existe en el repositorio. Sin riesgo.
- **Riesgo 2:** El prompt de Scaffold referencia `docs/adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md` — este archivo ya existe. Sin riesgo.
- **Bloqueo técnico:** Ninguno. La fase se completó en su totalidad.

---

## 7. Decision de salida

- **Puede pasar a siguiente fase:** Sí — fase Scaffold (PROMPT-MOD01-SCAFFOLD-v1.0.md listo para entregar al Sr. Dev Fullstack).
- **Requiere correcciones previas:** No.
- **Aprobadores pendientes:** CTO / Architect Software para revisión del HLD-MOD01-ARQUITECTURA-v1.0.md antes de iniciar Sprint 1.

---

---

## 8. Correcciones y actualizaciones posteriores

### Corrección 1 — Actualización de versiones del stack a latest (2026-03-08)

**Motivo:** El plan de ejecución `docs/plans/2026-03-08-mod01-scaffold.md` fue generado inicialmente con versiones conservadoras de Sprint 1 baseline. El CTO instruyó que el stack debe usar siempre las versiones más recientes disponibles. Se utilizó el MCP Context7 para verificar la documentación oficial actualizada de cada dependencia.

**Artefactos corregidos:**

| Artefacto                                    | Cambios realizados                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/2026-03-08-mod01-scaffold.md`    | Versiones de todas las dependencias actualizadas (ver tabla abajo). Task 1: Corepack para pnpm 10. Task 6: Tailwind 4 CSS-first (sin `tailwind.config.js`, con `postcss.config.mjs` y `@theme {}`). Task 7: NestJS 11.1.14, @types/node 24. Task 8: Next.js 16.1.6, `cacheComponents: true`. Tasks 11-12: Docker `node:24-alpine`, CI Node 24.x, pnpm 10. |
| `docs/hlds/HLD-MOD01-ARQUITECTURA-v1.0.md`   | Sección 7 (tabla de versiones) actualizada a latest verificado con Context7. Nota de Node 22 → Node 24.                                                                                                                                                                                                                                                   |
| `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md` | Referencias "Next.js 15" → "Next.js 16".                                                                                                                                                                                                                                                                                                                  |

**Tabla de versiones actualizadas (verificadas via Context7 MCP):**

| Dependencia  | Versión anterior (baseline S1) | Versión nueva (latest) | Nota                                                                                  |
| ------------ | ------------------------------ | ---------------------- | ------------------------------------------------------------------------------------- |
| Node.js      | 22.14.0                        | 24.13.1 LTS            | LTS actual                                                                            |
| pnpm         | 9.15.x                         | 10.30.3                | Instalación via Corepack                                                              |
| NestJS       | 11.1.0                         | 11.1.14                | Patch release                                                                         |
| Next.js      | 15.2.0                         | 16.1.6                 | `cacheComponents` reemplaza `experimental.dynamicIO`                                  |
| Tailwind CSS | 3.4.x                          | 4.x                    | **Breaking:** CSS-first, sin `tailwind.config.js`                                     |
| Zod          | 3.24.x                         | 4.x                    | `z.email()` en lugar de `z.string().email()`, `{ error: }` en lugar de `{ message: }` |
| otplib       | 7.11.x (incorrecto)            | 13.3.0                 | Versión 7.x no existe; corregida                                                      |
| bcrypt       | 5.1.x                          | 6.0.0                  |                                                                                       |
| React        | 19.0.0                         | 19.2.0                 |                                                                                       |
| @types/node  | 22.x                           | 24.x                   | Alineado con Node 24                                                                  |

**Cambio de mayor impacto — Tailwind CSS 4:** La versión 4 elimina completamente `tailwind.config.js`. La configuración es CSS-first mediante `@import "tailwindcss"` y directiva `@theme {}`. PostCSS requiere el paquete `@tailwindcss/postcss`. Los design tokens de iWana fueron migrados correctamente al formato `@theme {}` con variables CSS custom properties (`--color-iwana-primary`, etc.).

**Incidente de fix durante corrección:** Al reemplazar el contenido de Task 6 en el plan, el bloque anterior (Tailwind 3) quedó duplicado por colisión de coincidencia de texto. Se identificó el rango exacto de líneas duplicadas (845-1062) mediante `grep -n` y se eliminó con script Node.js (`node -e "const lines=..."`). Python no disponible en el entorno Windows.

**Responsable de la corrección:** AI-EM-ARCH, por instrucción directa del CTO.

---

### Corrección 2 — Depuración de duplicados y referencias rotas (2026-03-12)

**Motivo:** Durante la revisión integral de `docs/` se detectaron dos duplicados exactos en `docs/sprints/` y varias referencias hacia documentos no materializados o nombres legacy ya eliminados. La corrección buscó dejar una sola fuente canónica por plan y eliminar referencias rotas dentro del árbol documental.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `PLAN-ARRANQUE-iWana-neXt.md` | Eliminado por duplicidad exacta con el plan canónico de arranque del sistema. |
| `PLAN-SPRINT-01.md` | Eliminado por duplicidad exacta con el plan canónico de Sprint 1 de MOD01. |
| `docs/prompts/PROMPT-MOD01-SCAFFOLD-v1.0.md` | Referencia de stop/go corregida para usar `docs/quality/TEMPLATE-DECISION-BLOQUEO-TECNICO.md`. |
| `docs/security/README.md` | Se eliminó referencia a un informe QA inexistente y se dejó el artefacto OWASP como pendiente de materialización en `docs/security/`. |
| `docs/sprints/PLAN-MOD01-SPRINT-01-v1.0.md` | Se reemplazaron rutas a documentos aún no creados por destinos de carpeta con convención normalizada. |
| `docs/plans/2026-03-08-hld-prompt-informes-implementation.md` | Se actualizaron referencias rotas a templates legacy eliminados y al template vigente de bloqueo técnico. |

**Resultado observado:**

- `docs/sprints/` queda con una sola fuente vigente para arranque del sistema y una sola fuente vigente para Sprint 1 de MOD01.
- Las referencias documentales activas dentro de `docs/` ya no apuntan a los dos duplicados eliminados.
- Las rutas rotas detectadas en `prompts/`, `security/` y `sprints/` quedaron corregidas sin abrir placeholders vacíos.

**Hallazgos abiertos tras la depuración:**

- Sigue faltando materializar el prompt de ejecución de Sprint 1 de MOD01 en `docs/prompts/`, pero ya no existe una referencia rota activa porque ese artefacto aún no es citado por otros documentos.
- Siguen pendientes los artefactos operativos futuros de Sprint 1 en `docs/database/` y `docs/security/`; el plan ya no los referencia con una ruta inexistente específica sino con destino normalizado por carpeta.

---

### Corrección 3 — Materialización del prompt de Sprint 1 y handoff inicial (2026-03-12)

**Motivo:** Tras la depuración documental, seguía faltando el artefacto mínimo de ejecución requerido por ADR-022 para iniciar formalmente Sprint 1 de MOD01. Se materializó el prompt canónico de la fase y se acotó el primer corte técnico a `DB + Tenant base` para evitar mezclar Auth, Audit y frontend productivo antes de cerrar la fundación multi-tenant.

**Artefactos creados o actualizados:**

| Artefacto | Cambios realizados |
| --- | --- |
| `docs/prompts/PROMPT-MOD01-SPRINT-01-v1.0.md` | Creado desde la plantilla oficial. Define alcance, restricciones, riesgos obligatorios, criterios de aceptación y handoff técnico inicial para el corte `DB + Tenant base`. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para dejar trazabilidad de la materialización del prompt faltante. |

**Resultado observado:**

- `docs/prompts/` ya contiene el artefacto faltante de ejecución para Sprint 1 de MOD01.
- El arranque formal del módulo queda alineado con ADR-022: HLD aprobado, sprint plan vigente, prompt de ejecución materializado y alcance acotado al primer corte técnico real.
- El handoff inicial queda consolidado dentro del mismo prompt, evitando abrir un documento paralelo innecesario.

**Hallazgos abiertos tras esta corrección:**

- Sigue pendiente materializar `docs/informes/INFORME-MOD01-SPRINT-01-v1.0.md` cuando inicie la ejecución real.
- El siguiente paso operativo ya no es documental sino técnico: entities, migración pública, template tenant, DataSource, `TenantMiddleware` y `TenantModule`.

---

_Informe generado por: AI-EM-ARCH (Engineering Manager + Architect Software) — iWana neXt Platform_
_Fecha: 2026-03-08 | Framework de Gobernanza Multi-IA v2.0_
_Plan ejecutado: docs/plans/2026-03-08-hld-prompt-informes-implementation.md_
_Actualizado: 2026-03-08 — Corrección stack versions via Context7 MCP_

---

### Corrección 4 — Bootstrap operativo de instrucciones globales para Copilot (2026-03-17)

**Motivo:** El archivo `.github/copilot-instructions.md` existia, pero seguia demasiado cerca de `AGENTS.md` y no cumplia bien el papel de bootstrap corto y accionable para que un agente fuera productivo desde el primer turno. Faltaban comandos reales del monorepo, boundaries operativos, gotchas verificados y archivos guia de referencia rapida.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `.github/copilot-instructions.md` | Reescrito como instruccion global de arranque rapido: fuentes obligatorias, comandos `pnpm`, mapa del monorepo, convenciones criticas, gotchas reales del repo, skills utiles y archivos guia. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para dejar trazabilidad de la correccion y evitar un informe paralelo. |

**Decisión editorial aplicada:**

- `AGENTS.md` se mantiene como fuente maestra de gobernanza amplia.
- `.github/copilot-instructions.md` queda como capa corta de bootstrap operativo para Copilot.
- No se renombro ni elimino `AGENTS.md` porque ya funciona como contrato maestro transversal del workspace y de otras herramientas; la correccion se limito a reducir duplicacion innecesaria en la capa de bootstrap.

**Resultado observado:**

- El workspace ya expone una instruccion global mas util para descubrimiento inicial.
- Un agente puede identificar rapido comandos reales, boundaries entre `apps/web` y `apps/portal`, restricciones multi-tenant y gotchas de MFA, pgBouncer, BullMQ y Tailwind 4.
- La traza documental queda consolidada dentro del informe sistemico vigente.

**Hallazgos abiertos tras esta corrección:**

- El repo conserva intencionalmente dos capas globales de instrucciones (`AGENTS.md` y `.github/copilot-instructions.md`). Aunque la guia generica de customization recomienda elegir una sola, en iWana neXt esto queda aceptado como compromiso operativo entre gobernanza maestra y bootstrap corto, siempre que no vuelvan a divergir.

---

### Corrección 5 — Partición adicional de instrucciones por área operativa (2026-03-17)

**Motivo:** La instrucción por archivo existente quedaba corta para activación precisa por contexto. En particular, `frontend.instructions.md` no cubria `apps/portal`, y las reglas especificas de `apps/api` y del portal tenant-aware estaban demasiado mezcladas en capas generales.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `.github/instructions/frontend.instructions.md` | Se amplió `applyTo` para cubrir `apps/portal/**` además de `apps/web/**` y paquetes TSX compartidos; se agregó `description` rica para discovery on-demand. |
| `.github/instructions/portal.instructions.md` | Nuevo archivo específico para `apps/portal/**` con reglas tenant-aware, separación de tokens MFA, prohibición de rutas rotas y política de métricas no ficticias. |
| `.github/instructions/api.instructions.md` | Nuevo archivo específico para `apps/api/**` con reglas operativas de tenancy, pgBouncer, `@Roles(UserRole.*)`, auditoría y contratos self-service. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar la partición adicional. |

**Resultado observado:**

- `apps/portal` ya no queda fuera del sistema de instrucciones por `applyTo`.
- El agente puede cargar reglas más precisas cuando trabaja en frontend tenant-aware o backend API sin depender solo de una capa genérica.
- La estructura queda separada por concern: frontend compartido, portal específico, api específica y documentación.

**Hallazgos abiertos tras esta corrección:**

- Si en el futuro `apps/web` requiere reglas propias adicionales de consola de plataforma, conviene crear `web.instructions.md` en lugar de seguir cargando esa especificidad en la capa frontend compartida.

---

### Corrección 6 — Instrucción específica para consola de plataforma `apps/web` (2026-03-17)

**Motivo:** Tras separar `portal.instructions.md` y `api.instructions.md`, seguía faltando una capa explícita para `apps/web`. Esa app ya muestra patrones propios de consola de plataforma: login vía `POST /auth/platform/login`, usuarios `SYSTEM_ADMIN` e `IWANA_SUPPORT`, rutas protegidas administrativas y recuperación de acceso controlada, no tenant self-service.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `.github/instructions/web.instructions.md` | Nuevo archivo específico para `apps/web/**` con reglas de consola de plataforma, separación respecto a `apps/portal`, manejo de auth de plataforma y política de copy administrativo. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar la nueva capa de instrucciones. |

**Resultado observado:**

- `apps/web` deja de depender solo de una instrucción frontend genérica.
- La separación entre consola de plataforma y portal empresarial queda explícita también en el sistema de instrucciones por archivo.
- El árbol de instrucciones queda más coherente por concern: frontend compartido, web plataforma, portal tenant-aware, api backend, testing y docs.

**Hallazgos abiertos tras esta corrección:**

- El siguiente refinamiento natural sería dividir `testing.instructions.md` en reglas separadas para unit, integration y E2E si el volumen de pruebas del repo sigue creciendo.

---

### Corrección 7 — Partición de testing por tipo y reducción de solapamiento backend/API (2026-03-17)

**Motivo:** La capa `testing.instructions.md` seguía demasiado amplia y cargaba reglas de unit, integration y E2E en un solo archivo. Además, `backend.instructions.md` se solapaba innecesariamente con `api.instructions.md` sobre `apps/api/**`.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `.github/instructions/testing.instructions.md` | Reorientado a pruebas unitarias no E2E, con `description` rica y `applyTo` acotado a `src/` de apps y paquetes compartidos. |
| `.github/instructions/integration.instructions.md` | Nuevo archivo para pruebas de integración y HTTP en `apps/api`, con foco en contratos, aislamiento por tenant y wiring realista. |
| `.github/instructions/e2e.instructions.md` | Nuevo archivo para Playwright y journeys de usuario en `e2e/**` y `apps/portal/tests/e2e/**`. |
| `.github/instructions/backend.instructions.md` | Ajustado para quitar `apps/api/**` del `applyTo` y quedar como capa backend compartida fuera de la instrucción específica de API. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar la nueva partición. |

**Resultado observado:**

- Las pruebas unitarias, de integración y E2E ya no dependen de una sola instrucción monolítica.
- `apps/api` carga reglas específicas desde `api.instructions.md` y no duplica en la misma intensidad la capa de backend genérico.
- El sistema de instrucciones queda más cercano a la estructura real del repo: unit tests en `src`, integración HTTP/tenant en API y E2E Playwright en carpetas dedicadas.

**Hallazgos abiertos tras esta corrección:**

- Si el repo formaliza más pruebas de integración fuera de `apps/api`, convendrá ampliar `integration.instructions.md` o crear variantes por capa en lugar de volver a una instrucción única de testing.

---

### Corrección 8 — Refinamiento backend compartido, instrucción DB y prompts reutilizables (2026-03-17)

**Motivo:** Tras la partición por área quedaban tres mejoras claras: 1) la instrucción backend genérica ya no estaba bien anclada al código real y debía cubrir `apps/worker`, 2) faltaba una instrucción específica para migraciones y tenancy en `packages/database`, y 3) todavía no existían prompts reutilizables de workspace para dos tareas repetitivas del repo: actualizar informes vivos y revisar boundaries del modulith.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `.github/instructions/backend.instructions.md` | Refinado para cubrir `apps/worker/src/**/*.ts` y backend compartido fuera de API; se retiró sesgo excesivo hacia endpoints HTTP y se enfatizó propagación explícita del contexto tenant en workers. |
| `.github/instructions/database.instructions.md` | Nuevo archivo específico para `packages/database/**` con reglas de migraciones, `search_path`, pgBouncer, separación `public` vs `tenant` y uso de `runInTenantSchema()`. |
| `.github/prompts/actualizar-informe-vivo.prompt.md` | Nuevo prompt reutilizable para localizar y actualizar el informe técnico vivo correcto sin duplicarlo. |
| `.github/prompts/revisar-boundary-modulith.prompt.md` | Nuevo prompt reutilizable para revisar boundaries del modulith, mezcla plataforma/tenant y riesgos arquitectónicos. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar el refinamiento adicional. |

**Resultado observado:**

- La capa backend compartida vuelve a tener un target real y útil en `apps/worker`.
- Persistencia y migraciones ya cuentan con una instrucción especializada, separada de API y backend general.
- El workspace ya expone prompts reutilizables para dos tareas frecuentes de gobierno técnico-documental.

**Hallazgos abiertos tras esta corrección:**

- Si el equipo empieza a usar con frecuencia prompts operativos adicionales, convendrá añadir un `README` o índice liviano en `.github/prompts/` para discoverability interna.

---

### Corrección 9 — Endurecimiento fino de tenancy y migraciones en instrucciones API/DB (2026-03-17)

**Motivo:** Tras la partición principal de instrucciones, todavía faltaban algunas reglas finas ya evidentes en el código real del repo. En `apps/api` aparecían patrones concretos que convenía elevar a instrucción: orden de rutas `me` antes de `:id`, uso restringido de `scope='mfa-setup'`, validación cruzada de `tenantId/schemaName` y limitación del header `X-Tenant-Slug` a flujos públicos aprobados. En `packages/database` faltaba dejar explícitas reglas operativas de migraciones tenant sobre fallos parciales, reintentos y sincronización del runner CLI.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `.github/instructions/api.instructions.md` | Se endurecieron reglas específicas de tenancy y auth: orden de rutas self-service, alcance limitado para `mfa-setup`, consistencia entre `tenantId` y `schemaName`, restricción del fallback `X-Tenant-Slug` y separación explícita entre endpoints de plataforma y self-service. |
| `.github/instructions/database.instructions.md` | Se agregaron reglas finas para migraciones tenant: logging por schema, fallo explícito ante resultados parciales, uso de `IF NOT EXISTS`, mantenimiento del runner CLI y patrón `main()` con importación dinámica del DataSource. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar el endurecimiento fino adicional. |

**Resultado observado:**

- Las instrucciones de API y base de datos quedan más alineadas al comportamiento real ya implementado en `TenantController`, `TenantMiddleware`, `JwtAuthGuard` y las migraciones tenant existentes.
- Se reduce la probabilidad de que futuras tareas reintroduzcan colisiones de routing, amplíen indebidamente `X-Tenant-Slug` o dejen runners de migración desactualizados.

**Hallazgos abiertos tras esta corrección:**

- Se mantiene un riesgo operativo menor en scripts de migraciones tenant si el equipo continúa agregando nuevas migraciones sin consolidar un runner centralizado; por ahora la instrucción lo mitiga, pero no reemplaza una futura normalización técnica del package `@iwana/db`.

---

### Corrección 10 — Normalización técnica del runner de migraciones tenant en `@iwana/db` (2026-03-17)

**Motivo:** El package `@iwana/db` seguía exponiendo un riesgo operativo real: el script `migration:tenant:run` apuntaba de forma fija a una migración concreta (`003_add_user_profile_fields`) y coexistía con un script versionado manual (`migration:tenant:004`). Eso obligaba a mantener scripts por número de migración y abría la puerta a ejecuciones incompletas o desactualizadas.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `packages/database/src/migrations/tenant/run-all.ts` | Nuevo runner central que descubre migraciones tenant compiladas por convención `NNN_*.js`, las ordena y ejecuta secuencialmente. |
| `packages/database/package.json` | `migration:tenant:run` ahora apunta al runner central `run-all.js`; se eliminó el script versionado manual `migration:tenant:004`. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar la normalización técnica. |

**Resultado observado:**

- El flujo de migraciones tenant ya no depende de editar scripts por cada nueva versión.
- Las migraciones tenant disponibles en `dist/migrations/tenant/` se ejecutan en orden determinista por prefijo numérico.
- Si un archivo de migración no exporta `runMigration(dataSource)`, el runner falla de forma explícita y visible.

**Riesgo residual tras la corrección:**

- El runner central asume la convención `NNN_nombre.js`; si en el futuro se rompe esa convención en `packages/database/src/migrations/tenant/`, la detección automática dejará de incluir esos archivos. La convención queda ahora implícitamente estandarizada por implementación.

---

### Corrección 11 — Auditoría de cierre sobre migraciones públicas y validación de build en `@iwana/db` (2026-03-17)

**Motivo:** Tras normalizar el runner tenant, quedaba validar si el flujo de migraciones públicas sufría el mismo problema operativo o si ya estaba correctamente centralizado. También era necesario confirmar que el nuevo runner tenant no solo tipeaba bien, sino que compilaba a `dist` sin romper el package.

**Artefactos revisados o actualizados:**

| Artefacto | Cambios realizados |
| --- | --- |
| `packages/database/package.json` | Revisado: se confirmó que las migraciones públicas ya usan el runner canónico de TypeORM (`migration:run`, `migration:revert`, `migration:show`) sobre `dist/data-source.js`. Sin cambios adicionales. |
| `packages/database/src/data-source.ts` | Revisado: se confirmó que `migrations: ['dist/migrations/public/*.js']` ya resuelve por glob el conjunto de migraciones públicas compiladas. Sin cambios adicionales. |
| `packages/database/src/migrations/public/*.ts` | Revisado: se verificó que el set vigente de migraciones públicas permanece alineado con el runner nativo de TypeORM. Sin cambios adicionales. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para dejar trazabilidad de la auditoría de cierre. |

**Resultado observado:**

- No existe una deriva equivalente en migraciones públicas: ese flujo ya estaba correctamente centralizado por TypeORM mediante glob sobre `dist/migrations/public/*.js`.
- El package `@iwana/db` compiló correctamente después de introducir el runner tenant central.
- La normalización quedó cerrada sin introducir cambios innecesarios en el flujo público.

**Conclusión operativa:**

- El riesgo real estaba acotado al runner tenant y quedó corregido.
- El flujo de migraciones públicas queda validado como consistente con la estrategia recomendada para el repositorio.

---

### Corrección 12 — Runbook operativo de migraciones y ajuste del workaround de credenciales iniciales (2026-03-17)

**Motivo:** Tras cerrar la normalización del runner tenant, faltaba materializar una guía operativa breve para ejecutar migraciones públicas y tenant sin ambigüedad. En paralelo, la auditoría de provisioning/seed detectó que un workaround documental previo era inconsistente con el código vigente: ADR-020 seguía sugiriendo consultar logs del worker para recuperar credenciales temporales, pero el código actual no expone la contraseña inicial por logs y esa práctica además contradiría la postura de seguridad del repo.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `docs/runbooks/RUNBOOK-DB-MIGRATIONS-v1.0.md` | Nuevo runbook operativo para migraciones públicas y tenant, incluyendo comandos, validación posterior, criterios de reintento y escalación. |
| `docs/runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md` | Se añadió el procedimiento operativo correcto para recuperar credenciales temporales del ADMIN inicial mediante el endpoint de regeneración con `Idempotency-Key`. |
| `docs/adrs/ADR-020-Seed-Inicial-Credenciales-Temporales.md` | Se corrigió la deuda técnica/documentación operativa: se eliminó la sugerencia de consultar logs del worker y se alineó el workaround soportado con el endpoint real de regeneración. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar este cierre. |

**Resultado observado:**

- El workspace ya tiene un runbook operativo específico para ejecución de migraciones en `@iwana/db`.
- La documentación de provisioning deja de sugerir una práctica insegura e inconsistente con el código actual.
- Seeds y provisioning no mostraron otra deriva operativa equivalente al problema corregido en el runner tenant; el hallazgo real fue documental y quedó normalizado.

---

### Corrección 13 — Cierre de pendientes técnicos residuales en delete tenant, purge worker y comentarios obsoletos (2026-03-17)

**Motivo:** La revisión final de cierre dejó tres pendientes técnicos concretos: 1) el delete de tenant eliminaba solo el registro y dejaba el schema huérfano, 2) el worker de purga usaba una validación local de schema distinta de la regla canónica de `@iwana/db`, y 3) persistían comentarios/TODOs que ya no describían el estado real del código.

**Artefactos corregidos:**

| Artefacto | Cambios realizados |
| --- | --- |
| `apps/api/src/modules/tenant/tenant.service.ts` | `delete()` ahora valida `schemaName`, ejecuta `DROP SCHEMA ... CASCADE` y elimina el tenant dentro de una transacción antes de invalidar cache. Se removió el TODO obsoleto sobre encolado de provisioning desde este servicio. |
| `apps/api/src/modules/tenant/tenant.service.spec.ts` | Se agregaron pruebas para el flujo destructivo: borrado transaccional de schema + tenant y caso `NotFound`. |
| `apps/worker/src/processors/refresh-token-purge.processor.ts` | Se eliminó la regex local y se unificó la validación de schema usando `isValidSchemaName` de `@iwana/db`. |
| `apps/api/src/modules/auth/auth.service.ts` | Se eliminó el TODO obsoleto en `forgotPassword()` que ya no reflejaba el estado del mailer del repositorio. |
| `docs/runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md` | Ajustado para dejar explícito que el borrado funcional del tenant no debe interpretarse como simple eliminación del registro público. |
| `docs/informes/INFORME-SISTEMA-NORMALIZACION-DOCUMENTAL-v1.0.md` | Actualizado como documento vivo para registrar el cierre técnico. |

**Resultado observado:**

- El contrato destructivo de tenant deja de ser engañoso: eliminar un tenant ya limpia también su schema asociado.
- El worker de purga usa la misma regla de validación tenant_* que el resto de la plataforma.
- Se reduce ruido de mantenimiento al eliminar comentarios que inducían diagnósticos incorrectos sobre provisioning y notificaciones.
