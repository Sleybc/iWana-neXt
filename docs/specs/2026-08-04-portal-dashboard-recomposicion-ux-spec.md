# UX spec — Recomposición del inicio del portal empresarial (`apps/portal` → `/dashboard`)

**Versión:** 1.0 + adendas delta UX v1.2 + adendas remediación UI R-A…R-D (2026-08-11) + adenda densidad U-D (2026-08-12) + adenda remediación P1/P2 U-R2bis / U-NAV (2026-08-12) + adenda densidad UI U-D2 (2026-08-12) + adenda densidad UI U-D3 (2026-08-12) + adenda densidad UI U-D4 (2026-08-13) + adenda densidad UI U-D5 (2026-08-13) + adenda U-B0 franja fuera del título (2026-08-13) + **adenda U-B0bis sin franja de acciones (2026-08-13)**  
**Estado:** Congelado — desbloqueante para AI-FE-PLATFORM y AI-SR-QA (protocolo §3bis, track UX) · adendas delta autorizadas en [`PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md) v1.2 · adendas de remediación autorizadas en [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md) v1.0 · adenda P1/P2 autorizada en [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md) v1.0 · adenda densidad real U-D2 autorizada en [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md) v1.1 · adenda U-D3 autorizada en [`PROMPT-MOD02-DASHBOARD-PORTAL-AUDITORIA-DISENO-v1.2.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-AUDITORIA-DISENO-v1.2.md) y ejecución FE en [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md) · adenda U-D4 (antiespacios adaptativo) autorizada en sesión del responsable 2026-08-13, rastro en [`INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.0.md) · adenda U-D5 (grilla B1 unificada 4 por fila) autorizada en sesión del responsable 2026-08-13, rastro en [`INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.1.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.1.md) · **adenda U-B0 autorizada en sesión del responsable 2026-08-13 (opción 1: título limpio + toolbar debajo)**  
**Fecha:** 2026-08-04 (congelación) · adendas delta y remediación UI 2026-08-11 · adenda densidad U-D, remediación P1/P2, U-D2 y U-D3 2026-08-12 · U-D4, U-D5, U-B0 y **U-B0bis** 2026-08-13  
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
| **B0 · Encabezado** | Título + hora de última lectura. El H1 no contiene controles. **Sin** franja de acciones de página (U-B0bis) | 12 col | Alto — ancla de identidad, no de alta | Siempre |
| **B1 · Indicadores núcleo** | De 3 a 7 indicadores del rol (§3), en tarjetas iguales | 12 col, 4 por fila | **Dominante** — es la superficie que responde «¿qué requiere mi atención?» | Si el rol tiene al menos un indicador autorizado |
| **B2 · Trabajo de hoy** | La lista accionable del rol: atención de campo, atención comercial o casos (§4) | 8 col | Alto — es donde se pasa de la cifra al elemento concreto | Si el rol tiene al menos un bloque de lista autorizado |
| **B2b · Apoyo** | Próximo paso de configuración (§7) · Historial de cambios · Accesos rápidos | 4 col, junto a B2 | Medio | Cada pieza según §4 |
| **B3 · Estado de la empresa** | Ficha del tenant: nombre, estado del servicio, zona horaria, moneda, sedes | 12 col | **Subordinado** — cierra la página, no la abre | Siempre (es el único bloque común a los 12 roles) |

**Punto de corte.** El «primer viewport» de esta spec se define, sin ambigüedad, como **lo visible sin desplazamiento vertical** en los tres tamaños de §8. En los tres debe caber, completa: B0 (identidad) y **al menos dos indicadores de B1** (si el rol tiene indicadores). B3 nunca cae dentro del primer viewport en ningún tamaño — si cayera, la jerarquía volvería a invertirse.

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

> **U-B0bis (2026-08-13).** Esta franja **deja de pintarse** en el Inicio. B0 = identidad (H1 + subtítulo). Las altas viven en los módulos, en los indicadores y en Accesos rápidos. El registro por rol (§5.2) permanece como contrato de composición (p. ej. `primaryActionId` para el modo contable), no como chrome. Ver adenda U-B0bis. U-B0 queda **superada**.

> **U-B0 (2026-08-13, superada).** La franja **no** vivía en el slot `actions` del `PageHeader`. B0a = identidad. B0b = toolbar debajo. Conservado solo como historia.

### 5.1 Criterio de selección

Una acción **no** entra en el encabezado del Inicio. El criterio histórico (iniciar trabajo, frecuente, destino existente) sigue describiendo **qué altas importan al rol**, pero su superficie es el módulo correspondiente, un KPI o Accesos rápidos. **Prohibido** colocar esas acciones dentro del H1, del bloque de título o de un toolbar de página bajo el H1.

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
| **UX-03** | Sin desplazamiento vertical, a 375, 768 y 1280 px, se ven el encabezado (H1 + última lectura) y al menos dos indicadores (o, si el rol no tiene indicadores, Accesos rápidos u otra banda autorizada). **Sin** CTA de página en B0 (U-B0bis) | Captura a los tres tamaños | CA-V2-03 |
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

**Adendas 2026-08-11 (delta UX v1.2).** Ver «Adendas delta UX»: B1 por dominio (U-1), Ver más inteligente (U-2) y mapa deep links historial (U-3). Congeladas en el mismo acto que el prompt v1.2; FE/QA citan spec + adendas.

**Adendas remediación UI 2026-08-11 (R-A…R-D).** Ver la sección final «Adendas remediación UI — 2026-08-11». Versionan honestidad de hora (R-A), anuncio/foco de error de B1 (R-B), aterrizaje desde I-6 (R-C), primer viewport a 1280 px (R-D) y la matriz de acciones de B0. No reabren I-1…I-7 ni el contrato DS. FE/QA citan spec + estas adendas; el prompt de remediación ya las publicó para no bloquear implementación.

**Adenda densidad UI 2026-08-12 (U-D).** Ver «Adenda densidad UI — 2026-08-12 (U-D)». Versiona R-D (métrica compacta sin hueco de sparkline). Contrato DS hermano: **v1.4**. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md). **Vigente** como base; la anatomía de KPI del home se versiona de nuevo en U-D2 (fila horizontal).

**Adenda remediación P1/P2 2026-08-12 (U-R2bis / U-NAV).** Ver «Adenda remediación P1/P2 — 2026-08-12 (U-R2bis / U-NAV)». Versiona la matriz B0 desde `md`, labels del menú y de la búsqueda global, onboarding con conteos `unknown`, línea del historial y estados de B3. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md).

**Adenda densidad UI U-D2 — 2026-08-12.** Ver «Adenda densidad UI U-D2 — 2026-08-12» al final de este documento. **No borra U-D.** Versiona la anatomía del KPI del home: **fila horizontal** (no póster `flex-col`). Contrato DS hermano: **v1.6**. Prompt de ejecución: [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md). Criterios UX-D2-01…08. Tracks notificados: AI-FE-PLATFORM · AI-SR-QA · AI-DS-OWNER.

---

## Adendas delta UX — 2026-08-11 (prompt v1.2)

