# ADR-080: Dependencia descubierta durante la ejecución y cierre en construcción

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-08-09
**Modo activo:** Product Architect + EM
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano — 2026-08-09
**Módulos:** Todos — política de ejecución del programa
**Complementa y enmienda:** [ADR-022](ADR-022-Politica-Ejecucion-Modular-Por-Fases.md) §Decisión puntos 3 y 4 — enmienda **marcada en ADR-022 el 2026-08-09**
**Ejecución del plan de migración:** pasos 2, 3 y 4 completados el 2026-08-09; ver [INFORME-PROGRAMA-REGULARIZACION-MODULOS-v1.0.md](../informes/INFORME-PROGRAMA-REGULARIZACION-MODULOS-v1.0.md)
**Relacionado:** [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) (diferimiento productivo) · [ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md) (taxonomía de gates) · [ADR-049](ADR-049-Split-Design-Layer-Frontend-Platform.md) (ejecución paralela contract-first)
**PRD:** [PRD_Sistema_ISP_Colombia_v2_4.md](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) §14.1, §14.1bis, §14.3bis

---

## Contexto

El CTO planteó el 2026-08-09 una posición sobre la cadencia del programa:

> *"Inicialmente quería que fuera un módulo a la vez, pero en esto debemos ser flexibles, porque hay módulos que dependen de otros. Deberíamos seguir un orden, pero hay cosas que mientras se van construyendo notamos que se requiere construir otra."*

La observación es correcta y el propio programa la demuestra: **MOD00, MOD04, MOD11 y MOD12 no estaban en el roadmap original del MVP**. Los cuatro nacieron de necesidades descubiertas construyendo otra cosa, y los cuatro resultaron ser piezas legítimas del sistema. Negar esa dinámica sería negar cómo se construye software real.

### Lo que ya está permitido y no es el problema

[ADR-022](ADR-022-Politica-Ejecucion-Modular-Por-Fases.md) §Decisión punto 4 **ya autoriza mover el orden del roadmap**: *"CTO + Engineering Manager pueden mover la prioridad de un módulo cuando exista necesidad de negocio o ventana operativa más valiosa"*. La flexibilidad de **orden** no requiere este ADR.

### Los dos huecos reales

**Hueco 1 — la repriorización no es lo mismo que la interrupción.** La repriorización controlada de ADR-022 supone que se decide **antes de abrir** el módulo. El caso que describe el CTO ocurre **dentro** de un módulo ya abierto: se está construyendo N, se descubre que N no puede avanzar sin M, y M no existe. Eso no es reordenar una cola: es **suspender N para abrir M**. ADR-022 no nombra ese acto, y lo que no se nombra no se gobierna.

**Hueco 2 — el criterio de cierre es hoy inalcanzable.** ADR-022 §Decisión punto 3 exige *"despliegue en producción validados"* para cerrar un módulo. [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado), aprobado después, **difiere formalmente la producción** y deja G7 NO-GO por diseño. **Dos ADRs aprobados se contradicen**: bajo el 022 ningún módulo puede cerrarse jamás, y bajo el 070 eso es el estado correcto del programa. La consecuencia práctica ya se ve en el corpus.

### El costo observable de no haberlo gobernado

Corte al 2026-08-09, sobre diez módulos construidos:

| Estado | Módulos |
| --- | --- |
| **Cerrados** (informe de cierre o G6+G6.5) | MOD01, MOD04, MOD11, MOD12 — **4** |
| **Abiertos sin cierre** | MOD00 (fases cerradas, sin informe de módulo), MOD02 (G6 NO-GO, fase reabierta), MOD05 (sin informe de módulo), MOD06 (sin informe de módulo), MOD09 (G6.5 suspendido, tres fases reabiertas), MOD10 (fase 01 en revisión) — **6** |

**Seis módulos abiertos simultáneamente.** Ninguno abandonado por descuido: cada uno se interrumpió por una razón concreta. Pero nadie declaró la interrupción, nadie fijó la condición de retorno, y el resultado es una cola de trabajo a medio terminar cuyo tamaño real nadie tenía a la vista hasta que se midió para el PRD v2.5.

