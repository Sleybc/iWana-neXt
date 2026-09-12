# PROMPT — Plataforma · Experiencia de arranque · Fase F4b: cableado del proxy en producción

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-PLAT-OPS
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F4B-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F4B-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4B-v1.0.md`

---

## ⛔ ESTADO: FASE CERRADA — NO EJECUTAR

**Esta fase no está abierta.** El CTO aprobó [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) el 2026-08-09 con la **Decisión 4 de ejecución diferida**. Este prompt existe para que el trabajo esté definido y listo, no para que se ejecute hoy.

**Condición de apertura — una sola, y no es de calendario:** que se active el **disparador de reactivación de [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado)**. Cuando eso ocurra, AI-EM-ARCH abre esta fase explícitamente, actualiza su fila en el tablero y lo registra en el informe consolidado.

**Por qué está diferida** (detalle en ADR-079 §Consecuencias → *"Por qué la Decisión 4 se difiere"*):

1. `docker-compose.e2e.yml` **no incluye proxy ni contenedores de aplicación** — no existe entorno donde observar el arranque del proxy sin sus upstreams.
2. `nginx/nginx.prod.conf` conserva los marcadores de dominio que **ADR-070 (superado) §Decisión 2 ordena mantener intactos**, y el gate de prerrequisitos de producción hace fallar un archivo de entorno productivo que aún los contenga. Resolverlos para poder probar sería *elegir dominio*, justo lo que ADR-070 difiere.
3. En consecuencia, tres criterios de aceptación de esta fase **no son verificables hoy**. Ejecutarla obligaría a declararlos cumplidos sin observarlos: **evidencia ficticia**, prohibida por ADR-070 (superado) §Decisión 2.

**Nadie adelanta esta fase "porque la decisión ya está aprobada".** La decisión está aprobada; su ejecución no. Aplicar la relajación de dependencia sin poder comprobar la sustitución es la única forma en que esta decisión sí sería una regresión real de disponibilidad — riesgo **R8** de ADR-079.

---

## Contratos congelados que consume esta fase

| Id | Contrato | Ruta | Versión |
|---|---|---|---|
| C1 | Forma del estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | 1.0 |

Depende además de F3 (artefactos de la pantalla) y de F4a (cableado de desarrollo), ambas cerradas antes de que esta pueda abrirse.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que en producción la pantalla de arranque se sirva mientras el sistema todavía no puede atender, **sin que el orquestador declare sano un sistema que solo sabe decir que está arrancando**.

**Lo que sí entra — las tres obligaciones inseparables de ADR-079 Decisión 4:**

- **(a)** Relajar la condición de dependencia del proxy de producción a una dependencia mínima sobre la base de datos.
- **(b)** Resolución dinámica de upstreams: resolutor del DNS interno y `proxy_pass` por variable **sin parte de URI**, para conservar el request URI original.
- **(c)** Mover el probe del contenedor de proxy de la raíz a la ruta de salud.

Más: interceptado de errores de upstream con ubicación con nombre que sirve la pantalla, ruta de estado con respaldo que devuelve una respuesta mínima con forma de C1, montaje de la pantalla en el proxy de producción, reescritura del comentario sustituido y pruebas de configuración.

**Lo que no entra:**

- Definir dominio, hosting, autoridad certificadora, método de emisión de certificados, ventana operativa u objetivos de recuperación. **Eso es ADR-070 (superado) y sigue siendo del CTO.**
- Terminación TLS, certificados o renovación.
- Cambiar cualquier otra condición de dependencia.
- Tocar el proxy de desarrollo — es F4a, ya cerrada.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §4.4, §7.1 R2 y R7
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) — **Decisión 4 completa con sus tres obligaciones**, §Estado de adopción por decisión, y §Consecuencias → *"Razón técnica que queda sustituida"*
- **ADR:** [ADR-070](../adrs/ADR-070-Diferimiento-Dominio-Productivo.md) (superado) — su disparador es la condición de apertura de esta fase
- **Informes de F3 y F4a**, ambas cerradas
- **Código vigente:** `nginx/nginx.prod.conf`, `docker-compose.prod.yml`, `scripts/nginx-config.test.mjs`

---

## 3. Instrucciones

1. **Resolución dinámica de upstreams.** Configurar el resolutor del DNS interno del runtime y referenciar cada upstream por variable, con `proxy_pass` **sin parte de URI**. Sin esto, con la dependencia relajada el proxy se negaría a arrancar cuando los contenedores destino aún no existan.
2. **Interceptado de errores de upstream** y ubicación con nombre que sirva la pantalla cuando el upstream no responde.
3. **Ruta de estado con respaldo.** La ruta del archivo de estado hace proxy al endpoint de la API; si la API todavía no existe, una ubicación de respaldo devuelve una respuesta de arranque mínima **con la forma de C1**, sin almacenamiento en caché.
4. **Relajar la condición de dependencia** del proxy a una dependencia mínima sobre la base de datos.
5. **Cambiar el probe del contenedor de proxy** de la raíz a la ruta de salud. **Es inseparable del punto 4.**
6. **Reescribir el comentario que justificaba la condición anterior**, en el mismo cambio. El comentario vigente explica que la condición se endureció porque el proxy devolvía error hasta que la aplicación abría su puerto. Esa razón queda **sustituida**, no invalidada: el error deja de ser observable porque se sirve la pantalla en su lugar. El comentario nuevo debe decir exactamente eso y citar ADR-079. **Relajar la condición dejando el comentario intacto es defecto bloqueante**: deja dos razones contradictorias vigentes en el mismo archivo.
7. Montar el directorio de la pantalla en solo lectura en el proxy de producción.
8. Ampliar `scripts/nginx-config.test.mjs`: la configuración de producción define la ubicación con nombre de la pantalla, el respaldo de estado y el resolutor; y el probe del contenedor de proxy **no** apunta a la raíz.
9. **Conservar intactos los marcadores de dominio** de la configuración de producción. Esta fase no los resuelve ni siquiera temporalmente para probar: si al abrirse la fase el dominio ya está definido por ADR-070 (superado), se usará lo que ese ADR determine.

---

## 4. Restricciones no negociables

1. **No ejecutar sin apertura explícita de AI-EM-ARCH** tras el disparador de ADR-070 (superado).
2. **Las tres obligaciones son inseparables:** dependencia relajada, upstreams dinámicos y probe corregido. Entregar la primera sin la tercera es una **regresión real de disponibilidad**.
3. **El comentario sustituido se reescribe en el mismo commit** que relaja la condición.
4. **No definir dominio, hosting, autoridad certificadora ni objetivos de recuperación.** Es del CTO vía ADR-070 (superado).
5. **No cambiar ninguna otra condición de dependencia** de ninguna otra composición.
6. **No añadir puertos publicados nuevos.**
7. **Validar la composición de producción de forma silenciosa**, sin volcar su contenido: contiene secretos.
8. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- `nginx/nginx.prod.conf` actualizado
- `docker-compose.prod.yml` con montaje, dependencia relajada, probe corregido y **comentario reescrito**
- `scripts/nginx-config.test.mjs` ampliado
- `pnpm test:tooling` y `pnpm audit:docker-context` en verde

## 6. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4B-v1.0.md`, **con el texto anterior y el nuevo del comentario sustituido transcritos**
- Actualizar el runbook de operación con la regla: **la raíz responde con la pantalla de arranque; la sonda máquina-a-máquina es la ruta de salud**
- [CHECKLIST-PLATAFORMA-ARRANQUE-F4B-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F4B-v1.0.md) marcado en vivo
- Fila F4b del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

