# PROMPT — Plataforma · Experiencia de arranque · Fase F6: calidad y evidencia

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-SR-QA
**Etapa del workflow:** 6 (review de experiencia y calidad) — habilita **G6**
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F6-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F6-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F6-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** evidencia verificable de que los diez criterios de aceptación del HLD se cumplen, y de que ninguna de las restricciones de seguridad del ADR-079 puede violarse sin que la integración continua lo detecte.

**Lo que sí entra:**

- Trazabilidad criterio ↔ prueba para los criterios del HLD y los de aceptación de F1, F2, F3, F4a y F5.

> **Alcance recortado por diferimiento aprobado.** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) quedó aprobado con la Decisión 4 de ejecución diferida, así que **F4b no se verifica en esta fase** y sus criterios se reportan como **"diferido — fase cerrada"**, que **no es lo mismo que no cubierto**. Lo mismo aplica a **CA-HLD-05** y **CA-HLD-08**, que dependen de F4b. Confundir *diferido* con *no cubierto* falsea el informe en ambos sentidos.
- Pruebas de extremo a extremo de la pantalla contra los archivos de estado de ejemplo de las cinco fases.
- Auditoría de accesibilidad sobre la pantalla en sus cinco fases.
- Verificación del modo no interactivo del arranque de desarrollo.
- Verificación del modo de simulación del instalador sobre un clon limpio.
- **Controles negativos de las restricciones de seguridad**: comprobar que cada guardia falla cuando debe.
- Consolidación de la evidencia de todas las fases con `Cached: 0`.

**Lo que no entra:**

- Implementar o corregir producto. AI-SR-QA **verifica, no implementa**. Todo hallazgo se devuelve al agente responsable de su fase.
- Aprobar G6.5 o G7 — corresponde a F7 y al CTO.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §10 — los diez criterios del frente
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) — Decisiones 5 y 7 son las que exigen control negativo
- **Prompts e informes de F1 a F5** y sus checklists
- **Contratos C1, C3, C4** y el shape C2 declarado en el informe de F1

---

## 3. Instrucciones

1. **Matriz de trazabilidad.** Una fila por criterio de aceptación —los del HLD más los de cada fase abierta— con la prueba que lo cubre, su ruta y su resultado. **Un criterio sin prueba se reporta como no cubierto, nunca se estima.** Los criterios de fases diferidas se reportan como **"diferido"** con su condición de apertura, y no cuentan como faltantes.

2. **Extremo a extremo de la pantalla.** Contra los archivos de estado de ejemplo que produjo F3: las cinco fases, los cuatro estados de componente, la ausencia de componentes en régimen estable, la redirección al completarse y el mantenimiento del último estado bueno ante respuesta ausente o malformada.

3. **Accesibilidad.** Auditoría automatizada sobre la pantalla en sus cinco fases, más verificación manual de navegación sin ratón y de anuncio del cambio de paso.

4. **Controles negativos de seguridad — el núcleo de esta fase.** No basta con que las guardias existan: hay que comprobar que **fallan cuando deben**:
   - Añadir un campo al DTO de estado → la prueba de forma debe fallar.
   - Eliminar del design system un token que usa la pantalla → la prueba anti-deriva debe fallar.
   - Introducir en el instalador una línea que emita una variable de secreto → la prueba de higiene debe fallar.
   - *(Solo si F4b está abierta)* Apuntar el probe del contenedor de proxy a la raíz → la prueba de F4b debe fallar. **Con F4b diferida este control no aplica** y se reporta como tal, no como no cubierto.
   - Presentar un destino de redirección de otro origen → la pantalla no debe seguirlo.
   - Cada control negativo se ejecuta, se registra su fallo esperado y **se revierte**.

5. **Modo no interactivo.** Ejecutar el arranque sin terminal interactiva y verificar contador de paso, ausencia de secuencias de escape y señal periódica de vida.

