# PROMPT — MOD05 · Fase 09 · Ciclo de facturación y fecha de corte · v1.0

**Plan:** `docs/plans/2026-10-30-mod05-ciclo-facturacion.md` v1.0 · **PRD:** `docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md` · **Decisión:** `docs/adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md`
**Plantilla base:** [TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md)
**Precondición:** G0 ✅ 2026-10-30 — el CTO aprobó ADR-102 y el PRD Fase 09 con D-F9-1 = (a), D-F9-2 = (a) y D-F9-3 = (a).
**Contrato de API congelado (desde G0, 2026-10-30; enmienda E1 el mismo día):** PRD Fase 09 v1.1 §7 (esquemas, funciones, respuesta de la agenda y códigos de error) y la tabla de resultados de ADR-102 D3. Cualquier cambio de nombre, forma o código se pide con `[BLOQUEO]` a AI-EM-ARCH; nunca se parchea en silencio.
**Enmienda E1 (CTO, 2026-10-30):** `GET /crm/billing-cycles` devuelve `BillingCycleOption[]` con `nextCutoffDate` calculado en el servidor (PRD v1.1 RF-CF-20). El portal no calcula fechas de corte ni lee la zona horaria del tenant: `SALES` y `AUDITOR` no pueden leer `GET /tenants/me/settings`. Lo implementa §B1b. El encargo se amplía sin cambiar de versión: §P1 y §B1 ya se ejecutaron y no cambian; lo nuevo es §B1b y los ajustes de §F1 y §V3.
**Base:** `main`. Se trabaja en `main`, sin ramas. `main` tiene cambios sin commitear de otros frentes (red, organización, privacy): no los toques, no los incluyas en tus commits y **no uses `git stash`**.

---

## Regla común

- Ciclo = atributo del **contrato**. Catálogo por tenant en `crm_billing_cycles`, sembrado `(1,15)` y `(15,30)`.
- Fecha de corte = `min(cutoff_day, último día del mes)`, sin corrimiento por festivos, en la **zona horaria del tenant**.
- **No se construye corte automático** (ADR-102 D6). Nada de jobs, colas ni suspensiones con origen `BILLING` en esta fase.
- Sin backfill de contratos existentes (D4). Nunca `tenant_iwana` en pruebas.

---

## §P1 — prod-ux

Spec UX corta en `docs/specs/2026-10-30-mod05-ciclo-facturacion-ux.md`:

1. **Diálogo «Activar servicio»** (hoy el botón activa directo, `ServiciosTab.tsx:171-218`): selector de ciclo (preseleccionado si el contrato lo tiene), «Próximo corte: {fecha}» que se actualiza al elegir, confirmar deshabilitado sin ciclo, estado de error para 422.
2. **Selector de ciclo** en `CreateContractDialog`, `ContractDetailDrawer` (edición) y `ConvertExpedienteToContractDialog`; cómo se muestra el `billingCycle` heredado (texto) cuando existe.
3. **«Ciclo» y «Próximo corte»** en `ContractCard` y en el detalle; estado «Sin ciclo de facturación».
4. **Agenda de corte** dentro de Suscriptores (D-F9-3 = a): ubicación, selector de fecha, agrupación por ciclo, contador «sin ciclo», leyenda de RF-CF-18, acción única = suspensión manual existente. Estados de carga, vacío y error.
5. Vocabulario visible revisado con `system-vocabulary-review`.

Reutiliza patrones existentes (diálogos de ciclo de vida, lista operativa Fase 06); no propone primitives nuevas sin consultar a `ds-owner`. Cierra con la spec y la lista de componentes afectados.

---

## §B1 — sr-backend

1. **Migración** de tenant con el siguiente número libre (hoy `167`; verifícalo), reversible:
   - `crm_billing_cycles` según PRD RF-CF-01 y la siembra de RF-CF-02;
   - `contracts.billing_cycle_day smallint NULL`, FK a `crm_billing_cycles(cycle_day)` e índice `(status, billing_cycle_day)`;
   - prueba de migración `up`/`down` en el estilo de `160_network_catalog.integration.spec.ts`.
