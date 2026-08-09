# ADR-079: Superficie pública de estado de arranque y experiencia de instalación

**Versión:** 1.1
**Estado:** Aprobado
**Alcance de la aprobación:** seis decisiones vigentes de inmediato; la **Decisión 4 queda aprobada con ejecución diferida** al disparador de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) — ver §Estado de adopción por decisión
**Fecha:** 2026-08-09
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano — 2026-08-09
**Cambio v1.0 → v1.1:** aprobación del CTO registrada; se añade §Estado de adopción por decisión, que difiere la ejecución de la Decisión 4 al disparador de reactivación de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) por imposibilidad de verificación (ver §Consecuencias → "Por qué la Decisión 4 se difiere")
**Módulos:** Plataforma transversal — no es un módulo del roadmap
**Sucede a:** ninguno. **Sustituye una razón técnica vigente** documentada en `docker-compose.prod.yml` (ver Decisión 4 y §Consecuencias)
**Relacionado:** [ADR-078](ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* (bind host y exposición de PII) · [ADR-057](ADR-057-Credenciales-Iniciales-Por-Tenant.md) (credenciales iniciales) · [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía de gates)
**HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md)
**Evidencia:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)

---

## Contexto

Levantar iWana neXt es hoy una operación opaca. El dashboard de desarrollo tiene estados por servicio pero no contador de paso, ni porcentaje, ni visibilidad de la descarga de imágenes —que es la fase larga de un arranque en frío. En el navegador no existe ninguna superficie de arranque: quien abre demasiado pronto obtiene un error de conexión, y en producción el proxy ni siquiera está escuchando durante las migraciones. El único endpoint de estado, `GET /api/v1/health`, está diseñado para probes de contenedor.

Detrás de esas tres manifestaciones hay una causa documental: **el corpus no tiene PRD ni HLD de instalación o primer arranque de producto**. Sin definición, cada superficie se resolvería por separado y con criterios distintos.

El CTO fijó como referencia la instalación de UCRM de Ubiquiti, cuyo valor no está en el estilo del banner sino en dos invariantes: **cada fase larga tiene una señal de avance, y el cierre es accionable**.

Este ADR formaliza las decisiones que hacen posible esa experiencia y —sobre todo— las **restricciones de seguridad** que impone abrir una superficie pública nueva en un producto multi-tenant. Es la parte que no puede quedar en un prompt de ejecución: una vez publicado, un endpoint anónimo es contrato con el mundo.

---

## Estado de adopción por decisión

El CTO aprobó este ADR el 2026-08-09. **Seis de las siete decisiones entran en vigor de inmediato; la Decisión 4 queda aprobada con ejecución diferida.**

| Decisión | Estado | Habilita |
| --- | --- | --- |
| 1 · Contrato único con dos productores | **Vigente** | F0, F1, F2, F3 |
| 2 · La pantalla la sirve el proxy | **Vigente** | F3, F4a |
| 3 · El defecto de proxy en desarrollo se evita | **Vigente** | F4a |
| **4 · El proxy de producción deja de esperar** | **Aprobada — ejecución diferida** | F4b, **no arranca hasta el disparador** |
| 5 · La superficie de estado se diseña como hostil | **Vigente** | F0, F2 |
| 6 · El instalador no emite credenciales en v1 | **Vigente** | F5 |
| 7 · La descarga nunca puede ser modo de fallo | **Vigente** | F1, F5, F6 |

**Disparador de la Decisión 4.** Se ejecuta cuando se active el disparador de reactivación de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md), no antes y no por calendario. Mientras tanto, la fase F4 se ejecuta **solo en su mitad de desarrollo (F4a)**; la mitad de producción (F4b) permanece cerrada.

**Qué no cambia por el diferimiento.** La experiencia de arranque se entrega **completa en desarrollo** —terminal y navegador— y **completa en el instalador on-premise**. Lo único que espera es la pantalla servida durante las migraciones **de un entorno productivo que todavía no existe**.

---

## Decisión

### 1. Un contrato único de estado con dos productores

