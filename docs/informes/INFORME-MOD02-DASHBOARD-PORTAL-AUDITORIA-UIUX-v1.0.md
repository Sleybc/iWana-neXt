# INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0

## Auditoría UI/UX del `/dashboard` del portal de tenant — consolidación multiagente

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-08-04
**Modo activo:** Architect + Orchestrator ([perfil AI-EM-ARCH v2.3](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) §2)
**Autor:** AI-EM-ARCH
**Etapa del workflow:** 6 — review de experiencia y calidad ([protocolo v1.5](../roles/Protocolo_Colaboracion_Multiagente_v1.md) §3, gate G6) + red de consulta §6.1
**Superficie auditada:** `apps/portal` → `/dashboard` (home del panel empresarial) y su shell de navegación
**Agentes desplegados:** AI-DS-OWNER · AI-PROD-UX · AI-SR-QA · AI-FE-PLATFORM
**Decisión de alcance:** el CTO aprobó en esta sesión el **escenario (b) — recomposición con datos existentes**

---

## 1. Resumen ejecutivo

El `/dashboard` del portal es la pantalla de entrada diaria de un ISP multi-tenant. Su tarea principal debería ser *«al empezar mi turno, ver qué está en riesgo o vence hoy y entrar a resolverlo»*. **Hoy no la sostiene**: es una ficha de estado de la cuenta. El primer viewport no ofrece ninguna acción operativa, las tres métricas visibles son de administración de la cuenta (usuarios activos, eventos de auditoría de 7 días, alertas de configuración) y **nueve de los doce roles del tenant reciben la leyenda «Panel en preparación»** pese a que el backend ya les autoriza datos operativos.

