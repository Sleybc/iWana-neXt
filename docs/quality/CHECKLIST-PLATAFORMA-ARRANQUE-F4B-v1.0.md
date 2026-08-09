# CHECKLIST — Plataforma · Experiencia de arranque · F4b cableado del proxy en producción

**Fecha de apertura:** 2026-08-09
**Estado:** **CERRADA — no ejecutar.** Diferida por decisión aprobada
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F4B-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F4B-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4B-v1.0.md`
**Responsable:** AI-PLAT-OPS
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## ⛔ Condición de apertura

**Esta fase no se ejecuta.** El CTO aprobó [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) el 2026-08-09 con la **Decisión 4 de ejecución diferida**.

**Se abre con una sola condición, que no es de calendario:** que se active el **disparador de reactivación de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md)**. La apertura la declara AI-EM-ARCH de forma explícita, actualizando este encabezado, la fila del tablero y el informe consolidado.

**Por qué está cerrada.** Tres criterios de esta fase —CA-F4B-01, 02 y 03— **no son verificables hoy**: no existe entorno donde instanciar el proxy de producción sin sus upstreams, y resolver los marcadores de dominio para poder probar sería elegir dominio, que es justo lo que ADR-070 difiere. Ejecutarla obligaría a declararlos cumplidos sin observarlos, que es **evidencia ficticia** prohibida por ADR-070 §Decisión 2.

**Riesgo R8 de ADR-079:** que alguien ejecute esta fase "porque la decisión ya está aprobada". La decisión lo está; **su ejecución no**. Relajar la condición de dependencia sin poder comprobar la sustitución es la única forma en que la Decisión 4 sí sería una regresión real de disponibilidad.

- [ ] **Disparador de ADR-070 activado**
- [ ] **Fase abierta explícitamente por AI-EM-ARCH**, con fecha y firma en este encabezado
- [ ] F3 y F4a cerradas

**Mientras estas tres casillas estén vacías, ninguna casilla de abajo puede marcarse.**

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase.**
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Las tres obligaciones inseparables — ADR-079 Decisión 4

Se entregan en el **mismo cambio**. Ninguna se marca sola.

- [ ] **(a)** Condición de dependencia del proxy relajada a dependencia mínima sobre la base de datos
- [ ] **(b)** Resolutor del DNS interno configurado y upstreams referenciados por variable
- [ ] **(b)** `proxy_pass` **sin parte de URI**, conservando el request URI original *(CA-F4B-05)*
- [ ] **(c)** Probe del contenedor de proxy movido de la raíz a la ruta de salud *(CA-F4B-06)*

## 2. Comentario sustituido

- [ ] Comentario que justificaba la condición anterior **reescrito en el mismo commit** que la relaja *(CA-F4B-07)*
- [ ] El comentario nuevo explica que la razón queda **sustituida**, no invalidada
- [ ] El comentario nuevo cita ADR-079
- [ ] **Texto anterior y texto nuevo transcritos en el informe de fase** *(CA-F4B-07)*

## 3. Interceptado y respaldo

- [ ] Interceptado de errores de upstream activado
- [ ] Ubicación con nombre que sirve la pantalla cuando el upstream no responde
- [ ] La ruta de estado hace proxy al endpoint de la API
- [ ] Ubicación de respaldo que devuelve una respuesta mínima **con la forma de C1**, sin almacenamiento en caché *(CA-F4B-04)*
- [ ] Directorio de la pantalla montado en solo lectura en el proxy de producción

## 4. Los tres criterios que motivaron el diferimiento

**Se observan, no se infieren.** Si al abrir la fase siguen sin ser observables, la fase **vuelve a cerrarse**.

- [ ] El proxy **arranca** aunque los contenedores de aplicación no existan *(CA-F4B-01)*
- [ ] Abrir la raíz mientras corre el migrador devuelve 200 con la pantalla *(CA-F4B-02)*
- [ ] El contenedor de proxy **no se declara sano** mientras la API no responde *(CA-F4B-03)*

## 5. No regresión y límites

- [ ] Con el sistema completo, las rutas de API conservan su URI original — con control de regresión *(CA-F4B-05)*
- [ ] La pantalla **deja** de servirse una vez el sistema está listo *(CA-F4B-08)*
- [ ] Validación de la composición de producción ejecutada **de forma silenciosa**, sin imprimir secretos *(CA-F4B-09)*
- [ ] Marcadores de dominio intactos, o resueltos conforme a lo que determine ADR-070 *(CA-F4B-10)*
- [ ] **No se definió dominio, hosting, autoridad certificadora ni objetivos de recuperación** — es del CTO vía ADR-070
- [ ] **Ninguna otra condición de dependencia** fue modificada
- [ ] **No se añadieron puertos publicados nuevos**
- [ ] `pnpm audit:docker-context` en verde

## 6. Pruebas de configuración

- [ ] Producción define la ubicación con nombre de la pantalla, el respaldo de estado y el resolutor
- [ ] Prueba que asserta que el probe del contenedor de proxy **no** apunta a la raíz *(CA-F4B-06)*

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test:tooling` | no aplica — fase cerrada | — | — |
| `pnpm audit:docker-context` | no aplica — fase cerrada | n/a | — |
| Validación silenciosa de composición de producción | no aplica — fase cerrada | n/a | — |
| Arranque de producción observado durante migraciones | **no verificable hoy** — motivo del diferimiento | n/a | — |

---

## Pendientes, bloqueos y consultas

**Estado de la fase al 2026-08-09:** cerrada por diferimiento aprobado. **No es un bloqueo ni deuda**: es una decisión de secuencia tomada por el CTO al aprobar ADR-079.

## Salida de fase

- [ ] Disparador de ADR-070 activado y fase abierta por AI-EM-ARCH
- [ ] Las tres obligaciones entregadas en el mismo cambio
- [ ] CA-F4B-01, 02 y 03 **observados**, no inferidos
- [ ] Runbook actualizado con la regla: **la raíz sirve la pantalla; la sonda máquina-a-máquina es la ruta de salud**
- [ ] Informe de fase archivado con `Cached: 0` y con ambos textos del comentario
- [ ] Fila F4b del tablero actualizada

---

## Reversión acoplada

Es la única fase del frente con reversión acoplada. Revertir exige restaurar **a la vez** la condición de dependencia, el probe y el comentario.