Se define `BootStatusResponse` en `packages/shared/src/contracts/system/boot-status.contract.ts`. Lo producen dos actores contra el mismo shape: la API en producción (`GET /api/v1/system/boot-status`) y el orquestador de desarrollo escribiendo un archivo de estado. La superficie web consume siempre la misma ruta lógica y **no conoce el entorno**; la resolución del origen es responsabilidad del proxy.

Se rechaza la alternativa de una fuente por superficie: produce dos nociones de progreso que divergen en la primera corrección.

### 2. La pantalla de arranque la sirve el proxy, no el framework de aplicación

La superficie web de arranque es un artefacto estático servido por nginx, escrito en HTML, CSS y JavaScript sin dependencias, y **no puede importar el paquete de UI**.

Razón: el caso a cubrir es "el framework todavía no ha compilado". Una ruta de Next no puede renderizar su propia ausencia, y en producción el contenedor web no existe hasta que las migraciones terminan. Un micro-servidor dedicado se rechaza por añadir un proceso, un puerto y un camino de apagado adicionales justo en la ventana de diagnóstico.

La coherencia visual se garantiza por **contrato del design system verificado en CI**, no por reutilización de código.

### 3. El defecto de proxy en desarrollo se evita, no se corrige

El proxy de desarrollo devuelve 502 en las rutas de API y salud porque el host de binding es loopback. **No se corrige en este frente.** Corregirlo exigiría ligar a todas las interfaces, y [ADR-078](ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* lo prohíbe por reexposición de PII descifrada al segmento de red.

El diseño lo esquiva: en desarrollo la pantalla lee un archivo montado en solo lectura, sin proxy y sin CORS. Los comentarios que documentan el defecto en la configuración de nginx **se conservan íntegros**; ninguna fase puede reescribirlos como resueltos.

### 4. El proxy de producción deja de esperar a que todo esté sano

> **Aprobada con ejecución diferida** al disparador de reactivación de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md). La decisión es firme; su implementación no arranca hoy. Razón en §Consecuencias → *"Por qué la Decisión 4 se difiere"*.

La condición de dependencia de `nginx-prod` sobre API, web y portal pasa de `service_healthy` a una dependencia mínima sobre la base de datos, y el proxy interpreta los errores de upstream sirviendo la pantalla de arranque.

Esta decisión arrastra tres obligaciones **inseparables**, que se aprueban en bloque o no se aprueban:

**4.1.** Los upstreams se resuelven de forma dinámica vía el DNS interno del runtime, con `proxy_pass` por variable y sin parte de URI, para que el proxy arranque aunque los contenedores destino no existan todavía y para conservar el request URI original.

**4.2.** El healthcheck del contenedor de proxy **deja de apuntar a la raíz y pasa a la ruta de salud**. Sin este cambio, el contenedor se declararía sano por el mero hecho de servir una pantalla que dice "arrancando" — la inversión exacta del significado de un probe.

**4.3.** El comentario que hoy justifica la condición endurecida **se reescribe en el mismo cambio** (ver §Consecuencias).

### 5. La superficie de estado se diseña como hostil

El endpoint es público por necesidad. Se le imponen las siguientes restricciones, que forman parte del contrato y no del código:

