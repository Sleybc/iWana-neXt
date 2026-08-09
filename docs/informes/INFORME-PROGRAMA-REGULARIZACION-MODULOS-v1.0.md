# INFORME — Regularización del estado de los módulos del programa

**Versión:** 1.0
**Estado:** Vigente — registro de estado, se actualiza al cambiar el estado de cualquier módulo
**Fecha:** 2026-08-09
**Modo activo:** EM + Product Architect
**Autor:** AI-EM-ARCH
**Ejecuta:** paso 4 del plan de migración de [ADR-080](../adrs/ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) (Aprobado por el CTO, 2026-08-09)
**Relacionado:** [ADR-022](../adrs/ADR-022-Politica-Ejecucion-Modular-Por-Fases.md) (enmendado) · [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) · [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md)
**PRD:** [PRD_Sistema_ISP_Colombia_v2_4.md](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) §12.3.2, §14.1bis, §14.2

---

## 1. Qué hace este informe

ADR-080 §Decisión 6 obliga a que **cada módulo abierto declare su estado real**: `Suspendido` con causa y condición de retorno, o `Cerrado en construcción` con su evidencia de G6 y G6.5. Y prohíbe expresamente declarar cierres sin evidencia para hacer cuadrar la cota.

Este informe es ese acto. **No cierra ningún módulo**: constata el estado de cada uno y fija qué falta para cerrarlo.

**Regla aplicada, sin excepciones:** ningún módulo se declara `Cerrado en construcción` sin informe de cierre y evidencia de G6 y G6.5. Se verificó la existencia de informe de cierre para los seis: **ninguno lo tiene**.

---

## 2. Resultado

| Estado | Módulos | Cuenta |
| --- | --- | --- |
| **Cerrados** | MOD01, MOD04, MOD11, MOD12 | 4 |
| **`Suspendido`** | MOD00, MOD02, MOD05, MOD06, MOD09, MOD10 | **6** |
| **No iniciados** | NMS, Billing, Provisioning, IPAM, Portal Cliente, ETL | 6 |

**La cota de dos de ADR-080 §Decisión 4 se excede en cuatro.** Es el resultado esperado: la cota entra en vigor hacia adelante y el estado heredado no la cumplía. **Ninguno de los seis pudo declararse cerrado**, porque ninguno tiene la evidencia que ADR-080 exige.

El exceso se escala al CTO en §5.

---

## 3. Declaración por módulo

### MOD00 — Configuración / Control Plane federado · `Suspendido`

| Campo | Valor |
| --- | --- |
| **Construido** | Sí. Fases 01–06 con checklist cerrado, la última el 2026-05-23 |
| **Qué falta** | Informe de cierre de módulo. **G6 y G6.5 no registrados** — sus checklists son anteriores a ADR-069 y usan el vocabulario previo |
| **Causa de la suspensión** | **No fue declarada en su momento.** Cronológicamente coincide con la apertura de MOD04 y después MOD11/MOD12. Se regulariza aquí como suspensión, sin atribuirle una causa que ningún artefacto registró — inventarla sería peor que admitir el vacío |
| **Contratos congelados** | ADR-040, 042, 043, 044, 045 — todos Aprobados y vigentes |
| **Condición de retorno** | Emitir informe de cierre con evidencia de G6 y G6.5 sobre el alcance ya entregado. **No requiere construir nada nuevo**: es el módulo más cerca del cierre de los seis |
| **Dueño** | AI-EM-ARCH (consolidación) |

### MOD02 — Dashboard / Portal de empresa · `Suspendido`

| Campo | Valor |
| --- | --- |
| **Construido** | Parcial |
| **Qué falta** | **G6 NO-GO condicionado** (2026-08-04) con cuatro bloqueantes, tres de esfuerzo bajo. El CTO aprobó el escenario de **recomposición con datos existentes** |
| **Causa de la suspensión** | Defecto de calidad, no dependencia descubierta. *"El directorio de componentes del dashboard no importa una sola primitive del sistema de componentes del portal"*, y nueve de los doce roles del tenant reciben la leyenda «Panel en preparación» |
| **Deuda estructural asociada** | Cinco escalaciones al CTO abiertas: token de lienzo, contrato de capas z *(posiblemente resuelto por ADR-075 y no marcado)*, **ausencia de umbral de cobertura en el portal** (alta), sucesión del HLD, y sesión en almacenamiento local en vez de cookie `httpOnly` |
| **Condición de retorno** | Cerrar los cuatro bloqueantes → G6 GO → G6.5 |
| **Dueño** | AI-FE-PLATFORM, con AI-PROD-UX y AI-DS-OWNER |

