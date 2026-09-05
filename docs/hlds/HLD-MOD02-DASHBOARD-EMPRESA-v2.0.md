# HLD — MOD02 Dashboard Empresa v2.0

## Arquitectura de alto nivel — el home del portal como resumen operativo del tenant

**Versión:** 2.0.4
**Fecha:** 2026-08-04 · adenda B1b 2026-09-04 · adenda Accesos rápidos 2026-09-04 · adenda elevación visual 2026-09-04
**Estado:** **G1 firmado** — AI-SR-FULL (factibilidad backend) y AI-PROD-UX (viabilidad UX) firmaron *viable con ajustes*; los ajustes bloqueantes están incorporados en esta 2.0.1. Ver §12
**Cambio 2.0 → 2.0.1:** resuelve el `[BLOQUEO]` B-1 de AI-SR-FULL — §5.2 afirmaba derivar de los guards y no lo hacía: ocho de doce roles recibían 403 en el bloque «Resumen de la empresa», con lo que CA-V2-01 y CA-V2-02 eran insatisfacibles. El bloque se parte en identidad (contrato público, doce roles) y ficha operativa (cuatro roles). Además: se resuelve la casilla «Parcial» de alertas, se corrige la vista base §5.3, se retira la cifra falsa del límite de tasa en §4.4 y RNF-V2-01, se ajustan CA-V2-01/02/03/04/07 y se añade §11 (escalación) y §12 (firmas)
**Cambio 2.0.1 → 2.0.2:** el home admite la banda **B1b · salud de módulos** (centro de mando) como composición de lectura sobre los contratos de §4.2. **No** crea endpoints. Spec: [`2026-09-04-portal-dashboard-centro-mando-ux-spec.md`](../specs/2026-09-04-portal-dashboard-centro-mando-ux-spec.md).
**Cambio 2.0.2 → 2.0.3:** se retira el panel **Accesos rápidos**. CA-V2-01 se versiona: el mínimo es identidad B3 + al menos un destino útil (B1b, bloque de trabajo, historial, o enlace «Ver mi perfil» en B3). Spec centro de mando v1.1 §11.
**Cambio 2.0.3 → 2.0.4:** elevación visual del inicio (anatomía KPI, bloque **Foco de hoy** con ratio de §4.2, avisos de campo como tabla-en-card). **No** crea endpoints ni series. Spec: [`2026-09-04-portal-dashboard-elevacion-visual-design.md`](../specs/2026-09-04-portal-dashboard-elevacion-visual-design.md).
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Sucede a:** [`HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md`](HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) **(superado)** — el CTO autorizó la reapertura en etapa 1 el 2026-08-04
**Origen:** [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) — auditoría multiagente, escalación 4
**PRD de referencia:** [`PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md`](../prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md)
**ADRs aplicables:** [ADR-018](../adrs/ADR-018-Ciclo-Vida-Tenant.md), [ADR-019](../adrs/ADR-019-Estrategia-Autenticacion-JWT.md), [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md), [ADR-023](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md), [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md), [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md)

---

## 1. Por qué existe esta versión

La v1.0 (2026-03-17) no falló: **caducó**. Describía un portal de dos rutas — `/dashboard` y `/auth/*` — y diseñó el home como ficha de estado de la cuenta porque en marzo de 2026 no había ninguna otra fuente de datos en el portal. Su §4.1 dice literalmente que no existen páginas protegidas para `/settings`, `/profile`, `/support`, `/services` ni `/billing`.

Cinco meses después el portal tiene **25 páginas bajo `/dashboard`** (CRM, suscriptores, comercial, inventario, programación, mesa de ayuda, operaciones, leads, usuarios y seis pantallas de configuración) y **seis contratos de resumen publicados y autorizados**. El home es hoy la única superficie del portal que no consume ninguno de ellos.

La auditoría multiagente del 2026-08-04 encontró el efecto medible de esa distancia: **nueve de los doce roles del tenant reciben la leyenda «Panel en preparación»**, y la implementación resulta más restrictiva que la matriz de visibilidad de la propia v1.0 §5.2 — que ya especificaba «Resumen empresa: Sí» para NOC, ACCOUNTANT y SUPPORT.

Esta v2.0 no cambia la arquitectura aprobada. Cambia **qué muestra el home** y **a quién**.

---

## 2. Boundary del módulo — qué entra y qué queda fuera

