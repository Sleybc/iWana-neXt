# ADR-074: Autenticación de Redis en todos los entornos

**Versión:** 1.0
**Estado:** Propuesto
**Fecha:** 2026-08-03
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobación requerida:** CTO Humano — excepción de seguridad vigente cuyo levantamiento cambia el baseline (§5 de la matriz de decisiones del perfil AI-EM-ARCH)
**Revisor obligatorio:** AI-SEC-ENG
**Módulos:** Plataforma transversal — Redis como backend de BullMQ y del rate limiter
**Relacionado:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A9

---

## Contexto

Redis corre **sin autenticación** en desarrollo y producción:

```yaml
command: redis-server --save 60 1 --loglevel warning   # docker-compose.yml:82
```

No hay `--requirepass`. La variable `REDIS_PASSWORD` existe en `.env.example` y
**se consume en un solo sitio del repositorio**: el overlay E2E
(`docker-compose.e2e.yml:56`), y allí como `${REDIS_PASSWORD-}`, es decir
opcional. Ningún servicio de producción la recibe.

El riesgo ya está **declarado** en `.env.example:90-93`:

> "El baseline vigente no exige autenticación Redis. Riesgo residual: una
> instancia expuesta sin `REDIS_PASSWORD` permite acceso no autenticado;
> mantener Redis en la red interna y definir el control obligatorio en
> SEC-ENG/ADR antes de exponerlo."

Ese comentario **nombra este ADR como el mecanismo que debía existir y no
existía**. Esta decisión es exactamente lo que pedía.

### Qué hay realmente en Redis

No es una caché descartable. Redis es el backend de **BullMQ** —provisioning de
tenants, indexación de búsqueda, análisis de evidencia, relay de outbox— y del
**rate limiter** del que depende un control de seguridad ya verificado
(`scripts/e2e-redis-fault.mjs`, QA-33, comportamiento fail-closed).

Acceso no autenticado a Redis significa: leer los payloads de todos los jobs
—que llevan identificadores de tenant y de entidad—, inyectar jobs arbitrarios
que el worker ejecutará con privilegios de aplicación, y borrar las claves del
rate limiter.

### Por qué el riesgo hoy es bajo y aun así hay que cerrarlo

Hoy Redis solo escucha en la red interna de Compose y su publicación al host está
ligada a `127.0.0.1`. **No está expuesto.** La mitigación declarada en
`.env.example` —"mantener Redis en la red interna"— se cumple.

Pero es una mitigación **por topología, no por control**, y depende de que nadie
cambie la topología. El propio informe de auditoría registra como deuda abierta
(A4) que **no existe segmentación de redes**: los cuatro Compose usan la red
default, sin separación entre `edge`, `app` y `data`. La única barrera es que
nadie publique el puerto.

## Decisión propuesta

**Redis exige autenticación en todos los entornos**, incluido desarrollo.

1. `--requirepass` alimentado desde `REDIS_PASSWORD`, que pasa a ser **variable
   obligatoria** (`${REDIS_PASSWORD:?}`) en el archivo base de Compose, con la
   misma semántica de fallo duro que ya tienen `DB_PASSWORD`, `MINIO_ROOT_PASSWORD`
   y `TYPESENSE_API_KEY`.
2. `REDIS_PASSWORD` se propaga a `api-prod` y `worker-prod`, que hoy no la
   reciben.
3. El preflight de `scripts/dev.mjs` (`requiredDevEnvVars`) la incluye, y el test
   que deriva esa lista del propio Compose la protege automáticamente.
4. **Desarrollo también.** Un baseline que solo aplica en producción no se prueba
   nunca: el primer sitio donde se descubre que falta propagar la credencial es
   el despliegue.

### Por qué en desarrollo también