> **Nota de gobernanza.** El HLD que MOD02 implementa está fechado el 2026-03-17 y describe un portal de dos rutas; el portal real tiene hoy 25 páginas. **El artefacto de definición quedó superado por la implementación** — un caso claro de deriva documental que la sucesión del HLD debe cerrar antes de emitir el prompt de la fase.

### MOD05 — CRM / Expedientes / Subscribers · `Suspendido`

| Campo | Valor |
| --- | --- |
| **Construido** | Sí. Fase 03 completada el 2026-05-14 |
| **Qué falta** | Informe de cierre de módulo. Gates no registrados |
| **Causa de la suspensión** | No declarada. Coincide con el giro del programa hacia el back-office |
| **Deriva documental** | **Dos PRDs del módulo siguen en `Propuesto`** —`PRD-MOD05-CRM-SUBSCRIBERS-v1.0` y su fase 02— pese a que el PRD maestro lo declaraba implementado. Un módulo no puede cerrarse con su propia definición sin aprobar |
| **Condición de retorno** | Resolver los dos PRDs en `Propuesto` —aprobarlos o marcarlos superados— y emitir informe de cierre con evidencia de gates |
| **Dueño** | AI-EM-ARCH (definición) + AI-SR-QA (evidencia) |

### MOD06 — Comercial / Catálogo · `Suspendido`

| Campo | Valor |
| --- | --- |
| **Construido** | Sí. Fase 01, 2026-04-18 |
| **Qué falta** | Informe de cierre. Gates no registrados |
| **Causa de la suspensión** | No declarada |
| **Deuda abierta** | Alertas operativas (plan del 2026-07-23) y **ocho versiones sucesivas de informe de alineación de UI** — la iteración prolongada sin cierre es en sí una señal |
| **Deriva documental** | El addendum de fase 02 está **`Deprecado`** sin sucesor declarado |
| **Condición de retorno** | Cerrar la deuda de alertas operativas, declarar el sucesor del addendum deprecado y emitir informe de cierre |
| **Dueño** | AI-SR-FULL + AI-FE-PLATFORM |

### MOD09 — WFM / Programación · `Suspendido`

| Campo | Valor |
| --- | --- |
| **Construido** | Sí |
| **Gates** | **G6 GO** (remediación F6, criterios CA-R1…CA-R7 todos GO) · **G6.5 suspendido sin veredicto consolidado** · G7 no evaluado |
| **Causa de la suspensión** | Doble. **(a)** Auditoría defect-first del 2026-08-05 **reabrió tres fases** —H1, V3 y H2—; el bloqueante B1 degradaba `REQUIRES_RESCHEDULE` a `READY_TO_SCHEDULE`, haciendo *"el chip de reintento imposible en producción"*. **(b)** La vigilancia de G6.5 se detuvo por orden explícita, ante la percepción de bucle |
| **Deuda asociada** | Concentra **13 de los ~29 fallos** de la suite E2E del portal |
| **Deriva documental** | Las specs UX del 2026-08-04 están en **`Propuesta — pendiente de aprobación del CTO`**, y la fase 5 **ya se implementó contra ellas**. Se construyó contra una definición sin firmar |
| **Condición de retorno** | Cerrar B1 y las tres fases reabiertas → consolidar G6.5. **Bloqueado además por el impedimento transversal de §4** |
| **Dueño** | AI-SR-FULL + AI-SR-QA |

### MOD10 — Service Assurance / Mesa de ayuda · `Suspendido`

| Campo | Valor |
| --- | --- |
| **Construido** | Sí |
| **Qué falta** | Fase 01 en estado **`En revisión`**, *"dejando explícitos los criterios todavía parciales antes del cierre formal de fase"*. Gates no registrados |
| **Causa de la suspensión** | No declarada. La fase nunca se cerró formalmente |
| **Deriva documental** | PRD del módulo v1.1 en **`En revisión`** |
| **Condición de retorno** | Completar los criterios parciales de la fase 01, aprobar el PRD y emitir informe de cierre |
| **Dueño** | AI-SR-FULL + AI-SR-QA |

---

## 4. Impedimento transversal — la salida del exceso está bloqueada

**Ningún módulo puede obtener G6.5 hoy, por una causa ajena a la ingeniería.**

G6.5 exige, por [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md), una corrida verde de integración continua en Linux identificada por SHA. La integración continua está **en rojo por facturación de GitHub Actions** —*"recent account payments have failed or your spending limit needs to be increased"*—, condición **preexistente en la rama principal** y no introducida por ningún cambio. El frente SEC-P1 lo documentó al detalle: su PR se mergeó con los cinco checks en fallo y quedó registrado como **«MERGEADO sin G6.5»**, con la instrucción de reejecutar CI sobre la rama principal al restablecerse la facturación y tratar como regresión cualquier fallo no atribuible a ella.

