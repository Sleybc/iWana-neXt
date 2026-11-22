# Dirección visual — Centro de control «Pulso de plataforma» (`apps/web`, `/dashboard`)

**Versión:** 1.1 · **Fecha:** 2026-11-21 · **Estado:** Aprobado — G0 2026-11-21 (D1 y D2). D3 aprobada 2026-11-21 con ADR-114; D4 la resuelve DS-OWNER en la Fase 1 · **Plan:** [2026-11-21-web-centro-control-pulso-plataforma.md](../plans/2026-11-21-web-centro-control-pulso-plataforma.md)
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

| Umbral | Valor | Estado y motivo |
| --- | --- | --- |
| Disponibilidad, tracker diario | Verde 100 %; ámbar ≥ 99 %; rojo < 99 % | Aprobado. Una muestra caída en el día marca «ese día pasó algo»; rojo desde unos 15 min caídos |
| Disponibilidad, celda de 30 días | Hoy igual que el tracker (`DEGRADED_FLOOR`) | prod-ux propone verde ≥ 99,9 %: con 100 % una sola muestra caída deja la celda en ámbar 30 días. **Decide el CTO**: el 99,9 % debe ser la disponibilidad que se promete a las empresas |
| Uso por empresa | Ámbar ≥ 90 %; rojo ≥ 95 % | Vigente, condicionado: vale si el cupo bloquea altas. Hoy `max_subscribers` no bloquea ninguna alta en CRM; si el exceso no bloquea, rojo debería empezar en 100 %. **Decide el CTO** |
| Espera en colas | ≥ 5 min del trabajo más antiguo; fallidos siempre | Aprobado. Cuenta solo `waiting` (no `delayed`), verificado en `platform-health-sampler.processor.ts:189-194` |