2. **`@iwana/shared`**: exactamente los nombres de PRD §7 — `BillingCycleSchema`, `ActivateContractSchema`, `CutoffAgendaQuerySchema`, `CutoffAgendaItem`, `CutoffAgendaResponse` (con el `ListMeta` existente de `dto/pagination.dto.ts`), `computeCutoffDate`, `computeNextCutoffDate` (en `calendar/billing-cutoff.ts`), códigos `BILLING_CYCLE_REQUIRED` y `BILLING_CYCLE_INVALID`. `billingCycleDay` en los esquemas de contrato; `billingCycle` queda, marcado deprecado.
3. **Contratos (`crm/contracts`)**:
   - `activate` recibe el cuerpo opcional y aplica la tabla de ADR-102 D3 dentro del bloqueo y la transacción de `_transition`;
   - crear, editar y convertir validan `billingCycleDay` contra el catálogo activo;
   - el cambio se audita (añade `billingCycleDay` a los campos auditados junto a `billingCycle`).
4. **Endpoints** `GET /crm/billing-cycles` y `GET /crm/billing-cycles/cutoff-agenda` (PRD RF-CF-03, RF-CF-16, RF-CF-17), permiso `CRM_SUBSCRIBERS_READ`; los campos del suscriptor salen de la **proyección de lista vigente** (ADR-067), no de la entidad completa. La fecha local del tenant se obtiene de `settings.timezone`; si necesitas un puerto de lectura de settings, sigue el patrón de `wfm-tenant-settings-read.adapter.ts`.
5. OpenAPI: cuerpo de `activate`, endpoints nuevos, `billingCycle` con `deprecated: true`.

### Criterios de aceptación

| CA | Comprobación | Tipo |
| --- | --- | --- |
| CA-CF-01 | Siembra y `down` | Integración de migración, **Postgres real** |
| CA-CF-02 a CA-CF-04 | Activación sin ciclo, con ciclo válido, con ciclo inexistente o inactivo | **Postgres real** |
| CA-CF-05, CA-CF-06 | `computeCutoffDate` y `computeNextCutoffDate` | Unitaria en tabla (`@iwana/shared`) |
| CA-CF-07, CA-CF-08 | Agenda por fecha, exclusiones, `withoutCycleCount`, fecha local a las 21:00 de Bogotá | **Postgres real** + unitaria con reloj fijo |
| CA-CF-09 | 403 sin permiso | HTTP |

**Postgres real:** patrón de `contracts.service.postgres.integration.spec.ts` (`IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG` del tenant de pruebas), datos con prefijo identificable y limpieza al final. Reporta **tests ejecutados**; 0 no cuenta. No commitees.

---

## §B1b — sr-backend (enmienda E1)

Sobre lo que dejó B1, sin rehacerlo:

1. **`@iwana/shared`**: `BillingCycleOptionSchema` y `BillingCycleOption` en `schemas/billing-cycle.schema.ts`, exactamente como PRD v1.1 §7, exportados desde el índice del paquete.
2. **`GET /crm/billing-cycles`** devuelve `BillingCycleOption[]`. `nextCutoffDate` sale de `computeNextCutoffDate` con la fecha local del tenant obtenida igual que la agenda (`getTenantLocalDate` y el puerto de settings que ya usa `getCutoffAgenda`). No se persiste. OpenAPI actualizado.
3. **Pruebas**: CA-CF-13. Unitaria con reloj fijo a las 21:00 de Bogotá del día 15 (ciclo 1 → ese mismo día 15) y HTTP con un usuario `SALES` que recibe 200. Las pruebas de B1 siguen verdes.

No toques `apps/portal`. No commitees. Cierra con el conteo real de las suites tocadas y de `@iwana/shared`.

---

## §F1 — fe-platform

Implementa la spec de §P1 contra el contrato congelado (no esperes a B1b; si `BillingCycleOption` aún no está exportado, usa exactamente la forma de PRD v1.1 §7):