Declaración explícita, condición de entrada de la etapa 2 (protocolo §3.1).

### 2.1 Dentro del alcance

- El home `/dashboard` de `apps/portal`: composición, jerarquía, KPIs, estados y visibilidad por rol.
- Banda **B1b** (salud de módulos): chips derivados de los contratos de §4.2 y de destinos de navegación ya autorizados en el menú. Un módulo sin contrato se muestra como «Sin dato» o se omite; **no** se inventa la cifra.
- Bloque **Foco de hoy**: un ratio leído de los mismos contratos de §4.2 (visitas del día / carga, casos al día / abiertos, o catálogo vendible / activo). Sin serie temporal. Sin gauge.
- El shell que lo sostiene (`Sidebar`, `TopHeader`, `PageHeader`) **solo** en lo que la auditoría marcó como bloqueante o como deuda de firma: foco, tabulación del drawer mobile, barra lima del activo, buscador en mobile.
- La lectura agregada de los contratos de resumen **ya existentes**, sin crear ninguno nuevo.

### 2.2 Explícitamente fuera

| Queda fuera | Razón |
| --- | --- |
| Cualquier endpoint nuevo | El alcance aprobado es recomposición con datos existentes. Un dato que no exista **no se muestra**; se registra como propuesta para una fase posterior |
| Series temporales, tendencias y gráficas | No hay endpoint de series ni librería de gráficos; introducir una es dependencia npm nueva y exige ADR propio |
| Facturación e ingresos | Existe el flag `features.billing` pero ningún contrato de billing |
| Dashboard componible por usuario | Requiere endpoint de preferencias que no existe |
| Paleta de acciones tipo Ctrl+K ejecutable | Dependencia npm nueva → ADR propio |
| Sesión con cookie httpOnly y data-fetching en RSC | Deuda estructural transversal a las dos apps, con su propio ADR y consulta conjunta AI-SR-FULL + AI-SEC-ENG |
| Las 24 páginas restantes bajo `/dashboard` | Solo se tocan si el home las enlaza y el enlace está roto |
| Migración del lienzo en `apps/web` | El CTO aprobó `iwana-neutral-50` para el portal; `apps/web` se audita por separado |

**Regla de cierre del boundary:** si durante la ejecución aparece la necesidad de un dato que no está en §4.2, **no se inventa ni se deriva**: se emite `[CONSULTA]` a AI-SR-FULL y el bloque afectado se entrega con su estado de dato no disponible.

---

## 3. Personas y casos de uso

La v1.0 no nombraba personas. Esta versión sí, porque de ahí sale la matriz de §5.

| Persona | Rol | Caso de uso al abrir el home |
| --- | --- | --- |
| **Administradora de la empresa** | `ADMIN` | Ver el estado operativo y de configuración de su empresa, y detectar qué requiere su decisión hoy |
| **Operador de red** | `NOC` | Ver qué está en riesgo o vencido en aseguramiento y en trabajo de campo, y entrar a resolverlo |
| **Agente de mesa de ayuda** | `SUPPORT` | Ver los casos abiertos y los que se acercan al vencimiento de su acuerdo de servicio |
| **Ejecutivo comercial** | `SALES` | Ver ofertas por vencer, en riesgo y el estado del embudo |
| **Técnico de campo** | `TECHNICIAN` | Ver su agenda del día y sus visitas pendientes, desde un teléfono |
| **Contadora** | `ACCOUNTANT` | Ver el estado de configuración fiscal y operativa de la empresa |
| **Auditor** | `AUDITOR` | Ver la actividad reciente del tenant sin acceso operativo |

Los roles `SUBSCRIBER`, `CONTRACTOR`, `PARTNER`, `HR` e `INVESTOR` reciben la vista base de §5.3. **Ninguno recibe una pantalla vacía.**

---

## 4. Arquitectura de datos

### 4.1 Principio, sin cambios respecto de la v1.0

El home solo consume **contratos self-service del tenant autenticado**. No consume endpoints globales de plataforma. El tenant se resuelve desde el JWT verificado, nunca desde entrada del usuario.

### 4.2 Contratos disponibles — inventario verificado

Los seis existen hoy y están publicados en el cliente del portal. La columna de roles es la del guard real del controlador, no una suposición.

