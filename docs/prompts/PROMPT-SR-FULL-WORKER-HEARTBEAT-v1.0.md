# PROMPT DE EJECUCIÓN — Heartbeat real del worker y healthcheck con significado

**Módulo:** WORKER (consumidores BullMQ)
**Código:** SR-FULL
**Fase:** WORKER-HEARTBEAT
**Versión:** 1.0
**Fecha:** 2026-08-03
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agente destinatario:** AI-SR-FULL
**Revisor obligatorio:** AI-SR-QA (criterio de aceptación observable)
**Consulta:** AI-PLAT-OPS (forma del healthcheck en Compose)
**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` *(en revisión)*

---

> ## ⚠ Nota de vigencia — 2026-08-09: la elección de medio queda cerrada
>
> **`[DESEMPATE]` resuelto por AI-EM-ARCH.** La instrucción 1 de §3 dejaba abierta la elección del medio de la marca de vida entre **archivo local** y **clave en Redis con TTL**, y pedía a AI-SR-FULL decidir y documentar el motivo. **Esa elección ya no está abierta: el medio es Redis.**
>
> **Razón — requisito nuevo, no corrección.** El frente de experiencia de arranque ([HLD](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md), [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md)) añade un consumidor que no existía cuando se emitió este prompt: la sonda `background` de `GET /api/v1/system/boot-status` debe leer la marca **desde el contenedor de la API**. Un archivo local del contenedor del worker no es observable desde allí, así que esa opción queda descartada por imposibilidad, no por preferencia.
>
> **Alcance de la sustitución: solo la instrucción 1.** Todo lo demás de este prompt sigue vigente y sin cambios — emisor acoplado al bucle de eventos y no a un temporizador aislado (instrucción 2), umbral configurable con default holgado (3), sustitución del probe en ambos Compose (4), `init: true` en `worker-prod` (5), tests (6) y las restricciones de §4.
>
> **Sigue siendo tuya la advertencia de §3.1:** un healthcheck que depende de Redis reporta `unhealthy` cuando el caído es Redis y no el worker. Ese trade-off **se acepta**, pero **debe quedar argumentado en el código** igual que pedía el texto original, y la interacción con `scripts/e2e-redis-fault.mjs` debe verificarse explícitamente.
>
> **Registro:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) §Consecuencias · [tablero del frente](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) §4 DES-01 · [PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md](PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md)
>
> **Quién consume tu entrega:** F2 del frente de arranque. Si ejecutas este prompt antes que F2, su sonda `background` leerá tu marca directamente. Si F2 va primero, implementará la sonda contra este contrato y la cerrará cuando publiques.

---

## 0. Contexto (ya diagnosticado — no repetir el análisis)

El healthcheck del worker **no verifica nada**:

```yaml
test: ['CMD-SHELL', 'node -e "process.kill(1, 0)"']
```

`process.kill(pid, 0)` no envía señal: solo comprueba que el proceso exista y sea
señalizable. El PID 1 es el propio proceso del contenedor, así que la condición es
cierta **mientras el contenedor viva**. Un worker con el loop de BullMQ colgado,
con la conexión a Redis caída o con todos los procesadores atascados reporta
`healthy` igualmente.

Está en `docker-compose.prod.yml:254` y `docker-compose.e2e.yml:94`. Es el
hallazgo **B4** de
[INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)
§2.1, el único bloqueante de esa auditoría que sigue abierto, y el propio archivo
lo documenta ya como deuda conocida.

**Por qué no lo resolvió la fase PLAT-OPS/CONVERGENCIA-NODE:** un liveness real
exige que el proceso emita una señal de vida. Eso es código de aplicación, no
configuración de infraestructura.

## 1. Objetivo exacto de la fase

**Resultado esperado:** el healthcheck del worker distingue un worker sano de uno
con el loop detenido, y lo hace sin abrir un puerto HTTP de administración.

**Lo que sí entra**

| # | Alcance |
| --- | --- |
| E1 | El proceso del worker emite periódicamente una marca de vida que solo se actualiza si su bucle de eventos y su conexión a BullMQ están operativos |
| E2 | Una comprobación invocable desde `HEALTHCHECK`/Compose que falla si la marca supera un umbral de antigüedad |
| E3 | Sustituir `process.kill(1, 0)` en `docker-compose.prod.yml` y `docker-compose.e2e.yml` |
| E4 | Añadir `init: true` a `worker-prod`, hoy deliberadamente ausente |
| E5 | Tests unitarios del emisor y del verificador, incluido el caso de marca vencida |

**Lo que NO entra**

- Exponer un servidor HTTP en el worker. Si concluyes que es la única vía
  razonable, **detente y consúltalo**: cambia la superficie de red del servicio y
  es decisión de AI-EM-ARCH con revisión de AI-SEC-ENG.
- Métricas, tracing o instrumentación de observabilidad general.
- Cambiar la lógica de los procesadores BullMQ.
- Tocar el healthcheck de `api-prod`, que ya es un probe HTTP real.

## 2. Artefactos de entrada obligatorios

- **Informe de origen:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.1 B4, §6 propuesta 16
- **Código:** `apps/worker/src/main.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/processors/`
- **Infraestructura:** `docker-compose.prod.yml:240-262`, `docker-compose.e2e.yml:88-98`, `apps/worker/Dockerfile`
- **Restricción vigente:** [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) — G7 diferido; nada de esta fase presupone entorno productivo
- **Skills:** `bullmq-specialist`, `nestjs-expert`, `testing-patterns`

**Artefacto faltante detectado:** `apps/worker/src` no tiene módulo de salud
alguno. No hay precedente en el worker que seguir; sí lo hay en la API
(`HealthModule`, `GET /api/v1/health`), pero **no es trasladable** porque implica
abrir un puerto.

## 3. Instrucciones de ejecución

1. **Elegir el medio de la marca de vida y justificarlo por escrito.** Dos
   candidatos razonables:
   - **Archivo local** en un directorio escribible por el usuario `worker`
     (uid 1001). Simple, sin dependencias, y el healthcheck lo lee con `node -e`.
     El runner es de solo-copia: verifica que la ruta elegida sea escribible.
   - **Clave en Redis** con TTL. Comprueba de paso que la conexión a Redis está
     viva, que es justamente lo que el probe actual no cubre. A cambio, un
     healthcheck que depende de Redis reporta `unhealthy` cuando el caído es
     Redis y no el worker — decide si eso es deseable y déjalo argumentado.

   No se impone una: elige y **documenta el motivo en el propio código**.

2. **Emitir la marca desde el bucle de eventos del worker**, no desde un
   `setInterval` aislado que sobreviviría a un bloqueo de los procesadores. El
   objetivo es que la marca deje de actualizarse cuando el worker deja de
   funcionar, no cuando el proceso muere.

3. **Umbral configurable** por variable de entorno con default explícito. Debe
   ser holgado frente al intervalo de emisión: un umbral demasiado ajustado
   produce reinicios en falso bajo carga.

4. **Sustituir el probe** en los dos Compose, retirando el comentario de deuda
   conocida que documenta el defecto actual.

5. **Añadir `init: true` a `worker-prod`.** Se dejó fuera a propósito porque con
   `docker-init` como PID 1 el probe actual sería todavía menos significativo;
   con un heartbeat real esa objeción desaparece.

6. **Tests:** que la marca se actualiza mientras el worker corre, que el
   verificador falla con una marca vencida, y que el umbral es configurable.

## 4. Restricciones no negociables

- **No abrir puertos** en el worker sin consulta previa.
- **No romper la ejecución no privilegiada:** el worker corre como `uid 1001`. Si
  la marca es un archivo, su directorio debe ser escribible por ese usuario sin
  volver a root ni ampliar permisos del árbol.
- **Sin PII ni identificadores de tenant en la marca.** Es una señal de vida, no
  un registro: nada de payloads de jobs ni datos de negocio.
- **No romper el fail-closed del rate limiter** ni las pruebas de QA-33
  (`scripts/e2e-redis-fault.mjs`), que pausan Redis a propósito. Si eliges Redis
  como medio, **verifica explícitamente la interacción con esa prueba**.
- No tocar `apps/api` ni la configuración de nginx.
- Respetar los boundaries del Modulith: sin acceso directo a tablas de otro
  módulo, sin imports circulares.

## 5. Entregables

**Técnicos:** emisor del heartbeat, verificador invocable, dos Compose
actualizados, `init: true` en `worker-prod`, tests unitarios.

**Documentales:**

- Informe de fase `docs/informes/INFORME-SR-FULL-WORKER-HEARTBEAT-v1.0.md`.
- **Actualizar** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md):
  B4 pasa a **Corregido** en §2.1 y sale de la tabla de deuda de §7. **No crear un
  informe de auditoría nuevo.**

## 6. Criterios de aceptación

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| CA-01 | El worker arranca y alcanza `healthy` | `docker inspect` sobre el contenedor real |
| **CA-02** | **Un worker con el loop detenido pasa a `unhealthy`** | Provocar la condición —por ejemplo con `SIGSTOP` al proceso— y observar la transición. **Este es el criterio que define la fase: sin esta demostración no hay entrega**, porque es exactamente lo que el probe anterior no detectaba |
| CA-03 | El umbral es configurable y su default está documentado | Inspección + test |
| CA-04 | Sin puertos nuevos expuestos | `docker inspect` del contenedor |
| CA-05 | El worker sigue como `uid 1001` | `id -u` dentro del contenedor |
| CA-06 | `init: true` activo en `worker-prod` sin romper el probe | Arranque real |
| CA-07 | Tests unitarios en verde, incluido el caso de marca vencida | `pnpm --filter @iwana/worker test` |
| CA-08 | Suite completa **con `Cached: 0`** | `turbo run test --concurrency=1 --force` |
| CA-09 | E2E R4.1 en verde, incluida QA-33 | Corrida E2E |
| CA-10 | Auditorías documentales en `BLOQUEANTE: 0` | `pnpm audit:doc-locations` y `pnpm audit:adr-citations` |
| CA-11 | Entorno Docker sin artefactos residuales | Baseline de **8 imágenes / 2,215 GB / caché 0 B** |

**Sobre CA-02.** Un contenedor `healthy` no demuestra nada por sí solo: el probe
anterior también lo lograba. Lo que hay que demostrar es la **transición a
`unhealthy`** ante un worker que dejó de trabajar.

**Sobre CA-08.** Exigir `Cached: 0`. Un `pnpm test` verde con tareas cacheadas no
es evidencia de que se haya ejecutado nada.

## 7. Criterio de stop/go

**Detenerse y consultar a AI-EM-ARCH si:**

- La única solución viable exige abrir un puerto HTTP en el worker.
- El medio elegido entra en conflicto con el fail-closed de QA-33.
- No hay ninguna ruta escribible por `uid 1001` sin ampliar permisos.
- `init: true` rompe el arranque del worker.

**Documentar causa en:** `docs/informes/INFORME-SR-FULL-WORKER-HEARTBEAT-v1.0.md`

**Umbral de escalación:** solo con el **error real capturado**. Un contenedor que
sale con código 1 no es evidencia de defecto mientras no se haya leído su stderr;
reproducir un arranque con la red y el entorno correctos preservando logs es
parte de esta fase. *(Es el fallo de método que bloqueó la fase
PLAT-OPS/CONVERGENCIA-NODE durante una sesión entera.)*

## 8. Criterio de salida

- Heartbeat emitido desde el bucle real del worker: **sí**
- **Transición a `unhealthy` demostrada con el worker detenido: sí**
- Los dos Compose sin `process.kill(1, 0)`: **sí**
- `init: true` en `worker-prod`: **sí**
- Tests y E2E en verde, con `Cached: 0` en la suite: **sí**
- B4 marcado como corregido en el informe de auditoría: **sí**
- Entorno Docker devuelto al baseline: **sí**
