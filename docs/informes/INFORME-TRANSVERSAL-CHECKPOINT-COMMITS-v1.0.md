# Informe transversal — checkpoints de commits

**Versión:** 1.2  
**Changelog:** v1.2 (2026-10-31): añade §F1b con las SHA y cifras verificadas de S, DH y BB; registra la verificación precommit de X. v1.1 (2026-10-31): incorpora §F1 con la secuencia local A/B/C/G y el NO-GO de H; añade §F2 con la revisión documental de F1b.  
**Fecha:** 2026-10-31  
**Estado:** Cierre local F1b — S, DH y BB creados; X se verifica antes de su commit. Sin push.  
**Nombre de archivo:** ruta estable con sufijo histórico `v1.0`, referenciada por el prompt de checkpoint.  
**Encargo:** [PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0](../prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md)

## Alcance y evidencia

Se leyó `AGENTS.md`, F0 del prompt transversal y las fuentes de gate indicadas por ola. La ruta de este informe no existía antes de redactarlo. La clasificación se basa en el árbol observado y en la evidencia consignada en las fuentes; F0 no reejecutó suites ni modificó el índice.

Antes de crear este informe, el árbol estaba en `main`, con 0/0 commits respecto de las referencias locales `origin/main`; `git status --porcelain` informó 116 rutas modificadas, 106 sin seguimiento y 0 staged (222 rutas). No se hizo `fetch`: el dato 0/0 corresponde a las referencias disponibles localmente, no a una consulta remota nueva. No se usaron `git add`, commit, stash, checkout, clean ni borrado.

## Matriz de ruta, ola, gate y mezcla

