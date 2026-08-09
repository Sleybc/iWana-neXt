# CHECKLIST — Plataforma · Experiencia de arranque · F4 cableado del proxy

**Fecha de apertura:** 2026-08-08
**Estado:** Abierto — bloqueado por F3 (artefactos de la pantalla)
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F4-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F4-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4-v1.0.md`
**Responsable:** AI-PLAT-OPS
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

> **Fase de mayor riesgo del frente.** Las tres obligaciones de ADR-079 *(propuesto)* Decisión 4 son **inseparables**: relajación de dependencia, resolución dinámica de upstreams y cambio de probe. Entregar la primera sin la tercera es una regresión real de disponibilidad.

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase.**
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Desarrollo

- [ ] La raíz del proxy sirve la pantalla, sustituyendo la respuesta estática actual *(CA-F4-01)*
- [ ] El archivo de estado se expone por sistema de archivos, desde el directorio que produce F1 *(CA-F4-01)*
- [ ] **Sin proxy y sin CORS** en el camino del estado de desarrollo
- [ ] Los bloques de ubicación de API y de salud quedan **byte a byte idénticos** — verificable en el diff *(CA-F4-02)*
- [ ] Los comentarios que documentan el defecto de proxy **siguen presentes y sin modificar** *(CA-F4-03)*
- [ ] **No se tocó el host de binding** — prohibido por ADR-078 *(propuesto)*

## 2. Producción — las tres obligaciones inseparables

- [ ] **(a)** Condición de dependencia del proxy relajada a dependencia mínima sobre la base de datos
- [ ] **(b)** Resolutor del DNS interno configurado y upstreams referenciados por variable
- [ ] **(b)** `proxy_pass` **sin parte de URI**, conservando el request URI original *(CA-F4-07)*
- [ ] **(c)** Probe del contenedor de proxy movido de la raíz a la ruta de salud *(CA-F4-08)*
- [ ] Las tres se entregan en el **mismo cambio**. Ninguna se marca sola.

## 3. Comentario sustituido

- [ ] Comentario que justificaba la condición anterior **reescrito en el mismo commit** que la relaja *(CA-F4-10)*
- [ ] El comentario nuevo explica que la razón queda **sustituida**, no invalidada
- [ ] El comentario nuevo cita ADR-079 *(propuesto)*
- [ ] **Texto anterior y texto nuevo transcritos en el informe de fase** *(CA-F4-10)*

## 4. Interceptado y respaldo

- [ ] Interceptado de errores de upstream activado
- [ ] Ubicación con nombre que sirve la pantalla cuando el upstream no responde
- [ ] La ruta de estado hace proxy al endpoint de la API
- [ ] Ubicación de respaldo que devuelve una respuesta de arranque mínima **con la forma de C1**, sin almacenamiento en caché *(CA-F4-06)*

## 5. Volúmenes

- [ ] Directorio de la pantalla montado en solo lectura, en composición base y de producción
- [ ] Directorio del archivo de estado de desarrollo montado en solo lectura
- [ ] **Se monta el directorio, nunca el archivo suelto** *(CA-F4-11)*
- [ ] Verificado: sobrescribir el archivo con el contenedor vivo se refleja dentro *(CA-F4-11)*

## 6. No regresión

- [ ] **Ninguna otra condición de dependencia** de ninguna otra composición fue modificada
- [ ] **No se añadieron puertos publicados nuevos** ni se amplió la superficie de red
- [ ] Validación de la composición de producción ejecutada **de forma silenciosa**, sin imprimir secretos *(CA-F4-12)*
- [ ] `pnpm audit:docker-context` en verde
- [ ] Con el sistema completo, las rutas de API conservan su URI original — con control de regresión *(CA-F4-07)*

## 7. Pruebas de configuración

- [ ] `scripts/nginx-config.test.mjs` ampliado con no-regresión: desarrollo **conserva** sus dos bloques literales
- [ ] Producción define la ubicación con nombre de la pantalla, el respaldo de estado y el resolutor
- [ ] Prueba que asserta que el probe del contenedor de proxy **no** apunta a la raíz *(CA-F4-08)*

## 8. Verificación funcional

- [ ] En producción, el proxy **arranca** aunque los contenedores de aplicación no existan *(CA-F4-04)*
- [ ] Abrir la raíz mientras corre el migrador devuelve 200 con la pantalla *(CA-F4-05)*
- [ ] El contenedor de proxy **no se declara sano** mientras la API no responde *(CA-F4-09)*
- [ ] Tránsito de pantalla a aplicación verificado en desarrollo
- [ ] Tránsito de pantalla a aplicación verificado en producción
- [ ] La pantalla **deja** de servirse una vez el sistema está listo — no queda pegada

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test:tooling` | pendiente | — | — |
| `pnpm audit:docker-context` | pendiente | n/a | — |
| Validación silenciosa de composición de producción | pendiente | n/a | — |
| Arranque de producción observado durante migraciones | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

- Ninguno al momento de la apertura.

**Reversión acoplada:** esta fase es la única del frente con reversión acoplada. Revertir exige restaurar **a la vez** la condición de dependencia, el probe y el comentario.

## Salida de fase

- [ ] Todos los criterios CA-F4-01 a CA-F4-13 cubiertos con evidencia
- [ ] Runbook actualizado con la regla: **la raíz sirve la pantalla; la sonda máquina-a-máquina es la ruta de salud**
- [ ] Informe de fase archivado con `Cached: 0` y con ambos textos del comentario
- [ ] Fila F4 del tablero actualizada