Autoriza AI-EM-ARCH en [`PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md) v1.2. Contrato DS hermano: v1.3 (`eyebrow` opcional + receta de grupo). Skills: `system-vocabulary-review` · `iwana-identity-ui-review` (modo diseño, solo spec). Tracks notificados: AI-FE-PLATFORM · AI-SR-QA · AI-DS-OWNER · AI-SR-FULL · AI-SEC-ENG (pista E, sin cambio de composición aquí).

Estas adendas **versionan** el flujo de B1, el pliegue «Ver más» y los deep links del historial. El resto de la spec v1.0 permanece vigente. No se inventan pantallas, endpoints ni tokens.

---

### Adenda B1 — agrupación por dominio (U-1)

**Qué cambia:** solo la composición visual de la banda **B1**. Sustituye, cuando aplique, la lectura de «retícula plana de N cards iguales» / «4 por fila» de §2.2, §3 y §4.3 (ADMIN) y el layout de §8 para indicadores: la lectura principal pasa a **bandas de dominio**, no a siete tarjetas gemelas con eyebrow repetido.

**Qué no cambia:** inventario y semántica de I-1…I-7 (§3.2), destinos/filtros, B0/B2/B2b/B3 (salvo Adenda «Ver más inteligente»), estados §6, accesos §4.14, techos de autorización, cota máxima de 7 indicadores.

#### Dominios canónicos — membresía I-1…I-7 (cerrada)

Orden de **membresía** (cerrada; no se reasignan IDs). El orden de **pintado de grupos** sigue la primera aparición de sus miembros en `metricIds` del rol (así SUPPORT mantiene casos antes que campo, §4.5); dentro de cada grupo, el orden de métricas es el de `metricIds`.

| # | Dominio (rótulo de encabezado, una sola vez) | Indicadores | Etiquetas visibles (§3.2) |
| --- | --- | --- | --- |
| — | Operaciones de campo | I-1, I-2 | Visitas de hoy · Solicitudes por programar |
| — | Mesa de ayuda | I-3, I-4 | Casos abiertos · Casos en riesgo de incumplir |
| — | Comercial | I-5, I-6 | Planes sin precio vigente · Ofertas en riesgo |
| — | Oportunidades | I-7 | Oportunidades en seguimiento |

Si el rol no impone otro orden (p. ej. ADMIN con I-1…I-7 secuencial), el pintado coincide con: campo → mesa → comercial → oportunidades.

#### Reglas de composición

1. **Grupo =** encabezado de dominio (vocabulario de la tabla) + grid interno de métricas del grupo.
2. **Grid del grupo:** 1 columna si hay un solo hijo; `sm:grid-cols-2` si hay dos. No forzar huecos vacíos a 4 columnas.
3. **Eyebrow de categoría omitido** en cada métrica hija (ranura `eyebrow` vacía / no renderizada — DS v1.3). El dominio vive solo en el encabezado del grupo.
4. Siguen existiendo **hasta 7 indicadores** como cifras/acciones/destinos independientes; **prohibido** fusionar dos cifras en un solo valor o eliminar IDs.
5. Roles con un solo indicador (p. ej. contadora → I-5): **un grupo de un miembro** (encabezado «Comercial» + una métrica), o card suelta equivalente — sin inventar hermanos.
6. Roles sin indicadores: B1 ausente (sin cambio).
7. **Prohibido** rellenar huecos con KPI vacío o decorativo.
8. Iconos **distintos** dentro del mismo grupo (I-3 ≠ I-4, I-5 ≠ I-6); la elección de icono es de FE contra el catálogo Lucide ya usado, no de esta spec.
9. **Skeleton B1:** respeta la forma de grupos del rol (p. ej. ADMIN → hasta 4 encabezados de dominio), no siete bloques sueltos.

#### Ejemplos por rol (lectura esperada)

| Rol | Grupos visibles | Lectura |
| --- | --- | --- |
| Administradora | 4 (campo, mesa, comercial, oportunidades) | Hasta cuatro bandas de dominio; 7 métricas hijas sin eyebrow de categoría |
| Monitoreo operativo | 2 (campo, mesa) | I-1…I-4 |
| Soporte inicial | 2 (mesa, campo) — grupos ordenados por primera aparición en `metricIds` (§4.5) | I-3, I-4, I-1, I-2 |
| Ejecutivo comercial | 2 (comercial, oportunidades) | I-5…I-7 |
| Contadora | 1 (comercial) | Solo I-5 |

> **Nota SUPPORT:** §4.5 exige casos antes que campo. FE construye la lista de grupos recorriendo `metricIds` y abriendo un grupo la primera vez que aparece un miembro; no reordenar a la secuencia canónica campo→mesa.

**Criterio de aceptación (delta):** CA-DELTA-06 — ADMIN expone hasta 4 encabezados de dominio; 0 eyebrows de categoría duplicados en métricas hijas; I-1…I-7 siguen navegables.

---

### Adenda «Ver más inteligente» (U-2)

**Cierra:** D-P1-05 · D-QW-04 · CA-DELTA-08 · CA-DELTA-12.

**Problema:** el pliegue estático de §4.3 (ADMIN) puede ocultar trabajo real cuando el KPI asociado ya es > 0.

**Alcance:** solo bloques que estén en `foldedBlockIds` de la composición del rol. No cambia qué bloques están autorizados ni el máximo de un dominante (§2.3 regla 4).

#### Asociación bloque ↔ KPI de B1

| Bloque (`DashboardBlockId`) | KPI asociado | Condición para salir del pliegue |
| --- | --- | --- |
| `commercial-attention` | I-5 **o** I-6 | Al menos uno de los dos con valor numérico **> 0** |
| `help-desk` | I-3 **o** I-4 | Al menos uno de los dos con valor numérico **> 0** |
| `inventory` (Estado del almacén) | — | **Nunca** por KPI de B1 (no hay indicador de almacén en I-1…I-7). Sigue plegable |
| `field-attention` | I-1 / I-2 | No aplica en ADMIN (es el dominante, no está plegado) |

Si el KPI está en estado error / dato no disponible, **no** se promociona (solo cuenta un número > 0 leído con éxito).

#### Reglas de promoción

1. Partir del conjunto `foldedBlockIds` del rol.
2. Para cada bloque de la tabla anterior que esté plegado **y** cumpla la condición → **sacarlo del pliegue efectivo** y mostrarlo visible sin clic.
3. **Ubicación del promovido:** debajo del bloque dominante (columna B2), **antes** del control «Ver más», en este orden fijo si hay varios: `commercial-attention` → `help-desk`. En viewport de una columna, el mismo orden apilado. No competir como segundo dominante: siguen siendo listas de apoyo promovidas por señal de KPI.
4. El pliegue efectivo (`foldedRest`) = plegados originales menos los promovidos.
5. Si `foldedRest` queda vacío → **no se muestra** el control «Ver más».
6. Inventario y cualquier otro bloque sin regla de KPI permanecen en `foldedRest` si estaban plegados.

#### Copy del control (vocabulario de producto)

| Estado | Texto visible exacto | Notas |
| --- | --- | --- |
| Colapsado, N ≥ 2 | `Ver más · N bloques` | N = tamaño de `foldedRest` (solo lo que sigue oculto) |
| Colapsado, N = 1 | `Ver más · 1 bloque` | Singular |
| Expandido | `Ocultar bloques adicionales` | Sin cambio de sentido respecto al copy actual |
| N = 0 | — | Control ausente |

- Sentence case. Sin jerga (`folded`, IDs técnicos) en UI.
- Nombre accesible del botón puede repetir el texto visible; `aria-expanded` refleja abierto/cerrado.
- El conteo **no** incluye bloques ya promovidos por KPI.

**Ejemplo ADMIN:** I-5 = 3, I-3 = 0, I-4 = 0 → `commercial-attention` visible bajo campo; pliegue efectivo = `help-desk` + `inventory` → control `Ver más · 2 bloques`.

---

### Adenda deep links del historial — mapa `entityType` → ruta (U-3)

**Cierra:** D-QW-07 · CA-DELTA-13. Aplica al bloque **Historial de cambios** (`RecentActivityPanel` / fuente `audit`). No abre alcance de P-4 (página de historial completo).

**Regla de oro:** solo se enlaza si existe página bajo `apps/portal/src/app/dashboard/`. **Prohibido** inventar pantallas o rutas. Si no hay destino seguro → fila **sin enlace** (texto plano). Sin 404.

#### Cómo leer la tabla

| Columna | Significado |
| --- | --- |
| `entityType` (audit) | Valor crudo (y alias frecuentes) tal como llega en el historial |
| Ruta portal | Plantilla bajo `/dashboard/…` |
| Clase | `detalle` = interpola `entityId` · `lista` = existe listado pero **no** hay `/…/:id` → **no** deep-link de registro · `sin ruta` = no enlazar |
| FE | Solo clase `detalle` + `entityId` no vacío → `<Link>`. Clase `lista` o `sin ruta` → fila sin enlace (la lista no es el registro) |

#### Mapa mínimo (inventario verificado 2026-08-11)

Rutas de detalle existentes hoy: `crm/expedientes/[id]`, `crm/subscribers/[id]`. El resto son listados o settings sin ficha por id.

| `entityType` (audit) | Ruta portal | Clase |
| --- | --- | --- |
| `User`, `user` | `/dashboard/users` | **lista** — no existe `/dashboard/users/:id` → sin deep-link de registro |
| `Expediente`, `ExpedienteRecord` | `/dashboard/crm/expedientes/:id` | **detalle** |
| `Subscriber` | `/dashboard/crm/subscribers/:id` | **detalle** |
| `PotentialLead` | `/dashboard/leads` | **lista** |
| `AccessProfile`, `access_profile` | `/dashboard/settings/access` | **lista** |
| `TenantSettings`, `tenant_settings`, `Settings` | `/dashboard/settings` | **lista** |
| `organization_site`, `organization_site_business_hours`, `organization_company_business_hours`, `organization_business_hours_exception`, `organization_site_assignments`, `organization_site_responsibilities` | `/dashboard/settings/organization` | **lista** |
| `InventoryItem`, `inventory_item` | `/dashboard/inventory` | **lista** |
| `AssuranceTicket`, `Ticket` | `/dashboard/assurance` | **lista** |
| `CommercialPlan`, `Plan`, `bundle`, `product`, `promotion`, `service` *(si aparecen en audit)* | `/dashboard/commercial` | **lista** |
| `Visit`, `WorkOrder`, `ScheduleEvent`, `Wfm` | `/dashboard/scheduling` o agenda | **lista** — sin ficha `/…/:id` |
| `Tenant`, `tenant`, `TenantProfile`, `TenantBranding` | — | **sin ruta** de ficha operativa en historial (B3 / settings no son deep-link del evento) |
| `Session`, `AuditLog`, `Role`, `ConsentRecord`, `ProspectCase`, `SubscriberList`, `PlatformUser`, `user_access_profiles`, `access_profile_permissions`, `UserProfile`, `UserPasswordReset`, `UserLoginEmail`, `UserLoginEmailAdmin` | — | **sin ruta** |
| Cualquier otro no listado | — | **sin ruta** (default seguro) |

> **Nota de vocablo:** en UI el tipo sigue traduciéndose con `auditEntityTypeLabel` (p. ej. `Expediente` → «oportunidad»). El mapa de rutas usa el valor crudo del API, no la etiqueta.

#### Criterios FE / QA

1. Con `entityType` ∈ {`Expediente`, `ExpedienteRecord`} y `entityId` → href `/dashboard/crm/expedientes/{entityId}`.
2. Con `entityType` = `Subscriber` y `entityId` → href `/dashboard/crm/subscribers/{entityId}`.
3. `User` / `user`: **sin enlace** en esta fase (solo lista existe; no fingir detalle).
4. Resto: sin enlace.
5. No añadir CTA «ver todo» (P-4 / §4.9).

**Deuda explícita (fuera de este delta):** deep-link de usuario cuando exista `/dashboard/users/:id`; deep-links de inventario, casos y visitas cuando existan fichas. Registrar en informe vivo si se prioriza después — no ampliar U-3 en silencio.

---

## Adendas remediación UI — 2026-08-11

Autoriza AI-EM-ARCH en [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md) v1.0. Cierra los huecos de implementación del review UI §11 (R-P1-01, R-P1-02, R-P2-01, R-P2-03) y fija el desempate de viewport 1280. Contrato DS hermano: **v1.3 — Congelado**, sin bump. Skills: `system-vocabulary-review` · `iwana-identity-ui-review` (modo diseño, solo spec). Tracks notificados: AI-FE-PLATFORM · AI-SR-QA · AI-DS-OWNER.

Estas adendas **versionan** la honestidad de la hora de B0, el anuncio/foco del error de B1, el aterrizaje desde I-6, el primer viewport a 1280 px y la matriz de acciones de B0. El resto de la spec v1.0 y de las adendas delta v1.2 permanece vigente. No se inventan indicadores, endpoints, tokens ni primitives. No se reabren I-1…I-7.

**Modo identidad:** refinamiento de flujo y copy sobre la composición ya congelada. No es un rediseño. El lima no entra en avisos de dato incompleto, error ni riesgo.

**Stop comprobado:** ninguna de estas adendas exige un campo ausente en HLD §4.2. La hora por fuente y la hora global son estado de lectura del cliente sobre los contratos ya autorizados. Sin `[BLOQUEO]`.

---

### Adenda R-A — Honestidad de «Última lectura» (R-P1-01)

Aclara R-3 / R-6 / R-7 de §9; **no** las sustituye.

1. Cada fuente conserva la marca de su **última lectura exitosa**.
2. La hora global de B0 **solo avanza** cuando **todas** las fuentes pedidas en esa oleada terminan en éxito.
3. Si al menos una fuente falla y otra conserva dato previo: B0 **no** publica una hora nueva; junto a la hora se muestra el aviso recuperable de dato desactualizado (copy de abajo). La cifra antigua sigue visible.
4. Una métrica en `error + data` **debe** mostrar el estado de error/reintento aunque conserve valor. Ocultar el error porque hay cifra previa miente sobre la frescura.
5. Un reintento de un solo bloque (R-6) no avanza la hora global salvo que esa oleada cubra todas las fuentes del rol y todas tengan éxito.

**Aviso junto a «Última lectura» — texto visible exacto:**

```text
Algunos datos no se actualizaron. Revisa los avisos.
```

Reglas de composición del aviso:

- Vive **junto a** la hora de B0 (`Última lectura: …`), no como un `PortalAlert` de página. No abre región viva propia: el anuncio para tecnologías de asistencia lo hace el grupo o el bloque que falló (R-B y §6.4).
- Sentence case. Sin jerga (`fuente`, `oleada`, `contrato`, nombre de módulo interno).
- Desaparece solo cuando una oleada posterior termina con **todas** las fuentes en éxito y B0 publica una hora nueva.
- Tono de advertencia del sistema, **nunca lima**.

---

### Adenda R-B — Anuncio y foco del error de B1 (R-P1-02)

Materializa §6.4 y la nota (a) del contrato DS §2.1. **No** abre `aria-live` en cada tarjeta.

1. Cada **grupo de dominio B1** que tenga al menos una métrica en error monta un `PortalAlert variant='error' live='polite'` **del grupo**, además del estado visual/reintento por tarjeta.
2. El encabezado del grupo es destino de foco estable: `tabIndex={-1}` + `ref`.
3. Tras un reintento con éxito, si el botón «Reintentar» desaparece, el foco pasa a ese encabezado.
4. Un segundo fallo se anuncia en la misma región viva del grupo (mismo `PortalAlert`; no se apila un segundo aviso).
5. El grupo no se desmonta ni se colapsa.

**Copy exacto del `PortalAlert` de grupo**

El `{rótulo}` es el encabezado de dominio de la adenda B1, sin cambiar una letra: `Operaciones de campo` · `Mesa de ayuda` · `Comercial` · `Oportunidades`.

| Ranura | Texto exacto |
| --- | --- |
| Título | `No pudimos actualizar las cifras de {rótulo en minúsculas}` |
| Cuerpo | `Las cifras anteriores siguen visibles. Reintenta en cada tarjeta con aviso.` |

Títulos resultantes (cerrados; no se improvisan):

| Grupo | Título visible exacto |
| --- | --- |
| Operaciones de campo | `No pudimos actualizar las cifras de operaciones de campo` |
| Mesa de ayuda | `No pudimos actualizar las cifras de mesa de ayuda` |
| Comercial | `No pudimos actualizar las cifras de comercial` |
| Oportunidades | `No pudimos actualizar las cifras de oportunidades` |

Un grupo, un aviso: si fallan I-5 e I-6 a la vez, el grupo Comercial monta **un** `PortalAlert`, no dos. Las tarjetas siguen mostrando su propio error/reintento.

---

### Adenda R-C — «Ofertas en riesgo» → bloque comercial (R-P2-03)

Aclara la excepción de I-6 (§3.4). No inventa toast ni destino nuevo.

1. El clic en I-6 sigue abriendo el pliegue y marcando el bloque comercial (`commercial-attention`).
2. Tras revelar, el foco va al encabezado del bloque (destino estable `tabIndex={-1}`). El encabezado visible sigue siendo **Atención comercial**.
3. El bloque anunciado usa región viva educada (`aria-live='polite'` o `PortalAlert` / `role='status'` ya existente). No se inventa un toast.
4. Si hace falta desplazamiento, `scrollIntoView` solo cuando **no** hay `prefers-reduced-motion`; con la preferencia activa, solo se mueve el foco.

**Anuncio al revelar el bloque — texto exacto:**

```text
Atención comercial. Revisa las ofertas en riesgo.
```

Se emite una sola vez por clic en I-6, también si el bloque ya estaba visible por la promoción de «Ver más inteligente». Sin identificadores técnicos en el anuncio.

---

### Adenda R-D — Viewport 1280 (desempate)

Texto normativo del desempate de AI-EM-ARCH (prompt remediación §2). **Deroga** el tramo «banda completa de indicadores + inicio de B2» de §8 **solo a 1280 px y solo para roles con ≥ 2 grupos de dominio**.

| Qué | Decisión |
| --- | --- |
| Suelo de §2.2 | **Intacto** en los tres tamaños: B0 con al menos una acción operable + **al menos dos indicadores** (o la excepción ya escrita de UX-03 si el rol no tiene indicadores) |
| Primer viewport a 1280 px, rol con ≥ 2 grupos | B0 + **los dos primeros grupos de dominio completos** (orden de pintado de la adenda B1). B2 **puede** quedar bajo el pliegue |
| Primer viewport a 1280 px, rol con 0 o 1 grupo | La derogación **no aplica**. Sigue §8 + UX-03 |
| Prohibido | Comprimir tarjetas · eliminar I-1…I-7 · volver a la retícula plana · forzar B2 en el primer viewport a 1280 |

QA **no** falla el criterio de primer viewport si B2 queda bajo el pliegue a 1280 px, siempre que B0 y los dos primeros grupos de dominio estén completos.

Ejemplo ADMIN (cuatro grupos, orden campo → mesa → comercial → oportunidades): a 1280 el primer viewport muestra B0 + Operaciones de campo + Mesa de ayuda. Comercial, Oportunidades y B2 pueden quedar bajo el pliegue.

---

### Matriz B0 de acciones (U-R2) — deroga la fila «Acciones de B0» de §8

«Actualizar» (R-3) es siempre operable, pero **no** cuenta como acción primaria de §5.2. La primaria y la secundaria siguen siendo las de §5.2.

| Viewport | Controles visibles | Menú de desbordamiento |
| --- | --- | --- |
| **375 px** | **1:** la acción primaria | Sí. Nombre accesible exacto: `Más acciones del inicio`. Dentro, en este orden: `Actualizar` y, si existe, la secundaria |
| **768 px** | **2:** primaria + `Actualizar` | **No.** La secundaria no se ofrece en este tamaño |
| **1280 px** | **2:** primaria + `Actualizar` | Sí, **solo si** hay secundaria u otra acción de desbordamiento. Dentro: la secundaria y el resto. Nombre accesible: `Más acciones del inicio` |

Si el menú quedaría vacío, **no se renderiza**. El patrón de teclado del menú es el de `DropdownMenu` ya existente (Escape, flechas, clic exterior, foco inicial y retorno al disparador). Esta spec no redefine ese contrato.

> **U-R2bis (2026-08-12).** La fila **768 px** («2 visibles, menú No, secundaria no se ofrece») queda **superada**. Desde `md` (768 px) aplica el patrón 1280. Ver adenda remediación P1/P2 al final de este documento.

---

### R-8 vigente (U-R3)

**R-8 de §9 no se reabre ni se relaja.** El historial de cambios del inicio y la campana de notificaciones consumen **una sola lectura** compartida. Sin identificadores en la interfaz salvo necesidad operativa explícita. Mismo vocabulario de acción y entidad en ambas superficies (helper canónico; sin fallback de enumeración cruda en la campana). Esta remediación no añade sondeo ni duplica la petición del inicio: R-2 sigue — el home no se auto-refresca.

---

### Criterios de experiencia añadidos (trazables a CA-REM-*)

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-REM-01** | Con una fuente en error y otra en éxito, B0 no muestra una hora más reciente que la última oleada completa y muestra el aviso de R-A | Lectura de B0 |
| **UX-REM-02** | La métrica con dato previo y fuente en error muestra error y «Reintentar» | Recorrido de la tarjeta |
| **UX-REM-03** | Un grupo B1 en error anuncia **una** vez con el título/cuerpo de R-B | Un `PortalAlert` por grupo afectado |
| **UX-REM-04** | Tras reintento exitoso, el foco está en el encabezado del grupo | Teclado / foco |
| **UX-REM-05** | Acciones de B0: 375 → 1 + menú; **desde md (768) y 1280** → primaria + Actualizar visibles + menú si hay secundaria (U-R2bis; 768 = patrón 1280) | Viewport |
| **UX-REM-06** | Clic en «Ofertas en riesgo» mueve el foco a Atención comercial, emite el anuncio de R-C y no anima el desplazamiento si hay `prefers-reduced-motion` | Teclado + preferencia de movimiento |
| **UX-REM-07** | Campana e historial del inicio muestran el mismo hecho con el mismo vocabulario; sin identificador visible | Comparación de ambas superficies |

---

## Adenda densidad UI — 2026-08-12 (U-D)

**Autoriza** AI-EM-ARCH en sesión 2026-08-12 (evidencia viva `/dashboard` ADMIN + [informe v1.1 §8](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md)). **Versiona** R-D en un punto: se permite métrica compacta. **No** se eliminan I-1…I-7, **no** se vuelve a la retícula plana de 4 por fila, **no** se fuerza B2 en el primer viewport a 1280.

Contrato hermano: [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) **v1.4**.

Postura: iWana es *visualmente sobrio, interactivamente denso*. El hueco de sparkline de Firma §2.1 no se reserva hasta que exista gráfica.

| Pieza | Decisión |
| --- | --- |
| **B1 · cáscara** | `PortalDashboardMetric` compacta: cifra + rótulo + delta + descripción, sin hueco vacío. Alto mínimo ~96 px (`min-h-24`). Target táctil ≥ 44 px se cumple con la card entera. |
| **B1 · tinte** | `warning` / `danger` **solo** si `value > 0` o hay `delta`. Si no, `neutral` (I-1/I-3/I-7 conservan `primary` cuando aplica). Cero no es urgencia. |
| **B1 · un hijo** | El grupo de un solo indicador (p. ej. I-7) **no** estira a 12 columnas: `max-w` de una columna de la retícula de 2. Prohibido rellenar con KPI fantasma. |
| **B2 · retícula** | `items-start`: la columna 8 no se estira a la altura de la 4. |
| **Vacíos** | Un solo shell. `PortalEmptyState` embebido en `PortalPanel` **sin** pozo interior (borde + `iwana-surface-soft` duplicados). |
| **Accesos rápidos** | Meta en una línea (`line-clamp-1`). Sin segunda cáscara. |
| **B3** | Lista compacta (`max-w-4xl`). Zona horaria y país en lenguaje de producto (`Hora de Bogotá`, `Colombia`), no IANA/ISO crudos. |
| **Pliegue** | Copy: N=1 → `Ver más · 1 resumen`; N≥2 → `Ver más · N resúmenes`; expandido → `Ocultar resúmenes adicionales`. |
| **Onboarding** | N=1 restante → `Ver el pendiente restante`; N≥2 → `Ver los N pendientes restantes`. |

**Criterios**

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-DEN-01** | Con valor 0 y sin delta, I-2/I-4/I-5/I-6 no pintan cáscara ámbar/rosa | Inicio ADMIN vacío |
| **UX-DEN-02** | I-7 no ocupa el ancho completo del lienzo | Grupo Oportunidades |
| **UX-DEN-03** | La columna de B2 no deja un hueco estirado bajo «Ver más» | Viewport 1280 con B2b alto |
| **UX-DEN-04** | El vacío de campo no anida un segundo recuadro bordeado | Atención de campo en cero |
| **UX-DEN-05** | B3 no muestra `America/Bogota` ni `CO` como texto visible | Ficha de empresa |

---

## Adenda remediación P1/P2 — 2026-08-12 (U-R2bis / U-NAV)

**Autoriza** AI-EM-ARCH en [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md) v1.0. Decisiones copiadas de [informe v1.1](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md) §4 (mapa de copy) y §7 (desempate B0). Skills: `system-vocabulary-review` · `iwana-identity-ui-review` (modo diseño, solo spec). Tracks notificados: AI-FE-PLATFORM · AI-SR-QA · AI-DS-OWNER.

Estas adendas **versionan** la matriz B0 desde `md`, los labels del menú lateral y de la búsqueda global, el onboarding con conteos no leídos, la línea del historial y los estados de B3. El resto de la spec v1.0, las adendas delta v1.2, las adendas remediación UI R-A…R-D y la **adenda densidad U-D permanecen vigentes**. No se inventan indicadores, endpoints, tokens ni primitives. No se reabre el tinte activo del sidebar. No se toca U-D.

**Modo identidad:** refinamiento de flujo y copy sobre la composición ya congelada. No es un rediseño. El lima no entra en avisos de dato incompleto, error ni riesgo.

**Stop comprobado:** ninguna de estas adendas exige un campo ausente en HLD §4.2. Sin `[BLOQUEO]`.

---

### Adenda U-R2bis — Matriz B0 desde `md` (desempate informe v1.1 §7)

**Versiona** la matriz B0 de U-R2. **Deroga** la fila **768 px** de U-R2 («2 visibles, menú No, la secundaria no se ofrece en este tamaño»). Justificación del desempate: «Programar visita» es una de las dos altas del ciclo ISP (§5.2); no se sacrifica en el viewport de tablet. No es bug de FE contra la spec anterior.

«Actualizar» (R-3) sigue siendo siempre operable y **no** cuenta como acción primaria de §5.2. La primaria y la secundaria siguen siendo las de §5.2.

| Viewport | Controles visibles | Menú de desbordamiento |
| --- | --- | --- |
| **375 px** | **1:** la acción primaria | Sí. Nombre accesible exacto: `Más acciones del inicio`. Dentro, en este orden: `Actualizar` y, si existe, la secundaria |
| **Desde md (768 px) y 1280 px** | **2:** primaria + `Actualizar` | Sí, **solo si** hay secundaria u otra acción de desbordamiento. Dentro: la secundaria y el resto. Nombre accesible: `Más acciones del inicio` |

La secundaria **ya no se oculta en tablet**. 768 = patrón 1280.

Si el menú quedaría vacío, **no se renderiza**. El patrón de teclado del menú es el de `DropdownMenu` ya existente (Escape, flechas, clic exterior, foco inicial y retorno al disparador). Esta spec no redefine ese contrato.

**UX-REM-05 actualizado:** 375 → 1 + menú; desde md (768) y 1280 → primaria + Actualizar visibles + menú si hay secundaria.

---

### Adenda U-NAV — Labels del menú lateral y de la búsqueda global

**Fuente única:** las etiquetas visibles de accesos rápidos §4.14. El menú lateral y los atajos de la búsqueda global usan **las mismas** etiquetas. El `href` no cambia.

| Antes | Después | Destino |
| --- | --- | --- |
| CRM | Oportunidades | Mismo href: `/dashboard/crm/expedientes` |
| Programacion | Programación | Sin cambio de ruta |
| Usuarios | Usuarios y accesos | Sin cambio de ruta |
| Reportes + badge «Siguiente fase» | **Retirar** el ítem | No hay destino; §4.14 ya eliminó la fila |

**Rótulos de grupo** del menú (sentence case, no mayúsculas sostenidas):

| Antes (típico) | Después |
| --- | --- |
| MENÚ / Menu | Menú |
| ADMINISTRACIÓN / Administracion | Administración |

**Fuera de esta adenda:** las páginas internas de oportunidades pueden seguir diciendo «CRM» en copy de dominio operativo (expedientes, modo asistido). U-NAV unifica **solo** menú lateral y búsqueda global con el inicio.

---

### Onboarding — `unknown` no es «al día»

Aclara §7.2. M2 y M3 exigen conteos de universo **leídos**.

1. Con `operationState === 'unknown'` **no** se afirma «Configuración al día» ni ningún equivalente de «al día» / M3.
2. En ese estado: **esqueleto** con forma del bloque, o **no renderizar**. Nunca copy de completitud.
3. «Al día» (y el momento M3: el bloque desaparece) **solo** con conteos leídos **y** sin pendientes de configuración (`tenant.alerts[]` vacío).
4. Si los conteos están leídos y en cero, aplica M2 de §7.2 («Empieza tu operación»), no «al día».

---

### Historial — misma línea que la campana

Aclara R-8 / U-R3. Campana e historial del inicio usan el mismo resumen: `auditFeedSummary` con el patrón **`acción · entidad`**.

| Caso | Texto visible |
| --- | --- |
| Hecho con entidad de negocio conocida | `{acción} · {entidad}` — p. ej. `Creación · oportunidad` |
| `LOGIN` / `LOGOUT` / `REFRESH` | **Solo la acción.** `LOGIN` → `Inicio de sesión`. Sin entidad, sin «en usuario» |
| Entidad sin etiqueta de producto | **Prohibido** el comodín `registro`. Omitir la entidad o usar un fallback de producto ya mapeado; nunca «Creación en registro» ni «Creación · registro» |

Sin identificadores visibles. Mismo vocabulario en ambas superficies.

---

### B3 — loading, error y éxito

Aclara §6.3 (Estado de la empresa). B3 tiene **tres** ramas, no una ficha de identidad por defecto:

| Estado de `tenant-me` / `tenant-summary` | Qué se ve |
| --- | --- |
| **Cargando** | Esqueleto con forma de la ficha (una fila / lista compacta). **No** `IdentityOnlyCard` |
| **Error** | Mensaje en lenguaje de negocio + **«Reintentar»** que recarga solo este bloque. **No** `IdentityOnlyCard` |
| **Éxito con ficha operativa** | Ficha resumida de B3 (nombre, estado del servicio, zona horaria, moneda, sedes) |
| **Éxito sin ficha operativa** | `IdentityOnlyCard` **solo aquí**: cuando, **tras** éxito, no hay datos de ficha operativa |

`IdentityOnlyCard` no se usa durante carga ni durante fallo. Un error tragado o una identidad parcial mientras carga incumple la honestidad del dato (§11 punto 3).

---

### Criterios de experiencia añadidos

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-NAV-01** | El menú lateral y los atajos de la búsqueda global usan las mismas etiquetas que los accesos rápidos del inicio (§4.14): Oportunidades, Programación, Usuarios y accesos; sin ítem Reportes ni badge «Siguiente fase»; rótulos de grupo «Menú» y «Administración» | Recorrido del shell + búsqueda global vs. B2b |
| **UX-UR2-01** | Desde `md` (768 px) y a 1280 px, B0 muestra primaria + Actualizar visibles, y el menú «Más acciones del inicio» **sí** aparece si hay secundaria. A 375 px: 1 control (primaria) + el mismo menú (Actualizar + secundaria si existe) | Viewport 375 / 768 / 1280 |
| **UX-ONB-01** | Con `operationState === 'unknown'` no se afirma «Configuración al día» ni equivalente; se ve esqueleto o el bloque no se renderiza. «Al día» solo con conteos leídos y sin pendientes | Forzar conteos desconocidos vs. leídos en cero vs. leídos con operación |
| **UX-AUD-01** | El historial del inicio no muestra el comodín «registro» ni «en usuario». `LOGIN`/`LOGOUT`/`REFRESH` muestran solo la acción (p. ej. «Inicio de sesión»). El resto usa `acción · entidad`, igual que la campana | Comparación campana ↔ historial; evento de sesión y evento sin mapa de entidad |

---

## Adenda densidad UI U-D2 — 2026-08-12

**Autoriza** AI-EM-ARCH en plan U-D2 densidad real dashboard portal (sesión 2026-08-12). **No borra** la adenda U-D ni sus criterios UX-DEN-01…05: U-D sigue vigente como base (tinte condicionado, I-7 sin full-bleed, vacío embebido, B3 compacta, copy de pliegue). U-D2 **versiona la anatomía del KPI del home** y el ritmo de densidad operativa del primer viewport.

Contrato hermano: [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) **v1.6** (`density: 'default' | 'compact'` en `PortalDashboardMetric`; `PortalPanel` con `compact` opcional).

Prompt de ejecución: [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md).

Skills: `system-vocabulary-review` · `iwana-identity-ui-review` (modo diseño, solo spec). Tracks notificados: AI-FE-PLATFORM · AI-SR-QA · AI-DS-OWNER.

**Modo identidad:** refinamiento de densidad sobre la composición ya congelada (U-1 grupos, I-1…I-7). No es un rediseño. El lima no entra en urgencia.

**Qué no cambia:** inventario y semántica de I-1…I-7 (§3.2), destinos/filtros, agrupación por dominio U-1, B0/B2b/B3 salvo ritmo de gaps y accesos, estados §6, techos de autorización, tinte condicionado de U-D (UX-DEN-01), Assurance y demás consumidores fuera del home.

### Anatomía versionada — KPI del home = fila horizontal (no póster)

| Pieza | Decisión U-D2 | Relación con U-D |
| --- | --- | --- |
| **B1 · cáscara home** | `PortalDashboardMetric` con `density='compact'`: **fila horizontal** (`flex-row items-center`), `min-h-14` (~56 px), tipografía de cifra `text-xl`, padding `py-2 px-3`, radio `rounded-2xl`. Target táctil ≥ 44 px lo cumple la card entera. | U-D fijó `min-h-24` póster; U-D2 lo **versiona solo en el home** vía prop `density`. Assurance y demás usan `default` (anatomía v1.4). |
| **B1 · descripción** | En idle del home: la `description` **no es permanente** — se omite o vive en `sr-only`. El dominio ya está en el eyebrow del grupo (U-1 / DS §1.8). | U-D listaba descripción visible en la cáscara; en home compacto deja de competir con la cifra. |
| **B1 · composición** | **Prohibido** el póster `flex-col` en métricas del inicio. Agrupación U-1 **intacta** (encabezado de dominio + grid de hijas sin eyebrow). | Sin volver a retícula plana de 4 por fila. |
| **Primer viewport 1280** | Con rol de ≥ 2 grupos: B0 + **≥ 2 grupos** + **arranque de B2** visible sin scroll. | Versiona el desempate R-D / U-D (que permitía B2 bajo el pliegue): la densidad real debe recuperar el inicio de B2. |
| **B1 · tinte** | Cero **sin** tinte de urgencia: `warning`/`danger` solo si `value > 0` o hay `delta` (igual que UX-DEN-01). | U-D intacto. |
| **Accesos rápidos** | Máximo **5** visibles + control «Ver más» si hay más. La meta de cada acceso es **`sr-only`** (no línea visible permanente). | U-D pedía `line-clamp-1` visible; U-D2 oculta la meta a vista y la deja para AT. |
| **Ritmo** | Gaps del home ≤ `gap-4` / `space-y-4` entre bandas y dentro de B2b. | Compacta el aire vertical sin tocar tokens de marca. |
| **Contratos** | FE/QA citan esta adenda + DS **v1.6**. I-1…I-7 intactos. | Prompt v1.1. |

### Criterios de experiencia U-D2

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-D2-01** | Cada métrica del home B1 es **fila horizontal** con alto mínimo `min-h-14` (~56 px); no póster alto | Inicio ADMIN; inspección de cáscara |
| **UX-D2-02** | En idle, la `description` de la métrica del home **no** es texto permanente visible (omitida o `sr-only`); el dominio ya está en el eyebrow del grupo | Lectura de B1 sin foco/hover especial |
| **UX-D2-03** | Ninguna métrica del home usa composición póster `flex-col`; la agrupación U-1 (dominios) permanece intacta | ADMIN con 4 grupos; sin eyebrows duplicados |
| **UX-D2-04** | A 1280 px, con rol de ≥ 2 grupos: primer viewport = B0 + ≥ 2 grupos completos + **arranque de B2** | Captura 1280 ADMIN |
| **UX-D2-05** | Con valor 0 y sin delta, las métricas de urgencia no pintan tinte ámbar/rosa (cero sin urgencia) | Inicio ADMIN vacío; igual espíritu que UX-DEN-01 |
| **UX-D2-06** | Accesos rápidos: máx. **5** visibles + «Ver más» si aplica; meta de cada fila en `sr-only` | B2b Accesos |
| **UX-D2-07** | Gaps / apilado del home ≤ `gap-4` / `space-y-4` | Inspección de layout del inicio |
| **UX-D2-08** | Implementación contra contratos U-D2 + DS **v1.6**; I-1…I-7 intactos (sin fusionar ni eliminar) | Diff FE + conteo de indicadores |

**Stop comprobado:** no exige campos nuevos de HLD §4.2. Sin `[BLOQUEO]`.

---

## Adenda densidad UI U-D3 — 2026-08-12

**Autoriza** AI-EM-ARCH en [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md) y prompt de auditoría v1.2. **No borra** U-D ni U-D2 como historia: U-D2 queda **superada en anatomía y retícula B1**. U-D3 **restaura el KPI compacto vertical** (base U-D) y **llena la retícula** (hasta 4 por fila a 1280).

**Por qué.** U-D2 cumplió el checkbox de «B2 en el primer viewport» convirtiendo el KPI en una fila de 56 px. Firma §2.1 no se reconoce: el operador ve cajas vacías (Track A 76/100 · Track B 86/100). Ni fila TailAdmin ni `PortalMetricCard` 148 px (hueco sparkline).

**Modo identidad:** refinamiento de densidad. El lima no entra en urgencia. I-1…I-7 intactos.

| Pieza | Decisión U-D3 | Relación con U-D2 |
| --- | --- | --- |
| **B1 · cáscara home** | `density='compact'` = **vertical** `flex-col`, `min-h-24` (~96 px), cifra `text-2xl`, padding `py-3 px-4`, radio `rounded-2xl`. Rótulo visible. Eyebrow de **card** omitido (el dominio vive en el encabezado de grupo). `description` en idle: omitida o `sr-only`. | Superada la fila `min-h-14` / `flex-row` / `text-xl`. |
| **B1 · sparkline** | **Prohibido** reservar hueco. Sin series en HLD §4.2. | Igual que U-D / U-D2. |
| **B1 · 148 px** | **Prohibido** en el home. `PortalMetricCard` intacto fuera. | Igual. |
| **B1 · retícula** | Hasta **4 columnas a 1280** (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`). Un solo hijo ocupa **una** columna; **sin** `max-w` del 50 %. Prohibido KPI fantasma. | Superado el techo a 2 col y el `max-w` de media pista (I-7). |
| **B1 · grupos** | Encabezado `.portal-eyebrow` de sección **una vez**; hijas sin eyebrow de categoría. | U-1 intacto. |
| **Primer viewport 1280** | B0 + banda B1 (hasta 4 KPI en la primera fila) + arranque de B2. | U-D2-04 se reinterpreta: el trabajo visible no puede ser aire interno de card. |
| **B2 / B2b** | `items-start` se conserva. El 8/4 con B2 vacío es **deuda P2**, no corte FE de esta adenda. | U-D / UX-DEN-03 intactos. |
| **Contratos** | FE/QA citan esta adenda + DS **v1.7**. | Prompt densidad v1.2. |

