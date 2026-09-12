# PROMPT — Plataforma · Experiencia de arranque · Fase F4a: cableado del proxy en desarrollo

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-PLAT-OPS
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F4A-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F4A-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4A-v1.0.md`

> **La fase F4 se partió en dos el 2026-08-09**, al aprobar el CTO ADR-079 con la Decisión 4 de ejecución diferida. Esta es la mitad **ejecutable**; la de producción vive en [PROMPT-PLATAFORMA-ARRANQUE-F4B-v1.0.md](PROMPT-PLATAFORMA-ARRANQUE-F4B-v1.0.md) y nace **cerrada**. El prompt F4 unificado se retiró antes de ser ejecutado: no llegó a existir un artefacto contradictorio vigente.

---

## Contratos congelados que consume esta fase

| Id | Contrato | Ruta | Versión |
|---|---|---|---|
| C1 | Forma del estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | 1.0 |
| C2 | Shape del archivo de estado de desarrollo | Declarado en `INFORME-PLATAFORMA-ARRANQUE-F1-v1.0.md` | 1.0 |

Depende de que F3 haya entregado los archivos de la pantalla, aunque sea en esqueleto.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que la pantalla de arranque sea accesible **en desarrollo** durante todo el arranque, alimentada por el archivo de estado que produce F1, **sin tocar la composición de producción y sin romper el proxy existente**.

**Lo que sí entra:**

- Configuración de proxy en desarrollo: servir la pantalla en la raíz y exponer el archivo de estado por sistema de archivos.
- Montaje en solo lectura de los dos directorios —el de la pantalla y el del archivo de estado— en la composición **base**, dentro del servicio de proxy de desarrollo.
- Pruebas de no regresión sobre la configuración de desarrollo.

**Lo que no entra — y aquí está el corte respecto del prompt original:**

- **Toda la Decisión 4 de ADR-079**: relajar la condición de dependencia del proxy de producción, resolución dinámica de upstreams, interceptado de errores, respaldo de estado, cambio de probe y reescritura del comentario sustituido. **Eso es F4b y está diferido.**
- **No se modifica `docker-compose.prod.yml` ni `nginx/nginx.prod.conf`.** Ni una línea.
- Corregir el defecto de proxy en desarrollo o mover el host de binding — prohibido por [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)*.
- Terminación TLS, certificados o renovación.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §4.2, §4.3, §7.1 R2 y R6
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) — Decisiones 2 y 3 vigentes; **§Estado de adopción por decisión** explica por qué la Decisión 4 no entra aquí
- **ADR:** [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* — por qué el defecto de desarrollo no se toca
- **ADR:** [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) — el diferimiento que motiva el corte
- **Código vigente:** `nginx/nginx.dev.conf`, `docker-compose.yml`, `scripts/nginx-config.test.mjs`
- **Entregables de F3:** `nginx/boot/`

---

## 3. Instrucciones

1. Servir la pantalla en la raíz del proxy de desarrollo, sustituyendo la respuesta estática actual.
2. Exponer el archivo de estado por sistema de archivos, desde el directorio que produce F1. **Sin proxy y sin CORS**: en desarrollo la pantalla no habla con la API.
3. **Los bloques de ubicación de API y de salud quedan idénticos byte a byte.** `scripts/nginx-config.test.mjs` asserta sus literales, y además cualquier cambio ahí tocaría el defecto que ADR-078 *(propuesto)* protege.
4. **Los comentarios que documentan el defecto de proxy se conservan íntegros.** No reescribirlos, no marcarlos como resueltos, no eliminarlos. Siguen siendo verdad.
5. Montar en solo lectura, dentro del servicio de proxy de la composición **base**, el directorio de la pantalla y el directorio del archivo de estado.
6. **Montar el directorio, nunca el archivo suelto.** La escritura atómica de F1 sustituye el inodo; con un montaje de archivo el contenedor conservaría indefinidamente la versión antigua.
7. Ampliar `scripts/nginx-config.test.mjs` con no-regresión: que la configuración de desarrollo **conserva** sus dos bloques de ubicación literales y que define el nuevo de estado.

---

## 4. Restricciones no negociables

1. **Cero cambios en `docker-compose.prod.yml` y `nginx/nginx.prod.conf`.** Verificable en el diff. Es la línea que separa esta fase de la diferida.
2. **Los bloques de ubicación de API y salud de desarrollo quedan byte a byte idénticos.**
3. **No tocar el host de binding ni intentar corregir el defecto de proxy de desarrollo.**
4. **No cambiar ninguna condición de dependencia** de ninguna composición.
5. **No añadir puertos publicados nuevos** ni ampliar la superficie de red.
6. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- `nginx/nginx.dev.conf` actualizado
- `docker-compose.yml` con los dos montajes de solo lectura en el servicio de proxy
- `scripts/nginx-config.test.mjs` ampliado
- `pnpm test:tooling` y `pnpm audit:docker-context` en verde

## 6. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4A-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md)
- [CHECKLIST-PLATAFORMA-ARRANQUE-F4A-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F4A-v1.0.md) marcado en vivo
- Fila F4a del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

- **CA-F4A-01** — En desarrollo, la raíz del proxy sirve la pantalla y el archivo de estado se lee por sistema de archivos.
- **CA-F4A-02** — Los bloques de ubicación de API y salud de desarrollo son idénticos byte a byte. Verificable en el diff.
- **CA-F4A-03** — Los comentarios que documentan el defecto de proxy siguen presentes y sin modificar.
- **CA-F4A-04** — Los montajes son de directorio; la escritura atómica se refleja en el contenedor. Verificado sobrescribiendo el archivo con el contenedor vivo.
- **CA-F4A-05** — La pantalla avanza en vivo durante un arranque de desarrollo completo y redirige al terminar.
- **CA-F4A-06** — **`docker-compose.prod.yml` y `nginx/nginx.prod.conf` sin una sola línea modificada.** Verificable en el diff.
- **CA-F4A-07** — `pnpm audit:docker-context` en verde.
- **CA-F4A-08** — Evidencia de suites con **`Cached: 0`**.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- Servir la pantalla en la raíz obliga a tocar los bloques de ubicación cubiertos por la prueba de configuración.
- El montaje de directorio no refleja la escritura atómica en Windows.
- Aparece la tentación de "aprovechar" para aplicar parte de la Decisión 4 → **está diferida; no se adelanta**.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.

## 9. Criterio de salida de la fase

- [ ] Pantalla accesible en desarrollo durante todo el arranque
- [ ] Tránsito verificado de pantalla a aplicación en desarrollo
- [ ] Pruebas de configuración ampliadas y en verde
- [ ] Composición y configuración de producción intactas
- [ ] Informe de fase archivado con `Cached: 0` y checklist completo