Es la parte discutible de la decisión, así que se argumenta explícitamente. El
patrón del repositorio ya es este: `MINIO_ROOT_PASSWORD` y `TYPESENSE_API_KEY`
son obligatorias en desarrollo y nadie lo considera fricción. Redis es la única
pieza de datos sin credencial, y esa asimetría no tiene justificación técnica.

Además, la auditoría del 2026-08-03 demostró que un control activo se verifica
funcionalmente: al mover la API key de Typesense a entorno se comprobó que
autentica y que su ausencia devuelve 401. Con Redis sin contraseña en desarrollo,
esa clase de verificación es imposible.

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| **A — Solo en producción, dejar desarrollo sin contraseña** | El camino de propagación de la credencial no se ejercita nunca hasta el despliegue. Es el patrón que produce incidentes de configuración en el primer entorno externo |
| **B — Confiar en la segmentación de redes (A4) en lugar de autenticar** | La segmentación no existe todavía y es una decisión abierta. Además son controles complementarios, no sustitutos: defensa en profundidad significa que la red no sea la única barrera |
| **C — Mantener el estado actual con el riesgo declarado** | Es lo que hay hoy. El propio `.env.example` pide que se cierre "antes de exponerlo", y el disparador 3 de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) puede activarse sin previo aviso el día que un tenant real cargue datos |

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | **Indirecto pero real.** Los payloads de BullMQ transportan identificadores de tenant; el acceso no autenticado permitiría inyectar jobs dirigidos a un tenant arbitrario |
| **Seguridad** | **Es el objeto de la decisión.** Cierra el último servicio de datos sin autenticación y añade defensa en profundidad frente a la ausencia de segmentación de redes (A4) |
| **Escala** | Sin impacto. `requirepass` no tiene coste apreciable |
| **Regulación** | Ley 1581: los payloads de jobs pueden contener identificadores asociados a personas. Con datos reales, un Redis sin autenticación es difícil de sostener — enlaza con el disparador 3 de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) |
| **Autoridad** | Levanta una excepción de seguridad vigente y declarada: **decisión del CTO** |

## Consecuencias

**Positivas**

- Ningún servicio de datos queda sin autenticar.
- El comentario de riesgo residual de `.env.example` puede retirarse porque el
  riesgo deja de existir, no porque se reescriba.
- La ruta de propagación de la credencial queda ejercitada a diario en desarrollo.

**Negativas / costo**

- Una variable obligatoria más en el preflight. Quien tenga un `.env` antiguo
  verá un fallo accionable al arrancar — que es el comportamiento correcto.
- Hay que revisar los consumidores: `apps/api`, `apps/worker` y
  `scripts/e2e-redis-fault.mjs`, que hoy asumen conexión sin credencial.

**Riesgos**

- **Que el rate limiter falle de forma silenciosa** si la credencial no se
  propaga a algún consumidor. Mitigación: el comportamiento fail-closed ya está
  verificado por QA-33 y `scripts/e2e-redis-fault.mjs` cubre exactamente ese caso.

## Criterio de verificación

1. `redis-server` arranca con `--requirepass` en los tres perfiles.
2. `REDIS_PASSWORD` es `${VAR:?}` en el Compose base y llega a `api-prod` y
   `worker-prod`.
3. El preflight de `pnpm dev` la exige y el test derivado del Compose lo protege.
4. **Verificación funcional, no solo de arranque:** una conexión sin credencial
   es rechazada y una con credencial es aceptada — el mismo criterio que se
   aplicó a Typesense el 2026-08-03.
5. Suite E2E en verde, incluida la prueba de fallo de Redis de QA-33.

## Referencias

- [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A9, §6 propuesta 19
- `docker-compose.yml:82` — el comando sin `--requirepass`
- `docker-compose.e2e.yml:56` — único consumidor actual, y opcional
- `.env.example:90-93` — riesgo residual declarado que este ADR cierra
- `scripts/e2e-redis-fault.mjs` — QA-33, comportamiento fail-closed del rate limiter
- [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) — disparador 3, tratamiento de datos reales
