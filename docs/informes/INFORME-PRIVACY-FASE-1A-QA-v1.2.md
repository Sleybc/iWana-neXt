# INFORME — Privacy Fase 1a · QA R4b

**Versión:** 1.2  
**Fecha:** 2026-10-14  
**Responsable:** AI-SR-QA  
**Estado:** COMPLETO — 3/3 E2E reales aprobados; prueba PostgreSQL de atomicidad aprobada.

## Resultado

R5 está presente en el árbol: `sanitizeResponse()` añade `partyId` al suscriptor de la respuesta 360°. La proyección pública mantiene el campo dentro de `subscriber`; el portal lo usa para vincular Cumplimiento y no lo muestra. La evidencia de implementación y sus pruebas está en `INFORME-PRIVACY-FASE-1A-R5-v1.0.md`.

Se repitió `portal-privacy-live.spec.ts` contra el portal y la API reales, sin interceptores HTTP, sobre el tenant sintético. Los tres recorridos pasan. Se agregaron aserciones para comprobar que el `partyId` y el identificador del contrato no se muestran en pantalla. Una primera corrida encontró dos selectores demasiado estrictos; se ajustaron las aserciones de prueba a la estructura real del texto y la corrida final quedó 3/3.

Se añadió una integración PostgreSQL que provoca un error en el evento final de `complete`, después de ejecutar el cambio de estado y de insertar `RECLAMO_EN_TRAMITE`. La prueba confirma el rollback de ambos: la solicitud permanece `RADICADA` y no queda una marca abierta. Esto verifica que la leyenda se abre dentro de la misma transacción de `complete`.

## Verificación

| Comando                                                                                                                                                                                                                | Resultado                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec playwright test -c e2e/playwright.portal.config.ts e2e/tests/portal-privacy-live.spec.ts --reporter=list`                                                                                                   | Portal/API reales; 3 pruebas aprobadas de 3, 0 fallidas. Incluye consulta completa, conversión y medio en la ficha 360°, y suplantación desde la ficha con contrato sintético suspendido. No usa `page.route()` ni mocks HTTP. |
| `$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --no-cache src/modules/privacy/requests/requests.service.postgres.integration.spec.ts` | PostgreSQL en `127.0.0.1:5433/dbiw`; 1 suite aprobada, 13 tests aprobados, 0 omitidos. Incluye la prueba de atomicidad de la leyenda. Schema efímero creado y eliminado por la suite.                                          |
| `pnpm exec prettier --check apps/api/src/modules/privacy/requests/requests.service.postgres.integration.spec.ts e2e/tests/portal-privacy-live.spec.ts`                                                                 | Sin diferencias de formato tras aplicar Prettier a los dos archivos de prueba.                                                                                                                                                 |

Las corridas son directas, sin Turbo; por tanto, no hubo `cache hit`. No se usó `--passWithNoTests`. El tenant de pruebas se dejó temporalmente activo solo para la última corrida y luego se marcó `INACTIVE` en `public.tenants`. La consulta de confirmación verificó el estado final `INACTIVE` y el nombre sintético esperado. No se eliminó el schema. No se incluyen slugs, usuarios ni credenciales en este informe.

## Matriz CA ↔ test — deltas de R4b y A26

Las filas que no aparecen mantienen la evidencia y el estado del informe QA v1.1. Estas actualizaciones cubren los criterios afectados por la corrección de `partyId` y por la nueva corrida real.

| CA  | Test y evidencia actualizada                                                                                                                                                                                       | Estado                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 08  | Los E2E consultan el `partyId` de la respuesta real y comprueban que no aparece en la ficha 360°.                                                                                                                  | Directo (live)             |
| 11  | La suplantación se radica desde Cumplimiento de la ficha vinculada; no se solicita un UUID ni se vuelve a seleccionar la persona.                                                                                  | Directo (live)             |
| 18  | La confirmación muestra la cantidad de contratos suspendidos y el ID del contrato sintético no aparece en pantalla. La corrida live usa un contrato; el rango de 1 a 20 no queda completamente ejercitado en vivo. | Parcial (live)             |
| 27  | La autorización y la acción de solicitud están disponibles dentro de Cumplimiento de la ficha 360°.                                                                                                                | Directo (live)             |
| 46  | Los tres E2E usan datos sintéticos y correos `example.invalid`; no usan clientes reales.                                                                                                                           | Directo (live)             |
| 47  | CONSULTA: radicar, verificar identidad, completar y resolver contra los endpoints reales.                                                                                                                          | Directo (live)             |
| 48  | SUPLANTACIÓN: inicia desde ficha 360°, conserva el titular vinculado, selecciona un contrato de la lista y confirma la suspensión mediante la respuesta real.                                                      | Directo (live; 1 contrato) |
| 50  | Captura `TELEFONO` en el expediente, convierte y muestra «Medio: Teléfono» en Cumplimiento de la ficha 360°.                                                                                                       | Directo (live)             |

## Plazos y atomicidad

| Regla                                | Evidencia                                                                                                                                 | Resultado                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leyenda de reclamo al completar      | `requests.service.postgres.integration.spec.ts`: falla forzada al registrar el evento posterior; se comprueba rollback de estado y marca. | Cubierta la atomicidad de `complete`. El contrato no guarda un vencimiento independiente; el máximo de dos días se cumple por construcción al abrirse en `complete`. |
| Traslado: máximo de dos días hábiles | El modelo actual no expone una fecha de vencimiento de traslado.                                                                          | Deuda P2 para Fase 1b, conforme a A26.                                                                                                                               |

## Deuda por severidad

- **P1:** cerrado para R4b. Los tres E2E reales pasan con la respuesta A26.
- **P2:** la corrida live prueba un contrato impugnado, no el extremo de veinte contratos; queda pendiente la cobertura live de selección múltiple.
- **P2:** el vencimiento independiente del traslado permanece diferido a Fase 1b, como define A26.
- No se detectó deuda nueva de producción en este bloque; solo se editaron pruebas y este informe.

## Archivos del bloque

- `apps/api/src/modules/privacy/requests/requests.service.postgres.integration.spec.ts`
- `e2e/tests/portal-privacy-live.spec.ts`
- `docs/informes/INFORME-PRIVACY-FASE-1A-QA-v1.2.md`

La ruta del informe estaba libre antes de crearla.