**Consecuencia directa sobre este informe:** la cota de dos **no puede reducirse cerrando módulos** mientras la facturación siga caída, porque el cierre en construcción exige G6.5 y G6.5 exige CI. Es un impedimento administrativo, no técnico, y bloquea el camino de salida de los cuatro módulos que exceden la cota.

**Excepción parcial:** MOD00 y MOD05 podrían avanzar hasta la puerta de G6.5 —consolidar evidencia, emitir informe— y quedar a la espera únicamente de la corrida. Conviene hacerlo: cuando la facturación se restablezca, el cuello de botella no debería ser trabajo de documentación pendiente.

---

## 5. Escalación al CTO — **resuelta el 2026-08-09**

**Estado: cerrada.** El CTO aprobó una **secuencia por olas** bajo el criterio explícito de *"pensar a futuro y sin tener que refactorizar"*. La secuencia completa, con su justificación y su coste declarado, vive en [PRD §14.3ter](../prds/PRD_Sistema_ISP_Colombia_v2_4.md).

**Qué cambió respecto de lo que este informe recomendaba.** La recomendación original ordenaba la salida por **coste de cierre** (los más baratos primero). La decisión aprobada la ordena por **herencia**: primero las fundaciones que los seis módulos restantes van a heredar, porque una decisión pendiente se multiplica por cada módulo construido encima. Es un criterio mejor y sustituye al mío.

| Ola | Contenido | Efecto sobre este informe |
| --- | --- | --- |
| **0** | Restablecer la facturación de integración continua | Levanta el impedimento transversal de §4 — **precondición de todo cierre** |
| **1** | Decidir pgBouncer · decidir modelo de sesión · **cerrar MOD02** | MOD02 sale de `Suspendido` |
| **2** | **MOD00** y **MOD05** | Salen de `Suspendido`; solo consolidación |
| **3** | Billing → Provisioning → NMS | Módulos nuevos, ya sobre fundación estable |
| **4** | **MOD06**, **MOD10** (consolidación) · **MOD09** (defecto abierto) | Salen de `Suspendido` en ventanas intercaladas |

**Congelación vigente:** no se abre ningún módulo funcional nuevo antes de la Ola 3. Los frentes transversales no cuentan para la cota y siguen.

**Convergencia a la cota:** al terminar la Ola 1 queda **MOD02 cerrado**; durante la Ola 2, **MOD00 y MOD05** en consolidación. La secuencia converge a los dos módulos de ADR-080 sin necesidad de excepción.

### 5.1 Dependencias abiertas que bloquean la Ola 3

Aprobar la secuencia **no resolvió las dos decisiones que la Ola 1 contiene**. Siguen abiertas:

| Id | Decisión | Artefacto | Estado | Bloquea |
| --- | --- | --- | --- | --- |
| **OLA1-a** | **Consumir pgBouncer — Opción A** | [ADR-072](../adrs/ADR-072-Destino-de-pgBouncer.md) | **Aprobado por el CTO el 2026-08-09** | — |
| **OLA1-b** | **Access token a cookie `httpOnly`** en dos pasos desacoplados | [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) | **Aprobado por el CTO el 2026-08-09** | Ola 3 |

**Ambas quedaron resueltas el 2026-08-09.** OLA1-b se emitió tras la consulta bloqueante a AI-SEC-ENG que el perfil AI-EM-ARCH exige antes de fijar una definición sobre la superficie de autenticación. El dictamen declaró **inviable como decisión permanente** conservar el patrón actual, y **viable con ajustes** la migración, con tres condiciones bloqueantes de merge. **Firmada como [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) (Aprobado) el 2026-08-09**, quedando la Ola 1 con sus dos decisiones cerradas.

### 5.2 Hallazgo crítico surgido de la consulta — no represado

La auditoría de AI-SEC-ENG encontró un **XSS almacenado en la búsqueda global de la consola de plataforma** por el que un administrador de tenant puede robar el token de sesión de un usuario de plataforma, **cruzando la frontera de audiencias** que [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) estableció criptográficamente.

**Es independiente de OLA1-b y tiene [artefacto propio](../security/SECURITY-REVIEW-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md)**, precisamente para que no quede represado dentro de un ADR de otro alcance. Migrar la sesión a cookie **reduce su impacto**; no elimina la ejecución de script. Corrección inmediata por AI-FE-PLATFORM, sin esperar a la prueba de concepto.

