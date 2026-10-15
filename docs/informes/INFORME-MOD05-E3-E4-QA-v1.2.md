# Informe MOD05 E-3 · G3 QA E2E

| Campo       | Valor                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Fecha       | 2026-10-15                                                                     |
| Responsable | AI-SR-QA                                                                       |
| Resultado   | **PASS** — R8 y CA-E3-01 a CA-E3-04 verificados contra Portal y API reales.    |
| Alcance     | E2E Playwright sin interceptores, con datos sintéticos en tenants desechables. |

## Evidencia final

Comando ejecutado desde la raíz del repositorio:

```text
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-conversion-failure-live.spec.ts e2e/tests/portal-crm-contact-pending-live.spec.ts --retries=0
```

Resultado real: **2 tests aprobados, 0 fallidos, 0 omitidos**, en 24,4 s. El comando ejecuta Playwright directamente, sin caché de Turbo. El test de contacto pendiente tomó 9,5 s y el de fallo de conversión 3,8 s.

Los dos servicios respondieron durante la ejecución: `http://127.0.0.1:3000/api/v1/health` devolvió HTTP 200 y `http://127.0.0.1:3002/auth/login` devolvió HTTP 200. Las aserciones y mutaciones de producto se hicieron por HTTP real. No se configuraron interceptores Playwright. La única escritura directa a PostgreSQL quedó limitada al schema sintético del tenant G3: se sembró el fallo pendiente después de comprobar el rechazo R8.

## Escenarios verificados

| Escenario             | Resultado y evidencia                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R8 sin consentimiento | **PASS.** La transición real a «Listo para instalación» respondió 422 `EXPEDIENTE_DATA_AUTHORIZATION_REQUIRED`, mostró el texto exacto «Para pasar a Listo para instalación, registra la autorización de tratamiento de datos en Consentimientos.» y el expediente conservó su estado anterior.                                                                                                                                |
| Fallo y reintento     | **PASS.** Se sembró `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED` en `crm_conversion_failures` del schema sintético. El Portal mostró el texto exacto acordado y «Reintentar conversión», sin mostrar el código ni el nombre del evento. Tras registrar el consentimiento por API y reintentar desde el Portal, el API respondió `resolved: true`, el bootstrap devolvió `conversionFailure: null` y había un suscriptor vinculado. |
| CA-E3-01              | **PASS.** «Contacto pendiente» apareció cuando `contactPending` era verdadero y desapareció tras agregar correo.                                                                                                                                                                                                                                                                                                               |
| CA-E3-02              | **PASS.** El formulario sin teléfono ni correo mostró los dos errores requeridos y no envió el POST de alta.                                                                                                                                                                                                                                                                                                                   |
| CA-E3-03              | **PASS.** Los 422 R4 y R5 mostraron sus textos y acciones correspondientes.                                                                                                                                                                                                                                                                                                                                                    |
| CA-E3-04              | **PASS.** Las pantallas comprobadas no mostraron placeholders de contacto ni enums/códigos crudos.                                                                                                                                                                                                                                                                                                                             |

## Tenants desechables

Los dos tenants del comando final quedaron `INACTIVE`. Cada estado se confirmó con `PATCH /tenants/:id` seguido de `GET /tenants/:id`; el `afterAll` también registró la confirmación:

- `srqa-mod05-e3-6e76254d5f02` — `INACTIVE` confirmado.
- `srqa-mod05-g3-36e50bd80494` — `INACTIVE` confirmado.

Durante el ajuste hubo una corrida preliminar del nuevo test que falló porque el selector genérico `role=alert` encontró vacío el anunciador de ruta de Next. El selector se cambió al texto visible exacto y se corrigió el polling para consultar un bootstrap nuevo en cada intento. El tenant de esa corrida también terminó `INACTIVE`; la corrida final indicada arriba se ejecutó después de esos cambios.

## Verificaciones de cierre

- `pnpm exec prettier --check e2e/tests/portal-crm-contact-pending-live.spec.ts e2e/tests/portal-crm-conversion-failure-live.spec.ts`: **PASS**.
- `git diff --check`: **PASS**, sin diagnósticos.
- La ruta de este informe se comprobó libre antes de crearlo (`Test-Path` devolvió `False`).
- Sin cambios de producción y sin commit.
