# UX spec — Recomposición del inicio del portal empresarial (`apps/portal` → `/dashboard`)

**Versión:** 1.0
**Estado:** Congelado — desbloqueante para AI-FE-PLATFORM y AI-SR-QA (protocolo §3bis, track UX)
**Fecha:** 2026-08-04
**Autor:** AI-PROD-UX
**Etapa del workflow:** 2 — solución UX/UI ([protocolo v1.5](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3)
**Alcance:** el inicio `/dashboard` de `apps/portal` y las piezas del shell que la auditoría marcó como bloqueantes (foco y tabulación del menú lateral en móvil, entrada al buscador global bajo 1024 px)

**Entradas**

- [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) — HLD de referencia; esta spec se escribe contra su §2.2 (boundary), §3 (personas), §4.2 (contratos), §5.2 (matriz de visibilidad) y §6 (criterios)
- [`HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) **(superado)** — solo como genealogía
- [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) — auditoría multiagente, hallazgos H-01 a H-18
- [`spec Firma iWana`](2026-07-12-firma-iwana-diseno-visual-design.md) — dirección visual aprobada: §3 elementos de firma y reglas semánticas del lima, §2.6 estados vacíos diferenciados, §2.8 skeletons con forma, §5 anti-patrones
- Precedente de formato: [`2026-07-20-web-dashboard-centro-control-ux-spec.md`](2026-07-20-web-dashboard-centro-control-ux-spec.md) — mismo ejercicio para la consola de plataforma
- Contrato hermano, congelado en paralelo el mismo día: [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) v1.0 (AI-DS-OWNER) — tokens, API de componente y estados requeridos. Ambos documentos se deslindan expresamente: aquel fija *con qué*, este fija *qué* y *en qué orden*
- Skills aplicadas: `iwana-identity-ui-review` (modo diseño, disciplina rectora) · `system-vocabulary-review` (todo texto visible propuesto)
- [ADR-023](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) y [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) — aprobados · [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md) — aprobado 2026-08-04, tokens de capas; esta spec no depende de él salvo en la hoja de superposición del buscador móvil (§8)

**Qué es y qué no es este documento.** Especifica **comportamiento, jerarquía y flujo**. No define tokens, paleta ni API de componentes: eso es de AI-DS-OWNER, que trabaja en paralelo sobre el mismo HLD. Donde esta spec necesita un patrón, lo **nombra** y remite su contrato al track de design system. No contiene PII ni datos reales; todas las cifras de los ejemplos son ilustrativas.

**Regla de dato.** Solo existen los contratos de HLD §4.2. Cada bloque, indicador y estado de esta spec declara el campo del que sale. Donde una idea necesitaba un dato inexistente, la idea **no** se especifica como entregable: se registra en §12 como propuesta para fase posterior, con el dato faltante nombrado.

---

## 1. Tarea principal por persona

Una frase por persona: lo que la persona viene a resolver al abrir el inicio. De aquí sale todo lo demás — si un bloque no sirve a ninguna de estas siete frases, no está en la pantalla.

| Persona | Tarea principal al abrir el inicio |
| --- | --- |
| **Administradora de la empresa** | Ver qué de mi empresa requiere una decisión mía hoy, y entrar a resolverlo. |
| **Monitoreo operativo** (`NOC`) | Ver qué trabajo de campo va tarde o está en riesgo ahora mismo, y entrar a reasignarlo. |
| **Soporte inicial** (`SUPPORT`) | Ver qué casos están abiertos y cuáles se acercan a incumplir su acuerdo de servicio, y entrar a atenderlos. |
| **Ejecutivo comercial** (`SALES`) | Ver qué ofertas vencen o están incompletas y cómo va el embudo, y entrar a corregirlo. |
| **Técnico de campo** (`TECHNICIAN`) | Entrar a mi agenda de hoy en un toque, desde el teléfono. |
| **Contadora** (`ACCOUNTANT`) | Ver qué le falta al catálogo comercial para facturar sin huecos, y entrar a completarlo. |
| **Auditor** (`AUDITOR`) | Ver qué cambió en la empresa recientemente, sin tocar la operación. |

Los cinco roles restantes del catálogo (`HR`, `SUBSCRIBER`, `CONTRACTOR`, `PARTNER`, `INVESTOR`) no tienen una tarea operativa que el inicio pueda resolver con los contratos de §4.2. Su tarea principal es **saber dónde está parado y a dónde puede ir**: la vista base de §4.12 se lo responde. Ninguno recibe una pantalla vacía y ninguno recibe una pantalla que finja datos.

---

## 2. Arquitectura de información del inicio

### 2.1 El problema que se corrige

Hoy la retícula de 12 columnas reparte así: **la columna ancha (8) contiene lo estático** — tres métricas de administración de la cuenta y la ficha de la empresa — y **la columna estrecha (4) contiene lo accionable** — alertas de configuración, actividad y accesos. La jerarquía visual está invertida respecto de la tarea: lo que se lee primero y ocupa más superficie es lo que menos se usa.

La corrección no es mover cajas de columna. Es **cambiar el eje**: el inicio pasa de retícula de dos columnas con contenidos heterogéneos a **bandas horizontales de prioridad decreciente**, donde la columna lateral aparece solo por debajo de la banda dominante y solo con lo que legítimamente es apoyo.

### 2.2 Las cinco bandas, en orden de lectura

| Banda | Contenido | Ancho a 1280 px | Peso visual | Aparece |
| --- | --- | --- | --- | --- |
| **B0 · Encabezado** | Título, hora de la última lectura, franja de acciones del rol (§5) | 12 col | Alto — es el único lugar con acciones primarias | Siempre |
| **B1 · Indicadores núcleo** | De 3 a 7 indicadores del rol (§3), en tarjetas iguales | 12 col, 4 por fila | **Dominante** — es la superficie que responde «¿qué requiere mi atención?» | Si el rol tiene al menos un indicador autorizado |
| **B2 · Trabajo de hoy** | La lista accionable del rol: atención de campo, atención comercial o casos (§4) | 8 col | Alto — es donde se pasa de la cifra al elemento concreto | Si el rol tiene al menos un bloque de lista autorizado |
| **B2b · Apoyo** | Próximo paso de configuración (§7) · Historial de cambios · Accesos rápidos | 4 col, junto a B2 | Medio | Cada pieza según §4 |
| **B3 · Estado de la empresa** | Ficha del tenant: nombre, estado del servicio, zona horaria, moneda, sedes | 12 col | **Subordinado** — cierra la página, no la abre | Siempre (es el único bloque común a los 12 roles) |

**Punto de corte.** El «primer viewport» de esta spec se define, sin ambigüedad, como **lo visible sin desplazamiento vertical** en los tres tamaños de §8. En los tres debe caber, completa: B0 con al menos una acción operable, y **al menos dos indicadores de B1**. B3 nunca cae dentro del primer viewport en ningún tamaño — si cayera, la jerarquía volvería a invertirse.

### 2.3 Reglas de composición

1. **Un bloque que el rol no tiene autorizado no se renderiza** — ni deshabilitado, ni con aviso, ni como hueco (HLD §5.1). El hueco se cierra: las bandas colapsan.
2. **La ficha de la empresa deja de ser una superficie de lectura larga.** En B3 se muestra en una sola fila de datos con etiqueta breve, no como tarjeta de expediente. Su detalle vive en Configuración, a un enlace.
3. **Ningún bloque anida tarjetas dentro de tarjetas.** Un panel contiene filas o indicadores, no sub-paneles (anti-patrón de la disciplina de identidad).
4. **Máximo un bloque de lista dominante por rol.** Si el rol tiene autorizados dos (por ejemplo, campo y casos), el orden lo fija §4 por rol y el segundo baja a B2b o se pliega tras «Ver más». Nunca dos listas compitiendo en B2.
5. **Elementos de firma con función (criterio CA-V2-12).** Esta composición apoya dos, con función y no como adorno: la **barra lima del elemento activo** en el menú lateral (resuelve además el fallo de «solo color» del ítem activo) y el **par tonal lima de completitud** en el estado «al día» de los bloques sin pendientes. El lima **no** se usa para urgencia, vencimiento ni riesgo en ninguna parte de esta pantalla; esas señales usan las escalas de advertencia y error.

---

## 3. Indicadores núcleo (CA-V2-04, CA-V2-05)

### 3.1 Definición y cota

Un **indicador núcleo** es una cifra operativa que (a) responde a la tarea principal de al menos una persona de §1, (b) sale de un campo nombrado de HLD §4.2, y (c) conduce a la lista de trabajo donde esa cifra se resuelve.

**La unión son siete.** Ningún rol ve los siete: el máximo por rol es 7 (administradora) y el mínimo con indicadores es 2. Ninguna métrica de administración de la cuenta (usuarios con acceso, eventos de historial) es indicador núcleo: esas cifras bajan a B3 y a la pieza de historial, que es donde son pertinentes.

### 3.2 Los siete

| # | Etiqueta visible | Campo de HLD §4.2 | Destino al pulsar | Filtro en la dirección | Estado del filtro en el destino |
| --- | --- | --- | --- | --- | --- |
| I-1 | Visitas de hoy | `wfm.todayCount` | Agenda de operaciones de campo | `view=day&fromDate=<hoy local>` | **Debe añadirse** — la agenda hoy solo lee de la dirección los parámetros de traspaso (`open`, `type`, `expedienteId`) |
| I-2 | Solicitudes por programar | `wfm.pendingInbox.readyToScheduleCount` | Bandeja de solicitudes pendientes | `status=READY_TO_SCHEDULE` | **Debe añadirse** — la bandeja filtra hoy en estado local |
| I-3 | Casos abiertos | `assurance.openCount` | Mesa de ayuda | `status=OPEN` | **Existe** — la lista ya persiste `status` en la dirección |
| I-4 | Casos en riesgo de incumplir | `assurance.atRiskCount` | Mesa de ayuda | `slaBreachStatus=AT_RISK` | **Debe añadirse a la dirección** — el parámetro ya existe en el contrato de la lista |
| I-5 | Planes sin precio vigente | `commercial.missingCurrentPriceCount` | Comercial → Planes | `tab=plans&missingPrice=1` | **Existe** — filtro ya soportado |
| I-6 | Ofertas en riesgo | `commercial.offersAtRiskCount` | Lista de atención comercial del propio inicio (§4.6) | — | **Excepción declarada** (§3.4) |
| I-7 | Oportunidades en seguimiento | `crm.pipeline` — suma de los estados abiertos del embudo | Oportunidades | `view=open` | **Debe añadirse** — la lista alterna vistas en estado local |

**Cifras de urgencia asociadas.** Tres cifras más son operativamente críticas pero **no** son indicadores independientes: se muestran como distintivo tonal de severidad sobre la tarjeta del indicador con el que comparten trabajo. Esto mantiene la cota de §3.1 sin perder la señal.

| Cifra | Campo | Se muestra sobre | Tono |
| --- | --- | --- | --- |
| Visitas vencidas | `wfm.overdueCount` | I-1 | Error si > 0 |
| Casos que ya incumplieron | `assurance.breachedCount` | I-4 | Error si > 0 |
| Solicitudes con atención vencida | `wfm.pendingInbox.overdueSlaCount` | I-2 | Advertencia si > 0 |

> El distintivo tonal sobre la tarjeta de indicador ocupa la ranura de *delta como badge tonal* de la anatomía de tarjeta de indicador (Firma §2.1), ya contratada por AI-DS-OWNER en [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) §1.6 con los tonos de advertencia e incumplimiento que estas tres cifras necesitan. **La API es de AI-DS-OWNER**; esta spec fija cuándo aparece y con qué severidad, no su forma.

### 3.3 Regla de reconciliación (no negociable)

> **La cifra del indicador y el conteo de su destino deben coincidir.** Si el filtro disponible en el destino no reproduce exactamente el conjunto que la cifra cuenta, el indicador **no enlaza a esa lista**: enlaza al bloque de lista del propio inicio, o no enlaza y se declara excepción.

Un indicador que dice 12 y abre una lista de 5 es peor que un indicador sin enlace: el operador cree estar viendo el conjunto completo y toma decisiones sobre un subconjunto. Los siete de §3.2 se verificaron contra la semántica real del contrato: I-3 cuenta exactamente los casos en estado abierto, y el filtro `status=OPEN` reproduce ese conjunto; I-5 cuenta exactamente los planes sin precio vigente, y el filtro `missingPrice` reproduce ese conjunto.

### 3.4 Excepciones a CA-V2-05, con su razón

| Indicador | Por qué no enlaza a una lista filtrada | Qué se hace en su lugar |
| --- | --- | --- |
| I-6 · Ofertas en riesgo | La cifra es la unión de dos condiciones (vence pronto **o** cerca del cupo) repartidas entre varias pestañas del módulo comercial. Ningún filtro de una sola pestaña la reproduce; enlazar a una sola rompería §3.3 | Pulsar el indicador **despliega la lista de atención comercial en el propio inicio** (§4.6), donde cada fila sí tiene destino exacto — el contrato entrega, por fila, la pestaña de destino y el identificador del elemento |
| Casos que ya incumplieron | La cifra suma dos valores distintos de incumplimiento y el filtro de la lista acepta uno solo por vez | Se muestra como distintivo de urgencia sobre I-4 (§3.2), sin enlace propio |

Ambas excepciones se registran aquí para que la verificación de CA-V2-05 sea decidible: **cinco de los siete indicadores enlazan a lista filtrada con el filtro en la dirección; dos tienen excepción escrita con su razón.**

### 3.5 Costo que esta sección impone fuera del inicio

Cuatro destinos deben aprender a leer su filtro desde la dirección (columna «Debe añadirse» de §3.2). Es trabajo de interfaz, sin contrato nuevo ni endpoint nuevo: los parámetros del API ya existen en los tres casos donde se consulta al servidor, y el patrón de filtros en la dirección ya está implantado en el portal (la mesa de ayuda, el catálogo comercial, inventario y suscriptores ya lo hacen). **Si este trabajo no entra en la fase, CA-V2-05 no es verificable y los cuatro indicadores afectados se degradan a enlace sin filtro**, lo que contradice §3.3. Ver `[CONSULTA] C-2` en §13.

---

## 4. Composición por rol — los 12 roles del catálogo

Deriva de HLD §5.2 y resuelve lo que allí queda abierto.

### 4.1 Principio que esta spec añade a la matriz del HLD

> **La matriz de HLD §5.2 fija el techo de visibilidad, no la composición.** Que un rol esté autorizado en el guard de un contrato significa que *puede* ver ese bloque, no que *deba* verlo en el inicio.

Sin este principio, la autorización se convierte en prescripción y produce inicios incoherentes: monitoreo operativo recibiría un bloque de catálogo comercial y soporte inicial recibiría cinco bloques operativos simultáneos, la pantalla más cargada del producto para el rol con la tarea más acotada. Esta spec compone **dentro** del techo, nunca por encima: **ninguna de las decisiones de esta sección amplía un permiso; todas reducen.** La ampliación de permisos es decisión de seguridad y no se toma desde la capa de presentación.

### 4.2 Vocabulario de bloques

| Bloque | Contrato que lo alimenta | Contenido |
| --- | --- | --- |
| **Atención de campo** | `wfm.alerts[]` | Lista de avisos con título, descripción y severidad; hasta 5 filas, ordenadas por severidad |
| **Casos de la mesa de ayuda** | `assurance.byPriority`, `byType` | Desglose de los casos activos por prioridad y por tipo, con enlace a la lista filtrada |
| **Atención comercial** | `commercial.attentionItems[]` | Hasta 5 filas; cada una con destino exacto (pestaña + elemento) |
| **Embudo de oportunidades** | `crm.pipeline` | Conteo por estado del embudo |
| **Estado del almacén** | `inventory.totalOnHand`, `estimatedTotalValue` | Dos cifras de contexto, sin urgencia asociada |
| **Próximo paso de configuración** | `tenant.alerts[]` | Un solo paso destacado; el resto tras «Ver los N pendientes» (§7) |
| **Historial de cambios** | `GET /audit-logs` | Últimos movimientos de la empresa, en lenguaje de negocio |
| **Accesos rápidos** | — (mapa estático de §4.14) | Destinos frecuentes del rol |
| **Estado de la empresa** | `tenant`, `settings` | Ficha resumida (B3) |

### 4.3 Administradora de la empresa (`ADMIN`)

- **Indicadores (7):** I-1 … I-7.
- **B2:** Atención de campo. **B2b:** Próximo paso de configuración · Historial de cambios · Accesos rápidos.
- **Plegados bajo B2** («Ver más»): Casos de la mesa de ayuda · Atención comercial · Estado del almacén.
- **Razón:** es el único rol con visión completa; sin plegado, siete indicadores más cinco listas superan cualquier presupuesto de atención razonable.

### 4.4 Monitoreo operativo (`NOC`)

- **Indicadores (4):** I-1, I-2, I-3, I-4.
- **B2:** Atención de campo. **B2b:** Accesos rápidos · Estado del almacén (plegado).
- **No se compone**, aunque el techo lo autorice: bloque comercial y embudo de oportunidades. **Razón:** la tarea de §1 es detectar y resolver riesgo operativo; un catálogo incompleto no es información de turno para este rol. Sigue accesible por el menú lateral.
- **Efecto en peticiones:** el inicio de este rol pide cuatro contratos, no cinco.

### 4.5 Soporte inicial (`SUPPORT`)

- **Indicadores (4):** I-3, I-4, I-1, I-2 — en ese orden; los casos primero, el campo después.
- **B2:** Casos de la mesa de ayuda. **B2b:** Atención de campo (hasta 3 filas) · Accesos rápidos.
- **No se compone:** atención comercial, embudo de oportunidades, estado del almacén. **Razón:** el techo autoriza cinco bloques operativos para este rol; componerlos todos produce el inicio más cargado del producto para la tarea más acotada de §1.

### 4.6 Ejecutivo comercial (`SALES`)

- **Indicadores (3):** I-5, I-6, I-7.
- **B2:** Atención comercial (hasta 5 filas, cada una con destino exacto). **B2b:** Embudo de oportunidades · Accesos rápidos.
- **Confirmación explícita del punto que el encargo pregunta:** que este rol vea comercial y embudo y **nada** de trabajo de campo **no es incoherente**: es exactamente su tarea de §1, y el techo de HLD §5.2 no le autoriza campo ni aseguramiento. Lo que sí sería incoherente es lo contrario — que lo viera y no pudiera actuar sobre ello.

### 4.7 Contadora (`ACCOUNTANT`)

- **Indicadores (1):** I-5.
- **B2:** Atención comercial, filtrada a las filas cuyo motivo es de precio, cobertura tributaria o combos con elementos inactivos. **B2b:** Accesos rápidos.
- **Nota:** un solo indicador está por debajo del rango 5-9 de CA-V2-04, y es correcto que lo esté — el rango es un **techo de carga cognitiva por vista**, no un piso a rellenar. Ver `[CONSULTA] C-3` en §13.

### 4.8 Técnico de campo (`TECHNICIAN`)

- **Indicadores:** ninguno. **Este rol no está en el guard del resumen de campo y esta spec no lo asume abierto.**
- **B0:** una sola acción, primaria y de tamaño táctil pleno: **«Ver mi agenda de hoy»** → agenda de operaciones de campo. Verificado: el rol está autorizado a **ver** la agenda, y la propia pantalla de programación ya redirige a los roles de ejecución hacia ella.
- **B2:** ninguno. **B2b:** Accesos rápidos. **B3:** Estado de la empresa.
- **Razón de la decisión:** el asterisco de HLD §5.2 promete a este rol «su propia agenda» en el inicio, pero §4.2 no lista ningún contrato que la alimente y §2.2 prohíbe crear uno. La lectura que esta spec adopta —y que somete a confirmación en `[CONSULTA] C-1`— es que la promesa es **de navegación, no de datos en el inicio**: un toque desde el inicio a la agenda que ya resuelve su día. Cualquier otra lectura exige un contrato nuevo, es decir, un cambio de alcance.

### 4.9 Auditor (`AUDITOR`)

- **Indicadores:** ninguno.
- **B2b:** Historial de cambios **si y solo si** AI-SEC-ENG aprueba la consulta que HLD §5.2 dejó abierta. **Mientras no haya decisión, este rol recibe la vista base de §4.12** — no se antepone una decisión de interfaz a una decisión de seguridad.
- **Limitación registrada:** el portal no tiene hoy ninguna página de historial completo bajo `/dashboard`. Si el bloque se aprueba, no puede ofrecer «ver todo»: mostrará los últimos movimientos y nada más. El destino faltante se registra en §12.

### 4.10 Talento humano (`HR`)

- Vista base (§4.12). El techo de §5.2 no le autoriza ningún resumen operativo y ningún contrato de §4.2 sirve a una tarea de talento humano.

### 4.11 Contratista (`CONTRACTOR`)

- Vista base **más** la acción primaria «Ver mi agenda de hoy», por la misma vía verificada que el técnico de campo (§4.8): el rol está autorizado a ver la agenda.

### 4.12 Vista base — `SUBSCRIBER`, `PARTNER`, `INVESTOR`, `HR` y todo rol sin bloque operativo

Composición exacta:

- **B0:** título de la empresa y una acción: «Ver mi perfil».
- **B1:** ninguna tarjeta de indicador. **No se dibujan tarjetas vacías ni con guion**: la banda no existe.
- **B2b:** Accesos rápidos filtrados (§4.14).
- **B3:** Estado de la empresa.

La leyenda «Panel en preparación» **se retira del producto**. Esta vista no se disculpa por lo que no muestra: muestra lo que hay y a dónde se puede ir. Cumple CA-V2-01 sin fingir dato alguno.

### 4.13 Tabla de composición completa

| Rol | Indicadores | Bloque dominante (B2) | Apoyo (B2b) | Plegados |
| --- | --- | --- | --- | --- |
| Administradora | I-1…I-7 | Atención de campo | Próximo paso · Historial · Accesos | Casos · Atención comercial · Almacén |
| Monitoreo operativo | I-1, I-2, I-3, I-4 | Atención de campo | Accesos | Almacén |
| Soporte inicial | I-3, I-4, I-1, I-2 | Casos de la mesa de ayuda | Atención de campo (3 filas) · Accesos | — |
| Ejecutivo comercial | I-5, I-6, I-7 | Atención comercial | Embudo · Accesos | — |
| Contadora | I-5 | Atención comercial (filtrada) | Accesos | — |
| Técnico de campo | — | — | Accesos | — |
| Contratista | — | — | Accesos | — |
| Auditor | — | — | Historial *(condicionado)* · Accesos | — |
| Talento humano | — | — | Accesos | — |
| Suscriptor | — | — | Accesos | — |
| Aliado | — | — | Accesos | — |
| Inversionista | — | — | Accesos | — |

Los doce roles reciben, como mínimo, encabezado con una acción, accesos rápidos y estado de la empresa. **Ninguno recibe una pantalla sin contenido** (CA-V2-01).

### 4.14 Accesos rápidos — cómo se filtran (CA-V2-02)

**No se consultan los permisos efectivos del usuario para esto.** Dos razones verificadas: (a) el contrato de permisos efectivos propios **no autoriza** a suscriptor, aliado ni inversionista — es decir, falla exactamente para tres de los roles de la vista base, que son los que más necesitan el filtrado; (b) añadiría una petición al presupuesto de carga (§9).

La regla es determinista y auditable:

> Un acceso rápido se ofrece si, y solo si, el rol del usuario está autorizado en el guard del contrato que alimenta la vista de destino (HLD §4.2), o el destino es una ruta personal del propio usuario. Un destino cuyo guard no está verificado en §4.2 **no se ofrece en esta fase**.

| Acceso | Etiqueta visible | Roles que lo ven |
| --- | --- | --- |
| Comercial | Comercial | Administradora, comercial, soporte inicial, monitoreo operativo, contadora |
| Operaciones de campo | Programación | Administradora, monitoreo operativo, soporte inicial, técnico de campo, contratista |
| Mesa de ayuda | Mesa de ayuda | Administradora, monitoreo operativo, soporte inicial |
| Inventario | Inventario | Administradora, monitoreo operativo, soporte inicial |
| Oportunidades | Oportunidades | Administradora, comercial, soporte inicial |
| Usuarios | Usuarios y accesos | Administradora |
| Configuración | Configuración | Administradora |
| Mi perfil | Mi perfil | Los 12 |

**Se elimina la fila «Reportes».** Un acceso permanentemente deshabilitado con la etiqueta «Fase siguiente» ocupa espacio, no lleva a ninguna parte y enseña al operador a ignorar la lista. También se elimina el contador «N accesos disponibles hoy»: es ruido sobre una lista que el usuario ya ve completa.

---

## 5. La franja de acciones del encabezado (CA-V2-03, H-06)

### 5.1 Criterio de selección

Una acción entra en el encabezado si cumple las tres: **(a)** inicia trabajo, no lo consulta; **(b)** es de las más frecuentes del rol; **(c)** su destino existe hoy y el rol está autorizado. Máximo **dos** acciones visibles más un menú de desbordamiento; a 375 px, **una** visible (§8).

### 5.2 Acciones por rol

| Rol | Acción primaria | Acción secundaria | Por qué esas |
| --- | --- | --- | --- |
| Administradora | Registrar suscriptor | Programar visita | Las dos altas que abren cualquier ciclo de negocio del proveedor |
| Monitoreo operativo | Programar visita | Ver agenda del día | Su trabajo empieza asignando y reasignando campo |
| Soporte inicial | Registrar caso | Registrar suscriptor | El registro de caso es el evento que abre su jornada |
| Ejecutivo comercial | Registrar suscriptor | Nueva oportunidad | Las dos entradas del embudo |
| Contadora | Revisar planes sin precio | — | Su única tarea accionable con los datos existentes |
| Técnico de campo · Contratista | Ver mi agenda de hoy | — | Es toda su tarea de §1; una acción, táctil, sin competencia |
| Auditor | Ver historial de cambios *(si se aprueba §4.9)* | — | — |
| Talento humano · Suscriptor · Aliado · Inversionista | Ver mi perfil | — | Única acción con destino verificado para estos roles |

### 5.3 Jerarquía visual y destinos

- La acción primaria es **azul noche sólido**; la secundaria es de contorno. El lima **no** se usa como relleno de la acción principal de página (enmienda del CTO recogida en Firma §3).
- Objetivo táctil mínimo de 44 px en los tres tamaños.
- **Destinos verificados con apertura directa:** «Programar visita» y «Ver agenda del día» abren la agenda con su parámetro de creación, que la pantalla ya lee. «Registrar suscriptor» tiene ruta propia de alta.
- **Destinos sin apertura directa hoy:** «Registrar caso» y «Nueva oportunidad» abren un diálogo que vive en estado local de sus pantallas. Esta spec pide extender a esas dos pantallas la misma convención de apertura por dirección que la agenda ya usa. **Si esa extensión queda fuera de alcance, la acción navega a la lista del módulo y el operador pulsa allí el botón de alta** — la acción sigue existiendo y CA-V2-03 se cumple, con un paso más. Ver `[CONSULTA] C-2`.

---

## 6. Matriz de estados por bloque (CA-V2-06, CA-V2-10, CA-V2-11)

### 6.1 Los seis estados

| Estado | Cuándo | Qué se ve |
| --- | --- | --- |
| **Cargando** | Primera carga del bloque | Esqueleto con la **forma** del contenido (no un indicador giratorio), que reserva el espacio final para que no haya salto de posición. Aparece solo si la carga supera ~300 ms |
| **Actualizando** | Recarga posterior (§9) | **La cifra anterior se conserva**, atenuada, con señal no bloqueante de actualización. Nunca se vuelve al esqueleto: parpadear cifras en cada recarga es peor que esperar |
| **Primera vez** | El módulo no tiene todavía ningún registro | Explicación de una línea + **acción siguiente** que crea el primer registro |
| **Al día** | Hay registros, no hay pendientes | Confirmación breve con el par tonal lima de completitud + enlace a la lista completa |
| **Error** | El contrato de ese bloque falló | Mensaje en lenguaje de negocio + **«Reintentar»** que recarga **solo ese bloque**. Los demás bloques siguen mostrando sus datos (CA-V2-06) |
| **Dato no disponible** | El contrato respondió pero el valor es nulo | Texto sustituto del valor, con contraste verificado, **nunca un cero** (CA-V2-11) |

**Sin permisos no es un estado de bloque.** Por HLD §5.1 el bloque no autorizado **no se renderiza**; no hay nada que pintar ni que auditar. La cuarta superficie a auditar en CA-V2-07 debe ser **dato no disponible**, no «sin permisos». Ver ajuste A-5 de la firma G1.

### 6.2 Cómo se distingue «primera vez» de «al día» — y dónde no se puede

Este es el punto donde la honestidad del dato manda sobre el deseo de diseño. Un conteo en cero **no distingue** «nunca hubo» de «no hay ahora». La distinción solo es posible en los bloques cuyo contrato expone además un conteo de universo:

| Bloque | ¿Distingue? | Señal usada |
| --- | --- | --- |
| Atención comercial | **Sí** | `commercial.catalogActiveCount === 0` → primera vez; > 0 con cero pendientes → al día |
| Embudo de oportunidades | **Sí** | `crm.total === 0` → primera vez |
| Estado del almacén | **Sí** | `inventory.itemsCount === 0` → primera vez |
| Atención de campo | **No** | El resumen no expone ningún conteo histórico; **siempre muestra «al día»**, nunca «primera vez» |
| Casos de la mesa de ayuda | **No** | Igual que el anterior |

**Dato que faltaría y no existe:** un conteo total de registros del módulo (histórico, no activo) en los resúmenes de campo y de mesa de ayuda. Sin él, un proveedor recién creado ve «no hay visitas pendientes» donde debería leer «aún no has programado ninguna visita». Registrado en §12; no se simula.

**Dónde sí aplica «sin resultados».** El inicio no tiene filtros de usuario, así que su par es *primera vez* / *al día*. «Sin resultados» es un estado de las **listas de destino**: cuando un indicador conduce a una lista filtrada que vuelve vacía, la lista debe mostrar «sin resultados» con la acción de quitar el filtro, **nunca** el texto de primera vez. Ese traspaso es parte de CA-V2-10.

### 6.3 Estados por bloque

| Bloque | Cargando | Primera vez → acción siguiente | Al día | Error | Dato no disponible |
| --- | --- | --- | --- | --- | --- |
| Indicadores núcleo | Esqueleto con forma de tarjeta, uno por indicador | No aplica: la banda no se dibuja si no hay contrato autorizado | Cifra en cero, legible como cero real | La tarjeta afectada muestra el error, las demás no | Texto sustituto en lugar de la cifra |
| Atención de campo | 3 filas de esqueleto | No distinguible (§6.2) | «Sin avisos de campo pendientes» + «Ver la agenda de hoy» | «No pudimos cargar el resumen de operaciones de campo» + «Reintentar» | Fila individual sin dato: se omite la fila |
| Casos de la mesa de ayuda | 3 filas de esqueleto | No distinguible (§6.2) | «Sin casos pendientes» + «Ver la mesa de ayuda» | Igual patrón | Igual patrón |
| Atención comercial | 5 filas de esqueleto | «Aún no has creado tu catálogo» + **«Crear el primer plan»** | «Tu catálogo está completo» + «Ver el catálogo» | Igual patrón | Igual patrón |
| Embudo de oportunidades | Esqueleto de lista de estados | «Aún no hay oportunidades» + **«Registrar la primera oportunidad»** | «Sin oportunidades abiertas» + «Ver el historial» | Igual patrón | Igual patrón |
| Estado del almacén | Esqueleto de dos cifras | «Aún no hay productos en inventario» + **«Registrar el primer producto»** | Cifras reales | Igual patrón | Texto sustituto |
| Próximo paso de configuración | 1 fila de esqueleto | No aplica | «Tu empresa está configurada» + **«Registra tu primer suscriptor»** (§7) | Igual patrón | — |
| Historial de cambios | 4 filas de esqueleto | «Aún no hay cambios registrados» | Igual que primera vez | «No pudimos cargar el historial de cambios» + «Reintentar» | Fila sin nombre legible: se omite |
| Accesos rápidos | Sin esqueleto: es estático | No aplica | — | No aplica | — |
| Estado de la empresa | Esqueleto de una fila | No aplica | — | Igual patrón | Texto sustituto por campo |

**Regla transversal:** todo estado vacío ofrece la acción siguiente (CA-V2-10). Un vacío sin salida es un callejón. La única excepción es el historial de cambios, cuyo vacío no tiene acción que ofrecer porque el usuario no genera historial a voluntad.

### 6.4 Errores: texto y comportamiento

- **Un contrato caído degrada solo su bloque.** No hay estado de error de página completa. El encabezado, los accesos rápidos y el estado de la empresa siguen operando.
- El texto de error nombra **qué** no cargó en lenguaje de negocio, no el módulo técnico: «No pudimos cargar el resumen de operaciones de campo. Reintenta en unos minutos.»
- Tras pulsar «Reintentar», **el foco no se pierde**: si el reintento tiene éxito y el botón desaparece, el foco pasa al encabezado del bloque, que anuncia el cambio. Un segundo fallo se anuncia en la misma región viva.
- El bloque en error **no** desaparece ni se colapsa: mantener su espacio evita que el resto de la página salte.

---

## 7. Onboarding: del primer inicio al primer valor de negocio

### 7.1 El hueco que se cierra

Hoy un proveedor recién creado resuelve sus alertas de configuración y su inicio queda **más vacío que antes**: sin alertas, sin actividad, con cifras en cero. El sistema le confirma que está configurado y nunca le dice cuál es su primer paso de negocio.

### 7.2 Los tres momentos

| Momento | Condición | Qué muestra el bloque «Próximo paso» |
| --- | --- | --- |
| **M1 · Configuración pendiente** | `tenant.alerts[]` no está vacío | **Un solo paso**, el de mayor severidad, con su título, su explicación y su enlace. Debajo, en texto secundario: «Ver los N pendientes», que despliega el resto |
| **M2 · Configuración completa, sin operación** | `alerts[]` vacío **y** los conteos de universo disponibles en cero (§6.2) | El bloque cambia de título a **«Empieza tu operación»** y ofrece, en este orden: «Crea tu primer plan» → «Registra tu primer suscriptor» → «Programa tu primera visita». Los tres destinos existen hoy |
| **M3 · Operación en marcha** | Hay datos operativos | El bloque **desaparece**. Su espacio lo ocupa el trabajo real |

**M2 es la respuesta al hueco de §7.1.** El inicio no felicita al proveedor por estar configurado: le entrega la primera tarea de negocio.

### 7.3 Lo que no se puede hacer, y por qué

La idea original era un **medidor de avance** con el degradado azul → lima de la firma (elemento 3), que es exactamente el uso legítimo de ese degradado. **No se especifica como entregable de esta fase.**

> **Dato que faltaría y no existe: `completedSteps` y `totalSteps`.** El resumen de la empresa entrega la lista de alertas pendientes y un conteo de pendientes, pero **no** el total de pasos del recorrido. Un conteo de pendientes sin total no es un porcentaje, y **esta spec no lo deriva ni lo aproxima**: un medidor que muestre un avance inventado incumple el riesgo declarado del propio HLD.

Mientras el dato no exista, M1 muestra **el paso siguiente y el número de pendientes**, sin barra y sin porcentaje. La propuesta con el dato nombrado queda en §12.

---

## 8. Comportamiento responsive

| | **375 px** | **768 px** | **1280 px** |
| --- | --- | --- | --- |
| **Bandas** | Una columna; B2b va debajo de B2 | Una columna; B2b debajo de B2 | B2 (8 col) + B2b (4 col) lado a lado |
| **Indicadores** | 1 por fila, tarjeta compacta: etiqueta, cifra, distintivo | 2 por fila | 4 por fila |
| **Primer viewport** | B0 + 2 indicadores | B0 + 4 indicadores | B0 + banda completa de indicadores + inicio de B2 |
| **Acciones de B0** | **1** visible + menú de desbordamiento con nombre accesible | 2 visibles | 2 visibles + desbordamiento |
| **Listas de B2** | Filas apiladas, sin columnas; toda la fila es el objetivo táctil (≥44 px) | Filas con dos columnas | Filas completas |
| **Estado de la empresa (B3)** | Lista vertical de pares etiqueta/valor | Dos columnas | Fila única |

### 8.1 Buscador global en móvil (H-10)

El buscador global está hoy montado **en un único punto** del encabezado, oculto por debajo de 1024 px, sin sustituto. El atajo de teclado no es descubrible ni utilizable en un teléfono, que es precisamente donde trabaja el personal de campo.

**Especificación:**

- Por debajo de 1024 px, el encabezado muestra un **botón de búsqueda** persistente (icono con nombre accesible «Buscar»), a la izquierda del selector de tema, con objetivo táctil ≥44 px.
- Al pulsarlo se abre una **hoja de búsqueda a pantalla completa**: campo enfocado automáticamente, resultados en lista de una columna, cierre con «Cerrar» y con la tecla de escape.
- Mientras la hoja está abierta, **el contenido de fondo no es alcanzable por tabulación**.
- La hoja consume el mismo buscador global de escritorio: mismo alcance, mismos resultados, mismo destino. No es una búsqueda distinta.
- La capa de superposición usa el nivel semántico de superposición del contrato de capas — [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), **aprobado el 2026-08-04**. La hoja se monta en el token `--z-overlay` del contrato de capas; **no se introduce un valor nuevo fuera de escala**.

### 8.2 Menú lateral en móvil (H-04, CA-V2-08)

Con el menú lateral cerrado por debajo de 1024 px, **ningún elemento suyo es alcanzable por tabulación ni por lector de pantalla**. Hoy el panel solo se desplaza fuera de la pantalla y conserva sus destinos en el orden de tabulación: un usuario de teclado atraviesa una decena de destinos invisibles antes de llegar al contenido. Al abrirse, el foco entra al panel; al cerrarse, vuelve al botón que lo abrió.

### 8.3 Movimiento

Transiciones de 150 a 300 ms, solo de desplazamiento y opacidad, salidas más cortas que entradas. La apertura de la hoja de búsqueda y del menú lateral respeta la preferencia de movimiento reducido del sistema: con ella activa, aparecen sin animación.

---

## 9. Política de refresco

HLD §4.4 delega expresamente esta decisión en esta spec y prohíbe dejarla a criterio de implementación. Se decide así:

| Regla | Decisión | Razón |
| --- | --- | --- |
| **R-1 · Carga inicial** | Al montar, en paralelo, solo los contratos que el rol tiene autorizados **y que su composición de §4 usa** | Componer por rol reduce el abanico: monitoreo operativo pide 4, comercial 3, la vista base 1 |
| **R-2 · Sondeo automático** | **No hay.** El inicio no se auto-refresca en segundo plano | Sin series temporales ni tiempo real en el alcance, el sondeo solo gasta presupuesto de peticiones y produce cifras que cambian bajo el cursor del operador |
| **R-3 · Recarga manual** | Botón «Actualizar» en el encabezado, siempre operable, con la **hora de la última lectura** visible a su lado | La marca de hora es lo que hace honesta a la cifra: el operador sabe de cuándo es lo que está leyendo |
| **R-4 · Al volver a la pestaña** | Se recargan **solo los bloques operativos** y **solo si** han pasado ≥ 5 minutos desde la última lectura | Acota el peor caso de un operador que alterna pestañas todo el día. El estado de la empresa no se recarga: cambia con la configuración, no con el turno |
| **R-5 · Al volver con el botón «Atrás»** | **No se recarga.** Se muestra el último estado leído con su marca de hora | Volver de una lista al inicio es un movimiento de navegación, no una petición de dato fresco. Recargar aquí produce el parpadeo más frecuente y más molesto de la pantalla |
| **R-6 · Reintento tras error** | Recarga **solo el bloque** que falló | CA-V2-06 |
| **R-7 · Durante cualquier recarga** | Estado «actualizando» de §6.1, nunca esqueleto | El esqueleto es para la primera carga; en una recarga borra información que el operador ya estaba leyendo |

**Presupuesto de peticiones.** Con estas reglas, el peor caso —la administradora, que es quien más contratos consume— son **seis peticiones del inicio en la carga inicial** y ninguna más hasta que ella la pida o pasen cinco minutos con cambio de pestaña. El límite de tasa es de 100 por minuto.

**Advertencia de aritmética, y por qué importa.** El requisito RNF-V2-01 dice «≤ 6 peticiones **por carga del home**». Antes de que el inicio pida nada, el envoltorio de la aplicación ya realiza cuatro peticiones propias (sesión, perfil de usuario, empresa y la campana de historial), dos de las cuales están duplicadas con lo que el propio inicio consume. Si el denominador de RNF-V2-01 incluye el envoltorio, el requisito **ya se incumple hoy, antes de esta fase**. Esta spec impone dos reglas que reducen la cuenta sin negociar el requisito:

- **R-8 ·** El historial de cambios del inicio y la campana de notificaciones consumen **una sola lectura**. Hoy son dos peticiones con límites distintos, y por eso **pueden mostrar cosas distintas del mismo hecho** — que es un defecto de experiencia antes que de rendimiento.
- **R-9 ·** El inicio **no** consulta los permisos efectivos del usuario (§4.14).

Ver `[CONSULTA] C-4` sobre el denominador de RNF-V2-01.

---

## 10. Criterios de aceptación de experiencia

Trazables uno a uno a los CA-V2-\* del HLD. Un criterio que no se pueda verificar mirando la pantalla o recorriéndola con el teclado no está en esta lista.

| ID | Criterio | Cómo se verifica | Traza |
| --- | --- | --- | --- |
| **UX-01** | Los 12 roles del catálogo reciben encabezado con al menos una acción, accesos rápidos y estado de la empresa. Ninguno recibe la leyenda «Panel en preparación», que se retira del producto | Recorrido por rol sobre §4.13 | CA-V2-01 |
| **UX-02** | Ningún acceso rápido ni acción de encabezado ofrecido a un rol conduce a un error de permisos | Por rol, cada destino de §4.14 y §5.2 responde distinto de un rechazo por permisos | CA-V2-02 |
| **UX-03** | Sin desplazamiento vertical, a 375, 768 y 1280 px, se ven el encabezado con al menos una acción operable y al menos dos indicadores (o, si el rol no tiene indicadores, la acción primaria de §5.2) | Captura a los tres tamaños | CA-V2-03 |
| **UX-04** | Ningún rol ve más de 7 indicadores núcleo; ninguna métrica de administración de la cuenta aparece como indicador núcleo | Conteo y clasificación contra §3.2 | CA-V2-04 |
| **UX-05** | Cinco de los siete indicadores abren su lista filtrada con el filtro en la dirección; el filtro sobrevive a recargar la página y el botón «Atrás» devuelve al inicio. Los dos restantes están declarados como excepción en §3.4 | Recorrido por indicador | CA-V2-05 |
| **UX-06** | La cifra de un indicador coincide con el conteo de la lista a la que conduce | Comparación cifra ↔ conteo del destino | CA-V2-05 |
| **UX-07** | Con un contrato forzado a fallar, solo su bloque muestra error; el resto sigue mostrando datos y la página no se sustituye por un error único | Prueba por bloque | CA-V2-06 |
| **UX-08** | Los seis estados de §6.1 son alcanzables y legibles en tema claro y oscuro; la cuarta superficie auditada es **dato no disponible** | Auditoría automatizada en ambos temas | CA-V2-07, con el ajuste A-5 |
| **UX-09** | Con el menú lateral cerrado a 375 px, ningún elemento suyo es alcanzable por tabulación; al abrirlo el foco entra y al cerrarlo vuelve al botón que lo abrió | Recorrido de teclado | CA-V2-08 |
| **UX-10** | Existe una entrada visible y táctil al buscador global por debajo de 1024 px, con nombre accesible; mientras su hoja está abierta el fondo no es tabulable | Recorrido a 375 px | H-10 |
| **UX-11** | Ningún identificador técnico, clave de enumeración ni sigla interna sin contexto es visible. Las etiquetas de rol usan el vocabulario de producto: monitoreo operativo, soporte inicial, técnico de campo, contratista | Revisión de vocabulario sobre los textos renderizados | CA-V2-09 |
| **UX-12** | Todo estado vacío ofrece la acción siguiente, salvo el historial de cambios (§6.3). En los tres bloques donde el contrato lo permite, «primera vez» se distingue de «al día»; en los dos donde no, se muestra «al día» y la limitación está escrita en §6.2 | Revisión de los dos estados por bloque | CA-V2-10 |
| **UX-13** | Ninguna cifra se inventa: sin fuente, aparece el texto sustituto, nunca un cero. La regla se ejercita con al menos un valor nulo por bloque | Prueba con valores nulos | CA-V2-11 |
| **UX-14** | Al menos dos elementos de firma presentes con función: barra lima del elemento activo del menú y par tonal lima del estado «al día». El lima no aparece en ninguna señal de urgencia, vencimiento o riesgo de esta pantalla | Revisión de identidad | CA-V2-12 |
| **UX-15** | Una recarga conserva las cifras anteriores y no vuelve al esqueleto; el esqueleto solo aparece en la primera carga | Observación de una recarga manual | §9 R-7 |
| **UX-16** | Volver al inicio con el botón «Atrás» no dispara recarga y la hora de la última lectura sigue siendo la real | Recorrido inicio → lista → atrás | §9 R-5 |

---

## 11. Mínimo no negociable

Protocolo §5 regla 2: ante una alternativa por costo técnico, esto es lo que **no** se recorta. Todo lo demás es negociable.

1. **La composición por rol.** Si se recorta y vuelve el gate binario, la fase no resuelve el bloqueante que la originó: nueve de doce roles sin inicio útil. Es el motivo de existir de la fase.
2. **La degradación por bloque.** Un fallo de un contrato no puede volver a borrar la pantalla. Un operador debe poder trabajar con lo que sigue disponible durante una caída parcial.
3. **La honestidad del dato.** Sin fuente, texto sustituto legible — nunca un cero, nunca un porcentaje derivado, nunca una barra de avance sin su total. Incluye la prohibición de mostrar «primera vez» donde el contrato no puede distinguirlo (§6.2).
4. **La accesibilidad de teclado en móvil.** Menú cerrado que no se tabula y entrada al buscador con nombre accesible. Son requisitos de norma, no mejoras.
5. **El contraste verificado en los dos temas y en los seis estados.** Si identidad y accesibilidad chocan, prevalece accesibilidad y se documenta la divergencia.
6. **Al menos una acción operable en el primer viewport de los tres tamaños.** Una pantalla de inicio sin acción es una ficha, no un centro de trabajo.
7. **La reconciliación cifra ↔ destino (§3.3).** Antes que un enlace que miente, ningún enlace.

**Lo que sí se puede recortar, en este orden:** el estado del almacén (bloque de menor urgencia y el que libera una petición) → el plegado de bloques secundarios de la administradora (puede entregarse desplegado) → el momento M2 del onboarding (§7.2) → la hoja de búsqueda móvil, **solo si** se sustituye por otra entrada visible al buscador, nunca dejándolo oculto.

---

## 12. Propuestas para fase posterior, con el dato que faltaría

Ninguna se especifica como entregable de esta fase. Se registran para que la conversación de la fase siguiente empiece con el dato nombrado y no con la idea.

| # | Propuesta | Dato que faltaría y hoy no existe |
| --- | --- | --- |
| P-1 | Medidor de avance de configuración con el degradado azul → lima (§7.3) | `completedSteps` y `totalSteps` en el resumen de la empresa |
| P-2 | Distinguir «primera vez» en campo y en mesa de ayuda (§6.2) | Conteo histórico total de registros en los resúmenes de esos dos módulos |
| P-3 | Historial de cambios legible y enlazado al registro afectado | Nombre de negocio de la entidad y enlace por evento en el historial |
| P-4 | Página de historial completo en el portal, destino del «ver todo» del auditor (§4.9) | La ruta no existe: hoy no hay ninguna pantalla de historial bajo el inicio |
| P-5 | Tablero de despacho con carga por técnico en el propio inicio | La carga por responsable **ya viene calculada**, pero solo con el identificador del usuario: mostrar nombres exige una petición adicional que rompe el presupuesto de §9, y mostrar identificadores incumpliría UX-11 |
| P-6 | Que cada aviso de campo abra directamente su visita | Enlace por evento en el aviso; hoy solo se puede navegar a la agenda del día |
| P-7 | Inicio componible por usuario | Contrato de preferencias de usuario |

---

## 13. Consultas y bloqueos emitidos

```text
[CONSULTA] De: AI-PROD-UX → A: AI-EM-ARCH
Contexto: MOD02 · HLD v2.0 §5.2, nota al pie del técnico de campo · UX spec §4.8
Pregunta concreta: ¿La promesa de §5.2 al técnico de campo («ve su propia agenda por la
  vía que ya usa la pantalla de programación») es una promesa de NAVEGACIÓN desde el
  inicio, o de DATOS renderizados en el inicio? Si es de datos, §4.2 no lista el contrato
  que la alimentaría y §2.2 prohíbe crearlo: sería un cambio de alcance.
Bloqueante: No | Supuesto mientras tanto: es de navegación. §4.8 entrega a ese rol una
  acción primaria única hacia la agenda, sin datos fabricados en el inicio.
```

```text
[CONSULTA] De: AI-PROD-UX → A: AI-EM-ARCH (con AI-FE-PLATFORM en consulta de costo)
Contexto: MOD02 · HLD v2.0 §2.2 (boundary) · UX spec §3.2, §3.5 y §5.3
Pregunta concreta: ¿Entra en el alcance de esta fase enseñar a leer su filtro desde la
  dirección a cuatro pantallas de destino (agenda, bandeja de solicitudes, oportunidades y
  la clave de riesgo de acuerdo de servicio en mesa de ayuda), más la apertura por
  dirección del alta de caso y de oportunidad? Ninguna crea endpoints: los parámetros del
  API ya existen y el patrón ya está implantado en otras cuatro pantallas del portal.
Bloqueante: No | Supuesto mientras tanto: entra. Si no entrara, CA-V2-05 deja de ser
  verificable para cuatro de los siete indicadores y §5.3 aplica su alternativa de un
  paso más.
```

```text
[CONSULTA] De: AI-PROD-UX → A: AI-EM-ARCH
Contexto: MOD02 · HLD v2.0 §6, criterio CA-V2-04 · UX spec §3.1 y §4.7
Pregunta concreta: ¿Se acepta leer «entre 5 y 9 indicadores» como TECHO por rol y no como
  rango obligatorio? Con composición por rol, la contadora tiene un solo indicador con
  fuente real y la vista base no tiene ninguno; rellenar hasta cinco exigiría inventar
  indicadores o mostrar métricas que no sirven a la tarea de esa persona.
Bloqueante: No | Supuesto mientras tanto: es un techo. §10 UX-04 lo redacta así.
```

```text
[CONSULTA] De: AI-PROD-UX → A: AI-EM-ARCH (con AI-FE-PLATFORM en consulta de medición)
Contexto: MOD02 · HLD v2.0 §7, RNF-V2-01 · UX spec §9
Pregunta concreta: ¿El denominador de «≤ 6 peticiones por carga del home» incluye las
  peticiones propias del envoltorio de la aplicación (sesión, perfil, empresa, campana de
  historial)? Si las incluye, el requisito ya se incumple antes de esta fase; si no las
  incluye, conviene decirlo en el propio requisito para que sea verificable.
Bloqueante: No | Supuesto mientras tanto: el denominador es solo el inicio. Las reglas
  R-8 y R-9 de §9 reducen la cuenta en ambos escenarios.
```

No se emite ningún `[BLOQUEO]`: nada de lo pendiente impide congelar esta spec ni arrancar los tracks de interfaz y de calidad contra ella.

---

## 14. Congelación

Esta spec queda **congelada** en la versión 1.0 y es citable por ruta y versión en el prompt de ejecución de la fase (protocolo §3bis). Cambios posteriores de flujo se versionan como `v1.1+`, marcan la versión anterior como superada en el mismo acto y se notifican a AI-FE-PLATFORM y AI-SR-QA vía AI-EM-ARCH. **No se parchean en silencio.**

Contrato hermano, fuera de este documento y congelado el mismo día: [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) v1.0 de AI-DS-OWNER — tokens, API de la tarjeta de indicador y matriz de estados requeridos. Verificado el 2026-08-04: las tres piezas que esta spec le pide (ranura de cifra con texto sustituto en lugar de cero, distintivo tonal de severidad, y estado de error por tarjeta con reintento) están contratadas allí, y ninguna decisión de este documento contradice a aquel.

**Nota de gate 11 — resuelta el 2026-08-04.** Esta spec nunca tuvo hallazgos. Los 15 bloqueantes que reportó al congelarse eran del contrato hermano, por citar ADR-075 sin marcador; AI-EM-ARCH los cerró el mismo día y el ADR pasó después a **Aprobado**, con lo que el marcador dejó de ser necesario. `pnpm audit:adr-citations` está hoy en `BLOQUEANTE: 0`. Se conserva el registro porque el aviso hizo su trabajo: un track detectó un defecto de gate en el artefacto de otro y lo trasladó en lugar de ignorarlo.
