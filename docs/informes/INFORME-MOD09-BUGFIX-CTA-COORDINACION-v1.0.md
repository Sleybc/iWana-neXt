# Informe — MOD09 bugfix CTA de coordinación CRM

**Versión:** 1.3  
**Estado:** Validado localmente  
**Fecha:** 2026-08-06  
**Trazabilidad:** `docs/specs/2026-07-27-crm-coordinacion-visita-cta-design.md` · `docs/specs/2026-08-04-mod09-antiduplicacion-visitas-ux-spec.md` · `docs/adrs/ADR-076-Unicidad-Trabajo-Campo-Activo-Por-Origen.md` · `docs/plans/2026-07-27-crm-coordinacion-visita-cta.md` · `docs/plans/2026-07-27-crm-wfm-coordinate-normalization.md` · PRD MOD09 (CU-WFM-08, CA-WFM-21)

---

## Resultado

Los CTA `Coordinar visita de instalación` del detalle CRM ahora crean o reutilizan la solicitud de visita originada en CRM y abren la agenda de Operaciones de campo con la solicitud seleccionada. Ya no navegan a la ancla local `#programacion`.

## Causa raíz

Los CTA invocaban `buildSchedulingHref`, que devolvía la misma URL del expediente con el fragmento `#programacion`. La creación idempotente del ticket y la solicitud WFM solo estaba disponible en una acción secundaria distinta (`Agendar ahora`), por lo que el CTA principal no emitía ninguna solicitud.

## Implementación

- Se centralizó la acción de crear y enrutar la solicitud CRM en `useCrmVisitRequestAction`.
- La página de expediente y la sección de coordinación reutilizan esa acción; así comparten la construcción del contexto, el bloqueo contra dobles envíos, el manejo de errores y la navegación.
- Los dos CTA visibles quedan deshabilitados y con estado de carga durante el envío o cuando el expediente aún no está habilitado.
- El feedback operativo de la página ahora usa `PortalAlert`, con región accesible para los mensajes de estado y error.
- Se retiró el helper de ancla y su prueba asociada.

## Corrección de contrato CRM → WFM

En una validación real posterior, WFM respondió `400` cuando el expediente incluía coordenadas. Las columnas CRM son `numeric`; PostgreSQL puede serializarlas como texto decimal, aunque la interfaz del portal las declare `number`. El endpoint WFM exige números para ambos campos, por lo que reenviar valores como `"4.7110000"` y `"-74.0721000"` incumplía su DTO.

- `createCrmVisitRequestAndRoute` normaliza ambas coordenadas en el límite CRM → WFM mediante `parseOptionalCoordinate`, el helper ya usado por la bandeja WFM.
- Solo se envía el par cuando ambos valores son normalizables y respetan los rangos WFM (latitud `-90..90`, longitud `-180..180`); de lo contrario se envían ambos como `null`, que es válido para crear una solicitud que requiere completar contexto.
- No se relajó el contrato ni la validación del API WFM.

## Cobertura añadida

- Unitario de detalle CRM: CTA → solicitud con contexto, coordenadas y URL de agenda.
- Unitario de detalle CRM: expediente no elegible deshabilita la acción.
- Unitario de detalle CRM: dos CTA no producen dos solicitudes durante un envío pendiente.
- Unitario de sección CRM: `Enviar a pendientes` mantiene su ruta y semántica.
- E2E portal: detalle CRM → ticket de instalación → solicitud WFM → agenda con `visitRequestId`.
- Unitario de orquestación: coordenadas `numeric` serializadas como texto llegan al cliente WFM como números.
- Unitario de orquestación: una coordenada no normalizable omite el par completo en lugar de enviar un payload inválido.
- Unitario de orquestación: coordenadas fuera de rango omiten el par completo antes del POST.
- E2E portal: fixture CRM con coordenadas `numeric` serializadas como texto verifica que el POST WFM contiene números normalizados.

## Evidencia ejecutada