| Contrato | Roles autorizados (guard verificado) | Campos utilizables por el home |
| --- | --- | --- |
| `GET /tenants/me/summary` | ADMIN | Datos del tenant, configuración operativa, usuarios activos, eventos de auditoría de 7 días, alertas de onboarding |
| `GET /wfm/dashboard/summary` | ADMIN, NOC, SUPPORT | Visitas de hoy, vencidas, en riesgo, en ruta; bandeja pendiente; alertas con severidad; **carga por técnico con porcentaje de utilización y nivel de riesgo** |
| `GET /assurance/dashboard/summary` | ADMIN, NOC, SUPPORT | Casos abiertos, en riesgo, incumplidos, resueltos hoy, pendientes de servicio en campo; desglose por prioridad y tipo |
| `GET /commercial/dashboard/summary` | ADMIN, SALES, SUPPORT, NOC, ACCOUNTANT | Ofertas por vencer y en riesgo, catálogo incompleto, precios vigentes faltantes, paquetes con ítems inactivos |
| `GET /inventory/dashboard` | ADMIN, NOC, SUPPORT | Existencias totales, valor estimado, saldos por ubicación y categoría, activos serializados por estado |
| `GET /crm/pipeline/summary` | ADMIN, SALES, SUPPORT | Conteo por estado del embudo y total |

Complementarios, con su guard real verificado por AI-SR-FULL:

| Contrato | Roles autorizados | Nota |
| --- | --- | --- |
| `GET /tenants/me` | ADMIN, NOC, ACCOUNTANT, SUPPORT | Ficha operativa completa de la empresa |
| `GET /tenants/public-branding` | **Público** | Identidad visible y marca. Sin estado, ubicación ni configuración |
| `GET /audit-logs` | ADMIN, **AUDITOR** (listado; export acotado ADMIN/SYSTEM_ADMIN — dictamen SEC 2026-08-11) | Actividad reciente |
| `GET /access-control/me/effective-permissions` | 9 roles — **excluye** suscriptor, aliado e inversionista | Ruta literal; la anterior redacción `/access-control/.../effective` era imprecisa |

> **Hecho verificado que acota el diseño:** los roles **suscriptor** e **inversionista** no aparecen en el guard de **ningún** controlador del API. Para ellos, ningún contrato autenticado del tenant es accesible. Es un dato de arquitectura, no una omisión a corregir desde la capa de presentación.

### 4.3 Defectos de contrato a corregir antes de consumir

La auditoría encontró tres divergencias entre lo declarado y lo que llega en ejecución. **Son precondición de la implementación**, porque una de ellas es un tipo que miente.

| # | Defecto | Consecuencia |
| --- | --- | --- |
| C-1 | `toTenantSelfDto` asigna 14 de los ~36 campos que declara `TenantSelfResponseDto`, incluidos los 21 de marca. El frontend los tipa `string \| null`; en ejecución llegan indefinidos | Un bloque que lea la marca desde el resumen **compila limpio y falla en silencio** |
| C-2 | `settings.fiberInstallationThresholdMeters` declarado como número, nunca asignado | Valor indefinido en un campo no opcional |
| C-3 | `metrics.mfaCoverage` es campo muerto: fijado a nulo en el servicio, declarado en el contrato, nunca renderizado | Ruido en el contrato |

**Resolución:** `[CONSULTA]` a AI-SR-FULL. C-1 se corrige antes de que ningún bloque nuevo lea del resumen; C-2 y C-3 son saneamiento de contrato.

### 4.4 Política de agregación

El home hace **fan-out en cliente** a los contratos que el rol tenga autorizados, con `Promise.allSettled`. **No se crea una fachada agregadora en backend en esta fase**: sería un endpoint nuevo, y el boundary de §2.2 lo excluye.

Justificación de escala: el fan-out máximo es de seis peticiones por carga. Es asumible con carga al montar y recarga manual; **no lo es con sondeo automático**. La política de refresco se fija en la especificación de experiencia y no queda a criterio de implementación.

> **Corrección v2.0.1 — la justificación original citaba una cifra falsa.** La primera redacción decía «contra un límite de 100 por minuto». AI-SR-FULL verificó que **ese límite no existe en ejecución**: el módulo de limitación está declarado, pero su guard **nunca se registra como guard global** — `APP_GUARD` no aparece ni una vez en todo el API — y el proxy inverso tampoco limita. La decisión de §4.4 **no cambia** (el fan-out es aún menos costoso de lo que suponía), pero la cifra se retira. El hallazgo excede MOD02 y está escalado al CTO: ver §11.