**El problema nunca fue construir fuera de orden. Fue interrumpir sin declarar y no volver.**

---

## Decisión

### 1. Se reconoce la **dependencia descubierta** como acto propio de gobierno

Distinta de la repriorización controlada, y con requisitos propios. Se invoca cuando, ejecutando el módulo N, se constata que **N no puede alcanzar su criterio de salida sin una capacidad M que no existe**.

**Condiciones para invocarla — las tres, no dos:**

1. **La dependencia es bloqueante, no conveniente.** N no puede terminar sin M. Que M *mejore* N no basta: eso es alcance nuevo y se trata como tal.
2. **M no cabe dentro de N.** Si la capacidad pertenece al boundary de N, se construye dentro de N y no hay interrupción que declarar.
3. **Queda declarada en un artefacto localizable** antes de abrir M, con: qué falta en N, por qué M lo bloquea, y qué se congela.

Quien la invoca es el agente ejecutor; **quien la autoriza es AI-EM-ARCH**. Si M implica un bounded context nuevo, escala al CTO vía ADR, como hasta ahora.

### 2. N queda **suspendido con contrato congelado**, no abandonado

Un módulo interrumpido pasa a estado explícito **`Suspendido`**, y suspender exige dejarlo en condición de ser retomado por alguien que no lo construyó:

- Su checklist de fase permanece abierto, con lo pendiente marcado `[ ]` y **la causa de suspensión escrita en la sección de pendientes**.
- Sus contratos ya congelados **siguen congelados**: M no puede cambiarlos unilateralmente. Si M los cambia, es un evento de re-sincronización coordinado por AI-EM-ARCH.
- Su informe de fase registra el corte: qué quedó entregado, qué no, y qué evidencia existe.

**Suspendido no es un estado cómodo: es una deuda con nombre, dueño y condición de retorno.**

### 3. El retorno es una **pila, no una cola**

Al cerrar M **se retoma N antes de abrir cualquier otro módulo funcional**. Último interrumpido, primero retomado.

Es la regla que impide que la flexibilidad degenere. Sin ella, cada dependencia descubierta puede engendrar otra y el programa avanza en profundidad sin cerrar nada — que es exactamente cómo se llega a seis módulos abiertos.

### 4. Cota de módulos funcionales abiertos: **dos**

Como máximo **dos módulos funcionales** en estado abierto o suspendido a la vez: el suspendido y el que lo desbloquea. Un tercero exige **decisión explícita del CTO**, registrada.

La cota no es un número arbitrario: dos es lo que permite una interrupción legítima sin habilitar una cadena. Se propone dos, no uno, precisamente porque el CTO tiene razón en que la interrupción ocurre y prohibirla produciría incumplimiento silencioso en vez de disciplina.

**Los frentes transversales no cuentan para esta cota.** Plataforma, seguridad, design system y herramienta de desarrollo no son módulos del roadmap, no disparan ADR-022 y se gobiernan por su propio informe y tablero.

### 5. Se separa **cierre en construcción** de **cierre en producción**

Enmienda a ADR-022 §Decisión punto 3, que hoy contradice a ADR-070 (superado):

| Cierre | Qué exige | Quién aprueba | Vigencia |
| --- | --- | --- | --- |
| **Cierre en construcción** | Backend, frontend, base de datos, pruebas y documentación completos, con **G6 y G6.5** ([ADR-069](ADR-069-Gates-G6.5-Merge-Readiness.md)) | AI-EM-ARCH | **Es el cierre exigible hoy.** Habilita abrir el módulo siguiente |
| **Cierre en producción** | Lo anterior más **G7**: dominio productivo, TLS de autoridad reconocida, rollback por componente ensayado, restauración global y por tenant | **CTO** | **Diferido** mientras ADR-070 (superado) esté vigente. Su ausencia **no es deuda** |

**La Regla de Completitud de ADR-022 se satisface con el cierre en construcción.** No se relaja: se hace alcanzable. Exigir un despliegue que una decisión aprobada prohíbe no es rigor, es una regla imposible de cumplir — y una regla imposible de cumplir se ignora, que es peor que no tenerla.

### 6. Regularización de los seis módulos abiertos

