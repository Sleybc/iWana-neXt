# Dirección visual — Centro de control «Pulso de plataforma» (`apps/web`, `/dashboard`)

**Versión:** 1.2 (2026-11-22: §8 con decisiones del CTO, §8.1–§8.3) · **Fecha:** 2026-11-21 · **Estado:** Aprobado — G0 2026-11-21 (D1 y D2). D3 aprobada 2026-11-21 con ADR-114; D4 la resuelve DS-OWNER en la Fase 1 · **Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md)
**Modo:** dirección (`iwana-identity-ui-review`). No es spec de ejecución ni contrato DS.
**Prototipo:** [`prototipo_web_centro_control.html`](../prototipo/prototipo_web_centro_control.html) — cifras ilustrativas; «Mostrar origen del dato» marca qué sale hoy y qué exige contrato nuevo.
**Sustituye, si se aprueba:** la composición de [`2026-08-11-web-centro-control-portada-senal-ux-spec.md`](2026-08-11-web-centro-control-portada-senal-ux-spec.md). El contrato DS v1.2 del 2026-11-21 sigue vigente.

## 1. Contexto

Tarea del administrador de plataforma: **saber si la plataforma y las empresas están bien, y qué exige su intervención, en un viewport**.

| # | Hallazgo en la pantalla vigente (revisada en `localhost:3001` el 2026-11-21) |
| --- | --- |
| H1 | El mismo dato tres veces: empresas por estado en la franja, en «Atención operativa» y en «Empresas por estado» |
| H2 | Todo es conteo instantáneo: sin periodo, sin tendencia, sin comparación |
| H3 | La salud son cuatro tarjetas verdes que ocupan la mitad del primer viewport cuando todo está bien |
| H4 | `TenantStatusSummary.attention` (hasta 5 empresas con nombre) llega y no se pinta |
| H5 | Usuarios internos y Plataforma no tienen lectura en el inicio |
| H6 | «Actividad reciente» son renovaciones de sesión: ruido |
| H7 | El inicio del portal ya usa otra gramática (pulso, cola de atención, áreas); las dos consolas no se parecen |

## 2. Referentes (revisados 2026-11-21)

| Referente | Se adopta | Se rechaza |
| --- | --- | --- |
| TailAdmin CRM | Delta como badge junto a la cifra; tabla corta de recientes | Dona, objetivo radial, paleta y fuente |
| TailAdmin SaaS | KPIs como celdas de una sola superficie; selector de periodo; feed de actividad | Embudo multicolor |
| TailAdmin Logística | Tabla con estado | Pozos de icono decorativos |
| shadcn/ui dashboard | Frase interpretativa bajo la cifra | — |
| Tremor | Tracker de disponibilidad; barra de categorías | — |
| Inicio del portal «Pulso y atención» | Toda la gramática: pulso, cola única, una visual por área | — |

## 3. Opciones

| | A · Portada de señal 2.0 | B · Pulso de plataforma | C · Cartera de empresas |
| --- | --- | --- | --- |
| Tesis | Pulir lo vigente | Las tres preguntas del portal, a nivel plataforma | El inicio es una tabla de empresas con uso y estado |
| Encaja | Sin backend | Responde H1–H7; una sola gramática en web y portal | Sirve a soporte |
| Riesgo | Sigue sin tendencia ni decisión | Cuatro contratos nuevos; se entrega por fases | Duplica `/tenants`; todo depende de lectura entre empresas |

**Recomendación: B**, con la tabla corta de C como banda final.

## 4. Composición (1440 px: B0, B1 y B2 completos)

| Banda | Contenido | Primitive | Dato |
| --- | --- | --- | --- |
| B0 | Título, última lectura, periodo, Actualizar | `PageHeader` | — |
| B1 | Pulso: una superficie, 5 celdas (activas, altas en curso, requieren atención, disponibilidad, equipo interno) | Celda de pulso del portal, promovida a `@iwana/ui` | Hoy + P1–P3 |
| B2 izq. (8) | Tendencia: activas, altas y bajas por mes | `Chart` (ADR-112) | P1 |
| B2 der. (4) | Requiere tu atención: cola única, En riesgo primero, máx. 6 | `Card` + filas enlazadas | `attention[]` hoy; P2–P4 |
| B3 | Una card por área del menú: Empresas, Salud, Usuarios internos, Uso por empresa | `Card` + `StackedBar` | Hoy + P2–P4 |
| B4 | Últimas empresas (7) · Actividad reciente sin eventos de sesión (5) | Tabla-en-card · timeline | Hoy |