El riesgo dominante no es de ejecución, es de **encuadre**: la pantalla implementa correctamente un HLD que quedó desfasado del producto. [`HLD-MOD02-DASHBOARD-EMPRESA-v1.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) **(en revisión)** está fechado el 2026-03-17 y describe un portal de dos rutas; el portal real tiene hoy 25 páginas bajo `/dashboard`. Lo que la auditoría encuentra es la distancia entre ambos.

Sobre identidad, el veredicto es más duro de lo que sugiere el código: la pantalla **no exhibe ni uno de los nueve elementos de firma con función real**. El dúo azul noche → lima, que la [spec Firma iWana](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) declara ancla diferencial como codificación de estado y avance, está ausente — y donde el lima sí aparece, adorna una métrica neutra en vez de comunicar avance. Sin logo, esta pantalla no se reconoce como iWana.

La causa raíz técnica es única y barata de enunciar: **el directorio `components/dashboard/` no importa una sola primitive de `portal-ui.tsx`**, mientras `PortalPanel` acumula más de cincuenta consumidores en el mismo app. Cinco patrones están reimplementados a mano, y de esa reimplementación se derivan el fallo P0 de contraste en tema oscuro, la ausencia de regiones vivas y la ausencia de firma. La superficie más visitada del producto es la que menos contrato cumple.

**Veredicto de gate G6: NO-GO condicionado.** Cuatro bloqueantes, tres de ellos de esfuerzo S.

---

## 2. Método y trazabilidad

### 2.1 Agentes desplegados y su pregunta

| Agente | Dominio | Pregunta que respondió |
| --- | --- | --- |
| **AI-DS-OWNER** | Contrato del design system | Tokens, primitives duplicadas, elementos de firma, candidatos a contrato nuevo, carril rápido vs. gate |
| **AI-PROD-UX** | El qué y el flujo | Tarea principal, arquitectura de información, vista por rol, estados de experiencia, onboarding, responsive |
| **AI-SR-QA** | Verificación | WCAG 2.2 AA con ratios calculados, fidelidad a la Estrella Polar por dominio, gap de trazabilidad criterio↔test |
| **AI-FE-PLATFORM** | Factibilidad (consulta §6.1) | Deuda de arquitectura frontend, datos disponibles, reutilización, patrón de fetching, costo por escenario |

### 2.2 Skills aplicadas

`iwana-identity-ui-review` (disciplina rectora, modo review) · `core-components` · `tailwind-patterns` · `wcag-audit-patterns` · `nextjs-app-router-patterns` · `frontend-dev-guidelines` · `e2e-testing-patterns` · `system-vocabulary-review` (derivación) · `ui-ux-pro-max` (subordinada).

### 2.3 Evidencia mecánica

```
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs \
  apps/portal/src/components/dashboard apps/portal/src/components/layout \
  apps/portal/src/app/dashboard/layout.tsx
→ P0: 0 · P1: 0 · P2: 2 · P3: 0
```

**Deterministas:** 2, ambos confirmados abriendo la línea (hex de marca sin tokenizar). **Heurísticos:** 0 emitidos, luego 0 confirmados y 0 descartados.

Reglas duras que el script verificó y **pasan**: sin `dark:bg-gray-{700-950}`, sin `tailwind.config.*`, sin `z-9999+`, sin degradado de marca fuera de progreso, sin `bg-iwana-secondary-50` como fondo base, sin spinner como carga primaria.

> **Ampliación barata pendiente para el dueño de la skill** (no es hallazgo de esta pantalla): el script cubre `dark:bg-gray-*` pero **no** `dark:text-gray-500/600`, que [ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §2 regla 1 prohíbe con la misma fuerza. El hallazgo H-03 de este informe lo produjo el juicio humano, no el script.

### 2.4 Nota de autoridad normativa

El HLD-MOD02-DASHBOARD-EMPRESA declara estado **«En revisión»** en su línea 7. Se cita en todo este informe con marcador **(en revisión)**, como referencia de intención y para reportar divergencias, **nunca como norma vinculante** (protocolo §7.4, convención de cita histórica de ADR-056 §5).

Defecto de trazabilidad detectado en el mismo acto: tres componentes citan *«HLD-MOD02-DASHBOARD-EMPRESA-v1.0 §2.2 (BT-DE-07/08/11)»*. Los tags `BT-DE-*` **no están en el HLD**: viven en [`PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md:59`](../sprints/PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md). Quien audite siguiendo la cita no encuentra el criterio. Registrado como H-18.

---

## 3. Los tres marcos de puntuación, y por qué divergen

Los tres agentes con potestad de puntuar entregaron cifras muy distintas:

| Agente | Puntaje | Denominador implícito |
| --- | --- | --- |
| AI-DS-OWNER | **58/100** | ¿Cumple el contrato del design system? |
| AI-SR-QA | **25/100** | ¿Es verificablemente accesible y fiel a la Estrella Polar? |
| AI-PROD-UX | **13/100** | ¿Funciona como dashboard operativo de un ISP? |

**No es una contradicción y no se promedia.** Cada cifra mide una pregunta distinta, y las tres son correctas dentro de su marco. La lectura conjunta es precisamente el hallazgo: la pantalla es *aceptable como ficha de cuenta*, *deficiente como contrato de sistema* e *inservible como centro operativo*. Un promedio habría borrado esa información.

**Decisión de este informe:** el puntaje que gobierna el gate G6 es el de **AI-SR-QA (25/100)**, porque la RACI §2 le asigna la R de *fidelidad a la Estrella Polar* y de *testing E2E, regresión visual y a11y*. Los otros dos se conservan como diagnóstico, no como gate. Ver `[DESEMPATE] D-2` en §5.

---

## 4. Hallazgos consolidados

Deduplicados por causa raíz sobre los cuatro dictámenes: donde tres agentes reportaron el mismo defecto desde ángulos distintos, hay **una** fila.

### 4.1 Bloqueantes

#### `[P0]` H-01 · El gradiente arbitrario claro no se neutraliza en tema oscuro

- **Evidencia:** `apps/portal/src/components/dashboard/DashboardClient.tsx:135`; `RecentActivityPanel.tsx:94`; `RecentActivityPanel.tsx:101`.
- **Mecanismo:** Tailwind infiere tipo `<image>` para un valor arbitrario `linear-gradient(...)` y emite `background-image`. Las clases `dark:bg-red-900/20` y `dark:bg-dark-surface-3` emiten `background-color`. La imagen se pinta **encima** del color: en tema oscuro el fondo sigue siendo el degradado claro. En todo `apps/portal/src` hay exactamente tres usos de `bg-[linear-gradient` — los tres son estos — y **cero usos de `dark:bg-none`**: la neutralización no existe en ningún sitio del portal.
- **Ratios resultantes en oscuro:** `dark:text-red-300` sobre `#FEF2F2` = **1,76:1**; `dark:text-red-400` (botón «Reintentar») = **2,65:1**; `dark:text-gray-300` sobre `#F8FAF5` = **1,40:1**. Umbral AA: 4,5:1.
- **Impacto:** el mensaje de error del dashboard y su **único camino de recuperación** son ilegibles para cualquier usuario en tema oscuro. El `ThemeToggle` está en el propio `TopHeader.tsx:88`.
- **Condición declarada:** el mecanismo es sólido pero no se renderizó la pantalla. **Verificación de treinta segundos:** `getComputedStyle($0).backgroundImage` sobre la card con `.dark` activo. Si se desmintiera, el hallazgo baja a P2 (valores arbitrarios sin tokenizar) y este informe se corrige antes de darse por cerrado.
- **Recomendación:** no parchear con `dark:bg-none`. Sustituir los tres bloques por `PortalAlert` (`portal-ui.tsx:1434`) y `PortalEmptyState` (`portal-ui.tsx:1524`), que resuelven superficie clara/oscura **y** la región viva de H-08 en el mismo cambio.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

#### `[P0]` H-02 · Nueve de los doce roles del tenant reciben una pantalla de inicio vacía

- **Evidencia:** `DashboardClient.tsx:81` (`const isAdmin = user?.role === 'ADMIN'`) y `:106` (`if (!isAdmin) return <RoleRestrictedView />`). El enum real tiene **12 roles** (`packages/shared/src/enums/user-role.enum.ts:15-26`: ADMIN, NOC, SUPPORT, SALES, TECHNICIAN, ACCOUNTANT, HR, SUBSCRIBER, CONTRACTOR, PARTNER, AUDITOR, INVESTOR — verificado directamente).
- **Contra los guards reales del backend:** `wfm.controller.ts:383-384`, `assurance.controller.ts:273-274` e `inventory.controller.ts:686-687` autorizan **NOC y SUPPORT** a los tres resúmenes operativos. La propia sidebar del portal ya abre Operaciones a NOC, SUPPORT, SALES, TECHNICIAN y CONTRACTOR (`Sidebar.tsx:81-88`).
- **Divergencia con su propio HLD (en revisión):** §5.2 especifica *«Resumen empresa: Sí»* para NOC, ACCOUNTANT y SUPPORT, y *«Alertas onboarding: Parcial»*. Lo implementado les da **cero**. **La implementación es más restrictiva que la especificación que dice cumplir.**
- **Impacto:** un técnico de campo o un agente de mesa de ayuda abre el portal cada mañana y su pantalla de inicio le informa de que su panel «estará disponible próximamente». El home es inútil para el grueso de la plantilla de un ISP.
- **Recomendación:** sustituir el gate binario por composición por bloque. El contrato ya existe: `GET /access-control/.../effective` (`access-control.controller.ts:173`). Mínimo inmediato: NOC y SUPPORT ven assurance + WFM, que ya tienen autorizados.
- **Esfuerzo:** M · **Dueño:** AI-PROD-UX (definición) → AI-FE-PLATFORM (implementación)

#### `[P1]` H-03 · Contraste AA roto en el sustituto del valor de KPI, en claro y en oscuro

- **Evidencia:** `MetricCard.tsx:53` — `text-gray-400 dark:text-gray-500` en el `<span>` que se lee **en lugar del número** cuando el valor es `null`. `MetricCard.tsx:59` — `text-gray-500 dark:text-gray-500` en la descripción.

  | Par | Ratio | Umbral | Veredicto |
  | --- | --- | --- | --- |
  | `gray-400` sobre blanco (claro, `:53`) | **2,60:1** | 4,5 | Falla |
  | `gray-500` sobre `dark-surface-2` `#222222` (`:53` y `:59`) | **3,29:1** | 4,5 | Falla |
  | `gray-500` sobre blanco (claro, `:59`) | 4,84:1 | 4,5 | Pasa |

  Texto de 14 px semibold: no califica como texto grande, aplica 4,5:1 (SC 1.4.3).
- **Por qué importa más de lo que parece:** ese texto es la mitigación del riesgo **HLD-DE-04**, declarado *Crítico* — mostrar «Sin datos» en vez de un número inventado. Se renderiza a 2,60:1. Se ejercita hoy en dos de las tres tarjetas (`DashboardClient.tsx:179`, `:188`).
- **Deslinde normativo, importante:** la mitad oscura ya está inventariada como deuda con dueño en spec Firma §4 ítem 1.2bis(b). **La mitad clara no lo está**: el ítem 1.2bis(d) solo declara que `dark:text-gray-400` pasa, y no dice nada del modo claro. Ese fallo es nuevo y no tenía dueño — por eso bloquea.
- **Recomendación:** `text-gray-500 dark:text-gray-400` (4,84:1 y 6,12:1), el piso fijado en [`2026-07-26-estados-atenuados-contraste-ds-contrato.md`](../specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md) §3.3; o resolverlo migrando a `PortalMetricCard`, que ya trae la gramática correcta.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

#### `[P1]` H-04 · El drawer mobile cerrado permanece en el orden de tabulación fuera de pantalla

- **Evidencia:** `Sidebar.tsx:264-269` — el `<aside>` se desplaza solo con `transform` (`max-lg:-translate-x-full`). Archivo recorrido íntegro: **nunca** recibe `hidden`, `inert` ni `aria-hidden` cuando `mobileOpen === false`.
- **Impacto:** en mobile, un usuario de teclado que pulsa Tab desde el botón hamburguesa atraviesa unos trece destinos invisibles antes de llegar al contenido, con el foco fuera del viewport. Incumple SC 2.4.3 (orden del foco), 2.4.7 (foco visible) y 2.4.11 (foco no oscurecido, nuevo en 2.2 AA). También son alcanzables por lector de pantalla.
- **Recomendación:** `inert` + `aria-hidden` sobre el `<aside>` cuando `!mobileOpen` por debajo de `lg`, o conmutar a `hidden lg:flex`.
- **Esfuerzo:** S · **Dueño:** AI-FE-PLATFORM

#### `[P1]` H-11 · Gap de trazabilidad criterio ↔ test, con cero cobertura en tema oscuro

- **Suite actual:** `e2e/tests/portal-dashboard-empresa.spec.ts` (7 tests, CA-01…CA-06, todo mockeado con `page.route()`), `QuickActionsPanel.spec.tsx` (2), `Sidebar.spec.tsx` (5), `layout.spec.tsx` (1, solo `document.title`).
- **Componentes sin ningún spec** (listado de directorio completo): `DashboardClient`, `MetricCard`, `OnboardingAlerts`, `RecentActivityPanel`, `TenantSummaryCard`, `DashboardPanel`, `PageHeader`, `TopHeader`.

  | Criterio | Estado |
  | --- | --- |
  | Widgets cambian según rol sin exponer no autorizado (PRD §9.5) | **GAP** — `RoleRestrictedView`, la rama con más lógica de gating, no tiene ni unit ni E2E |
  | **HLD-DE-04** (riesgo *Crítico*): `null` en vez de números ficticios | **GAP frontend** — solo cubierto en backend (`tenant-self.spec.ts:240`). La rama `value === null → emptyLabel` no tiene test, y es justo donde vive H-03 |
  | Contraste AA verificado en claro **y** oscuro | **GAP** — cero aserciones en tema oscuro, pese a que `@axe-core/playwright` ya está integrado en el repo |
  | Actividad reciente filtrada por tenant y permisos | **Parcial** — solo el caso positivo; el fallback silencioso ante 403 (`RecentActivityPanel.tsx:63-66`) no se ejercita |

- **La lección operativa de esta auditoría, en una frase:** *la pantalla no tiene una sola aserción en modo oscuro, y ahí es donde vive su peor defecto.*
- **Esfuerzo:** M · **Dueño:** AI-SR-QA

### 4.2 Importantes, no bloqueantes

#### `[P1]` H-05 · Cinco primitives reimplementadas a mano — causa raíz de cuatro hallazgos

`components/dashboard/` **no importa nada de `portal-ui.tsx`**; solo `Card`, `CardContent`, `Badge` y `cn` de `@iwana/ui`.

| Se construyó a mano | Existe como primitive (verificado) | Qué se pierde |
| --- | --- | --- |
| `DashboardPanel.tsx` completo | `PortalPanel` — `portal-ui.tsx:1334`, **50+ consumidores** | Divisor de header, `.portal-eyebrow`, `<h2>` (el local baja a `<h3>`), slot `actions` |
| `MetricCard.tsx` completo | `PortalMetricCard` — `portal-ui.tsx:371` | Cifra `font-mono`/`tabular-nums`, eyebrow, `interactiveFocusClassName`, acentos tokenizados |
| Card de error, `DashboardClient.tsx:135-152` | `PortalAlert` — `portal-ui.tsx:1434` | `role="alert"` + `aria-live` + `aria-atomic` y superficie oscura correcta |
| Vacíos, `RecentActivityPanel.tsx:101`, `OnboardingAlerts.tsx:46-59` | `PortalEmptyState` — `portal-ui.tsx:1524` | Superficie `iwana-surface-soft` ya normada, slot de acción |
| Skeletons, `DashboardClient.tsx:42,117,121,122` y `RecentActivityPanel.tsx:87` | `PortalSkeletonBlock` — `portal-ui.tsx:1550` | Cinco copias de la cadena literal del primitive |
| Fila de navegación, `QuickActionsPanel.tsx:60-80` | `PortalNavListRow` — `portal-ui.tsx:434` | Foco normado, gramática común |

**Arreglar esto cierra H-01, H-08, buena parte de H-12 y el agregado P3 de eyebrows.** Es la recomendación de mayor rendimiento del informe.

- **Esfuerzo:** M · **Dueños:** AI-DS-OWNER (contrato) + AI-FE-PLATFORM (código)

#### `[P1]` H-06 · El primer viewport no ofrece ninguna acción operativa

`DashboardClient.tsx:164-221` — el árbol completo son tarjetas de lectura y enlaces de navegación. `PageHeader` **acepta** `actions` (`PageHeader.tsx:23`) y el dashboard nunca lo usa. Ningún botón de negocio en toda la pantalla salvo «Reintentar» del estado de error. Contra el checklist de la skill: *«la primera vista muestra qué se puede hacer y dónde actuar»*. — **Esfuerzo:** S

#### `[P1]` H-07 · Los accesos rápidos llevan a error de permisos justo para quien los ve

`QuickActionsPanel.tsx:22-51` — la lista no tiene campo de rol, a diferencia de la sidebar, que sí lo tiene (`Sidebar.tsx:40`, `:143-153`). Y el panel se renderiza **dentro** de `RoleRestrictedView` (`DashboardClient.tsx:68`), es decir precisamente para los roles no ADMIN. `users.controller.ts:80` restringe la gestión de usuarios a ADMIN. La pantalla que dice «tu panel no está listo» ofrece atajos que tampoco funcionan. — **Esfuerzo:** S

#### `[P1]` H-08 · Estados de carga y error sin región viva ni gestión de foco

`DashboardClient.tsx:111-127` — la rama de carga completa no lleva `aria-busy` ni región viva; el `aria-busy="true"` solo existe en `MetricsSkeleton` (`:38`), que **en esa rama no se monta**. `DashboardClient.tsx:130-159` — la card de error no tiene `role="alert"` ni `aria-live`; tras pulsar «Reintentar» el botón desaparece, **el foco cae al `<body>`** y un segundo fallo no se anuncia (SC 4.1.3). Se cierra solo al adoptar `PortalAlert`. — **Esfuerzo:** S

#### `[P1]` H-09 · Identificador técnico crudo visible al usuario

`RecentActivityPanel.tsx:123-126` renderiza `en {entry.entityType}` directo, y `:45` (`return labels[action] ?? action`) deja escapar cualquier acción fuera de un diccionario de nueve entradas — mientras el `AuditInterceptor` global registra operaciones de todos los módulos. La línea que debería leerse *«Ana actualizó el plan Hogar 200 megas»* se lee como jerga de base de datos. **Derivar a `system-vocabulary-review`.** — **Esfuerzo:** S

> Contraste útil: `TenantSummaryCard.tsx:31` hace lo mismo pero su `Record` **sí** es exhaustivo sobre la unión de tipos, y el `?? status` es inalcanzable. Ahí no hay hallazgo. La diferencia es tipar el diccionario contra el dominio.

#### `[P1]` H-10 · El buscador global desaparece por debajo de 1024 px sin sustituto

`TopHeader.tsx:76` — `<div className="hidden lg:block ...">` es el **único** punto de montaje de `GlobalSearch`. El atajo de teclado existe pero no es descubrible ni utilizable en táctil, y su contenedor está en `display:none`. Es la vía de acceso más rápida del personal de campo. Regla dura de la skill: *acciones frecuentes ocultas o comprimidas en mobile*, severidad base P1. — **Esfuerzo:** S · Corresponde al shell, no al dashboard.

### 4.3 Identidad y sistema

#### `[P2]` H-12 · Cero de los nueve elementos de firma con función real

| Elemento de firma | Estado |
| --- | --- |
| 1 · Barra lima del ítem activo | **Ausente** — `Sidebar.tsx:196-198` resuelve el activo solo con tinte de fondo y color de texto. Además incumple SC 1.4.1: la única señal visual es el color |
| 2 · Sombra dual | Incoherente — `shadow-iwana-soft` aparece en los tres bloques de error/vacío, y **no** en `DashboardPanel.tsx:28` ni en `PageHeader.tsx:16`. Exactamente al revés de su semántica de reposo |
| 3 · Degradado de progreso azul → lima | **Ausente** — no hay ni un indicador de avance, teniendo `ProgressMeter` disponible y el dato de onboarding a mano |
| 4 · Par tonal lima de completitud | Presente en forma (`MetricCard.tsx:18`), ausente en función — ver H-13 |
| 6 · Mono técnico en cifras | **Ausente** en los KPIs (`MetricCard.tsx:49` usa `font-bold` sin `tabular-nums`); bien aplicado en el slug (`TenantSummaryCard.tsx:74`) |
| 8 · Badges generativos | Parcial — las pills «Fase siguiente»/«Siguiente fase» son grises ad hoc, no la fórmula del sistema, y el copy diverge para el mismo concepto |

Contra el criterio de la spec Firma §7 (*«≥2 elementos de firma presentes con función»*), **la pantalla no lo cumple**. Los dos que AI-DS-OWNER contabilizó como presentes viven ambos dentro de la misma card.

Del lado positivo y verificado: **cero anti-patrones de spec §5** — sin glass en superficies de datos, sin degradado de marca decorativo, sin bento, tres KPIs muy por debajo del techo de doce, sin neubrutalismo.

**El remedio de mayor rendimiento** es la barra lima del activo: cierra 1.4.1 y recupera el primer elemento de firma en el mismo cambio, con la receta ya escrita y congelada para `apps/web` en [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) §2. — **Esfuerzo:** S

#### `[P2]` H-13 · El lima usado como adorno, en la pantalla que enseña la gramática

`DashboardClient.tsx:189` asigna `tone="secondary"` — lima (`MetricCard.tsx:18`) — a **«Eventos de auditoría»**, una cuenta neutra que no es avance, éxito ni completitud. La spec Firma §3 es explícita: el color comunica significado, nunca adorno. La divergencia entró por la puerta que abre H-05: `MetricCard` define `tone?: 'primary'|'secondary'|'warning'`, un vocabulario paralelo al `PortalMetricCardAccent = 'neutral'|'primary'|'warning'|'danger'` del sistema (`portal-ui.tsx:303`), que deliberadamente **no ofrece** una casilla lima. — **Esfuerzo:** M, resuelto por la migración de H-05

#### `[P2]` H-14 · El fallo de un contrato borra el dashboard entero

`DashboardClient.tsx:130-159` sustituye toda la pantalla por un bloque de error; alertas, actividad y resumen desaparecen aunque sus fuentes estén sanas. **El backend ya hace lo correcto**: `dashboard-summary.service.ts:54-71` degrada por bloque con `Promise.allSettled`. Y el patrón correcto existe en el archivo vecino: `RecentActivityPanel.tsx:93-98` sí falla aislado. El HLD (en revisión) §6.4 exige registrar *«fallback de widgets no disponibles»* — observabilidad de un estado degradado que la UI no implementa. — **Esfuerzo:** M

#### `[P2]` H-15 · Dos hex de marca sin tokenizar

`MetricCard.tsx:49` (`text-[#17163A]`) y `TopHeader.tsx:68` (`text-[#17163a]`). El token existe: `--color-iwana-primary` en `globals.css:32`. Es el ítem **1.3** de spec Firma §4, con plan y dueño — **ya remediado en `apps/web` y sin remediar en la copia del portal**. — **Esfuerzo:** S

#### `[P2]` H-16 · Tres divergencias entre el contrato declarado y el runtime

1. **`summary.tenant` está incompleto.** `toTenantSelfDto` (`dashboard-summary.service.ts:207-223`) asigna 14 campos; el DTO declarado `TenantSelfResponseDto` (`dto/tenant-self.dto.ts:17-55`) tiene ~36, incluidos los 21 de branding. El frontend los tipa como `string | null`; en runtime llegan `undefined`. **Un rediseño que lea `summary.tenant.logoLightUrl` compila limpio y falla en silencio.**
2. `settings.fiberInstallationThresholdMeters` declarado `number`, nunca asignado por `resolveSettings` (`:226-239`).
3. `metrics.mfaCoverage` es campo muerto: hardcodeado a `null` con comentario del propio backend (`:77`), declarado en el contrato, nunca renderizado.

`[CONSULTA]` → **AI-SR-FULL**. Los tres son del contrato de API, no de la capa de presentación. El (1) es el peligroso: es un tipo que miente. — **Esfuerzo:** S–M (backend)

#### `[P2]` H-17 · Cascada de datos de cuatro niveles y dos peticiones duplicadas

| Nivel | Petición | Bloqueada por |
| --- | --- | --- |
| T1 | `authApi.me()` (`AuthProvider.tsx:110`) | montaje |
| T2 | `userApi.getMe()` (`:119`) | **secuencial tras T1**, evitable |
| T3 | `tenantSelfApi.getMe()` (`layout.tsx:79`) · `dashboardApi.getSummary()` | T1+T2 |
| T4 | `auditApi.list({ limit: 8 })` (`RecentActivityPanel.tsx:57`) | el panel solo se monta en la rama de éxito |

Duplicados: `/tenants/me` se pide dos veces (el layout directo, y embebido en el summary — `dashboard-summary.service.ts:84`); `/audit-logs` se pide dos veces (`NotificationBell.tsx:86` con `limit: 10`, `RecentActivityPanel.tsx:57` con `limit: 8`), lo que además permite que campana y panel discrepen. — **Esfuerzo:** S por cada deduplicación

#### `[P3]` H-18 · Trazabilidad rota entre código y artefacto

Ver §2.4. Tres componentes citan una sección del HLD que no contiene los tags que dicen citar. — **Esfuerzo:** S

### 4.4 Agregado P3

Presupuesto de atención de la skill: eyebrows manuales con **tres valores distintos de tracking** para un mismo concepto teniendo `.portal-eyebrow` en `globals.css:218` · `rounded-[24px]` donde `rounded-2xl` vale lo mismo · `aria-disabled` sobre elementos de rol genérico (ARIA inerte que aparenta cobertura) · el contador de accesos rápidos renderizado como quinta celda de la grilla en vez de pie del panel (`QuickActionsPanel.tsx:109`) · `z-35` fuera de escala materializada · cero tratamiento de `prefers-reduced-motion` en todo el repo de UI.

### 4.5 Por verificar

1. **H-01** — pendiente de confirmación en navegador (§4.1). Es el único hallazgo condicional del informe.
2. Contraste de las doce combinaciones del mapa de severidad local de `OnboardingAlerts.tsx:11-36` — no medidas porque la recomendación es eliminar el mapa entero en favor de `PortalAlert`. Si se decide conservarlo, hay que medirlas.
3. Supresión del anillo de foco del navegador: `globals.css` no resetea `outline`, luego el foco nativo sobrevive. No se verificó si alguna hoja del portal lo suprime en cascada.

### 4.6 Lo que se verificó y **no** es hallazgo

Se registra explícitamente para que una auditoría futura no lo reabra: **sí hay `h1`** (`PageHeader.tsx:18`, montado en las cuatro ramas de `DashboardClient`) · landmarks completos (`aside`/`nav`/`header`/`main` con etiqueta), y por ARIA11 la ausencia de enlace de salto **no** es fallo de 2.4.1 · el overlay mobile con `aria-hidden="true"` es correcto (sin texto ni focalizables) · el cierre del drawer por clic externo **sí** tiene equivalente de teclado (Escape), luego no hay fallo de 2.1.1, y el foco puede salir libremente, luego no hay trampa de 2.1.2 · `bg-iwana-surface-soft` en `QuickActionsPanel.tsx:88` es exactamente lo que el manual de identidad aprueba para cards operables, no una desviación · las cinco `<section aria-label>` de `DashboardClient` nombran correctamente sus regiones · el botón «Cerrar menú» de ~20 px **probablemente pasa** SC 2.5.8 por la excepción de espaciado, aunque falle la guía operativa de 44 px · `prefers-reduced-motion` es criterio **AAA** (2.3.3), no vinculante en 2.2 AA.

---

## 5. Desempates resueltos

```
[DESEMPATE] D-1
Área RACI: UI — contrato del design system (R: DS-OWNER) vs. UI — implementación (R: FE-PLAT)
Posiciones:
  · AI-DS-OWNER aprueba en carril rápido la consolidación de MetricCard → PortalMetricCard
    y DashboardPanel → PortalPanel en apps/portal.
  · AI-FE-PLATFORM invoca BLOQUEO-1 y BLOQUEO-2 de
    docs/specs/2026-07-20-web-dashboard-firma-fase1-contrato.md §7, que congelaron
    "no fusionar MetricCard" y "no unificar PanelCard/PortalPanel", y pide pronunciamiento
    explícito antes de proceder por analogía.
Decisión: procede la consolidación.
Justificación: ese contrato gobierna apps/web, no apps/portal — FE-PLATFORM lo señala
  correctamente y hace bien en no extenderlo por analogía. El pronunciamiento que pedía
  es el que AI-DS-OWNER emitió en esta auditoría. La cautela era correcta y queda satisfecha.
  Condición: la spec del contrato de componente se congela ANTES de tocar código
  (protocolo §3bis, contrato de componente).
Registro en: este informe §5 y §7.2.
```

```
[DESEMPATE] D-2
Área RACI: Fidelidad a la Estrella Polar (R: SR-QA) vs. contrato del DS (R: DS-OWNER)
            vs. UX (R: PROD-UX)
Posiciones: tres puntajes de la misma pantalla — 58, 25 y 13 sobre 100.
Decisión: no se promedian. Se publican los tres con su denominador declarado (§3);
  el que gobierna el gate G6 es el de AI-SR-QA.
Justificación: la RACI §2 asigna a SR-QA la R de fidelidad a la Estrella Polar y la de
  testing E2E/regresión visual/a11y. Los otros dos puntajes son diagnóstico válido dentro
  de su marco, y su divergencia es información —no ruido— que un promedio habría borrado.
Registro en: este informe §3.
```

```
[DESEMPATE] D-3
Área RACI: UI — contrato del design system
Posiciones: el lienzo de página usa bg-slate-50 (layout.tsx:120,157), familia ajena a las
  rampas iWana. AI-DS-OWNER se niega expresamente a resolverlo en carril rápido.
Decisión: la negativa es correcta y se ratifica. No se toca en esta fase.
Justificación: globals.css no declara ningún token de lienzo; iwana-surface-soft está
  definido como superficie de apoyo, no como canvas. Cambiar la superficie más grande del
  portal es lenguaje visual global — matriz de decisiones del perfil §5: no lo aprueba
  EM-ARCH. Escala al CTO (§6, escalación 1).
Registro en: este informe §5 y §6.
```

---

## 6. Escalaciones al CTO

```
[ESCALACION AL CTO] 1 — Token de lienzo del portal
Prioridad: Media (no bloquea la fase; bloquea cerrar la deuda de identidad del shell)
Contexto: bg-slate-50 en apps/portal/src/app/dashboard/layout.tsx:120 y :157 es la
  superficie más grande y más vista del producto, y el único elemento del sistema sin
  token. Verificado: globals.css no declara ningún token de canvas de página.
Opciones (máx. 3):
  A. Adoptar iwana-neutral-50 (token existente, globals.css:63) — cero tokens nuevos.
  B. Proponer --color-iwana-canvas como token nuevo de primer nivel.
  C. Aceptar la divergencia y documentarla.
Recomendación: A. Cierra el hueco sin ampliar la superficie de marca ni abrir un ADR
  de tokens; si más adelante el lienzo necesita identidad propia, B sigue disponible.
Decisión requerida antes de: cualquier fase de firma del shell del portal.
```

```
[ESCALACION AL CTO] 2 — Contrato de capas z
Prioridad: Media
Contexto: el portal usa hoy 11 valores de z distintos, 6 de ellos fuera de la escala
  Tailwind (z-35, z-[120], z-[1200], z-[1201], z-10000, z-10001). globals.css no declara
  ningún token --z-*. Nota de rigor: la escala "0/10/20/40/100/1000" que cita la skill
  iwana-identity-ui-review NO está materializada en ningún ADR aprobado ni en tokens;
  el hallazgo es la ausencia de contrato, no el valor concreto.
Opciones (máx. 3):
  A. Tokens --z-* semánticos (sticky/overlay/drawer/modal/toast) vía ADR.
  B. Fijar la escala en la skill y auditarla mecánicamente, sin tokens.
  C. Aplazar hasta que un incidente de superposición lo justifique.
Recomendación: A. Sin contrato, cada módulo seguirá negociando su propio número, y ya hay
  dos apps y overlays de terceros en juego.
Decisión requerida antes de: el próximo componente con overlay o drawer.
```

```
[ESCALACION AL CTO] 3 — coverageThreshold ausente en apps/portal
Prioridad: Alta (afecta a la ejecutabilidad de un gate, no a una pantalla)
Contexto: apps/portal/jest.config.js NO declara coverageThreshold (verificado);
  apps/api/jest.config.js:56 sí lo hace. Sin ese umbral, AI-SR-QA no puede ejercer en el
  portal el bloqueo por cobertura que la RACI le atribuye, y el gate 4 de protocolo §4
  (≥80% en core) es inexigible mecánicamente en toda la superficie frontend del tenant.
Opciones (máx. 3):
  A. Añadir coverageThreshold al portal (y auditar apps/web por simetría) — destinatario
     AI-PLAT-OPS.
  B. Declarar el portal fuera del gate de cobertura, con ADR que lo ampare.
  C. Dejarlo como está.
Recomendación: A. C es el estado actual y equivale a un gate declarado pero no ejecutable
  — el patrón que ADR-056 persigue: una afirmación con forma de evidencia que no la respalda.
Decisión requerida antes de: el siguiente cierre de fase que declare cobertura del portal.
```

```
[ESCALACION AL CTO] 4 — Sucesión del HLD-MOD02-DASHBOARD-EMPRESA
Prioridad: Alta (condiciona la recomposición ya aprobada)
Contexto: el HLD está "En revisión" desde 2026-03-17 y describe un portal de 2 rutas;
  el producto real tiene 25 páginas bajo /dashboard. La recomposición aprobada cambia el
  alcance funcional del home de "ficha de la cuenta" a "resumen operativo".
Opciones (máx. 3):
  A. Reabrir en etapa 1 con un HLD sucesor que refleje el portal real, y aprobarlo.
  B. Aprobar el HLD vigente tal cual y tratar la recomposición como cambio posterior.
  C. Ejecutar la recomposición contra la UX spec, sin tocar el HLD.
Recomendación: A. El protocolo §3 (Cambios tardíos) obliga a devolver a etapa 1 un cambio
  de alcance, no a parchearlo en implementación; y C dejaría dos artefactos contradictorios
  vigentes, que es el anti-patrón explícito del perfil.
Decisión requerida antes de: emitir el prompt de ejecución de la fase (G4).
```

```
[ESCALACION AL CTO] 5 — Sesión con cookie httpOnly (deuda estructural declarada)
Prioridad: Baja para esta fase; alta para la plataforma frontend
Contexto: el token de sesión del portal vive en localStorage (iwana.portal.access-token),
  y readStoredAccessToken() retorna '' en servidor. Ningún Server Component puede
  autenticar contra el API — documentado en el propio repo, en
  apps/portal/src/app/dashboard/users/page.tsx:9-17. Toda la plataforma frontend paga hoy
  la cascada cliente por esta restricción.
Recomendación: no abrirlo dentro de esta fase. Registrarlo como deuda estructural con
  dueño (consulta conjunta AI-SR-FULL + AI-SEC-ENG) y decidirlo en su propio ADR.
Decisión requerida antes de: cualquier iniciativa de rendimiento frontend que prometa
  data-fetching en servidor.
```

---

## 7. Lluvia de ideas

Tres capas, cada una del agente que tiene la R de su dominio. Las ideas **no** son compromisos de alcance: alimentan la UX spec de la recomposición aprobada.

### 7.1 Experiencia y flujo (AI-PROD-UX), por relación valor/esfuerzo

| # | Idea | Tarea que habilita | Dato necesario | Esfuerzo |
| --- | --- | --- | --- | --- |
| 1 | **Cada KPI es un enlace filtrado** — «tickets en riesgo de SLA» abre la mesa de ayuda ya filtrada, con el filtro en la URL | Pasar de detectar el problema a la lista de trabajo en un clic | Ninguno nuevo; el patrón de filtros en URL ya está aprobado | S |
| 2 | **Franja de acciones en la cabecera** con las tres creaciones frecuentes del rol | Iniciar el trabajo del día sin navegar | POST ya existentes por módulo | S |
| 3 | **Accesos rápidos filtrados por permiso efectivo**, ordenados por uso del rol | Evitar el 403 y reducir ruido | `access-control.controller.ts:173` — existe | S |
| 4 | **Actividad reciente legible y enlazada** — nombre de negocio en vez de tipo de entidad, con salto al registro | Auditar un cambio sospechoso sin abrir el módulo de auditoría | `entityType`/`entityId` existen; **faltan** `entityLabel`/`href` | S / M |
| 5 | **Seis o siete KPIs operativos** en lugar de las tres métricas de cuenta: visitas de hoy, vencidas, tickets abiertos, en riesgo de SLA, solicitudes por programar, ofertas por vencer | Leer el estado de la operación de un vistazo | WFM + assurance + comercial + inventario: **los cuatro existen** | M |
| 6 | **Bandeja «Hoy» como bloque dominante** — cola única ordenada por urgencia de lo que vence hoy | Triar y despachar el turno desde el home | `pendingInbox` y `alerts[]` de WFM, `atRiskCount`/`breachedCount` de assurance — existen | M |
| 7 | **Composición por rol en vez de gate binario** — NOC y SUPPORT ven assurance + WFM; comercial ve catálogo y ofertas; técnico ve su agenda | Que el home sirva a los nueve roles hoy excluidos | Permisos efectivos — existe | M |
| 8 | **Onboarding como progreso, no como lista** — checklist con la gramática de tres estados y barra de avance azul → lima, con un único siguiente paso destacado | Llevar al tenant nuevo a su primer valor de negocio, no solo a su configuración completa | `alerts[]` existe; **faltan** `completedSteps`/`totalSteps` | M |
| 9 | **Degradación parcial por bloque** — cada panel con su skeleton, su error y su reintento | Trabajar con lo que sigue disponible durante una caída parcial | Ninguno nuevo | M |
| 10 | **Ambiciosa · Tablero de despacho** — carga por técnico con utilización, retrasos y nivel de riesgo, y reasignación desde el propio dashboard | Reasignar antes de que se rompan los SLA, sin abrir Programación | `technicianLoad[]` con `utilizationPercent` y `riskLevel` **ya está calculado y publicado**; la reasignación rápida requiere verificar endpoint | L |
| 11 | **Ambiciosa · Ctrl+K que ejecuta, no solo navega** | Colapsar cualquier tarea frecuente a dos pulsaciones | Búsqueda global existe; las acciones son POST existentes. **Dependencia npm nueva → exige ADR** | L |
| 12 | **Ambiciosa · Dashboard componible** — orden y visibilidad por usuario, con preset por rol | Que cada perfil se quede con su vista de turno | **No existe** — requiere endpoint de preferencias | L |

Las tres ambiciosas comparten el mismo reencuadre: el home deja de ser el expediente de la empresa y pasa a ser el punto desde el que se ejecuta el trabajo del día. **La 10 es la de mayor retorno**, porque el dato más difícil —la carga real por técnico— ya está calculado y publicado; solo falta mostrarlo.

**Onboarding, respuesta directa:** hoy un tenant recién aprovisionado resuelve sus alertas de configuración y su dashboard queda **más vacío que antes** — sin alertas, sin actividad, con métricas en cero. El sistema le confirma que está configurado y nunca le dice cuál es su primer paso de negocio. La idea 8 cierra ese hueco.

### 7.2 Contrato del design system (AI-DS-OWNER)

| # | Idea | Ancla | Vía |
| --- | --- | --- | --- |
| 1 | **Regla de importación cerrada por superficie** — una pantalla del portal no define shells propios. Materializable como lint sobre `apps/portal/src/components/**` fuera de `shared/` | Cadena de promoción pantalla → `portal-ui.tsx` → `@iwana/ui` | Carril rápido |
| 2 | **`accent` como enum único del eje semántico** — hoy conviven cuatro vocabularios (`PortalMetricCardAccent`, `PortalAlertVariant`, `BadgeProps.variant` y el `tone` local que `MetricCard` inventó) | API pública de `@iwana/ui` | **Gate** |
| 3 | **El lima entra al contrato como predicado, no como color** — variante reservada a completitud/avance/acción, prohibida en props de acento genérico | Reglas semánticas del lima, spec Firma §3 | Carril rápido |
| 4 | **Tokens `--z-*` semánticos** | Ausencia verificable de contrato | **Gate → CTO** (§6) |
| 5 | **Contrato de canvas** | Hueco estructural: se tokeniza card, superficie suave y las cuatro superficies oscuras, pero no el fondo sobre el que todo se posa | **Gate → CTO** (§6) |
| 6 | **Fase-1 de firma del shell del portal**, espejo del contrato ya escrito para `apps/web` (barra lima, norma de sombras, foco normado) | Contrato del 2026-07-20, versionado a v1.1 con alcance portal | Carril rápido |
| 7 | **Norma de sombras por componente en el portal** — hoy `shadow-iwana-soft` aparece solo en paneles de error, al revés de su semántica de reposo | Tabla equivalente ya fijada para `apps/web` | Carril rápido |
| 8 | **La matriz de estados forma parte del tipo, no de la prosa** — cada contrato declara hover/focus/active/disabled/loading/empty/error/success/readonly con la casilla «no aplica» justificada | `MetricCard` es el caso de estudio: tiene `empty`, no tiene `loading` ni `error`, y nadie lo notó porque nunca hubo matriz | Carril rápido |

**Candidato principal a contrato nuevo:** `PortalDashboardMetric`, extendiendo `PortalMetricCard`, **con cero tokens nuevos**. API mínima: `label`, `value: number | null`, `emptyLabel`, `description?`, `accent` (reusando el enum del sistema, **sin casilla lima**), `icon`, `delta?` como badge tonal, `href?` para KPI accionable, `state: 'idle'|'loading'|'error'`; cifra en `tabular-nums`; estado de error que **no** desmonta la card.

### 7.3 Plataforma frontend (AI-FE-PLATFORM)

1. **Regla estructural anti-hex crudo** — test que falle ante `text-[#` / `bg-[#` en `apps/portal/src` y `apps/web/src`, con el molde ya probado de `components/shared/aria-busy-contrast.structure.spec.ts`. **Esfuerzo XS, máximo retorno de la lista**: convierte una regla de gobernanza en un gate ejecutable e impide la reintroducción.
2. **Hook compartido de orquestación de carga** (`Promise.allSettled` + `isRefreshing` + guarda de montaje + reintento + degradación por bloque). Elimina ~6 reimplementaciones del mismo bucle y le da al dashboard corrección de carrera y recarga silenciosa gratis. **Sin dependencias npm nuevas.**
3. **Deduplicar `/tenants/me`** con un proveedor de perfil de tenant en el layout, hidratado desde el summary. Elimina las dos fuentes de verdad.
4. **Deduplicar `/audit-logs`** entre la campana de notificaciones y el panel de actividad, que hoy pueden discrepar.
5. **Erradicar `animate-pulse` a mano** en favor de `SkeletonBlock`, con regla estructural que lo fije.
6. **Recuperar el borde servidor** — `export const metadata` (el `/dashboard` es **la única pantalla del portal sin él**; usa `document.title` imperativo en un efecto), `loading.tsx` de segmento, y pasar como slots los bloques sin hooks. Precondición: el título depende de branding del tenant, dato autenticado que un Server Component no puede leer hoy — decidir con PROD-UX si acepta título estático.

> **Capacidad pagada y no usada:** `next.config.ts:29` activa `cacheComponents: true` y **no hay una sola directiva `use cache` en todo el portal**. Salvedad honesta: con la sesión en `localStorage`, lo único cacheable con seguridad es el shell estático, nunca datos de tenant.

---

## 8. Veredicto de gate G6

**NO-GO condicionado.** La calidad no es aceptable para cerrar; es aprobable con cambios acotados.

| # | Bloqueante | Esfuerzo |
| --- | --- | --- |
| B-1 | **H-03, mitad clara** — `gray-400` sobre blanco a 2,60:1 en el texto que sustituye al valor de KPI. No depende de tema oscuro ni de confirmación en navegador, y **no está amparado** por la deuda declarada en spec Firma §4 ítem 1.2bis | S |
| B-2 | **H-04** — los ~13 destinos del drawer mobile cerrado, tabulables fuera de pantalla | S |
| B-3 | **H-02** — nueve de doce roles sin pantalla de inicio útil, con datos ya autorizados por el backend y contra la especificación del propio HLD | M |
| B-4 | **H-01 si se confirma** — error del dashboard a 1,76:1 en tema oscuro. Condicionado a una verificación de treinta segundos | S |
| B-5 | **H-11, mínimo exigible** — unit de `MetricCard` con `value: null`, unit del gating por rol, y un spec axe en claro **y** oscuro | M |

**Importantes, no bloqueantes:** H-05 a H-10, H-12 a H-17. H-08 se cierra automáticamente al adoptar `PortalAlert`, que es también el remedio de B-4.

**Deuda aceptable:** el agregado P3 de §4.4, los dos hex sin tokenizar (deuda ya planificada con dueño en spec Firma §4 ítem 1.3), y los `dark:text-gray-500` fuera de `MetricCard`, inventariados en el ítem 1.2bis(b).

**Condición de levantamiento:** B-1 y B-2 corregidos; B-4 confirmado y corregido o descartado con evidencia de navegador; B-3 resuelto al menos para NOC y SUPPORT; y B-5 en verde — el spec axe en tema oscuro es el que impide que esta clase de defecto vuelva a llegar a `main`.

**G6.5 y G7: no aplican.** No hay merge en curso ni release candidata. Se registran por separado conforme a [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) y no se reporta ningún avance hacia ellos.

---

## 9. Deuda registrada e instrumentación

### 9.1 Deuda por severidad al cierre de esta auditoría

| Severidad | Cantidad | Detalle |
| --- | --- | --- |
| **Crítica** | 0 | Ninguna deuda crítica abierta que exija escalación por acumulación (perfil §3.3) |
| **Alta** | 5 | B-1 … B-5 del gate G6 |
| **Media** | 13 | H-05 a H-10, H-12 a H-18 |
| **Baja** | 1 agregada | §4.4 |

Los cinco de severidad alta tienen dueño nombrado y esfuerzo estimado. **Ninguno se acepta como deuda**: son condición de levantamiento del gate.

### 9.2 Instrumentación de KPIs (perfil §11)

| KPI | Dato de esta fase |
| --- | --- |
| Conflictos entre agentes resueltos sin CTO | **3 de 3** (D-1, D-2, D-3) — 100% |
| Escalaciones al CTO emitidas | 5 (§6) |
| Consultas bloqueantes abiertas | 1 → AI-SR-FULL (H-16) |
| Fases con scope completado sin regresar a etapa 1–2 | **No aplica** — esta auditoría *concluye* que hay que regresar a etapa 1 (escalación 4). Es el resultado correcto, no un fallo del KPI |
| Latencia de gates | Sin instrumentar — auditoría de una sola sesión |
| Reescrituras de PRD/HLD | 1 propuesta (HLD-MOD02) |

### 9.3 Trabajo derivado (no producido en este acto)

Por decisión del CTO, esta auditoría entrega **un solo artefacto**. Queda pendiente, en este orden:

1. Decisión del CTO sobre las escalaciones 1–4 de §6 — la 4 (sucesión del HLD) es precondición de todo lo demás.
2. UX spec de la recomposición (AI-PROD-UX) y contrato de componente `PortalDashboardMetric` (AI-DS-OWNER), ambos localizables en `docs/specs/` y **congelados** antes de tocar código (protocolo §3bis).
3. Prompt de ejecución de fase en `docs/prompts/`, citando ambos contratos por ruta y versión. **Sin prompt de ejecución no hay implementación** (G4).

---

## 10bis. Resolución — actualización del 2026-08-04

Las cinco escalaciones de §6 se resolvieron el mismo día. Se registra aquí porque §9.3 dejaba el trabajo derivado como pendiente y esa lectura ya no es la vigente.

| # | Escalación | Decisión del CTO | Estado |
| --- | --- | --- | --- |
| 1 | Token de lienzo | Adoptar `iwana-neutral-50` (token existente) | Incorporado al contrato de componente |
| 2 | Capas z | Vía ADR — [ADR-075](../adrs/ADR-075-Contrato-Capas-Z-Portal.md), con **siete** escalones tras la enmienda | Pendiente de aprobación del CTO |
| 3 | `coverageThreshold` | Añadir al portal y auditar la consola | **Ejecutado** por AI-PLAT-OPS |
| 4 | Sucesión del HLD | Reabrir en etapa 1 | **Ejecutado** — [HLD v2.0.1](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md), con G1 firmado; el v1.0 queda **superado** |
| 5 | Cookie httpOnly | Sin decisión requerida — deuda estructural con fase propia | Registrado |

**Artefactos producidos tras la auditoría:** HLD v2.0.1 · ADR-075 · UX spec congelada · contrato de componente congelado · prompt de ejecución (G4 emitido).

### Hallazgos nuevos aparecidos al ejecutar, no presentes en esta auditoría

Los cuatro salieron de agentes que fueron a **verificar** una afirmación en lugar de citarla. Se registran como origen, aunque su seguimiento vive en otros artefactos.

| Hallazgo | Quién | Dónde se sigue |
| --- | --- | --- |
| **El límite de tasa global del API no está cableado.** El guard nunca se registra como guard global — `APP_GUARD` no aparece en todo el API — y tres documentos afirman un control de 100 req/min que no existe. Los decoradores de límite por ruta son metadatos inertes | AI-SR-FULL, confirmado de forma independiente por AI-EM-ARCH | `[ESCALACION AL CTO]` en HLD v2.0.1 §11 |
| **`collectCoverageFrom` no emparejaba ningún archivo** en el portal ni en la consola: el patrón exigía la extensión más un carácter extra. La cobertura se medía sobre `0/0`, así que **ningún umbral habría podido fallar**. El gate era más fantasma de lo que esta auditoría reportó | AI-PLAT-OPS | Corregido en el mismo acto |
| **La cifra de contraste del lima está mal en siete sitios.** `iwana-secondary-700` sobre blanco mide **4,76:1**, no 6,2:1; y sobre `iwana-primary-50` mide **4,49:1**, que **falla AA como texto**. No invalida la regla («usa `-700` para texto lima» sigue siendo correcto) pero sí una aplicación concreta | AI-DS-OWNER | Track B del prompt de ejecución |
| **`mfaCoverage` no era campo muerto por imposibilidad, sino por premisa caducada.** El comentario del backend decía «requiere módulo de usuarios con MFA por usuario»; esa columna existe hoy. El dato es computable con diez líneas | AI-SR-FULL | Track A del prompt de ejecución |

**Defecto propio corregido.** El HLD v2.0 que emití afirmaba derivar su matriz de visibilidad de los guards del backend, y **no lo hacía**: ocho de doce roles habrían recibido un error de permisos, y dos criterios de aceptación eran insatisfacibles. Lo detectó AI-SR-FULL en la firma de G1 y bloqueó. Es exactamente para lo que existe el review cruzado obligatorio de G1 cuando el productor del artefacto es quien lo aprobaría — el mecanismo funcionó sobre el artefacto de quien lo custodia.

---

## 10. Referencias verificadas

Todas abiertas y comprobadas antes de citarse (protocolo §7.4, ADR-056 §5).

- [`ADR-056`](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) — Aprobado. §2 (norma dark y las cuatro reglas de emparejamiento), §3 (los tres dominios de Estrella Polar), §5 (endurecimiento de la cita verificada)
- [`ADR-069`](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) — Aprobado. Registro separado de G6 / G6.5 / G7
- [`ADR-023`](../adrs/ADR-023-Referencia-TailAdmin-Shell-Dashboard.md) — Aprobado. Qué se toma del prototipo y de TailAdmin
- [`Protocolo_Colaboracion_Multiagente_v1.md`](../roles/Protocolo_Colaboracion_Multiagente_v1.md) v1.5 — §2 RACI, §3 workflow y gates, §3bis ejecución paralela, §5 conflictos, §6 red de consulta, §6.3 vocabulario de marcadores, §7.4 anti-alucinación
- [`Perfil_IA_EM_Architect_Unificado_v2.md`](../roles/Perfil_IA_EM_Architect_Unificado_v2.md) v2.3 — §2 modos, §5 matriz de decisiones, §8 bloqueos y desempates, §11 KPIs
- [`spec Firma iWana`](../specs/2026-07-12-firma-iwana-diseno-visual-design.md) — §3 elementos de firma y semántica del lima, §4 plan por fases (ítems 1.2bis y 1.3), §5 anti-patrones, §7 criterios de aceptación visual
- [`2026-07-20-web-dashboard-firma-fase1-contrato.md`](../specs/2026-07-20-web-dashboard-firma-fase1-contrato.md) — §2 barra lima, §7 BLOQUEO-1/2 (alcance `apps/web`)
- [`2026-07-26-estados-atenuados-contraste-ds-contrato.md`](../specs/2026-07-26-estados-atenuados-contraste-ds-contrato.md) — §3.3 piso de contraste atenuado
- [`HLD-MOD02-DASHBOARD-EMPRESA-v1.0`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md) **(en revisión)** — §5.2 matriz de visibilidad por rol, §6.4 observabilidad, §7.2 testing, riesgo HLD-DE-04
- [`PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md`](../sprints/PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md) — ubicación real de los tags `BT-DE-*`
- `packages/ui/src/styles/globals.css` — fuente primaria de qué token existe
- `apps/portal/src/components/shared/portal-ui.tsx` — inventario de primitives disponibles
- `.agents/skills/iwana-identity-ui-review/` — disciplina rectora, script mecánico y referencias