---

## 6. Lo que este informe deja constatado

1. **La flexibilidad de orden nunca fue el problema.** MOD00, MOD04, MOD11 y MOD12 nacieron de dependencias descubiertas y **dos de ellos están cerrados**: el mecanismo funciona cuando se completa.
2. **El problema es no volver.** Los seis suspendidos no fallaron por construirse fuera de orden, sino porque nadie declaró la interrupción ni fijó la condición de retorno. Cuatro de los seis tienen la causa literalmente **«no declarada»**.
3. **La deriva documental acompaña a la suspensión.** Cinco de los seis tienen PRD o spec sin aprobar, deprecado sin sucesor o superado por la implementación. Un módulo que se suspende sin declararlo también deja su definición a la deriva.
4. **El cierre pendiente no es trabajo de ingeniería en la mayoría de los casos.** MOD00, MOD05, MOD06 y MOD10 necesitan sobre todo **consolidación y evidencia**, no construcción. Solo MOD02 y MOD09 tienen defecto funcional abierto.

---

## 7. Registro de cambios

| Fecha | Cambio |
| --- | --- |
| 2026-08-09 | Apertura. Ejecuta el paso 4 del plan de migración de ADR-080. Seis módulos declarados `Suspendido` con causa y condición de retorno; ninguno declarado cerrado por ausencia de evidencia. Impedimento transversal de integración continua registrado. Exceso de cota escalado al CTO |
| 2026-08-09 | **Escalación de §5 resuelta.** El CTO aprobó una secuencia por olas ordenada por **herencia de fundaciones**, no por coste de cierre — criterio que sustituye al recomendado en este informe. Congelación de módulos funcionales nuevos hasta la Ola 3. Registradas **OLA1-a** (pgBouncer) y **OLA1-b** (modelo de sesión) como dependencias abiertas |
| 2026-08-09 | **OLA1-a y OLA1-b resueltas.** El CTO aprobó la **Opción A** de ADR-072 (consumir pgBouncer, con validación bajo carga como condición de entrada). Emitido **ADR-081** *(propuesto)* sobre el modelo de sesión, tras consulta bloqueante a AI-SEC-ENG. **De esa consulta surgió un hallazgo crítico independiente** —XSS almacenado en la búsqueda global— registrado en artefacto propio para no represarlo |
| 2026-08-09 | **Corrección de un hallazgo propio.** La deuda **CT-01** —ausencia de umbral de cobertura en el portal— se dio por abierta citando el informe de auditoría de MOD02. La verificación directa sobre `apps/portal/jest.config.js` muestra que **se cerró el 2026-08-04**, el mismo día de la escalación, con un umbral trinquete fijado en el suelo medido menos un punto sobre 169 suites. Corregido en el PRD §13.5 |
| 2026-08-09 | **OLA1-b firmada y hallazgo H-01 cerrado.** El CTO firmó **ADR-081** (cookie `httpOnly` en dos pasos) como Aprobado; la Ola 1 queda con sus dos decisiones cerradas. El hallazgo crítico de la búsqueda global (**H-01**) se corrigió por AI-FE-PLATFORM (C-7), se demostró con prueba de concepto de AI-SR-QA (C-7b, 16 pruebas) y se **cerró formalmente por AI-SEC-ENG** el 2026-08-09. Queda abierto **C-8** (CSP, con dueño AI-FE-PLATFORM + AI-PLAT-OPS) y C-10 (no bloqueante). Detalle en [INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0](../informes/INFORME-TRANSVERSAL-XSS-BUSQUEDA-GLOBAL-v1.0.md) |
| 2026-08-09 | **Frente transversal de búsqueda cerrado por completo.** **C-8** (CSP en ambas aplicaciones) y **C-10** (sink del portal) cerrados el 2026-08-09. C-10: `SearchHighlight` + `SearchSnippetPill` promovidos a `@iwana/ui` con contrato DS congelado ([spec v1.0](../specs/2026-08-09-search-highlight-ds-contrato.md)); control negativo del portal verificado por AI-SR-QA. C-8: CSP vía `async headers()` en ambas `next.config.ts`, capa de infraestructura verificada por AI-PLAT-OPS, cierre formal por AI-SEC-ENG con veredicto **APROBADO CON RIESGO RESIDUAL** (riesgo `'unsafe-inline'` aceptado y documentado; hardening con nonces como mejora futura). Cero `dangerouslySetInnerHTML` en `apps/web/src`, `apps/portal/src` y `packages/ui/src`; suites web (112) y portal (1111) en verde con `Cached: 0` |
