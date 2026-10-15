# INFORME-MOD05-E3-E4-GATES-v1.2

**Fecha:** 2026-10-15  
**Responsable:** AI-GATE-VERIFIER  
**Resultado:** **NO-GO**  
**Alcance:** Turbo lint/typecheck/test para cinco paquetes, integración API con PostgreSQL, comparación de cobertura D1 y gates aplicables de AGENTS.md.

## Resultado ejecutivo

Los 15 comandos Turbo terminaron con exit 0 y cero tareas cacheadas. La integración de API se ejecutó contra PostgreSQL real con el tenant E2E srqa-mod05-e3-3dbb1e8f72a8, que está INACTIVE y cuyo ledger registra la migración 148. La corrida falló en una prueba antigua de B5: intenta pasar a LISTO_PARA_INSTALACION sin consentimiento y ahora recibe el 422 de R8. Las integraciones G1 y contacto pendiente pasaron dentro de esa misma corrida.

La comparación de cobertura contra fb3d41ee encontró descenso en statements, functions y lines del agregado crm/expedientes; branches subió. Además, cuatro líneas ejecutables modificadas de la página del expediente en Portal quedaron sin hit. Por ambos criterios D1 no queda demostrado el 100% de líneas cambiadas y la cobertura agregada no se mantiene. **No se declara GO.**

## Lint, typecheck y tests sin caché

Se ejecutó cada comando Turbo individualmente con --force. Todas las invocaciones informaron Cached: 0 cached; las tareas de dependencias también se ejecutaron, sin cache hit.

| Paquete       | Lint                                                                                                 | Typecheck                                                                         | Test                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @iwana/api    | pnpm exec turbo run lint --filter=@iwana/api --force — exit 0; 4/4 tareas; 0 errores, 7 warnings     | pnpm exec turbo run typecheck --filter=@iwana/api --force — exit 0; 4/4 tareas    | pnpm exec turbo run test --filter=@iwana/api --force — exit 0; 376 suites aprobadas, 4 omitidas/380; 5.000 tests aprobados, 15 omitidos/5.015; 4/4 tareas      |
| @iwana/shared | pnpm exec turbo run lint --filter=@iwana/shared --force — exit 0; 1/1 tarea; 0 warnings              | pnpm exec turbo run typecheck --filter=@iwana/shared --force — exit 0; 1/1 tarea  | pnpm exec turbo run test --filter=@iwana/shared --force — exit 0; 18 suites, 168 tests aprobados; 1/1 tarea                                                    |
| @iwana/db     | pnpm exec turbo run lint --filter=@iwana/db --force — exit 0; 2/2 tareas; 0 errores, 5 warnings      | pnpm exec turbo run typecheck --filter=@iwana/db --force — exit 0; 2/2 tareas     | pnpm exec turbo run test --filter=@iwana/db --force — exit 0; 66 suites, 395 tests aprobados; 2/2 tareas. Incluye migration-order y el spec unitario de la 148 |
| @iwana/portal | pnpm exec turbo run lint --filter=@iwana/portal --force — exit 0; 3/3 tareas; 0 errores, 46 warnings | pnpm exec turbo run typecheck --filter=@iwana/portal --force — exit 0; 3/3 tareas | pnpm exec turbo run test --filter=@iwana/portal --force — exit 0; 299 suites, 3.014 tests aprobados, 1 omitido/3.015; 2/2 tareas                               |
| @iwana/worker | pnpm exec turbo run lint --filter=@iwana/worker --force — exit 0; 4/4 tareas; 0 errores, 1 warning   | pnpm exec turbo run typecheck --filter=@iwana/worker --force — exit 0; 4/4 tareas | pnpm exec turbo run test --filter=@iwana/worker --force — exit 0; 20 suites, 169 tests aprobados; 4/4 tareas                                                   |

Portal registró el aviso de que Jest forzó la salida de un worker que no terminó limpiamente; exit 0 y los conteos anteriores son los reportados por Jest. Los warnings de lint no impidieron los comandos y no se contaron como errores.

## Integración API con PostgreSQL

Comando ejecutado contra 127.0.0.1:5433/dbiw; las credenciales locales no se incluyen en este informe:

```powershell
$env:IWANA_DB_INTEGRATION_AVAILABLE='true'; $env:DB_HOST='127.0.0.1'; $env:DB_PORT='5433'; $env:DB_NAME='dbiw'; $env:E2E_TENANT_SLUG='srqa-mod05-e3-3dbb1e8f72a8'; pnpm --filter @iwana/api test:integration
```

Resultado: PostgreSQL alcanzable; **exit 1**. Jest reportó Test Suites: 1 failed, 2 skipped, 18 passed, 19 of 21 total y Tests: 1 failed, 14 skipped, 82 passed, 97 total.

