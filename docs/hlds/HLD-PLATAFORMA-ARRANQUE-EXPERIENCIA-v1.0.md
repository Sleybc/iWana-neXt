# HLD — Experiencia de arranque e instalación de la plataforma

**Versión:** 1.0
**Estado:** **Aprobado** — G1 cumplido el 2026-08-09 por el CTO al aprobar [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md), con la **Decisión 4 de ejecución diferida** (§4.4, §9)
**Fecha:** 2026-08-09
**Modo activo:** Architect + Product Architect + EM
**Autor:** AI-EM-ARCH
**Etapa del workflow:** 1
**Módulos:** Plataforma transversal — **no es un módulo del roadmap**, no dispara la Regla de Completitud de [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md)
**ADR que lo formaliza:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md)
**Relacionado:** [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md) (credenciales iniciales) · [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* (bind host y PII) · [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía de gates)
**Evidencia de estado actual:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) · [INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md](../informes/INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md) *(parcialmente superado)*

---

## 1. Contexto

### 1.1 El problema

iWana neXt no tiene experiencia de arranque. Levantar el sistema —en el equipo de un desarrollador o en un servidor on-premise— es hoy una operación opaca: se ejecuta un comando, se espera un tiempo indeterminado y o bien aparece un prompt, o bien aparece un error. En ningún momento el operador sabe **qué se está descargando, qué se está migrando ni cuánto falta**.

Esto tiene tres manifestaciones concretas, todas verificadas:

**Terminal.** `scripts/dev.mjs` tiene un dashboard TUI decente: sidebar con siete secciones, estados por servicio (`idle`, `waiting_api`, `running`, `ready`, `stopped`, `failed`), timeline global y timeline de errores separado, con persistencia de la vista elegida. Pero **no hay contador de paso, ni porcentaje, ni elapsed por paso**, y sobre todo: el `docker compose up -d --wait` de la línea 1191 corre en modo capturado, así que **la descarga de imágenes —la fase larga de un arranque en frío— es invisible**. Un primer arranque puede tardar diez minutos sin una sola señal de avance.

**Navegador.** No existe nada. `apps/web/src/app/page.tsx` hace `redirect('/dashboard')`; no hay `/setup`, `/onboarding`, `/install`, `/wizard`, ni splash, ni página de estado. Quien abre el navegador mientras la API todavía compila obtiene un error crudo de conexión. En producción es peor: `nginx-prod` **ni siquiera arranca** hasta que todo lo demás está sano (§4.4), así que durante las migraciones el servidor sencillamente no responde.

**Estado del sistema.** El único endpoint es `GET /api/v1/health`, que devuelve `{ status, db, redis, timestamp, relay }` y está diseñado para probes de contenedor: lo consumen el `HEALTHCHECK` de `apps/api/Dockerfile`, ambos `nginx.conf` y `waitForApiHealth` en `dev.mjs:952`. No existe `/ready`, `/readiness`, `/live`, `/status` ni `/metrics`.

### 1.2 La causa raíz es documental

**No existe PRD ni HLD de instalación o primer arranque en todo el corpus.** Lo más cercano son artefactos de otro tipo y otro alcance:

| Artefacto | Qué cubre realmente |
|---|---|
| [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md) | Credencial inicial del ADMIN de tenant — no el arranque del sistema |
| [RUNBOOK-TENANT-PROVISIONING-v1.0.md](../runbooks/RUNBOOK-TENANT-PROVISIONING-v1.0.md) | Alta de un tenant sobre un sistema ya levantado |
| [INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md](../informes/INFORME-PLATAFORMA-ARRANQUE-LOCAL-v1.0.md) | Hallazgos de arranque local, **parcialmente superado** |
| [PRD-MOD01-DEFINICION-v1.1.md](../prds/PRD-MOD01-DEFINICION-v1.1.md) §RNF | Una línea: *"Deploy on-premise · `docker compose up` en server limpio · Manual test"* |

Advertencia de lectura para quien audite este HLD: casi todas las apariciones de "instalación" en `docs/` se refieren a la **OT de instalación de servicio** de MOD09/MOD11 (`docs/specs/2026-07-27-mod09-mod11-ot-instalacion-*`), que es un concepto de negocio ajeno a este documento.