> Si la medición posterior demuestra que el fan-out es un costo real, la fachada agregadora es la propuesta natural de la fase siguiente — con su propio análisis, no como parche.

---

## 5. Composición por rol — el cambio central de esta versión

### 5.1 Principio

**Se elimina el gate binario.** Un solo shell, y **cada bloque decide su propia visibilidad** a partir de los permisos efectivos del usuario. Un rol no ve una pantalla vacía: ve los bloques que su rol tiene autorizados.

La regla que sustituye al `isAdmin`:

> Un bloque se muestra si, y solo si, el rol del usuario está autorizado en el guard del contrato que lo alimenta. Si no lo está, el bloque **no se renderiza** — no se renderiza deshabilitado, ni con un aviso de permisos, ni como espacio vacío.

### 5.2 Matriz de visibilidad

Derivada de los guards de §4.2, no de una preferencia de diseño. **La matriz es un techo de autorización, no la composición**: la especificación de experiencia compone dentro de ella y puede reducir, nunca ampliar (ajuste A-1 de AI-PROD-UX en su firma de G1).

> **Corrección v2.0.1 (2026-08-04) — `[BLOQUEO]` B-1 de AI-SR-FULL, resuelto.** La primera redacción marcaba «Resumen de la empresa: Sí» para los doce roles y afirmaba derivarlo de los guards. **No lo derivaba.** Solo dos contratos entregan datos de empresa y su unión autoriza a cuatro roles; los ocho restantes recibían 403, y con ello CA-V2-01 y CA-V2-02 eran insatisfacibles. Era el riesgo HLD-DE-06 materializado dentro del propio HLD: una casilla de presentación exigiendo un permiso que el backend no concede. **El bloque se parte en dos** según lo que cada contrato realmente autoriza.

| Bloque | ADMIN | NOC | SUPPORT | SALES | ACCOUNTANT | TECHNICIAN | AUDITOR | Otros |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Identidad de la empresa** — nombre visible y marca, desde el contrato público | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |
| **Ficha operativa de la empresa** — estado, ubicación, zona horaria, moneda, idioma, país | Sí | Sí | Sí | No | Sí | No | No | No |
| Trabajo de campo (visitas, bandeja) | Sí | Sí | Sí | No | No | Sí* | No | No |
| Aseguramiento (casos, acuerdos de servicio) | Sí | Sí | Sí | No | No | No | No | No |
| Comercial (ofertas, catálogo) | Sí | Sí | Sí | Sí | Sí | No | No | No |
| Inventario | Sí | Sí | Sí | No | No | No | No | No |
| Embudo de CRM | Sí | No | Sí | Sí | No | No | No | No |
| Alertas de configuración del tenant | Sí | No | No | No | No | No | No | No |
| Señales de calidad comercial (catálogo incompleto, precios faltantes) | Sí | Sí | Sí | Sí | Sí | No | No | No |
| Actividad reciente | Sí | No | No | No | No | No | **Sí** | No |
| Enlace a mi perfil (B3) | Sí — texto «Ver mi perfil», no un panel de directorio. Los destinos de módulo viven en B1b y en los bloques de trabajo |

\* `TECHNICIAN` no está en el guard de trabajo de campo. Ve **su propia agenda** por la vía que ya usa la pantalla de programación (`GET /wfm/events` y `GET /assurance/tickets`, donde sí está autorizado), no el resumen agregado. Si el resumen debiera abrirse a ese rol, es decisión de seguridad y **no se asume aquí**.

**Resolución de la casilla «Parcial»** (`[CONSULTA]` C-c de AI-SR-FULL). La palabra no era verificable: el arreglo de alertas de onboarding se sirve **solo** por el resumen del tenant, que es ADMIN. Se sustituye por dos filas explícitas — las alertas de configuración quedan en ADMIN, y las señales de calidad comercial pasan a su propia fila con el guard que realmente las autoriza. Ninguna implementación tiene que adivinar.

**Por qué no se amplían permisos.** AI-SR-FULL ofreció como opción ampliar el guard de `GET /tenants/me` a todos los roles del tenant. **Se descarta.** Ese contrato expone correo de contacto, NIT, dígito de verificación y razón social — campos que la revisión de seguridad transversal clasifica como sensibles. Ampliarlos a suscriptor o aliado sería una decisión de seguridad tomada desde la capa de presentación, que es exactamente lo que HLD-DE-06 prohíbe y lo que esta corrección viene a reparar. La identidad de empresa se resuelve por el contrato público, que no requiere tocar ni un permiso.

