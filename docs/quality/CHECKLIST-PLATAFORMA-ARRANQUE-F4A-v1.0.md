# CHECKLIST — Plataforma · Experiencia de arranque · F4a cableado del proxy en desarrollo

**Fecha de apertura:** 2026-08-09
**Estado:** Abierto — bloqueado por F3 (artefactos de la pantalla)
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F4A-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F4A-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F4A-v1.0.md`
**Responsable:** AI-PLAT-OPS
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

> **La fase F4 se partió en dos el 2026-08-09.** Esta es la mitad ejecutable. La de producción es [F4b](CHECKLIST-PLATAFORMA-ARRANQUE-F4B-v1.0.md) y nace **cerrada** por diferimiento aprobado de la Decisión 4 de [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md).

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase.**
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Proxy de desarrollo

- [ ] La raíz del proxy sirve la pantalla, sustituyendo la respuesta estática actual *(CA-F4A-01)*
- [ ] El archivo de estado se expone por sistema de archivos, desde el directorio que produce F1 *(CA-F4A-01)*
- [ ] **Sin proxy y sin CORS** en el camino del estado de desarrollo
- [ ] Los bloques de ubicación de API y de salud quedan **byte a byte idénticos** — verificable en el diff *(CA-F4A-02)*
- [ ] Los comentarios que documentan el defecto de proxy **siguen presentes y sin modificar** *(CA-F4A-03)*
- [ ] **No se tocó el host de binding** — prohibido por [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)*

## 2. Volúmenes

- [ ] Directorio de la pantalla montado en solo lectura en la composición base
- [ ] Directorio del archivo de estado de desarrollo montado en solo lectura
- [ ] **Se monta el directorio, nunca el archivo suelto** *(CA-F4A-04)*
- [ ] Verificado: sobrescribir el archivo con el contenedor vivo se refleja dentro *(CA-F4A-04)*

## 3. La línea que separa esta fase de la diferida

- [ ] **`docker-compose.prod.yml` sin una sola línea modificada** — verificable en el diff *(CA-F4A-06)*
- [ ] **`nginx/nginx.prod.conf` sin una sola línea modificada** — verificable en el diff *(CA-F4A-06)*
- [ ] **Ninguna condición de dependencia** de ninguna composición fue modificada
- [ ] **Ningún probe de contenedor** fue modificado
- [ ] **No se adelantó ninguna parte de la Decisión 4**, aunque esté aprobada

## 4. No regresión

- [ ] **No se añadieron puertos publicados nuevos** ni se amplió la superficie de red
- [ ] `pnpm audit:docker-context` en verde *(CA-F4A-07)*
- [ ] `scripts/nginx-config.test.mjs` ampliado: desarrollo **conserva** sus dos bloques literales y define el nuevo de estado

## 5. Verificación funcional

- [ ] La pantalla avanza en vivo durante un arranque de desarrollo completo *(CA-F4A-05)*
- [ ] Tránsito de pantalla a aplicación verificado en desarrollo *(CA-F4A-05)*
- [ ] La pantalla **deja** de servirse una vez el sistema está listo — no queda pegada
- [ ] Verificado en Windows y en Linux

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test:tooling` | pendiente | — | — |
| `pnpm audit:docker-context` | pendiente | n/a | — |
| `pnpm dev` — pantalla observada durante el arranque | pendiente | n/a | — |
| `git diff` sobre artefactos de producción (debe estar vacío) | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

- Ninguno al momento de la apertura.

## Salida de fase

- [ ] Todos los criterios CA-F4A-01 a CA-F4A-08 cubiertos con evidencia
- [ ] Composición y configuración de producción intactas
- [ ] Informe de fase archivado con `Cached: 0`
- [ ] Fila F4a del tablero actualizada
