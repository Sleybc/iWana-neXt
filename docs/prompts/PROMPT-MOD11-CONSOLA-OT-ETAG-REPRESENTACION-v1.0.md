# PROMPT DE EJECUCIÓN — MOD11: el ETag de la OT debe identificar la representación

**Versión:** 1.0
**Fecha:** 2026-09-14
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (`sr-backend`)
**Origen:** hallazgo de campo del CTO tras desplegar la Ola 1 — la consola seguía mostrando datos viejos con el código nuevo ya cargado
**Severidad:** Alta — afecta a producción, no solo a desarrollo

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobada)
- Contrato ampliado en la Ola 1: `packages/shared/src/contracts/operations/execution-orders.ts` **v1.1**
- ADRs aplicables: ADR-068 (sincronización de OT), ADR-069 (gates)

---

## 1. Qué pasó — el diagnóstico, con su evidencia

Tras entregar la Ola 1, el CTO abrió la OT `OTE-20260828-001` en el navegador y vio **el responsable sin nombre y el checklist sin estado por requisito**, pese a que:

- La OT tiene `assigned_technician_id` poblado y snapshot con 3 requisitos (verificado en BD).
- El usuario técnico existe, `ACTIVE`, con nombre y apellido.
- El `dist` en ejecución contiene `buildAssigneeView`, `allEvaluations`, `requirements` y el predicado de `assetStatus`.
- El proceso del API arrancó **después** de compilar ese `dist`.
- El portal **sí** servía código nuevo: el copy por rol y el aviso «Estado de requisitos no disponible» son de C3/C4.

Portal nuevo recibiendo una respuesta vieja. La causa está en el interceptor del módulo (`apps/api/src/modules/tasks/interceptors/execution-order-response-headers.interceptor.ts`):

```
response.setHeader('ETag', `"${body.version}"`);
```

**`version` es el contador de concurrencia optimista de la orden, no una identidad de la representación.** La OT no cambió de versión al desplegar, así que el ETag siguió idéntico: el navegador revalidó con `If-None-Match`, Express respondió **304 Not Modified** y sirvió el cuerpo cacheado — sin `displayLabel` y sin `requirements`.

Se confirmó porque el E2E de QA, que corre con caché deshabilitada, **sí** mostró los campos nuevos sobre la misma orden.

**Por qué importa más allá de este incidente:** con este ETag, **cualquier ampliación futura del contrato es invisible** para todo cliente que tenga la representación cacheada, hasta que alguien modifique la orden. Un técnico en campo puede quedarse con una consola desactualizada sin ninguna señal. Es un defecto de producción, no de entorno local.

## 2. Decisión arquitectónica — la que debes implementar

El defecto de fondo es que **un mismo valor sirve a dos propósitos incompatibles**:

| Propósito | Qué debe identificar | Quién lo usa |
| --- | --- | --- |
| **Caché HTTP** (`ETag` / `If-None-Match`) | La **representación**: cambia si cambian los campos que se emiten | Navegadores y proxies |
| **Concurrencia optimista** (`If-Match`) | El **estado del recurso**: la versión de la orden | Los comandos de la OT |

**Decisión: se separan.**

1. El **ETag** pasa a identificar la representación: incorpora la versión del contrato además de la de la orden. Un formato como `"<contrato>-<version>"` basta y es barato; la condición real es que **subir el contrato invalide toda caché existente**.
2. El **`If-Match` sigue siendo el número de versión**, como hoy. No se cambia su semántica ni lo que el portal envía.

## 3. La trampa — léela antes de tocar el interceptor

`assertVersion` (`apps/api/src/modules/tasks/services/execution-orders.service.ts:2674-2683`) parsea así:

```
Number.parseInt(ifMatch.replace(/^W\//u, '').replace(/^"|"$/gu, ''), 10)
```

