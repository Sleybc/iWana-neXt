# Dirección visual — Inicio del portal «Pulso y atención» (`/dashboard`)

**Versión:** 1.1
**Estado:** Aprobado — G0 2026-11-16 (D1, D5 y D6). D2–D4 siguen abiertas y solo condicionan la Fase 2
**Fecha:** 2026-11-16
**Modo:** dirección (`iwana-identity-ui-review` → `references/direccion-visual.md`). No es spec de ejecución ni contrato DS.
**Prototipo:** [`docs/prototipo/prototipo_dashboard_inicio.html`](../prototipo/prototipo_dashboard_inicio.html) — composición con cifras ilustrativas; el interruptor «Mostrar origen del dato» marca qué bloque sale hoy y cuál exige contrato nuevo.

**Sustituye, si se aprueba:** la composición de [`2026-09-04-portal-dashboard-centro-mando-ux-spec.md`](2026-09-04-portal-dashboard-centro-mando-ux-spec.md) y [`2026-09-04-portal-dashboard-elevacion-visual-design.md`](2026-09-04-portal-dashboard-elevacion-visual-design.md). Exige HLD-MOD02 v3.0: levanta tres exclusiones de [`HLD-MOD02 v2.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) §2.2 (endpoints nuevos, series y gráficas, facturación).

---

## 1. Contexto de interfaz

Dashboard operativo y directivo. Tarea de la Administradora al abrirlo: **saber cómo va el negocio y qué exige su decisión hoy, en un viewport**.

Hallazgos sobre el inicio vigente (`apps/portal/src/components/dashboard/DashboardClient.tsx`; captura `docs/informes/evidence/mod13-f1v2/01-dashboard-admin.png`):

| # | Hallazgo | Evidencia |
| --- | --- | --- |
| H1 | Nueve bandas apiladas; en un día tranquilo el primer viewport son siete ceros y un vacío («Sin carga que medir») | Captura; `DashboardClient.tsx:1485-1700` |
| H2 | No hay lectura de negocio: ni suscriptores, ni facturación, ni red, aunque los módulos existen | HLD v2.0 §2.2 los excluyó en agosto; hoy existen `GET /crm/subscribers/queue-counts` y los controladores de `billing/` |
| H3 | Todo es conteo instantáneo: sin periodo, sin comparación, sin tendencia | HLD v2.0 §2.2 «Series temporales» |
| H4 | Datos que el backend ya entrega y el inicio no pinta: `technicianLoad`, `enRouteCount`, `upcomingCount`, `resolvedTodayCount`, `fieldServicePendingCount`, `balancesByCategory` | 0 referencias en `DashboardClient.tsx` |
| H5 | La atención está repartida en cuatro gramáticas: Foco de hoy, deltas de KPI, chips de salud y bloque dominante con «Ver más · 3 resúmenes» | `DashboardClient.tsx:1519-1644` |
| H6 | Prioridad de casos y etapas del embudo se leen como listas de texto, sin proporción | `HelpDeskBlock`, `PipelineBlock` |
| H7 | «Estado de la empresa» (zona horaria, moneda, país) ocupa una banda con datos estáticos de configuración | `TenantSummaryCard` |

## 2. Referentes revisados (2026-11-16)

| Referente | Se adopta | Se rechaza | Ancla |
| --- | --- | --- | --- |
| TailAdmin CRM (`/crm`) | Delta como badge junto a la cifra; gráfica con selector de periodo; lista de próximos eventos | Gauge radial de objetivo; dona; paleta y fuente | Firma §5; receta #15 «nunca gauge radial» |
| TailAdmin SaaS (`/saas`) | **KPIs como celdas de una sola superficie** con divisores (una card, no cinco); selector Semanal/Mensual/Anual; feed de actividad | Barras apiladas multicolor | Firma §3 elem. 2 (menos superficies) |
| TailAdmin Logística (`/logistics`) | Tabla corta con estado; línea de seguimiento | Mapa; pozos de icono decorativos | — |
| shadcn/ui dashboard | Frase interpretativa bajo la cifra («61 altas · 23 retiros») | — | Firma §4/Fase 3 ítem 3.1 (wrapper `Chart`) |
| Tremor Blocks | Barra de categorías apilada con leyenda; tracker de disponibilidad | — | Firma §4/Fase 3 ítems 3.1 y 3.4 |
| Stripe (inicio) | Banda «hoy» separada del resumen por periodo | — | `trends-2026.md` (apoyo, no normativo) |
| UISP / Splynx (dominio ISP) | Qué mide un ISP en su inicio: base activa, cartera vencida, casos, visitas | Disposición y atajos | Memoria de producto; **no se abrió la instancia real en esta sesión** |

## 3. Opciones visuales

| | A · Informe ejecutivo | B · Centro de mando 2.0 | C · Pulso y atención |
| --- | --- | --- | --- |
| Tesis | El inicio es un reporte: KPIs de negocio y una gráfica grande | El inicio es una lista de trabajo; se pulen las piezas vigentes | Tres preguntas en orden: cómo va el negocio, qué exige decisión, cómo está cada área |
| Ancla sin logo | Gráfica azul noche + lima | Chips de salud y barra de foco | Franja de pulso + cola única de atención + una visual por área, con el dúo azul→lima solo en avance |
| Por qué encaja | Responde H2 y H3 | Sin backend nuevo | Responde H1–H7; sirve a quien decide y a quien opera |
| Riesgo | Sin series no hay nada que pintar; poco accionable; vacío en tenants nuevos | Sigue sin lectura de negocio (H2, H3) | Depende de contratos nuevos para tres bloques; hay que entregarlo por fases sin huecos falsos |

## 4. Recomendación: C

Es la única que responde a la vez negocio y acción, se degrada bien (cada bloque sin contrato se omite, no se finge) y reutiliza lo ya normado: KPI con delta tonal, `ProgressMeter`, badges de salud, tabla-en-card, timeline. Baja de nueve bandas a cuatro.

## 5. Sistema visual propuesto

Orden de lectura: **B0 identidad y periodo → B1 pulso → B2 tendencia + atención → B3 por área → B4 agenda + actividad**. Primer viewport a 1440 px: B0, B1 y B2 completos.

| Banda | Contenido | Primitive / patrón | Dato | Estado del dato |
| --- | --- | --- | --- | --- |
| B0 | Empresa, fecha, última lectura, periodo (Hoy · 7 días · Este mes · 12 meses), Actualizar | `PageHeader` + pista de tabs de módulo; periodo en la URL | — | Hoy |
| B1 | Una superficie con hasta 5 celdas: cifra rol *title*, delta tonal, frase, mini visual | `PortalDashboardMetric` en modo celda (variante nueva) | Ver §5.1 | Mixto |
| B2 izq. (8) | Tendencia con tres series conmutables: Suscriptores, Recaudo, Casos | Wrapper `Chart` (Firma 3.1) + tabla alternativa | Series N1–N3 (§7) | Contrato nuevo |
| B2 der. (4) | **Requiere tu atención**: cola única, En riesgo antes que Atención, máx. 6 + «Ver los restantes» | `PortalPanel` + `PortalNavListRow` | Ver §5.2 | Hoy |
| B3 | Una card por área: rótulo del menú, badge de salud, **una** visual, pie con un dato y enlace | `PortalPanel compact` + badge de `PortalModuleHealthChip` | Ver §5.3 | Mixto |
| B4 izq. (7) | Hoy en agenda: visitas y cortes del día, máx. 4 filas | Tabla-en-card (preview ≤10, sin pager) | Agenda de programación + `cutoff-agenda` | Hoy |
| B4 der. (5) | Actividad reciente, máx. 4 | Timeline (receta #13) | `loadAuditFeed` | Hoy |

Desaparecen como bandas propias: Foco de hoy, chips B1b y «Próximo paso de configuración» (pasan a la cola de atención y al badge de cada área) y «Estado de la empresa» (queda en Configuración; el inicio conserva nombre y enlace).

### 5.1 Pulso (Administradora)

| Celda | Cifra | Delta / frase | Mini visual | Fuente |
| --- | --- | --- | --- | --- |
| Suscriptores activos | `active` | Neto del periodo · altas y retiros | Sparkline 12 meses | `queue-counts` hoy; delta y serie → N2 |
| Recaudo del mes | Recaudado | % de lo facturado | `ProgressMeter` (es avance: degradado permitido) | N1 |
| Cartera vencida | Monto | Suscriptores en mora · tramo de más de 90 días | Barra por antigüedad | N1 |
| Casos abiertos | `openCount` | En riesgo · incumplidos · resueltos hoy | — | Resumen de mesa de ayuda, hoy |
| Visitas de hoy | `todayCount` | Vencidas · en ruta · por programar | — | Resumen de programación, hoy |

Cinco cifras de pulso; las cards de B3 no son KPI (su titular es un estado). Techo Firma §4/2.1 respetado.

### 5.2 Cola de atención — fuentes ya publicadas

| Fila | Fuente | Roles del endpoint |
| --- | --- | --- |
| Casos fuera de tiempo / en riesgo | `assurance/dashboard/summary` | Vigente |
| Visitas vencidas · solicitudes por programar | `wfm/dashboard/summary` | Vigente |
| Servicios que entran a corte hoy | `crm/billing-cycles/cutoff-agenda` | Lectura de suscriptores |
| Órdenes que esperan activación | `network/provisioning/inbox` | ADMIN, NOC |
| Datos fiscales incompletos · sin servicios vivos | `crm/subscribers/queue-counts` | ADMIN, NOC, SALES, SUPPORT, ACCOUNTANT |
| Planes sin precio · ofertas en riesgo | `commercial/dashboard/summary` | Vigente |
| Productos bajo el mínimo | `inventory/replenishment/suggestions` | ADMIN, NOC, SUPPORT, TECHNICIAN, AUDITOR |
| Pendientes de configuración | `tenants/me/summary` | Vigente |
| Solicitudes de datos personales por vencer | `privacy/requests` (falta conteo por plazo → N5) | ADMIN, AUDITOR |

Reglas: cada fila enlaza al mismo conjunto que cuenta (CA-V2-05 vigente); una fuente en error no produce fila ni cero; cola vacía = estado «Todo al día» con badge lima.

### 5.3 Por área

| Área | Visual | Dato | Estado |
| --- | --- | --- | --- |
| Mesa de ayuda | Barra apilada por prioridad (urgencia en `error`/`warning`, nunca lima) | `byPriority`, `resolvedTodayCount`, `fieldServicePendingCount` | Hoy |
| Programación | Ocupación por técnico o cuadrilla, tope 4 | `technicianLoad`, `enRouteCount` — falta el nombre visible (solo llega `assignedUserId`) | Parcial |
| Oportunidades | Barras por etapa (rótulos de `formatExpedienteStatus`) | `crm/pipeline/summary` | Hoy |
| Facturación | Cartera por antigüedad + próximo ciclo | N1 + `cutoff-agenda` | Contrato nuevo |
| Red | Tracker de disponibilidad por nodo (Firma 3.4) | N4 | Contrato nuevo |
| Inventario | Valor estimado + existencias por categoría, tope 3 | `estimatedTotalValue`, `balancesByCategory` | Hoy |

### 5.4 Tono cromático

Tokens existentes para todo salvo series. **Propuesta de token nuevo** (no existe; decide DS-OWNER): `--chart-1` azul noche, `--chart-2` `iwana-secondary-600` (el lima 500 no alcanza 3:1 como objeto gráfico sobre blanco), `--chart-3` `iwana-primary-400`, `--chart-4` `iwana-primary-200`; en dark, `primary-300` y lima 500. Lima solo en series de avance (altas, resueltos); nunca en mora ni vencidos.

## 6. Composición por rol

El techo sigue siendo la autorización; la composición reduce, nunca amplía un guard.

| Rol | Pulso | Tendencia | Áreas |
| --- | --- | --- | --- |
| Administradora | Las cinco | Suscriptores · Recaudo · Casos | Las seis |
| Monitoreo operativo | Visitas, por programar, casos, en riesgo, activaciones pendientes | Casos | Mesa de ayuda, Programación, Red, Inventario |
| Soporte inicial | Casos, en riesgo, visitas, por programar | Casos | Mesa de ayuda, Programación |
| Ejecutivo comercial | Oportunidades, altas del periodo, ofertas en riesgo, planes sin precio | Suscriptores | Oportunidades |
| Contadora | Recaudo, cartera vencida, facturado, planes sin precio | Recaudo | Facturación |
| Técnico y contratista | Sin cambio: agenda del día en móvil | — | — |
| Vista base | Sin cambio | — | — |

## 7. Contratos de datos nuevos (propuesta para HLD v3.0)

Se mantiene el fan-out por módulo con degradación por bloque: cada módulo publica su propio resumen; el inicio no lee tablas ajenas. Respuestas solo con conteos y sumas, sin PII.

| ID | Contrato | Alimenta |
| --- | --- | --- |
| N1 | Resumen de facturación del periodo: facturado, recaudado, cartera vencida (monto y suscriptores), tramos de antigüedad, serie mensual 12 meses | B1, B2, B3 |
| N2 | Altas y retiros del periodo + serie mensual 12 meses | B1, B2 |
| N3 | Serie diaria de casos creados y resueltos (ampliación del resumen de mesa de ayuda) | B2 |
| N4 | Resumen de red: nodos por estado y disponibilidad diaria | B3 |
| N5 | Conteo de solicitudes de datos personales por plazo legal | B2 der. |
| N6 | Nombre visible en `technicianLoad` | B3 |

## 8. Fases

| Fase | Alcance | Dependencias |
| --- | --- | --- |
| 1 | Nueva composición con contratos vigentes: B0, B1 (suscriptores sin serie, casos, visitas), cola de atención, áreas Mesa de ayuda, Oportunidades, Inventario, Programación, B4. Barras en CSS; cero dependencias | Ninguna de backend |
| 2 | N1–N3 y N6, selector de periodo, B2 izquierda, celdas de recaudo y cartera, área Facturación | HLD v3.0; ADR de dependencia de gráficas (Firma §8); tokens `--chart-*` |
| 3 | N4 y N5, área Red con tracker | Confirmar que existe telemetría de disponibilidad |

Un bloque sin contrato **no se monta**; no se dejan huecos, ceros ni series de muestra.

## 9. Responsive y accesibilidad

- ≥1280: pulso a 5 celdas, B2 8/4, áreas a 3 columnas. 768–1279: pulso a 2, B2 apilado (atención primero), áreas a 2. <768: una columna; orden B0 → atención → pulso → áreas.
- Targets ≥44 px; cada celda y cada fila es un solo control con nombre accesible `{rótulo}, {cifra}, {señal}`.
- Ningún estado solo por color: badge con texto, series diferenciadas por trazo, leyenda con valor.
- Cada gráfica con `role="img"`, resumen textual y tabla alternativa (Firma 3.1).
- Estados: skeleton con forma por bloque, error con Reintentar por fuente, vacío con acción, «Actualizando» sin perder la última lectura.

## 10. Criterios de aceptación visual

| ID | Criterio |
| --- | --- |
| CA-PA-01 | A 1440 × 900 se ven B0, B1 y B2 completos sin desplazar |
| CA-PA-02 | Máximo 5 cifras de pulso; las cards de área no usan `PortalDashboardMetric` |
| CA-PA-03 | Lima solo en avance (neto positivo, recaudo, altas, Al día); mora, vencidos y prioridad usan `warning`/`error` |
| CA-PA-04 | Degradado azul→lima únicamente en la barra de recaudo |
| CA-PA-05 | Fuente en error o ausente: el bloque muestra aviso o no se monta; nunca `0` ni serie de muestra |
| CA-PA-06 | Cada fila de atención abre el mismo conjunto que cuenta |
| CA-PA-07 | Sin gauge radial, dona, mapa ni bento decorativo |
| CA-PA-08 | Ningún rol ve cifras de un endpoint que su guard no autoriza |
| CA-PA-09 | `audit-ui.mjs` con P0/P1 = 0 en los archivos tocados |

## 11. Decisiones que cierran el G0

| # | Decisión | Recomendación |
| --- | --- | --- |
| D1 | Dirección | C — **aprobada 2026-11-16** |
| D2 | Levantar las exclusiones de HLD v2.0 §2.2 y abrir HLD v3.0 | Sí — **aprobada 2026-11-17**; ver [HLD v3.0](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md) |
| D3 | Gráficas: Recharts con el wrapper `Chart` (Firma 3.1, exige ADR) o SVG propio | Recharts — [ADR-112](../adrs/ADR-112-Sistema-de-Graficas-del-Portal.md) **aprobado 2026-11-17** |
| D4 | Quién ve cifras de dinero en el inicio | Administradora y Contadora — recogida en HLD v3.0 §5, sin aprobar |
| D5 | Retirar el contrato I-1…I-7 y los chips B1b como bandas | Sí; sus fuentes y destinos se conservan — **aprobada con D1** |
| D6 | Arrancar por Fase 1 sin esperar backend | Sí — **aprobada 2026-11-16** |

## 12. Riesgos y deuda visual

- N1 suma dinero por tenant y periodo: exige diseño de consulta y caché, no un cálculo en el inicio.
- Las cards de área pueden derivar en mosaico si cada una suma una segunda visual: la regla es una.
- Tenant recién creado: B1 y B3 deben caer en estados de primera vez, no en ceros.
- No verificado: telemetría de disponibilidad de routers (N4), forma del total en la bandeja de aprovisionamiento, rótulos reales de etapas del embudo en el prototipo, y la instancia real de UISP.

## 13. Fase 1 — desviaciones respecto de §5 (v1.1)

Evidencia y conteos: [`INFORME-MOD02-DASHBOARD-PULSO-ATENCION-FASE-01-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PULSO-ATENCION-FASE-01-v1.0.md).

