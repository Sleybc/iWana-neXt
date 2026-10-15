# Informe de ejecución — MOD05 E-3 · F2 QA E2E

| Campo       | Valor                                                                            |
| ----------- | -------------------------------------------------------------------------------- |
| Fecha       | 2026-10-15                                                                       |
| Responsable | AI-SR-QA                                                                         |
| Resultado   | **PASS de CA-E3-01 a CA-E3-04; NO-GO del criterio adicional de banner de fallo** |
| Alcance     | Playwright contra Portal y API reales, con datos sintéticos y tenant desechable. |

## Evidencia de ejecución

Comando final, ejecutado directamente con Playwright y sin interceptar solicitudes ni respuestas:

```text
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-crm-contact-pending-live.spec.ts --retries=0
```

Resultado real: **1 test, 1 aprobado, 0 fallidos, 0 omitidos**; 10,0 s de prueba y 16,4 s totales. Playwright no usa caché de Turbo. La ruta de este informe se verificó libre antes de crearlo.

El test crea un tenant con datos sintéticos y finaliza con `PATCH /tenants/:id` a `INACTIVE`; `GET /tenants/:id` confirmó ese estado. Tenant final: `srqa-mod05-e3-3dbb1e8f72a8`. No se imprimen credenciales ni secretos.

No se registraron interceptores de red. El listener de `page.on('request')` solo cuenta solicitudes para comprobar que el formulario inválido no envíe `POST /crm/subscribers`. Las llamadas al portal y a la API son reales. El SQL directo queda limitado al schema del tenant desechable para preparar la transición de conversión y el fixture legado de R5.

## A18: autorización previa a la conversión

Antes de convertir cada expediente, el seed publica por API un texto `AUTORIZACION` y registra por `POST /crm/expedientes/:id/consents` el consentimiento aceptado con canal `TELEFONO`. El contrato de expediente recibe `TRATAMIENTO_DATOS`; el mapeo vigente del backend lo traduce a `TRATAMIENTO_CONTRACTUAL`. Después de convertir, el E2E consulta `/crm/subscribers/:id/360` y verifica en `habeasData` `purpose=TRATAMIENTO_CONTRACTUAL`, `granted=true` y `channel=TELEFONO`.

## Criterios CA-E3

| Criterio                                                                           | Resultado | Evidencia                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CA-E3-01 — «Contacto pendiente» aparece si y solo si `contactPending` es verdadero | **PASS**  | La conversión sin canal principal muestra la etiqueta; tras guardar un correo, la API informa `contactPending=false` y la etiqueta desaparece.                                                                                                       |
| CA-E3-02 — el alta exige teléfono o correo                                         | **PASS**  | Se envía el formulario sin ambos campos; aparecen los dos errores requeridos y el observador no detecta `POST /crm/subscribers`.                                                                                                                     |
| CA-E3-03 — los dos 422 muestran texto y acción                                     | **PASS**  | R4 devuelve `SUBSCRIBER_CONTACT_REQUIRED`, muestra el mensaje y «Agregar contacto». En un expediente sintético completo con suscriptor sin canales, R5 devuelve `EXPEDIENTE_SUBSCRIBER_CONTACT_REQUIRED`, muestra su mensaje y el enlace a la ficha. |
| CA-E3-04 — sin placeholders ni enums crudos                                        | **PASS**  | Se revisa el texto visible en las pantallas del flujo contra los placeholders de correo/teléfono y los códigos/estados crudos definidos por el test.                                                                                                 |

El rechazo R5 conserva el expediente en `LISTO_PARA_INSTALACION`, no `CLIENTE_ACTIVO`. Tras agregar contacto en la ficha, la activación del suscriptor responde 200; el fixture R5 también permite activar el expediente después de resolver el contacto.

## Criterio adicional: banner cuando la conversión falla

El test contiene una aserción condicional: si `retry-conversion` queda sin resolver, lee el código no personal del fallo pendiente, navega a la ficha y exige una alerta visible con motivo legible que no exponga el código crudo. En la corrida aprobada, la conversión se resolvió; la condición **no se activó** y el banner de fallo no queda validado.

La inspección de la UI vigente confirma que `ExpedienteConversionBanner` solo se renderiza para estados convertidos (`INSTALACION_AGENDADA` y `CLIENTE_ACTIVO`) y muestra copy de éxito. No se encontró una superficie que presente el fallo de conversión y su motivo en la ficha. Por el límite test-only de F2, ese gap no se corrige aquí: el criterio adicional queda **NO-GO**, separado del PASS de CA-E3-01 a CA-E3-04.

## Verificaciones locales

- `pnpm exec prettier --check e2e/tests/portal-crm-contact-pending-live.spec.ts`: **PASS**.
- `git diff --check` / inspección de whitespace del spec: **sin diagnósticos**.
- No se modificó código de producción ni se hizo commit.