1. **Vocabulario genérico de componentes.** `database`, no el nombre del motor. `search`, no el nombre del buscador. Nombrar el producto exacto es fingerprinting gratuito.
2. **Estados de conjunto cerrado y sin texto libre.** Cuatro estados de componente, sin valor `failed`, más una pista de tres valores. Un anónimo no debe poder distinguir "servicio caído" de "servicio inalcanzable por red".
3. **Silencio en régimen estable.** Con el sistema listo, la respuesta **no reporta componentes**. La ventana informativa dura lo que dura el arranque.
4. **El componente de identidad reporta capacidad, nunca ocupación.** Indica si el subsistema puede autenticar; **nunca si existe una cuenta de administrador**. Ese dato revelaría que la instancia está sin reclamar, y es el peor que esta superficie podría emitir.
5. **Prohibido:** versiones, nombres de producto, hostnames, puertos, endpoints internos, nombres de schema, identificadores o conteos de migración, conteos de tenant o de usuario, marcas de tiempo de arranque, uptime, identificadores de build, mensajes de driver y trazas.
6. **Caché en memoria de un segundo compartida entre peticiones.** Es un **control de seguridad**, no una optimización: sin ella el polling anónimo amplifica contra base de datos, caché, almacenamiento y buscador de forma simultánea. Acompañada de límite de tasa propio y `Cache-Control: no-store`.
7. **La redirección no se sigue ciegamente.** La pantalla solo acepta destinos del mismo origen o de una allowlist corta.
8. **Prueba de contrato obligatoria** que asserta que las claves serializadas son exactamente las del DTO, para que ningún cambio posterior añada un campo de diagnóstico por conveniencia.

La aprobación de este ADR **no sustituye la revisión de AI-SEC-ENG** sobre el contrato antes de congelarlo.

### 6. El instalador on-premise no emite credenciales en su versión inicial

La configuración de la API rechaza por validación las variables de credencial de arranque de plataforma cuando el entorno es productivo o de staging, y no existe camino alternativo. El instalador **no puede cerrar con URL y credenciales** como hace la referencia externa: cierra con un bloque de pendiente explícito.

Se declara como bloqueo con escalación abierta al CTO ([DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md)) y **requiere ADR propio**. Este ADR no lo resuelve ni lo prejuzga.

### 7. La visibilidad de la descarga nunca puede ser un modo de fallo

El paso que hace visible la descarga de imágenes es **opcional por diseño**: si la herramienta no soporta la opción, o no hay red, o el formato de salida cambia, el paso avisa y la secuencia continúa —el arranque descarga igual por el camino de siempre. El análisis de la salida es orientativo: sin coincidencias, la barra queda indeterminada y los registros siguen fluyendo.

Es una regla de diseño, no una recomendación: **una mejora de observabilidad que puede tumbar un arranque es una regresión**, por buena que se vea.

---

## Consecuencias

### Positivas

- Cierra el hueco documental de instalación y primer arranque para este frente, con un HLD citable.
- Terminal y navegador muestran el mismo progreso por construcción, no por convención.
- La superficie pública nace con su modelo de amenaza escrito, en vez de heredarlo de una revisión posterior.
- En producción, el sistema deja de estar mudo durante las migraciones.
- Da consumidor real a un trabajo ya encargado y todavía sin ejecutar: el latido del worker de [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md), que cierra el hallazgo **B4** del [informe de auditoría Docker](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md). Este ADR **no lo reimplementa**; lo consume y cierra una elección que aquel prompt dejó abierta (ver abajo).

### Elección que queda cerrada — medio de la marca de vida del worker

`PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md` dejó deliberadamente abierta la elección del medio entre **archivo local** del contenedor del worker y **clave en la caché con vencimiento**, y pidió que AI-SR-FULL decidiera y documentara el motivo en el código.

**Queda cerrada a favor de la caché.** Razón: la sonda de trabajos en segundo plano de este frente debe leer la marca **desde otro contenedor**, y un archivo local del worker no es observable desde la API. Ese requisito no existía cuando se emitió aquel prompt, así que no es una corrección: es un requisito nuevo que elimina una de las dos opciones.

**La sustitución alcanza únicamente a la elección de medio.** Todo lo demás de aquel prompt sigue vigente sin cambios: emisor acoplado al bucle de eventos y no a un temporizador aislado, umbral configurable con default holgado, ausencia de PII e identificadores de tenant en la marca, verificación explícita de la interacción con la prueba de fallo de caché, sustitución del probe en ambos Compose e `init: true` en el contenedor de producción. Nada de eso pertenece a este frente.

### Por qué la Decisión 4 se difiere

La decisión es correcta y queda aprobada. Lo que no existe hoy es la posibilidad de **verificarla**, y ejecutarla sin verificación produciría exactamente lo que [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) §Decisión 2 prohíbe.