- Falla b5-identity-conversion.postgres.integration.spec.ts, prueba «mantiene pendiente la conversión sin autorización y la resuelve tras capturarla». El test intenta transicionar a LISTO_PARA_INSTALACION sin consentimiento y la guarda R8 lanza el 422 esperado. La integración B5 requiere ajustar su preparación/expectativa al contrato R8; no se modificó el test en este gate.
- Pasaron g1-conversion-failure.postgres.integration.spec.ts y contact-pending.postgres.integration.spec.ts, además de las otras 16 suites aprobadas.
- Las 2 suites omitidas requieren la base de integración separada i4_qa_20261006_a1: inventory-execution-request.ola3d.postgres.integration.spec.ts y execution-orders.item-usage-projection.postgres.integration.spec.ts.

Consulta de solo lectura al terminar: el tenant slug indicado existe con estado INACTIVE, schema tenant_srqa_mod05_e3_3dbb1e8f72a8; typeorm_migrations registra SubscriberContactNullable1480000000000. La prueba de integración G1 crea además un schema sintético independiente y aplica TENANT_MIGRATIONS desde cero, incluida la 148. La prueba real de migración E1 reporta up/down/up y rechazo de down con NULL, 1 suite/1 test; el paquete DB aprobó migration-order y el spec unitario de la 148 en la corrida de arriba.

El informe G3 INFORME-MOD05-E3-E4-QA-v1.2.md registra 2/2 E2E contra Portal/API reales, CA-E3-01 a 04 y tenants desechables INACTIVE; G4 no volvió a ejecutar Playwright.

## Cobertura D1 frente a fb3d41ee

Corridas frescas de Jest API, con los mismos reporteros y configuración en working tree y en un archivo temporal extraído de fb3d41ee. Cada una terminó con exit 0 y no usó caché de Turbo. Baseline: 372 suites aprobadas/4 omitidas, 4.967 tests aprobados/15 omitidos. Working tree: 376 suites aprobadas/4 omitidas, 5.000 tests aprobados/15 omitidos.

Comando ejecutado en ambos estados:

```powershell
pnpm --filter @iwana/api exec jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary --coverageReporters=json --coverageDirectory=<directorio temporal>
```

<directorio temporal> fue distinto por estado y quedó fuera del repositorio. El baseline se extrajo desde el commit completo fb3d41ee2f99e8d5c53b725149b8e021230e2af2; el manifiesto de dependencias y lockfile del working tree no tenían cambios.

| Agregado crm/expedientes |    Baseline fb3d41ee |         Working tree | Diferencia | D1     |
| ------------------------ | -------------------: | -------------------: | ---------: | ------ |
| Statements               | 1.782/2.204 = 80,85% | 1.855/2.360 = 78,60% |   -2,25 pp | Falla  |
| Branches                 |     501/869 = 57,65% |     534/917 = 58,23% |   +0,58 pp | Cumple |
| Functions                |     236/311 = 75,88% |     245/340 = 72,06% |   -3,82 pp | Falla  |
| Lines                    | 1.708/2.061 = 82,87% | 1.780/2.213 = 80,43% |   -2,44 pp | Falla  |

La regla D1 es no bajar respecto del baseline. El agregado cae en tres de las cuatro métricas reportadas. El umbral de branches ≥80% permanece como P1 antes de MOD05 G7; no se usa para cambiar el criterio de esta ola.

### Líneas ejecutables cambiadas

Se cruzaron las líneas añadidas por git diff --unified=0 fb3d41ee con los mapas de statements de los coverage-final.json frescos. API G1: 48/48 líneas ejecutables cubiertas; las dos líneas modificadas del controller son decoradores sin instrucciones ejecutables.

| Archivo de producción                              |       Ejecutables cambiadas cubiertas |
| -------------------------------------------------- | ------------------------------------: |
| API expediente.service.ts                          |                                 38/38 |
| API expediente-detail-bootstrap.service.ts         |                                   4/4 |
| API dto/expediente-detail-bootstrap.dto.ts         |                                   6/6 |
| API expedientes.controller.ts                      | 0 ejecutables en 2 líneas modificadas |
| Portal ExpedienteConversionBanner.tsx              |                                 12/12 |
| Portal app/dashboard/crm/expedientes/[id]/page.tsx |                                 34/38 |
| Portal lib/api-client.ts                           |                                   1/1 |

Total de ambos alcances: **95/99 líneas ejecutables cubiertas**. Las cuatro líneas sin hit están en apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx:959,969,974,976. El gate D1 de 100% de líneas ejecutables modificadas **falla**.

## Matriz de gates aplicables

