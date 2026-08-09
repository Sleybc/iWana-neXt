# PROMPT — Plataforma · Experiencia de arranque · Fase F2: API de estado de arranque

**Versión:** 1.0
**Fecha:** 2026-08-08
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-SR-FULL · **revisión reforzada obligatoria de AI-SEC-ENG** (superficie de autenticación pública nueva)
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F2-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F2-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F2-v1.0.md`

---

## Contratos congelados que consume esta fase

| Id | Contrato | Ruta | Versión |
|---|---|---|---|
| C1 | Tipos de estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | 1.0 |

**El contrato no se amplía en esta fase.** Si una sonda necesita un campo que C1 no tiene, es un cambio de contrato: se coordina vía AI-EM-ARCH, se versiona y se notifica a F1 y F3. No se parchea en silencio.

### Dependencia externa — el latido del worker ya está encargado

**Esta fase no define el latido del worker.** Ya lo encarga [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md) (2026-08-03), que cierra el hallazgo **B4** de la auditoría Docker y es su dueño: emisor, verificador, umbral configurable, sustitución del probe en ambos Compose y `init: true` en el contenedor de producción.

**F2 consume ese latido; no lo redefine.** Concretamente:

- **No** implementa un emisor propio.
- **No** sustituye el healthcheck del contenedor de trabajos en segundo plano — es alcance del otro prompt.
- **Sí** lee la marca de vida para resolver el componente `background`.

**[DESEMPATE] resuelto por AI-EM-ARCH, 2026-08-08.** El prompt del latido dejaba deliberadamente abierta la elección del medio entre **archivo local** en el contenedor del worker y **clave en la caché con vencimiento**. Esa elección **queda cerrada a favor de la caché**, por una razón que aquel prompt no podía anticipar: F2 necesita leer la marca **desde otro contenedor**, y un archivo local del worker no es observable desde la API. El resto de aquel prompt —emisor acoplado al bucle de eventos, umbral configurable, ausencia de PII, interacción verificada con la prueba de fallo de caché— sigue vigente sin cambios. Registro en el [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) §4.

**Orden de ejecución:** si el latido aún no existe cuando F2 arranca, la sonda `background` se implementa contra el contrato de la marca y se verifica con doble: **no se bloquea la fase**, pero el criterio CA-F2-15 no se cierra hasta que el latido real esté publicado.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** un endpoint público que informe del avance del arranque con la forma de C1, seguro por diseño frente a un consumidor anónimo hostil, y barato de consultar en polling.

**Lo que sí entra:**

- Módulo nuevo `apps/api/src/modules/system/` con controlador, servicio y pruebas.
- `GET /api/v1/system/boot-status`, público.
- Siete sondas: base de datos, caché, almacenamiento, búsqueda, esquema, trabajos en segundo plano, identidad.
- Caché en memoria de un segundo compartida entre peticiones, límite de tasa propio y cabecera de no almacenamiento.
- Registro del módulo en el módulo raíz de la aplicación.

**Lo que no entra:**

- **Ampliar o modificar `GET /api/v1/health`.** Lo consumen los probes de contenedor y ambas configuraciones de proxy; cambiarlo altera semántica de salud de contenedor.
- **Implementar el latido del worker.** Lo encarga [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md); F2 solo lo consume.
- Sustituir el healthcheck del contenedor de trabajos en segundo plano — alcance de ese mismo prompt.
- Cualquier endpoint adicional de diagnóstico, métricas o preparación.
- Frontend, proxy, orquestador de desarrollo o instalador.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §4.5, §5, §6
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) *(propuesto)* — **Decisión 5 es normativa y no admite interpretación**
- **Contrato C1** y su dictamen de AI-SEC-ENG de F0
- **Código vigente:** `apps/api/src/modules/health/health.controller.ts` (patrón de controlador público y de degradación de telemetría), `apps/api/src/app.module.ts` (registro y límite de tasa global)

---

## 3. Instrucciones

1. **Módulo nuevo, no ampliación del existente.** Crear `apps/api/src/modules/system/` con su módulo, controlador y servicio. Registrarlo en el módulo raíz. **No tocar el módulo de salud.**

2. **Endpoint público.** Marcarlo explícitamente como público, igual que el de salud. Devuelve exactamente la forma de C1.

3. **Sondas.** Siete, con la semántica del HLD §5:
   - **Base de datos:** verificación mínima de conexión.
   - **Caché:** ping.
   - **Almacenamiento:** existencia del bucket configurado.
   - **Búsqueda:** consulta de salud del servicio.
   - **Esquema:** migraciones aplicadas frente al conteo esperado compilado. **Reporta únicamente iniciando o listo. Jamás los números, ni los nombres, ni el identificador de la última migración.**
   - **Trabajos en segundo plano:** presencia y antigüedad de la marca de vida que publica el worker en la caché, **según el contrato de [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md)**. F2 la lee; no la emite.
   - **Identidad:** par de claves cargado y almacén de identidad alcanzable. **Nunca consulta ni reporta si existe una cuenta de administrador** — ADR-079 *(propuesto)* Decisión 5.4.

4. **Ejecución de sondas.** Todas en paralelo, tolerando fallos individuales, con vencimiento corto por sonda. El manejador nunca debe superar aproximadamente un segundo en total. Una sonda que vence se traduce a estado degradado con pista, **nunca a una excepción propagada**.

5. **Caché de un segundo.** Compartida entre peticiones, en memoria del proceso. **Es control de seguridad**: sin ella, el polling anónimo amplifica contra cuatro backends simultáneamente. Documentarlo así en el código, para que nadie la retire como "optimización prematura".

6. **Límite de tasa propio** alineado con la cadencia de polling que fija C1, más cabecera de no almacenamiento en la respuesta.

7. **Silencio en régimen estable.** Cuando la fase global sea listo, la respuesta devuelve porcentaje completo y **lista de componentes vacía**. No es un caso especial que se pueda "simplificar": es la propiedad de seguridad más valiosa del diseño.

8. **Lectura del latido, no su emisión.** La sonda de trabajos en segundo plano consulta la marca de vida en la caché y evalúa su antigüedad. Si el latido todavía no existe, implementar la sonda contra su contrato y verificarla con doble; **no adelantar el emisor**, que pertenece al otro prompt. Si la lectura obligara a que la marca contenga algo más que una señal de vida —identificadores de cola, conteos de trabajos, versiones—, **la sonda se degrada antes que ampliar la marca**.

9. **Reutilizar `calculateBootPercent` de C1.** No reimplementar el cálculo en el servicio: el porcentaje debe ser idéntico al que produce el orquestador de desarrollo, y eso solo se garantiza compartiendo la función.

---

## 4. Restricciones no negociables

1. **La lista de campos prohibidos de ADR-079 *(propuesto)* Decisión 5.5 es cerrada.** Ni versiones, ni nombres de producto, ni hostnames, ni puertos, ni endpoints internos, ni nombres de schema, ni identificadores o conteos de migración, ni conteos de tenant o usuario, ni marcas de tiempo de arranque, ni uptime, ni identificador de build, ni mensajes de driver, ni trazas.
2. **Ningún mensaje de error del backend llega al cuerpo de la respuesta.** Los fallos se traducen a estado degradado y pista de conjunto cerrado.
3. **Sin contexto de tenant.** La superficie es pre-tenant: no se resuelve tenant desde el token, no se abre `search_path`, no se consulta ninguna tabla de schema tenant.
4. **No tocar `GET /api/v1/health`** ni el healthcheck de ningún contenedor.
5. **Boundaries Modulith:** sin acceso directo a tablas de otros módulos, sin imports circulares.
6. **Nunca PII ni credenciales** en logs de este módulo.
7. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- `apps/api/src/modules/system/` — módulo, controlador, servicio y pruebas
- Registro en `apps/api/src/app.module.ts`
- Documentación OpenAPI del endpoint nuevo
- Pruebas: forma exacta de la respuesta, silencio en régimen estable, degradación por vencimiento de sonda, efectividad de la caché, y **prueba de control negativo que falla si algún campo prohibido aparece**
- `pnpm --filter @iwana/api test`, `lint` y `typecheck` en verde

## 6. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F2-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md)
- **Revisión de seguridad formal de AI-SEC-ENG** archivada en `docs/security/`
- [CHECKLIST-PLATAFORMA-ARRANQUE-F2-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F2-v1.0.md) marcado en vivo
- Fila F2 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

- **CA-F2-01** — El endpoint responde sin autenticación y con la forma exacta de C1.
- **CA-F2-02** — Con la fase en listo, la lista de componentes viene vacía. Con prueba.
- **CA-F2-03** — Una sonda que vence produce estado degradado con pista, **nunca** una excepción ni un mensaje de driver en el cuerpo.
- **CA-F2-04** — La prueba de control negativo falla si se añade cualquier campo al DTO.
- **CA-F2-05** — Ningún identificador de componente nombra un producto o motor concreto.
- **CA-F2-06** — La sonda de esquema no expone números, nombres ni identificadores de migración. Verificado leyendo la respuesta cruda.
- **CA-F2-07** — La sonda de identidad no consulta la existencia de cuenta de administrador. Verificado en el código y en la revisión de seguridad.
- **CA-F2-08** — Con la caché activa, N peticiones dentro de la misma ventana producen **una sola** ronda de sondas. Con prueba.
- **CA-F2-09** — El límite de tasa rechaza el exceso sin filtrar información.
- **CA-F2-10** — `GET /api/v1/health` responde **exactamente igual** que antes de esta fase. Con control de regresión.
- **CA-F2-11** — El manejador completa por debajo de un segundo con todas las sondas fallando.
- **CA-F2-12** — El porcentaje se calcula con `calculateBootPercent` de C1, no con lógica duplicada.
- **CA-F2-13** — Revisión de AI-SEC-ENG emitida con veredicto favorable.
- **CA-F2-14** — Evidencia de suites con **`Cached: 0`**.
- **CA-F2-15** — La sonda de trabajos en segundo plano lee la marca real que publica el latido de [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md), no un doble. **Se cierra cuando ese latido esté publicado**; hasta entonces queda `[ ]` con la dependencia registrada, sin bloquear la fase.
- **CA-F2-16** — El healthcheck del contenedor de trabajos en segundo plano **no fue modificado** por esta fase.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- Alguna sonda no puede reportar su estado **sin** violar la lista de campos prohibidos → es un cambio de contrato, no una excepción de seguridad que la fase pueda conceder.
- La sonda de esquema exige exponer el identificador de la última migración para ser útil → **se prefiere una sonda menos precisa a una superficie más locuaz**.
- AI-SEC-ENG emite veredicto desfavorable.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`. Toda excepción de seguridad escala al CTO — **AI-EM-ARCH no puede concederla**.

## 9. Criterio de salida de la fase

- [ ] Endpoint operativo, público, con la forma exacta de C1
- [ ] Las siete sondas implementadas y probadas, incluidas sus rutas de fallo
- [ ] Caché y límite de tasa verificados con prueba
- [ ] Endpoint de salud sin cambios, con control de regresión
- [ ] Latido del worker publicándose
- [ ] Revisión de seguridad archivada con veredicto favorable
- [ ] Informe de fase archivado con `Cached: 0` y checklist completo