Los tres primeros son **los que hoy no se pueden verificar** y motivan el diferimiento.

- **CA-F4B-01** — El proxy **arranca** aunque los contenedores de aplicación no existan todavía.
- **CA-F4B-02** — Abrir la raíz mientras corre el migrador devuelve 200 con la pantalla, no una conexión rechazada.
- **CA-F4B-03** — El contenedor de proxy **no se declara sano** mientras la API no responde. Verificado observando su estado durante el arranque.
- **CA-F4B-04** — La ruta de estado devuelve una respuesta con forma de C1 incluso antes de que la API exista.
- **CA-F4B-05** — Con el sistema completo, el proxy sirve la aplicación normalmente y las rutas de API conservan su URI original. Con control de regresión.
- **CA-F4B-06** — El probe del contenedor de proxy apunta a la ruta de salud, con prueba automatizada.
- **CA-F4B-07** — El comentario sustituido está reescrito, cita ADR-079 y su texto anterior consta en el informe.
- **CA-F4B-08** — La pantalla **deja** de servirse una vez el sistema está listo; no queda pegada.
- **CA-F4B-09** — La validación de la composición de producción pasa sin imprimir secretos.
- **CA-F4B-10** — Los marcadores de dominio siguen intactos, o resueltos conforme a lo que determine ADR-070 (superado).
- **CA-F4B-11** — Evidencia de suites con **`Cached: 0`**.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- La fase se abre sin que el disparador de ADR-070 (superado) se haya activado.
- La resolución dinámica de upstreams no consigue conservar el URI original → afecta a todas las rutas de API; **no se entrega una versión parcial**.
- El probe no puede apuntar a la ruta de salud → **entonces la relajación de dependencia tampoco se entrega**.
- Sigue sin existir un entorno donde observar CA-F4B-01, 02 y 03 → **la fase vuelve a cerrarse**; no se declaran cumplidos sin observarlos.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.
**Reversión:** acoplada. Revertir exige restaurar **a la vez** la condición de dependencia, el probe y el comentario.

## 9. Criterio de salida de la fase

- [ ] Disparador de ADR-070 (superado) activado y fase abierta por AI-EM-ARCH
- [ ] Las tres obligaciones entregadas en el mismo cambio
- [ ] CA-F4B-01, 02 y 03 **observados**, no inferidos
- [ ] Comentario sustituido reescrito, con texto anterior transcrito en el informe
- [ ] Pruebas de configuración ampliadas y en verde
- [ ] Runbook actualizado con la regla de raíz frente a ruta de salud
- [ ] Informe de fase archivado con `Cached: 0` y checklist completo
