# INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1

## Re-auditoría de identidad, UX y copy del `/dashboard` del portal — consolidación multiagente

**Versión:** 1.1
**Estado:** Parcialmente vigente — sucede a [v1.0](INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) (**superado**: auditaba el inicio pre-recomposición). El eje tarjetas/aire lo sucede [v1.2](INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md). Copy/a11y de nav y CTA de esta v1.1 permanecen cerrados.
**Fecha:** 2026-08-12
**Modo activo:** Orchestrator + Architect ([perfil AI-EM-ARCH v2.4](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) §2, Parte II)
**Autor consolidación:** AI-EM-ARCH
**Etapa del workflow:** 6 — review de experiencia y calidad ([protocolo v1.5](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3, gate G6) + red de consulta §6.1
**Superficie:** `apps/portal` → `/dashboard` (home empresarial post-recomposición) y shell de layout (sidebar, header, menú de usuario)
**Agentes desplegados:** [AI-PROD-UX](c8357a66-9248-41c0-93f2-23e2ae58dffb) · [AI-DS-OWNER](5a28f40d-fff7-4f8e-9d9f-a1647002271d) · [AI-FE-PLATFORM](1d773d37-fe44-471d-8248-e2214885d8fc) (consulta §6.1)
**Skills:** `iwana-identity-ui-review` (modo review, disciplina rectora) · `ui-ux-pro-max` (subordinada) · `system-vocabulary-review` · `docs-architect`

**Relación con el informe vivo de recomposición:** [INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0](INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md) permanece el tracker de ejecución (G6 GO 2026-08-11). Esta pieza no lo reemplaza: es una re-auditoría de identidad y copy sobre el código ya entregado.

---

## 1. Resumen ejecutivo

El inicio del portal **ya es un centro de trabajo ISP**, no una ficha de cuenta. Frente a la auditoría v1.0 (puntajes 13 / 58 / 25, veredicto NO-GO), la recomposición sostuvo la tarea de la administradora: ver qué requiere decisión hoy y entrar a resolverlo. En 375, 768 y 1280 caben B0 con acción operable y al menos dos indicadores. Hay ≥2 elementos de firma con función (barra lima del ítem activo, sombra dual, par tonal lima «Al día», mono en cifras y hora). El lima no se usa como urgencia.

El riesgo de vocabulario del shell y de a11y local **quedó cerrado** el 2026-08-12 (remediación P1: nav, CTA `Button asChild`, `PortalNavListRow`, foco inline, B3, historial, U-R2bis). El lima no se usa como urgencia. Densidad U-D ya aplicada.

**Veredicto de gate G6 (re-auditoría identidad/copy): GO con cambios** (sesión de auditoría). **Remediación P1/P2/P3: aplicada** el mismo día. G6.5 / G7 no se anticipan.

---

## 2. Método y trazabilidad

### 2.1 Pregunta de cada agente (no se promedian)

| Agente | Pregunta | Puntaje | Veredicto |
| --- | --- | --- | --- |
| **AI-PROD-UX** | ¿Funciona como dashboard operativo ISP? | **81/100** | GO con cambios |
| **AI-DS-OWNER** | ¿Cumple el contrato del design system? | **77/100** | GO con cambios |
| **AI-FE-PLATFORM** | ¿Usa primitives, estados y responsive contratados? | **79/100** | Viable sin endpoints nuevos |

Puntaje consolidado de identidad (hallazgos deduplicados, fórmula de la skill): `100 − 20·0 − 10·3 − 3·4 − 1·3` = **64/100** (banda 50–74: requiere trabajo antes de un GO limpio; no requiere rediseño).

### 2.2 Evidencia

| Fuente | Resultado |
| --- | --- |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `components/dashboard` + `app/dashboard/page.tsx` + `layout.tsx` | 0 hallazgos (P0/P1/P2 deterministas) |
| Chrome DevTools `http://localhost:3002/dashboard` (2026-08-12 ~16:55) | **Sesión autenticada ADMIN.** Confirma P1 de nav/copy y añade hallazgos de dato real (B3, historial, alerta). Sin PII en este informe. |
| Capturas G6 rol ADMIN (baseline) | `docs/informes/evidencias/portal-dashboard-recomposicion/viewport-{375,768,1280}.png` · `firmas-iwana-1280.png` (2026-08-10) |
| Contratos abiertos | UX spec 2026-08-04 (v1.0 + adendas U-1/U-2/U-R2/R-A…R-D + **U-D densidad**) · DS contrato **v1.4** · spec Firma iWana · `globals.css` · `portal-ui.tsx` |

### 2.3 Fuera de alcance de esta re-auditoría

- No se reabre el tinte activo del sidebar (`bg-iwana-primary-50` + icono navy + barra lima): cumple el contrato DS §5.1. La receta skill (`iwana-surface-soft` + icono lima) queda como deuda de convergencia ya escalada (Firma §4 ítem 2.2). Aside blanco vigente; navy de sidebar Superado.
- No se reabre G6.5 / G7.
- Login (`/auth/login`) no es esta superficie; el heading concatenado «Iwana. SASPortal empresarial» se anota en Por verificar.

---

## 3. Hallazgos consolidados

### P0
Ninguno.

### [P1][Copy] El menú nombra distinto que el inicio

- **Evidencia:** `apps/portal/src/components/layout/Sidebar.tsx:74` «CRM» → `/dashboard/crm/expedientes`; el inicio usa «Oportunidades» (`dashboard-role-composition.ts:575-578`, `QuickActionsPanel.tsx:59-62`). `:76` «Programacion» (sin tilde) vs accesos rápidos «Programación». `:104-109` + `:180` Reportes deshabilitado con badge `Siguiente fase` y `uppercase` → se lee «SIGUIENTE FASE». La spec §4.14 ya retiró ese patrón de los accesos rápidos.
- **Impacto:** la administradora ve dos nombres para el mismo destino (UX-11). Reportes enseña a ignorar el nav.
- **Recomendación:** nav «Oportunidades», «Programación», «Usuarios y accesos». Retirar Reportes. Una sola fuente de labels.
- **Esfuerzo:** M (nav + E2E que esperen «CRM»).
- **Dueño:** AI-FE-PLATFORM. Copy lo fija AI-PROD-UX (ya propuesto).

### [P1][Accesibilidad] CTA de página reimplementa `Button` y pierde el par dark

- **Evidencia:** `DashboardClient.tsx:417-426` — `Link` con `bg-iwana-primary text-white hover:bg-iwana-primary-600` y `rounded-xl`. El CVA (`packages/ui/src/components/Button.tsx:29-30`) añade `dark:bg-iwana-primary-500 dark:hover:bg-iwana-primary-400` y `rounded-full`.
- **Impacto:** en oscuro el CTA de página no hereda el contraste contratado (SC 1.4.11).
- **Recomendación:** `<Button asChild variant="primary" className="min-h-11">` envolviendo el `Link`. Conservar `min-h-11` (`size="default"` es 40 px).
- **Esfuerzo:** S · **Quick win** · **Carril rápido DS**
- **Dueño:** AI-FE-PLATFORM.

### [P1][Accesibilidad] Filas de atención comercial sin foco visible

- **Evidencia:** `DashboardClient.tsx:776-778` — `Link` con borde/hover, **sin** `interactiveFocusClassName`. El bloque de campo sí lo lleva (`:574-576`). `PortalNavListRow` ya cablea el anillo.
- **Impacto:** teclado en el listado de I-6 / ventas / contadora sin anillo iWana.
- **Recomendación:** sustituir por `PortalNavListRow`.
- **Esfuerzo:** S · **Quick win** · **Carril rápido DS**
- **Dueño:** AI-FE-PLATFORM.

### [P2][Copy] «Bloque» en mensajes de error (y, tras desempate, en el control de pliegue)

- **Evidencia:** `DashboardClient.tsx:153`, `:1117` («este bloque»); control U-2 `:1443-1445` (`Ver más · N bloques` / `Ocultar bloques adicionales`), copy congelado en la adenda U-2.
- **Impacto:** jerga de composición en UI final (`system-vocabulary-review`).
- **Recomendación:** errores ya: «este resumen». Control de pliegue según [DESEMPATE] D-G6-1.
- **Esfuerzo:** S
- **Dueño:** AI-FE-PLATFORM tras versionar U-2 (PROD-UX).

### [P2][UX] «Configuración al día» mientras los conteos de universo son `unknown`

- **Evidencia:** `OnboardingAlerts.tsx:54-102` + `DashboardClient.tsx:264-284`. Spec §7.2: M2/M3 exigen conteos leídos.
- **Impacto:** parpadeo o falso «al día» si comercial/crm/inventario aún cargan o fallaron.
- **Recomendación:** con `unknown`, esqueleto o no renderizar; «al día» solo con conteos leídos.
- **Esfuerzo:** S
- **Dueño:** AI-FE-PLATFORM.

### [P2][Accesibilidad] Enlaces inline del inicio sin anillo de foco en el class-token

- **Evidencia:** `portal-ui.tsx:357-358` — `portalInlineTextLinkClassName` no incluye `interactiveFocusClassName`. Consumidores en vacíos, Reintentar y ficha de empresa.
- **Impacto:** foco de agente de usuario, no el anillo iWana.
- **Recomendación:** promover el anillo al class-token (DS, carril rápido) y componerlo en pantalla mientras tanto.
- **Esfuerzo:** S · **Carril rápido DS**
- **Dueño:** AI-DS-OWNER (contrato del token) + AI-FE-PLATFORM (aplicación).

### [P2][Estados] B3 no tiene loading ni error

- **Evidencia:** `DashboardClient.tsx:1483-1490` — sin tenant/settings pinta `IdentityOnlyCard` también en carga o fallo.
- **Impacto:** identidad parcial o error tragado, sin Reintentar.
- **Recomendación:** ramificar por `status` de `tenant-summary` / `tenant-me`.
- **Esfuerzo:** S
- **Dueño:** AI-FE-PLATFORM.

### [P2][Copy] B3 muestra códigos técnicos en vez de etiquetas de producto

- **Evidencia (vivo 2026-08-12):** ficha de empresa — zona horaria `America/Bogota`, país `CO`. `TenantSummaryCard.tsx:49-52` pinta `settings.timezone` y `settings.country` crudos.
- **Impacto:** el cierre de página habla IANA e ISO, no «hora de Bogotá» / «Colombia».
- **Recomendación:** etiqueta amigable; el código puede quedar en Configuración.
- **Esfuerzo:** S

### [P2][Copy] El historial cae al comodín «registro» y a «en usuario»

- **Evidencia (vivo):** «Creación en registro» e «Inicio de sesión en usuario». `audit-vocabulary.ts:75` fallback `'registro'`; `RecentActivityPanel.tsx` arma `{acción} en {entidad}`.
- **Impacto:** no se entiende qué se creó; «en usuario» suena a tabla.
- **Recomendación:** ampliar el mapa de entidad; usar `auditFeedSummary` (`acción · entidad`) o «Inicio de sesión» a secas.
- **Esfuerzo:** S

P3 agregados (pulido, no bloquean GO con cambios): badge Reportes con tracking ad hoc; título de `PortalAlert` con `.portal-eyebrow` → la alerta viva se lee en mayúsculas («VERIFICACIÓN EN DOS PASOS NO OBLIGATORIA»; el cuerpo sí evita la sigla MFA); rótulos de grupo del sidebar a mano; `roleToLabel` muerto; header «Administrador» / «Administrador»; atajo `⌘K` en Windows.

---

## 4. Copy visible — mapa antes → después

| Antes | Después | Notas |
| --- | --- | --- |
| CRM | Oportunidades | Mismo destino que B1 I-7 |
| Programacion | Programación | Tilde |
| Usuarios (nav) | Usuarios y accesos | Alineado a accesos rápidos |
| Reportes + «Siguiente fase» | Retirar el ítem | Spec §4.14 |
| No tienes permisos para este bloque. | No tienes acceso a este resumen. | No congelado |
| No pudimos cargar este bloque. | No pudimos cargar este resumen. | No congelado |
| Ver más · N bloques | N=1: título del resumen; N≥2: «Ver más · N resúmenes» | **Vivo:** «Ver más · 3 bloques» |
| America/Bogota | Hora de Bogotá (Colombia) | B3 |
| CO | Colombia | B3 |
| Creación en registro | Creación · {entidad} o «Cambio registrado» | Historial |
| Inicio de sesión en usuario | Inicio de sesión | Historial |
| Ocultar bloques adicionales | Ocultar resúmenes adicionales | Tras D-G6-1 |

El header de usuario ya usa `getPortalUserRoleLabel` (`AuthProvider.tsx:78-79`): NOC → «Monitoreo operativo», no el mapper muerto `roleToLabel`. Si nombre y rol se leen iguales («Administrador» / «Administrador»), es fallback de `displayName` al rol cuando no hay nombre de persona — residual P3, no reabre el diccionario.

---

## 5. Quick wins (orden de ejecución)

1. `Button asChild variant="primary"` en el CTA de B0 + `min-h-11`.
2. `PortalNavListRow` en atención comercial.
3. Anillo de foco en `portalInlineTextLinkClassName`.
4. Copy de errores: «bloque» → «resumen».
5. Nav: tilde de Programación + «Oportunidades»; retirar Reportes (puede ir en el mismo PR que 1–4 o en el de vocabulario).

---

## 6. Mejoras estratégicas

- Versionar adenda U-2 (copy del pliegue) y U-R2 (acciones B0 desde `md`) — ver desempates. No es carril rápido: toca spec congelada; lo versiona AI-PROD-UX y lo aplica AI-FE-PLATFORM.
- Convergencia del ítem activo del sidebar a `iwana-surface-soft` + icono lima: gate EM-ARCH, no este G6 (~25 páginas).
- Unificar labels de nav con el mapa §4.14 como fuente única (incluye E2E).

---

## 7. Desempates (consultas cerradas en esta sesión)

```
[DESEMPATE] Área RACI: UX (copy del control de pliegue U-2)
Posiciones: PROD-UX consulta si se versiona U-2 o se declara excepción de «bloque».
Decisión: se versiona U-2. No hay excepción de jerga de composición en UI final.
Justificación: system-vocabulary-review manda sobre un copy congelado que el usuario lee;
  «resumen» nombra la pieza de trabajo; N=1 usa el título ya visible del panel.
Registro en: este informe §4 y adenda U-2 a emitir por AI-PROD-UX.
```

```
[DESEMPATE] Área RACI: UX (matriz B0 U-R2)
Posiciones: U-R2 a 768 oculta la secundaria (cumple spec; tablet peor que teléfono).
  FE confirma que 768–1279 interpola esa fila (`md:hidden xl:flex`).
Decisión: se versiona U-R2. Desde `md` (768 px) aplica el patrón 1280:
  primaria + Actualizar + menú si hay secundaria. 375 se mantiene 1 + menú.
Justificación: «Programar visita» es una de las dos altas del ciclo ISP (spec §5.2);
  no se sacrifica en el viewport de tablet. No es bug de FE contra la spec vigente.
Registro en: este informe; adenda U-R2 a emitir por AI-PROD-UX.
```

```
[DESEMPATE] Área RACI: UI — contrato DS (ítem activo del sidebar)
Posiciones: receta skill firma #1 vs contrato congelado §5.1.
Decisión: no se reabre en este G6. La implementación sigue §5.1.
Justificación: el AA de lima-700 sobre primary-50 (4,49:1) es la razón del contrato.
  Convergencia = v1.4 del contrato + ítem 2.2 Firma §4, no un parche del home.
Registro en: dictamen DS-OWNER C-DS-G6-01; este informe §2.3.
```

**Class-token de enlace:** sí se añade `interactiveFocusClassName` a `portalInlineTextLinkClassName` (carril rápido DS-OWNER; FE aplica).

---

## 8. Densidad — contenedores sin función (vivo 2026-08-12)

Causa raíz única: **la cáscara reserva espacio que el contenido no llena**, y la retícula B2 **estira** la columna corta a la altura de la larga. No es falta de datos: con todos los KPI en 0 el inicio se lee como cajas vacías, no como «hoy no hay trabajo».

Postura iWana (spec Firma): *visualmente sobrio, interactivamente denso*. El color comunica estado, nunca adorno. R-D prohibió «comprimir tarjetas» para no meter B2 a costa de legibilidad; **no** prohíbe quitar hueco reservado a un sparkline que no existe. Compactar la métrica **aumenta** lo visible sobre el pliegue (más grupos + arranque de B2).

### 8.1 Cuatro contenedores que sobran

| # | Qué se ve | Causa en código / contrato | Qué hacer |
| --- | --- | --- | --- |
| 1 | KPI de ~148 px de alto con cifra, rótulo y descripción pegados a la izquierda e icono arriba a la derecha; el centro está vacío | `PortalDashboardMetric` fuerza `min-h-[148px]` (`portal-ui.tsx:555`). Firma §2.1 reservó «hueco para sparkline»; no hay gráfica. El target táctil ≥44 px no exige 148 px de cáscara | Anatomía compacta: cifra + rótulo + delta en una fila; `min-h-11` / ~88–96 px. Sin sparkline hasta que exista `Chart`. **Versionar DS §1 + R-D** |
| 2 | I-2 / I-4 / I-5 / I-6 tintados ámbar/rosa aunque el valor es 0 | `accent` es estático en el registro (`warning`/`danger`), no depende del valor. El tinte grita urgencia sin señal | `accent` warning/danger **solo si** `value > 0` o hay delta; si no, `neutral`. Lima sigue fuera. Carril rápido de estado, no de marca |
| 3 | «Oportunidades» es una sola card a todo el ancho, tan vacía como un banner | DS §1.8: «1 columna si un solo hijo». El hijo hereda el 12-col del lienzo | Grupo de un hijo: `max-w` de media retícula (`sm:max-w-[calc(50%-0.5rem)]`). No rellenar el hueco con un KPI fantasma (U-1 regla 7) |
| 4 | Hueco enorme a la izquierda, bajo «Ver más», mientras la derecha (configuración + historial + 8 accesos) es alta | `grid xl:grid-cols-12` estira ambas columnas a la misma altura (`align-items: stretch`). La columna 8 no tiene contenido que llene | `items-start` en esa retícula. **Carril rápido FE** |

### 8.2 Anidación (card dentro de card)

`PortalPanel` (`p-5`, borde, sombra, header con `border-b`) envuelve `PortalEmptyState` (otro `rounded-2xl` + borde + `iwana-surface-soft`). Receta §3 / §5: un vacío no lleva pozo interior. El panel **es** el vacío, o el vacío sustituye el cuerpo sin segunda cáscara.

Los 8 `PortalNavListRow` de accesos rápidos (título + meta + flecha, `min-h-11` cada uno) convierten B2b en una lista más alta que el trabajo del día. Recortar meta a `sr-only` / una línea, o tope de 5 destinos + «Ver más» del mapa §4.14.

B3 estira 4 campos a 12 columnas (`xl:grid-cols-4`): `America/Bogota` y `CO` flotan en un mar blanco. Definición compacta (`sm:grid-cols-2 lg:grid-cols-4` con `max-w-4xl`) + etiquetas de producto.

### 8.3 Desempate R-D

```
[DESEMPATE] Área RACI: UX / DS (densidad B1)
Posiciones: R-D «Prohibido comprimir tarjetas» vs. evidencia viva de cáscaras
  de 148 px sin sparkline y tintes de urgencia en cero.
Decisión: se versiona R-D. Se permite métrica compacta (sin hueco de sparkline
  hasta Fase de gráficas). Se mantienen I-1…I-7, agrupación por dominio U-1
  y el suelo de primer viewport (B0 + dos grupos). Se sigue prohibiendo
  volver a la retícula plana de 4 por fila y eliminar indicadores.
Justificación: iWana es denso; 148 px era reserva de una gráfica que no existe.
  Compactar no es el anti-patrón que R-D bloqueó (achicar para forzar B2).
Registro en: este §8; adenda UX U-D (2026-08-12) + DS contrato v1.4; prompt [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md).
```

### 8.4 Estado de ejecución (2026-08-12)

**Autorizado** en sesión. Aplicado en `apps/portal` (métrica compacta, acento condicionado, I-7 con `max-w` de media retícula, B2 `items-start`, vacío embebido, B3 etiquetas de producto, copy de pliegue/onboarding). P1 de nav/CTA/foco **no** entran en este delta.

### 8.5 Densidad real U-D2 (2026-08-12) — cerrado

U-D dejó anatomía póster `min-h-24` / `flex-col`. U-D2 versiona **solo el home B1** a fila operativa:

| Pieza | Resultado |
| --- | --- |
| Contratos | UX adenda **U-D2** · DS **v1.6** · [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md) |
| `PortalDashboardMetric` | prop `density?: 'default' \| 'compact'`; home `compact` (`min-h-14`, `flex-row`, `text-xl`); Assurance `default` |
| Gaps / paneles | home `space-y-4` / B2 `gap-4`·`gap-3`; `PortalPanel compact` solo consumidores del inicio |
| Accesos | máx. 5 + «Ver más»; meta `sr-only`; grid 2 cols |
| Verificación | Jest metric / portal-ui / QuickActions / RecentActivity / DashboardClient (**101** tests) · typecheck portal exit 0 · `audit-ui.mjs` sobre dashboard + portal-ui + layout: **P0/P1 = 0** (1 P2 heurístico lima-50 en chip de filtro, fuera del home) |
| Evidencia viva | Home autenticado: KPI medidos **56 px** (`min-h-14` + `flex-row` + `rounded-2xl`); 4 grupos B1; B2 con `top` ≈ 584 px dentro del viewport; accesos = 5 + «Ver más · 3 accesos»; metas con clase `sr-only` |

**Fuera de alcance intacto:** §5.1 sidebar · `PortalMetricCard` 148 px · tokens de marca · Assurance densificado.

---

## 9. Por verificar

1. Tema oscuro del CTA de B0 — cubierto por CVA `dark:bg-iwana-primary-500` (Jest C-R4); captura dark autenticada sigue pendiente.
2. Login: heading «Iwana. SASPortal empresarial» (fuera de `/dashboard`).
3. Primer viewport a 1024 px (`lg`) no tiene captura propia; se infiere de Tailwind y de U-R2bis.

---

## 10. Veredicto

**Aprobada con cambios.** Bloqueantes de copy/a11y: los tres P1. **Riesgo dominante de identidad ahora: densidad** (§8). El G6 de recomposición no se revierte; el delta de densidad exige adenda UX + bump DS §1 (métrica compacta, acento condicionado al valor, I-7 sin full-bleed) y un arreglo FE de `items-start` (carril rápido).

**Siguiente acto:** densidad real **U-D2 aplicada** (DS **v1.6**, home fila `min-h-14`). Remediación P1/P2/P3 **cerrada**. Fuera: convergencia ítem activo sidebar (§5.1), login heading, G6.5/G7.

---

## 11. Remediación P1/P2/P3 (2026-08-12)

Autorizada en sesión («corrige todo»). Protocolo: AI-PROD-UX (adenda U-R2bis/U-NAV) · AI-DS-OWNER (DS v1.5) · AI-FE-PLATFORM (código) · AI-SR-QA (Jest + typecheck).

| Hallazgo | Estado |
| --- | --- |
| P1 nav CRM / Programacion / Reportes | **Cerrado** — Oportunidades, Programación, Usuarios y accesos; Reportes retirado |
| P1 CTA B0 | **Cerrado** — `Button asChild variant="primary"` + `min-h-11` (par dark CVA) |
| P1 filas comerciales | **Cerrado** — `PortalNavListRow` |
| P2 unknown «al día» | **Cerrado** — esqueleto; no se afirma al día |
| P2 foco inline | **Cerrado** — class-token + `interactiveFocusClassName` |
| P2 B3 loading/error | **Cerrado** — esqueleto / Reintentar |
| P2 historial «registro» / «en usuario» | **Cerrado** — `auditFeedSummary`; LOGIN sin entidad |
| P2 U-R2 768 | **Cerrado** — U-R2bis: desde `md` = patrón 1280 |
| P3 PortalAlert uppercase | **Cerrado** — título sentence case |
| P3 header duplicado | **Cerrado** — `subtitle` vacío sin nombre de persona |
| P3 ⌘K en Windows | **Cerrado** — `Ctrl+K` fuera de Apple |
| P3 `roleToLabel` muerto | **Cerrado** — eliminado |
| P3 grupos sidebar | **Cerrado** — «Menú» / «Administración» sentence case |

Evidencia QA: Jest 117+4 (NotificationBell) en verde; `tsc --noEmit` `@iwana/portal` exit 0.

## 12. Densidad real U-D2 (2026-08-12)

Autorizada en sesión (plan «Densidad real dashboard»). Protocolo: contratos PROD-UX/DS-OWNER · FE home `density=compact` · QA Jest + typecheck + audit-ui.

| Criterio | Estado |
| --- | --- |
| UX-D2-01 fila `min-h-14` | **Cerrado** — DOM vivo altura 56 px; Jest U-D2 |
| UX-D2-02 description idle omitida | **Cerrado** — home no pasa description en idle |
| UX-D2-03 sin póster `flex-col` en home | **Cerrado** — `flex-row` + Assurance `default` intacto |
| UX-D2-04 primer viewport + B2 | **Cerrado** — B2 visible bajo B1 (evidencia DOM) |
| UX-D2-05 cero sin urgencia | **Cerrado** — herencia U-D / Jest |
| UX-D2-06 accesos tope 5 + Ver más / meta sr-only | **Cerrado** |
| UX-D2-07 gaps ≤ gap-4 / space-y-4 | **Cerrado** |
| UX-D2-08 contratos U-D2 + DS v1.6 | **Cerrado** |
| audit-ui P0/P1 | **0** |

Evidencia QA U-D2: Jest **101** (5 suites) · typecheck portal exit 0 · audit-ui P0/P1=0.
