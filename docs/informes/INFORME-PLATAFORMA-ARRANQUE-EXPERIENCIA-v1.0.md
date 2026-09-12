# INFORME — Plataforma · Experiencia de arranque e instalación

**Versión:** 1.1
**Estado:** **En curso — G1 cumplido; ejecución habilitada. No autoriza merge ni producción**
**Fecha de apertura:** 2026-08-09
**Última actualización:** 2026-08-09
**Modo activo:** Architect + EM + Orchestrator
**Autor:** AI-EM-ARCH
**Agentes ejecutores:** AI-PLAT-OPS · AI-SR-FULL · AI-FE-PLATFORM · AI-DS-OWNER · AI-PROD-UX · AI-SEC-ENG · AI-SR-QA
**HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md)
**ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md)
**Tablero vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

> **Este es un informe vivo.** Se abre con la definición del frente y se actualiza al cierre de cada fase. Al final consolida **G6, G6.5 y G7 por separado**, conforme a [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md): los tres responden preguntas distintas y ninguno se obtiene por cumplir el anterior.

---

## 1. Origen del frente

El CTO solicitó que ejecutar iWana neXt se pareciera a ejecutar UCRM de Ubiquiti: que el operador **sepa qué se está descargando y qué se está cargando**, con una superficie dinámica y presentable.

El diagnóstico previo confirmó tres huecos y una causa raíz:

| Superficie | Estado al 2026-08-09 |
| --- | --- |
| Terminal | Dashboard con estados por servicio, pero **sin contador de paso, sin porcentaje y sin visibilidad de la descarga de imágenes** — la fase larga de un arranque en frío es invisible |
| Navegador | **No existe nada.** La raíz redirige al panel; quien entra mientras la API compila ve un error crudo. En producción el proxy ni siquiera arranca durante las migraciones |
| Estado del sistema | Un único endpoint, diseñado para probes de contenedor. Sin superficie de preparación ni de arranque |

**Causa raíz:** el corpus **no tiene PRD ni HLD de instalación o primer arranque**. Sin definición, cada agente habría improvisado su propia noción de "arranque".

Lo que hace funcionar a la referencia externa no es el estilo del banner, sino dos invariantes que este frente adopta: **cada fase larga tiene señal de avance, y el cierre es accionable**.

---

## 2. Alcance aprobado

| Dimensión | Decisión |
| --- | --- |
| Superficies | Terminal **y** navegador |
| Entornos | Desarrollo local **y** on-premise de producción |
| Naturaleza | Frente **transversal de plataforma** — no es un módulo del roadmap, no dispara la Regla de Completitud de [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md) |
| Modo de entrega | AI-EM-ARCH define y delega; los agentes ejecutores implementan contra contratos congelados |

---

## 3. Corpus documental emitido — 2026-08-09

| Tipo | Artefacto | Estado |
| --- | --- | --- |
| HLD | [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) | Propuesto — requiere G1 del CTO |
| ADR | [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) | Requiere **G1 del CTO** |
| Prompt F0 | [Contratos](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F0-v1.0.md) | Emitido |
| Prompt F1 | [Terminal](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F1-v1.0.md) | Emitido |
| Prompt F2 | [API de estado](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F2-v1.0.md) | Emitido |
| Prompt F3 | [Pantalla](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F3-v1.0.md) | Emitido |
| Prompt F4a | [Proxy desarrollo](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F4A-v1.0.md) | Emitido |
| Prompt F4b | [Proxy producción](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F4B-v1.0.md) | Emitido — **fase cerrada, diferida** |
| Prompt F5 | [Instalador](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F5-v1.0.md) | Emitido |
| Prompt F6 | [Calidad](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F6-v1.0.md) | Emitido |
| Checklists | `docs/quality/CHECKLIST-PLATAFORMA-ARRANQUE-F{0,1,2,3,4A,4B,5,6}-v1.0.md` | 7 abiertos · 1 cerrada (F4b) |
| Tablero | [Tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) | Abierto |
| Plantilla de informe | [Plantilla de fase](PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md) | Emitida |
| Bloqueo | [DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md) | **Escalado al CTO** |

**G4 cumplido:** sin prompt de ejecución no hay implementación; los ocho están emitidos.

---

## 4. Decisiones de arquitectura

Detalle completo en el HLD §4 y en ADR-079. Resumen para lectura rápida:

| Id | Decisión | Por qué |
| --- | --- | --- |
| D1 | Un shape de estado, dos productores | Terminal y navegador muestran el mismo progreso por construcción, no por convención |
| D2 | La pantalla la sirve el proxy, no el framework | Una ruta del framework no puede renderizar su propia ausencia |
| D3 | El defecto de proxy en desarrollo se evita, no se corrige | Corregirlo exige reexponer PII — prohibido por [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* |
| D4 | El proxy de producción deja de esperar a que todo esté sano — **aprobada, ejecución diferida** | Hoy no arranca hasta después de las migraciones, que es justo lo que hay que mostrar. Pero tampoco hay entorno donde comprobarlo: se difiere al disparador de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) |
| D5 | La superficie de estado se diseña como hostil | Es pre-autenticación: silencio en régimen estable, vocabulario genérico, nada de reconocimiento |
| D6 | El instalador no puede cerrar con credenciales | Bloqueo real derivado del invariante de [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md) |