**Decisión AUDITOR / actividad reciente (2026-08-11):** `[CONSULTA]` a AI-SEC-ENG en delta UX v1.2 → **GO condicionado**. Casilla §5.2 pasa a **Sí**. Controles: list +`UserRole.AUDITOR`; export sin AUDITOR salvo justificación; re-sanitize en lectura; FE home minimizado sin «ver todo»; tests de autorización/tenancy. Cierra HLD-DE-06 para este caso (alineación a PRD-MOD01, no privilegio inventado por UI). Trazabilidad: `PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md` §2bis · informe recomposición §10 · agente SEC `986c06de-ce31-42a5-a4ea-7bb9cde5a34d`.

### 5.3 Vista base

Un rol sin ningún bloque operativo autorizado ve: **identidad de la empresa** (contrato público) y el enlace **«Ver mi perfil»** en B3. **La leyenda «Panel en preparación» se retira del producto.** No hay panel de accesos rápidos: duplicaba el menú y B1b.

Los destinos del inicio **no** se filtran por el contrato de permisos efectivos: ese contrato no autoriza a suscriptor, aliado ni inversionista — tres de los cinco roles de la vista base. Se filtran por un mapa explícito derivado de los guards de §4.2, como especifica AI-PROD-UX en su spec de experiencia.

---

## 6. Criterios de aceptación medibles

Condición de entrada de la etapa 2 (protocolo §3.1): medibles, no «la pantalla debe ser usable».

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| CA-V2-01 | Ningún rol del enum recibe una pantalla de inicio vacía | Prueba por rol: los 12 valores del enum renderizan **identidad de la empresa (B3)** y al menos un destino útil (B1b, bloque de trabajo, historial, o enlace «Ver mi perfil» en B3). La leyenda «Panel en preparación» no aparece para ningún rol. **Versionado 2.0.3:** el mínimo ya no es un acceso rápido |
| CA-V2-02 | Ningún destino ofrecido conduce a un error de permisos | Por cada rol, cada bloque, chip B1b y enlace visible responde distinto de 403 |
| CA-V2-03 | El primer viewport ofrece al menos una acción operativa iniciable, en los tres puntos de corte | Presencia de control de acción **sin desplazamiento vertical** a 375, 768 y 1280 px — definición operativa de «primer viewport» fijada por AI-PROD-UX |
| CA-V2-04 | **Techo** de 9 indicadores núcleo; ninguno es métrica de administración de la cuenta salvo en el bloque de empresa | Conteo y clasificación en la revisión de G6. **No es un piso**: una vez compuesto por rol, un rol con una sola fuente autorizada tiene un solo indicador, y eso es correcto |
| CA-V2-05 | Todo indicador numérico enlaza a su lista filtrada, con el filtro en la URL | El destino conserva el filtro al recargar y el botón Atrás vuelve al home |
| CA-V2-06 | El fallo de un contrato degrada **solo** su bloque | Con una fuente forzada a error, el resto de bloques sigue renderizando |
| CA-V2-07 | Contraste AA (4,5:1 texto normal) verificado en tema claro **y oscuro** en los cuatro estados: cargado, vacío, error y **dato no disponible** | Auditoría automatizada de accesibilidad en ambos temas. **Corrección v2.0.1** (ajuste A-5 de AI-PROD-UX): la redacción original pedía auditar «sin permisos», pero §5.1 ordena que ese bloque **no se renderice** — no hay superficie que medir. La cuarta superficie es la de CA-V2-11, que además es donde vive el bloqueante B-1 del gate G6 |
| CA-V2-08 | Con el menú lateral cerrado en mobile, ningún elemento suyo es alcanzable por tabulación | Recorrido de teclado a 375 px |
| CA-V2-09 | Ningún identificador técnico ni valor de enumeración crudo es visible | Revisión de vocabulario sobre los textos renderizados |
| CA-V2-10 | Todo estado vacío ofrece la acción siguiente, y el primer uso se distingue del «sin resultados» | Revisión de los dos estados por bloque |
| CA-V2-11 | Ningún valor numérico se inventa: sin fuente, se muestra el estado de dato no disponible con contraste AA | Prueba con métricas nulas — **es la mitigación del riesgo HLD-DE-04** |
| CA-V2-12 | Al menos dos elementos de firma iWana presentes **con función** | Revisión de identidad contra la especificación de firma |