Sin definición, cada agente ejecutor improvisaría su propia noción de "arranque" y el resultado sería un conjunto de superficies incoherentes. Este HLD cierra ese hueco **para este frente**; no pretende ser el PRD de instalación de producto que el corpus sigue sin tener.

### 1.3 Referencia externa solicitada por el CTO

UCRM de Ubiquiti (`Ubiquiti-App/UCRM`) resuelve el mismo problema con dos superficies complementarias:

- Un `install.sh` que abre con banner, valida arquitectura y RAM, instala Docker si falta, **pregunta puertos cuando detecta conflicto** (`"Port X is already in use, please choose a different port for UCRM"`), ejecuta `docker-compose pull` dejando que Docker muestre la descarga capa a capa, levanta los contenedores, **hace polling cada 3 s hasta que la aplicación responde** y cierra con `"Go to http://localhost:[puerto]"`.
- Una pantalla web servida por su proxy mientras el backend todavía está migrando.

Lo que hace funcionar a UCRM no es el arte del banner: es que **cada fase larga tiene una señal de avance y el cierre es accionable**. Ese es el invariante que este frente adopta, no el estilo tipográfico.

### 1.4 Resultado buscado

Que ejecutar iWana neXt —en dev y en on-premise, en terminal y en navegador— muestre en vivo qué se descarga y qué se levanta, con progreso medible, y termine en una instrucción concreta.

---

## 2. Alcance funcional

### 2.1 Personas

| Persona | Contexto | Qué necesita |
|---|---|---|
| **Desarrollador del equipo** | `pnpm dev` en Windows o Linux, varias veces al día | Saber si el arranque avanza o está colgado; distinguir "descargando 2 GB" de "fallando en silencio" |
| **Operador de despliegue on-premise** | Servidor limpio del ISP, una sola vez | Un procedimiento guiado que valide requisitos antes de empezar, no a mitad; y un cierre que diga exactamente qué hacer después |
| **Usuario que abre el navegador demasiado pronto** | Cualquiera, dev o producción | Entender que el sistema está arrancando, no roto |

### 2.2 Casos de uso

**CU-01 — Arranque en frío de desarrollo.** El desarrollador ejecuta `pnpm dev` sin imágenes en caché. Ve el paso actual sobre el total, un porcentaje que avanza y, durante la descarga, cuántos servicios y capas van. Al terminar recibe las URLs de consola, portal, API y pantalla de arranque, más la indicación de dónde está la credencial de primer ingreso —**nunca su valor**.

**CU-02 — Arranque observado desde el navegador.** El desarrollador abre la pantalla de arranque mientras el sistema sube. Ve los mismos pasos que la terminal, con el mismo porcentaje, y al completarse es redirigido a la consola.

**CU-03 — Instalación on-premise.** El operador ejecuta el instalador en un servidor limpio. El script valida requisitos, pregunta lo que necesita, genera los secretos ausentes sin sobrescribir los existentes, **detiene la instalación con un mensaje legible si las referencias de imagen siguen pendientes de aprobación**, descarga mostrando avance, levanta y espera hasta que el sistema responde.

**CU-04 — Primer acceso durante el arranque productivo.** Alguien abre la URL del sistema mientras `migrator-prod` todavía corre. En vez de una conexión rechazada, recibe la pantalla de arranque con la fase actual.

**CU-05 — Fallo durante el arranque.** Un componente no levanta. La terminal detiene la secuencia y señala el paso; la pantalla web muestra el componente en estado degradado con una pista de conjunto cerrado, **sin revelar detalle técnico a un anónimo**.

### 2.3 Fuera de alcance (explícito y vinculante para todos los prompts)

