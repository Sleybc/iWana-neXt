# PROMPT DE EJECUCIÓN — La API no arranca: ciclo de módulos WFM ↔ Tasks ↔ Assurance

**Módulos:** MOD09 WFM · MOD11 Tasks · MOD10 Assurance
**Código:** SR-FULL-BOOTSTRAP
**Versión:** 1.0
**Fecha:** 2026-08-05
**Generado por:** AI-EM-ARCH (modo Architect + Orchestrator)
**Agente destinatario:** AI-SR-FULL
**Revisor obligatorio:** AI-SR-QA
**Prioridad:** **P0 — bloquea el merge de la rama, la remediación P1 y G6.5**
**ADRs de referencia:** [ADR-037](../adrs/ADR-037-Bounded-Context-Programacion-WFM.md) · [ADR-047](../adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md) · [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md)

---

## 0. El defecto

**La aplicación no arranca.** Reproducido dos veces de forma independiente (AI-PLAT-OPS y
AI-EM-ARCH) en la rama `feat/mod09-ciclo-vida-visita-campo`:

```
UndefinedModuleException: Nest cannot create the WfmModule instance.
The module at index [4] of the WfmModule "imports" array is undefined.
- The module at index [4] is of type "undefined".
Scope [AppModule -> HealthModule -> TasksModule -> AssuranceModule]
```

Falla en `NestFactory.create()` (`apps/api/src/main.ts:25`), **antes** de cualquier
`listen`. Reproducible con `cd apps/api && npx nest start`.

El índice 4 de `imports` en `apps/api/src/modules/wfm/wfm.module.ts:50` es `TasksModule`,
importado **sin `forwardRef`**, mientras `apps/api/src/modules/assurance/assurance.module.ts:28`
sí usa `forwardRef(() => WfmModule)`. Es un ciclo resuelto por un solo lado.

### Por qué nadie lo detectó

**2930 tests unitarios pasan.** Mockean módulos y nunca ejercen el bootstrap real. La
suite verde fue la base de un veredicto de calidad que resultó incompleto — esa es la
lección que este trabajo debe cerrar con una prueba, no con una nota.

### Lo acotado y lo no verificado

- El import de `TasksModule` en `wfm.module.ts` procede de `1bbb9997` (MOD12 Fase 02),
  **presente también en `main`**. No es una regresión introducida por MOD09.
- **No verificado:** si `main` arranca. Los ciclos son sensibles al orden de resolución, y
  esta rama añadió imports a `wfm.module.ts` y `assurance.module.ts` que pudieron
  convertir un ciclo latente en uno que falla. **Determinarlo es parte del encargo.**

---

## 1. Objetivo

La API arranca y responde su healthcheck, y existe una prueba automática que **falla si el
bootstrap vuelve a romperse**.

Corregir el síntoma con `forwardRef` sin entender el ciclo sería tapar el problema:
`forwardRef` es una herramienta legítima, pero un ciclo entre tres bounded contexts puede
ser también señal de un boundary mal trazado, y eso es materia de ADR-037 y ADR-047.

---

## 2. Alcance

| # | Trabajo |
| --- | --- |
| **E0** | **Reproducir y determinar el alcance real**: ¿arranca `main`? ¿desde qué commit deja de arrancar? Usa `git bisect` o arranques puntuales. Sin este dato no se puede decidir E2 |
| **E1** | **Mapear el ciclo completo** entre `WfmModule`, `TasksModule`, `AssuranceModule` y `HealthModule`: quién importa a quién, cuáles usan `forwardRef` hoy y cuáles no |
| **E2** | **Corregir el bootstrap.** Ver §3: la elección entre las dos vías depende de E1 |
| **E3** | **Prueba de bootstrap**: un test que compile el `AppModule` real (`Test.createTestingModule({ imports: [AppModule] }).compile()`) y falle si algún módulo queda `undefined`. Es la red que faltaba |
| **E4** | Verificar que la API levanta y responde `GET /api/v1/health`, y que liga a `127.0.0.1` conforme a `BIND_HOST` (evidencia pendiente de P0 en ADR-078 (propuesto)) |