---

## 5. Estado por fase

*(Espejo del tablero. La fuente primaria es el checklist de cada fase.)*

| Fase | Responsable | Estado | Informe de fase | Recomendación de gate |
| --- | --- | --- | --- | --- |
| F0 contratos | AI-SR-FULL · AI-DS-OWNER · AI-PROD-UX · AI-SEC-ENG | Abierta | pendiente | — |
| F1 terminal | AI-PLAT-OPS | Abierta | pendiente | — |
| F2 API de estado | AI-SR-FULL | Abierta | pendiente | — |
| F3 pantalla | AI-FE-PLATFORM · AI-DS-OWNER · AI-PROD-UX | Abierta | pendiente | — |
| F4a proxy desarrollo | AI-PLAT-OPS | Abierta | pendiente | — |
| F4b proxy producción | AI-PLAT-OPS | **Cerrada — diferida** | no aplica | — |
| F5 instalador | AI-PLAT-OPS · AI-SEC-ENG | **Bloqueada** (cierre) | pendiente | — |
| F6 calidad | AI-SR-QA | Abierta | pendiente | — |

---

## 6. Evidencia consolidada de gates

*(Se completa a medida que cierran las fases. Toda suite adjunta `Cached: 0`.)*

| Gate | Pregunta | Aprueba | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| G1 | ¿La definición es correcta? | **CTO** | **✅ Cumplido 2026-08-09** | ADR-079 Aprobado con Decisión 4 diferida · HLD Aprobado |
| G2 | ¿La solución respeta el alcance? | AI-EM-ARCH | Pendiente | — |
| G3 | ¿Es factible? | AI-EM-ARCH | Pendiente | — |
| G4 | ¿Hay prompt de ejecución? | AI-EM-ARCH | **Cumplido 2026-08-09** | 7 prompts |
| G5 | ¿Los gates técnicos pasan? | AI-EM-ARCH | Pendiente | — |
| **G6** | ¿La calidad es aceptable? | AI-EM-ARCH | Pendiente | — |
| **G6.5** | ¿Se puede **mergear**? | AI-EM-ARCH consolida | Pendiente | Corrida de CI en Linux **por SHA** + artefacto resumen sanitizado |
| **G7** | ¿Se puede **desplegar**? | AI-EM-ARCH recomienda, **CTO aprueba** | Pendiente | — |

**G6.5 autoriza merge, nunca despliegue.** Su evidencia es la corrida de integración continua en Linux identificada por SHA, con artefacto resumen sanitizado: conteos, plataforma, duración y limpieza — **nunca tokens ni payloads**.

---

## 7. Deuda registrada

| Id | Descripción | Severidad | Estado | Dueño |
| --- | --- | --- | --- | --- |
| D-01 | Defecto de proxy en desarrollo | Media | **No se corrige** — fuera de alcance por ADR-078 *(propuesto)*; se evita por construcción | AI-PLAT-OPS |
| D-02 | Probe del contenedor de trabajos en segundo plano que no verifica nada (hallazgo B4 de la [auditoría Docker](INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)) | Media | **No es deuda de este frente.** Ya encargada a [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md), pendiente de ejecución; F2 la **consume** | AI-SR-FULL |
| D-03 | El corpus sigue sin PRD de instalación de producto | Baja | **Residual declarado** en ADR-079 | AI-EM-ARCH |
| D-04 | Duplicación deliberada del lenguaje visual del medidor | Baja | **Aceptada** por ADR-079, contenida por C3 y prueba anti-deriva | AI-DS-OWNER |

---

## 8. Bloqueos y decisiones que requieren CTO

### B-01 · `[ESCALACION AL CTO]` — Primer administrador de plataforma en producción

**Prioridad:** Alta. **Abierto desde:** 2026-08-09. **Bloquea:** cierre de F5 únicamente.

La configuración de la API rechaza por validación las variables de credencial de arranque cuando el entorno es productivo o de staging, y no existe camino alternativo. **El instalador dejaría la instancia levantada y sin forma de entrar.**

No es un descuido de diseño: es el precio correcto del invariante de [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md), que impide que la credencial la conozca quien despliega.

Opciones, recomendación y decisión requerida: [DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md).

### G1 — cumplido el 2026-08-09

El CTO aprobó **ADR-079** con alcance declarado: **seis decisiones vigentes de inmediato y la Decisión 4 con ejecución diferida** al disparador de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado).

**Motivo del diferimiento**, verificado antes de la firma: `docker-compose.e2e.yml` no incluye proxy ni contenedores de aplicación, y los marcadores de dominio de la configuración de producción deben conservarse intactos por ADR-070 (superado) §Decisión 2. En consecuencia, tres criterios de la fase —que el proxy arranque sin upstreams, que la raíz responda durante las migraciones y que el contenedor no se declare sano antes de tiempo— **no son observables hoy**. Ejecutar la decisión obligaría a declararlos cumplidos sin verlos: evidencia ficticia.

