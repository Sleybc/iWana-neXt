# UX spec — Centro de mando del inicio del portal (`/dashboard` · banda B1b)

**Versión:** 1.2  
**Estado:** En revisión  
**Fecha:** 2026-09-04  
**Autor:** AI-PROD-UX (track UX) · ejecución FE AI-FE-PLATFORM  
**Alcance:** banda **B1b · Salud de la operación**, retiro del panel **Accesos rápidos** (B2b) y elevación visual (Foco de hoy + anatomía KPI). I-1…I-7 no se reabren.

**Entradas**

- Plan de dirección: centro de mando (KPIs de atención + franja de salud por módulo)
- [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](2026-08-04-portal-dashboard-recomposicion-ux-spec.md) — spec congelada del inicio; **no se parchea en silencio**. El delta de Accesos rápidos vive aquí (§11) y en adenda explícita al final de aquella spec
- [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) v2.0.4 — B1b en §2.1; Foco de hoy; CA-V2-01 versionado; endpoints nuevos siguen fuera
- Contrato DS hermano: [`2026-09-04-portal-dashboard-centro-mando-ds-contrato.md`](2026-09-04-portal-dashboard-centro-mando-ds-contrato.md)
- Skills: `iwana-identity-ui-review` (modo diseño) · `system-vocabulary-review` · `senior-ui-systems-designer`

**Qué es y qué no es.** Fija comportamiento, jerarquía, copy y criterios de la banda B1b. No define tokens ni API de componente: eso es del contrato DS hermano. No crea endpoints. Un dato que no exista **no se finge**.

---

## 1. Tarea que añade esta fase

El inicio ya responde «qué requiere mi decisión hoy» (B1 + B2). Falta responder «cómo está cada área de la operación» sin convertir el home en un mosaico de KPIs.

Dos gramáticas, dos preguntas:

| Banda | Pregunta | Anatomía |
| --- | --- | --- |
| B1 | Qué cifra me exige actuar ahora | `PortalDashboardMetric` · I-1…I-7 intactos |
| B1b | Cómo está cada módulo que puedo ver | Chip de salud · máximo una cifra de **señal** |

Ningún chip de B1b usa `PortalDashboardMetric`. Lima solo en el badge **Al día**. Urgencia = warning / error.

---

## 2. Arquitectura de información

Orden de lectura vigente, con B1b insertada:

B0 (identidad) → B1 (indicadores núcleo, si el rol tiene) → **B1b (salud de módulos, si el rol tiene chips)** → B2 / B2b → B3.

**Punto de corte del primer viewport (sin cambio de B1):** B0 + al menos dos indicadores de B1 cuando el rol los tiene. B1b puede quedar bajo el pliegue en administradora (7 KPIs). En roles con ≤4 indicadores, B1b empieza a verse a 1280 px.

**Reglas**

1. Un módulo no autorizado no se renderiza ni deja hueco.
2. Tope visual: **8 chips**. Si se supera, los chips de navegación sin cifra (`operations`) pasan a «Ver más módulos». No se recortan Programación, Mesa de ayuda, Comercial, Oportunidades, Inventario ni Configuración.
3. Vista base (talento humano, suscriptor, aliado, inversionista, auditor): **B1b ausente**. El auditor sigue con historial en B2b.
4. Suscriptores y Usuarios **no** entran en fase 1 (sin contrato reconciliable / métricas de cuenta fuera de indicadores núcleo).
5. Facturación no entra (sin contrato ni nav).

---

## 3. Inventario de chips (fase 1)

| ID | Rótulo visible (igual que el menú) | Fuente | Destino |
| --- | --- | --- | --- |
| `scheduling` | Programación | `GET /wfm/dashboard/summary` o **navegación** si el rol no está en el guard | Agenda o bandeja (ver §4) · técnico/contratista: `/dashboard/scheduling/agenda` |
| `help-desk` | Mesa de ayuda | `GET /assurance/dashboard/summary` | Lista con el filtro que reconcilia la señal |
| `commercial` | Comercial | `GET /commercial/dashboard/summary` | Planes sin precio o inicio comercial |
| `opportunities` | Oportunidades | `GET /crm/pipeline/summary` | Expedientes `view=open` |
| `inventory` | Inventario | `GET /inventory/dashboard` | `/dashboard/inventory` |
| `configuration` | Configuración | Alertas de `GET /tenants/me/summary` | `/dashboard/settings` |
| `operations` | Operaciones | **Ninguna** (sin contrato) | `/dashboard/operations` · estado **Sin dato** · sin cifra |