6. **Simulación del instalador** sobre un clon limpio, incluida la verificación del gate de referencias de imagen y del bloque de pendiente sobre el primer administrador.

7. **Resistencia del progreso.** Verificar que el arranque completa con la descarga desactivada, sin red y con la caché de imágenes llena — los tres caminos que ADR-079 Decisión 7 exige que no sean modo de fallo.

8. **Evidencia con `Cached: 0`.** Toda suite reportada adjunta la línea de resumen del orquestador de tareas mostrando cero entradas de caché. **Una suite en verde sin esa línea no es evidencia**: pudo no haber ejecutado nada.

9. **Hallazgos.** Clasificados por severidad crítica, alta, media o baja, cada uno con el agente responsable de su fase. Los críticos y altos bloquean G6.

---

## 4. Restricciones no negociables

1. **AI-SR-QA no implementa producto.** Escribe pruebas y reporta hallazgos.
2. **Ningún criterio se da por cumplido sin prueba citable.** Sin cobertura se reporta **no cubierto**, jamás se estima.
3. **Toda evidencia de suite lleva `Cached: 0`.**
4. **Los controles negativos se revierten** tras registrarse. No queda ninguno aplicado.
5. **Nunca PII real ni credenciales** en fixtures, capturas o registros.
6. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- Pruebas de extremo a extremo de la pantalla
- Auditoría de accesibilidad automatizada
- Verificaciones de modo no interactivo y de simulación del instalador
- Registro de los controles negativos con su fallo esperado
- Suites completas en verde con `Cached: 0`

## 6. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F6-v1.0.md` con la **matriz de trazabilidad completa** y los hallazgos por severidad
- [CHECKLIST-PLATAFORMA-ARRANQUE-F6-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F6-v1.0.md) marcado en vivo
- Fila F6 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

- **CA-F6-01** — Matriz de trazabilidad completa para los criterios del HLD y los de F1, F2, F3, F4a y F5, sin filas vacías ni estimadas. Los de F4b, CA-HLD-05 y CA-HLD-08 constan como **diferidos**, con su condición de apertura.
- **CA-F6-02** — Extremo a extremo de la pantalla en verde para las cinco fases.
- **CA-F6-03** — Auditoría de accesibilidad sin violaciones en las cinco fases.
- **CA-F6-04** — Los controles negativos aplicables ejecutados, con fallo esperado registrado y reversión confirmada. Con F4b diferida son **cuatro**; el del probe de proxy consta como no aplicable.
- **CA-F6-05** — Modo no interactivo verificado.
- **CA-F6-06** — Simulación del instalador verificada sobre clon limpio, incluidos gate y bloque de pendiente.
- **CA-F6-07** — Los tres caminos de resistencia del progreso verificados: sin descarga, sin red, con caché llena.
- **CA-F6-08** — Toda evidencia de suite adjunta `Cached: 0`.
- **CA-F6-09** — Hallazgos clasificados por severidad y asignados a agente responsable.
- **CA-F6-10** — Cero hallazgos críticos o altos abiertos al cierre, o su escalación registrada.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- Algún control negativo **no falla** cuando debería → la guardia correspondiente no existe realmente; es hallazgo crítico y bloquea G6.
- Alguna suite no puede reportar `Cached: 0` → no hay evidencia de ejecución.
- Un criterio del HLD no es verificable con el producto entregado → se devuelve a la fase responsable.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.

## 9. Criterio de salida de la fase

- [ ] Matriz de trazabilidad completa y publicada
- [ ] Suites en verde con `Cached: 0`
- [ ] Controles negativos ejecutados, registrados y revertidos
- [ ] Accesibilidad sin violaciones
- [ ] Hallazgos clasificados, asignados y sin críticos ni altos abiertos
- [ ] **G6 recomendado a AI-EM-ARCH** — G6.5 y G7 corresponden a F7
- [ ] Informe de fase archivado y checklist completo
