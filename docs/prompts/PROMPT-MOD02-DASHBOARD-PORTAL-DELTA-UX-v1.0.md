# PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0

## Prompt de ejecución — delta UX residual del `/dashboard` del portal

**Versión:** 1.2 (opción 3 — Clase B + pista SEC-ENG AUDITOR)  
**Estado:** Emitido — autoriza implementación multiagente  
**Fecha:** 2026-08-11  
**Emite:** AI-EM-ARCH (modo Orchestrator)  
**Etapa del workflow:** delta post-G6 · protocolo v1.5 §3bis (tracks paralelos contra contratos)  
**Destinatarios:** AI-DS-OWNER (B) · AI-PROD-UX (UX) · AI-SEC-ENG (E, consulta bloqueante) · AI-SR-FULL (A) · AI-FE-PLATFORM (C) · AI-SR-QA (D)  
**Opción de alcance:** **3** — residual home + Clase B (Ver más inteligente, deep links historial) + pista seguridad AUDITOR (FE bloqueado hasta dictamen SEC)

> Sin prompt de ejecución no hay implementación (protocolo §3, G4). Lo que no está aquí no entra. **Clase A (anti-alcance)** permanece fuera: no borrar I-1…I-7, no fusionar cifras, no endpoints nuevos, no fachada, no npm, no tokens de marca, no migraciones, no rediseño de shell.

**Origen del encargo:** review UI AI-EM-ARCH 2026-08-11 + captura ADMIN (KPIs en 0): **tarjetas gemelas** (mismo eyebrow Operaciones/Mesa/Comercial ×2) como defecto dominante de escaneo. El delta **incluye** corregir ese defecto con **agrupación B1 por dominio**, no solo renombrar eyebrows.

**Plantilla de formato (en revisión):** [`TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md`](TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md) — destino obligatorio según `AGENTS.md` → Documentation Rules.

---

## 1. Declaración de contratos (protocolo §3bis)