### Criterios de experiencia U-D3

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-D3-01** | Cada métrica del home B1 es **póster vertical** `min-h-24`; no fila `min-h-14` | Inicio ADMIN; inspección de cáscara |
| **UX-D3-02** | Cifra `text-2xl` + `font-mono`/`tabular-nums`; rótulo visible | Lectura B1 |
| **UX-D3-03** | A 1280, grid de grupo **hasta 4 columnas**; I-7 (un hijo) **no** deja media pista vacía | Captura 1280 ADMIN |
| **UX-D3-04** | Agrupación U-1 intacta (eyebrow de dominio una vez; hijas sin eyebrow duplicado) | ADMIN 4 grupos |
| **UX-D3-05** | Cero sparkline / cero `min-h-[148px]` en `PortalDashboardMetric` | Diff FE |
| **UX-D3-06** | Cero sin urgencia (tinte `warning`/`danger` solo si `value > 0` o hay `delta`) | Igual espíritu UX-DEN-01 / UX-D2-05 |
| **UX-D3-07** | I-1…I-7 intactos (sin fusionar ni eliminar) | Conteo de indicadores |
| **UX-D3-08** | Implementación contra U-D3 + DS **v1.7** | Diff + checklist DS §I |

**Stop comprobado:** no exige campos nuevos de HLD §4.2. Sin `[BLOQUEO]`.

