# TABLERO — Plataforma · Experiencia de arranque e instalación

**Versión:** 1.0
**Estado:** **Abierto — no autoriza merge ni producción**
**Fecha de apertura:** 2026-08-09
**Mantenedor del tablero:** AI-EM-ARCH
**HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md)
**ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md)
**Informe consolidado:** [INFORME-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../informes/INFORME-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md)

---

## Cómo se usa este tablero

- **Cada agente actualiza únicamente la fila de su fase**, al cerrarla. No toca el resto.
- **AI-EM-ARCH mantiene** las secciones de contratos, gates, bloqueos y deuda.
- El tablero es un **rollup**, no una fuente primaria: el detalle vive en el checklist de cada fase y la evidencia en su informe.
- Estados de fase: `Abierta` · `En curso` · `Cerrada` · `Bloqueada`.

---

## 1. Estado por fase

| Fase | Responsable | Estado | Checklist | Informe | Bloqueada por | Última actualización |
| --- | --- | --- | --- | --- | --- | --- |
| **F0** contratos | AI-SR-FULL · AI-DS-OWNER · AI-PROD-UX · AI-SEC-ENG | Abierta | [F0](CHECKLIST-PLATAFORMA-ARRANQUE-F0-v1.0.md) | pendiente | G1 del CTO sobre ADR-079 | 2026-08-09 |
| **F1** terminal | AI-PLAT-OPS | Abierta | [F1](CHECKLIST-PLATAFORMA-ARRANQUE-F1-v1.0.md) | pendiente | F0 (C2, C4) | 2026-08-09 |
| **F2** API de estado | AI-SR-FULL | Abierta | [F2](CHECKLIST-PLATAFORMA-ARRANQUE-F2-v1.0.md) | pendiente | F0 (C1) | 2026-08-09 |
| **F3** pantalla | AI-FE-PLATFORM · AI-DS-OWNER · AI-PROD-UX | Abierta | [F3](CHECKLIST-PLATAFORMA-ARRANQUE-F3-v1.0.md) | pendiente | F0 (C1, C3, C4) | 2026-08-09 |
| **F4a** proxy desarrollo | AI-PLAT-OPS | Abierta | [F4a](CHECKLIST-PLATAFORMA-ARRANQUE-F4A-v1.0.md) | pendiente | F3 | 2026-08-09 |
| **F4b** proxy producción | AI-PLAT-OPS | **Cerrada — diferida** | [F4b](CHECKLIST-PLATAFORMA-ARRANQUE-F4B-v1.0.md) | no aplica | Disparador de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) | 2026-08-09 |
| **F5** instalador | AI-PLAT-OPS · AI-SEC-ENG | **Bloqueada** | [F5](CHECKLIST-PLATAFORMA-ARRANQUE-F5-v1.0.md) | pendiente | Bloqueo B-01 (cierre) | 2026-08-09 |
| **F6** calidad | AI-SR-QA | Abierta | [F6](CHECKLIST-PLATAFORMA-ARRANQUE-F6-v1.0.md) | pendiente | F1–F5 | 2026-08-09 |
| **F7** cierre | AI-EM-ARCH | Abierta | — | consolidado | F6 | 2026-08-09 |

**Camino crítico:** F0 → F3 → F4a → F6. F1, F2 y F5 caben dentro de esa ventana. **F4b está fuera del camino crítico**: el frente alcanza G6 y G6.5 sin ella, declarando entrega parcial por diferimiento aprobado — no por deuda.

---

## 2. Contratos congelados

Un contrato sin artefacto localizable y sin declaración de congelación en el prompt de fase **no está congelado**.

| Id | Contrato | Artefacto | Autor | Aprueba | Estado | Versión | Desbloquea |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **C1** | API de estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | AI-SR-FULL | AI-EM-ARCH + AI-SEC-ENG | Pendiente | — | F1, F2, F3 |
| **C2** | Shape del archivo de estado de desarrollo | Declarado en `INFORME-PLATAFORMA-ARRANQUE-F1-v1.0.md` | AI-PLAT-OPS | AI-EM-ARCH | Pendiente | — | F1, F4a |
| **C3** | Tokens y geometría del medidor no-React | `docs/specs/2026-08-09-arranque-sistema-ds-contrato.md` | AI-DS-OWNER | AI-PROD-UX | Pendiente | — | F3 |
| **C4** | Identificadores de paso y copy | `docs/specs/2026-08-09-arranque-sistema-ux-spec.md` | AI-PROD-UX | AI-PLAT-OPS | Pendiente | — | F1, F3 |