Lima solo en avance (altas, neto positivo, cobertura). Degradado azul→lima solo en la barra de verificación en dos pasos. Sin dona, gauge ni mapa. Estados, responsive y accesibilidad: los de la dirección del portal §9, sin cambios.

## 5. Contratos nuevos

| ID | Contrato | Tenancy |
| --- | --- | --- |
| P1 | `tenants/summary` v1.1: altas y bajas del periodo, serie de 12 meses, antigüedad del alta más vieja en curso | Solo schema `public` |
| P1.2 | `tenants/summary` v1.2: periodo de 6, 12 o 24 meses y `activeAtClose` (número o `null`) por mes (§8.3). En la tarjeta Tendencia: dos gráficas, `line` «Activas al cierre» arriba y barras «Altas y bajas» debajo, con un solo selector de periodo (el contrato de gráficas no combina barras y línea) | Solo schema `public` |
| P2 | Salud autenticada: disponibilidad diaria de 30 días y acumulación de colas | Sin datos de empresa; exige muestreo periódico |
| P3 | Resumen de usuarios internos: por rol, sin verificación en dos pasos, sin acceso en 30 días | Solo schema `public` |
| P4 | Uso por empresa: suscriptores activos frente a `maxSubscribers` | **Lee schemas de empresa desde plataforma: exige ADR y revisión de AI-SEC-ENG.** Solo conteos |

## 6. Fases

| Fase | Alcance | Backend |
| --- | --- | --- |
| 1 | Recomposición con lo vigente: pulso de 3 celdas más salud instantánea, cola con `attention[]`, áreas Empresas y Salud a la izquierda de la cola (la tendencia ocupa ese lado en Fase 2), B4 | Ninguno |
| 2 | P1 y P3: tendencia, deltas, equipo interno | `public` |
| 3 | P2: disponibilidad histórica y colas | Worker de muestreo |
| 4 | P4: uso por empresa | ADR previo |

Un bloque sin contrato no se monta: ni ceros ni series de muestra.

## 7. Decisiones del G0

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | Dirección | B — **aprobada 2026-11-21** |
| D2 | Arrancar por Fase 1 sin backend | Sí — **aprobada 2026-11-21** |
| D3 | P4: la consola de plataforma muestra conteos de cada empresa | Sí, solo conteos y con ADR — **aprobada 2026-11-21** (ADR-114) |
| D4 | Promover la celda de pulso del portal a `@iwana/ui` | Sí, por DS-OWNER |

## 8. Umbrales (prod-ux, 2026-11-22)

Decisiones del CTO del 2026-11-22: meta de disponibilidad 99,9 %; el cupo de suscriptores solo avisa, no bloquea altas en CRM.

| Umbral | Valor | Estado y motivo |
| --- | --- | --- |
| Disponibilidad, tracker diario | Verde 100 %; ámbar ≥ 99 %; rojo < 99 % | Aprobado; **no se alinea** a 99,9. Con muestreo cada 5 min (288 muestras al día) una sola muestra caída deja el día en 99,65 %: 100 y 99,9 dan el mismo color. 100 dice lo que es: verde = ninguna muestra caída |
| Disponibilidad, celda de 30 días | Verde ≥ 99,9 %; ámbar ≥ 99 %; rojo < 99 % | Aprobado por el CTO. 99,9 % admite unos 43 min caídos en 30 días (8 muestras) |
| Cifra de disponibilidad (celda y tracker) | Redondeo a 2 decimales (F3-D6, CTO); el color se calcula con la razón exacta; si el redondeo alcanzaría 100 %, 99,9 % o 99 % estando por debajo, se trunca (0,98999 → «98,99 %») | AI-EM-ARCH, 2026-11-22: la cifra nunca contradice su color |
| Uso por empresa | Ámbar ≥ 90 %; rojo ≥ 100 % | Aprobado. Sustituye 90/95: el cupo no bloquea, así que el riesgo empieza al alcanzarlo. Se compara la razón exacta (`activos / cupo`), no el porcentaje redondeado; la cifra visible se trunca (`Math.floor`) para que «100 %» aparezca solo al alcanzar el cupo |
| Espera en colas | ≥ 5 min del trabajo más antiguo; fallidos de las últimas 72 h (`failedRecent > 0`) | Aprobado. Cuenta solo `waiting` (no `delayed`), verificado en `platform-health-sampler.processor.ts:189-194`. 72 h ratificado el 2026-11-22: sustituye «fallidos siempre», porque BullMQ solo borra un fallido viejo cuando falla otro trabajo de la misma cola (plat-ops); 72 h cubre un fin de semana |

