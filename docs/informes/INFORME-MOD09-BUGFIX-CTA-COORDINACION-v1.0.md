# Informe — MOD09 bugfix CTA de coordinación CRM

**Versión:** 1.0  
**Estado:** Validado localmente  
**Fecha:** 2026-07-27  
**Trazabilidad:** `docs/specs/2026-07-27-crm-coordinacion-visita-cta-design.md` · `docs/plans/2026-07-27-crm-coordinacion-visita-cta.md` · `docs/plans/2026-07-27-crm-wfm-coordinate-normalization.md` · PRD MOD09 (CU-WFM-08, CA-WFM-21)

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

## Límites y deuda registrada

- No se cambiaron contratos HTTP, OpenAPI, modelo de datos ni migraciones.
- El rol `SALES` sigue sin autorización en el endpoint de Aseguramiento que crea o recupera el ticket de instalación. WFM permite el origen CRM, pero esa alineación de permisos no fue incluida en este corte.
