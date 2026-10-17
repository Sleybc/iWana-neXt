# INFORME — MOD05 deuda de código · B1 suscriptores · v1.1

**Fecha:** 2026-10-17  
**Estado:** B1 completado después de S1′  
**Agente:** `sr-backend`  
**Base:** `main` en `09af7f60` más el árbol de trabajo B1/B2, preservado sin commit.  
**Contrato:** [PROMPT-MOD05-DEUDA-CODIGO-v1.0.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md) y [delta v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md).  
**Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md).

## Implementación

- Se completaron R1′, R3′ y R4′: el alta manual exige responsabilidad de IVA y del RUT; las personas jurídicas requieren NIT con DV válido y representante legal. El representante se asegura mediante `IPartyWritePort.ensurePartyWithRole(..., LEGAL_REPRESENTATIVE, ctx)` dentro de la transacción.
- La conversión desde expediente no infiere datos fiscales: deja IVA en `NULL`, RUT vacío y representante en `NULL`; guarda el DV solo cuando llega y valida su correspondencia. Una persona jurídica puede quedar como `PROSPECT` incompleta.
- `SubscriberFiscalCompletenessService` centraliza R13 y se usa al pasar a `ACTIVE` y en ambas altas de contrato. La respuesta 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` incluye `missing` sin valores fiscales.
- El detalle expone `fiscalCompleteness`; `@iwana/shared` incorpora el código de error y los tipos/esquemas asignados. La respuesta del representante sigue el mapa de ADR-067 y solo contiene `partyId` y `displayName`.
- `resolveTaxRegime` se retiró y el alta ya no escribe `tax_regime`. La entidad declara enums PostgreSQL por columna y `subscriber-enum-parity.postgres.integration.spec.ts` compara sus valores con `pg_type`.
- No se tocaron las líneas de documento fiscal de `subscriber-creation.service.ts` reservadas a B2.
- Se actualizaron los fixtures afectados por la nueva completitud. Se añadieron pruebas para la proyección del representante, el registro del módulo y la fachada de transición.

## Cobertura de `crm/subscribers`

La base medida en `main` antes de B1 fue 14 suites y 302/302 tests. El árbol final mantiene y supera sus cuatro métricas:

| Métrica    |                `main` |                Actual | Diferencia |
| ---------- | --------------------: | --------------------: | ---------: |
| Statements | 93,83 % (1.249/1.331) | 95,28 % (1.355/1.422) |   +1,45 pp |
| Branches   |     82,85 % (638/770) |     83,57 % (702/840) |   +0,72 pp |
| Functions  |     91,89 % (136/148) |     92,35 % (145/157) |   +0,46 pp |
| Lines      | 94,50 % (1.170/1.238) | 95,83 % (1.264/1.319) |   +1,33 pp |

Medición final: Jest directo, `--runInBand --no-cache --coverage`, suites `modules/crm/subscribers`; 16 suites y 312/312 tests aprobados. El aviso de umbral de Jest corresponde a `serialized-asset-useful-life.util.ts`, fuera de la cobertura filtrada.

## Evidencia

| Verificación                                             | Resultado                                                                                                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Suite completa de `@iwana/api`, Jest `--no-cache`        | 392 suites aprobadas, 4 omitidas; 5.294 tests aprobados, 15 omitidos; 0 fallos                                                           |
| Integración completa de `@iwana/api` en `iwana_it_g7_ci` | 24 suites aprobadas, 3 omitidas; 97 tests ejecutados/aprobados, 15 omitidos; 0 fallos                                                    |
| Casos de integración relevantes                          | B5 conversión; paridad de enums; alta de contratos; `privacy-erasure-api`; `backfill-fiscal-document` con filas heredadas: todos pasaron |
| Suite unitaria de `@iwana/db`, sin caché                 | 74 suites; 417/417 tests aprobados                                                                                                       |
| S1′, migración 157                                       | 10/10 tests de integración con dos schemas; evidencia en [informe B0 v1.2](INFORME-MOD05-DEUDA-B0-v1.2.md)                               |
| Typecheck API                                            | `tsc --noEmit -p tsconfig.typecheck.json`, código 0                                                                                      |
| API `/api/v1/health`                                     | HTTP 200; PostgreSQL `ok`, Redis `ok`                                                                                                    |

El health se verificó temporalmente en el puerto 3000 y el proceso de API de esta verificación se detuvo después de recibir el 200.

### Turbo solicitado

`pnpm exec turbo run test --force --continue` intentó descargar Node 24.13.1 y encontró `ENOTFOUND` al resolver `nodejs.org`. No se modificó configuración. Se ejecutó el Turbo directamente con el Node 24.13.1 instalado: `turbo run test --force --continue`, 0 tareas en caché, 8 tareas exitosas de 10, salida 1.

| Paquete         | Suites                               | Tests                                   |
| --------------- | ------------------------------------ | --------------------------------------- |
| `@iwana/api`    | 391 aprobadas, 1 fallida, 4 omitidas | 5.293 aprobados, 1 fallido, 15 omitidos |
| `@iwana/db`     | 74 aprobadas                         | 417 aprobados                           |
| `@iwana/worker` | 21 aprobadas                         | 171 aprobados                           |
| `@iwana/shared` | 20 aprobadas                         | 179 aprobados                           |
| `@iwana/ui`     | 5 aprobadas                          | 34 aprobados                            |
| `@iwana/web`    | 36 aprobadas                         | 229 aprobados                           |
| `@iwana/portal` | 300 aprobadas, 3 fallidas            | 3.035 aprobados, 1 fallido, 1 omitido   |

El fallo API en Turbo fue `purchase-order-pdf.service.spec.ts` bajo concurrencia; aislado pasó 8/8 tests en 14,1 s. Los fallos de portal están fuera de B1 y requieren B3: dos suites siguen leyendo `legalRepresentativeId` (el contrato ahora usa `legalRepresentative`) y `privacy-channel-capture.portal.spec.tsx` no invoca `onSave` con el formulario actual. No se editó web ni portal.

## Alcance e higiene

La base usada fue exclusivamente `iwana_it_g7_ci`; `tenant_test` estaba migrado hasta 157. No se migró `dbiw`, no se modificaron contratos fuera de §2.2, no se usaron PII ni claves reales y no se creó commit. La ruta de este informe se verificó libre antes de escribirlo.