| Gate                                     | Estado                         | Evidencia                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint y typecheck de cinco paquetes       | **Cumple**                     | 10 comandos Turbo listados arriba; todos exit 0 y 0 cache hit.                                                                                                                      |
| Tests de cinco paquetes                  | **Cumple**                     | 5 comandos Turbo listados arriba; cada salida tiene conteos no vacíos y 0 cache hit.                                                                                                |
| Integración API real requerida           | **Falla**                      | pnpm --filter @iwana/api test:integration con E2E_TENANT_SLUG: exit 1, 1 suite y 1 test fallidos; detalle B5 arriba.                                                                |
| Cobertura agregada D1                    | **Falla**                      | crm/expedientes baja en statements (-2,25 pp), functions (-3,82 pp) y lines (-2,44 pp) frente a fb3d41ee.                                                                           |
| 100% de líneas ejecutables cambiadas D1  | **Falla**                      | API 48/48; Portal 47/51; total 95/99, con cuatro líneas sin hit en la página del expediente.                                                                                        |
| Reversibilidad/registro de migración 148 | **Cumple**                     | E1: Postgres real up/down/up, 1/1; G4 confirma fila 148 en ledger de tenant INACTIVE; DB incluye migration-order y spec unitario de 148.                                            |
| OpenAPI actualizado                      | **No aplica**                  | G1 ajustó permisos/roles del endpoint existente; no se agregó ruta HTTP.                                                                                                            |
| No PII en logs                           | **Cumple según D2**            | No se reabre el hallazgo de UUID: D2 lo dispone expresamente como identificador técnico de soporte y no bloqueante. La revisión sec-eng G4 se emite después de este gate.           |
| Boundary Modulith                        | **Falla / decisión requerida** | La revisión posterior del diff G1/G2 detectó el conflicto de roles con ADR-083 D2 y pidió aclarar la lectura de postcondición entre CRM y Subscribers según ADR-027; detalle abajo. |
| Vulnerabilidades críticas nuevas         | **No aplica**                  | git status --porcelain -- packages/_/package.json apps/_/package.json pnpm-lock.yaml no mostró cambios en manifiestos ni lockfile; no correspondía ejecutar pnpm audit.             |

## Gates abiertos y decisión

- Corregir/actualizar el test de integración B5 para que prepare el consentimiento requerido por R8, y repetir la integración completa con exit 0 y conteos reales.
- Resolver la regresión D1 del agregado crm/expedientes respecto de fb3d41ee.
- Cubrir las cuatro líneas ejecutables cambiadas sin hit en la página del expediente para alcanzar 100%.
- Resolver con AI-EM-ARCH el conflicto entre la autorización solicitada para SALES/SUPPORT y ADR-083 D2, que restringe la ampliación de roles en endpoints de escritura (`apps/api/src/modules/crm/expedientes/expedientes.controller.ts:298-299`; `docs/adrs/ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md:49,124`).
- Aclarar si la lectura de postcondición mediante `SubscribersService.findByExpedienteId` es una excepción permitida a ADR-027 o requiere un contrato/proyección del módulo (`apps/api/src/modules/crm/expedientes/expediente.service.ts:1107-1108,3085-3092`; `docs/adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md:13-19,23-30`).

La disposición D2 sobre UUID se respeta y no forma parte de los gates abiertos. El tenant E2E consultado quedó INACTIVE; este gate no dejó tenants activos ni imprimió credenciales.

### Revisión boundary posterior al gate

La revisión de solo lectura del diff actual concluyó **NO-GO** por dos asuntos. Primero, la ampliación de `@Roles` del endpoint de retry a SALES/SUPPORT contradice ADR-083 D2 para endpoints de escritura. La autorización de producto recibida para esos roles queda registrada, pero no resuelve por sí sola el conflicto con el ADR vigente. Segundo, `ExpedienteService` consulta directamente `SubscribersService` para verificar el efecto de conversión; ADR-027 prohíbe llamadas directas servicio→servicio en el flujo de conversión por eventos, pero no especifica si esa lectura de postcondición es una excepción. Se requiere resolución arquitectónica antes de declarar el gate de boundaries aprobado.

La revisión encontró que el acceso tenant-aware y la proyección acotada de bootstrap permanecen dentro de sus límites (`TenantContext`/`runInTenantSchema`, tabla CRM propia y solo campos de fallo requeridos). No se hicieron cambios como resultado de la revisión.

La ruta docs/informes/INFORME-MOD05-E3-E4-GATES-v1.2.md estaba libre antes de crear este informe. No se modificaron código, tests, configuración ni migraciones; no se hizo commit.

## Verificación del informe

- `pnpm exec prettier --check docs/informes/INFORME-MOD05-E3-E4-GATES-v1.2.md`: exit 0, formato correcto.
- `git diff --check`: exit 0, sin salida. Como el informe es un archivo nuevo sin seguimiento, su formato se comprobó además con Prettier.
- La revisión boundary fue posterior al gate G4 y se incorporó a este informe; fue de solo lectura y no cambió código ni tests.