1. Diálogo «Activar servicio». Amplía `contractsApi.activate` en `apps/portal/src/lib/api-client.ts` (hoy `activate(id, tenantSlug?)`, :7138) para enviar el cuerpo `{ billingCycleDay }`, conservando `tenantSlug` y el helper `request`.
2. Selectores de ciclo en crear, editar y convertir; dato heredado visible según la spec.
3. «Ciclo» y «Próximo corte» con el `nextCutoffDate` de `GET /crm/billing-cycles` (PRD v1.1 RF-CF-12, RF-CF-15 y RF-CF-20), buscado por `billingCycleDay`. **No** calcules fechas en el navegador, no uses `computeNextCutoffDate` en el portal y no llames a `GET /tenants/me/settings`. No guardes el catálogo de un día para otro. La agenda es una página nueva (`/dashboard/crm/subscribers/agenda-corte`, spec §4): sigue los patrones del App Router del portal.
4. Vista de agenda de corte según la spec.
5. Pruebas de componente: CA-CF-10 (la fecha mostrada es la del catálogo simulado) y CA-CF-11, más los estados vacío y error de la agenda.
6. `apps/portal/src/lib/api-client.ts` ya tiene una línea modificada por otro frente: cambia solo `contractsApi.activate` y lo que añadas para ciclos y agenda, sin tocar esa línea.

Sin tokens ni primitives nuevas fuera de lo que la spec acuerde con `ds-owner`. `audit-ui.mjs` en 0 en las pantallas tocadas. No commitees.

---

## §Q1 — sr-qa

E2E Playwright en `e2e/tests/` (job «E2E portal»): CA-CF-12 — activar un servicio eligiendo el ciclo y encontrarlo en la agenda de su fecha de corte; activar sin ciclo deja el botón deshabilitado. Matriz CA ↔ test de todo el PRD con estado real. Usa el tenant de pruebas, nunca `tenant_iwana`.

## §V1 — contract-drift-reviewer

`@iwana/shared` (esquemas, funciones, códigos) ↔ DTOs y OpenAPI de `crm/contracts` ↔ `api-client.ts` y componentes del portal. Busca consumidores de `billingCycle` (incluido `apps/web` y expedientes) que dependan del texto libre. Solo lectura; hallazgos con `archivo:línea`.

## §V2 — boundary-reviewer

Migración y módulo `crm`: tabla en schema tenant, sin acceso a tablas de otros módulos, lectura de settings por puerto, sin imports circulares. Solo lectura.

## §V3 — gate-verifier

Gates Before Merge sin caché de turbo sobre `@iwana/shared`, `@iwana/database`, `@iwana/api` y `@iwana/portal`: lint, typecheck, **suite completa de `@iwana/api`** (cambia un `@Module`), integraciones Postgres de la fase con conteo real, CA-CF-13, cobertura ≥ 80 % en líneas nuevas (con la de `ContractsService` antes y después: B1 la dejó en 81,88 % de líneas, 71,1 % de ramas y 69,13 % de funciones), E2E de §Q1. Evidencia con comandos y cifras. No corrige código.

---

## Remediación tras la Ola 3 (AI-EM-ARCH, 2026-10-30)

### §R1 — sr-backend · CA-CF-08 completo

Añade la prueba que falta: `getCutoffAgenda` **sin `date`**, con el reloj fijo a las 21:00 de Bogotá (02:00 UTC del día siguiente). Debe devolver `date` igual al día de Bogotá y no al de UTC. Usa reloj falso de Jest y el puerto de settings simulado con `America/Bogota`. Solo se añade una prueba: no cambies código de producción salvo que la prueba muestre un defecto, y en ese caso repórtalo antes. Cierra con el conteo real de la suite tocada.

### §R2 — fe-platform · rechazo por mora en la activación

Al mover la activación a `ActivateServiceDialog`, F1 quitó la prueba de mora de `contracts-dialogs.behavior.spec.tsx:160` sin trasladarla. El código sigue en `ActivateServiceDialog.tsx:100`.

1. Prueba de componente de `ActivateServiceDialog`: `activate` rechaza con 409 `SUBSCRIBER_SUSPENDED_FOR_DELINQUENCY`. Comprueba el título «No puedes activar este servicio», el botón «Dejar como borrador», que al pulsarlo el aviso desaparece y que el contrato sigue como borrador.
2. Revisa las ramas de mora de `ServiciosTab.tsx:209` y `ContractDetailDrawer.tsx:568`. Si después de delegar la activación ya no se pueden alcanzar, elimínalas junto con sus pruebas. Si alguna sigue sirviendo a otra transición, déjala y nombra cuál.

No debilites ninguna aserción existente. Sin tokens ni primitives nuevas. No commitees.

### §V3b — gate-verifier · re-verificación focal

