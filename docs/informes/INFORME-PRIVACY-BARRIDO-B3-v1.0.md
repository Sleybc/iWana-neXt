# INFORME — Privacy · Barrido de texto libre · B3

**Versión:** 1.0  
**Fecha:** 2026-11-07  
**Estado:** En revisión; B3-R2 verificado, integración completa sin fallos  
**Ejecutor:** sr-backend

## Encargo y alcance

Implementación de B3 del [plan de orquestación](../plans/2026-11-03-privacy-barrido-texto-libre-orquestacion.md), según la [spec aprobada](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md), incluida la forma de D-BT-8 autorizada el 2026-11-07.

Antes de escribir se comprobó `main` y la ausencia de cambios en `anonymize-titular.ts` y `crm-titular-erasure.participant.ts`. El segundo permanece intacto. No se crearon ramas, stash, commits ni migraciones.

El [diff reproducible](evidence/privacy-b3-2026-11-07/B3.diff) contiene las 38 rutas de código de [la lista de entrega](evidence/privacy-b3-2026-11-07/rutas.json), incluidos archivos nuevos. `git apply --reverse --check` lo valida contra el árbol entregado sin modificarlo.

## Implementación

- **D-BT-2:** participantes de Assurance y Network. Tickets exige tipo y referencia exactos, comparados como texto; publica `ticketIds` y las OT enlazadas tanto en el ticket como en su tabla de vínculos. Trata asunto, descripción, comentarios, payload, notas de vínculos y notas PQR. Mantiene número, fechas, SLA, estados y referencias.
- **Orden:** CRM, Party, usuarios, Assurance, WFM, órdenes de ejecución, tareas operativas, Network y Media. Se conserva al final el participante fiscal ya existente. API y las dos construcciones manuales del adaptador en CLI reciben las mismas dependencias.
- **D-BT-4:** A-1 a A-4 amplían la selección por suscriptor, contrato, ticket y OT. Las referencias `ticket_id` de visitas y agenda se comparan como texto porque son `varchar`. R-12 y R-13 sustituyen el motivo por `ANONIMIZADO`; los asientos y sus fechas permanecen.
- **D-BT-7:** crear ticket, crear ticket automático de instalación, agregar comentario y regularizar consultan un puerto CRM dentro de la misma transacción. CRM bloquea sus filas y rechaza suscriptor o expediente anonimizado con 409 `PRIVACY_TITULAR_ANONYMIZED`; también resuelve la referencia a contrato. Los consumidores no importan entidades CRM.
- **D-BT-8:** lectura de `supplier_profiles` propiedad de Inventory, mediante el `QueryRunner` recibido y `party_ref_id::text`. La vista previa añade `SUPPLIER_PROFILE_LINKED`; aplicar en API o CLI rechaza con 409 `PRIVACY_ERASURE_SUPPLIER_PROFILE`. Sin Party no se consulta; un proveedor de otro Party no bloquea. El esquema compartido, OpenAPI y el portal incluyen el bloqueante.
- **D-BT-9:** categoría persistida `OPERACION_CAMPO`, etiqueta «Operación y soporte». El portal muestra «La persona titular también es proveedor; requiere resolución manual.» y conserva deshabilitada la resolución.

Se leyeron `ck_sp_regularized` y los `NOT NULL` antes de definir las reglas. R-2 usa marca; R-3, R-4, R-12 y R-13 respetan sus columnas obligatorias. R-15 queda fuera de la anonimización. No se editaron `audit-sanitize.policy.ts`, archivos de Billing ni migraciones.

## Pruebas y evidencia de la entrega inicial B3

Se aplicaron `nestjs-expert`, `backend-security-coder`, `postgresql`, `architect-review`, `test-driven-development`, `iwana-test-evidence`, `system-vocabulary-review` y `typescript-expert`; al verificar y documentar, `verification-before-completion` y `docs-architect`.

### Rojos observados

