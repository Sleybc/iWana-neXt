# Spec — `crm/contracts` · Lectura de marcas de privacidad dentro de la transacción

**Versión:** 1.0
**Estado:** Aprobada. G0 del CTO el 2026-11-06 sobre los cinco puntos de §8. No se implementa antes del commit de MOD14 Fase 01.
**Fecha:** 2026-11-06
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** media, requisito de G7. No hay producción hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)).
**Origen:** hallazgo P2 #6 de `boundary-reviewer` en G6 de MOD14, registrado en el [plan de MOD14](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md).
**Plan:** [2026-11-06-crm-marcas-en-transaccion-orquestacion.md](../plans/2026-11-06-crm-marcas-en-transaccion-orquestacion.md)
**Evidencia:** [scripts y salida](../informes/evidence/crm-marcas-en-transaccion-2026-11-06/)

---

## 1. Resultado en una línea

CRM contratos llama a `activeMarks` en 27 puntos mientras retiene la conexión de su transacción, y el adaptador pide otra conexión al mismo pool. Con 10 peticiones simultáneas y el pool por defecto, todas pueden quedar esperándose y fallar a los 5 s. La corrección recomendada no saca la lectura de la transacción: la hace sobre la misma conexión, pasando `manager` al puerto.

## 2. Método y límites

- Análisis AST de `apps/api/src` (`txports.js`): llamadas a puertos dentro de `runInTenantSchema` o `withPrivacyTenant`, directas y a través de métodos `this.*` de la misma clase. Los puntos de proyección se contaron aparte, porque el puerto llega a la función como argumento.
- **Límite del AST:** no sigue llamadas a otros servicios. Una ruta que entre a una transacción y llame a otro servicio no aparece.
- Las líneas citadas son del árbol sin commitear del 2026-11-06. El ejecutor debe localizarlas de nuevo después del commit de MOD14.
- La reproducción (§4) es un **modelo** con `pg` puro: misma forma de retención y espera, mismos `max` y `connectionTimeoutMillis`. No se midió la API real. La prueba de CA-1 lo hará.

## 3. Inventario

El adaptador abre su propia conexión con `withPrivacyTenant` (`privacy-marks.adapter.ts:19`, `privacy-tenant-query.ts:10`).

| Grupo | Puntos | Dónde | Efecto de la marca |
| --- | --- | --- | --- |
| Agenda de corte | 1 | `contracts.service.ts:599` | Enmascara la lectura |
| Guarda `assertSubscriberNotBlocked` dentro de transacción | 11 | `contracts.service.ts:177, 278, 853, 964, 1100, 1114, 1175, 1211, 1260, 1461, 1633` | Rechaza la mutación con 409 |
| Proyección de lectura | 4 | `contracts.service.ts:418, 455, 672`; `subscribers.service.ts:1741` (ficha 360°) | Enmascara la lectura |
| Proyección de la respuesta de una mutación | 11 | `contracts.service.ts:229, 369, 926, 985, 1076, 1142, 1240, 1277, 1296, 1673, 1736` | Enmascara la respuesta |

Son 27 puntos, pero **solo tres llamadas reales** al puerto: `contracts.service.ts:599`, `:800` y `contract-read-projection.ts:54`. La guarda también se usa fuera de transacción (`:822`, `:825`). Una mutación como `update` adquiere dos conexiones extra: guarda y proyección.

Otras llamadas a `activeMarks` en CRM y Billing quedaron fuera de transacción en el análisis.

**Otros puertos con conexión propia en las mismas rutas:**

| Puerto | Puntos | Adaptador |
| --- | --- | --- |
| `privacyAuthorizationReadPort.hasActive` | `contracts.service.ts:184, 285` | `withPrivacyTenant`, igual que las marcas |
| `commercialCatalogPort.getPlanById` y `createSnapshot` | `:994, 1013, 1021`, y por `_resolveVatSnapshot` en `:1053, 1137, 1229, 1284, 1723` | `runInTenantSchema` propio, en otro módulo |

Quitar solo `activeMarks` deja el mismo riesgo en `create`, `createFromExpediente`, `changePlan` y otras rutas.

**Fuera de `contracts.service.ts`:** el AST lista 30 llamadas directas a puertos sin `manager` dentro de una transacción, en assurance, crm, inventory, network y tasks. No se revisó si cada una usa la base de datos. Están en `txports.out`, y entre ellas hay `routerProvisioningPort.apply`, cuya conducta debe mirarse aparte.

## 4. Riesgo real

Pool: `DB_POOL_MAX` por defecto 10 y `connectionTimeoutMillis` 5.000 (`packages/database/src/data-source.ts:166-169`). No encontré otro valor en `.env*`, `docker*` ni `infra`.

Reproducción contra `postgres:18-alpine` desechable (`poolrepro.js`):

| Peticiones simultáneas | Pool | Bien | Fallan | Duración total |
| --- | --- | --- | --- | --- |
| 5 | 10 | 5 | 0 | 69 ms |
| 9 | 10 | 9 | 0 | 62 ms |
| 10 | 10 | 0 | 10 | 5.054 ms |
| 20 | 10 | 0 | 20 | 5.052 ms |