La cota entra en vigor **hacia adelante**. El estado actual la excede y se regulariza sin ficción: en el plazo de una sesión de gobierno, **cada uno de los seis módulos abiertos declara su estado real** — `Suspendido` con causa y condición de retorno, o `Cerrado en construcción` con su evidencia de G6/G6.5.

**Ningún módulo se declara cerrado sin evidencia** para hacer cuadrar la cota. Si al terminar la regularización siguen abiertos más de dos, el exceso se presenta al CTO como decisión de secuencia — que es la escalación ya abierta en el PRD §14.3ter.

---

## Consecuencias

### Positivas

- Nombra un acto que ya ocurría sin gobierno, y lo hace auditable.
- Hace **alcanzable** la Regla de Completitud, que hoy es literalmente imposible de satisfacer.
- La pila de retorno ataca la causa raíz real: no la interrupción, sino el no volver.
- Resuelve una contradicción vigente entre dos ADRs aprobados.
- Pone a la vista el número de módulos abiertos, que era invisible hasta medirlo.

### Negativas y costes aceptados

- **Un estado más que mantener.** `Suspendido` obliga a escribir causa y condición de retorno. Es trabajo real, y es el precio de que el módulo sea retomable por alguien distinto de quien lo dejó.
- **La cota de dos incomoda a propósito.** Habrá momentos en que tres frentes parezcan razonables; ese roce es la función del control, y por eso la excepción existe y es del CTO.
- **La regularización expondrá que algunos módulos están más lejos del cierre de lo que sugería su informe.** Es información incómoda y útil.

### Impacto declarado

| Dimensión | Evaluación |
| --- | --- |
| Multi-tenant | **Sin impacto.** Política de proceso |
| Seguridad | **Indirecto y positivo:** un módulo suspendido con deuda declarada es auditable; uno abandonado en silencio no |
| Escala | **Sin impacto** técnico |
| Regulación | **Sin impacto** |
| Producto | **Alto.** Cambia cómo se decide qué se construye y cuándo se considera terminado |

---

## Riesgos

| # | Riesgo | Severidad | Mitigación |
| --- | --- | --- | --- |
| R1 | La dependencia descubierta se usa como puerta trasera para alcance nuevo | **Alta** | Condición 1: la dependencia debe ser **bloqueante**, no conveniente. Lo que mejora N pero no lo bloquea es alcance y se trata como alcance |
| R2 | La cota se excede rutinariamente vía excepción del CTO | Media | Cada excepción se registra; su acumulación es señal de que la cota o el roadmap están mal calibrados y dispara revisión |
| R3 | `Suspendido` se usa como cementerio: se suspende y nunca se retoma | **Alta** | La pila de retorno es obligatoria y la cota lo hace visible: con dos módulos abiertos, no volver bloquea abrir el siguiente |
| R4 | Se lee "cierre en construcción" como sustituto de G7 | Media | La tabla del punto 5 es explícita: **habilita abrir el siguiente módulo, nunca desplegar**. Consistente con ADR-069 |
| R5 | La regularización tienta a declarar cierres sin evidencia | Media | Punto 6 lo prohíbe expresamente; el exceso se escala en vez de maquillarse |

---

## Plan de migración

| Paso | Acción | Responsable |
| --- | --- | --- |
| 1 | Aprobación del CTO | CTO |
| 2 | Marcar en ADR-022 la enmienda a §Decisión 3 y 4, con remisión a este ADR | AI-EM-ARCH |
| 3 | Actualizar PRD §14.1bis y §12.3.2 criterio 6 con el mecanismo y los dos tipos de cierre | AI-EM-ARCH |
| 4 | Regularizar los seis módulos abiertos: cada uno declara `Suspendido` o `Cerrado en construcción` con evidencia | AI-EM-ARCH, con el agente de cada módulo |
| 5 | Resolver la escalación de secuencia del PRD §14.3ter con el mapa de estados ya regularizado | CTO |

**Reversible:** sí. Es política de proceso; revertirla restaura ADR-022 sin enmienda — y con ella su contradicción con ADR-070 (superado), que habría que resolver por otra vía.

**Sin punto de no retorno.**
