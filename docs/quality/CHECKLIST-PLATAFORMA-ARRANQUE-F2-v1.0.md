# CHECKLIST — Plataforma · Experiencia de arranque · F2 API de estado de arranque

**Fecha de apertura:** 2026-08-09
**Estado:** Abierto — bloqueado por F0 (contrato C1)
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F2-v1.0.md`
**Responsable:** AI-SR-FULL · **revisión reforzada obligatoria de AI-SEC-ENG**
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase.**
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Estructura y boundaries

- [ ] Módulo `apps/api/src/modules/system/` creado con módulo, controlador, servicio y pruebas
- [ ] Registrado en `apps/api/src/app.module.ts`
- [ ] **El módulo de salud no fue tocado** *(CA-F2-10)*
- [ ] Sin acceso directo a tablas de otros módulos, sin imports circulares
- [ ] **Sin contexto de tenant**: no se resuelve tenant, no se abre `search_path`, no se lee schema tenant
- [ ] El contrato C1 **no se amplió** en esta fase

## 2. Endpoint

- [ ] `GET /api/v1/system/boot-status` responde sin autenticación *(CA-F2-01)*
- [ ] Devuelve exactamente la forma de C1 *(CA-F2-01)*
- [ ] Documentación OpenAPI actualizada
- [ ] Cabecera de no almacenamiento presente
- [ ] El porcentaje se calcula con `calculateBootPercent` de C1, **no con lógica duplicada** *(CA-F2-12)*

## 3. Sondas

- [ ] Base de datos — verificación mínima de conexión
- [ ] Caché — ping
- [ ] Almacenamiento — existencia del bucket
- [ ] Búsqueda — consulta de salud
- [ ] Esquema — **sin exponer números, nombres ni identificadores de migración** *(CA-F2-06)*
- [ ] Trabajos en segundo plano — **lee** la marca de vida en la caché; **no la emite** *(CA-F2-15)*
- [ ] Identidad — **no consulta ni reporta la existencia de cuenta de administrador** *(CA-F2-07)*
- [ ] Todas en paralelo, tolerando fallos individuales, con vencimiento corto por sonda
- [ ] Una sonda que vence produce degradado con pista, **nunca excepción propagada ni mensaje de driver** *(CA-F2-03)*
- [ ] El manejador completa por debajo de un segundo con todas las sondas fallando *(CA-F2-11)*

## 4. Seguridad — ADR-079 Decisión 5

- [ ] Vocabulario genérico: ningún identificador nombra producto o motor *(CA-F2-05)*
- [ ] Estados de conjunto cerrado, **sin `failed`**, sin texto libre
- [ ] Con la fase en listo, **lista de componentes vacía** — con prueba *(CA-F2-02)*
- [ ] Ninguno de los campos prohibidos aparece en la respuesta: versiones, nombres de producto, hostnames, puertos, endpoints internos, nombres de schema, identificadores o conteos de migración, conteos de tenant o usuario, marcas de tiempo de arranque, uptime, identificador de build, mensajes de driver, trazas
- [ ] **Prueba de control negativo**: añadir cualquier campo al DTO hace fallar la prueba *(CA-F2-04)*
- [ ] Caché en memoria de un segundo, compartida entre peticiones
- [ ] **Documentada en el código como control de seguridad**, no como optimización
- [ ] N peticiones dentro de la misma ventana producen **una sola** ronda de sondas — con prueba *(CA-F2-08)*
- [ ] Límite de tasa propio, alineado con la cadencia de polling
- [ ] El límite rechaza el exceso sin filtrar información *(CA-F2-09)*
- [ ] Nunca PII ni credenciales en logs del módulo

## 5. Dependencia del latido del worker

El latido **no pertenece a esta fase**: lo encarga [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md), que cierra el hallazgo B4 de la auditoría Docker.

- [ ] **No se implementó emisor propio** de la marca de vida
- [ ] La sonda consume la marca según el contrato de aquel prompt
- [ ] **El healthcheck del contenedor de trabajos en segundo plano NO se sustituyó** *(CA-F2-16)*
- [ ] Si el latido aún no existe: sonda implementada contra su contrato y verificada con doble, con la dependencia registrada en §Pendientes
- [ ] **CA-F2-15 cerrado solo cuando el latido real esté publicado** — no antes
- [ ] La marca **no** se amplió para servir a esta sonda; ante insuficiencia, la sonda se degrada

## 6. No regresión

- [ ] `GET /api/v1/health` responde **exactamente igual** que antes — con control de regresión *(CA-F2-10)*
- [ ] Ningún healthcheck de contenedor modificado
- [ ] Ningún endpoint adicional de diagnóstico, métricas o preparación añadido

## 7. Revisión de seguridad

- [ ] Revisión formal de AI-SEC-ENG archivada en `docs/security/`
- [ ] **Veredicto favorable** *(CA-F2-13)*

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm --filter @iwana/api test` | pendiente | — | — |
| `pnpm --filter @iwana/api lint` | pendiente | — | — |
| `pnpm typecheck` | pendiente | — | — |
| Control de regresión sobre `/api/v1/health` | pendiente | n/a | — |
| Control negativo del DTO | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

**`[DESEMPATE]` resuelto · AI-EM-ARCH · 2026-08-09**
**Área RACI:** infraestructura y backend — medio de la marca de vida del worker.
**Posiciones:** [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md) dejaba abierta la elección entre archivo local del contenedor del worker y clave en la caché con vencimiento, y pedía que AI-SR-FULL decidiera y documentara el motivo. F2 necesita leer la marca **desde otro contenedor**.
**Decisión:** el medio es la **caché**. Un archivo local del worker no es observable desde la API, así que la opción de archivo queda descartada.
**Justificación:** la lectura entre contenedores no era un requisito conocido cuando se emitió aquel prompt; ahora lo es.
**Alcance de la sustitución:** solo la elección de medio. El resto de aquel prompt sigue vigente sin cambios.
**Registro en:** este checklist · [tablero](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) §4 · [PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md)

**Recordatorio de escalación:** toda excepción de seguridad escala al CTO. **AI-EM-ARCH no puede concederla.**

## Salida de fase

- [ ] Todos los criterios CA-F2-01 a CA-F2-16 cubiertos con evidencia — **CA-F2-15 puede quedar abierto** con su dependencia registrada
- [ ] Revisión de seguridad archivada con veredicto favorable
- [ ] Informe de fase archivado con `Cached: 0`
- [ ] Fila F2 del tablero actualizada