## 7. Requisitos no funcionales

| ID | Requisito | Cifra | Fuente |
| --- | --- | --- | --- |
| RNF-V2-01 | Peticiones **nuevas** que añade el home, sobre las que el envoltorio de la aplicación ya hace | ≤ 6 | Conteo de §4.2. **Denominador aclarado** (`[CONSULTA]` C-4 de AI-PROD-UX): el envoltorio ya hace cuatro peticiones, dos de ellas duplicadas (hallazgo H-17). Esas cuatro no cuentan contra este requisito; su deduplicación es trabajo propio del saneamiento |
| RNF-V2-02 | Contraste de texto normal | ≥ 4,5:1 en claro y oscuro | WCAG 2.2 AA, SC 1.4.3 |
| RNF-V2-03 | Objetivo táctil de controles primarios | ≥ 44 px | Guía operativa de la disciplina de identidad |
| RNF-V2-04 | Cobertura de pruebas en los componentes del home | ≥ 80% | Gate 4 del protocolo §4 — **exigible solo tras la escalación 3, aprobada** |
| RNF-V2-05 | Emparejamiento de color en tema oscuro | Reglas 1–4 de ADR-056 §2 | ADR-056, Aprobado |
| RNF-V2-06 | Superficie de lienzo del portal | `iwana-neutral-50` | Decisión del CTO, 2026-08-04 (escalación 1) |
| RNF-V2-07 | Capas de superposición | Siete tokens `--z-*` semánticos | [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), **Aprobado 2026-08-04** |

---

## 8. Riesgos

| ID | Riesgo | Impacto | Mitigación |
| --- | --- | --- | --- |
| HLD-DE-04 | Mostrar indicadores sin fuente consolidada produce números ficticios | **Crítico** | Se mantiene de la v1.0: valor nulo permitido y estado de dato no disponible. **Novedad v2.0:** ese estado tiene ahora criterio propio (CA-V2-11) y prueba obligatoria — la auditoría demostró que la mitigación existía en código y se renderizaba a 2,60:1 de contraste, sin ningún test que la cubriera |
| HLD-DE-05 | El fan-out de seis peticiones degrada el arranque del home | Medio | Carga en paralelo, degradación por bloque, política de refresco fijada en la especificación de experiencia y no en implementación |
| HLD-DE-06 | Abrir visibilidad por rol induce a ampliar permisos de backend sin decisión de seguridad | **Alto** | La matriz §5.2 se deriva de los guards existentes. Ninguna ampliación de permiso se decide desde la capa de presentación: `[CONSULTA]` a AI-SEC-ENG |
| HLD-DE-07 | Consumir campos que el contrato declara pero no entrega (C-1) | **Alto** | Corregir C-1 antes de que cualquier bloque nuevo lea del resumen. Es un fallo silencioso: compila |
| HLD-DE-08 | Multiplicar indicadores numéricos rompe pruebas E2E que seleccionan por texto exacto | Medio | Retrabajo coordinado con AI-SR-QA dentro de la misma fase; los selectores frágiles se sustituyen por roles accesibles |

## 9. Requiere ADR / requiere CTO

- **Requiere ADR:** sí, uno — [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), tokens de capas. El resto del alcance opera dentro de decisiones ya aprobadas.
- **Requiere CTO:** las cuatro escalaciones de la auditoría, **resueltas el 2026-08-04**. Requeriría CTO de nuevo si se pretendiera crear endpoints, introducir dependencias de gráficas o ampliar permisos de auditoría.

## 10. Estrategia de verificación

| Nivel | Objetivo | Criterios que cubre |
| --- | --- | --- |
| Unit frontend | Ramas de composición por rol, estados del home, valor nulo del indicador | CA-V2-01, 06, 11 |
| Unit backend | Corrección de C-1 en el mapeo del resumen | §4.3 |
| E2E accesibilidad | Auditoría automatizada en tema claro **y oscuro**, cuatro estados | CA-V2-07 |
| E2E teclado | Recorrido a 375 px con el menú cerrado | CA-V2-08 |
| E2E funcional | Un recorrido por rol representativo: ADMIN, NOC, SALES y un rol de vista base | CA-V2-01, 02, 05 |
| Revisión de identidad | Elementos de firma con función, semántica del lima | CA-V2-12 |
| Revisión de vocabulario | Textos renderizados | CA-V2-09 |