Tres hechos verificados el 2026-08-09:

1. **No hay dónde instanciar el overlay de producción.** `docker-compose.e2e.yml` contiene únicamente base de datos, caché, almacenamiento, su inicializador y buscador. **No incluye proxy ni contenedores de aplicación**, así que no existe un entorno donde observar el arranque del proxy sin los upstreams.
2. **La configuración de proxy de producción está deliberadamente incompleta.** Conserva los marcadores de dominio que ADR-070 §Decisión 2 ordena **mantener intactos**, y el gate de prerrequisitos de producción en integración continua hace fallar un archivo de entorno productivo real que aún los contenga. Resolverlos para poder probar sería *elegir dominio*, que es justo lo que ADR-070 difiere.
3. **En consecuencia, tres criterios de aceptación de la fase no son verificables**: que el proxy arranque sin los contenedores de aplicación, que la raíz responda durante las migraciones, y que el contenedor no se declare sano antes de tiempo.

Ejecutar la Decisión 4 hoy obligaría a marcar esos tres criterios como cumplidos sin haberlos observado. **Eso es evidencia ficticia**, y además dejaría relajada una condición de arranque de producción cuya sustitución nadie habría comprobado — la única forma en que esta decisión sí sería una regresión real.

**Por tanto:** la fase se parte. **F4a** entrega la mitad de desarrollo, que es íntegramente verificable hoy y no toca producción. **F4b** entrega las tres obligaciones inseparables de la Decisión 4 y se abre con el disparador de ADR-070, momento en que existirá un entorno donde observarlas.

### Razón técnica que queda sustituida — Decisión 4

`docker-compose.prod.yml` documenta hoy, en un comentario junto a la condición de dependencia del proxy, por qué esa condición se endureció:

> *"`service_started` solo garantizaba que el contenedor se hubiera creado: nginx aceptaba tráfico y devolvía 502 hasta que Next.js abría su puerto."*

**Ese razonamiento era correcto y sigue siendo correcto sobre el mecanismo que describe.** Lo que cambia es el mecanismo: el 502 deja de ser el resultado observable porque el proxy lo intercepta y sirve la pantalla de arranque en su lugar. La condición endurecida resolvía el síntoma bloqueando el arranque del proxy; la nueva lo resuelve sirviendo contenido útil.

Por eso:

1. **No se registra como regresión** — es una sustitución de mecanismo con el mismo objetivo.
2. **El comentario se reescribe en el mismo cambio que relaja la condición.** Relajarla dejando el comentario intacto dejaría dos razones contradictorias vigentes en el mismo archivo, que es exactamente el defecto que la gobernanza documental prohíbe.
3. **La obligación 4.2 no es negociable**: sin mover el probe a la ruta de salud, la relajación sí sería una regresión real, porque el orquestador declararía sano un sistema que solo sabe decir que está arrancando.

### Negativas y costes aceptados

- **Superficie de ataque nueva.** Un endpoint anónimo más. Se acota con las ocho restricciones de la Decisión 5, pero el coste no es cero.
- **Duplicación deliberada de lenguaje visual.** La pantalla replica el medidor de progreso del design system sin reutilizar su código. Se acepta porque debe renderizar antes de que exista cualquier build, y se contiene con un contrato firmado y una prueba anti-deriva en CI.
- **Ventana de tráfico sin backend en producción.** Entre que el proxy escucha y que la API responde, el sistema acepta conexiones que no puede servir. Es la intención del cambio; el probe corregido evita que se confunda con disponibilidad.
- **Superficie de mantenimiento en el orquestador de desarrollo.** Tres módulos nuevos y modificaciones en un archivo de 38 KB que ya tiene pruebas. Se contiene extrayendo la lógica nueva a módulos propios con pruebas propias y manteniendo retrocompatibles las firmas existentes.
- **El instalador entrega una experiencia incompleta** hasta que se resuelva el bloqueo de la Decisión 6.

### Impacto declarado