- Alcance operativo: 1 suite, 7 pruebas fallidas antes de implementar A-1 a A-4 y R-12/R-13.
- Proveedor en CRM: 1 suite, 3 fallidas y 1 aprobada antes del bloqueante. Una prueba adicional confirmó después el rechazo ausente en la entrada del CLI antes de corregirlo.
- Contrato compartido: 1 fallida y 4 aprobadas antes de añadir el séptimo bloqueante.
- Integración inicial: 2 fallidas sobre PostgreSQL real, con la cadena tenant completa y `iwana.titular_erasure=on` local a la transacción.
- Guardas: se observó el fallo de la creación normal y del creador automático antes de introducir sus consultas al puerto CRM.
- La integración ampliada detectó el operador incompatible entre `varchar` y `uuid[]` en visitas/agenda antes de corregir la comparación.

### Resultados

Todas las corridas Jest indicadas usan `--no-cache`, sin Turbo. No se usó `--passWithNoTests`.

| Comprobación | Suites | Pruebas | Resultado |
| --- | ---: | ---: | --- |
| API completa, primera corrida `--runInBand` | 480 | 6370 | Aprobadas; anterior a la última guarda del creador automático |
| API completa, estado final `--maxWorkers=2` | 480 | 6371 | Aprobadas, sin omisiones; 247,751 s |
| API focalizada, incluidas composición real de PrivacyModule y OpenAPI | 9 | 142 | Aprobadas |
| Integración B3, PostgreSQL real | 1 | 13 | Aprobadas, sin omisiones |
| Shared, `erasure.spec.ts` | 1 | 5 | Aprobadas |
| Portal, `PrivacyRequestDetail.spec.tsx` | 1 | 7 | Aprobadas |

La integración usa una instancia PostgreSQL desechable separada de desarrollo, `DB_NAME=test`: **27 migraciones públicas**, incluida `EnableBtreeGist1784419216000`, y **172/172 tenant** sin recortar la cadena. Cada prueba ejecuta una transacción con `SELECT set_config('iwana.titular_erasure', 'on', true)` y rollback. No se accedió al schema operativo de desarrollo. Se retiraron el contenedor de prueba y su volumen al finalizar.

La [cobertura de integración](evidence/privacy-b3-2026-11-07/coverage-summary.json) comprende los dos participantes nuevos, la lectura de proveedores y la guarda CRM: **100 % líneas, sentencias y funciones; 94,11 % ramas**. Por archivo: Assurance 95 % ramas, Network 100 %, lectura de proveedores 100 % y guarda CRM 85,71 %; todos con 100 % de líneas. No se presenta como cobertura de toda la API.

Typecheck de API, shared y portal sin errores. ESLint: API 0 errores/7 advertencias; shared 0 errores; portal 0 errores/42 advertencias. Las advertencias están fuera de las rutas de B3. Prettier pasa en las 38 rutas de código entregadas. La comprobación global devuelve 1 por **460 archivos ajenos a B3** con diferencias de formato: [lista de deuda preexistente](evidence/privacy-b3-2026-11-07/prettier-baseline.txt). Se comprobó que su intersección con las rutas de B3 es cero; no se reformatearon esos archivos.

Los comandos y conteos finales se conservan en [checks.json](evidence/privacy-b3-2026-11-07/checks.json). Comandos principales: `pnpm --filter @iwana/api exec jest --no-cache --maxWorkers=2`; `pnpm --filter @iwana/api exec jest --config jest.integration.config.js text-erasure-scope.postgres.integration.spec.ts --runInBand --no-cache`; y `pnpm --filter <paquete> typecheck` / `lint` para `@iwana/api`, `@iwana/shared` y `@iwana/portal`.

## Cambios en pruebas existentes y límites

Se añaden casos de negocio y se amplían los dobles de los puertos CRM para la guarda nueva. Los únicos cambios de expectativas anteriores corresponden al séptimo bloqueante (D-BT-8) y a «Operación y soporte» (D-BT-9). No se relajaron aserciones para ocultar fallos.

B3 no cierra B4, B5 ni G7. Permanecen para esos bloques el manifiesto global, el barrido completo de canarios, la prueba de concurrencia CA-BT-14 y las revisiones auxiliares del plan, incluida la revisión de deriva del contrato compartido. Este informe no autoriza producción ni sustituye el cierre documental B6.

## B3-R — corrección de la integración completa

La entrega inicial no sustentaba G2: midió la integración propia de B3, pero no toda la configuración `jest.integration.config.js`. El encargo B3-R del plan exige corregir la lectura sobre schemas parciales y los montajes de integración, sin modificar aserciones existentes.