### 8.0 Fallidos recientes e históricos en «Colas de trabajo»

| Regla | Valor |
| --- | --- |
| Aviso del área y fila de atención | Solo `failedRecent > 0`. Cola con fallidos solo históricos: «Sin novedad» y cuenta en «N colas sin novedad»; sin nota aparte |
| Rótulo de la cola | «Con fallos» si `failedRecent > 0`; «Acumulación» si solo espera |
| Columna | «Fallidos (72 h)»: muestra `failedRecent` |
| Histórico | Debajo de la cifra, en texto secundario, solo si `failed > failedRecent`: «{failed} en total» (es-CO) |
| Fila de atención | «1 trabajo fallido en 72 h» / «N trabajos fallidos en 72 h»; resto de la fila sin cambio |
| Muestra sin `failedRecent` (anterior al despliegue) | Se usa `failed` (conservador) |

### 8.1 Uso por empresa en «Requiere tu atención»

Umbral de riesgo = rojo: `activos ≥ cupo`. El ámbar se ve solo en el área.

| Regla | Valor |
| --- | --- |
| Filas | Una por empresa (el CTO: «enlaza a esa empresa»); el tope de 6 y «Ver los N restantes» de la cola ya cubren el volumen |
| Severidad | `attention`. No es `at-risk`: no se cae ningún servicio ni se bloquea un alta |
| Título | `activos = cupo` → «Llegó al cupo de suscriptores»; `activos > cupo` → «Superó el cupo de suscriptores» |
| Área (línea 2) | «{empresa} · {activos} de {cupo} suscriptores» (es-CO; «1 de 1 suscriptor» si el cupo es 1) |
| Enlace | `/tenants/{tenantId}/settings`, igual que las demás filas de empresa |
| Sin cupo (`maxSubscribers` nulo) | Sin fila |
| Cupo 0 | Fila «Superó el cupo de suscriptores» solo si `activos > 0`; con 0 activos, sin fila (cierre deliberado) |
| «Sin dato» (`activeSubscribers` nulo) | Sin fila: no se infiere riesgo sin medición |
| Medición desactualizada | Cuenta con el último valor; el área ya marca «Desactualizada» |
| Visibilidad | Solo si el rol ve el área (`canSeeTenantUsage`); sin dato de uso, la cola no cambia |
| Celda «Requieren atención» de B1 | No cambia: cuenta estados de empresa, no uso |

Insignia del área: si alguna empresa está en rojo, `Badge` `error` «Cupo alcanzado»; si no y alguna en ámbar, `warning` «Cerca del cupo».

### 8.2 Tope del área «Uso por empresa» (F4-D5)

Patrón de C3 (Colas de trabajo): expandir en el sitio. No existe vista de uso completa y no se crea.

| Regla | Valor |
| --- | --- |
| Tope | 6 filas, igual que la cola |
| Orden | El vigente: mayor uso primero (razón exacta), luego sin cupo, «Sin dato» al final; empate por nombre (es) |
| Debajo del tope | Línea «1 empresa más» / «N empresas más» y `Button` ghost «Ver todas» (`aria-expanded`, `aria-controls` a la lista) |
| Expandida | La lista completa; el botón dice «Ver menos». No se persiste en la URL |
| ≤ 6 empresas | Sin línea ni botón |
| Pie | Sin cambio: «Ver empresas» → `/tenants?status=ACTIVE` |

