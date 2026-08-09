# CHECKLIST — Plataforma · Experiencia de arranque · F6 calidad y evidencia

**Fecha de apertura:** 2026-08-09
**Estado:** Abierto — bloqueado por F1, F2, F3, F4a y F5. **F4b está diferida y no entra en el alcance de verificación**
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F6-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F6-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F6-v1.0.md`
**Responsable:** AI-SR-QA
**Gate que habilita:** **G6**
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase.** AI-SR-QA **verifica, no implementa**: todo hallazgo se devuelve al agente responsable de su fase.
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.** Una suite en verde sin esa línea **no es evidencia**.

---

## 1. Trazabilidad

- [ ] Matriz criterio ↔ prueba para los **diez criterios del HLD** (CA-HLD-01 a CA-HLD-10)
- [ ] Matriz criterio ↔ prueba para los criterios de F1 (CA-F1-01 a 12)
- [ ] Matriz criterio ↔ prueba para los criterios de F2 (CA-F2-01 a 14)
- [ ] Matriz criterio ↔ prueba para los criterios de F3 (CA-F3-01 a 13)
- [ ] Matriz criterio ↔ prueba para los criterios de F4a (CA-F4A-01 a 08)
- [ ] Criterios de F4b (CA-F4B-01 a 11) reportados como **diferidos** con su condición de apertura — **no como no cubiertos**
- [ ] **CA-HLD-05** y **CA-HLD-08** reportados como **diferidos**: dependen de F4b
- [ ] Matriz criterio ↔ prueba para los criterios de F5 (CA-F5-01 a 13)
- [ ] **Ninguna fila vacía ni estimada.** Un criterio sin prueba se reporta **no cubierto** *(CA-F6-01)*

## 2. Extremo a extremo de la pantalla

- [ ] Las cinco fases de arranque *(CA-F6-02)*
- [ ] Los cuatro estados de componente
- [ ] Ausencia de componentes en régimen estable
- [ ] Redirección al completarse
- [ ] Mantenimiento del último estado bueno ante respuesta ausente o malformada

## 3. Accesibilidad

- [ ] Auditoría automatizada sobre las cinco fases, **sin violaciones** *(CA-F6-03)*
- [ ] Verificación manual de navegación sin ratón
- [ ] Verificación manual del anuncio del cambio de paso

## 4. Controles negativos — núcleo de esta fase

Cada uno se ejecuta, se registra su fallo esperado y **se revierte**.

- [ ] Añadir un campo al DTO de estado → la prueba de forma **falla** *(CA-F6-04)*
- [ ] Eliminar del design system un token que usa la pantalla → la prueba anti-deriva **falla** *(CA-F6-04)*
- [ ] Introducir en el instalador una línea que emite un secreto → la prueba de higiene **falla** *(CA-F6-04)*
- [ ] *(Solo con F4b abierta)* Apuntar el probe del contenedor de proxy a la raíz → la prueba de F4b **falla**. Con F4b diferida, **no aplica** *(CA-F6-04)*
- [ ] Presentar un destino de redirección de otro origen → la pantalla **no lo sigue** *(CA-F6-04)*
- [ ] **Los controles aplicables revertidos**; ninguno queda aplicado *(CA-F6-04)*

## 5. Modos de ejecución

- [ ] Modo no interactivo: contador de paso, sin secuencias de escape, señal periódica de vida *(CA-F6-05)*
- [ ] Simulación del instalador sobre clon limpio *(CA-F6-06)*
- [ ] Gate de referencias de imagen verificado *(CA-F6-06)*
- [ ] Bloque de pendiente sobre el primer administrador presente *(CA-F6-06)*

## 6. Resistencia del progreso — ADR-079 Decisión 7

- [ ] El arranque completa con la descarga **desactivada** *(CA-F6-07)*
- [ ] El arranque completa **sin red** *(CA-F6-07)*
- [ ] El arranque completa con la **caché de imágenes llena** *(CA-F6-07)*

## 7. Evidencia y hallazgos

- [ ] Toda suite reportada adjunta la línea de resumen con **`Cached: 0`** *(CA-F6-08)*
- [ ] Hallazgos clasificados por severidad crítica, alta, media o baja *(CA-F6-09)*
- [ ] Cada hallazgo asignado al agente responsable de su fase *(CA-F6-09)*
- [ ] **Cero hallazgos críticos o altos abiertos al cierre**, o su escalación registrada *(CA-F6-10)*
- [ ] Nunca PII real ni credenciales en fixtures, capturas o registros

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test` (completo) | pendiente | — | — |
| `pnpm test:e2e` | pendiente | — | — |
| `pnpm test:tooling` | pendiente | — | — |
| `pnpm lint` | pendiente | — | — |
| `pnpm typecheck` | pendiente | — | — |
| Auditoría de accesibilidad — 5 fases | pendiente | n/a | — |
| Controles negativos (5) | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

- Ninguno al momento de la apertura.

**Regla dura:** si algún control negativo **no falla** cuando debería, la guardia correspondiente no existe realmente. Es hallazgo **crítico** y bloquea G6.

## Salida de fase

- [ ] Matriz de trazabilidad completa y publicada
- [ ] Suites en verde con `Cached: 0`
- [ ] Controles negativos ejecutados, registrados y revertidos
- [ ] Hallazgos clasificados, asignados y sin críticos ni altos abiertos
- [ ] **G6 recomendado a AI-EM-ARCH** — G6.5 y G7 corresponden a F7
- [ ] Informe de fase archivado y fila F6 del tablero actualizada
