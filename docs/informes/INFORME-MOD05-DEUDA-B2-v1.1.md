# INFORME — MOD05 deuda de código · B2 documento fiscal · v1.1

**Fecha:** 2026-10-17  
**Estado:** evidencia de integración completada  
**Agente:** `sr-backend`  
**Base:** `main` en `09af7f60` más el árbol de trabajo B1/B2, preservado sin commit.  
**Contrato:** [PROMPT-MOD05-DEUDA-CODIGO-v1.0.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md) y [delta v1.1, §2.3 y §3](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md).  
**Evidencia B1 y Turbo:** [informe B1 v1.1](INFORME-MOD05-DEUDA-B1-v1.1.md).

## Resultado

Se cerró la evidencia pendiente de R5–R8 contra PostgreSQL y Redis locales. La integración validó cifrado/lectura fiscal, filas heredadas del backfill, contratos y supresión. La integración expande la verificación de residuales para incluir los campos fiscales cifrados/HMAC.

La prueba de privacidad reveló que el borrado CRM debía respetar el CHECK histórico de `subscribers` y que `party.document_type` usa un enum no anulable. Dentro de B2 se ajustaron los marcadores de anonimización para satisfacer esos invariantes sin conservar identificadores; el tipo neutro de Party es un valor permitido por su enum. La integración ampliada pasó.

## Evidencia

| Verificación                                                                    | Resultado                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Integración completa de `@iwana/api`, `iwana_it_g7_ci` + Redis `127.0.0.1:6380` | 24 suites aprobadas, 3 omitidas; 97 tests ejecutados/aprobados, 15 omitidos; 0 fallos |
| `privacy-erasure-api.postgres.integration.spec.ts`                              | Aprobada; se probó la supresión CRM ampliada                                          |
| `backfill-fiscal-document.postgres.integration.spec.ts`                         | Aprobada; incluye filas heredadas sembradas en schema de prueba                       |
| `contracts.service.postgres.integration.spec.ts`                                | Aprobada                                                                              |
| Suite completa de `@iwana/api`, Jest `--no-cache`                               | 392 suites aprobadas, 4 omitidas; 5.294 tests aprobados, 15 omitidos; 0 fallos        |
| API `/api/v1/health`                                                            | HTTP 200; PostgreSQL `ok`, Redis `ok`                                                 |

El test de backfill reporta conteos y verifica la ausencia de texto plano, sin imprimir documentos, ciphertext, HMAC ni claves. La validación de `/api/v1/health` usó el puerto 3000 temporalmente; el proceso se detuvo tras el 200.

## Entorno e higiene

Se usó `iwana_it_g7_ci` en `127.0.0.1:5433`; `tenant_test` estaba migrado hasta 157 por B1, por lo que no se repitió la migración. No se accedió a `dbiw`. La suite de API se ejecutó con el Node 24.13.1 instalado. El wrapper `pnpm` reportó `ENOTFOUND nodejs.org` al descargar Node; la configuración del repo no se cambió. El resultado Turbo completo y sus totales están en el [informe B1 v1.1](INFORME-MOD05-DEUDA-B1-v1.1.md).

No se incluyeron PII, ciphertext, HMAC ni claves reales en los informes. La ruta se verificó libre antes de crearla y no se creó commit.