### Fuera de alcance

- Rediseñar los boundaries entre MOD09, MOD10 y MOD11. Si concluyes que el ciclo revela un
  boundary mal trazado, **repórtalo con evidencia y detente**: eso es un ADR, y es mío.
- La remediación P1 (S-1, S-2), que queda detrás de este trabajo.
- Cualquier cosa de infraestructura, dominio o TLS.

---

## 3. Las dos vías, y cómo elegir

**Vía A — `forwardRef` simétrico.** Si el ciclo es intencional y ambos lados necesitan
genuinamente el módulo del otro, la corrección es declarar el `forwardRef` en los dos
extremos, no en uno. Es la solución de Nest y es legítima.

**Vía B — romper el ciclo.** Si `WfmModule` importa `TasksModule` solo para alcanzar el
puerto `EXECUTION_ORDER_SCHEDULING_PORT`, la dependencia es de **contrato**, no de módulo:
el patrón aprobado en ADR-047 es comunicación por puerto tipado. Extraer el proveedor del
puerto a un módulo sin dependencias inversas elimina el ciclo en lugar de gestionarlo.

**Criterio de decisión:** si el ciclo existe solo por el puerto de ejecución, **prefiere la
vía B** — está alineada con ADR-047 y deja el grafo de módulos acíclico. Reserva la vía A
para cuando el acoplamiento bidireccional sea real y justificado.

Sea cual sea la vía, **declara por qué** en el informe. No apliques `forwardRef` como
reflejo.

---

## 4. Restricciones duras

1. **No introduzcas acceso directo a tablas de otro módulo** para romper el ciclo. La
   comunicación inter-módulo es por interfaces tipadas o eventos (ADR-037 regla 2).
2. **No muevas ownership de entidades** entre módulos: eso cambia boundaries y exige ADR.
3. Multi-tenant, seguridad y auditoría intactos: este trabajo no toca comportamiento de
   negocio.
4. Si la corrección obliga a cambiar un contrato entre MOD09 y MOD11, **detente y
   escala**: ADR-047 gobierna ese contrato.
5. No toques nada de producción, placeholders ni el gate R3.5.

---

## 5. Criterios de aceptación

1. `cd apps/api && npx nest start` arranca sin excepción y registra el arranque.
2. `GET http://127.0.0.1:3000/api/v1/health` responde 200.
3. La API liga a `127.0.0.1` con el default de `BIND_HOST` — cierra la evidencia pendiente
   de P0.
4. **E3 falla** si se revierte la corrección. Demuéstralo revirtiendo temporalmente.
5. Suites de `apps/api` en verde con `Cached: 0`. Baseline conocido: **21 fallos
   preexistentes** en `clamp-page-endpoints.controller.http.spec.ts`, que no deben
   aumentar. *(Nota: esa suite falla al compilar un `TestingModule`; es plausible que
   comparta causa raíz con este defecto. Si al corregir el bootstrap esos 21 pasan a
   verde, dilo — sería el cierre de una deuda que arrastramos desde hace tres auditorías.)*
6. `typecheck` y `lint` en verde.
7. El informe declara si `main` arrancaba y desde qué commit deja de hacerlo.

---

## 6. Evidencia de cierre

- Salida del arranque exitoso y de la respuesta del healthcheck.
- Resultado de E0: commit exacto a partir del cual falla.
- Demostración de que E3 falla al revertir la corrección.
- Informe en `docs/informes/` con la vía elegida y su justificación.

---

## 7. Cuándo detenerte y escalar

- Concluyes que el ciclo revela un boundary mal trazado entre MOD09, MOD10 y MOD11.
- La corrección exige cambiar el contrato de `EXECUTION_ORDER_SCHEDULING_PORT`.
- `main` tampoco arranca: deja de ser un problema de esta rama y pasa a ser un incidente
  del programa, con prioridad sobre todo lo demás.
- Los 21 fallos de `clamp-page-endpoints` resultan tener esta misma causa raíz: cambia el
  alcance de lo que dábamos por baseline.