| § | Lo especificado | Lo entregado | Motivo |
| --- | --- | --- | --- |
| B0 | Periodo y botón Actualizar | Encabezado sin controles | U-B0bis sigue vigente; el periodo solo tiene sentido con series (Fase 2) |
| B1 | Variante «celda» en `portal-ui` | Celda propia en `DashboardPulse.tsx`: rótulo, cifra, señal, frase y mini visual | `portal-ui.tsx` tiene cambios sin commit de otra sesión; la celda queda como patrón de pantalla y se propone su promoción a DS-OWNER |
| B2 | Tendencia (8) + atención (4) | Por área (8) + atención (4); debajo, detalle del rol (7) + historial (5) | Sin series; la gráfica ocupará el lado izquierdo en Fase 2 y las áreas bajarán a su fila |
| §5.2 | Fila «órdenes que esperan activación» | Dos filas: servicios sin aprovisionar (En riesgo) e instalaciones cerradas sin aprovisionar (Atención) | Son las dos colas que la bandeja trata como pendientes; «en ejecución» es flujo normal |
| §5.3 | Ocupación por técnico o cuadrilla | Barras de visitas (en ruta, vencidas, próximos 7 días) y conteo de técnicos con ocupación alta | Falta el nombre visible (N6) |
| §5.3 | Áreas Facturación y Red | En su lugar, Suscriptores (base activa frente a suspendida) y Aprovisionamiento (instalaciones por cola), con contratos vigentes | Facturación y Red dependen de N1 y N4 |
| B4 | Hoy en agenda | No entregado; se conserva «Atención de campo» | Requiere una lectura de agenda que el inicio no hace hoy; pasa a Fase 2 |
| §9 | En móvil, atención antes que pulso | Pulso, luego atención y luego áreas; en escritorio la atención pasa a la derecha | El pulso se lee primero en todos los anchos; la cola precede a las áreas en el orden de lectura |
| §5.2 | — | Una fuente que responde sin permiso no compone su fila ni cuenta como fallo | El perfil de acceso puede negar lo que el rol permite |
| §5.1 (Fase 2) | Sparkline de 12 meses en Suscriptores activos | Neto del mes como señal y altas · retiros como frase; la mini visual sigue siendo activos frente a suspendidos; la serie de 12 meses vive en Tendencia › Suscriptores | El contrato DS de gráficas no define una mini serie y ADR-112 §3 descarta el SVG propio; se propone a DS-OWNER una variante de celda con serie |
| §5.1 (Fase 2) | Recaudo con `ProgressMeter` | `ProgressMeter compact` (solo la barra, variante aditiva de `@iwana/ui`) y el porcentaje real en la señal «N % de lo facturado»; por encima de lo facturado, solo la señal; sin facturas del mes, sin porcentaje | El rótulo y el porcentaje a 2rem de `ProgressMeter` alargaban la franja y la cola de atención salía del primer viewport (CA-PA-01, E2E de sr-qa); el recaudo es caja del mes (G1-4) y puede superar lo facturado |
| §5.3 (Fase 2) | Facturación: cartera por antigüedad + próximo ciclo | Cartera por antigüedad; el pie dice suscriptores en mora y facturas vencidas | N1 no trae el próximo ciclo y el inicio no lee `cutoff-agenda` para eso; añadirlo es otra fuente por área |
| §6 (Fase 2) | Contadora: pulso «recaudo, cartera, facturado, planes sin precio»; tendencia Recaudo; área Facturación | Pulso: recaudo (con lo facturado en la frase), cartera, suscriptores activos y planes sin precio; tendencia Recaudo y Suscriptores; áreas Facturación y Suscriptores | Ratificado por AI-EM-ARCH el 2026-11-17, pendiente de confirmación del CTO con la Contadora. Lo facturado no ocupa celda propia; Suscriptores activos y su área se conservan de la Fase 1 (destino de «datos fiscales incompletos»); la pestaña Suscriptores la fija el contrato DS §6 y HLD v3.0 §5 |
| §5.3 (Fase 2) | — | Administradora: Facturación sustituye a Suscriptores en las áreas; Red sigue sustituida por Aprovisionamiento | Cierra la desviación de la Fase 1 para Facturación; Red depende de N4 |
| §5.3 (Fase 2) | Badge de salud por área sin regla para Facturación | Facturación: «Al día» sin cartera vencida; «En riesgo» si hay saldo de más de 90 días; «Atención» en otro caso | Ratificado por AI-EM-ARCH el 2026-11-17 (revisión de pruebas de G6); el tramo de más de 90 días es la señal de mora que la dirección §5.1 ya destaca en el pulso |
