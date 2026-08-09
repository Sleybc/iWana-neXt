# ADR-081: Modelo de sesión de navegador — cookie `httpOnly` y autenticación en servidor

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-09
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano — 2026-08-09
**Dictamen de seguridad:** **AI-SEC-ENG — consulta bloqueante, emitida el 2026-08-09.** Opción A *viable con ajustes*; Opción B **inviable como decisión permanente**
**Módulos:** Plataforma transversal — `apps/web`, `apps/portal`, `apps/api` (auth y resolución de tenant)
**Ejecución:** **OLA1-b** de la secuencia por olas aprobada el 2026-08-09 ([PRD §14.3ter](../prds/PRD_Sistema_ISP_Colombia_v2_4.md))
**Relacionado:** [ADR-061](ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) (audiencias JWT) · [ADR-057](ADR-057-Credenciales-Iniciales-Por-Tenant.md) (primer ingreso) · [ADR-067](ADR-067-Proyeccion-PII-Listados-Operativos.md) (PII en listados) · [ADR-080](ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) (cadencia)
**Hallazgo asociado, fuera de alcance:** [SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md)

---

## Contexto

El CTO aprobó el 2026-08-09 una secuencia por olas ordenada por **qué fundaciones heredarán los seis módulos que faltan**. Esta es la segunda decisión de la Ola 1, y bloquea la cadena de ingreso.

El motivo de urgencia es que **cada página nueva se construye contra el patrón vigente**: cambiarlo después obliga a reescribir el data-fetching de todo lo construido en el intervalo.

### Estado verificado por AI-SEC-ENG

| Elemento | Portal | Consola de plataforma |
| --- | --- | --- |
| Access token | `localStorage['iwana.portal.access-token']` | `localStorage['iwana.web.access-token']` |
| Tokens de alcance limitado | `mfa-setup` en almacenamiento local | `password-change` en almacenamiento local |
| Refresh token | **cookie `httpOnly` ya existente** | **no existe cookie** |
| Transporte | `Authorization: Bearer` | `Authorization: Bearer` |

**Tres hechos cambian el análisis respecto de lo que suponía la consulta:**

1. **La infraestructura de cookie ya existe y funciona.** `apps/api/src/modules/auth/auth.controller.ts:41-47` define opciones correctas —`httpOnly`, `sameSite: 'strict'`, `secure` por configuración, rotación y `clearCookie`—, pero se emite **solo en el flujo de tenant**. No hay que construirla: hay que extenderla.
2. **El proxy same-origin ya está montado** en ambos `next.config.ts`, nginx ya reenvía `Set-Cookie` y CORS ya va con `credentials: true`. Las piezas están puestas.
3. **La arquitectura de componentes de servidor está montada y desaprovechada por completo:** **28 de 34 páginas del portal y 7 de 13 de la consola ya son Server Components**, y **ninguna** hace data-fetching autenticado. Todas delegan en un hijo cliente.

### Por qué no basta con no tocar nada

AI-SEC-ENG declaró la opción de conservar el patrón actual **inviable como decisión permanente**, y no por doctrina, sino por tres hechos de este repositorio:

- Existe **hoy** una cadena verificable de robo del token de plataforma vía XSS almacenado, **sin política de seguridad de contenido que la contenga**. El almacenamiento local convierte cualquier XSS futuro en compromiso de sesión, sobre 190 superficies cliente del portal y 27 de la consola.
- **La consola de plataforma no tiene ciclo de refresco:** `platformLogin` no emite cookie, pero el cliente llama a refrescar ante cualquier 401. La sesión de `SYSTEM_ADMIN` **muere cada quince minutos sin renovación posible**. El arreglo natural bajo "no tocar nada" sería emitir cookie de refresh también en plataforma — es decir, migrar a medias justo lo que se dice no migrar.
- Cierra los componentes de servidor de forma definitiva. Los seis módulos pendientes heredarían "todo el data-fetching en cliente" como fundación, y los listados de PII de [ADR-067](ADR-067-Proyeccion-PII-Listados-Operativos.md) seguirían viajando al navegador para renderizarse allí.

---

## Decisión

### 1. El access token pasa a cookie `httpOnly` y deja de existir en almacenamiento local

En ambas aplicaciones de navegador. El transporte no cambia de forma en el código cliente: el navegador adjunta la cookie sola, y **todo consumidor sigue llamando a su API tipada igual que hoy**.

### 2. La migración se ejecuta en dos pasos desacoplados, y solo el primero bloquea la ola

| Paso | Contenido | Bloquea |
| --- | --- | --- |
| **1** | El access token pasa a cookie `httpOnly`; se retira de almacenamiento local. Cierra el vector de robo de token y habilita el paso 2 | **Sí — es OLA1-b** |
| **2** | Autenticación en componentes de servidor. Cada página puede precargar en servidor, **se aplica por página y sin big bang** | No — queda habilitado, no obligado |

