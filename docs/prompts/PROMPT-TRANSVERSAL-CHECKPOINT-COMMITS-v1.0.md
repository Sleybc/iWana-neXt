# PROMPT-TRANSVERSAL — Checkpoint de commits del árbol de `main`

**Versión:** 1.0 · **Fecha:** 2026-10-31 · **Emisor:** AI-EM-ARCH
**Motivo:** `main` está sincronizada con `origin/main` en `1ce4f263`, pero tiene **220 rutas sin commitear** de al menos siete olas. Varias olas comparten archivos, así que ninguna puede commitear sola. Este encargo ordena los commits por ola, verifica que cada estado commiteado compile y pase sus pruebas, y deja fuera lo que no tiene GO o no debe versionarse.
**Regla de origen:** cada ola commitea solo lo suyo (reglas comunes de los prompts de fase). Todo se trabaja en `main`, sin ramas.
**Fuera de alcance:** `push`, G6.5 y cualquier revert o descarte de cambios. El push y la CI de `main` requieren una orden expresa del CTO (F3).

## Reglas comunes

1. Lee `AGENTS.md` y este prompt antes de actuar. Lee los `SKILL.md` de tu fase.
2. **Nada se descarta, revierte, borra ni limpia.** Ni `git checkout -- <ruta>`, ni `git clean`, ni `git stash drop`. Lo que no entra en un commit se queda en el árbol tal como está.
3. No hay staging interactivo (`git add -p` no está disponible). Para staging parcial de un archivo se usa un parche filtrado con `git apply --cached`, y solo si F0 lo dejó aprobado para ese archivo.
4. **Cada commit se verifica antes de crearse, sobre el contenido exacto del índice:**
   1. `git stash push --keep-index --include-untracked -m checkpoint-<n>`;
   2. typecheck de los paquetes tocados y las suites indicadas, sin caché de turbo y con conteo real (`iwana-test-evidence`);
   3. `git stash pop`. Si el pop no es limpio, para y emite `[BLOQUEO]`. No resuelvas conflictos por tu cuenta.
5. Mensajes en formato convencional (`feat(crm): …`, `docs(mod14): …`), en inglés como el historial, cada uno con la referencia al informe o plan de la ola en el cuerpo.
6. Sin PII, secretos ni tokens en mensajes o informes.

---

## F0 · `plat-ops` — Inventario y propuesta (solo lectura)

**Skills obligatorias:** `verification-before-completion`. **De apoyo:** `docs-architect`.

Entrega `docs/informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`, tras verificar que la ruta está libre, con:

1. **Tabla ruta → ola → estado del gate → mezclada (sí/no).** Toma el estado de gate de la fuente indicada abajo, no de la memoria. Una ruta es «mezclada» cuando su diff contiene cambios de más de una ola.
2. **Para cada archivo mezclado:** si se puede separar por hunks sin dejar un estado intermedio que no compile, o si debe ir en un commit conjunto.
3. **El orden de commits propuesto**, con lo que se verifica en cada uno según la regla 4.
4. **Lo que queda fuera**, con su motivo.

**Mapa inicial de AI-EM-ARCH (2026-10-31).** Verifícalo; no lo asumas:

