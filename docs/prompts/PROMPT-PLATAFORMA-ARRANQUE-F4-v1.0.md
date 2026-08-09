# PROMPT — Plataforma · Experiencia de arranque · Fase F4: cableado del proxy en desarrollo y producción

**Versión:** 1.0
**Fecha:** 2026-08-08
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-PLAT-OPS
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F4-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F4-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4-v1.0.md`

> **Esta es la fase de mayor riesgo del frente.** Toca la configuración de proxy y la composición de producción. Sus tres obligaciones son **inseparables**: se entregan juntas o no se entregan (ADR-079 *(propuesto)* Decisión 4).

---

## Contratos congelados que consume esta fase

| Id | Contrato | Ruta | Versión |
|---|---|---|---|
| C1 | Forma del estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | 1.0 |
| C2 | Shape del archivo de estado de desarrollo | Declarado en `INFORME-PLATAFORMA-ARRANQUE-F1-v1.0.md` | 1.0 |

Depende de que F3 haya entregado los archivos de la pantalla, aunque sea en esqueleto.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que la pantalla de arranque sea accesible en desarrollo y en producción, alimentada por el origen correcto en cada entorno, **sin romper el proxy existente** y sin declarar sano un sistema que solo sabe decir que está arrancando.

**Lo que sí entra:**

- Configuración de proxy en desarrollo: servir la pantalla en la raíz y exponer el archivo de estado por sistema de archivos.
- Configuración de proxy en producción: resolución dinámica de upstreams, interceptado de errores, pantalla como página de error de upstream, y una respuesta de estado mínima mientras la API no existe.
- Montaje de volúmenes en la composición base y de producción.
- Relajación de la condición de dependencia del proxy de producción.
- **Cambio del probe del contenedor de proxy y reescritura del comentario que justificaba la condición anterior.**
- Pruebas de no regresión sobre la configuración.

**Lo que no entra:**

- **Corregir el defecto de proxy en desarrollo o mover el host de binding.** Prohibido por [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)*.
- Terminación TLS, certificados o renovación.
- Cambiar cualquier otra condición de dependencia de la composición.
- El contenido de la pantalla (F3) o el endpoint (F2).

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §4.3, §4.4, §7.1 R2, R6, R7
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) *(propuesto)* — **Decisión 4 completa, incluidas sus tres obligaciones, y la sección §Consecuencias → "Razón técnica que queda sustituida"**
- **ADR:** [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* — por qué el defecto de desarrollo no se toca
- **Código vigente:** `nginx/nginx.dev.conf`, `nginx/nginx.prod.conf`, `docker-compose.yml`, `docker-compose.prod.yml`, `scripts/nginx-config.test.mjs`
- **Entregables de F3:** `nginx/boot/`

---

## 3. Instrucciones

### 3.1 Desarrollo

1. Servir la pantalla en la raíz del proxy, sustituyendo la respuesta estática actual.
2. Exponer el archivo de estado por sistema de archivos, desde el directorio que produce F1. **Sin proxy, sin CORS**: en desarrollo la pantalla no habla con la API.
3. **Los bloques de ubicación de API y de salud quedan idénticos byte a byte.** `scripts/nginx-config.test.mjs` asserta sus literales, y además cualquier cambio ahí tocaría el defecto que ADR-078 *(propuesto)* protege.
4. **Los comentarios que documentan el defecto de proxy se conservan íntegros.** No reescribirlos, no marcarlos como resueltos, no eliminarlos. Siguen siendo verdad.

### 3.2 Producción

5. **Resolución dinámica de upstreams.** Configurar el resolutor del DNS interno del runtime y referenciar cada upstream por variable, con `proxy_pass` **sin parte de URI** para conservar el request URI original. Sin esto, con la dependencia relajada el proxy se negaría a arrancar cuando los contenedores destino aún no existan.
6. **Interceptado de errores de upstream** y ubicación con nombre que sirva la pantalla cuando el upstream no responde.
7. **Ruta de estado con respaldo.** La ruta del archivo de estado hace proxy al endpoint de la API; si la API todavía no existe, una ubicación de respaldo devuelve una respuesta de arranque mínima **con la forma de C1**, sin almacenamiento en caché.
8. **Relajar la condición de dependencia** del proxy a una dependencia mínima sobre la base de datos.
9. **Cambiar el probe del contenedor de proxy de la raíz a la ruta de salud.** Sin este cambio, el contenedor se declara sano sirviendo la pantalla de "arrancando", que invierte el significado del probe. **Es inseparable del punto 8.**
10. **Reescribir el comentario que justificaba la condición anterior**, en el mismo cambio. El comentario vigente explica que la condición se endureció porque el proxy devolvía error hasta que la aplicación abría su puerto. Esa razón queda **sustituida**, no invalidada: el error deja de ser observable porque se sirve la pantalla en su lugar. El comentario nuevo debe decir exactamente eso y citar ADR-079 *(propuesto)*. **Relajar la condición dejando el comentario intacto es defecto bloqueante**: deja dos razones contradictorias vigentes en el mismo archivo.

### 3.3 Volúmenes

11. En la composición base, montar en solo lectura el directorio de la pantalla y el directorio del archivo de estado de desarrollo.
12. **Montar el directorio, nunca el archivo suelto.** La escritura atómica de F1 sustituye el inodo; con un montaje de archivo el contenedor conservaría indefinidamente la versión antigua.
13. En la composición de producción, montar el directorio de la pantalla en el proxy.

### 3.4 Pruebas de configuración

14. Ampliar `scripts/nginx-config.test.mjs` con no-regresión: que la configuración de desarrollo **conserva** sus dos bloques de ubicación literales, y que la de producción define la ubicación con nombre de la pantalla, el respaldo de estado y el resolutor.
15. Añadir una prueba que asserta que el probe del contenedor de proxy de producción **no** apunta a la raíz.

---

## 4. Restricciones no negociables

1. **Las tres obligaciones de la Decisión 4 son inseparables:** relajación de dependencia, resolución dinámica de upstreams y cambio de probe. Entregar la primera sin la tercera es una **regresión real de disponibilidad**.
2. **El comentario sustituido se reescribe en el mismo commit** que relaja la condición.
3. **Los bloques de ubicación de API y salud de desarrollo quedan byte a byte idénticos.**
4. **No tocar el host de binding ni intentar corregir el defecto de proxy de desarrollo** — ADR-078 *(propuesto)*.
5. **No cambiar ninguna otra condición de dependencia** de ninguna otra composición.
6. **No añadir puertos publicados nuevos** ni ampliar la superficie de red.
7. **Validar la composición de producción sin volcar su contenido** — la validación debe ser silenciosa para no imprimir secretos.
8. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- `nginx/nginx.dev.conf` y `nginx/nginx.prod.conf` actualizados
- `docker-compose.yml` y `docker-compose.prod.yml` con volúmenes, dependencia relajada, probe corregido y **comentario reescrito**
- `scripts/nginx-config.test.mjs` ampliado
- `pnpm test:tooling` y `pnpm audit:docker-context` en verde

## 6. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md), **con el texto anterior y el nuevo del comentario sustituido transcritos**
- Actualizar el runbook de operación con la regla: **la raíz responde con la pantalla de arranque; la sonda máquina-a-máquina es la ruta de salud**
- [CHECKLIST-PLATAFORMA-ARRANQUE-F4-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F4-v1.0.md) marcado en vivo
- Fila F4 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

- **CA-F4-01** — En desarrollo, la raíz del proxy sirve la pantalla y el archivo de estado se lee por sistema de archivos.
- **CA-F4-02** — Los bloques de ubicación de API y salud de desarrollo son idénticos byte a byte. Verificable en el diff.
- **CA-F4-03** — Los comentarios que documentan el defecto de proxy de desarrollo siguen presentes y sin modificar.
- **CA-F4-04** — En producción, el proxy **arranca** aunque los contenedores de aplicación no existan todavía.
- **CA-F4-05** — Abrir la raíz mientras corre el migrador devuelve 200 con la pantalla, no una conexión rechazada.
- **CA-F4-06** — La ruta de estado devuelve una respuesta con forma de C1 incluso antes de que la API exista.
- **CA-F4-07** — Con el sistema completo, el proxy sirve la aplicación normalmente y las rutas de API conservan su URI original. Con control de regresión.
- **CA-F4-08** — El probe del contenedor de proxy apunta a la ruta de salud, con prueba automatizada.
- **CA-F4-09** — El contenedor de proxy **no** se declara sano mientras la API no responde. Verificado observando su estado durante el arranque.
- **CA-F4-10** — El comentario sustituido está reescrito, cita ADR-079 *(propuesto)* y su texto anterior consta en el informe.
- **CA-F4-11** — Los montajes son de directorio; la escritura atómica se refleja en el contenedor. Verificado sobrescribiendo el archivo con el contenedor vivo.
- **CA-F4-12** — La validación de la composición de producción pasa sin imprimir secretos.
- **CA-F4-13** — Evidencia de suites con **`Cached: 0`**.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- La resolución dinámica de upstreams no consigue conservar el URI original → afecta a todas las rutas de API en producción; **no se entrega una versión parcial**.
- Relajar la dependencia deja el proxy sirviendo la pantalla **después** de que el sistema esté listo → error de interceptado; es peor que el estado actual.
- El probe no puede apuntar a la ruta de salud por alguna restricción del contenedor → **entonces la relajación de dependencia tampoco se entrega**.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.
**Reversión:** esta fase es la única con reversión acoplada. Revertir exige restaurar **a la vez** la condición de dependencia, el probe y el comentario.

## 9. Criterio de salida de la fase

- [ ] Pantalla accesible en desarrollo durante todo el arranque
- [ ] Pantalla accesible en producción durante las migraciones
- [ ] Tránsito verificado de pantalla a aplicación en ambos entornos
- [ ] Probe corregido y verificado por prueba
- [ ] Comentario sustituido reescrito, con texto anterior transcrito en el informe
- [ ] Pruebas de configuración ampliadas y en verde
- [ ] Runbook actualizado con la regla de raíz frente a ruta de salud
- [ ] Informe de fase archivado con `Cached: 0` y checklist completo