| Dimensión | Evaluación |
|---|---|
| Multi-tenant | **Sin impacto.** Superficie pre-tenant: sin contexto de tenant, sin apertura de `search_path`, sin lectura de tablas de schema tenant |
| Seguridad | **Alto**, gobernado por la Decisión 5. Exige revisión de AI-SEC-ENG antes de congelar el contrato |
| PII | **Ninguna.** El estado no contiene datos de persona; la prohibición de imprimir valores de secretos es verificable en CI |
| Escala | La caché acota el coste a una ronda de sondas por segundo con independencia del número de clientes |
| Regulación | **Sin impacto.** No toca facturación, provisioning ni tratamiento de datos personales |
| Boundaries Modulith | Módulo nuevo sin acceso a tablas de otros módulos; el contrato viaja por el paquete compartido |

---

## Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | La superficie pública crece por conveniencia y acaba exponiendo diagnóstico | **Alta** | Prueba de contrato que asserta las claves exactas; toda ampliación exige ADR |
| R2 | La relajación de dependencias se aplica sin mover el probe | **Alta** | Obligación 4.2 declarada inseparable; criterio de aceptación en el prompt de la fase y en su checklist. **Mitigado además por el diferimiento**: F4b no arranca sin entorno donde observar el resultado |
| R8 | La Decisión 4 se ejecuta antes de su disparador, "aprovechando" que ya está aprobada | **Alta** | El estado por decisión es explícito y F4b nace cerrada; su checklist declara la condición de apertura |
| R3 | La visibilidad de la descarga introduce un modo de fallo | **Alta** | Decisión 7: paso opcional, análisis orientativo |
| R4 | Deriva visual entre pantalla y design system | Media | Contrato firmado + prueba anti-deriva en CI |
| R5 | Amplificación de carga desde superficie anónima | Media | Caché y límite de tasa como parte del contrato |
| R6 | Alguien lee el defecto de proxy en desarrollo como resuelto | Media | Comentarios existentes intactos; declarado fuera de alcance en HLD y en cada prompt |
| R7 | Regresión en las suites de tooling existentes | Media | Firmas retrocompatibles con default no-op; ningún test existente se edita |

---

## Plan de migración

No hay migración de datos ni de esquema. La adopción es por fases, con contratos congelados:

| Fase | Contenido | Reversible |
|---|---|---|
| F0 | Congelar contratos de API, design system y copy | Sí — no toca ejecución |
| F1 | Progreso en el orquestador de desarrollo | Sí — cambio local, sin efecto en producción |
| F2 | Endpoint de estado | Sí — módulo aislado, se desmonta quitando su registro |
| F3 | Pantalla de arranque | Sí — artefactos estáticos nuevos |
| F4a | Cableado de proxy en **desarrollo** | Sí — no toca producción |
| **F4b** | Cableado de proxy en **producción** — las tres obligaciones de la Decisión 4 | **Diferida.** Reversión acoplada: exige restaurar condición de dependencia, probe y comentario a la vez |
| F5 | Instalador on-premise | Sí — script nuevo, no altera el camino existente |
| F6 | Evidencia de calidad | — |

**Punto de no retorno:** ninguno. F4b es la única fase con reversión acoplada, y su reversión está definida.

**Gates:** este frente emite ADR, así que **G1 lo aprueba el CTO** y no se autofirma. **G1 cumplido el 2026-08-09.** G6, G6.5 y G7 se registran por separado en el informe de cierre, conforme a [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md).

**Cierre del frente sin F4b.** El frente puede alcanzar G6 y G6.5 con F4b abierta: su alcance queda declarado como **entrega parcial por diferimiento aprobado**, no como deuda. G7 no aplica — el dominio productivo sigue diferido por ADR-070.

---

## Residual declarado

El corpus **sigue sin PRD de instalación de producto**. El HLD de este frente cierra la definición necesaria para ejecutarlo, pero no cubre la experiencia de instalación como capacidad comercial del producto (empaquetado, licenciamiento, actualización asistida, migración entre versiones). Queda registrado como hueco conocido, no como omisión de este ADR.