| Ola | Rutas (patrón) | Estado declarado | Fuente del estado |
| --- | --- | --- | --- |
| A · Dependencias críticas | `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/api/package.json`, plan, informe y prompts `TRANSVERSAL-DEPS-CRITICAS` | D1 y D2 completos; **V1 pendiente** según el informe; la memoria del EM dice G6 ✅ | `docs/informes/INFORME-TRANSVERSAL-DEPS-CRITICAS-v1.0.md`, `docs/plans/2026-10-30-transversal-deps-criticas-dev.md` §6 |
| B · Privacidad, textos legales (B5–B8) | `apps/portal/src/components/privacy/**`, `docs/legal/**`, specs `2026-10-29-privacy-*`, plan `2026-10-29-privacy-textos-legales.md`, `RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT`, informes `PRIVACY-TEXTOS-LEGALES*`, prompts `PRIVACY-TEXTOS-LEGALES-HISTORIAL*` | B8 **GO**; G6 y G6.5 GO previos sobre `05558a7a` | `docs/informes/INFORME-PRIVACY-TEXTOS-LEGALES-B8-v1.0.md`, plan §Estado |
| C · MOD13, routers (catálogo, sede y puerto, retiro de la columna LAN) | `apps/api/src/modules/network/**`, `apps/api/src/modules/organization/**`, `apps/api/src/modules/wfm/services/wfm-organization-sites.adapter.spec.ts`, `apps/portal/src/components/network/**`, `apps/portal/src/components/settings/OrganizationSettingsClient*`, `e2e/tests/portal-network-interfaces-a11y.spec.ts`, `e2e/tests/portal-settings-organization-*.spec.ts`, plan `2026-10-28-mod13-routers-retiro-columna-lan.md`, prompts `MOD13-ROUTERS-*`, spec `2026-10-26-mod13-interfaces-ux.md` | **Por confirmar** | `docs/informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md` §8.5–§8.9 |
| D · MOD05 Fase 09, ciclo de facturación | `packages/database/.../167_*`, `packages/shared/src/calendar/**`, `billing-cycle.schema*`, `crm/contracts/billing-cycle*`, `crm/contracts/ports/contracts-tenant-settings-read.*`, `apps/portal/src/app/dashboard/crm/subscribers/agenda-corte/**`, `CutoffAgendaClient*`, `BillingCycleField*`, `billing-cycle*` del portal, `e2e/tests/portal-crm-ciclo-facturacion-live.spec.ts`, ADR-102, PRD Fase 09, spec, plan, prompts e informes `MOD05-CICLO-FACTURACION*` | Olas 1 a 3 ejecutadas, G5 ✅; **remediación de la Ola 4 abierta** | `docs/plans/2026-10-30-mod05-ciclo-facturacion.md`, sección final |
| E · MOD05, cambio de plan | `crm/contracts/tests/contract-plan-change.*`, `ChangeContractPlanDialog*`, `use-contract-plan.ts`, `e2e/tests/portal-contract-plan-change.spec.ts`, `docs/informes/evidence/mod05-plan-change-2026-10-30/**`, `168_crm_contract_alias_readable*` (confírmalo), plan, spec e informe `MOD05-CAMBIO-PLAN*` | **Por confirmar** (las casillas del plan siguen sin marcar) | `docs/plans/2026-10-30-mod05-cambio-plan-contrato.md`, `docs/informes/INFORME-MOD05-CAMBIO-PLAN-DISENO-v1.0.md` |
| F · MOD05, revisión de la 360° | `packages/shared/src/contracts/crm/**`, `crm/provisioning-readiness.ts`, `crm/subscribers/**` del alcance de los informes, R5 del portal, prompt e informes `MOD05-360-COTIZACIONES-REVISION*` | **GO en tres olas** | `docs/informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md` §Cierre AI-EM-ARCH, con la lista de archivos en v1.1 |
| G · MOD05, IVA por punto de servicio (T9) y media | `apps/api/src/modules/media/**`, `stratum-evidence*` del portal, informes `MOD05-IVA-PUNTO-SERVICIO-T9*`, `RUNBOOK-MEDIA-MINIO` | **Por confirmar** | `docs/informes/INFORME-MOD05-IVA-PUNTO-SERVICIO-T9-v1.1.md` |
| H · Documentos sin código | MOD14 (ADR-103, PRD, HLD, plan y prompts), `docs/referencias/**`, informes `UISP-*`, `docs/directorio-modulos.md`, fila del roadmap y notas del PRD maestro | MOD14 con **G0 aprobado**; referencias no normativas | ADR-103 y PRD MOD14 §9 |

**Rutas sin dueño identificado, para que F0 las asigne o las proponga fuera:**
- `AGENTS.md`;
- `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`;
- `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md` y `PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md`;
- `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`;
- `apps/portal/src/components/shared/portal-ui.tsx`;
- `packages/database/src/migrations/tenant/runner.ts`, que registra la 167 y la 168, de olas D y E;
- `packages/shared/src/index.ts`, con exportaciones de las olas D y F;
- `apps/portal/src/lib/api-client.ts`, con cambios de las olas D, E y F;
- los archivos de `crm/contracts/**` y `components/crm/subscribers/**`, compartidos entre D, E y F.