---

## 4. Derivación de salud

Prioridad no negociable: **En riesgo > Atención > Al día**. **Sin dato** no es un escalón de esa escala: es honestidad (error de fuente, o módulo sin contrato, o rol sin guard).

**Cifra:** solo cuando el estado es Atención o En riesgo. Al día y Sin dato **no** pintan número (evita una segunda retícula de KPIs y el techo de 9 cifras tipo KPI).

| Chip | En riesgo | Atención | Al día | Cifra (solo señal) | Href |
| --- | --- | --- | --- | --- | --- |
| Programación | `overdueCount > 0` o `pendingInbox.overdueSlaCount > 0` | `readyToScheduleCount > 0` o hay avisos | resto con fuente ok | vencidas si > 0; si no, atención vencida; si no, por programar | vencidas → agenda del día; SLA vencida o por programar → bandeja `READY_TO_SCHEDULE` |
| Mesa de ayuda | `breachedCount > 0` | `atRiskCount > 0` | resto con fuente ok | incumplidos o en riesgo | `slaBreachStatus=AT_RISK` si hay señal de riesgo/incumplimiento; si no, `status=OPEN` |
| Comercial | `offersAtRiskCount > 0` | `missingCurrentPriceCount > 0` | resto con fuente ok | la cifra del escalón activo | riesgo → `/dashboard/commercial`; precio → `tab=plans&missingPrice=1` |
| Oportunidades | — (sin SLA de expediente) | — | fuente ok | ninguna en fase 1 (I-7 ya es la cifra) | `view=open` |
| Inventario | — | `itemsCount = 0` o `totalOnHand = 0` | resto con fuente ok | existencias (`totalOnHand`) si Atención | `/dashboard/inventory` |
| Configuración | — | `alerts.length > 0` | resto con fuente ok | pendientes | `/dashboard/settings` |
| Operaciones | — | — | — | ninguna | `/dashboard/operations` siempre Sin dato |

**Cero falso:** si la fuente está en error o no llegó, el chip es Sin dato. Nunca se pinta `0` como Al día.

**Reconciliación (CA-V2-05):** el href del chip con señal debe abrir el mismo conjunto que la cifra, o el módulo entero cuando no hay filtro único (ofertas en riesgo, inventario, configuración, operaciones).

---

## 5. Composición por rol

Techo = autorización. La composición **reduce**, nunca amplía un guard.

| Rol (vocabulario de producto) | Chips B1b |
| --- | --- |
| Administradora | Programación, Mesa de ayuda, Comercial, Oportunidades, Inventario, Configuración, Operaciones |
| Monitoreo operativo | Programación, Mesa de ayuda, Inventario, Operaciones |
| Soporte inicial | Programación, Mesa de ayuda, Operaciones |
| Ejecutivo comercial | Comercial, Oportunidades, Operaciones |
| Contadora | Comercial |
| Técnico de campo / contratista | Programación (solo navegación, Sin dato) |
| Auditor, talento humano, suscriptor, aliado, inversionista | Banda ausente |

Operaciones aparece donde el menú ya la muestra. No dispara petición nueva.

---

## 6. Copy visible

Sentence case. Sin siglas internas (`WFM`, `NOC`, `OT`, `SLA` suelto), sin enums.

| Uso | Texto |
| --- | --- |
| Encabezado de banda | Salud de la operación |
| Estados | Al día · Atención · En riesgo · Sin dato |
| Vacío de banda (no aplica: la banda no se monta) | — |
| Error de franja | No pudimos cargar el estado de algunos módulos. Reintenta. |
| Control de overflow | Ver más módulos / Ocultar módulos |
| Técnico, Programación | El chip no promete «visitas de hoy»; el destino es «Ver mi agenda de hoy» vía href de agenda |