**Regla de re-sincronización:** un cambio de contrato es el **único** evento que fuerza re-sincronizar los tracks. Se coordina vía AI-EM-ARCH, se versiona y se notifica. **Nunca se parchea en silencio.**

---

## 3. Gates

Los tres gates de cierre **no son grados de lo mismo**: ninguno se obtiene por cumplir el anterior.

| Gate | Pregunta que responde | Aprueba | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| **G1** | ¿La definición es correcta? | **CTO** — el frente emite ADR, no se autofirma | **✅ Cumplido 2026-08-09** | ADR-079 **Aprobado** con Decisión 4 de ejecución diferida · HLD Aprobado |
| **G2** | ¿La solución UX/DS respeta el alcance? | AI-EM-ARCH | Pendiente | C3 + C4 |
| **G3** | ¿Es factible? | AI-EM-ARCH | Pendiente | Dictamen AI-SEC-ENG sobre C1 |
| **G4** | ¿Hay prompt de ejecución? | AI-EM-ARCH | **✅ Cumplido 2026-08-09** | 8 prompts emitidos (F0, F1, F2, F3, F4a, F4b, F5, F6) |
| **G5** | ¿Los gates técnicos pasan? | AI-EM-ARCH | Pendiente | Informes F1, F2, F3, F4a, F5 |
| **G6** | ¿La calidad es aceptable? | AI-EM-ARCH | Pendiente | Informe F6 |
| **G6.5** | ¿Se puede mergear? | AI-EM-ARCH consolida, AI-PLAT-OPS ejecuta | Pendiente | Corrida de CI en Linux **por SHA** |
| **G7** | ¿Se puede desplegar? | AI-EM-ARCH recomienda, **CTO aprueba** | **No aplica** | El dominio productivo sigue diferido por [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) |

**G1 se cumplió con alcance declarado:** el CTO aprobó seis decisiones con vigencia inmediata y la Decisión 4 con **ejecución diferida**. G5 y G6 se evalúan sobre el alcance abierto —F4b queda fuera— y el cierre del frente declarará **entrega parcial por diferimiento aprobado**, que no es deuda.

---

## 4. Bloqueos, consultas y desempates abiertos

| Id | Tipo | De → A | Asunto | Bloquea | Abierto desde | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| **B-01** | `[ESCALACION AL CTO]` | AI-EM-ARCH → CTO | Creación del primer administrador de plataforma en producción — [detalle](DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md) | Cierre de **F5** únicamente | 2026-08-09 | **Abierto** |
| **DES-01** | `[DESEMPATE]` | AI-EM-ARCH | Medio de la marca de vida del worker: **caché**, no archivo local. Cierra la elección que [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md) dejó abierta, porque F2 debe leerla desde otro contenedor | Nada — desbloquea F2 | 2026-08-09 | **Resuelto** |
| **DIF-01** | Diferimiento aprobado | CTO → frente | **Decisión 4 de ADR-079 con ejecución diferida** al disparador de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado): hoy no hay entorno donde observar CA-F4B-01, 02 y 03 | Solo **F4b** | 2026-08-09 | **Vigente** |

**Regla:** un marcador emitido y no atendido **no caduca: escala**. Si B-01 no se resuelve en la sesión siguiente a su emisión, sube al CTO como escalación con la opción recomendada.

---

## 4bis. Observaciones sobre el estado del repositorio

Hallazgos detectados al verificar los gates documentales de este frente. **No pertenecen al frente** y no se corrigen aquí; se registran porque afectan a cualquiera que ejecute sus fases.