**Propuesta de exclusión, a decidir por el CTO (D-CK-2):**
- `.tmp-plan-change-tests.json`: temporal de pruebas;
- `apps/portal/next-env.d.ts` y `apps/web/next-env.d.ts`: los genera Next en `dev`;
- los 8 PNG de `docs/informes/evidence/portal-commercial-ui-2026-07-11/`: evidencia histórica de julio sobrescrita, posiblemente por una corrida de E2E;
- `.claude/launch.json`: configuración local de previsualización.

Ninguna se borra ni se restaura: solo no entran en commits.

**Decisiones que F0 prepara para el CTO:**
- **D-CK-1, clúster MOD05 (D, E y F):** si sus archivos compartidos no se pueden separar por hunks con estados intermedios que compilen, hay dos opciones:
  - (a) esperar a que D y E tengan GO y commitear las tres olas en commits encadenados, D → E → F, separando por hunks solo donde F0 lo demostró viable;
  - (b) un único commit conjunto «MOD05 checkpoint», cuando las tres tengan GO, con el cuerpo citando los tres informes.

  Recomendación del EM: **(a)**, con **(b)** como respaldo para los archivos que F0 marque inseparables.
- **D-CK-2:** las exclusiones de arriba.

**Parada obligatoria:** F0 termina en su informe. F1 no empieza sin la respuesta del CTO a D-CK-1 y D-CK-2.

## F1 · `plat-ops` + `gate-verifier` — Commits de las olas con GO

**Skills obligatorias:**
- `plat-ops`: `verification-before-completion`, `turborepo-caching`;
- `gate-verifier`: `iwana-test-evidence`, `verification-before-completion`, `turborepo-caching`.

1. Orden base, que F0 puede ajustar con justificación. Cada paso aplica solo si su ola tiene GO verificado en su fuente:
   1. **A**, dependencias. Verificación: `pnpm install --frozen-lockfile` sobre el índice, typecheck y suites de `@iwana/api`.
   2. **B**, privacidad.
   3. **C**, MOD13 routers.
   4. **G**, IVA T9 y media.
   5. **Clúster MOD05** según D-CK-1.
   6. **H**, solo documentos. Verificación: `pnpm audit:adr-citations` y `pnpm audit:doc-locations` en `BLOQUEANTE: 0`.
2. `plat-ops` arma el índice de cada commit. `gate-verifier` ejecuta la regla 4 y da GO/NO-GO **antes** del `git commit`. Con NO-GO no se commitea: se informa y se sigue con la siguiente ola independiente, si la hay.
3. Las olas sin GO, o en espera por D-CK-1, quedan en el árbol, intactas.
4. **Cierre:** `plat-ops` añade al informe F0 la §F1 con cada commit (SHA, ola, rutas y evidencia de `gate-verifier` con conteos) y la lista de lo que queda sin commitear y por qué.

## F2 · `docs-governance` — Revisión documental (solo lectura, en paralelo con el final de F1)

Revisa los commits de documentos (olas B, D, H y los informes de cada ola) contra «Documentation Rules» de `AGENTS.md`. Reporta hallazgos con `archivo:línea`.

## F3 · Push y G6.5 — **solo con orden expresa del CTO**

No forma parte de este encargo. Cuando el CTO lo ordene: push de `main` y `gh run list --branch main` en verde sobre el SHA final (ADR-069). Hasta entonces, los commits quedan solo en local.

---

## Decisiones del CTO sobre el informe F0 (2026-10-31)

Fuente: [INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0](../informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md).