| Ola                                     | Rutas observadas                                                                                                                                                                                                                | Estado del gate en su fuente                                                                                                                                                                                                                                                                                                                                                                                                 | ¿Mezclada?                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · Dependencias críticas               | `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/api/package.json`, plan, informe y prompts `TRANSVERSAL-DEPS-CRITICAS`                                                                                                           | **GO local G3/G6**: 936 suites y 10.308 tests reportados en seis paquetes; `pnpm audit --audit-level critical` sin críticas. `G6.5` (CI tras push) está pendiente. Queda una alta de `zod` en producción, escalada. [Informe §V1 y disposición](INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md#v1--verificación-gate-verifier--2026-10-30)                                                                                        | **No** en las rutas A identificadas.                                                                                                                                                                                               |
| B · Privacidad y textos legales         | `apps/portal/src/components/privacy/**`, `docs/legal/**`, spec/anexo, plan, runbook, informes y prompts `PRIVACY-TEXTOS-LEGALES`                                                                                                | **GO** para B8; el plan registra G6 y G6.5 previos sobre `05558a7a`. B8 reporta 331 suites/3.355 tests portal y 1 skip preexistente; la verificación posterior de `PrivacyWorkspace` fue 1 suite/14 tests. G7/producción sigue sujeto al runbook. [Plan §6](../plans/2026-10-29-privacy-textos-legales.md) · [Informe B8](INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md#verificación)                                            | **Sí, parcial**: `EvidenceUploadField.tsx` y su spec también pertenecen a G. Los archivos propios de B8 son separables por ruta.                                                                                                   |
| C · MOD13 routers/organización          | `apps/api/src/modules/network/**`, `apps/api/src/modules/organization/**`, adaptador WFM, Portal network/settings, E2E y docs `MOD13-ROUTERS-*`                                                                                 | **G6 PASS según el estado posterior de §8.6 / plan v3.13**; G6.5/G7 siguen pendientes. La suite Portal completa no se reejecutó para el addendum de retiro LAN; el informe deja su verificación como previa al commit. Gate-verifier debe confirmar el índice candidato antes del commit. [Informe §§8.5–8.9](INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md)                                                                        | **Por confirmar** en la subruta de código de sedes: hay cambios de `organization/**` y un apéndice de código automático en el informe MOD00, sin asignación de ola inequívoca. Mantener ese apéndice fuera de C hasta confirmarlo. |
| D · MOD05 Fase 09, ciclo de facturación | Migración `167_*`, shared `calendar/**`/`billing-cycle.schema*`, controladores y utilidades `billing-cycle*`, agenda y selector del Portal, E2E, ADR-102, PRD Fase 09, spec, plan, prompts e informes `MOD05-CICLO-FACTURACION` | **Ola 1–3: G5/G6 con evidencia previa; Ola 4: abierta, sin GO.** Falta R1 (agenda sin `date` a las 21:00 de Bogotá), R2 (regresión de mora) y V3b. No se debe trasladar el gate anterior a la remediación. [Plan §6 y Ola 4](../plans/2026-10-30-mod05-ciclo-facturacion.md#6-estado-de-ejecución--2026-10-30)                                                                                                               | **Sí** en `contracts.service.ts`, pruebas de contratos, `runner.ts`, `api-client.ts` y componentes del suscriptor compartidos con E/F/G; véase §3.                                                                                 |
| E · MOD05, cambio de plan               | Migración `168_*`, schema y contratos API, diálogo/hook/E2E de cambio de plan, spec, plan e informe `MOD05-CAMBIO-PLAN`                                                                                                         | **NO-GO / sin gate de implementación**: el informe sigue describiendo diseño aprobado e implementación/verificación en curso; el plan conserva sin marcar las tareas de backend, Portal y revisión. [Informe de diseño](INFORME-MOD05-CAMBIO-PLAN-DISENO-v1.0.md) · [plan, tareas 1–3](../plans/2026-10-30-mod05-cambio-plan-contrato.md)                                                                                    | **Sí** en `contracts.service.ts`, pruebas de contratos, `runner.ts`, `api-client.ts` y componentes compartidos D/F/G.                                                                                                              |
| F · Revisión 360° de cotizaciones       | Contrato `packages/shared/src/contracts/crm/**`, API subscribers/provisioning, parte de R5 Portal, prompt, informes v1.0–v1.2 y referencia UISP                                                                                 | **GO** en las tres olas según R8: typechecks/lint, suites sin caché, integraciones PostgreSQL de R7 y cotizaciones sin omisiones; JSON real de detalle/360 devuelve `YYYY-MM-DD`. El informe deja el commit sujeto a autorización CTO. [Informe v1.2 §Veredicto/cierre](INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md#veredicto)                                                                                           | **Sí** en los puentes compartidos Portal/shared/CRM descritos en §3. Los archivos backend R1–R8 listados en los informes son F; varias rutas R5 conviven con cambios de otras olas.                                                |
| G · IVA T9 y media                      | API `modules/media/**`, `stratum-evidence*`, `EvidenceUploadField*`, informe T9 y runbook MinIO                                                                                                                                 | **Completado local en la fuente**: 129 suites/1.468 tests API (1 suite/7 tests omitidos ajenos), 7/8 integraciones PostgreSQL y 52/53 tests, 35/337 Portal, typecheck/lint y prueba MinIO reportados. El informe registra revisión de seguridad GO con condiciones; no acredita CI G6.5. [Informe T9 §Verificación y revisión de seguridad](INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.1.md#verificación)                        | **Sí** en `contracts.service.ts` y `EvidenceUploadField*`, compartidos con D/E y B. En las rutas exclusivas de media y `stratum-evidence*`, no.                                                                                    |
| H · MOD14 y documentos                  | ADR-103, PRD/HLD/plan/prompts MOD14, documentos de referencia y directorio de módulos                                                                                                                                           | **G0 aprobado** por el CTO. No es un gate de implementación; las auditorías documentales requeridas para el commit (`audit:adr-citations` y `audit:doc-locations`, ambos con 0 bloqueantes) no aparecen ejecutadas para este conjunto. [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) · [regla F1](../prompts/PROMPT-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md#f1--plat-ops--gate-verifier--commits-de-las-olas-con-go) | **Sí, parcial**: PRD maestro mezcla D/H; el directorio combina MOD14 con una referencia comparativa cuyo dueño debe confirmarse.                                                                                                   |

## Archivos mezclados y separabilidad

F0 es de solo lectura: no preparó índices parciales ni compiló snapshots staged. Por eso, «separable» abajo significa que el diff muestra límites de hunk plausibles; **no** certifica que cada estado intermedio compile. F1 debe ejecutar el gate sobre el índice de cada commit antes de crearlo.

| Ruta mezclada                                                                                                                                                                                                                                                                                                                                | Olas                                                               | Evaluación para commits                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/modules/crm/contracts/contracts.service.ts`                                                                                                                                                                                                                                                                                    | D/E/G                                                              | **Tratar como conjunta por ahora.** Conviven agenda/ciclo, cambio de plan, versión/auditoría, IVA y protección de evidencia; imports, inyección y helpers afectan más de un bloque. Una separación solo se acepta si un índice armado por hunks pasa typecheck y las suites de los bloques antes del commit. |
| `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts`; `tests/contracts.service.postgres.integration.spec.ts`                                                                                                                                                                                                                 | D/E/G                                                              | **Alinear con el servicio.** Los fixtures y escenarios de contratos son compartidos; no separar una prueba de su producción. Ejecutar suites focales e integración real en cada snapshot que se pretenda commitear.                                                                                          |
| `packages/database/src/migrations/tenant/runner.ts`                                                                                                                                                                                                                                                                                          | D/E                                                                | Los imports/registros de 167 y 168 son líneas identificables y pueden separarse manualmente. La hunk actual los agrupa; cada commit debe incluir su migración y pasar el test de orden/registro. No incluir ambos por conveniencia.                                                                          |
| `apps/portal/src/lib/api-client.ts`                                                                                                                                                                                                                                                                                                          | D/E/F                                                              | Hay bloques identificables: ciclos/agenda (D), cambio de plan (E) y tipos/reexportación 360 (F). **Separación condicional**, no certificada: ejecutar typecheck del Portal contra cada índice parcial. El informe R5 identifica 18 consumidores tocados; no agregar el archivo completo.                     |
| `packages/shared/src/index.ts`                                                                                                                                                                                                                                                                                                               | D/F                                                                | Los exports `calendar/billing-cycle` y `contracts/crm` son hunks distintos; separables por ola con typecheck de shared.                                                                                                                                                                                      |
| `apps/api/src/modules/crm/contracts/contracts.module.ts`, `contracts.controller.ts`, DTOs/entidad y pruebas HTTP                                                                                                                                                                                                                             | D/E/G (según archivo)                                              | No tratar el directorio como unidad homogénea. El controller de cambio de plan es E; el controller/utilidades nuevas de ciclo son D; entidad/DTO y pruebas pueden tocar IVA/ciclo. Seleccionar por archivo y por hunk, respetando dependencias y gate de API.                                                |
| `apps/portal/src/components/crm/subscribers/ContractCard.tsx`, `ContractDetailDrawer.tsx`, `CreateContractDialog.tsx`, `ConvertExpedienteToContractDialog.tsx`, `ServiciosTab.tsx`                                                                                                                                                           | D/E/F/G (varía por ruta)                                           | **Conjunto de alto acoplamiento.** El diff mezcla ciclo/agenda, ciclo de vida, cambio de plan, tributación y consumidores 360. No tomar componentes enteros para un commit de una sola ola sin typecheck y suite del Portal con el índice preparado.                                                         |
| Rutas Portal R5 de `SubscriberDetailClient`, `SubscriberSections`, `SubscriberForm`, `SubscriberHeader`, `subscriber-fiscal`, `SubscriberFiscalSection`, `ServiciosTab`, `ConvertExpedienteToContractDialog` y las specs enumeradas en [v1.1, “Archivos tocados”](INFORME-MOD05-360-COTIZACIONES-REVISION-v1.1.md#archivos-tocados-en-ola-2) | F + cambios concurrentes D/G y trabajo de suscriptores no asignado | El informe acredita los hunks R5, pero el estado actual contiene diffs ajenos y algunos consumidores están sin seguimiento. El archivo nuevo completo no tiene una base `HEAD` contra la cual aislar un hunk R5. **No incluir sin confirmar propietario y probar el snapshot.**                              |
| `apps/portal/src/components/privacy/EvidenceUploadField.tsx` y `EvidenceUploadField.spec.tsx`                                                                                                                                                                                                                                                | B/G                                                                | B8 y T9 comparten el componente/espec. Separar solo con evidencia de cada hunk y suites privacy/stratum; si los cambios de seguridad/almacenamiento se intercalan, commit conjunto B/G.                                                                                                                      |
| `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md`                                                                                                                                                                                                                                                                                                 | D/H                                                                | Los hunks de RF-BIL-06/ADR-102 y la definición MOD14 son distintos; se pueden separar editorialmente. Ejecutar auditoría documental después de cada conjunto.                                                                                                                                                |
| `docs/directorio-modulos.md`                                                                                                                                                                                                                                                                                                                 | H + referencia sin dueño confirmado                                | La entrada MOD14 y la sección de referencia son hunks separados. Validar dueño y destino `REFERENCIA-UISP-CRM-MOD05-v1.1.md` antes de cerrar.                                                                                                                                                                |
| `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`                                                                                                                                                                                                                                                                                                   | D + referencia sin dueño confirmado                                | Una adición referencia UISP y otra documenta ADR-102; hunks separados, dueño de la referencia pendiente de confirmación.                                                                                                                                                                                     |
| `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`; `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md`                                                                                                                                                                                                                                          | Referencia sin dueño / D                                           | El primero añade referencia UISP sin asignación demostrada; excluir hasta confirmarla. El segundo es un cambio D aislable como documento, sujeto a revisión documental.                                                                                                                                      |
| `apps/portal/src/components/shared/portal-ui.tsx`                                                                                                                                                                                                                                                                                            | Sin ola asignada                                                   | Cambia API de `PortalPanel`; se usa desde componentes de suscriptor nuevos. No se infiere dueño por el consumidor. Dejar fuera hasta asignar ola y ejecutar gates de consumidores.                                                                                                                           |
| `AGENTS.md`, `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`, `docs/informes/INFORME-MOD05-UISP-CRM-REFERENCIA-v1.0.md`                                                                                                                                                                                                    | Sin ola inequívoca                                                 | La primera es una regla transversal de documentos legales; la segunda agrega evidencia de código de sedes; la tercera no figura en el mapa de fuentes. Mantener fuera de A–H hasta asignación explícita.                                                                                                     |

## Orden de commits propuesto

Respetar el orden base de F1; **no commitear una ola sin GO en su fuente**, y pedir gate-verifier antes de cada commit. Cada gate se ejecuta contra el índice preparado para ese commit, no contra el árbol completo.

1. **A · Dependencias críticas** — primero. Verificar `pnpm install --frozen-lockfile`, typecheck y suite completa API sin caché, además de las auditorías de vulnerabilidades del plan. El GO local está documentado; G6.5 queda para después del push autorizado.
2. **B · Privacidad** — separar B8 de `EvidenceUploadField`/T9. Ejecutar suites Portal/API y typecheck/lint de las rutas incluidas; conservar la condición G7 de producción como release, no como commit local.
3. **C · MOD13** — gate-verifier confirma G6 sobre el índice candidato y completa la verificación precommit del addendum (incluida la suite Portal que el informe deja pendiente); después puede commitearse localmente. G6.5/G7 se resuelven en su fase autorizada.
4. **G · IVA T9/media** — commit de rutas exclusivas tras gate sobre el índice. Para `contracts.service.ts` y `EvidenceUploadField`, esperar a que la separación por hunk compile; si no, moverlos al commit conjunto que resuelva D-CK-1 más la condición adicional de G.
5. **Clúster MOD05 D → E → F** — solo después de que D complete Ola 4 y E cierre implementación/revisión. Ejecutar los gates indicados en sus planes para cada commit. Si el test staged demuestra que una ruta compartida no admite estado intermedio compilable, usar el commit conjunto de D-CK-1.
6. **H · documentos MOD14** — al final, tras `pnpm audit:adr-citations` y `pnpm audit:doc-locations` con `BLOQUEANTE: 0`; mantener fuera el hunk D del PRD maestro y la referencia comparativa hasta confirmar su dueño.
7. **Cierre documental F0/F1** — incorporar este informe actualizado y los artefactos del checkpoint en un commit documental separado, después de F1 y de su revisión documental.

No se recomienda stash para resolver el solapamiento: F0 no lo autoriza y F1 exige estado de índice por commit. No se propone push en este informe; F3 lo reserva a una orden expresa del CTO.

## Fuera de los commits propuestos

No borrar ni restaurar estas rutas; excluirlas del índice salvo decisión distinta del CTO:

- `.tmp-plan-change-tests.json`: temporal de pruebas.
- `apps/portal/next-env.d.ts` y `apps/web/next-env.d.ts`: generados por Next durante `dev`.
- Los ocho PNG de `docs/informes/evidence/portal-commercial-ui-2026-07-11/`: evidencia histórica sobrescrita por una corrida posterior.
- `.claude/launch.json`: configuración local de previsualización.
- `docs/informes/evidence/mod05-plan-change-2026-10-30/**`: salidas Playwright `error-context.md`, `test-failed-1.png` y `.last-run.json`; no aparecen referenciadas por el plan ni por el informe de diseño de E. Conservarlas localmente hasta que E decida si alguna se incorpora como evidencia curada.
- Rutas sin propietario confirmado enumeradas arriba (`AGENTS.md`, `portal-ui.tsx`, informe MOD00, informe UISP/CRM y los hunks de referencia en HLD/PRD): no introducirlas de rebote en un commit temático.

## Decisiones para el CTO

### D-CK-1 · Clúster MOD05 D/E/F

**Opciones del prompt:**

- **(a) Recomendada:** cuando D y E tengan GO, commits encadenados D → E → F; separar por hunk solamente las rutas cuya compilación intermedia demuestre gate verde.
- **(b) Respaldo:** un solo commit “MOD05 checkpoint” después de que D, E y F tengan GO, citando los tres informes.

**Observación de F0:** `contracts.service.ts` también lleva cambios de G (IVA/media) y no queda probado como separable desde una revisión sin índice. Solicito que la decisión incluya una de estas disposiciones: (1) exigir prueba staged para aislar G antes de ejecutar (a); o (2) extender el commit conjunto a los hunks G inseparables y correr todos sus gates. No ampliar el alcance en silencio. Hoy D está en remediación abierta y E no tiene gate GO; ninguna opción autoriza commitear esas olas ahora. F tiene GO pero queda en espera por D-CK-1 y los puentes compartidos.

### D-CK-2 · Exclusiones

**Recomendación:** aprobar las cuatro exclusiones explícitas anteriores (temporal, `next-env` generados, ocho PNG históricos y configuración local) y las salidas Playwright sin referencia; conservar todos los archivos en disco. Autorizar inclusión posterior solo de evidencia seleccionada que el informe E cite expresamente.

## Pendientes documentales antes de F1

- Asignar dueño a las rutas sin ola inequívoca y decidir el destino de `INFORME-MOD00` y `INFORME-MOD05-UISP-CRM-REFERENCIA-v1.0.md`.
- Confirmar si los cambios de sedes/organización son parte de C u otra ola.
- Resolver D-CK-1 y D-CK-2; F1 no comienza antes de la respuesta del CTO.
- No hacer push ni declarar G6.5 para nuevas SHA hasta la orden del CTO.

## F1 · Commits locales y gates — 2026-10-31

La ejecución se hizo únicamente en `main`. No hubo push. Se crearon cuatro commits locales (A, B, C y G); H no se commiteó por NO-GO. No se commitearon D, E ni F.

### Recuperación R0/R1 de B

- Stash recuperable: `3fa18ca2bae529e87929ee7a601ffbaab8e5cee9`, preservado en `refs/checkpoint/stash-B-rerun` antes de retirarlo de `git stash list`.
- El respaldo externo de `apps/portal/next-env.d.ts` quedó en `%TEMP%/iwana-checkpoint/next-env.d.ts.typegen`; SHA-256 de origen y respaldo: `1862AC4BBBC5192D4BF562161DF66EA547ED3E67173100656AB606AE9797DB2B`.
- R1: `git diff --stat stash@{0} -- . ":(exclude)apps/portal/next-env.d.ts"` quedó vacío; el índice conservó las 14 rutas de B. Después de `git stash drop stash@{0}`, `git stash list` quedó vacío y el estado registró 207 rutas pendientes. La referencia `refs/checkpoint/stash-B-rerun` conserva el objeto del stash.

### Commits con GO

#### A · Dependencias críticas

- SHA: `55e46e9aba63edcea7d3910924e450833445984d` — `chore(deps): update vulnerable package overrides`.
- Rutas (8):
  - `apps/api/package.json`
  - `pnpm-lock.yaml`
  - `pnpm-workspace.yaml`
  - `docs/informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md`
  - `docs/plans/2026-10-30-transversal-deps-criticas-dev.md`
  - `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-v1.0.md`
  - `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.0.md`
  - `docs/prompts/PROMPT-TRANSVERSAL-DEPS-CRITICAS-LAUNCH-v1.1.md`
- Gate A: GO. Instalación frozen y typecheck API: salida 0. Jest API sin caché: 435 suites aprobadas, 4 omitidas; 5.836 tests aprobados, 15 omitidos (5.851 total). `pnpm audit --audit-level critical`: salida 0, cero vulnerabilidades críticas.

#### B · Privacidad y textos legales

- SHA: `130a70ee341c85bab3056b208dd67a75896d63e5` — `feat(privacy): publish legal texts and B8 history`.
- Rutas (14):
  - `apps/portal/src/components/privacy/PrivacyWorkspace.spec.tsx`
  - `apps/portal/src/components/privacy/PrivacyWorkspace.tsx`
  - `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md`
  - `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-v1.0.md`
  - `docs/legal/ACTA-PRIVACY-TEXTOS-LEGALES-IWANA-2026-10-30.md`
  - `docs/legal/AUTORIZACION-IWANA-v1.md`
  - `docs/legal/AVISO-PRIVACIDAD-IWANA-v1.md`
  - `docs/legal/POLITICA-TRATAMIENTO-IWANA-v1.md`
  - `docs/plans/2026-10-29-privacy-textos-legales.md`
  - `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-HISTORIAL-LAUNCH-v1.0.md`
  - `docs/prompts/PROMPT-PRIVACY-TEXTOS-LEGALES-HISTORIAL-v1.0.md`
  - `docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md`
  - `docs/specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md`
  - `docs/specs/2026-10-29-privacy-textos-legales.md`
- Gate B: GO sobre el índice exacto de 14 rutas. `next typegen`, typecheck y lint: salida 0. Jest Portal sin caché: 331/331 suites; 3.352 tests aprobados y 1 omitido (3.353 total). El hook lint-staged/commitlint pasó al crear el commit.

#### C · MOD13 routers y organización

- SHA: `30b2fb0160961c32a523b4c30a5966650bb466ca` — `feat(network): improve router catalog and site summaries`.
- Rutas (27):
  - `apps/api/src/modules/network/network-catalog.service.spec.ts`
  - `apps/api/src/modules/network/network-catalog.service.ts`
  - `apps/api/src/modules/network/tests/network-catalog.d23.http.postgres.integration.spec.ts`
  - `apps/api/src/modules/organization/dto/organization-site.dto.ts`
  - `apps/api/src/modules/organization/organization-site-code.postgres.integration.spec.ts`
  - `apps/api/src/modules/organization/organization.service.spec.ts`
  - `apps/api/src/modules/organization/organization.service.ts`
  - `apps/api/src/modules/organization/ports/organization-site-read.adapter.ts`
  - `apps/api/src/modules/organization/ports/organization-site-read.port.ts`
  - `apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts`
  - `apps/portal/src/components/network/NetworkRouterCatalogClient.spec.tsx`
  - `apps/portal/src/components/network/NetworkRouterCatalogClient.tsx`
  - `apps/portal/src/components/network/NetworkRouterDrawer.spec.tsx`
  - `apps/portal/src/components/network/NetworkRouterDrawer.tsx`
  - `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
  - `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
  - `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
  - `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md`
  - `docs/plans/2026-10-28-mod13-routers-retiro-columna-lan.md`
  - `docs/prompts/PROMPT-MOD13-ROUTERS-CATALOGO-LAUNCH-v1.0.md`
  - `docs/prompts/PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md`
  - `docs/prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-LAUNCH-v1.0.md`
  - `docs/prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md`
  - `docs/specs/2026-10-26-mod13-interfaces-ux.md`
  - `e2e/tests/portal-network-interfaces-a11y.spec.ts`
  - `e2e/tests/portal-settings-organization-access.spec.ts`
  - `e2e/tests/portal-settings-organization-ui.spec.ts`
- Gate C: GO. Typecheck API/Portal y ESLint de 19 rutas: salida 0. API sin caché: 435 suites aprobadas, 4 omitidas; 5.841 tests aprobados, 15 omitidos (5.856 total). Portal sin caché: 331/331 suites; 3.355 tests aprobados, 1 omitido (3.356 total). Las dos integraciones PostgreSQL del alcance se omitieron porque `IWANA_DB_INTEGRATION_AVAILABLE` y la conexión DB no estaban configuradas. El hook lint-staged/commitlint pasó.

#### G · IVA T9 y media

- SHA: `2b70e9d4c7db83578de1faf4f32b31c5d800ba29` — `fix(media): enforce private storage for evidence`.
- Rutas (10):
  - `apps/api/src/modules/crm/contracts/contracts.service.ts` (solo hunks G de evidencia)
  - `apps/api/src/modules/crm/contracts/tests/contracts.service.spec.ts` (solo hunks G de evidencia)
  - `apps/api/src/modules/media/media.service.spec.ts`
  - `apps/api/src/modules/media/media.service.ts`
  - `apps/portal/src/components/crm/subscribers/stratum-evidence.spec.ts`
  - `apps/portal/src/components/crm/subscribers/stratum-evidence.ts`
  - `apps/portal/src/components/privacy/EvidenceUploadField.spec.tsx`
  - `apps/portal/src/components/privacy/EvidenceUploadField.tsx`
  - `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.1.md`
  - `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md`
- Gate G: GO. Typecheck API/Portal y ESLint de 8 rutas: salida 0. API sin caché: 435 suites aprobadas, 4 omitidas; 5.851 tests aprobados, 15 omitidos (5.866 total). Portal sin caché: 332/332 suites; 3.358 tests aprobados, 1 omitido (3.359 total). Las integraciones PostgreSQL no estaban habilitadas. El hook de commit solo reformateó líneas con Prettier; la comparación del snapshot del gate y el commit confirma que el delta fue de formato.

### H · MOD14 y referencias — NO-GO, sin commit

El índice aislado contenía 15 rutas documentales: `docs/adrs/ADR-103-Modulo-Facturacion-MOD14.md`, `docs/directorio-modulos.md`, `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md` (solo referencia UISP; hunks D fuera), `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md`, `docs/informes/INFORME-MOD05-UISP-CRM-REFERENCIA-v1.0.md`, `docs/informes/INFORME-UISP-MANUAL-TECNICO-v1.0.md`, `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md`, `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md` (solo referencia UISP), `docs/prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md`, `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md` (solo hunk MOD14; hunk D fuera), `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-LAUNCH-v1.0.md`, `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.0.md`, `docs/referencias/README.md`, `docs/referencias/REFERENCIA-UISP-CRM-MOD05-v1.0.md` y `docs/referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md`.

- `pnpm audit:adr-citations`: salida 1, **47 bloqueantes y 153 avisos**; entre los hallazgos visibles, ADR-102 no estaba en el snapshot aislado porque pertenece a D y queda excluido.
- `pnpm audit:doc-locations`: salida 0, **0 bloqueantes y 3 avisos** en 2.117 archivos Markdown.
- Typecheck y suites: N/A, índice solo documental. El stash `9c0aa32a23940938a541398e0faa06cf2bad97f1` se restauró limpiamente; quedaron 15 rutas staged y cero conflictos. No commitear H hasta resolver los bloqueantes sin incluir D.

### Pendiente y exclusiones

- D, E y F siguen sin commit por instrucción. D mantiene abierta la remediación de Ola 4; E no tiene GO; F espera a D/E por D-CK-1.
- H queda staged con NO-GO por `audit:adr-citations`; no se cambia ni se descarta su contenido.
- `AGENTS.md` sigue modificado y fuera del commit B: la decisión del CTO asignó la regla `docs/legal/` a B, pero no formó parte del índice de 14 rutas que recibió GO. Requiere gate propio antes de cualquier commit.
- Se conservan las exclusiones D-CK-2: `.claude/launch.json`, `.tmp-plan-change-tests.json`, `apps/portal/next-env.d.ts`, `apps/web/next-env.d.ts`, los ocho PNG de `docs/informes/evidence/portal-commercial-ui-2026-07-11/` y la evidencia Playwright de `docs/informes/evidence/mod05-plan-change-2026-10-30/` no citada por E.
- Permanecen en el árbol las rutas D/E/F, los cambios no asignados detallados en F0 §3 y `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md` (este cierre). La rama sigue `main`, cuatro commits ahead of `origin/main`; no se hizo push.

## F2 · Revisión documental — 2026-10-31

### Evidencia y regla aplicada

- `node scripts/audit-doc-locations.mjs`: salida 0; **0 bloqueantes, 3 avisos**, 2.146 archivos Markdown.
- `node scripts/audit-adr-citations.mjs`: salida 0; **0 bloqueantes, 153 avisos heurísticos**, 88 ADR indexados.
- Ambos resultados son del árbol completo actual. No sustituyen el gate aislado de H registrado en §F1: aquel índice dio **47 bloqueantes** porque D-CK-3 excluyó ADR-102 y otros artefactos D.
- Regla de versionado: [Protocolo de Colaboración §9](../roles/Protocolo_Colaboracion_Multiagente_v1.md) línea 357 exige bump y entrada de changelog en cabecera para todo cambio de contenido. Aplican además [Documentation Rules](../../AGENTS.md) §Documentation Rules y [.github/instructions/docs.instructions.md](../../.github/instructions/docs.instructions.md) líneas 9–19: metadatos de documentos mayores, estados canónicos, plantilla y referencias de prompts, y prohibición de credenciales en documentación.

### Documentos de B, C y G ya commiteados

| Archivo:línea | Regla y hallazgo | Severidad | Corrección mínima |
|---|---|---|---|
| `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-v1.0.md:3` | B subió la cabecera a 1.4, pero no añadió un changelog de esa revisión; la ruta conserva `v1.0`. | Bloqueante | Añadir el changelog v1.4 para B5/B8 y reconciliar el nombre versionado con la cabecera o documentar la ruta estable del informe vivo. |
| `docs/plans/2026-10-29-privacy-textos-legales.md:3,60` | B añadió el cierre de B5 en línea 60, pero la versión sigue en 1.2 y el changelog de cabecera no lo registra. | Bloqueante | Bump a 1.3 y resumir el cierre de B5 en la cabecera. El nombre del plan sigue la convención de fecha. |
| `docs/specs/2026-10-29-privacy-textos-legales.md:3,119,154` | B bumpó a 1.3, pero no incluyó una entrada de changelog para las adiciones de finalidad y alcance. | Bloqueante | Añadir una entrada de cabecera para v1.3; conservar el historial de versiones de la spec. |
| `docs/specs/2026-10-29-privacy-textos-legales-anexo-iwana-v1.md:3,6,306–308` | v1.1 tiene una tabla de historial en el cuerpo, pero falta la entrada de changelog exigida en la cabecera. | Bloqueante | Añadir una línea de cabecera que resuma los ajustes aprobados del anexo v1.1. |
| `docs/runbooks/RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0.md:3` | B ya incluye v1.1 y su resumen de cambios; el sufijo de la ruta todavía dice v1.0. | Menor | Alinear la ruta versionada y sus referencias con v1.1 o registrar explícitamente la ruta estable del runbook. |
| `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md:3` | El informe nuevo tiene fecha y estado, pero le falta el campo versión requerido para un informe mayor. | Menor | Añadir `Versión: 1.0` a la cabecera. |
| `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md:3,2071` | C añadió evidencia en 2071; la versión queda en 1.93 y no hay entrada de changelog para ese contenido. La ruta `v1.0` tampoco refleja la versión de cabecera. | Bloqueante | Bump de versión y changelog que describan la evidencia añadida; reconciliar la ruta estable con la versión declarada. |
| `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md:3,221` | C añadió el cierre/evidencia desde la línea 221; la versión sigue en 1.0 y no hay entrada de changelog. | Bloqueante | Bump a 1.1, registrar el delta y alinear el nombre de archivo con la versión. |
| `docs/prompts/PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md:7` | El prompt de ejecución enlaza el plan y la spec, pero omite la plantilla de ejecución obligatoria. | Menor | Añadir el enlace a `TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` en las referencias de entrada. |
| `docs/prompts/PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md:6–8` | La cabecera declara versión, fecha y emisor, pero no estado. | Menor | Añadir `Estado` usando el vocabulario documental canónico. |
| `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md:5–6,70` | G añadió «Usos privados» desde la línea 70; la versión permanece en 1.0 y la fecha de actualización no sustituye el bump ni el changelog exigidos por §9. | Bloqueante | Bump a 1.1 y añadir una entrada de cabecera que resuma el uso privado de evidencias. |
| `docs/runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md:51,52,130,131,200,251,252` | D-CK-4 y `.github/instructions/docs.instructions.md:15` requieren eliminar credenciales literales de la documentación. No reproduzco sus valores. El resultado de F1 indica que son valores por defecto locales ya presentes en `origin/main`; la decisión del CTO no ordena rotar si no se confirma uso fuera de local. | Bloqueante | Sustituir cada literal por una referencia a `.env.example`, sin reescribir historia ni rotar mientras no haya confirmación de uso externo. |

### Las 15 rutas staged de H

El inventario refleja el índice revisado; no se cambió ni se reindexó ninguna ruta durante esta auditoría.

| Ruta staged | Hallazgo de documentación y corrección mínima | Severidad |
|---|---|---|
| `docs/adrs/ADR-103-Modulo-Facturacion-MOD14.md` | Sin hallazgo de bump: alta inicial v1.0 con estado y fecha en cabecera. | — |
| `docs/directorio-modulos.md:111,138` | El registro existente recibió la entrada MOD14 y la referencia UISP sin versión/changelog. Añadir registro fechado de versión y cambio en la cabecera del índice. | Bloqueante |
| `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md:3,6,15` | El hunk H añade la referencia UISP en línea 15; versión/historial siguen en 2.2/2.2. Requiere un bump y entrada H propios, después del bump D-def detallado abajo. | Bloqueante |
| `docs/hlds/HLD-MOD14-FACTURACION-v1.0.md` | Sin hallazgo de bump: alta inicial v1.0, aprobada y fechada. | — |
| `docs/informes/INFORME-MOD05-UISP-CRM-REFERENCIA-v1.0.md` | Sin hallazgo de bump: alta inicial v1.0 con estado y fecha. | — |
| `docs/informes/INFORME-UISP-MANUAL-TECNICO-v1.0.md:6–7` | Tiene versión y fecha, pero falta estado. Añadir estado documental canónico. | Menor |
| `docs/plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md:3` | El plan declara fecha y versión, pero no estado. Añadir el estado documental canónico en la cabecera. | Menor |
| `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md:3,14` | El hunk H agrega la referencia UISP en línea 14; v2.0 no registra el cambio. Bump a 2.1 y entrada de changelog. | Bloqueante |
| `docs/prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md` | Sin hallazgo de bump: alta inicial v1.0, aprobada y fechada. | — |
| `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md:3,10,1887` | El hunk H modifica el roadmap en 1887; la cabecera/changelog siguen en 2.5. Añadir bump y entrada para H después del bump D-def; el documento declara explícitamente estable su nombre de archivo en línea 11. | Bloqueante |
| `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-LAUNCH-v1.0.md` | Sin hallazgo de changelog para alta inicial; el formato launcher mantiene su plantilla y referencias. | — |
| `docs/prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.0.md:3` | La cabecera incluye versión, fecha y plantilla, pero no estado. Añadir estado documental canónico. | Menor |
| `docs/referencias/README.md` | Alta inicial de índice de referencias; sin hallazgo de bump de una versión anterior. | — |
| `docs/referencias/REFERENCIA-UISP-CRM-MOD05-v1.0.md:5–7` | Sin hallazgo: versión archivada, estado reemplazado y fecha declarados. | — |
| `docs/referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md:5–7` | Aunque §16 contiene historial, la cabecera de v1.1 solo indica reemplazo de v1.0; falta resumen de changelog en cabecera. | Bloqueante |

### Candidatos de D-def

| Archivo:línea | Hallazgo | Severidad | Corrección mínima |
|---|---|---|---|
| `docs/adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md:3–5` | Sin hallazgo de bump: ADR inicial v1.0, aprobado y fechado. | — | — |
| `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.0.md:3–6` | Sin hallazgo de versión para su snapshot inicial; queda marcado sustituido por v1.1. | — | — |
| `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md:3–7` | Sin hallazgo: la enmienda y su resumen de cambios están declarados en cabecera. | — | — |
| `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md:3–4` | Sin hallazgo: alta inicial v1.0 con fecha y estado. | — | — |
| `docs/informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md:3,127,150` | El informe conserva v1.0 y no tiene changelog de las actualizaciones B1b/E2E; el estado solo aparece dentro del cuerpo, no en la cabecera. | Bloqueante | Añadir estado en cabecera, bump/changelog que resuma las actualizaciones y alinear el número de versión del informe vivo. |
| `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md:3,6,175` | El hunk D-def de línea 175 introduce ADR-102, pero la cabecera/historial siguen en 2.2. | Bloqueante | En D-def, bump a 2.3 y registrar ADR-102; reconciliar ruta/cabecera. El hunk H de línea 15 requiere un bump separado posterior. |
| `docs/prds/PRD_Sistema_ISP_Colombia_v2_4.md:3,10,417` | El hunk D-def de línea 417 añade la nota RF-BIL-06, pero la cabecera/changelog permanecen en 2.5. | Bloqueante | En D-def, bump a 2.6 y registrar RF-BIL-06; el hunk H de línea 1887 requiere otro bump posterior. |
| `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md:3,217` | El hunk D-def introduce la decisión ADR-102 sin actualizar la versión 1.2 ni añadir changelog. | Bloqueante | Bump a 1.3, añadir nota de changelog y alinear el nombre versionado. |

### Regla transversal pendiente

`AGENTS.md:306` añade la fila de `docs/legal/` sin bump ni changelog. Aunque `AGENTS.md` es el archivo maestro de ruta estable, el protocolo §9 aplica a todo cambio de contenido. Corrección mínima: registrar el bump y la entrada fechada en su cabecera/historial, manteniendo la ruta canónica `AGENTS.md`.

**Cierre F2:** la auditoría de ubicación del árbol completo no reporta bloqueantes; siguen pendientes las correcciones de changelog/versionado anteriores y el saneamiento D-CK-4. El NO-GO aislado de H permanece hasta volver a ejecutar las dos auditorías documentales sobre el índice de H después de D-def y las correcciones autorizadas. Sin cambios de código ni de índice.

## F1b · Commits documentales y gates — 2026-10-31

Esta sección registra los resultados posteriores a las correcciones de §F2 y el orden final S → DH → BB → X. Cada gate preservó el índice con `git stash push --keep-index --include-untracked` y excluyó `apps/portal/next-env.d.ts` y `apps/web/next-env.d.ts`; los cuatro `git stash pop` deben quedar limpios. Las auditorías reportan AVISO no bloqueantes. No se incluyó código de D ni cambios de E o F.

El NO-GO de H documentado en §F2 era anterior a D-def. El gate DH se ejecutó sobre las 15 rutas de H más los artefactos D-def, incluyendo completos el HLD de MOD05 y el PRD maestro.

| Índice | Commit | SHA | Rutas | `audit:adr-citations` | `audit:doc-locations` | `stash pop` |
|---|---|---|---:|---|---|---|
| S | `docs: version and changelog fixes for committed waves` | `9cf7f91b84984d1d298f470ce9e80eee1bfc38ad` | 11 | BLOQUEANTE: 0 · AVISO: 153 | BLOQUEANTE: 0 · AVISO: 3 | Limpio |
| DH | `docs: approved definitions for MOD05 billing cycle and MOD14` | `316c5b4eb61b9797acd672822ee28bb0cfcc38ef` | 21 | BLOQUEANTE: 0 · AVISO: 153 · 88 ADR indexados | BLOQUEANTE: 0 · AVISO: 3 · 2122 Markdown escaneados | Limpio |
| BB | `docs(agents): register legal texts folder rule` | `66899c3b522543d0a47cefdd46f93431bad9e974` | 1 (`AGENTS.md`) | BLOQUEANTE: 0 · AVISO: 153 | BLOQUEANTE: 0 · AVISO: 3 · 2122 Markdown escaneados | Limpio |
| X | `docs: checkpoint commit report and prompts` | Se informa en la respuesta de cierre; este informe forma parte del commit | 8 | BLOQUEANTE: 0 · AVISO: 153 · 88 ADR indexados | BLOQUEANTE: 0 · AVISO: 3 · 2130 Markdown escaneados | Limpio |

Los commits S, DH y BB se crearon en `main`; sus hooks `lint-staged` y `commitlint` terminaron con salida 0. El índice X contiene este informe, el prompt transversal y sus seis lanzadores (`LAUNCH-v1.0` a `v1.5`). Se registró la evidencia de X y se repite el gate sobre esta versión final del índice antes del commit. La SHA propia de X se informa al cierre porque este informe forma parte del commit.