Se preparó PostgreSQL desechable con `DB_NAME=test`, roles separados de bootstrap, migrador y aplicación, migraciones públicas, `apply-least-privilege`, `tenant_test` con su fila ACTIVE en `public.tenants` y `migration:tenant:run`. Con el contract diferido habilitado se aplicaron **28 públicas y 172 tenant**. Se usan claves sintéticas y las variables `CI=true`, `IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG=test` del encargo. La suite opt-in K2 no se habilita mediante variables adicionales.

La reproducción exacta, sin filtro ni caché, confirmó **6 suites fallidas, 64 aprobadas y 4 omitidas; 23 pruebas fallidas, 459 aprobadas y 24 omitidas, sobre 506**. Se conserva el [resumen del rojo](evidence/privacy-b3r-2026-11-07/integration-red.json). La unitaria nueva de proveedores falló antes del cambio productivo: 1 suite, 2 pruebas fallidas y 3 aprobadas; después pasa 5/5.

### Cambios autorizados

- `SupplierProfileReadAdapter` consulta el catálogo con `readTenantColumns` y devuelve false si `tableExists` no encuentra `supplier_profiles`. No captura errores de permisos o conexión como si fueran ausencia de tabla. La unitaria cubre schema parcial, resultado verdadero/falso, respuesta vacía y error de catálogo.
- Los dos montajes Nest de Privacy registran los proveedores de Assurance, Network e Inventory junto al `ConfigService` sintético existente. El montaje manual de Media recibe las tres dependencias explícitamente, incluido su `ConfigService` sintético.
- Los dobles de las carreras de red y de la auditoría de aprovisionamiento implementan `assertWritableReferences` resolviendo sin error, correspondiente al caso no anonimizado de esos fixtures.

El [diff exclusivo de B3-R](evidence/privacy-b3r-2026-11-07/B3-R.diff) contiene siete rutas y está separado del diff original de B3. Se comprobó `git apply --reverse --check`. La [comparación AST de las aserciones](evidence/privacy-b3r-2026-11-07/assertions.json) confirma que los cinco specs de integración conservan todas sus llamadas de aserción. El diff del CLI coincide con el de B3: no se editó el CLI ni su spec en B3-R. Los valores por defecto del constructor del adaptador permanecen para la revisión B5 señalada en el plan.

### Bloqueo observado en B3-R, resuelto en B3-R2

**[BLOQUEO]** `apps/api/src/cli/anonymize-titular.postgres.integration.spec.ts:1494`, caso «recorre la cadena de WFM y tasks y conserva sus relaciones operativas», exige `schedule_reschedule_logs.reason = 'OPERATIONAL_REASON'`. El resultado real es `ANONIMIZADO`, conforme a R-13 / D-BT-4. El error de tabla ausente impedía alcanzar esta aserción.

El punto 4 del encargo B3-R ordenaba bloquear si el CLI exigía otro cambio y prohibía ajustar expectativas. Durante B3-R la aserción permaneció intacta; tampoco se alteró R-13 para conservar el texto. Se requirió resolución de AI-EM-ARCH y no se declaró G2 cerrado. La autorización posterior y su verificación se registran en B3-R2, al final de este informe.

### Verificación final de B3-R

Se repitió la integración sin filtro sobre una base nueva y limpia, con el mismo montaje de roles y migraciones. Se retiraron el contenedor desechable y su volumen después de verificar de nuevo los conteos de migraciones. No se crearon migraciones nuevas, ramas, stash ni commits.

| Corrida sin caché | Suites aprobadas / fallidas / omitidas | Pruebas aprobadas / fallidas / omitidas | Tiempo |
| --- | --- | --- | --- |
| Integración completa antes de corregir | 64 / 6 / 4, de 74 | 459 / 23 / 24, de 506 | 344,644 s |
| Integración completa con B3-R | 69 / 1 / 4, de 74 | 481 / 1 / 24, de 506 | 235,389 s |
| Unitarias completas de API | 481 / 0 / 0 | 6376 / 0 / 0 | 256,091 s |
| Unitaria nueva de proveedores | 1 / 0 / 0 | 5 / 0 / 0 | 3,943 s |