| # | Decisión |
| --- | --- |
| D-CK-1 | **(a) Encadenado D → E → F**, cuando D y E tengan GO en su fuente. Se separa por hunks solo lo que demuestre en su índice typecheck y suites en verde. Los hunks de G en `contracts.service.ts` y sus pruebas se aíslan solo con esa prueba. Un archivo que resulte inseparable va, **solo ese archivo**, al commit conjunto de las olas que lo compartan, citando sus informes |
| D-CK-2 | **Exclusiones aprobadas**, sin borrar nada: `.tmp-plan-change-tests.json`, los dos `next-env.d.ts`, los 8 PNG de `portal-commercial-ui-2026-07-11/`, `.claude/launch.json` y las salidas Playwright de `mod05-plan-change-2026-10-30/` que el informe de E no cite |
| Dueños | `AGENTS.md` (regla de la carpeta `docs/legal/`) → **B**. Los enlaces UISP en `HLD-MOD05-ARQUITECTURA-v2.0.md` y `PRD-MOD05-CRM-DEFINICION-v2.0.md`, corregidos a la v1.1 por AI-EM-ARCH, más `INFORME-MOD05-UISP-CRM-REFERENCIA-v1.0.md` e `INFORME-UISP-MANUAL-TECNICO-v1.0.md` → **H**. `INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` → **C**. `portal-ui.tsx` queda **fuera** hasta que D o E lo reclamen. El hunk de ADR-102 en el HLD de MOD05 y en el PRD maestro es de **D** |

**Precisión sobre la regla 4.** El informe F0 desaconseja `stash` porque F0 no lo autorizaba. En F1 **sí está autorizado**: `git stash push --keep-index --include-untracked` seguido de `git stash pop`, sin `drop` ni descarte. Es la forma de probar exactamente el contenido del índice sin ramas ni worktrees. Si el `pop` no es limpio: `[BLOQUEO]` y parar.

**Alcance de F1 ahora:** olas **A → B → C → G → H**. D, E y F quedan en el árbol hasta que D cierre la Ola 4 y E tenga GO; F espera a ambas por D-CK-1.
- B y G comparten `EvidenceUploadField*`: se separan si cada índice pasa sus gates; si no, ese par de archivos va en un commit conjunto B+G.
- C exige además, sobre su índice, la suite completa del portal que el addendum de retiro de la columna LAN dejó pendiente.

---

## Incidente de F1 en B y enmienda de la regla 4 (2026-10-31)

**Hecho.** A quedó commiteada en `55e46e9a`. En B, el gate pasó (typecheck y lint con salida 0; portal con 331/331 suites, 3.352 tests aprobados y 1 omitido), pero el `git stash pop` se rechazó. La causa es que `next typegen`, durante el typecheck del portal, reescribió `apps/portal/next-env.d.ts`, que también estaba dentro del stash.

Ese archivo es **generado**:
- `dev` importa `./.next/dev/types/…`;
- `typegen` y `build` importan `./.next/types/…`.

Ninguna variante es trabajo de una ola, y D-CK-2 ya lo excluía de los commits. **Defecto del emisor:** la regla 4 no lo excluía del stash.

**Recuperación R0, autorizada por el CTO el 2026-10-31.** Es una excepción acotada a la regla 2 y aplica **solo** a `apps/portal/next-env.d.ts`:
1. Registra el estado: `git stash list` (debe estar `checkpoint-B-rerun`), `git diff --cached --name-only` (14 rutas de B) y `git status --porcelain | Measure-Object` (o `wc -l`).
2. Copia `apps/portal/next-env.d.ts` a un respaldo **fuera del repo**, en `$env:TEMP\iwana-checkpoint\next-env.d.ts.typegen`.
3. `git checkout -- apps/portal/next-env.d.ts`, que solo restaura ese archivo a `HEAD`.
4. `git stash pop`. Si no es limpio: `[BLOQUEO]` y parar, sin `drop`.
5. Verifica que las 14 rutas de B siguen en el índice, que `stash list` quedó sin `checkpoint-B-rerun`, que el número de rutas pendientes coincide con el del punto 1 y que `apps/portal/next-env.d.ts` volvió a la variante `.next/dev/types`. Informa las cifras.

**Regla 4, enmendada.** El stash de verificación excluye los dos archivos generados:

```
git stash push --keep-index --include-untracked -m checkpoint-<n> -- . ":(exclude)apps/portal/next-env.d.ts" ":(exclude)apps/web/next-env.d.ts"
```

Si, aun así, otro archivo generado bloquea el `pop`, se aplica `[BLOQUEO]` y se para. La excepción de R0 no se extiende a otros archivos sin autorización.

**Reanudación:** después de R0, B se commitea con la evidencia ya obtenida, porque el índice no cambió. Luego se sigue con C → G → H, aplicando la regla 4 enmendada.