| Verificación | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal test -- --runInBand "crm/expedientes/.*/page.spec.tsx" src/components/crm/expedientes/expediente-scheduling.spec.ts src/components/crm/expedientes/ExpedienteSchedulingActions.spec.tsx src/components/scheduling/visit-request-origin-orchestration.spec.ts` | 4 suites, 18 pruebas en verde |
| `pnpm test:e2e:portal -- portal-crm-expedientes.spec.ts -g "coordina una instalación desde el detalle CRM"` | 1 prueba E2E en verde |
| `pnpm --filter @iwana/portal typecheck` | Verde |
| `pnpm --filter @iwana/portal lint` | Exit 0; 41 advertencias existentes, sin errores |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs "apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx"` | Sin hallazgos P0/P1/P2 nuevos; un P3 existente de spinner de carga primaria |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/visit-request-origin-orchestration.spec.ts "crm/expedientes/.*/page.spec.tsx"` | 2 suites, 16 pruebas en verde; cubre strings PostgreSQL, inválidas y fuera de rango |
| `pnpm test:e2e:portal -- portal-crm-expedientes.spec.ts -g "coordina una instalación desde el detalle CRM"` | 1 prueba E2E en verde; verifica POST CRM con coordenadas numéricas normalizadas |

## Corrección 409 DUPLICATE_ACTIVE_WORK (2026-08-06)

Al repetir «Agendar ahora» / «Coordinar visita de instalación» sobre un expediente con solicitud CRM/INSTALLATION activa, el API respondía `409` con `DUPLICATE_ACTIVE_WORK` + `activeVisitRequestId` (guarda ADR-076). El portal no consumía ese contrato y mostraba «Error del servidor».

- `createCrmVisitRequestAndRoute` (y Assurance/Tasks por el mismo helper) parsean el 409 y reutilizan la visita existente: navegan a agenda o bandeja según `nextAction`.
- Cubierto en unitarios de orquestación (cuerpo plano Nest y envelope `{ message }`).
- Deuda no bloqueante: tarjeta preventiva E1 en el detalle CRM, tests 409 Assurance/Tasks y E2E del segundo clic.

## Endurecimiento FE anti-409 (2026-08-06, corte 2)

Hipótesis: `error instanceof ApiError` fallaba bajo Turbopack/HMR (clases duplicadas), el parser devolvía `null` y el 409 seguía propagándose a la UI.

- Parser con duck-typing (`status === 409` + `name === 'ApiError'` o shape con `details`/`message`), sin `instanceof`.
- Extracción tolerante de `DUPLICATE_ACTIVE_WORK` / `activeVisitRequestId` en `details`, `message` anidado, `data` o `body`.
- `createCrmVisitRequestAndRoute` lista visitas CRM/INSTALLATION **antes del POST**, filtra por `originRef`/`expedienteId` excluyendo terminales (`SCHEDULED`/`CANCELLED`/`REJECTED`/`EXPIRED`) y reutiliza la más reciente; si el list falla, cae al POST + manejo 409.
- Unitarios: reuso vía list, terminales ignorados, fallback si list falla, y 409 con objeto no-`instanceof`.

## Contrato GET pre-búsqueda por origen (backend, 2026-08-06)

`GET /wfm/visit-requests` acepta filtros opcionales alineados a ADR-076 (antes el FE podía enviarlos pero el whitelist del ValidationPipe los descartaba):

| Query | Semántica |
| --- | --- |
| `originRef` | Exacto tras `trim` sobre `origin_ref` |
| `expedienteId` | UUID exacto sobre `expediente_id` |
| Combina con | `originContext`, `workType`, `status`, paginación |

- Roles del listado: `ADMIN`, `NOC`, `SUPPORT`, **`SALES`** (SALES forzado a orígenes CRM).
- El `409 DUPLICATE_ACTIVE_WORK` del POST create se conserva.
- Tests API: `visit-requests.service.spec.ts` + `visit-requests.controller.http.spec.ts` (73 verdes).

## Corte C-A E1 + guarda ADR-076 D2 (2026-08-06)

Tras agendar, el CTA seguía permitiendo crear otra instalación porque solo miraba `LISTO_PARA_INSTALACION` y trataba `SCHEDULED` como “libre”.

- **FE:** `resolveCrmInstallationFieldWork` combina VR + `schedule_events`; tarjeta E1 en `ExpedienteSchedulingActions` y CTAs «Ver la visita…» en el detalle; «Coordinar otra visita» exige motivo + `isAdditional`.
- **BE:** `createVisitRequest` consulta trabajo agendado activo (VR `SCHEDULED` + evento no terminal, o evento CRM por expediente) y responde `409 DUPLICATE_ACTIVE_WORK` salvo `isAdditional`.
- **Sync:** transición a `INSTALACION_AGENDADA` ya no exige `workOrderId` (el CTA E1 no depende de este sync).
- `EXPIRED` se trata como estado terminal de evento en portal (alineado a la guarda BE).

## Límites y deuda registrada

- Índice único parcial D2.3 sobre `schedule_events`: fuera de este corte (ADR-076 diferido).
- Cortes UX C-B / C-C (bandeja, filtros, trabajos relacionados) pendientes.
- E1 en Assurance/Tasks: mismo patrón, otra superficie.
- El rol `SALES` sigue sin autorización en el endpoint de Aseguramiento que crea o recupera el ticket de instalación.