Después de R1 y R2: sin caché, lint y typecheck de `@iwana/api` y `@iwana/portal`; la **suite completa de `@iwana/portal`** y la suite del módulo `crm/contracts` de `@iwana/api` (R1 no cambia ningún `@Module`). Entrega comandos y cifras reales. Confirma `pnpm audit --prod --audit-level critical` (el gate del CI) con 0 críticas.

---

### §R3 — sr-backend · reparación de `_transition` (bloqueo de V3b, 2026-10-31)

V3b quedó bloqueado por un error de compilación que **no introdujeron R1 ni R2**: una fusión de texto corrupta en `apps/api/src/modules/crm/contracts/contracts.service.ts`, `_transition` (modificado el 2026-10-31 a las 17:37 por una sesión no identificada). Dos líneas están fuera de su sitio:

1. `requestedBillingCycleDay?: number,` aparece **después** del cierre de la lista de parámetros. Es de esta fase: `activate()` llama a `_transition(id, ContractStatus.ACTIVE, actorId, command.billingCycleDay)`. Va como cuarto parámetro de la firma.
2. `await this.assertContractVersionForSave(qr, entity);` aparece **dentro de los argumentos** de `qr.query(...)`. Es el control de versión de la ola de cambio de plan (E), usado también en `update` y en el cambio de plan. **Decide con evidencia** si `_transition` debe ejecutarlo:
   - lee `docs/plans/2026-10-30-mod05-cambio-plan-contrato.md`, la spec `docs/specs/2026-10-30-mod05-cambio-plan-contrato-ux.md` y el informe de diseño de E;
   - si la transición debe verificar versión, colócalo **después** de obtener el bloqueo `FOR UPDATE` y antes de cualquier escritura, con una prueba que lo demuestre;
   - si no hay requisito que lo pida, quita esa línea de `_transition`;
   - si la intención no se puede determinar: `[BLOQUEO]` y para.

Reglas:
- Cambia **solo** esas dos líneas y lo que exija su prueba.
- No reescribas otras partes del archivo, que tiene cambios de D, E y G.
- Antes de editar, confirma con `git status` y la fecha de modificación que ninguna otra sesión está tocando el archivo. Si cambió durante tu trabajo, `[BLOQUEO]`.
- Sin `git stash` y sin commit.

**Cierre:** typecheck de `@iwana/api` en verde y la suite `crm/contracts` ejecutada **con el caso R1 corriendo**, con conteo real. Si el caso R1 revela un defecto horario, repórtalo sin corregirlo.

Después de R3 se repite **§V3b** completo.

### §R3-bis — sr-backend · restauración de `contracts.service.ts` (2026-10-31)

**Diagnóstico de AI-EM-ARCH, en solo lectura.** El archivo actual tiene **las mismas líneas** que la versión guardada en `refs/checkpoint/stash-B-rerun` (`3fa18ca2`), salvo una línea en blanco: solo cambió el orden.

- **Causa:** el commit G del checkpoint (`2b70e9d4`) incluyó solo algunos hunks del archivo. Al verificarlo con `stash push --keep-index` y `pop` con el archivo parcialmente en el índice, git recolocó líneas de contexto ambiguo.
- **Lo publicado compila** (CI en verde). Ningún otro archivo modificado presenta el desplazamiento: los cambios de la prueba son reformateo de Prettier.

**Encargo:**
1. Respalda el archivo actual **fuera del repo**.
2. Restaura su contenido desde la versión sana: `git show refs/checkpoint/stash-B-rerun:apps/api/src/modules/crm/contracts/contracts.service.ts`.
3. Reaplica la **única** decisión legítima de R3: mueve `await this.assertContractVersionForSave(qr, entity);` a **después** del bloqueo `FOR UPDATE` en `_transition`. La versión sana lo tiene antes. Conserva la prueba de R3 de `contracts.service.spec.ts:1930`.
4. Verifica que `diff` entre la versión sana y el resultado muestre **solo** ese movimiento.
5. Typecheck de `@iwana/api` en verde. Suite `crm/contracts` con conteo real y con el caso CA-CF-08 de R1 **ejecutado**. Si el caso revela un defecto horario, repórtalo sin corregirlo.

**Reglas:**
- Antes de empezar, confirma que nadie más edita el archivo.
- Sin `git stash` y sin commit.
- No toques la prueba más allá de lo que exija su compilación.

Después de R3-bis se repite **§V3b** completo.