---

## Segundo incidente (R0) y recuperación R1 (2026-10-31)

**Hecho.** El `git stash pop` de R0 salió con código 1: «ya existe» en archivos sin seguimiento. El stash `checkpoint-B-rerun` (`3fa18ca2bae529e87929ee7a601ffbaab8e5cee9`) quedó conservado. AI-EM-ARCH comprobó en solo lectura que **el stash ya está reflejado por completo en el árbol**:
- el árbol de los archivos con seguimiento coincide con el del stash, salvo el `next-env.d.ts` excluido;
- el índice coincide con el guardado (14 rutas de B);
- 95 de los 96 archivos sin seguimiento son idénticos byte a byte.

El único distinto es este prompt: la versión del árbol es la del stash más la sección del primer incidente, que AI-EM-ARCH escribió **mientras el stash estaba activo**. Ese es el defecto del emisor. La explicación probable es que el primer `pop`, abortado por `next-env.d.ts`, ya había restaurado los archivos sin seguimiento.

**R1, autorizada por el CTO el 2026-10-31:**
1. `git update-ref refs/checkpoint/stash-B-rerun 3fa18ca2bae529e87929ee7a601ffbaab8e5cee9`, para conservar el stash recuperable sin crear rama.
2. Confirma de nuevo que `git diff --stat stash@{0} -- . ":(exclude)apps/portal/next-env.d.ts"` sale vacío y que el índice tiene las 14 rutas de B. Si no es así: `[BLOQUEO]` y parar.
3. `git stash drop stash@{0}`. No borra contenido: el commit sigue alcanzable desde la referencia del paso 1.
4. Informa `git stash list` (vacío), las rutas del índice y el total de `git status --porcelain`.

**Regla 7, nueva.** Mientras F1 esté en curso, **nadie edita el árbol de trabajo**: ni AI-EM-ARCH, ni otra sesión, ni otro agente. Las correcciones de este prompt se escriben antes de lanzar la siguiente corrida o después de su cierre.

**Reanudación:** commit de B con su gate ya en GO (índice sin cambios). Luego C → G → H, con la regla 4 enmendada.

---

## Resultado de F1 y Ola F1b (2026-10-31)

**Resultado de F1** (detalle en el [informe](../informes/INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md) §F1). Hay cuatro commits locales, sin push: A `55e46e9a`, B `130a70ee`, C `30b2fb01` y G `2b70e9d4`. **H quedó en NO-GO** (`audit:adr-citations`, 47 bloqueantes), con 15 rutas staged. `AGENTS.md` quedó fuera de B. El stash está vacío y `refs/checkpoint/stash-B-rerun` se conserva.

**Diagnóstico de AI-EM-ARCH:**
- **H depende de D.** ADR-103, el PRD y el HLD de MOD14 y la referencia UISP citan ADR-102 y el PRD de la Fase 09, que pertenecen a D y no estaban en el índice aislado. En el árbol completo la misma auditoría da 0 bloqueantes.
- **Credenciales del runbook de MinIO:** son los valores por defecto de desarrollo local, presentes en `origin/main` desde abril; G no los introdujo. Producción exige `S3_SECRET_ACCESS_KEY` sin valor por defecto (`docker-compose.prod.yml:174,351`). **No es una filtración de producción.**
- **Versionado sin changelog en B, C, G y H:** F2 lo reportó, pero el informe **no recoge el detalle** con `archivo:línea`.

**Decisiones del CTO (2026-10-31):**

| # | Decisión |
| --- | --- |
| D-CK-3 | **Commit documental «D-def» antes de H.** Solo la definición aprobada de D, sin código: `docs/adrs/ADR-102-…`, `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.0.md` y `v1.1.md`, `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md`, `docs/informes/INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md` y los hunks de D en `HLD-MOD05-ARQUITECTURA-v2.0.md` (nota de ADR-102), en el PRD maestro (nota de RF-BIL-06) y en `PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md`. El plan, los prompts y el informe de guardado de D van con su código cuando D tenga GO |
| D-CK-4 | **Higiene del runbook de MinIO, sin reescribir historia ni rotar:** los valores literales se sustituyen por una referencia a `.env.example`. Se rota solo si se confirma su uso fuera de local |