Nombre accesible del chip: `{rótulo}, {estado}` y, si hay cifra, `, {cifra}`.

---

## 7. Estados

| Estado | Comportamiento |
| --- | --- |
| Loading inicial | Esqueleto con forma de la franja (4 bloques `min-h-11`), `aria-busy` |
| Updating | Los chips conservan el último estado; B0 ya anuncia «Actualizando» |
| Error de una fuente | Ese chip = Sin dato; aviso de franja + Reintentar (reintenta las fuentes en error de B1b) |
| Error 401 / 403 | Mismos mensajes de negocio del home («Tu sesión expiró…» / «No tienes acceso a este resumen.») |
| Al día | Badge lima AA + enlace al módulo; sin cifra |
| Primera vez / catálogo vacío | Inventario en Atención con existencias 0, no un empty state aparte |

---

## 8. Responsive

- &lt; 768 px: 1 columna de chips
- 768–1279: 2 columnas
- ≥ 1280: 4 columnas
- Target táctil ≥ 44 px en el control entero
- Sin scroll horizontal del layout

---

## 9. Criterios de aceptación

| ID | Criterio | Cómo se verifica |
| --- | --- | --- |
| CA-CM-01 | B1b no usa `PortalDashboardMetric` | Revisión de código + test de primitive |
| CA-CM-02 | Lima solo en Al día | Test de badge `lime` vs `warning`/`error` |
| CA-CM-03 | Error de fuente ≠ cifra 0 | Test: WFM 500 → Programación «Sin dato» |
| CA-CM-04 | Administradora ve 7 chips en el orden de §5; Operaciones sin cifra | Jest DashboardClient |
| CA-CM-05 | Técnico no pide el resumen de campo; un chip Programación navega a la agenda | Jest: `wfm` no llamado + href agenda |
| CA-CM-06 | Vista base sin banda | Jest: talento humano sin «Salud de la operación» |
| CA-CM-07 | Foco visible en cada chip | Class-token `interactiveFocusClassName` |
| CA-CM-08 | Copy sin jerga interna | Revisión de vocabulario sobre textos renderizados |
| CA-CM-09 | Ningún rol ve el panel Accesos rápidos; B3 ofrece «Ver mi perfil» | Jest composición + DashboardClient + TenantSummaryCard |

---

## 10. Fuera de esta spec (fases 2–3)

Resumen de operaciones (órdenes de trabajo), resumen de suscriptores, resumen de campo acotado al ejecutor, medidor de configuración P-1, historial completo P-4, tablero de carga por técnico P-5. Requieren ampliar HLD §2.2 y consulta a backend / seguridad.

---

## 11. Adenda v1.1 — retiro de Accesos rápidos (2026-09-04)

B1b cubre la navegación a módulos que el menú ya ofrece. El panel Accesos rápidos duplicaba esa lista (más Usuarios, ya en el menú, y Mi perfil, ya en el menú de cuenta). **Se retira de los 12 roles.**

Sustituto, no panel: enlace de texto **«Ver mi perfil»** → `/dashboard/profile` en B3 (`TenantSummaryCard` junto a «Ver en configuración»; `IdentityOnlyCard` cuando no hay ficha operativa).

**CA-V2-01 versionado:** el mínimo ya no es «identidad + acceso rápido». Cada rol renderiza identidad de empresa (B3) y al menos un destino útil: B1b, un bloque de trabajo, historial, o el enlace de perfil en B3. La leyenda «Panel en preparación» sigue fuera del producto.

**B2:** si el rol no tiene bloques de apoyo, no se deja una columna vacía; el dominante ocupa el ancho.

**Copy:** «Ver mi perfil» · «Ver en configuración». Sin WFM, NOC, tenant ni enums.

---

## 12. Adenda v1.2 — elevación visual (2026-09-04)

No reabre I-1…I-7 ni B1b. Añade ritmo visual: cifra *title* en KPI compacto, deltas honestos, bloque **Foco de hoy** (ratio de contratos existentes + `ProgressMeter`) y avisos de campo como tabla-en-card.

Fuente: [`2026-09-04-portal-dashboard-elevacion-visual-design.md`](2026-09-04-portal-dashboard-elevacion-visual-design.md).
