# INFORME MOD05 — Cierre de G6 / SUB-C03

**Versión:** 1.0 · **Fecha:** 2026-10-12  
**Estado:** **CERRADO — GO**  
**Plan vigente:** [plan de orquestación v1.6](../plans/2026-10-12-mod05-iva-punto-servicio.md)

## Veredicto

G6 y SUB-C03 quedan cerrados. La re-verificación de `sec-eng` dio **GO** para S-T7-01 y el `gate-verifier` dio **GO** para los gates técnicos posteriores a T11. T12 no bloquea el cierre: examinó tres schemas de desarrollo en solo lectura y reportó cero filas coincidentes. La decisión sobre una posible redacción histórica sigue en manos del CTO y no se ejecutó.

## Evidencia de cierre

| Gate                               | Resultado                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API sin caché                      | `pnpm exec turbo run test --filter=@iwana/api --force`: **338 suites y 4.744 tests aprobados**, 4 suites y 15 tests omitidos; Turbo `Cached: 0 cached, 4 total`                                 |
| Integración Postgres               | **14/14 tests**. El flujo crear → activar → `/service-point` verifica las filas nuevas de auditoría sin marcadores fiscales ni `installationNotes`                                              |
| Cobertura unitaria `crm/contracts` | **250/302 branches (82,78 %)** y **530/606 statements (87,46 %)**; la integración se ejecutó aparte y no entra en el denominador                                                                |
| Lint y typecheck API               | Exit 0; lint con 7 warnings preexistentes y cero errores                                                                                                                                        |
| S-T7-01 / seguridad                | **GO**. `fiscal_document` y `fiscal_name` están cubiertos; los 13 handlers de escritura usan `@SkipAudit()` y los eventos explícitos guardan IDs, transiciones o nombres allowlisted de campos  |
| Inventario histórico T12           | 0 coincidencias en `tenant_iwana`, `tenant_srqa_mod11_r5_20261006` y `tenant_test_s2_live`; primera/última fecha `NULL`. Guardas confirmadas: rol `iwana_readonly` y `transaction_read_only=on` |

Los informes de trabajo conservan el detalle reproducible: [T11 v1.1](INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.1.md), [T12 v1.0](INFORME-MOD05-IVA-PUNTO-SERVICIO-T12-v1.0.md), [T7 inicial](INFORME-MOD05-IVA-PUNTO-SERVICIO-T7-v1.0.md) y [T8](INFORME-MOD05-IVA-PUNTO-SERVICIO-T8-v1.0.md). La revisión final de T7 señaló una limitación no bloqueante: el spec de integración no monta el `AuditInterceptor`; la metadata `@SkipAudit()` de los 13 handlers se verifica en specs unitarios separados.

## Alcance que continúa fuera de G6

- El tipo del helper `contractsApi.create` se asignó a D-PDF P3. Los puntos S-T7-02 y S-T7-03 también continúan en esa fase.
- La consulta equivalente de T12 encontró cero coincidencias en los tres schemas indicados, pero no afirma nada sobre otros entornos o despliegues. El script SQL psql no se ejecutó porque `psql` no está instalado.
- La propuesta de redacción de filas históricas está marcada **NO EJECUTAR**. Requiere decisión del CTO y revisión de seguridad; no se modificó ninguna fila existente de `audit_logs`.

## Deuda nueva por severidad

| Severidad | Pendiente                                                                                                                                                                                         | Responsable / destino                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Media     | Rotar la credencial local `iwana_readonly` y actualizar su configuración: una salida de herramienta mostró accidentalmente la URI durante una búsqueda. El valor no se reproduce en este informe. | Operación local / dueño de la credencial |
| Baja      | Corregir el tipo de `contractsApi.create`.                                                                                                                                                        | `fe-platform`, bloque P3 de D-PDF        |

**Deuda de código nueva de T11:** ninguna identificada. No se escribieron bases ni se cambiaron permisos durante T12; la integración T11 usó un schema aislado de prueba.

## Adenda AI-EM-ARCH (2026-10-13): re-confirmación sobre el árbol consolidado

**El GO de este informe se mantiene en sustancia, pero su evidencia corresponde al árbol de 2026-10-12 hacia las 18:31.** Después de esa hora el árbol cambió:

- **Una segunda sesión de T11** ([informe v1.2](INFORME-MOD05-IVA-PUNTO-SERVICIO-T11-v1.2.md)) añadió `contract-plan-id.util.ts`, más tests y `APP_INTERCEPTOR` en la integración de contratos. Dos sesiones ejecutaron el mismo bloque con la misma propiedad: es un defecto de despacho.
- **P1 de D-PDF** añadió `MediaUsage.STRATUM_EVIDENCE`. `MEDIA_CONSTRAINTS` (`media/media.service.ts`) aún no lo cubre, así que `tsc` falla con TS2741 hasta que cierre P2.

**Disposición:**

1. Los dos informes de T11 son canónicos, cada uno en su ámbito:
   - **v1.1** es el registro de la ejecución que sostuvo este G6.
   - **v1.2** es la verificación del código vigente.
     No se fusionan ni se reescriben.