Separarlos es deliberado: el valor de seguridad está en el paso 1 y no debe quedar rehén del trabajo incremental del paso 2.

### 3. La resolución de tenant se hace desde la cookie, nunca desde una cabecera del cliente

`TenantMiddleware.tryExtractJwtPayload()` lee hoy **exclusivamente** la cabecera `Authorization`. Si no la encuentra, cae a resolver el tenant por `X-Tenant-Slug`, **un valor que hoy proviene del almacenamiento local del cliente**.

**Migrar sin tocar esto convertiría la resolución de tenant de "desde el token firmado" a "desde una cabecera controlada por el cliente".** Sería un vector cross-tenant **introducido por la migración**. Por eso la condición C-1 es bloqueante de merge y no negociable: es la custodia en tiempo de ejecución de [ADR-061](ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md).

### 4. La protección CSRF pasa a ser requisito duro

Hoy no hay riesgo CSRF abierto: el token viaja por una cabecera que el navegador no adjunta solo. **En cuanto la autenticación sea automática, eso deja de ser cierto.** `SameSite=Strict` es necesario pero **no suficiente** como control único, y la cookie del access token no puede conservar el `path` restringido del refresh: debe cubrir toda la ruta del API, lo que amplía la superficie.

### 5. La consola de plataforma gana ciclo de refresco

`platform/login` emite cookie de refresh. **No es alcance añadido:** sin ello el paso 1 dejaría la consola peor que hoy, con la sesión muriendo cada quince minutos y sin renovación.

### 6. Los tokens de alcance limitado salen del almacenamiento persistente

Los alcances `password-change` y `mfa-setup` se guardan hoy en almacenamiento local. La contención por ruta está bien resuelta en el backend, pero el token del primer ingreso de [ADR-057](ADR-057-Credenciales-Iniciales-Por-Tenant.md) —emitido tras una credencial conocida por diseño— queda legible por script y sobrevive al cierre de pestaña. Si por ergonomía deben quedar fuera de cookie, **van en memoria, nunca en almacenamiento persistente**.

---

## Condiciones de entrada

**C-1 a C-3 son bloqueantes de merge.** El resto bloquean el cierre de OLA1-b.

| Id | Condición | Tipo |
| --- | --- | --- |
| **C-1** | La resolución de tenant se hace desde el token de la cookie. **Test de arquitectura** que falle si una petición autenticada de tenant resuelve contexto por `X-Tenant-Slug` | **Merge** |
| **C-2** | Protección CSRF sobre todo método mutante autenticado por cookie, con **test negativo**: petición cross-site con cookie válida y sin token CSRF → rechazo | **Merge** |
| **C-3** | **Cero coincidencias** de almacenamiento local sobre claves de token en ambas aplicaciones, verificado por **test de arquitectura, no por revisión**. Incluye los alcances limitados | **Merge** |
| **C-4** | Separar la variable de URL del API **por aplicación**: hoy una sola variable se bakea en ambos bundles, y con dos vhosts distintos el portal llamaría cross-site a su propio API — con `SameSite=Strict` el navegador no enviaría la cookie | Cierre |
| **C-5** | Cookies con **nombre distinto por audiencia** y prefijo `__Host-` en producción; `path` mínimo que cubra la ruta del API; `Secure` acoplado a producción **en el esquema de validación**, no solo en el overlay de Compose | Cierre |
| **C-6** | `platform/login` emite cookie de refresh | Cierre |
| **C-9** | El helper de siembra de las pruebas de extremo a extremo migra a cookies y **las 21 especificaciones afectadas pasan antes** de retirar el soporte de almacenamiento local, no después. Evidencia con `Cached: 0` | Cierre |

**Verificación pendiente declarada.** Con el fetch movido al servidor, la trazabilidad de acceso masivo a PII de [ADR-067](ADR-067-Proyeccion-PII-Listados-Operativos.md) sigue emitiéndose en el API, pero **hay que comprobar que la dirección auditada siga siendo la del cliente y no la del contenedor intermedio**. Hoy **no es verificable**: no existe ninguna llamada autenticada desde servidor contra la cual comprobarlo. Se verifica en el paso 2, sobre la primera página que se migre.

---

## Consecuencias

### Coste — contado, no estimado

**Lo que sí se toca:** 3 ficheros en el portal · 4 en la consola · 3 en el backend · 3 de configuración · **21 de 29 especificaciones de extremo a extremo**. Total: **~13 ficheros de producto**.

**Lo que no se toca, y es el dato que decide el coste:** los **234 ficheros del portal** y **27 de la consola** que consumen el cliente de API **no se modifican**. El transporte está centralizado en una única función por aplicación, y ambas ya envían las credenciales de la petición.