**Efecto operativo:** la fase F4 se parte en **F4a** (desarrollo, abierta) y **F4b** (producción, cerrada hasta el disparador). **Las demás fases quedan habilitadas y F0 puede arrancar.**

### DIF-01 — Diferimiento vigente

| Campo | Valor |
| --- | --- |
| Alcance | Decisión 4 de ADR-079 · fase F4b |
| Naturaleza | **Decisión de secuencia aprobada por el CTO. No es bloqueo ni deuda** |
| Condición de apertura | Disparador de reactivación de ADR-070 (superado) — no calendario |
| Quién abre | AI-EM-ARCH, de forma explícita, actualizando encabezado de F4b, tablero e informe |
| Impacto en el cierre | El frente alcanza G6 y G6.5 sin F4b, declarando **entrega parcial por diferimiento aprobado**. G7 no aplica |

---

## 8bis. Observaciones sobre el estado del repositorio

Detectadas al verificar los gates documentales de este frente. **No pertenecen al frente**; se registran porque condicionan cómo se verifican sus fases. Detalle en el [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) §4bis.

| Id | Observación |
| --- | --- |
| **OBS-01** | Los audits documentales (`audit:adr-citations`, `audit:doc-locations`) **no están cableados en CI**, pese a ser gates bloqueantes del protocolo. Cada fase debe correrlos a mano antes de cerrar |
| ~~**OBS-02**~~ | ~~17 bloqueantes de citas de ADR preexistentes, del frente SEC-P1 y de la remediación raíz~~ · **RESUELTA** por el commit `d86a6005`. El audit global quedó en **`BLOQUEANTE: 0`** el 2026-08-09 |

---

## 9. Campos contables de KPI

*(Se consolidan desde los informes de fase. Un campo sin dato se reporta "sin instrumentar", nunca se estima.)*

| Campo | Valor al 2026-08-09 |
| --- | --- |
| Reescrituras mayores de PRD/HLD | 0 |
| Conflictos entre agentes emitidos | 0 |
| Desempates requeridos | **1** (DES-01, resuelto el mismo día) |
| Escalaciones al CTO | **1** (B-01) |
| Deuda crítica abierta | 0 |
| Deuda alta abierta | 0 |
| Deuda media abierta | 2 (D-01, D-02) |
| Deuda baja abierta | 2 (D-03, D-04) |
| Hallazgos posteriores al merge | sin instrumentar — el frente no ha mergeado |
| Latencia de gates | sin instrumentar — solo G4 cerrado |

---

## 10. Artefactos que este frente deja superados

| Artefacto | Qué queda superado | Dónde se registra |
| --- | --- | --- |
| Comentario de `docker-compose.prod.yml` que justifica la condición endurecida de dependencia del proxy | La **razón** queda sustituida, no invalidada: el error de upstream deja de ser observable porque se sirve la pantalla en su lugar. **La sustitución se materializa en F4b**, hoy diferida | ADR-079 §Consecuencias · reescritura obligatoria en F4b (CA-F4B-07) |
| Elección de medio de la marca de vida del worker en [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md) | La opción de **archivo local** queda descartada: F2 debe leer la marca desde otro contenedor. **Solo esa elección**; el resto del prompt sigue vigente | ADR-079 §Consecuencias · tablero §4 DES-01 · nota en el propio prompt |
| Hallazgo **B4** de [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) | Sin cambio de estado — **sigue Delegado y abierto**. Este frente le da consumidor y cierra su elección de medio | Nota de vigencia en ese informe |

---

## 11. Bitácora

| Fecha | Actualización |
| --- | --- |
| 2026-08-09 | Apertura del frente. HLD y ADR-079 emitidos; 7 prompts, 7 checklists y tablero abiertos; plantilla de informe de fase publicada. **G4 cumplido.** B-01 escalado al CTO. Estado: **En curso — no autoriza merge ni producción** |
| 2026-08-09 | **G1 CUMPLIDO.** El CTO aprobó ADR-079 con la Decisión 4 de ejecución diferida al disparador de ADR-070. F4 se parte en **F4a** (abierta) y **F4b** (cerrada); retirados los artefactos F4 unificados, recuperables desde `89c44ad4`. Retirado el marcador `(propuesto)` de las citas a ADR-079 en todo el corpus, y corregidas las fechas de emisión a 2026-08-09. **F0 desbloqueada.** Informe a v1.1 |
| 2026-08-09 | Gates documentales verificados: `audit:doc-locations` en **BLOQUEANTE: 0**; `audit:adr-citations` sin bloqueantes atribuibles a este frente. Registradas **OBS-01** y **OBS-02**. Confirmado que **ningún archivo de código fue modificado** |
| 2026-08-09 | **DES-01 resuelto.** Revisión de corpus previa al cierre detectó que el latido del worker ya estaba encargado a `PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md` (2026-08-03) y que F2 lo estaba redefiniendo. F2 pasa a **consumirlo**; la elección de medio que aquel prompt dejaba abierta queda cerrada a favor de la caché, porque la sonda debe leerla desde otro contenedor. Corregidos HLD, ADR-079, prompt y checklist de F2, tablero y este informe |
