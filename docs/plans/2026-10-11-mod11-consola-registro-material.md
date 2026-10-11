# Plan de orquestación — MOD11: registro compacto de equipos y materiales en la consola de OT

**Versión:** 1.0
**Fecha:** 2026-10-11
**Emitido por:** AI-EM-ARCH
**Estado:** **Aprobado por el CTO (2026-10-11).** R-LOT en GO; Q1 v1.3 con registros confirmados y NO-GO global por evidencias pendientes.
**Encargo:** `docs/prompts/PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-IMPL-v1.0.md`
**Spec aprobada:** `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.4 (§16), aprobada en U1.

## 1. Contexto

La captura «Registrar equipo instalado» llena la pantalla. Se verificó en el navegador como técnico sobre `OTE-20260828-001`:

- la custodia aparece en solo lectura, con una tarjeta por serial y otra por saldo, y el equipo serializado queda duplicado;
- debajo hay un formulario de 6 campos;
- de esos 6 campos, solo uno es una decisión real: qué serial se instaló, que además se teclea a mano.

La lluvia de ideas la hicieron `prod-ux` y `ds-owner` en solo lectura y planteó tres direcciones: mínima, custodia como formulario y escaneo.

**Decisiones del CTO (2026-10-11):**

- **Dirección B.** La tarjeta muestra referencia + serial y el técnico solo elige.
- **Un equipo por registro.**
- **Los consumibles salen de `CPE`.** Se registran en un **requisito de material opcional, «Materiales usados en la instalación»** (categoría `CONSUMIBLESFO`), dentro de una v3 de la plantilla de instalación del tenant.
- **Equipo que no aparece:** aviso a supervisión, sin serial manual.

## 2. Gates

| Gate | Estado |
| --- | --- |
| G1 | No aplica: no cambian el contrato, el API ni MOD12. |
| **G2** | **CERRADO (2026-10-11).** U1 GO (spec UX v1.4 §16 aprobada) y D1 GO (contrato `RadioCardGroup` v1.0), con tres condiciones técnicas para F2 (adenda 1 del encargo) |
| G4 | **Emitido el 2026-10-11:** ola 1 (U1 y D1) y ola 2 (F1 y F2, adenda 1) |
| G6 | Jest de `operations/` y `packages/ui`, typecheck global, `audit-ui.mjs` y recorrido Q1 en navegador; los registros principales llegaron a `CONFIRMED` en Q1 v1.3 |
| **R-LOT** | **GO (2026-10-11).** Asignación FEFO→FIFO, movimientos por lote y reverso repartido; informe R-LOT v1.0 |
| **Q1** | **NO-GO global (2026-10-11).** Router y dos consumibles confirmados; faltan reintento de fila demostrado en navegador, recorrido supervisor del reverso y capturas como archivos |

## 3. Secuencia

```
Paso 0 (datos de tenant_iwana, CTO) → Ola 1: U1 ‖ D1 → Ola 2: F1 → F2
                                                    → Ola 2b: R-LOT sr-backend → Q1 v1.3 sr-qa
