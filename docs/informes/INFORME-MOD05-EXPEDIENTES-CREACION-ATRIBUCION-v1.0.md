# INFORME-MOD05-EXPEDIENTES-CREACION-ATRIBUCION-v1.0

## Estado

- Estado: Cerrado
- Version: v1.0
- Fecha: 2026-08-23
- Modulo: MOD05 CRM / Expedientes

## Objetivo

Corregir el fallo que impedía completar el alta de una oportunidad cuando se seleccionaba un asesor de origen.

## Hallazgo

`request()` desempaqueta por defecto la envoltura `data` de las respuestas HTTP. El endpoint `POST /crm/expedientes` devuelve `{ data: expediente }`, por lo que `crmApi.createExpediente()` entrega un `ExpedienteRecord` plano al componente. `ExpedientesLandingClient` intentaba leer `created.data.id`, provocando el acceso a `id` sobre `undefined` antes de crear la atribucion.

## Correccion

| Archivo                                                                        | Cambio                                                                                                           |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `apps/portal/src/lib/api-client.ts`                                            | `crmApi.createExpediente()` ahora declara y devuelve `ExpedienteRecord`, alineado con el desempaquetado central. |
| `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.tsx`      | La atribucion inicial y el estado de advertencia usan `created.id`.                                              |
| `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.spec.tsx` | Los mocks de creacion usan la respuesta plana real y cubren atribucion exitosa y fallo parcial.                  |

No se modifico el backend: su contrato `{ data }` sigue siendo valido y el desempaquetado pertenece al cliente HTTP compartido.

## Evidencia

- Suite dirigida: `pnpm.cmd --filter @iwana/portal exec jest --runInBand src/components/crm/expedientes/ExpedientesLandingClient.spec.tsx`
- Resultado: 1 suite pasada, 9 pruebas pasadas.
- Typecheck portal: `pnpm.cmd --filter @iwana/portal typecheck`, pasado.
- Lint portal: pasado sin errores; persisten 48 warnings preexistentes del paquete.
- Los warnings de React `act(...)` observados en la suite son preexistentes y no afectan el resultado.

## Riesgos y pendientes

- Conviene abordar los warnings `act(...)` en una iteracion separada para no mezclar limpieza de pruebas con la correccion funcional.
- No se ejecutaron pruebas E2E ni una validacion manual contra API real en esta correccion puntual.
