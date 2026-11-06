# INFORME — MOD14 Facturación · Corrección RS-10 a RS-12

**Versión:** v1.0  
**Fecha:** 2026-11-04  
**Estado:** Evidencia entregada a AI-EM-ARCH; G2 no aprobado  
**Alcance:** B1b-R y D1-R12, sin commit

## Referencias

- [Plan de orquestación](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md)
- [Prompt v1.1](../prompts/PROMPT-MOD14-FACTURACION-FASE-01-v1.1.md)
- [HLD v1.1](../hlds/HLD-MOD14-FACTURACION-v1.1.md), §§3.1, 4, 5 y 6.5
- Enmiendas RS-10, RS-11 y RS-12 del HLD

## Cambios entregados

- La vista previa de política usa `POST /billing/policy/preview`, calcula tres fechas para cada ciclo y acepta una propuesta sin guardarla. Aplica la política del tenant, la sobrescritura del contrato y los valores propuestos; responde 422 ante una combinación incompatible y 404 si el contrato no existe o fue anonimizado. La lectura del ciclo no devuelve datos personales.
- `resolveGenerationTarget` y `BILLING_TERMINATED_LOOKBACK_DAYS = 62` resuelven el periodo más reciente generable. El adaptador CRM aplica la ventana de candidatos y cubre terminaciones dentro y fuera de ella.
- `unbilledAdditionalCount` sustituye `additionalItems`: el adaptador suma `additional_product_ids` y `additional_service_ids`; la respuesta compartida expone el conteo.
- La migración 173 agrega `unbilled_additional_count smallint NOT NULL DEFAULT 0` con el check nombrado `chk_billing_documents_unbilled_additional_count_non_negative`. La entidad y la integración de migración comprueban la columna, su valor inicial y el rechazo de un negativo.
- El fixture de `subscriber-lifecycle` usa `TRUNCATE ... CASCADE` por las claves foráneas de Billing; sus aserciones de comportamiento no cambian.

## Revisiones

| Revisión                  | Resultado                                                                                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `boundary-reviewer`       | Sin hallazgos de Modulith o tenancy. No encontró `forwardRef` nuevo ni llamadas de logging en los archivos revisados.                                                                          |
| `contract-drift-reviewer` | Sin deriva entre shared, el productor y OpenAPI para RS-10 a RS-12. Observó dos menciones anteriores al preview en HLD §4, supersedidas explícitamente por RS-10.                              |
| `test-change-reviewer`    | Ajustes justificados; no detectó aserciones debilitadas, pruebas borradas ni `skip` nuevos. Los archivos de prueba sin seguimiento al inicio no permiten reconstruir un diff literal anterior. |

## Evidencia de verificación

| Comando / paquete                                                                                                           | Resultado                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api typecheck`                                                                                        | Exit 0                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm --filter @iwana/db typecheck`                                                                                         | Exit 0                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm --filter @iwana/shared typecheck`                                                                                     | Exit 0                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm --filter @iwana/api lint`                                                                                             | Exit 0; 7 warnings                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @iwana/db lint`                                                                                              | Exit 0; 5 warnings                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm --filter @iwana/shared lint`                                                                                          | Exit 0; sin warnings                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm --filter @iwana/api exec jest --no-cache --runInBand`                                                                 | Exit 1; 449/450 suites pasaron y 6.048/6.050 tests pasaron. Fallaron `permite ACTIVE → SUSPENDED con motivo` y `permite PROSPECT → ACTIVE sin motivo y conserva un audit diff sin PII`, ambos en `subscriber-status-transition.service.spec.ts`. Esperan el campo `reason`; la implementación concurrente actual audita `reasonProvided`. Fuera del alcance B1b-R/D1-R12. |
| `pnpm --filter @iwana/db exec jest --no-cache --runInBand`                                                                  | Exit 0; 78/78 suites y 426/426 tests pasaron.                                                                                                                                                                                                                                                                                                                             |
| API integración, `CI=true`, `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --no-cache --runInBand` | 62 suites y 380 tests omitidos; 0 ejecutados. El runner reportó PostgreSQL no disponible.                                                                                                                                                                                                                                                                                 |
| DB integración, `CI=true`, `pnpm --filter @iwana/db exec jest --config jest.integration.config.js --no-cache --runInBand`   | 52 suites y 151 tests omitidos; 0 ejecutados.                                                                                                                                                                                                                                                                                                                             |
| Integraciones 173–175, `CI=true`                                                                                            | 3 suites y 4 tests omitidos; los specs aparecen en `--listTests`, pero PostgreSQL no fue alcanzable.                                                                                                                                                                                                                                                                      |

En el proceso faltaban `DB_*`, claves JWT/PII/MFA e `IWANA_DB_INTEGRATION_AVAILABLE`. La sonda no alcanzó PostgreSQL en `localhost:5432/iwana`. No se conectó a la base de desarrollo ni se habilitó artificialmente la bandera de integración. Las integraciones finalizaron con exit 0 por la configuración del runner, pero no aportan evidencia de ejecución.

El implementador observó además una expectativa fallida en `crm-titular-erasure.participant.spec.ts`; no se reprodujo en la corrida fresh del gate y no se clasifica como flaky.

## Estado del gate

La revisión de contrato, boundaries, lint y typecheck no reportó bloqueos. La suite unitaria API tiene dos pruebas fallidas y las integraciones PostgreSQL requeridas no se ejecutaron. El gate-verifier entrega esta evidencia a AI-EM-ARCH y **no aprueba G2**. No se ejecutó cobertura; pertenece a G6.