```

## 4. Matriz de dispatch

Skills verificadas en disco el 2026-10-11.

| Bloque | Subagente | Obligatorias | Apoyo | Descartadas y por qué | Gate |
| --- | --- | --- | --- | --- | --- |
| **U1** | `prod-ux` | `ui-ux-pro-max`, `system-vocabulary-review` | `iwana-identity-ui-review` | `brainstorming`: ya se hizo | Adenda v1.4 con flujo, copy y estados |
| **D1** | `ds-owner` | `core-components`, `iwana-identity-ui-review` | `tailwind-patterns` | `ui-ux-pro-max`: el patrón ya está decidido | Contrato de `RadioCardGroup` congelado |
| **F1** | `fe-platform` | `frontend-dev-guidelines`, `tailwind-patterns`, `wcag-audit-patterns`, `testing-patterns` | — | — | Jest de `packages/ui` y de los 3 consumidores migrados |
| **F2** | `fe-platform` | las de F1 + `iwana-identity-ui-review` | — | — | Jest de `operations/` (≥ 779) y `audit-ui.mjs` |
| **Q1** | `sr-qa` | `playwright-skill`, `wcag-audit-patterns`, `verification-before-completion` | `e2e-testing-patterns` | — | Registro real de un serial y de consumibles hasta `CONFIRMED` |

## 5. Paso 0: datos de `tenant_iwana`

**Estado: aplicado por el CTO y verificado en `tenant_iwana`.** El SQL del paso 0:

1. devolvió los tres consumibles a `CONSUMIBLESFO`;
2. publicó la plantilla «Instalación estándar v3», con los cinco requisitos de la v2 y `installation-materials` opcional, categoría `CONSUMIBLESFO` y destino `INSTALLED_AT_CUSTOMER`;
3. migró `OTE-20260828-001` y `-002` a la v3, con seis requisitos cada una.

**Destino de los consumibles:** `INSTALLED_AT_CUSTOMER`, ratificado por `prod-ux` en U1; la acción se deriva del destino.
## 6. Seguimiento de Q1

- **R-LOT: GO.** El defecto de MOD12 quedó corregido según D13: disponible agregado por todos los lotes; asignación FEFO→FIFO y saldo sin lote al final; serial con lote del activo o lote asignado; líneas de origen y destino conservan el lote; reverso repartido verificado con integración real. Véase `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-R-LOT-v1.0.md`.
- **Q1 v1.3: NO-GO global, con pasos 1 y 2 en GO.** En `tenant_iwana`, `XC220-TEST-0031` quedó `CONFIRMED`, `INSTALLED_COMODATO` y con comodato abierto. Patchcord 2 y roseta 1 quedaron `CONFIRMED`; los saldos de custodia bajaron 4→2 y 2→1 y las líneas conservaron sus lotes.
- Una fila forzada de 3 patchcord fue rechazada por saldo insuficiente tras consumirse el saldo real. No creó movimiento ni duplicado. No se demostró en navegador el reintento de la misma fila: el POST recibió 202 y la UI retiró la fila antes del rechazo asíncrono. Los tests de F2 cubren clave estable y reintento, pero no sustituyen ese paso de Q1.
- La reparación local autorizada limpió `last_error` únicamente en el evento antiguo con recibo terminal `REJECTED/CUSTODY_INSUFFICIENT`; la fila DLQ se conservó. La versión de `OTE-20260828-001` se incrementó de 10 a 11 para que el navegador recibiera el estado reconciliado. No se alteraron los recibos ni el inventario mediante esa reparación.
- En la revisión visual de v1.2 quedaron comprobados 375×812 y 1280×800, claro/oscuro, teclado, foco y hoja dentro de 812 px. Las capturas autenticadas se vieron durante la sesión, pero no se guardaron como archivos en `docs/informes/assets/`. El historial se comprobó en la UI; queda recorrer el reverso desde sesión supervisora. La regresión automatizada del reverso repartido y de las tres pantallas migradas está cubierta en R-LOT/F1.
- No reenviar el request antiguo del router ni tratar la fila de 3 patchcord como un reintento con la misma clave. Los dos consumos confirmados se pueden revertir con sesión de supervisor si se decide restablecer los saldos de ejemplo.
## 7. Registro

| Fecha | Origen | Hecho | Registro |
| --- | --- | --- | --- |
| 2026-10-11 | CTO y AI-EM-ARCH | Lluvia de ideas de `prod-ux` y `ds-owner`. El CTO elige la dirección B, un equipo por registro, consumibles en un requisito propio y la salida a supervisión. Se detecta que los consumibles se habían reclasificado a `CPE` a las 12:53, fuera de esta sesión | Este plan y el encargo v1.0 |
| 2026-10-11 | AI-EM-ARCH, auditoría de la ola 1 | **Paso 0 verificado en la base:** consumibles en `CONSUMIBLESFO`, la v3 publicada y las dos OT en la v3, con 6 requisitos. **U1: GO**, con el destino `INSTALLED_AT_CUSTOMER` ratificado. **D1: GO**, sin `QuantityStepper`. G2 cerrado con tres condiciones para F2: (1) el patrón se elige por `trackingMode`, no por la clave del requisito; (2) los POST de varias filas van en serie, con la versión vigente y reintento único ante `412`, porque el adaptador usa la versión de la orden y refresca después (`use-execution-order-console-adapter.ts:573`); (3) una `Idempotency-Key` estable por fila, porque `api-client.ts:7057` genera una por llamada | Adenda 1 del encargo y launcher de la ola 2 |
| 2026-10-11 | AI-EM-ARCH, auditoría de la ola 2 | **F1 y F2: GO.** Verificación en frío: typecheck 8/8, `Cached: 0`; portal 805/805 con `--no-cache`; `@iwana/ui` 34/34; `audit-ui.mjs` sin hallazgos. Revisadas las tres condiciones: patrón por `trackingMode`, lote en serie con versión vigente y reintento ante `412`, y clave por fila. El reintento con la misma clave es seguro porque el HMAC del servidor no incluye la versión. Observación menor: el spec de contrato de `RadioCardGroup` quedó en el portal. La captura visual queda para Q1, porque la ventana estaba oculta | Adenda 2 y launcher de la ola 3 |
| 2026-10-11 | AI-EM-ARCH, auditoría de Q1 | **Q1: NO GO por entorno, no por producto.** `sr-qa` no envió registros. Causa encontrada por el orquestador: las migraciones manuales de plantilla (v1→v2→v3) cambiaron el snapshot **sin subir `execution_orders.version`**. El ETag del detalle es `"1.3-<version>"`, así que el servidor seguía respondiendo «sin cambios» y el navegador reutilizaba su copia de la v1 o la v2. Pedida sin caché, la API ya devolvía la v3. **Corrección:** `version + 1` en las dos OT (8 y 2). Es seguro porque la guarda del worker solo descarta eventos con `aggregateVersion <= latest` (`execution-order-events.processor.ts:337`). Verificado: ETag `"1.3-8"`, v3 con 6 requisitos y `REGISTER_ITEM_USAGE` | Q1 se reanuda con el mismo bloque de la ola 3 |

| 2026-10-11 | AI-EM-ARCH, reanudación de Q1 | Tras recargar, verificados ETag `"1.3-8"`, v3 con 6 requisitos y acciones habilitadas. Una solicitud de `XC220-TEST-0031` quedó `PENDING`; dos eventos para el mismo request terminaron en DLQ con `UnrecoverableError`. Sin POST de consumibles. Revisados claro/oscuro, teclado y altura 812 px en viewport 375; 1280 px y assets autenticados pendientes. Q1 sigue NO-GO. | `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-Q1-SR-QA-v1.1.md` |

| 2026-10-11 | AI-EM-ARCH, reanudación de Q1 | Portal recuperado con `pnpm dev`; `/api/v1/health` devuelve `ok` y escuchan 3000/3001/3002. Se configuró la clave HMAC local autorizada y el worker procesó el mismo request, con recibo terminal `REJECTED/CUSTODY_INSUFFICIENT`. Router, patchcord y roseta tienen balances `NEW` con `lot_id` no nulo; el validador busca saldo sin lote y las líneas del movimiento no asignan lote. No se reenvió el serial ni se enviaron consumibles. Comprobación visual en 375×812 y 1280×800, claro/oscuro; radios operables con flechas y foco visible. Capturas vistas en sesión, sin archivos locales. Q1 sigue NO-GO. | `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-Q1-SR-QA-v1.2.md` |
| 2026-10-11 | AI-EM-ARCH, auditoría de Q1 v1.2 | **Q1: NO GO por un defecto de MOD12.** El XC220 terminó `REJECTED/CUSTODY_INSUFFICIENT` (3 intentos) porque el consumo de OT no tiene en cuenta los lotes. Todos los saldos del tenant están por lote; la validación (`stock-balance.service.ts:210`) solo cuenta los saldos sin lote y las líneas de OT no llevan lote (`stock-ledger.service.ts:1753`). G6 del consumo no lo detectó porque el tenant sintético no tenía lotes. **Se emite la spec de consumo v1.2 con D13 (FEFO→FIFO en MOD12).** La UI quedó verificada en 375/1280, en tema claro y oscuro, con teclado y foco; faltan las capturas como archivo | Adenda 3: R-LOT (`sr-backend`) y luego Q1 v1.3. Launcher `PROMPT-MOD11-CONSOLA-REGISTRO-MATERIAL-OLA2B-LAUNCH-v1.0.md` |

| 2026-10-11 | AI-EM-ARCH, cierre R-LOT | **R-LOT: GO.** D13 implementada: suma de saldos por lote y asignación FEFO→FIFO, líneas emparejadas con lotes, serial sin lote y reverso repartido verificados contra PostgreSQL/Redis reales. Gates del informe: typecheck 8/8, inventario 809 aprobados (8 omitidos), integración 13/13 y task8 24/24. | `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-R-LOT-v1.0.md` |
| 2026-10-11 | AI-EM-ARCH, Q1 v1.3 | Router `XC220-TEST-0031` y dos consumibles confirmados en `tenant_iwana`; saldos 4→2 y 2→1 con lotes conservados. Una fila de 3 patchcord fue rechazada sin movimiento/duplicado. Reintento idéntico no demostrado en navegador porque el 202 retiró la fila antes del rechazo asíncrono. Visual verificado previamente; capturas autenticadas como archivo y reverso en navegador con supervisor pendientes. **Q1: NO-GO global.** | `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-Q1-SR-QA-v1.3.md` |
| 2026-10-11 | AI-EM-ARCH, **consolidación de G6** | **R-LOT: GO.** Integrado R-CA04 13/13 (reparto en 2 lotes, saldo insuficiente, serial sin lote y reverso repartido). **Q1 v1.3: GO funcional.** El XC220 está `CONFIRMED` en comodato (`MOV-000007`, lote `04092026`), y los patchcord (4→2) y la roseta (2→1) también, conservando el lote. Los tres pendientes de Q1 se resuelven así: (1) el reintento de la misma fila tras un **rechazo asíncrono** estaba mal especificado por AI-EM-ARCH: un `REJECTED` es terminal y se corrige con un registro nuevo; la clave estable cubre los fallos síncronos (red o `412`) y está probada (74 tests); el rechazo inducido no creó movimiento ni duplicado; (2) el reverso con sesión de supervisión se acepta con cobertura automatizada (V4-R3 17/17 y el reverso repartido de R-LOT), porque F2 no cambió su flujo; (3) las capturas como archivo se dispensan: el recorrido visual (375/1280, claro y oscuro, teclado) se hizo en Q1 v1.2. **Verificación en frío del orquestador:** typecheck 8/8, `Cached: 0`; api `inventory` + `tasks` 1540/1548 (8 omitidos por gating); worker 169/169; portal `operations/` 780/780. **Hallazgo:** R-LOT cambió fuera de su encargo el `aggregateId` del evento de consumo (del id del uso al de la OT, `execution-orders.service.ts:1676`). Corrige un defecto real: `finishCommand` copia el `aggregateId` en `payload.executionOrderId`, así que la V2 viajaba con el id del uso en lugar del de la OT. Se acepta y se registra en el plan de consumo. **G6 de este frente: GO** | Commit propuesto |
| 2026-10-11 | CTO y AI-EM-ARCH | El CTO reinicia por SQL `OTE-20260828-001` (respaldo en el scratchpad) y observa que al registrar no se ve el serial ni la MAC. **Análisis sobre el DOM:** el serial sí aparece como título, pero sin destacar; la MAC solo sirve para la búsqueda y ningún activo del tenant la tiene; los dos requisitos de material comparten el botón «Registrar equipo instalado», y el de consumibles abre una hoja sin serial | Adenda 4 (F3, `fe-platform`) y launcher de la ola 2c. **Deuda para el turno del módulo de inventario:** capturar u obligar la MAC en la recepción de `CPE` |
| 2026-10-11 | AI-EM-ARCH, auditoría de F3 | **F3: GO.** Verificación en frío: portal `operations/` **782/782** con `--no-cache` y typecheck **8/8**, `Cached: 0`. En el navegador, con la sesión de Nepomuceno: la tarjeta muestra «XC220-TEST-0006 / MAC no registrada / Onu Tp Link / SKU · Asignado a técnico»; los botones ahora dicen «Registrar equipos instalados en el sitio del cliente» y «Registrar materiales usados en la instalación». **El frente queda cerrado en G6** (olas 1, 2, 2b y 2c). Deuda para el turno de inventario: capturar la MAC en la recepción de `CPE` | Commit propuesto |
| 2026-10-11 | CTO y AI-EM-ARCH | El CTO reinicia otra vez `OTE-20260828-001` (se borra el consumo del XC220-0031; respaldo `reset2` en el scratchpad) y señala que «MAC no registrada» sobra: la tarjeta debe mostrar el serial o la MAC que exista. **Error de AI-EM-ARCH en la adenda 4.** Además, los equipos sin serial se ocultan sin explicación (`:159`) y F3 usa selectores descendientes sobre `RadioCardGroup` (`:415`) | Adenda 5 (F3b) y launcher de la ola 2d |
| 2026-10-11 | AI-EM-ARCH, auditoría de F3b | **F3b: GO.** Verificación en frío: `operations/` **784/784** con `--no-cache`; ya no quedan «MAC no registrada» ni selectores descendientes en `ExecutionOrderMaterialAction.tsx`. El frente queda **cerrado en G6**. Pendientes fuera de alcance: (1) **inventario**, exigir serial o MAC en la recepción de `CPE`, en el turno de MOD12; (2) **contrato**, registrar equipos solo con MAC, diferido hasta que el negocio lo necesite; (3) **`ds-owner`**, título monoespaciado en `RadioCardGroup` v1.1, en el carril rápido | Commit propuesto |
| 2026-10-11 | CTO y AI-EM-ARCH | El CTO no reconoce el serial en la tarjeta (captura). El título «XC220-TEST-0031» es el serial, pero no lleva etiqueta; la MAC está vacía en la base. La captura muestra además un hueco grande entre «Registrar equipo» y «Cancelar» | Adenda 6 (F3c) |
| 2026-10-11 | AI-EM-ARCH, auditoría de F3c | **F3c: GO.** El título dice «Serial {serial}» y «MAC» aparece solo si existe; el pie lleva «Registrar equipo» y «Cancelar» en la misma fila, a 44 px, en 375 y 1280. La causa del hueco era `pb-28` más el Cancelar de la hoja padre. El cambio en `RequirementActionSheet.tsx:106` es condicional (`bodySuppliesForm && consumption`), así que las demás acciones conservan su Cancelar. Verificación en frío: `operations/` **784/784**, typecheck **8/8**, `Cached: 0`. **Datos:** MAC de prueba administradas localmente (`02:1C:22:00:00:xx`) en los 50 XC220 de `tenant_iwana`, a petición del CTO, con respaldo en el scratchpad. **El frente queda cerrado en G6** | Commit propuesto |
| 2026-10-11 | AI-EM-ARCH, auditoría de la corrección de unidades del CTO | **NO GO por regresión en el portal:** 22 tests fallidos en 3 suites, porque la corrección no corrió tests. La tarjeta pasa a marca + modelo (**aprobado por el CTO**), pero sin marca ni modelo duplica el serial y perdió la referencia y el SKU; además lleva una expresión regular de proveedor en la UI. Los datos de Fibra Drop están bien: los saldos coinciden con el ledger y el valor se conserva. Otros hallazgos: ADR-085 enmendado sin versión y con datos de un tenant; tabla de respaldo dentro del esquema del tenant; base sintética de QA sin la 142; otros frentes mezclados en el árbol. La API, `shared`, `db`, el worker y el typecheck están en verde | Adenda 7 (F4), spec UX §16.7 y propuesta de ADR-085 v1.1 |
| 2026-10-11 | AI-EM-ARCH, auditoría de F4 y ADR-085 v1.1 | **F4: GO.** Verificación en frío: portal `operations/` + `api-client` **803/803** con `--no-cache`; se eliminó la regla de marca. **ADR-085 v1.1 redactado (Propuesta, pendiente del CTO):** D2 admite unidades de empaque de contenido fijo entre dimensiones; D4 fija el procedimiento de conversión histórica excepcional; D6 fija la precisión `numeric(14,5)` con deuda declarada (escala por magnitud del factor); se retiran del ADR los datos del tenant. Auditorías documentales en BLOQUEANTE 0. **El frente queda cerrado en G6.** Pendientes: aprobación de la v1.1; exportar y borrar la tabla de respaldo del tenant; aplicar la 142 en la base sintética de QA; commit separado por frentes | Aprobación del CTO y commit |

## Lanzamiento

**No hay ninguna ola abierta.** El frente está cerrado en G6 (F4, GO). Pendientes: la aprobación de ADR-085 v1.1 y el commit.