No degrada de forma gradual: pasa de 60 ms a fallo total. Solo hace falta que 10 peticiones coincidan en ese paso, y otro tráfico del pool baja ese umbral. El fallo es cerrado, porque la mutación se revierte y no sirve datos sin proteger. Mientras dura, las mutaciones retienen `FOR SHARE` o `FOR UPDATE` hasta 5 s.

## 5. Mutaciones y carrera

- **Proyección de respuesta:** no decide nada, solo enmascara. Moverla después del commit no abre carrera, pero crea otro problema: si la lectura falla, el cliente recibe error por una mutación ya confirmada.
- **Guarda:** corre bajo `FOR SHARE` del suscriptor, pero los escritores de marcas (`requests.service.ts:343, 809, 1188`) no toman ese bloqueo. Por tanto, el bloqueo **no** serializa la guarda con la apertura de una marca. Esa ventana existe hoy y no la crea esta spec.
- Moverla antes de la transacción ampliaría la ventana y obligaría a leer el suscriptor dos veces.
- **Misma conexión:** con `READ COMMITTED`, que es el nivel en uso, cada sentencia ve lo confirmado. Leer en la transacción o en otra conexión da el mismo resultado, y la transacción no escribe marcas. No cambia ninguna regla.

## 6. Decisión propuesta

**D1. `activeMarks` acepta el `manager` del llamante.**

```ts
abstract activeMarks(
  partyIds: string[],
  ctx?: { manager: EntityManager },
): Promise<Record<string, PrivacyMark[]>>;
```

La forma `ctx: { manager }` ya existe en puertos de Privacy (`contract-standing-read.port.ts:6`) y Billing. La tabla sigue siendo de Privacy: CRM pasa la transacción, no consulta `party_privacy_marks`. Sin `ctx`, la conducta no cambia.

**D2. Tres llamadas pasan `ctx`:** agenda, guarda (parámetro opcional, porque también se usa fuera de transacción) y proyección, que ya recibe `manager`.

**D3. `hasActive` recibe el mismo cambio,** por tener el mismo adaptador y la misma forma.

**D4. El catálogo comercial queda fuera.** Es otro módulo. **Actualización 2026-11-06:** `createSnapshot` solo lee, así que no hay atomicidad en juego; ver la [spec transversal](2026-11-06-transacciones-conexiones-y-efectos-spec.md), §4.

**Descartada: mover las lecturas fuera de la transacción**, que es lo que hizo BR-9 en pagos. Allí era una sola lectura. Aquí son 27 puntos, haría falta leer el `partyId` antes y volver a leerlo, se amplía la ventana de §5 y aparecen errores tras commit.

## 7. Fuera de alcance

- Serializar la guarda con la apertura de marcas (§5).
- Las lecturas de otros módulos: ver la spec transversal. El catálogo entró en esta ola por su D3.
- Cambiar `DB_POOL_MAX`: subirlo mueve el umbral, no quita la espera circular.
- `partyIdsWithActiveMark`: no se llama dentro de transacción en estas rutas.

## 8. Puntos del G0 del CTO (aprobados el 2026-11-06)

1. Aprobar D1 y D2, usar el `manager` en vez de sacar la lectura. **Recomendado.**
2. Incluir `hasActive` en la misma ola (D3). **Recomendado.**
3. Dejar el catálogo para una spec propia (D4). **Recomendado,** antes de G7.
4. Abrir un inventario de las 30 llamadas de otros módulos, antes de G7. **Recomendado.**
5. Secuencia: empezar después del commit de MOD14 Fase 01, porque `contracts.service.ts` tiene cambios sin commitear.

## 9. Criterios de aceptación

| # | Criterio | Prueba |
| --- | --- | --- |
| CA-1 | Con un `DataSource` de `max: 1`, agenda, listado, detalle, ficha 360°, `create`, `update` y `changePlan` responden sin esperar otra conexión. **Debe verse rojo antes del cambio** | Integración contra Postgres real, con el catálogo real |
| CA-2 | Titular con `DATOS_BLOQUEADOS`: 409 `PRIVACY_DATA_BLOCKED` en mutaciones, lecturas enmascaradas y auditoría de `blockedServed` iguales. Las expectativas existentes no cambian | Integración y suites actuales |
| CA-3 | Si la lectura de marcas falla, la mutación se revierte y no queda fila nueva | Integración |
| CA-4 | 20 peticiones simultáneas de listado con pool de 10 terminan sin error | Integración |
| CA-5 | El adaptador con `ctx` usa ese `manager` y no llama a `createQueryRunner`; sin `ctx` sigue igual | Unitaria |
| CA-6 | En `crm/contracts` y en la ficha 360°, ninguna llamada a `activeMarks` o `hasActive` dentro de `runInTenantSchema` queda sin `ctx` | Arquitectura, AST |
| CA-7 | Suite completa de `@iwana/api` sin caché, unitaria e integración, y `privacy/**` sin bajar de su base | `DB_NAME=test`, conteo real |