### §R3-ter — sr-backend · restauración de `contracts.service.spec.ts` (2026-10-31)

**Resultado de R3-bis:** servicio restaurado, con un diff contra la versión sana de 1 línea (el movimiento de R3). Typecheck de API en verde. Suite `crm/contracts`: 177 de 178, con **CA-CF-08 ejecutado y en verde**.

**El fallo restante no es una decisión de diseño.** El commit G (`2b70e9d4`) también llevó solo algunos hunks de la prueba (87 líneas), y el mismo `stash --keep-index` + `pop` desplazó líneas. En la versión sana (`refs/checkpoint/stash-B-rerun`), el caso «audita la creación con IDs y estado…» espera `billingCycleDay: null` **dentro de `newValue`**, que es donde lo emite el servicio. En la copia actual quedó en la raíz del evento. El resto de archivos tocados por G y C no muestra desorden.

**Encargo:**
1. Respalda la prueba actual **fuera del repo**, con SHA-256.
2. Restaura su contenido desde `refs/checkpoint/stash-B-rerun`.
3. Reaplica, copiándolos del respaldo, **solo** los dos casos nuevos de esta fase:
   - CA-CF-08 de R1, el `it('CA-CF-08: sin date usa la fecha de Bogotá a las 21:00…')`, más el puerto de zona horaria simulado si lo añadió R1;
   - la prueba de R3 de versión obsoleta en la transición.
4. Puedes aplicar Prettier al archivo. Comprueba que el diff contra la versión sana sea **solo** esas adiciones más reformateo.
5. Suite `crm/contracts` con conteo real, **178 de 178** o el conteo que resulte, con CA-CF-08 y la prueba de R3 ejecutados.

**Reglas:**
- No cambies expectativas de los casos existentes.
- No toques el servicio salvo para el formato de Prettier.
- Sin stash ni commit.
- Conserva los respaldos de R3-bis y de este paso.

Después se repite **§V3b** completo.

### §V3c — gate-verifier · suite completa por cambio de `@Module` (2026-10-31)

**Resultado de R3-ter y V3b:** lint y typecheck de API y portal en verde. Portal: 340 suites, 3.421 tests y 1 skip preexistente (DEBT-001). `crm/contracts`: 10 suites y 178 tests, con CA-CF-08 y la prueba de versión obsoleta ejecutados. `pnpm audit --prod`: 0 críticas.

**Por qué falta V3c:** esta fase cambia `ContractsModule`: importa `TenantModule`, registra `BillingCyclesController` y el puerto `ContractsTenantSettingsReadPort`. Por la norma del repo, un cambio de `@Module` exige la **suite completa** de `@iwana/api`, porque las suites focales ya ocultaron una vez un CI en rojo. Además, `contracts.service.ts` y su prueba se restauraron después de la última corrida completa (V3, 2026-10-30).

**Encargo, sin caché de turbo y con conteo real:**
1. Suite completa de `@iwana/api`, incluido `app.module.boot.spec.ts`.
2. Integraciones contra Postgres real, **sin omisiones**:
   - `contracts.service.postgres.integration.spec.ts`;
   - `contract-plan-change.postgres.integration.spec.ts`;
   - `subscriber-lifecycle.service.postgres.integration.spec.ts`;
   - la migración `167_crm_billing_cycles.integration.spec.ts` de `@iwana/db`.

   Usa `IWANA_DB_INTEGRATION_AVAILABLE=true` y un `DB_NAME` permitido.
3. Typecheck de `@iwana/shared`.

**Reglas:** solo lectura sobre el código. Un fallo se reporta con suite, caso y primer error, clasificado como D, E, F u otro, sin corregirlo.

**Con V3c en verde, AI-EM-ARCH consolida el GO de D.** El commit sigue D-CK-1: encadenado D → E → F, con la regla 4-ter del checkpoint.

## Reglas

- Ningún bloque implementa D6 (corte automático) ni toca `apps/api/src/modules/network/**`.
- Comentarios en español que citen ADR-102 en la función de corte, en la validación de `activate` y en la migración.
- Si una regla del PRD no cabe en el contrato congelado, `[BLOQUEO]` a AI-EM-ARCH antes de cerrar la sesión.
- Nadie commitea salvo AI-EM-ARCH al cierre, tras V3 en verde.