**Regla de evidencia:** un `pnpm test` en verde no prueba que las pruebas corrieron. El informe de fase adjunta la línea de resumen de Turborepo con `Cached: 0`, o la corrida forzada. Una cifra de cobertura sin esa prueba se reporta como no verificada.

**Estado de la cobertura al 2026-08-04** (AI-PLAT-OPS, escalación 3 ejecutada): el umbral ya existe en `apps/portal` y `apps/web`, fijado como trinquete en el suelo medido menos un punto — portal 55/47/49/57, web 36/29/32/37. **El 80% de RNF-V2-04 es el destino, no el piso de hoy.** Además se corrigió un defecto que agravaba el gate fantasma: `collectCoverageFrom` usaba un patrón que no emparejaba **ningún** archivo, de modo que la cobertura se medía sobre `0/0` y ningún umbral habría podido fallar.

---

## 11. Escalación derivada — excede este módulo

```
[ESCALACION AL CTO] — El límite de tasa global del API no está cableado
Prioridad: Alta — es un control de seguridad, no un defecto de MOD02
Contexto: AI-SR-FULL lo encontró al verificar la justificación de escala de §4.4, y
  AI-EM-ARCH lo confirmó de forma independiente. El módulo de limitación se declara en
  app.module.ts, pero su guard NUNCA se registra como guard global: `APP_GUARD` no
  aparece ni una sola vez en todo apps/api/src, y main.ts no llama a useGlobalGuards.
  El proxy inverso tampoco declara limitación. El único throttling efectivo del repo se
  aplica a mano en un solo módulo.
  Efecto colateral: los decoradores de límite por ruta del controlador de tenant son
  metadatos inertes — ningún guard los lee.
  Agravante documental: AGENTS.md, CLAUDE.md y un comentario de main.ts afirman los tres
  un control global de 100 req/min que no existe. Es una afirmación con forma de
  evidencia que no la respalda — el patrón que ADR-056 persigue, esta vez en un control
  de seguridad.
Opciones (máx. 3):
  A. Cablear el guard global y corregir los tres documentos, con revisión de AI-SEC-ENG
     sobre el límite adecuado por superficie.
  B. Cablear la limitación en el proxy inverso (AI-PLAT-OPS) y corregir los documentos.
  C. Corregir solo los documentos y aceptar la ausencia de límite, con ADR que lo ampare.
Recomendación: A, con B como refuerzo en el borde. C no es aceptable para un API
  multi-tenant expuesto: deja la superficie de autenticación sin ninguna cota.
Destinatarios: AI-SEC-ENG (límite por superficie) y AI-PLAT-OPS (borde).
Decisión requerida antes de: cualquier exposición pública del API.
```

**No bloquea esta fase.** La decisión de §4.4 se sostiene sin la cifra, y el hallazgo no nace del dashboard: nace de haber ido a verificar una cifra en lugar de citarla.

---

## 12. Firmas de G1

| Firmante | Dominio | Veredicto | Ajustes exigidos |
| --- | --- | --- | --- |
| **AI-SR-FULL** | Factibilidad backend | **Viable con ajustes bloqueantes** | B-1 (§5.2 fila 1), B-2 (§5.3), B-3 (casilla «Parcial»), cifra de RNF-V2-01. **Los cuatro incorporados en esta 2.0.1** |
| **AI-PROD-UX** | Viabilidad UX | **Viable con ajustes** | A-1 (matriz como techo), A-2 (promesa al técnico), A-3 (CA-V2-05 hoy no satisfacible), A-4 (filtro de accesos rápidos), A-5 (CA-V2-07). **Los cinco incorporados o resueltos en la spec de experiencia** |

Verificación independiente de AI-SR-FULL sobre §4.2: **6 de 6 filas exactas**, abriendo cada controlador y leyendo cada guard. La tabla de contratos y sus roles se da por verificada.

**A-3 queda como alcance declarado, no como defecto:** cuatro destinos no leen hoy sus filtros de la URL, y CA-V2-05 no es verificable hasta que lo hagan. Entra en el alcance de la fase, y el prompt de ejecución lo nombra explícitamente.