| Contrato | Ruta | Versión / estado | Nota en este delta |
| --- | --- | --- | --- |
| **HLD** | [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) | v2.0.1 G1 firmado | Sin cambio |
| **UX spec** | [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) | v1.0 + **adenda B1 §A** (este prompt) | Re-sync composición B1 |
| **DS contrato** | [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) | **v1.3 — Congelado** (2026-08-11, [DS-OWNER](f16e14a3-6316-485f-a1c1-bb8b9a40f79d)) | `eyebrow` opcional + grupo B1 |
| **Informe recomposición** | [`INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) | v1.0 G6 GO | Actualizar §10 al cerrar |
| **ADR-075** | capas z | Aprobado | Sin cambio |

**API tipada:** sin endpoints nuevos. Ampliar `@Roles` de `GET /audit-logs` **solo** tras GO de pista E (AI-SEC-ENG).

### Adenda UX §A — B1 por dominio (autorizada por AI-EM-ARCH 2026-08-11)

Sustituye, **solo para la banda B1**, la lectura de «retícula plana de N cards iguales» en UX §2.2 / §3 / §4.3 cuando el rol tiene **dos o más indicadores del mismo dominio**. El resto de la UX spec (B0, B2, B2b, B3, estados, roles, accesos) permanece vigente.

**Dominios canónicos y membresía (no se inventan indicadores):**

| Dominio (rótulo de grupo, una sola vez) | Indicadores |
| --- | --- |
| Operaciones de campo | I-1, I-2 |
| Mesa de ayuda | I-3, I-4 |
| Comercial | I-5, I-6 |
| Oportunidades | I-7 |

**Reglas:**

1. Cada dominio con ≥1 indicador autorizado del rol se renderiza como **un grupo**: encabezado de dominio + grid de métricas del grupo (1 o 2 columnas según cuántas haya).  
2. La **categoría no se repite** dentro de cada card del grupo: el dominio vive en el encabezado del grupo.  
3. Siguen existiendo **hasta 7 indicadores** (cifras/acciones/destinos); no se fusionan dos cifras en un solo valor ni se eliminan IDs.  
4. Roles con un solo indicador (p. ej. ACCOUNTANT → I-5): un grupo de un miembro, o card suelta equivalente — sin inventar hermanos.  
5. Roles sin indicadores: B1 ausente (sin cambio).  
6. Prohibido rellenar el hueco con KPI vacío o decorativo.  
7. AI-PROD-UX formaliza esta adenda en el archivo UX (sección breve «Adenda B1 — 2026-08-11») en el mismo ciclo; FE no espera ese archivo si este prompt + DS v1.3 ya están publicados.

### Adenda UX §B — «Ver más» inteligente (opción 3)

Cuando un bloque está en `foldedBlockIds` **y** su KPI asociado es > 0, ese bloque **sale del pliegue** y pasa a la columna de apoyo o bajo el dominante (orden: comercial si I-5|I-6 > 0; help-desk si I-3|I-4 > 0; inventory no tiene KPI en B1 — permanece plegable). El control «Ver más · N» solo cuenta lo que sigue plegado. AI-PROD-UX fija la frase exacta en la UX spec; FE implementa la regla determinista anterior si la frase aún no está.

---

## 2. Objetivo exacto

Cerrar P1 residuales + Clase B + pista SEC AUDITOR (condicionada) **e** eliminar «tarjetas gemelas» con B1 por dominio.

### Entra

| ID | Hallazgo | Severidad | Esfuerzo |
| --- | --- | --- | --- |
| D-P1-01 | Acciones B0 sin anillo de foco | P1 Accesibilidad | S |
| D-P1-02 | Copy «MFA no obligatorio» | P1 Vocabulario | S |
| D-P1-03 | B2 incompleto vs UX §4.2 / §4.5 | P1 UX | M |
| D-P1-04 | Tarjetas gemelas — **B1 por dominio** | P1 Usabilidad | M |
| D-P1-05 | «Ver más» oculta trabajo con KPI > 0 | P1 UX | S–M |
| D-QW-02 | Mini-cards anidadas en avisos de campo | P2 | S |
| D-QW-03 | Doble fetch de historial | P2 | S |
| D-QW-04 | «Ver más» con conteo N | P2 | S |
| D-QW-05 | `Programacion` → `Programación` | P2 | S |
| D-QW-06 | Estado duplicado en `TenantSummaryCard` | P3 | S |
| D-QW-07 | Historial: deep link al registro si hay ruta portal segura | P2 | M |
| D-SEC-01 | Historial para `AUDITOR` — pista E; FE tras GO SEC | P1 Seguridad/UX | M (condicionado) |

### No entra — Clase A (anti-alcance)

- Eliminar/fusionar I-1…I-7 · endpoints nuevos · fachada · npm · tokens de marca · migraciones · rediseño shell.  
- Página historial completo (UX P-4) — fase posterior; AUDITOR aprobado solo ve últimos N **sin** «ver todo».  
- Ampliar `@Roles` de auditoría **sin** dictamen SEC-ENG.

---

## 2bis. Pista E — AI-SEC-ENG · bloqueante solo para D-SEC-01

```text
[CONSULTA] bloqueante
De: AI-EM-ARCH → A: AI-SEC-ENG
Contexto: MOD02 delta UX v1.2 · HLD v2.0 §5.2 «AUDITOR / Actividad reciente = Por decidir»
  · UX §4.9 · HLD-DE-06 · código: apps/api/src/modules/audit/audit.controller.ts
  @Roles(UserRole.ADMIN, PlatformRole.SYSTEM_ADMIN)
Pregunta:
  1) ¿GO a incluir UserRole.AUDITOR en GET /audit-logs (solo lectura, mismo tenant JWT)?
  2) ¿Controles extra de sanitize/campos antes del home AUDITOR?
  3) Veredicto: GO | GO condicionado (controles) | NO-GO
