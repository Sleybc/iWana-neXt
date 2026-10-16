# PROMPT — `privacy` Fase 1b · Delta v1.4 · Regla general de mutaciones bloqueadas

**Versión:** 1.4 (delta sobre v1.0 a v1.3; lo que no se toca sigue vigente) · **Fecha:** 2026-10-16 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado
**Plan:** [2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md](../plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md) v1.4 · **Base:** `main` en `0af184d4` más el árbol de la Ola 2-bis sin commitear
**Origen:**
- [V2′](../informes/INFORME-PRIVACY-FASE-1B-V2-SEC-v1.1.md): NO-GO, dos P1 y un P2;
- [V3′](../informes/INFORME-PRIVACY-FASE-1B-V3-REV-v1.1.md): un hallazgo menor;
- [V4′](../informes/INFORME-PRIVACY-FASE-1B-V4-GATES-v1.1.md): API con 69 tests en rojo;
- [V1](../informes/INFORME-PRIVACY-FASE-1B-V1-QA-v1.1.md): suite escrita, sin ejecutar.

H1 a H10 de v1.3 quedan corregidos según V2′ y V3′.

## 1. Causa raíz (defecto del emisor)

v1.1 §5.3 **enumeró** rutas en vez de fijar una regla. Quedaron fuera las transiciones de estado, los borrados y varios subrecursos. Inventario de AI-EM-ARCH de las rutas de mutación vigentes:

| Controller | Rutas sin guarda en v1.1 §5.3 |
| --- | --- |
| `subscribers.controller.ts` | `PATCH :id/status`, `DELETE :id` |
| `contracts.controller.ts` | `POST :id/activate`, `suspend`, `reactivate`, `terminate`, `archive`; `DELETE :id`; `DELETE :id/stratum-evidence` |
| `expedientes.controller.ts` | `PATCH :id/status`, `POST :id/reactivate`, `PATCH :id/installation-operational-refs`, `PATCH …/document-supports/…/status`, `DELETE …/document-supports/…`, `PATCH :id/consents/:consentId/revoke` (las mutaciones de subrecursos ya estaban en v1.2 §4) |

## 2. R10 v1.4: regla general

**Toda** ruta `POST`, `PATCH`, `PUT` o `DELETE` de `subscribers.controller.ts`, `contracts.controller.ts` y `expedientes.controller.ts` que opere sobre un titular con `DATOS_BLOQUEADOS` activo responde **409 `PRIVACY_DATA_BLOCKED` antes de escribir nada**.
- No cuenta `crm.blocked_data.read` ni `privacy.read`.
- El titular se resuelve por el `:id`, el `:subscriberId` o el `subscriberId` del cuerpo, según la ruta.

**Excepciones cerradas**, que la regla deja explícitas:

| Ruta | Motivo |
| --- | --- |
| `POST /crm/subscribers/search` | Es una lectura; la cubre R9 |
| `POST /crm/subscribers` y `POST /crm/expedientes` | Crean un registro nuevo y no hay titular que resolver. Ver la deuda D-H15 |

**Implementación (B3):**
- Un decorador de método, por ejemplo `@GuardBlockedTitular(resolver)`, que registre la metadata `privacy:blocked-titular-guard` y aplique la guarda antes del handler (guard o interceptor de Nest). Las llamadas sueltas a `assertNotBlocked` se migran al decorador.
- **Test de arquitectura** (`crm-blocked-mutations.arch.spec.ts`): recorre por reflexión (`PATH_METADATA` y `METHOD_METADATA`) todos los handlers de los tres controllers. Todo handler de mutación debe tener la metadata o estar en la lista cerrada de excepciones. Una ruta nueva sin guarda debe romper el test.
- **Tests HTTP:** al menos uno por familia (transición de estado, borrado, subrecurso, contrato), con `SALES`, con `ACCOUNTANT` que tiene `crm.blocked_data.read` y con `privacy.read`: siempre 409, y el repositorio no recibe escrituras.

## 3. Correcciones

| # | Hallazgo | Corrección | Dueño |
| --- | --- | --- | --- |
| H11 | V2′, dos P1: transiciones de suscriptor y de contrato mutan bloqueados | §2 completo | B3 |
| H12 | V2′ P2 y V4′: `expedientes.controller.fase2.http.spec.ts` y su par fallan (69 tests) porque el fixture HTTP no provee el `DataSource` ni `logWithin` que exige C3 | Completar los dobles sin debilitar aserciones; la matriz 200 y la auditoría de C3 quedan probadas | B3 |
| H13 | V3′ menor: OpenAPI de `counts` en la vista previa | Alinear el schema de OpenAPI con `erasurePreviewSchema` | B1 |
| H14 | V4′: el build terminó 7/7, pero el proceso de turbo quedó abierto | V4″ repite el build y, si se cuelga, identifica la tarea | V4″ |
| H9′ | V1 no ejecutó: la base no estaba migrada | **Verificado por AI-EM-ARCH:** `dbiw` tiene 21 schemas tenant y **ninguno** tiene las columnas de la 149 ni de la 150. La precondición del CTO sigue pendiente. Además, `sr-qa` carga `DB_PORT` y `DB_NAME` desde `.env.development` (5433, `dbiw`), nunca el valor por defecto 5432 | CTO + V1 |

**Deuda registrada (fuera de la Fase 1b):**

| Severidad | Deuda |
| --- | --- |
| P2 (D-H15) | Crear un suscriptor o un expediente nuevo con el documento de un titular bloqueado no se detecta: es un tratamiento nuevo sin autorización. Fase 2: comprobarlo por HMAC de documento al crear |

## 4. Evidencia obligatoria

Para B1 y B3:
- la suite **completa** de `@iwana/api` sin caché, con 0 tests fallidos;
- `pnpm exec turbo run test --force --continue` con los totales;
- la API arrancada **contra `dbiw` migrada hasta la 151** hasta `/health`.

**Un informe con tests en rojo no se acepta como entregado.**