**Corrección al enunciado de la consulta.** Afirmé que las pruebas de `LoginExperience` sembraban el token de sesión. **Es falso**, verificado: solo escriben el identificador de tenant. Esa suite no se ve afectada por el paso 1. Las 21 especificaciones que sí lo hacen siguen todas el mismo patrón y se migran sustituyendo una llamada de siembra en un helper. **La migración no rompe la suite: la reescribe mecánicamente.** Es un argumento a favor de hacerlo ahora, con 21 especificaciones, y no dentro de seis módulos.

### Positivas

- Cierra el vector de robo de token por script en las 217 superficies cliente del programa.
- Da ciclo de refresco a la consola de plataforma, que hoy no lo tiene.
- Convierte la custodia de la frontera de audiencias de [ADR-061](ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) en un control verificado en tiempo de ejecución, no solo en emisión.
- Desbloquea 35 páginas ya escritas como componentes de servidor que hoy no pueden autenticar.
- Evita que los seis módulos pendientes hereden el patrón actual.

### Negativas y costes aceptados

- **Introduce superficie CSRF donde hoy no la hay.** Es el intercambio directo de la decisión, y por eso C-2 es bloqueante de merge y no diferible.
- **21 especificaciones de extremo a extremo se reescriben.** Mecánico, pero es trabajo real y debe pasar antes de retirar el soporte antiguo.
- **Toca la resolución de tenant**, que es el corazón de la multi-tenancy. Es la parte de mayor riesgo y la razón de C-1.

### Impacto declarado

| Dimensión | Evaluación |
| --- | --- |
| **Multi-tenant** | **Alto y con riesgo real.** Si C-1 no se cumple, la migración **crea** un vector cross-tenant. Con C-1, mejora el control actual |
| **Seguridad** | **Alto y positivo.** Es el motivo de la decisión |
| **Escala** | Sin impacto |
| **Regulación** | Indirecto: refuerza la protección de PII de la Ley 1581 al sacar el token del alcance de script. La verificación de la dirección auditada queda declarada como pendiente |

---

## Riesgos

| # | Riesgo | Severidad | Mitigación |
| --- | --- | --- | --- |
| R1 | La migración introduce un vector cross-tenant por caída al fallback de cabecera | **Crítica** | C-1, bloqueante de merge, con test de arquitectura |
| R2 | Se adopta la cookie sin CSRF, creyendo que `SameSite=Strict` basta | **Alta** | C-2, bloqueante de merge, con test negativo |
| R3 | Queda algún token en almacenamiento local y la superficie no se cierra de verdad | **Alta** | C-3, verificado por test y no por revisión |
| R4 | El paso 2 no se ejecuta nunca y las 35 páginas de servidor siguen desaprovechadas | Media | Es aceptable: el valor de seguridad está en el paso 1. Se registra como deuda con dueño |
| R5 | Se cree que esta decisión cierra el hallazgo crítico de la búsqueda global | **Alta** | **No lo cierra.** Reduce su impacto. La corrección del sink es [independiente y no espera a este ADR](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) |

---

## Fuera de alcance

- **La corrección del sink de la búsqueda global.** Es crítica, independiente y **no debe represarse en este ADR**: tiene [artefacto propio](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) y ejecución inmediata.
- **La política de seguridad de contenido.** Debe quedar con dueño; puede cerrarse dentro de OLA1-b o en el frente de hardening, pero **no diferida sin destino**.
- **El paso 2 completo.** Queda habilitado, no obligado, y se aplica por página.
- Cambiar la duración del access token, el mecanismo de revocación o la separación de audiencias: **los tres se conservan intactos**.

---

## Plan de migración

| Paso | Acción | Responsable |
| --- | --- | --- |
| 1 | Aprobación del CTO | CTO |
| 2 | Prompt de ejecución con C-1…C-9 congeladas como criterios de aceptación | AI-EM-ARCH |
| 3 | Backend: emitir cookie de access, cubrir `platform/login`, leer cookie en la resolución de tenant, CSRF | AI-SR-FULL, con revisión de AI-SEC-ENG |
| 4 | Frontend: retirar el almacenamiento local en ambas aplicaciones | AI-FE-PLATFORM |
| 5 | Configuración: variable de API por aplicación, `Secure` en el esquema, nombres de cookie por audiencia | AI-PLAT-OPS |
| 6 | Migrar el helper de siembra y las 21 especificaciones **antes** de retirar el soporte antiguo | AI-SR-QA |
| 7 | Re-verificación de AI-SEC-ENG sobre C-1, C-2 y C-3 | AI-SEC-ENG |

**Reversible:** sí, mientras el soporte antiguo no se haya retirado. **Punto de no retorno:** la retirada del almacenamiento local, que por C-9 solo ocurre con las especificaciones ya migradas y en verde.