| Id | Observación | Evidencia | Dueño sugerido |
| --- | --- | --- | --- |
| **OBS-01** | **`pnpm audit:adr-citations` y `pnpm audit:doc-locations` no están cableados en `.github/workflows/`.** El protocolo §4 los declara gates bloqueantes (#11 y #12), pero CI solo ejecuta `audit:docker-context`, `test:tooling`, `sync:agents:check`, `lint`, `typecheck` y `build`. **Consecuencia práctica: un prompt mal ubicado o una cita sin marcador no los detiene nadie automáticamente.** Cada fase de este frente debe correrlos a mano antes de cerrar | `grep "audit:adr-citations" .github/workflows/*.yml` → sin resultados | AI-PLAT-OPS + AI-EM-ARCH |
| ~~**OBS-02**~~ | ~~`pnpm audit:adr-citations` reporta 17 bloqueantes preexistentes, todos del frente SEC-P1 y de la remediación raíz~~ · **RESUELTA el 2026-08-09** por el commit `d86a6005` *"docs(adr): marcar citas de ADRs propuestos en SEC-P1 y plataforma"*, que añadió los marcadores faltantes. El audit global quedó en **`BLOQUEANTE: 0`** | Salida del audit tras `d86a6005` | — |

---

## 5. Deuda registrada

| Id | Descripción | Severidad | Estado | Dueño |
| --- | --- | --- | --- | --- |
| **D-01** | Defecto de proxy en desarrollo: la ruta de API y la de salud devuelven error con el host de binding en loopback | Media | **No se corrige — fuera de alcance por ADR-078** *(propuesto)*. Se evita por construcción | AI-PLAT-OPS |
| **D-02** | El probe del contenedor de trabajos en segundo plano no verifica nada — hallazgo B4 del [informe de auditoría Docker](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) | Media | **No es deuda de este frente.** Ya encargada a [PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md](../prompts/PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md), pendiente de ejecución. F2 **consume** su latido y **DES-01** cierra la elección de medio | AI-SR-FULL |
| **D-03** | El corpus sigue sin PRD de instalación de producto (empaquetado, licenciamiento, actualización asistida, migración entre versiones) | Baja | **Residual declarado** en ADR-079 | AI-EM-ARCH |
| **D-04** | Duplicación deliberada del lenguaje visual del medidor entre la pantalla vanilla y el design system | Baja | **Aceptada** por ADR-079, contenida por C3 y la prueba anti-deriva | AI-DS-OWNER |

---

## 6. Restricciones que ninguna fase puede relajar

Se repiten aquí porque son las que más probablemente se erosionen bajo presión de entrega:

1. **No se toca el host de binding ni se corrige el defecto de proxy de desarrollo.** ADR-078 *(propuesto)*.
2. **La visibilidad de la descarga nunca puede tumbar un arranque.** ADR-079 Decisión 7.
3. **Las tres obligaciones de F4b son inseparables**: dependencia relajada, upstreams dinámicos y probe corregido. Y **F4b no se adelanta** porque la Decisión 4 ya esté aprobada — su ejecución está diferida (riesgo R8 de ADR-079).
4. **Ninguna salida imprime el valor de un secreto**, en ningún modo, en ninguna fase.
5. **La superficie de estado no crece por conveniencia.** Ampliarla exige ADR.
6. **Toda excepción de seguridad escala al CTO.** AI-EM-ARCH no puede concederla.
7. **Un `[x]` sin evidencia citable es defecto bloqueante.**
8. **Una suite verde sin `Cached: 0` no es evidencia.**

---

## 7. Bitácora del tablero

| Fecha | Quién | Cambio |
| --- | --- | --- |
| 2026-08-09 | AI-EM-ARCH | Apertura del frente. HLD, ADR-079, 7 prompts, 7 checklists y este tablero emitidos. G4 cumplido. B-01 escalado al CTO |
| 2026-08-09 | CTO + AI-EM-ARCH | **G1 CUMPLIDO — ADR-079 Aprobado** con la Decisión 4 de ejecución diferida al disparador de ADR-070 (superado). Motivo: `docker-compose.e2e.yml` no incluye proxy ni aplicaciones, y los marcadores de dominio deben conservarse intactos, así que tres criterios de la fase no son observables hoy. **F4 se parte en F4a (abierta) y F4b (cerrada).** Retirados los artefactos F4 unificados, recuperables desde `89c44ad4`. Retirado el marcador `(propuesto)` de las citas a ADR-079 en todo el corpus. Fechas corregidas a 2026-08-09. **F0 queda desbloqueada** |
| 2026-08-09 | AI-EM-ARCH | **DES-01 resuelto.** Detectado que el latido del worker ya estaba encargado a `PROMPT-SR-FULL-WORKER-HEARTBEAT-v1.0.md`: F2 pasa de definirlo a consumirlo, y se cierra la elección de medio a favor de la caché. Corregidos HLD §5 y §7.2, ADR-079 §Consecuencias, prompt y checklist de F2, y deuda D-02 |