---

## Adenda densidad UI U-D4 — antiespacios adaptativo (2026-08-13)

**Autoriza** AI-EM-ARCH en sesión del responsable 2026-08-13 — Opción A (layout adaptativo por altura del bloque dominante para eliminar los espacios vacíos del inicio `/dashboard`); rastro en [`INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-ANTIESPACIOS-v1.0.md). **No borra** U-D, U-D2 ni U-D3 como historia: U-D4 **versiona el layout de B2/B2b por altura del bloque dominante** y **confirma la alineación de B3 con §2.2**.

**Modo identidad:** eliminación de antiespacios verticales sobre la composición ya congelada. No es un rediseño. El lima no entra en urgencia. I-1…I-7 intactos.

**Qué no cambia:** composición por rol (§4), orden de bloques, plegado tras «Ver más» (§4.3), promoción con KPI > 0, franja de acciones (§5), ni los breakpoints de §8 — la banda reutiliza los existentes; solo suma densidad sin huecos en el estado vacío.

### B3 (§2.2) — corrección de desalineación

La ficha «Estado de la empresa» se renderiza a **12 columnas a ancho completo**: se elimina el cap `max-w-4xl` que la reducía a ~896 px y dejaba ~203 px vacíos. §2.2 ya declara B3 = 12 col; esta adenda **confirma que el código se alinea a la spec** (la fila B3 de U-D queda superada solo en el punto del ancho; la lista compacta permanece).

### B2 / B2b (§2.1, §2.2, §8) — layout adaptativo por altura (Opción A)

| Pieza | Decisión U-D4 | Relación con la spec |
| --- | --- | --- |
| **Modo retícula (caso rico, sin cambios)** | Cuando el bloque dominante es alto (**≥ 420 px** medidos), se mantiene el layout actual de la spec: **B2 = 8 col + B2b = 4 col** junto a B2 | §2.2 y §8 intactos |
| **Modo banda (tenant con datos en cero / dominante corto, < 420 px)** | **B2** pasa a **12 col a ancho completo** y **B2b** se convierte en **banda horizontal de ancho completo bajo B2**: 3 paneles → 3 columnas · 2 paneles → 2 columnas · 1 panel → ancho acotado (`max-w-2xl`) | Suma densidad sin huecos en el estado vacío |
| **Histéresis de salida** | La salida del modo banda exige un bloque dominante **≥ 460 px** | Evita el parpadeo de modo en el umbral |

**Justificación:** el estado más común (tenant nuevo, KPIs en 0) dejaba **~890 px vacíos** en los 2/3 izquierdos; la banda llena la pantalla **sin degradar el caso rico** que la spec optimizó.

### Criterios de experiencia U-D4

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-D4-01** | B3 se renderiza a 12 col a ancho completo; sin cap `max-w-4xl` (recupera los ~203 px) | Inicio ADMIN; inspección de B3 |
| **UX-D4-02** | Con bloque dominante alto (≥ 420 px medidos): B2 = 8 col + B2b = 4 col, layout de §2.2 sin cambios | Inicio ADMIN con trabajo en B2 |
| **UX-D4-03** | Con dominante corto (< 420 px): B2 = 12 col y B2b como banda horizontal de ancho completo bajo B2; 3 paneles → 3 columnas; 2 paneles → 2 columnas | Tenant nuevo / datos en cero |
| **UX-D4-04** | Con 1 panel en B2b, la banda ocupa ancho acotado (`max-w-2xl`) | Tenant con una sola pieza de apoyo |
| **UX-D4-05** | La salida del modo banda no ocurre hasta un dominante ≥ 460 px (histéresis): sin parpadeo en el rango 420–460 px | Transición de altura en el umbral |
| **UX-D4-06** | Sin cambios: composición por rol (§4), orden de bloques, plegado «Ver más», promoción KPI > 0, franja de acciones (§5) y breakpoints de §8 | Diff FE + recorrido por rol |

**Stop comprobado:** no exige campos nuevos de HLD §4.2. Sin `[BLOQUEO]`.

---

## Adenda densidad UI U-D5 (2026-08-13)

**Autoriza** la decisión del responsable en sesión del 2026-08-13 — **Opción 1: grid unificada de 4 por fila** (diseño §2.2 original) para la retícula B1. La implementación previa (adaptativa por grupo) queda **superada**. **No borra** U-D, U-D2, U-D3 ni U-D4 como historia: U-D5 **deroga en B1** la agrupación por dominio (Adenda B1 / U-1) y la regla de grid por grupo de U-D3; lo demás de U-D3 y U-D4 permanece vigente.

**Contexto — decisión del responsable (2026-08-13).** La agrupación por dominio (Adenda B1 / U-1) dejaba bandas de 2 KPIs con **media pista vacía** en las filas de B1 (informe antiespacios v1.0, H3: «grupos de 2 tarjetas; OPORTUNIDADES 1 tarjeta»). Tras evaluar las opciones, el responsable aprobó volver a la **grilla unificada** del §2.2 original: todas las tarjetas KPI de B1 fluyen en una sola grilla de hasta 4 por fila en escritorio y se retiran los eyebrows de dominio de B1.

**Modo identidad:** vuelta a la retícula unificada de tarjetas iguales del §2.2. El lima no entra en urgencia. I-1…I-7 intactos.

### Retícula B1 unificada

| Pieza | Decisión U-D5 | Relación con la spec |
| --- | --- | --- |
| **B1 · retícula** | Todas las tarjetas KPI del rol fluyen en **una sola grilla** `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` (hasta **4 por fila a 1280+**), en el orden de composición del rol (§4). Resultado por rol: **ADMIN 7** → fila de 4 + fila de 3; **NOC 4** → fila completa de 4; **SOPORTE 4** → fila completa de 4; **VENTAS 3** → 3 por fila; **CONTADOR (ACCOUNTANT) 1** → una columna (1/4, **nunca estirada** — único rol con 1 KPI, se conserva la regla DS v1.7); **TECNICO 0 KPIs** → no compone B1 (la sección no se renderiza) | §2.2 (B1 = 12 col, 4 por fila) |
| **B1 · eyebrows** | La tarjeta KPI **conserva su etiqueta**; el dominio se infiere de la etiqueta. El **eyebrow de dominio deja de renderizarse** en B1 (una sola grilla, sin encabezados de grupo). La ranura `eyebrow` del DS (§1.2) queda **disponible para otros usos** | Adenda B1 (U-1) superada en B1 |
| **B1 · anatomía** | KPI compacto vertical (base U-D / U-D3): **label + cifra + badge**, `min-h-24`, **sin** `max-w` 50 %. Tarjetas iguales, `gap-2` | U-D / U-D3 vigentes |
| **Móvil / tablet** | Sin cambios: `grid-cols-1` apilado; `sm:grid-cols-2` (2 por fila) | §8 / U-D3 |
| **Contratos** | FE/QA citan esta adenda + DS v1.7 (receta de grid §1.8 y nota U-D5 en §1.8) | Prompt densidad v1.2 |

**Qué no cambia:** anatomía KPI compacta vertical (base U-D / U-D3: label + cifra + badge, `min-h-24`, sin `max-w` 50 %), tarjetas iguales, `gap-2`, composición por rol (§4), orden de indicadores (§3) y el comportamiento en móvil/tablet (`grid-cols-1` apilado; `sm:grid-cols-2` de 2 por fila). Secciones B2 / B2b intactas.

### Criterios de experiencia U-D5

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-D5-01** | A 1280+, B1 usa hasta **4 columnas por fila**: ADMIN = 4+3; roles con 4 KPIs = fila completa de 4 | Captura 1280 ADMIN; inspección de grilla |
| **UX-D5-02** | **Sin eyebrows de dominio** en B1: una sola grilla, sin encabezados de grupo | Lectura de B1; 0 eyebrows de dominio en B1 |
| **UX-D5-03** | Rol con **1 KPI** (CONTADOR / ACCOUNTANT) = una columna (1/4), **sin estirar** a banda completa | Captura 1280 CONTADOR |
| **UX-D5-04** | Móvil/tablet **sin cambios**: `grid-cols-1` / `sm:grid-cols-2` | Recorrido móvil/tablet |

### Derogaciones explícitas (en B1)

1. La **agrupación por dominio** de la Adenda B1 (bandas + eyebrows) y los criterios **U-1 / UX-D3-04**, en lo que prohíben la «retícula plana de 4 por fila».
2. La **regla de grid por grupo** de U-D3 (tabla U-D3, filas «B1 · retícula» / «B1 · grupos», ≈ líneas 1037-1038).

Lo demás de U-D3 (**KPI compacto vertical**, sin `max-w`, **sin KPI fantasma**, sin retorno al póster `flex-col`) permanece vigente. Secciones B2 / B2b intactas.

**Stop comprobado:** no exige campos nuevos de HLD §4.2. Sin `[BLOQUEO]`.

---

## Adenda U-B0 — Franja de acciones fuera del título (2026-08-13)

> **Superada** el 2026-08-13 por **U-B0bis**: el Inicio ya no pinta B0b. Conservada como historia de la decisión de sacar CTAs del `PageHeader`.

**Autoriza** la decisión del responsable en sesión del 2026-08-13 — **opción 1:** `PageHeader` solo H1 + subtítulo; franja de acciones en un toolbar **debajo** del título (sigue arriba, fuera del H1). Skills: `iwana-identity-ui-review` (modo diseño) · `ui-ux-pro-max` (subordinada). Contrato DS hermano **v1.8**. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-B0-TOOLBAR-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-B0-TOOLBAR-v1.0.md).

**Problema.** El H1 (nombre de empresa) compartía bloque con CTAs (`Actualizar`, primaria del rol, menú «Más acciones del inicio»). Eso mezcla orientación con iniciar trabajo y contradice la jerarquía Firma (título = ancla; acciones = chrome). El precedente de `apps/web` ya sacó CTAs del `PageHeader`.

**Qué se versiona**

| Pieza | Antes (superado en el Inicio) | U-B0 |
| --- | --- | --- |
| **B0a · identidad** | Título + hora + CTAs en el mismo `PageHeader` | `PageHeader` **sin** `actions`: H1 + subtítulo (última lectura, aviso stale, «Actualizando») |
| **B0b · franja** | Slot `actions` del `PageHeader` | Toolbar **inmediatamente debajo** del título. Primitive: `PortalActionToolbar` `align="end"`. Nombre accesible del grupo: `Acciones del inicio` |
| **H1** | Controles hermanos del título | **Cero controles** dentro del H1 ni de su contenedor de título |

**Qué no cambia:** selección por rol (§5.2), destinos (§5.3), jerarquía azul noche / lima prohibido en filled, táctil 44 px, matriz U-R2bis (375: primaria + menú; desde `md`: primaria + Actualizar + menú si hay secundaria), `aria-label` del overflow `Más acciones del inicio`, Accesos rápidos (§4.14) como **navegación** (no se fusionan con B0b). El slot `actions` de `PageHeader` **permanece** para otras rutas del portal.

**Prohibido:** reintroducir CTAs en el H1; meter altas en Accesos rápidos; `variant="lime"` como primaria de página.

### Criterios de experiencia U-B0

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-B0-01** | El `h1` del Inicio no contiene botones ni enlaces de acción; la primaria y `Actualizar` están **fuera** de su contenedor de título | Unit + lectura DOM |
| **UX-B0-02** | B0b está **entre** B0a y B1 (indicadores), no dentro del `PageHeader` | Recorrido visual / DOM |
| **UX-B0-03** | Matriz U-R2bis intacta: 375 → 1 + menú; desde `md` → primaria + Actualizar + menú si hay secundaria | Viewport 375 / 768 / 1280 (equivale a UX-REM-05 / UX-UR2-01, con contenedor B0b) |

**Stop comprobado:** no exige campos nuevos de HLD §4.2. Sin `[BLOQUEO]`.

---

## Adenda U-B0bis — Encabezado sin franja de acciones (2026-08-13)

**Autoriza** la decisión del responsable en sesión del 2026-08-13: los botones de B0 **no quedan bien**; se **quitan**. Skills: `iwana-identity-ui-review` (modo diseño) · `system-vocabulary-review`. Contrato DS hermano **v1.9**. U-B0 (toolbar bajo el H1) queda **superada**.

**Problema.** Tras sacar los CTAs del `PageHeader`, la franja B0b (primaria, Actualizar, menú) seguía compitiendo con el ancla de identidad y con los indicadores. El inicio debe orientar, no duplicar altas que ya viven en módulos.

**Qué se versiona**

| Pieza | U-B0 (superada) | U-B0bis |
| --- | --- | --- |
| **B0** | B0a identidad + B0b toolbar | Solo identidad: H1 + subtítulo (última lectura, aviso stale, «Actualizando») |
| **Altas del rol** | CTA primaria/secundaria en B0b | Módulos, indicadores y Accesos rápidos. El registro §5.2 no se pinta |
| **Recarga** | Botón Actualizar global | `Reintentar` por bloque o tarjeta. Sin recarga global de página |

**Qué no cambia:** Accesos rápidos (§4.14) como navegación (no se fusionan con altas de B0). El slot `actions` de `PageHeader` **permanece** para otras rutas. Receta `Button variant="primary"` + `min-h-11` sigue vigente **fuera** del Inicio. `PortalActionToolbar` permanece como primitive.

**Prohibido:** reintroducir CTAs en el H1 o un toolbar de página bajo el H1; meter altas en Accesos rápidos salvo decisión nueva; `variant="lime"` como primaria de página.

### Criterios de experiencia U-B0bis

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| **UX-B0BIS-01** | El `h1` del Inicio no contiene botones ni enlaces de acción | Unit + DOM |
| **UX-B0BIS-02** | No existe toolbar `Acciones del inicio`, ni `Actualizar` global, ni menú «Más acciones del inicio» | Unit + E2E |
| **UX-B0BIS-03** | Primer viewport: identidad + indicadores (UX-03 actualizado). Recarga por `Reintentar` de bloque | Viewport / unit C-R2 |

**Stop comprobado:** no exige campos nuevos de HLD §4.2. Sin `[BLOQUEO]`.

---

## Adenda centro de mando — retiro de Accesos rápidos (2026-09-04)

Esta spec permanece congelada. El delta **no** reescribe §4.14: lo **supera** como superficie del home.

| Pieza | §4.14 / B2b (congelado) | Vigente (centro de mando v1.1) |
| --- | --- | --- |
| Panel Accesos rápidos | Mapa estático por rol, máx. 5 + «Ver más» | **Retirado** de los 12 roles |
| Destinos de módulo | Filas del panel | B1b (chips) + menú lateral |
| Mi perfil | Fila del panel | Enlace de texto «Ver mi perfil» en B3 |
| CA-V2-01 | Identidad + al menos un acceso rápido | Identidad B3 + B1b, bloque de trabajo, historial, o enlace de perfil en B3 |
| «Panel en preparación» | Fuera del producto | Sin cambio |

Fuente: [`2026-09-04-portal-dashboard-centro-mando-ux-spec.md`](2026-09-04-portal-dashboard-centro-mando-ux-spec.md) §11 · HLD v2.0.3.