Bloqueante para: D-SEC-01 y cambio @Roles. Resto del delta NO espera.
Registro: este §2bis · informe vivo §10.
```

| Dictamen | Acción |
| --- | --- |
| **GO condicionado (2026-08-11)** — [SEC-ENG](986c06de-ce31-42a5-a4ea-7bb9cde5a34d) | Controles: list +AUDITOR; export sin AUDITOR; sanitize read; FE minimizado; tests. **A-3 en curso** ([SR-FULL A-3](c88c2f63-bd6d-406f-9cd2-2a5e3c6db47a)). C-13 FE tras A-3. HLD §5.2 actualizado a Sí. |

---

## 3. Tracks concurrentes

### Track B — Design system (AI-DS-OWNER) — carril rápido, primero

Publicar **v1.3** del contrato DS (adenda breve; notificar FE/QA vía este prompt):

| # | Paso | Criterio de hecho |
| --- | --- | --- |
| B-1 | `PortalDashboardMetric`: ranura `eyebrow` pasa a **opcional**. Si se omite / string vacío → no se renderiza la ranura; el orden restante (cifra → rótulo → delta → descripción) se mantiene. Documentar en §1 | API tipada + test del primitive |
| B-2 | Receta **grupo de dominio B1**: encabezado de dominio con `.portal-eyebrow` / título de sección (una vez) + contenedor `grid` de hijos `PortalDashboardMetric` **sin** segundo shell tipo card-dentro-de-card (el grupo no es un `PortalPanel` con borde si eso anida superfices; preferir sección + gap, o un solo panel plano sin cards hijas con borde pesado — las métricas ya traen su shell) | Receta en contrato o skill references; FE la aplica |
| B-3 | Sin tokens de marca nuevos; sin lima en urgencia; contraste §1.7 intacto | audit-ui P0/P1 = 0 en `portal-ui` |

**Prohibido:** nueva primitive obligatoria distinta de extender `PortalDashboardMetric`; hex sueltos; `tailwind.config.*`.
**Nota RACI:** DS-OWNER congela contrato; **FE-PLATFORM escribe el código** del primitive (`portal-ui.tsx`).

### Track UX — AI-PROD-UX (paralelo)

| # | Paso |
| --- | --- |
| U-1 | Confirmar/ampliar Adenda B1 en archivo UX (ya iniciada) |
| U-2 | Redactar Adenda «Ver más inteligente» (§B) con copy del control |
| U-3 | Mapa mínimo entityType → ruta portal para D-QW-07 (solo rutas existentes; sin inventar pantallas) |

### Track A — Backend (AI-SR-FULL)

| # | Paso | Criterio de hecho |
| --- | --- | --- |
| A-1 | `buildOnboardingAlerts` — alerta `mfa-not-required`: título/desc sin sigla «MFA»; usar «verificación en dos pasos» | Copy de producto; test actualizado |
| A-2 | Revisar resto del builder: sentence case, sin jerga | Suite afectada en verde |
| A-3 | **Solo tras GO pista E:** ampliar `@Roles` en `audit.controller.ts` con `UserRole.AUDITOR` (+ controles que SEC exija); tests de autorización | D-SEC-01 backend |

**Prohibido:** A-3 sin dictamen SEC GO/GO-condicionado.

### Track C — Frontend (AI-FE-PLATFORM)

Arranca tras **B-1** publicado (o en paralelo con mock tipado `eyebrow?: string` acordado). C-6 es el corazón de D-P1-04.

| # | Paso | Cierra | Criterio de hecho |
| --- | --- | --- | --- |
| C-1 | Foco visible en todos los controles de `DashboardHeaderActions` | D-P1-01 | Tab + `focus-visible` en B0 |
| C-2 | Sync tests al copy A-1 | D-P1-02 | Cero «MFA no obligatorio» |
| C-3 | `HelpDeskBlock`: desglose `byPriority` / `byType` + enlaces | D-P1-03 | UX §4.2 |
| C-4 | `PipelineBlock`: desglose por estado abierto + vocabulario | D-P1-03 | UX §4.2 |
| C-5 | `FieldAttentionBlock`: enlaces, severidad, sin mini-card anidada, SUPPORT ≤ 3 | D-P1-03 · D-QW-02 | Lista accionable |
| C-6 | **B1 por dominio (obligatorio).** Implementar composición agrupada según Adenda UX §A + DS v1.3: | D-P1-04 | Ver CA-DELTA-06 |

**Detalle C-6 — composición:**

1. Introducir mapa de dominio en `dashboard-role-composition` (o helper local tipado): dominio → `metricIds[]` en orden estable.  
2. `DashboardClient` B1: en lugar de un único `grid` plano de `metricIds`, iterar **grupos** del rol (solo dominios con ≥1 métrica de `composition.metricIds`).  
3. Cada grupo: encabezado visible una vez (`Operaciones de campo` | `Mesa de ayuda` | `Comercial` | `Oportunidades`) + grid interno `grid-cols-1 sm:grid-cols-2` (1 col si un solo hijo).  
4. Cada `PortalDashboardMetric` del grupo: **sin `eyebrow`** (categoría ya en el grupo). Conservar `label`, `description`, `accent`, `icon`, `delta`, `href`/`onClick`, estados.  
5. Iconos **distintos** dentro del mismo grupo (I-3≠I-4, I-5≠I-6). Sugerencia:

| ID | Label (sin cambio de sentido) | Icono |
| --- | --- | --- |
| I-1 | Visitas de hoy | `CalendarClock` |
| I-2 | Solicitudes por programar | `ClipboardList` |
| I-3 | Casos abiertos | `LifeBuoy` / `Headset` / `Ticket` |
| I-4 | Casos en riesgo de incumplir | `AlertTriangle` |
| I-5 | Planes sin precio vigente | `HandCoins` / `Tag` |
| I-6 | Ofertas en riesgo | `Timer` / `Percent` / `PackageOpen` |
| I-7 | Oportunidades en seguimiento | `Users` |

6. Skeleton B1: respetar forma de grupos (no 7 bloques sueltos si el rol es ADMIN).  
7. Captura objetivo: **no** se leen tres pares de cards clonadas; se leen hasta cuatro bandas de dominio.

| C-7 | Unificar fetch `audit` (padre → hijo preferible) | D-QW-03 | Una petición |
| C-8 | «Ver más · N bloques» | D-QW-04 | Conteo visible |
| C-9 | Sidebar: `Programación` | D-QW-05 | Ortografía |
| C-10 | `TenantSummaryCard`: un solo canal de estado | D-QW-06 | Sin duplicar |
| C-11 | **Ver más inteligente (Adenda UX §B):** si I-5\|I-6 > 0 → `commercial-attention` fuera del pliegue; si I-3\|I-4 > 0 → `help-desk` fuera del pliegue; «Ver más · N» solo cuenta lo restante | D-P1-05 · D-QW-04 | Bloques con KPI>0 visibles sin clic extra |
| C-12 | `RecentActivityPanel`: deep link por `entityType`/`entityId` **solo** si U-3 / mapa local tiene ruta existente; si no, fila no enlazada (sin 404) | D-QW-07 | Sin destinos inventados |
| C-13 | **D-SEC-01 — solo tras GO pista E:** añadir `change-history` a composición AUDITOR; cablear fuentes `audit`; sin «ver todo» | D-SEC-01 | Condicionado |

**Skills:** `iwana-identity-ui-review` · `frontend-dev-guidelines` · `system-vocabulary-review` · primitives `portal-ui`.

**Prohibido:** inventar tokens; cards dentro de cards; lima = urgencia; KPI de relleno; tocar `@Roles` (eso es A tras SEC); tocar API salvo sync copy.

### Track D — Calidad (AI-SR-QA)

| # | Paso |
| --- | --- |
| D-1 | Unit: SUPPORT campo ≤ 3; ADMIN campo ≤ 5 |
| D-2 | Unit: HelpDesk / Pipeline con desglose |
| D-3 | Unit: FieldAttention accionable + severidad |
| D-4 | Unit: B1 ADMIN expone **4 encabezados de dominio** y **0** eyebrows de categoría duplicados en métricas; registry/composición tipada |
| D-5 | A11y: foco B0; axe light home |
| D-6 | E2E: home ADMIN — grupos de dominio visibles; sin título de alerta «MFA…»; «Ver más ·» |
| D-7 | Cobertura `components/dashboard` sin retroceso vs G6-4-R1 |

---

## 4. Restricciones transversales

- Multi-tenancy y Modulith intactos.  
- Cero PII. Español sentence case. Sin enums crudos.  
- Sin migraciones. Solo `pnpm`.  
- Evidencia con corrida real.  
- `audit-ui.mjs` en rutas tocadas → P0/P1 = 0.

---

## 5. Entregables

| Track | Entregable |
| --- | --- |
| B | DS contrato **v1.3** + cambio en `PortalDashboardMetric` / tests primitive |
| A | Copy MFA + tests API |
| C | Composición B1 por dominio + resto delta + tests |
| D | Evidencia jest/playwright + cobertura |
| PROD-UX | Párrafo «Adenda B1» en UX spec (mismo ciclo) |
| — | Actualizar §10 del informe vivo de recomposición (no duplicar informe) |

---

## 6. Criterios de aceptación (delta)

| ID | Criterio |
| --- | --- |
| CA-DELTA-01 | Foco visible en acciones B0 |
| CA-DELTA-02 | Alerta configuración sin sigla «MFA»; «verificación en dos pasos» |
| CA-DELTA-03 | HelpDesk usa `byPriority` y/o `byType` con enlaces |
| CA-DELTA-04 | Pipeline con desglose por estado abierto |
| CA-DELTA-05 | Campo accionable + severidad + sin card anidada; SUPPORT ≤ 3 |
| CA-DELTA-06 | **B1 ADMIN:** hasta 4 grupos de dominio; categoría de dominio **una vez** por grupo; métricas hijas sin eyebrow de categoría; I-1…I-7 siguen navegables; sin hueco «template» de 4+3 sueltos como lectura principal |
| CA-DELTA-07 | Un solo fetch de historial por carga ADMIN |
| CA-DELTA-08 | «Ver más» con N |
| CA-DELTA-09 | «Programación» en nav; B3 sin estado duplicado |
| CA-DELTA-10 | audit-ui P0/P1 = 0; cobertura sin retroceso; lint/typecheck en verde |
| CA-DELTA-11 | DS contrato publicado en **v1.3** con `eyebrow` opcional |
| CA-DELTA-12 | Bloques folded con KPI asociado > 0 no quedan ocultos tras «Ver más» (D-P1-05) |
| CA-DELTA-13 | Deep links de historial solo a rutas existentes (o fila no enlazada) |
| CA-DELTA-14 | Si SEC = GO: AUDITOR ve historial; si NO-GO: documentado y guard intacto |

---

## 7. Criterio stop / go

### Stop — `[BLOQUEO]` a AI-EM-ARCH

- Campo ausente en HLD §4.2.  
- Ampliar `@Roles` o endpoint.  
- Propuesta de **eliminar** indicadores del set I-1…I-7.  
- Primitive nueva distinta de la extensión B-1/B-2.  
- Contratos v1.3 / adenda UX contradictorios entre sí.

### Go

1. CA-DELTA-01…11 con evidencia (incl. captura ADMIN agrupada).  
2. P1 D-P1-01…04 cerrados.  
3. Informe vivo §10 actualizado.  
4. No anticipar G6.5/G7 (ADR-069).

---

## 8. Decisiones — no reabrir

| Asunto | Decisión | Quién |
| --- | --- | --- |
| G6 recomposición | GO; este delta es residual | AI-EM-ARCH |
| **Agrupación B1 por dominio** | **Entra** (Adenda UX §A + DS v1.3) | AI-EM-ARCH |
| **Ver más inteligente + deep links historial** | **Entran** (opción 3 / Clase B) | AI-EM-ARCH |
| **AUDITOR + audit-logs** | Pista E; FE/A-3 condicionados a SEC | HLD §5.2 / DE-06 |
| Cota I-1…I-7 | Se mantiene; cambia layout | AI-EM-ARCH |
| Fusionar dos cifras / página historial completa | Fuera (Clase A / P-4) | AI-EM-ARCH |
| Fan-out cliente | Se mantiene; deduplicar `audit` | HLD |

---

## 9. Orden sugerido

```text
B-1/B-2/B-3 ──► C-6 (B1 dominios) ─┐
A-1/A-2 ──► C-2                    ├─► D-* ─► informe §10
C-1, C-3, C-4, C-5, C-7…C-10 ─────┘
PROD-UX adenda archivo UX (paralelo)
```

Esfuerzo estimado: **~2–3 días-persona** (DS medio día + FE 1,5–2 + SR-FULL 0,5 + QA 0,5).

---

## Adenda de emisión

| Cambio | Fecha |
| --- | --- |
| v1.0 — delta P1 + quick wins; agrupación «fuera» | 2026-08-11 |
| v1.1 — agrupación B1 por dominio entra; DS v1.3; Adenda UX §A | 2026-08-11 |
| **v1.2 — opción 3: Ver más inteligente, deep links, pista SEC AUDITOR** | 2026-08-11 |

**Emitido / enmendado por AI-EM-ARCH el 2026-08-11.** Todo re-sync adicional de contrato se documenta como adenda a este prompt.