### F1b · Secuencia

1. **F2-bis · `docs-governance`** (solo lectura). Escribe en el informe una §F2 con **cada** hallazgo de versionado y changelog, con `archivo:línea` y la corrección mínima exigida, sobre los documentos de B, C y G ya commiteados, las 15 rutas de H, `AGENTS.md` y los candidatos de D-def. Incluye las líneas del runbook afectadas por D-CK-4 **sin reproducir sus valores**. Para ahí.
2. **AI-EM-ARCH** aplica las correcciones documentales de F2-bis y D-CK-4 con la corrida detenida (regla 7), en un commit de seguimiento. **No se reescriben** los commits locales B, C ni G.
3. **F1b · `plat-ops` + `gate-verifier`**, con la regla 4 enmendada:
   1. commit de seguimiento documental;
   2. **D-def**;
   3. **H**, completando su índice si F2-bis añade correcciones;
   4. **B-bis**: `AGENTS.md`, solo el hunk de la regla de `docs/legal/`, con su propio gate.

   Cada commit documental exige `audit:adr-citations` y `audit:doc-locations` con `BLOQUEANTE: 0` **sobre su índice aislado**.
4. Sin push: F3 sigue reservada a una orden del CTO.

---

## F1b · Correcciones aplicadas y secuencia final (2026-10-31)

**Paso 2 de F1b, hecho por AI-EM-ARCH con la corrida detenida (regla 7).** Se aplicaron las 22 correcciones de §F2 del informe: subida de versión, changelog de cabecera, estado y nota de «ruta estable» donde el sufijo del nombre no coincide con la versión.
- **D-CK-4:** el runbook de MinIO ya no contiene valores literales; la comprobación `minioadmin\d*` da 0.
- **`AGENTS.md`:** recibe solo una línea de historial de la regla de `docs/legal/`.

**Ajuste de secuencia de D-CK-3 (AI-EM-ARCH).** `HLD-MOD05-ARQUITECTURA-v2.0.md` y `PRD_Sistema_ISP_Colombia_v2_4.md` tienen cambios de D-def y de H, pero **una sola línea de versión**: no se pueden repartir entre dos commits sin parches hechos a mano sobre la misma línea. Por eso D-def y H van en **un único commit documental**, con una subida de versión que registra ambos cambios. El contenido commiteado es el mismo que decidió el CTO; solo cambia el número de commits. El código de D sigue fuera.

**Commits de F1b**, en este orden, cada uno con `audit:adr-citations` y `audit:doc-locations` en `BLOQUEANTE: 0` **sobre su índice aislado** (regla 4 enmendada):

| # | Commit | Rutas |
| --- | --- | --- |
| S | `docs: version and changelog fixes for committed waves` | Las seis rutas de B de §F2 (informe y plan de textos legales, spec y anexo, runbook de release por tenant, informe B8), `INFORME-MOD00-…`, `INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md`, `PROMPT-MOD13-ROUTERS-CATALOGO-v1.0.md`, `PROMPT-MOD13-ROUTERS-SEDE-PUERTO-v1.0.md` y `RUNBOOK-MEDIA-MINIO-v1.0.md` |
| DH | `docs: approved definitions for MOD05 billing cycle and MOD14` | Las 15 rutas de H y los candidatos de D-def de §F2: ADR-102, PRD Fase 09 v1.0 y v1.1, spec de ciclo de facturación UX, `INFORME-MOD05-CICLO-FACTURACION-DEFINICION-v1.0.md` y `PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md`. `HLD-MOD05-…` y el PRD maestro van **completos** |
| BB | `docs(agents): register legal texts folder rule` | `AGENTS.md` completo: la fila de `docs/legal/` y su línea de historial |
| X | `docs: checkpoint commit report and prompts` | `INFORME-TRANSVERSAL-CHECKPOINT-COMMITS-v1.0.md`, este prompt y sus lanzadores `LAUNCH-v1.0` a `v1.5` |

**Si un índice aislado no da 0 bloqueantes:** `[BLOQUEO]` con la lista de hallazgos. No se ajustan documentos sin pasar por AI-EM-ARCH. Sin push.
