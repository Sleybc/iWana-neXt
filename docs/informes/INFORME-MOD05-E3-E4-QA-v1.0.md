# Informe de ejecución — MOD05 E-3 · E4-A QA E2E

**Fecha:** 2026-10-15  
**Responsable:** AI-SR-QA  
**Resultado:** **BLOQUEADO — E4-A no aprobado**  
**Alcance:** Playwright contra Portal y API reales, con datos sintéticos y tenant desechable.

## Resultado

Se implementó el E2E en [portal-crm-contact-pending-live.spec.ts](../../e2e/tests/portal-crm-contact-pending-live.spec.ts). No usa `page.route` ni intercepta respuestas: crea tenant y expediente mediante HTTP real, usa la base de datos solo dentro del schema aleatorio de ese tenant para preparar el evento legado y conduce el Portal con Chromium. Las direcciones de correo usan `example.invalid` y las contraseñas se leen del entorno; no se escribieron secretos en el informe.

La última corrida alcanzó el endpoint real `POST /crm/expedientes/:id/retry-conversion`, que respondió `retried: true, resolved: true`. El bootstrap siguió sin suscriptor durante 20 segundos. La consulta Postgres `READ ONLY`, limitada al schema de ese tenant, confirmó 1 expediente en `LISTO_PARA_INSTALACION`, 1 fallo de conversión marcado resuelto y 0 suscriptores vinculados. Por tanto, el test no pudo entrar a la ficha del suscriptor y no ejercitó las aserciones de interfaz.

El proceso local de API y el proceso local de Worker estaban activos. El código vigente emite `crm.expediente.ready-for-installation` por EventEmitter dentro de la API; no hay una cola BullMQ de conversión CRM. La inspección Redis de solo lectura de `tenant-provisioning` devolvió `wait=0`, `active=0`, `paused=0`, `delayed=0`, `prioritized=0`, `failed=0`, `completed=5`. No había una sesión de terminal de API adjunta para consultar su log. La causa de que el evento resuelto no deje un suscriptor no queda determinada por esta evidencia.

La API compilada contiene el proveedor `SubscriberCreationService` y el listener del evento; sus archivos `dist` se escribieron inmediatamente antes del inicio del proceso API observado, así que un `dist` antiguo parece poco probable. El Portal usa un servidor de desarrollo compartido; el test no llegó a navegar la ficha ni a validar sus componentes, por lo que no afirmo que el flujo UI se haya ejecutado.

## Evidencia Playwright

Comando final:

```text
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-contact-pending-live.spec.ts --retries=0
```

| Corrida  | Resultado observado                                                                                             | Tenant creado / teardown                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1        | 1 test fallido antes de crear tenant: URL API con respuesta 404.                                                | No se creó tenant.                                                                                               |
| 2        | 1 test fallido al iniciar sesión en Portal: el usuario temporal fue enviado a cambiar contraseña.               | `srqa-mod05-e3-665ac6df9410` — `INACTIVE`, confirmado por GET en `afterAll`.                                     |
| 3        | 1 test fallido durante el seed: referencia `shortId` no definida.                                               | `srqa-mod05-e3-974fcd0819b5` — `INACTIVE`, confirmado por GET en `afterAll`.                                     |
| 4        | 1 test fallido durante el seed: HTTP 400 al actualizar viabilidad técnica.                                      | `srqa-mod05-e3-6d8f56c08ec1` — `INACTIVE`, confirmado por GET en `afterAll`.                                     |
| 5, final | 1 test descubierto; 0 aprobados, 1 fallido, 0 omitidos. Tiempo total 29.5 s; el timeout de conversión fue 20 s. | `srqa-mod05-e3-8fd22bc0b2c0` — `INACTIVE`, confirmado por GET en `afterAll` y por consulta Postgres `READ ONLY`. |

Los cuatro tenants creados durante los intentos terminaron `INACTIVE`; no se eliminó ningún schema. Playwright se ejecutó directamente, sin Turbo; no hay cache hit involucrado.

## CA-E3-01 a CA-E3-04

| Criterio                                                                 | Estado        | Evidencia                                                                 |
| ------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------- |
| CA-E3-01 — estado «Contacto pendiente» y su retiro tras guardar contacto | No ejecutado  | La conversión no produjo suscriptor.                                      |
| CA-E3-02 — alta nueva sin teléfono ni correo                             | No ejecutado  | El formulario se prueba después del seed/conversión en el test.           |
| CA-E3-03 — rechazo R4/R5, mensajes y acciones                            | No ejecutado  | No se alcanzó la ficha del suscriptor ni la transición.                   |
| CA-E3-04 — ausencia de placeholders y enums crudos                       | No verificado | Las aserciones están implementadas, pero el fallo ocurrió antes de ellas. |

El test implementa dos estados intencionalmente separados. El primero prepara un expediente sin contacto principal y solicita su conversión por API real; en la corrida observada el suscriptor no llegó a crearse. Si se completa esa conversión, el validador de completitud del pipeline puede devolver `INVALID_STATUS_TRANSITION` antes de R5. El segundo es un fixture legado distinto con el expediente completo y el contacto del suscriptor nulo, preparado únicamente en el schema sintético, para alcanzar el 422 R5 sin presentar esa secuencia como la conversión sin contacto. Ninguna de esas aserciones llegó a ejecutarse en la corrida bloqueada.

## Verificaciones locales y ruta

- La ruta `docs/informes/INFORME-MOD05-E3-E4-QA-v1.0.md` estaba libre antes de crear este informe.
- `pnpm exec prettier --check e2e/tests/portal-crm-contact-pending-live.spec.ts docs/informes/INFORME-MOD05-E3-E4-QA-v1.0.md`: correcto.
- `git diff --check` sobre el test y el informe: correcto.
- Suite final: 1 test, 0 aprobados, 1 fallido. No se declara pase funcional ni cobertura de CA.

## Archivos E4-A

- `e2e/tests/portal-crm-contact-pending-live.spec.ts`
- `docs/informes/INFORME-MOD05-E3-E4-QA-v1.0.md`