- **Arreglar el 502 del proxy dev o mover `BIND_HOST`.** [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* lo prohíbe: reexpondría PII descifrada al segmento de red.
- **El latido del worker y la sustitución de su healthcheck.** Ya encargados por [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md); este frente **consume**, no reimplementa (§7.2).
- **Rutas `/setup`, `/onboarding`, `/wizard` en Next.** Un asistente de configuración inicial es territorio de MOD00 Control Plane.
- **Instalador para Windows on-premise, units systemd, ACME/Let's Encrypt, backups y renovación de certificados.**
- **Sustituir las referencias `invalid/*:approval-required`** de `.env.production.example` — decisión del CTO. El instalador solo las **detecta**.
- **Internacionalización de la pantalla:** solo español, como el resto del producto.
- **Creación del primer administrador de plataforma en producción** — bloqueo declarado, ver §8.

---

## 3. Arquitectura

### 3.1 Vista de componentes

```
                    ┌─────────────────────────────────────┐
                    │  CONTRATO ÚNICO DE ESTADO           │
                    │  BootStatusResponse  (@iwana/shared)│
                    └──────────────┬──────────────────────┘
                       productor A │ productor B
              ┌────────────────────┴───────────┐
              ▼                                ▼
   ┌────────────────────┐          ┌───────────────────────┐
   │ scripts/dev.mjs    │          │ GET /api/v1/system/   │
   │ (dev)              │          │     boot-status  (prod)│
   │ · TUI con progreso │          │ · sondas + caché 1 s  │
   │ · escribe          │          │ · @Public + throttle  │
   │   status.json      │          └───────────┬───────────┘
   └─────────┬──────────┘                      │
             │  bind-mount ro                  │  proxy_pass
             ▼                                 ▼
        ┌──────────────────────────────────────────────┐
        │  nginx  —  única superficie web de arranque  │
        │  · sirve nginx/boot/ (HTML/CSS/JS vanilla)   │
        │  · dev: lee status.json por `root`           │
        │  · prod: proxy a la API, con @boot_offline   │
        └──────────────────────────────────────────────┘
                             │
                             ▼
                  Pantalla de arranque en el navegador
```

Y una tercera superficie, independiente del contrato: `scripts/install.sh`, que gobierna el arranque on-premise antes de que exista nada que consultar.

### 3.2 Responsabilidad por componente

| Componente | Responsabilidad | Explícitamente no hace |
|---|---|---|
| Contrato en `@iwana/shared` | Definir la forma del estado y el cálculo del porcentaje | No conoce productores ni transporte |
| `scripts/dev.mjs` | Orquestar el arranque local, medir el progreso, publicarlo en TUI y en `status.json` | No sirve HTTP, no habla con la API |
| Módulo `system` de la API | Sondear componentes y responder el estado con la forma del contrato | No expone diagnóstico ni telemetría operativa |
| `nginx` | Servir la pantalla y decidir el origen del dato según el entorno | No transforma el estado |
| `nginx/boot/*` | Renderizar el estado y redirigir cuando esté listo | No conoce el entorno; no importa `@iwana/ui` |
| `scripts/install.sh` | Guiar la instalación on-premise | No crea usuarios de aplicación (§8) |

---

## 4. Decisiones de diseño

Las seis decisiones que siguen son el contenido sustantivo del frente. [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) las formaliza para aprobación del CTO.

### 4.1 D1 — Un shape de estado, dos productores

El contrato `BootStatusResponse` se define una vez en `@iwana/shared`. Lo producen la API en producción y `scripts/dev.mjs` en desarrollo, escribiendo un `status.json`. **La pantalla web no sabe en qué entorno corre**: consume siempre `GET /boot/status.json` y es nginx quien decide de dónde sale el dato.

*Por qué:* la alternativa —una fuente para la terminal y otra para el navegador— produce dos nociones de "progreso" que divergen en la primera corrección. Con un shape único, la terminal y el navegador muestran literalmente el mismo porcentaje, y el coste marginal de la segunda superficie es una escritura de archivo.

### 4.2 D2 — La pantalla la sirve nginx, no Next

*Por qué:* el caso que hay que cubrir es precisamente **"Next todavía no ha compilado"**. Una ruta de Next no puede renderizar su propia ausencia. Y en producción `web-prod` no existe hasta que `migrator-prod` termina, que es justo la fase que hay que mostrar. Un micro-servidor dedicado añadiría un proceso, un puerto y un camino de apagado más —una segunda cosa que puede fallar mientras diagnosticas por qué fallan las cosas.

nginx ya está en `docker-compose.yml` y en `docker-compose.prod.yml`, ya publica puerto en ambos y ya sirve contenido estático. Es además el modelo de UCRM.

*Consecuencia:* la pantalla es HTML/CSS/JS vanilla. No puede importar `@iwana/ui` porque debe renderizar antes de que exista cualquier build. La coherencia visual se garantiza por contrato del design system, no por reutilización de código (§4.5).

### 4.3 D3 — El 502 del proxy dev se evita, no se arregla

`nginx/nginx.dev.conf` tiene un defecto conocido y documentado en sus propios comentarios: con `BIND_HOST=127.0.0.1`, `host.docker.internal` no resuelve a loopback y `/api/` y `/health` del proxy devuelven 502.

**No se arregla.** Arreglarlo exige ligar a `0.0.0.0`, y [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* lo prohíbe porque reexpone PII descifrada al segmento de red. El diseño lo esquiva por construcción: en dev la pantalla lee un archivo montado, sin proxy y sin CORS. Los comentarios existentes de `nginx.dev.conf` se conservan íntegros para que nadie los lea como resueltos.

### 4.4 D4 — `nginx-prod` deja de esperar a que todo esté sano

Hoy `docker-compose.prod.yml` hace depender `nginx-prod` de `api-prod`, `web-prod` y `portal-prod` en `service_healthy`, y `api-prod` a su vez de `migrator-prod: service_completed_successfully`. **Consecuencia: nginx no arranca hasta después de las migraciones** — la pantalla de arranque nunca sería visible en producción. La dependencia se relaja a `postgres: service_started`.

> **Artefacto previo que queda superado.** El comentario que acompaña a esa condición en `docker-compose.prod.yml` justifica el endurecimiento con estas palabras: *"`service_started` solo garantizaba que el contenedor se hubiera creado: nginx aceptaba tráfico y devolvía 502 hasta que Next.js abría su puerto."* Esa razón era correcta y **queda satisfecha por otra vía**: el 502 deja de existir porque `error_page 502 503 504 = @boot` lo sustituye por la pantalla de arranque. No es una regresión, es una sustitución de mecanismo — y por eso debe registrarse en el ADR y reescribirse el comentario en el mismo acto. Revertir la condición sin tocar el comentario dejaría dos razones contradictorias vigentes.

> **Aprobada con ejecución diferida (2026-08-09).** El CTO aprobó ADR-079 con esta decisión atada al disparador de reactivación de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md): hoy no existe entorno donde observar sus tres criterios críticos, y ejecutarla obligaría a declararlos cumplidos sin verlos. Por eso la fase se parte en **F4a** (desarrollo, ejecutable) y **F4b** (producción, cerrada). Detalle en ADR-079 §Consecuencias → *"Por qué la Decisión 4 se difiere"*.

Esta decisión arrastra dos obligaciones técnicas inseparables, que el prompt de F4b debe exigir juntas:

1. **Resolución dinámica de upstreams.** Con `depends_on` relajado, los nombres `api-prod`/`web-prod`/`portal-prod` pueden no resolver al cargar la configuración y nginx se negaría a arrancar. Se resuelve con `resolver` del DNS interno de Docker y `proxy_pass` por variable **sin parte de URI**, para conservar el request URI original.
2. **El healthcheck de `nginx-prod` pasa de `/` a `/health`.** Si no, el contenedor se declara sano por el mero hecho de servir la pantalla de "arrancando", que es exactamente lo contrario de lo que un probe debe significar. Queda como regla de operación: **`/` responde 200 con la pantalla; la sonda máquina-a-máquina es `/health`.**

### 4.5 D5 — La superficie de estado es pre-autenticación y se diseña como hostil

El endpoint es `@Public()` por necesidad: informa a quien todavía no puede autenticarse. Eso lo convierte en superficie de reconocimiento y obliga a un diseño defensivo:

| Regla | Razón |
|---|---|
| Claves de componente genéricas: `database`, no `postgres`; `search`, no `typesense` | Nombrar el producto exacto es fingerprinting gratuito → CVE aplicable conocida |
| Estados de conjunto cerrado, sin texto libre y **sin `failed`**: solo `pending`/`starting`/`ready`/`degraded` más un `hint` de tres valores | Un anónimo no debe poder distinguir "servicio caído" de "servicio inalcanzable por firewall" |
| **Con `phase === 'ready'` la respuesta deja de reportar componentes** | Un sistema en régimen estable no expone nada. La ventana informativa dura lo que dura el arranque |
| `identity` reporta si el subsistema **puede autenticar**, nunca si existe una cuenta de administrador | Es el peor dato posible: le diría a un atacante que la instancia está **sin reclamar** |
| Sin versiones, hostnames, puertos, nombres de schema, conteos de migración ni de tenant; sin uptime ni build SHA | Recon, movimiento lateral, tren de release e inteligencia de negocio |
| Caché en memoria de 1 s compartida entre peticiones | **Control de seguridad, no optimización**: sin ella el polling anónimo amplifica contra base de datos, caché, almacenamiento y buscador simultáneamente |
| Throttle propio alineado con la cadencia de polling, y `Cache-Control: no-store` | Contención de abuso |

La pantalla, además, **no sigue ciegamente la URL de redirección que viene en el payload**: solo acepta rutas del mismo origen o una allowlist corta. Es una página pre-autenticación; un `next` manipulable sería un open redirect.

### 4.6 D6 — El instalador on-premise no puede cerrar como UCRM

`apps/api/src/app.config.ts` rechaza por validación `PLATFORM_SUPER_ADMIN_EMAIL` y `PLATFORM_SUPER_ADMIN_PASSWORD` cuando `NODE_ENV` es `production` o `staging` —con el mensaje explícito de que *"la credencial de arranque es conocida por diseño"*— y no existe CLI equivalente. **El instalador dejaría la instancia levantada y sin forma de entrar.**

Es un bloqueo real, no un descuido de este diseño: es el precio correcto del invariante de [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md). Se declara, se escala (§8) y el instalador v1 cierra con un bloque `[PENDIENTE]` en vez de fingir un final que no puede cumplir.

---

## 5. Contrato de estado

Forma que congela este HLD. La publicación final corresponde a AI-SR-FULL en `packages/shared/src/contracts/system/boot-status.contract.ts`.

```ts
export const BOOT_STATUS_COMPONENTS = [
  'database', 'cache', 'storage', 'search', 'schema', 'background', 'identity',
] as const;
export type BootStatusComponent = (typeof BOOT_STATUS_COMPONENTS)[number];

export type BootComponentState = 'pending' | 'starting' | 'ready' | 'degraded';
export type BootHint  = 'waiting' | 'slow' | 'needs_operator';
export type BootPhase = 'starting' | 'migrating' | 'warming' | 'ready' | 'degraded';

export interface BootStatusComponentView {
  readonly component: BootStatusComponent;
  readonly state: BootComponentState;
  readonly hint?: BootHint;              // solo cuando state !== 'ready'
}

export interface BootStatusResponse {
  readonly phase: BootPhase;
  readonly percent: number;                                 // entero 0..100, monotónico
  readonly components: readonly BootStatusComponentView[];  // vacío cuando phase === 'ready'
  readonly next: string;
  readonly retryAfterMs: number;                            // 1000..5000
}

export function calculateBootPercent(components: readonly BootStatusComponentView[]): number;
```

**Pesos:** `database` 20 · `schema` 25 · `cache` 10 · `storage` 10 · `search` 10 · `background` 15 · `identity` 10 = 100.
`ready` = 1 · `starting` = 0.5 · `degraded` = 0.5 · `pending` = 0.

**Sondas por componente:** `database` verificación mínima de conexión · `schema` migraciones aplicadas contra el conteo esperado compilado, **reportando solo ready/starting y jamás los números** · `cache` ping · `storage` existencia del bucket · `search` salud del buscador · `background` **lectura** de la marca de vida del worker en la caché, cuyo emisor pertenece a otro prompt (§7.2) · `identity` par de claves cargado y almacén de identidad alcanzable.

**Test de contrato obligatorio:** asertar que las claves de la respuesta serializada son **exactamente** las del DTO. Es la red que impide que alguien añada `version` "para depurar" y convierta la superficie en fingerprinting.

---

## 6. Impacto declarado

| Dimensión | Evaluación |
|---|---|
| **Multi-tenant** | **Sin impacto.** La superficie es pre-tenant y pre-autenticación: no hay `TenantContext`, no se abre `search_path`, no se consulta ninguna tabla de schema tenant. El componente `schema` cuenta migraciones sin nombrarlas ni exponer el número |
| **Seguridad** | **Alto y gobernado por D5.** Superficie pública nueva → exige revisión de AI-SEC-ENG antes de congelar el contrato (C1). Los controles —claves genéricas, estados cerrados, silencio en `ready`, caché anti-amplificación, allowlist de redirección— son parte del contrato, no del código |
| **PII** | **Ninguna.** El estado no contiene datos de persona. La prohibición de imprimir valores de secretos en banners e instalador es explícita y verificable en CI |
| **Escala** | La caché de 1 s acota el coste a una ronda de sondas por segundo con independencia del número de clientes. Con `phase === 'ready'` la respuesta es constante y mínima, que es el régimen del 99,99 % del tiempo |
| **Regulación** | **Sin impacto.** No toca facturación DIAN, provisioning, ni tratamiento de datos personales bajo Ley 1581 |
| **Boundaries Modulith** | Módulo `system` nuevo, sin acceso a tablas de otros módulos. El contrato viaja por `@iwana/shared`, que es el canal aprobado |

---

## 7. Riesgos

### 7.1 Riesgos de ejecución

| # | Riesgo | Severidad | Mitigación (obligatoria en el prompt de fase) |
|---|---|---|---|
| R1 | Romper la suite de tooling existente | Alta | Toda opción nueva en las funciones ya cubiertas por tests es **opcional con default no-op**; los tests existentes no se editan |
| R2 | Romper el test de configuración de nginx, que asserta literales del archivo dev | Alta | Los `location` cubiertos quedan **byte a byte idénticos**; solo se modifica la raíz y se añade uno nuevo |
| R3 | Corromper el frame del TUI al crecer la cabecera | Media | Ajustar la altura de contenido en el mismo cambio; toda línea nueva pasa por las utilidades de truncado y padding existentes |
| R4 | Reintroducir el bug de event loop retenido | Media | El temporizador del spinner es `unref()` obligatorio y se limpia al terminar. El repo ya sufrió esta clase de fallo y lo documenta en el código |
| R5 | Convertir el progreso de descarga en un modo de fallo nuevo | Alta | El paso de descarga es **opcional**: parser advisory, y si el flag no existe o no hay red, avisa y continúa. El arranque descarga igual |
| R6 | Permisos y montajes en Windows | Media | El directorio de estado se crea antes del primer `compose`; se monta el **directorio**, nunca el archivo, porque la escritura atómica sustituye el inodo |
| R7 | En producción, nginx acepta tráfico antes de que el sistema sea usable | Media | Es la intención, pero exige el cambio de probe a `/health` (§4.4) y su registro en el runbook |
| R8 | Amplificación de carga desde superficie anónima | Alta | Caché de 1 s + throttle, ambos parte del contrato |
| R9 | Open redirect en la pantalla | Media | Allowlist de destino |
| R10 | Deriva visual entre la pantalla vanilla y el design system | Media | Contrato de DS firmado (C3) + test que falla en CI si un token usado por la pantalla deja de existir |

### 7.2 Dependencia con el latido del worker — trabajo ya encargado, no deuda nueva

El componente `background` necesita una señal de vida del worker. **Esa señal ya está encargada** por [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md) (2026-08-03), que cierra el hallazgo **B4** del [informe de auditoría Docker](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) y es su dueño: emisor acoplado al bucle de eventos, verificador, umbral configurable, sustitución del probe en ambos Compose e `init: true` en el contenedor de producción.

**Este frente consume ese latido; no lo redefine ni sustituye el probe.**

> **[DESEMPATE] resuelto por AI-EM-ARCH, 2026-08-09.** Aquel prompt dejaba abierta la elección del medio entre **archivo local** del contenedor del worker y **clave en la caché con vencimiento**, y pedía que AI-SR-FULL decidiera y documentara el motivo. La elección **queda cerrada a favor de la caché**: F2 necesita leer la marca **desde otro contenedor**, y un archivo local del worker no es observable desde la API. Ese requisito no existía cuando se emitió aquel prompt. **La sustitución alcanza solo a la elección de medio**; el resto de aquel prompt sigue vigente sin cambios.

Consecuencia de secuencia: si el latido no está publicado cuando arranca F2, la sonda se implementa contra su contrato y se verifica con doble. **No bloquea la fase**, pero su criterio de aceptación no se cierra hasta que el latido real exista.

---

## 8. Bloqueo escalado al CTO

**[ESCALACION AL CTO] — Creación del primer administrador de plataforma en producción.**

Registrado en [DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md). Bloquea el cierre de la fase de instalador; **no bloquea las demás fases**. Requiere ADR propio.

---

## 9. Plan de fases

| # | Fase | Responsable | Depende de |
|---|---|---|---|
| F0 | Congelar contratos C1–C4 | AI-SR-FULL · AI-PROD-UX · AI-DS-OWNER · AI-SEC-ENG | Este HLD + ADR-079 |
| F1 | Terminal de desarrollo | AI-PLAT-OPS | C2, C4 |
| F2 | API de estado de arranque | AI-SR-FULL | C1 |
| F3 | Pantalla de arranque | AI-FE-PLATFORM · AI-DS-OWNER · AI-PROD-UX | C1, C3 |
| F4a | Cableado de proxy en **desarrollo** | AI-PLAT-OPS | F3 (esqueleto) |
| **F4b** | Cableado de proxy en **producción** — Decisión 4 | AI-PLAT-OPS | **Cerrada.** Disparador de ADR-070 |
| F5 | Instalador on-premise | AI-PLAT-OPS · AI-SEC-ENG | Este HLD + ADR-079 |
| F6 | Calidad y evidencia | AI-SR-QA | F1–F5 |
| F7 | Consolidación, G6.5 y cierre | AI-EM-ARCH | F6 |

Camino crítico **F0 → F3 → F4a → F6**. F1, F2 y F5 caben dentro de esa ventana. **F4b queda fuera del camino crítico** por diferimiento aprobado: el frente puede alcanzar G6 y G6.5 sin ella, declarando entrega parcial.

### Contratos congelables (protocolo §3bis)

| Id | Contrato | Artefacto | Autor | Aprueba |
|---|---|---|---|---|
| C1 | API de estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | AI-SR-FULL | AI-EM-ARCH + AI-SEC-ENG |
| C2 | Mismo shape para el archivo de estado de dev | Declarado en `PROMPT-PLATAFORMA-ARRANQUE-F1-v1.0.md` | AI-PLAT-OPS | AI-EM-ARCH |
| C3 | Tokens y geometría del medidor no-React | `docs/specs/2026-08-09-arranque-sistema-ds-contrato.md` | AI-DS-OWNER | AI-PROD-UX |
| C4 | Identificadores de paso y copy en español | `docs/specs/2026-08-09-arranque-sistema-ux-spec.md` | AI-PROD-UX | AI-PLAT-OPS |

Un contrato sin artefacto localizable en `docs/` y sin declaración de congelación en el prompt de fase **no está congelado**.

---

## 10. Criterios de aceptación del frente

| Id | Criterio |
|---|---|
| CA-HLD-01 | En un arranque en frío de desarrollo, la descarga de imágenes es visible y el porcentaje avanza de forma monotónica hasta 100 |
| CA-HLD-02 | En modo no interactivo, el arranque emite líneas planas con contador de paso y una señal periódica de que sigue vivo |
| CA-HLD-03 | Ningún banner, log ni salida del instalador contiene el **valor** de un secreto, verificado por prueba automatizada |
| CA-HLD-04 | La pantalla de arranque muestra el mismo porcentaje que la terminal en desarrollo |
| CA-HLD-05 | En producción, abrir la raíz durante las migraciones devuelve 200 con la pantalla de arranque, no una conexión rechazada — **diferido a F4b**, no se evalúa para el cierre del frente |
| CA-HLD-06 | Con el sistema listo, la respuesta de estado no reporta componentes |
| CA-HLD-07 | El instalador se detiene con mensaje legible si las referencias de imagen siguen pendientes de aprobación |
| CA-HLD-08 | El comentario del compose que justificaba la condición anterior de `depends_on` queda reescrito en el mismo cambio que la relaja — **diferido a F4b** |
| CA-HLD-09 | Ningún token usado por la pantalla puede desaparecer del design system sin que CI lo detecte |
| CA-HLD-10 | Los gates documentales quedan en verde: ubicación de artefactos y citas de ADR sin bloqueantes |

---

## 11. Trazabilidad

- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md)
- **Prompts de ejecución:** `docs/prompts/PROMPT-PLATAFORMA-ARRANQUE-F{0..6}-v1.0.md`
- **Checklists vivos:** `docs/quality/CHECKLIST-PLATAFORMA-ARRANQUE-F{0..6}-v1.0.md` y [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)
- **Informes:** [plantilla de fase](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md) · [informe consolidado](../informes/INFORME-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md)
- **Bloqueo:** [DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md)