Las empresas en rojo quedan siempre arriba; si hay más de 6, las ocultas siguen en la cola de atención.

### 8.3 Tendencia: activas y periodo (F2-D2)

| Regla | Valor |
| --- | --- |
| Granularidad | Mes calendario, America/Bogota, como `monthly` de `tenants/summary` v1.1 |
| Periodos | 6, 12 y 24 meses, contando el mes en curso como último punto |
| Por defecto | 12 meses |
| Activas, cada punto | Empresas en estado `ACTIVE` al cierre del mes (último instante del mes, America/Bogota). Mes en curso: el valor de hoy (= `byStatus.ACTIVE`) |
| Sin historia | Mes sin dato reconstruible → `null`, nunca 0; la línea se corta en ese tramo |
| Altas y bajas | `removed` sin cambio; `created` cuenta el primer `CREATE` de cada empresa (un `CREATE` de marca no es otra alta). AI-EM-ARCH, 2026-11-22 |
| Selector | En la cabecera de la card Tendencia, no en B0: el periodo solo cambia la tendencia (la disponibilidad es siempre de 30 días). Grupo `role="group"` «Periodo» con `Button` y `aria-pressed`; sin primitive de segmentos en `@iwana/ui`, si hace falta la decide ds-owner. Se aparta del prototipo, que lo pone en B0 con «30 días», incompatible con granularidad mensual |
| URL | `?periodo=6m`, `12m` o `24m`; por defecto se omite; valor inválido → 12 meses |
| Fuera de alcance | La pestaña «Suscriptores gestionados» del prototipo: sin contrato, no se monta |
| Composición (2026-11-22) | Desde `xl` (≥ 1280 px), las dos gráficas **lado a lado** dentro de la tarjeta, cada una de 200 px de alto: «Activas al cierre» a la izquierda y «Altas y bajas» a la derecha. Por debajo de `xl`, una sobre otra, como hoy. CA-PP2-06 no cambia. Se descarta el conmutador: esconde la relación entre saldo (activas) y flujo (altas y bajas), y suma un segundo grupo de segmentos junto al del periodo. Si a 1440 px el área de trazado de una gráfica queda por debajo de 300 px, se vuelve a decidir; no se recorta en silencio |

Textos:

| Clave | Texto |
| --- | --- |
| Opciones | «6 meses» · «12 meses» · «24 meses» |
| Subtítulo de la tarjeta | «Empresas por mes, últimos N meses» |
| Gráfica 1 (`line`): encabezado | «Activas al cierre» |
| Gráfica 1: `aria-label` | «Empresas activas al cierre de cada mes, últimos N meses» |
| Gráfica 1: tabla accesible | «Mes» · «Activas al cierre»; `null` → «Sin dato» |
| Gráfica 1: algunos `null` | Línea cortada y nota bajo la gráfica: «Sin dato en algunos meses.» |
| Gráfica 1: todos `null` | No se monta la gráfica; en su lugar, texto: «Aún no hay historia de empresas activas en este periodo.» |
| Gráfica 1: todos 0 | Se dibuja (es dato real) |
| Gráfica 2 (barras): encabezado y leyenda | «Altas y bajas» · leyenda «Altas», «Bajas» |
| Gráfica 2: `aria-label` | «Altas y bajas de empresas por mes, últimos N meses» |
| Gráfica 2: tabla accesible | «Mes» · «Altas» · «Bajas» |
| Gráfica 2: vacío (todo 0) | «Sin altas ni bajas en los últimos N meses» |
| Ambas vacías | Un solo `EmptyState` «Sin empresas activas, altas ni bajas en los últimos N meses» solo si todos los `activeAtClose` valen 0 y altas y bajas son 0. Todos `null` o ausentes (payload v1.1) con flujos en 0: texto de historia de la gráfica 1 y «Sin altas ni bajas…» en la 2. AI-EM-ARCH, 2026-11-22 |