2. **El G6 se re-confirma** con `gate-verifier` sobre el árbol consolidado (fase IVA + D-PDF P1/P2/P3) **antes del commit**. Si da GO, este informe gana una segunda adenda con las cifras nuevas. Si da NO-GO, G6 se reabre.
3. **La integración de T11 no necesita una base nueva.** El spec (`contracts.service.postgres.integration.spec.ts:46-47`) clona un schema efímero del tenant de `E2E_TENANT_SLUG` en cualquier base: se usa `dbiw` con `E2E_TENANT_SLUG=iwana`, como en las ejecuciones previas. En CI corre con `E2E_TENANT_SLUG=test` (`.github/workflows/ci.yml:527`).
4. **Credencial `iwana_readonly`:** el valor que aparece en `INFORME-CLAUDE-CODE-AUTOMATIZACIONES-v1.0.md:126` es un marcador, no la contraseña (verificado sin reproducirlo). La exposición ocurrió en la salida de una herramienta de otra sesión, así que rotar la credencial sigue recomendado.

## Adenda 2 — re-confirmación G6 tras P4 y gate delta (2026-10-14)

**G6: GO re-confirmado para el commit. G6.5: pendiente y obligatorio antes del merge.** El gate delta cierra la discrepancia OpenAPI de P4. La integración de P2 no se volvió a ejecutar contra `dbiw`: según la decisión del plan D-PDF v1.3, no es una precondición local del commit. Su evidencia es la corrida PostgreSQL de P2 **19/19, cero omitidos** con la 026 aplicada temporalmente, registrada en [el informe P2](../informes/INFORME-MOD05-IVA-PDF-P2-v1.0.md), más G6.5.

| Gate delta                  | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenAPI del upload dedicado | P4 documenta `PDF, JPEG, PNG o WEBP; máximo 10 MiB` y `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED` para HTTP 422; conserva el 422 existente. Ver [informe P4](../informes/INFORME-MOD05-IVA-PDF-P4-v1.0.md).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Typecheck API               | `pnpm --filter @iwana/api typecheck`: exit 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Lint API                    | `pnpm --filter @iwana/api lint`: exit 0, cero errores y 7 warnings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tests API sin caché         | `pnpm exec turbo run test --filter=@iwana/api --force`: 339 suites aprobadas, 4 omitidas; 4.797 tests aprobados, 15 omitidos; `Cached: 0 cached, 4 total`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Integración amplia previa   | 9 suites aprobadas, 1 fallida, 2 omitidas; 41 tests aprobados, 7 fallidos, 14 omitidos. Las dos suites omitidas son las pruebas base `inventory-execution-request.ola3d.postgres.integration.spec.ts` y `execution-orders.item-usage-projection.postgres.integration.spec.ts`: sus guardas requieren `DB_NAME=i4_qa_20261006_a1`, mientras esta corrida usó `dbiw`. Suman 13 y 1 casos respectivamente. Son externas a IVA/D-PDF. No corresponden a `EV1_REAL_DB` ni `TENANT_MIGRATIONS_REAL_DB`; esas variables habilitan specs `.spec.ts` excluidos por `jest.integration.config.js`, que solo incluye `*.postgres.integration.spec.ts`. |
| PII en logs y boundaries    | Sin cambio de comportamiento ni nuevos logs en P4; se mantienen las revisiones y pruebas registradas en el gate consolidado v1.0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Condición de G6.5:** en CI con `DB_NAME=test` y `E2E_TENANT_SLUG=test`, `contracts.service.postgres.integration.spec.ts` (incluidos los casos P2) debe aparecer ejecutada, **sin omisiones y en verde**, después de aplicar las migraciones. El reporte de CI debe quedar asociado al SHA; esta adenda no afirma que esa corrida se haya ejecutado.

**Manifiestos de commit:** el commit de código permanece en **116 rutas**, idénticas a la lista completa de la sección «Rutas para dos commits» del [informe de gates v1.0](../informes/INFORME-MOD05-IVA-PDF-GATES-v1.0.md); el controlador P4 ya era una de ellas. El commit de documentación queda en **44 rutas**: las 41 del manifiesto v1.0 más el launcher D-PDF v1.3, [el informe P4](../informes/INFORME-MOD05-IVA-PDF-P4-v1.0.md) y el nuevo [informe de gates v1.1](../informes/INFORME-MOD05-IVA-PDF-GATES-v1.1.md). El informe G6 actualizado ya estaba en el manifiesto original. `OTHER=0`.

## Adenda 3 — G6.5 cumplido (2026-10-15, AI-EM-ARCH)

Corrida de CI [`38735918857`](https://github.com/Sleybc/iWana-neXt/actions/runs/38735918857) sobre el SHA `70786da0`: **success** (6 de 6 checks). Integraciones de API con `E2E_TENANT_SLUG=test`: 14 suites en PASS y 2 omitidas por diseño, que no son de esta fase; 73 tests. Integraciones de migraciones con `DB_NAME=test`: 28 de 28 suites y 106 de 106 tests.

- `PASS src/modules/crm/contracts/tests/contracts.service.postgres.integration.spec.ts`, con los casos P2: ejecutada, sin omisiones y en verde.
- `PASS src/migrations/tenant/144_vat_service_point.integration.spec.ts`
- `PASS src/migrations/tenant/143_subscriber_party_pii_hmac.integration.spec.ts`

**G6.5 de IVA: ✅ GO.** Pendiente: G7.