Las cinco suites de montaje corregidas pasaron con sus aserciones originales. El único fallo de aquella corrida fue la aserción del CLI descrita arriba. Los cuatro archivos omitidos, iguales antes y después de B3-R, son:

| Archivo | Pruebas omitidas | Guarda existente |
| --- | ---: | --- |
| `inventory-execution-request.ola3d.postgres.integration.spec.ts` | 13 | Exige su base sintética dedicada, distinta de `test` |
| `reencrypt-aes.pii.postgres.integration.spec.ts` | 5 | Exige opt-in explícito de K2, no habilitado en el comando del encargo |
| `network-execution-event.postgres.integration.spec.ts` | 5 | Exige también disponibilidad explícita de Redis |
| `execution-orders.item-usage-projection.postgres.integration.spec.ts` | 1 | Exige su base sintética dedicada, distinta de `test` |

No se añadieron filtros, `--passWithNoTests`, omisiones ni cambios de expectativas para obtener esos resultados. Typecheck completo de API, ESLint y Prettier de las siete rutas pasan con salida 0: [comandos y resultados](evidence/privacy-b3r-2026-11-07/quality.json).

Se conservan los [conteos finales, entorno y bloqueo](evidence/privacy-b3r-2026-11-07/checks.json), el [resultado por cada suite de integración](evidence/privacy-b3r-2026-11-07/integration-final.json), la [comparación de aserciones](evidence/privacy-b3r-2026-11-07/assertions.json) y el [diff exclusivo de la corrección](evidence/privacy-b3r-2026-11-07/B3-R.diff).

## B3-R2 — expectativa autorizada de R-13

AI-EM-ARCH autorizó en el párrafo B3-R2 del plan §4 cambiar únicamente la expectativa de `schedule_reschedule_logs` en `anonymize-titular.postgres.integration.spec.ts:1494` a `[{ reason: 'ANONIMIZADO', notes: null }]`. La autorización aplica R-13, aprobada en el G0 del 2026-11-07, spec §13, punto 3; sustituye la conservación del texto prevista en D1.

Se realizó una sola sustitución y se comprobó byte a byte que la siembra y el resto del archivo permanecen iguales: [comprobación del cambio exacto](evidence/privacy-b3r2-2026-11-07/exact-change.json). No se añadieron cambios productivos ni otras expectativas. El [diff exclusivo de B3-R2](evidence/privacy-b3r2-2026-11-07/B3-R2.diff) contiene esa línea; Prettier pasa sobre el archivo.

Se generó el [diff final acumulado de B3, B3-R y B3-R2](evidence/privacy-b3r2-2026-11-07/B3-final.diff), con las [45 rutas de código](evidence/privacy-b3r2-2026-11-07/rutas.json), incluidos archivos nuevos. `git apply --reverse --check` pasa contra el árbol entregado, sin modificarlo.

La integración completa se repitió sin filtro y con `--no-cache` sobre PostgreSQL desechable nuevo: `DB_NAME=test`, roles de bootstrap, migrador y aplicación separados, `apply-least-privilege`, fila ACTIVE de `tenant_test` y cadena de migraciones completa. Se verificaron **28 públicas y 172 tenant** antes y después de la corrida. Se retiraron el contenedor y su volumen al finalizar.

Resultado de `pnpm --filter @iwana/api exec jest --config jest.integration.config.js --no-cache`, con las variables del encargo y claves sintéticas:

```text
Test Suites: 4 skipped, 70 passed, 70 of 74 total
Tests:       24 skipped, 482 passed, 506 total
Snapshots:   0 total
Time:        224.151 s
```

**Salida 0; cero suites y pruebas fallidas.** La suite completa del CLI pasó. Las cuatro suites omitidas y sus 24 pruebas son las mismas guardas preexistentes de laboratorio, base dedicada y opt-in detalladas en B3-R; no se añadieron omisiones ni filtros.

El bloqueo de la expectativa R-13 queda resuelto por la autorización y por esta corrida. Se conservan los [conteos finales y montaje](evidence/privacy-b3r2-2026-11-07/checks.json) y el [resultado por cada suite](evidence/privacy-b3r2-2026-11-07/integration-final.json). La evidencia acumulada no sustituye los bloques B4/B5/B6 ni declara publicación o producción. Se permanece en `main`, sin ramas, stash, commit ni migraciones nuevas.