`Number.parseInt('1.1-7', 10)` devuelve **1**: se detiene en el punto, **sin error**. Es decir, si algún cliente siguiera la semántica HTTP correcta —tomar el `ETag` y devolverlo en `If-Match`, que es lo que HTTP prescribe— obtendría un `VERSION_CONFLICT` engañoso en vez de un error de formato.

**El portal de hoy no se rompe**: envía `String(currentVersion)` tomado del cuerpo, no la cabecera (`buildExecutionOrderCommandHeaders`, `apps/portal/src/lib/api-client.ts:6822-6830`). Pero la trampa queda armada para el próximo cliente —una app móvil, una integración— y falla de la peor forma posible: en silencio y con el error equivocado.

Por eso el arreglo incluye **endurecer `assertVersion`**: un `If-Match` que no sea un entero limpio debe ser rechazado como error de formato (400), no interpretado a medias.

## 4. Pasos

1. En el interceptor, componer el `ETag` de modo que incluya la versión del contrato junto a `body.version`. La versión del contrato debe salir de una constante localizable y declarada, no de un literal disperso.
2. Endurecer `assertVersion`: validar que el `If-Match` —tras retirar el prefijo débil `W/` y las comillas— es un entero **completo**. Si no lo es, error de formato explícito, distinto de `VERSION_CONFLICT`.
3. Mantener intacto lo que el portal envía. **No** cambies `buildExecutionOrderCommandHeaders` ni el contrato.
4. Revisar si algún otro endpoint del módulo emite ETag por esta vía y quedaría inconsistente.

## 5. Tests

5. **Regresión del incidente:** dos respuestas del mismo recurso con **la misma `version`** pero distinta versión de contrato producen **ETags distintos**. Es el caso que habría evitado este hallazgo.
6. **Concurrencia intacta:** un `If-Match` con el número de versión sigue funcionando en los comandos, y una versión distinta sigue dando `VERSION_CONFLICT`.
7. **Formato inválido:** un `If-Match` con el ETag completo —no solo el número— produce error de formato, **no** un `VERSION_CONFLICT` silencioso.
8. **Actualiza deliberadamente** `e2e/tests/api/execution-orders-operational.spec.ts:282`, que hoy asume `etag === '"<version>"'`. **No lo ajustes para que pase**: reescríbelo para que afirme la regla nueva —el ETag identifica la representación— y deja constancia en el informe de que el cambio es intencional.
9. Conteo real: jest directo, `--ci --runInBand`, sin turbo y sin `--passWithNoTests`.

## 6. Restricciones no negociables

- **No toques el contrato de `@iwana/shared`.** La v1.1 está cerrada.
- **No cambies la semántica de `If-Match`** ni lo que envía el portal.
- **No toques** `ExecutionOrderAccessGuard`, `assertActorAccess` ni `computeAllowedActions`.
- **No amplíes `@Roles` ni `@Permissions`.**
- Sin PII real en tests.
- Si concluyes que el formato del ETag no puede cambiarse sin romper un consumidor vivo que no he detectado, **detente y emite `[BLOQUEO]`** con el consumidor nombrado: la decisión de §2 es mía y la revisaría con ese dato.

## 7. Entregables

- Interceptor emitiendo un ETag ligado a la representación.
- `assertVersion` que distingue formato inválido de conflicto de versión.
- Los cuatro casos de prueba, en verde con conteo real.
- Informe de fase en `docs/informes/` con la deuda cerrada y el cambio del E2E declarado como intencional.

## 8. Stop/go

**GO si y solo si:**

- Dos representaciones con la misma `version` y distinta versión de contrato **no comparten ETag**.
- Los comandos con `If-Match` numérico siguen funcionando, y el conflicto real sigue dando `VERSION_CONFLICT`.
- Un `If-Match` mal formado da error de formato, no un conflicto engañoso.
- La suite de `tasks` sigue en verde con conteo real, sin regresión sobre los 564 tests vigentes.

**NO-GO si:** para que pasen los tests hubo que relajar `assertVersion` a un parseo aún más tolerante. La tolerancia silenciosa **es** el defecto que este encargo cierra.
