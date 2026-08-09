# CHECKLIST — Plataforma · Experiencia de arranque · F1 terminal de desarrollo

**Fecha de apertura:** 2026-08-09
**Estado:** Abierto — bloqueado por F0 (contratos C2 y C4)
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F1-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F1-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F1-v1.0.md`
**Responsable:** AI-PLAT-OPS
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.** Nunca al final de la fase de una sola vez.
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` en §Pendientes hacia AI-EM-ARCH. Un marcador no atendido **no caduca: escala**.
4. **No marques ítems de otra fase.** Repórtalo como `[CONSULTA]`.
5. **Al cerrar, actualiza tu fila del tablero** y no toques el resto.
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Módulos nuevos y estructura

- [ ] Módulo de seguimiento de progreso en `scripts/lib/` con su prueba
- [ ] Módulo de análisis de salida del orquestador de contenedores en `scripts/lib/` con su prueba
- [ ] Módulo de escritura del archivo de estado en `scripts/lib/` con su prueba
- [ ] Los tres añadidos a `test:tooling` en `package.json`
- [ ] `scripts/dev.mjs` solo cablea; la lógica nueva vive en los módulos

## 2. Progreso y dashboard

- [ ] Plan de pasos con los identificadores y pesos de C4, sumando 100
- [ ] Porcentaje **monotónico** de 0 a 100, sin retrocesos *(CA-F1-02)*
- [ ] Elapsed por paso y elapsed total visibles
- [ ] **Sin estimación de tiempo restante** — decisión de diseño, no omisión
- [ ] Línea de progreso en la cabecera, pasando por las utilidades de truncado y padding existentes
- [ ] **Altura de contenido ajustada en el mismo cambio** que hace crecer la cabecera
- [ ] Contador de paso en el pie
- [ ] Dashboard no se corrompe al cambiar el tamaño de ventana, en ninguna vista *(CA-F1-10)*
- [ ] Spinner con `unref()`, que solo tickea con paso en curso y se limpia al terminar o fallar
- [ ] El proceso termina y devuelve el prompt; ningún temporizador retiene el event loop *(CA-F1-11)*

## 3. Descarga visible

- [ ] Paso explícito de descarga, previo al levantamiento, con salida en streaming
- [ ] Agregación por servicio (fiable) y global de capas (aproximada) *(CA-F1-01)*
- [ ] Política que evita descargar lo ya presente
- [ ] Variable de entorno para omitir el paso
- [ ] **El paso es opcional**: sin soporte de la herramienta, sin red o con formato cambiado, avisa y continúa *(CA-F1-03)*
- [ ] Verificado con **control negativo**: los tres caminos completan el arranque *(CA-F1-03)*
- [ ] El análisis es orientativo: sin coincidencias, barra indeterminada y logs siguen fluyendo

## 4. Salud y espera

- [ ] Notificación de fase de la espera de salud de la API, **opcional con default sin efecto**
- [ ] La espera de salud **no se partió en dos pasos** — la prueba existente que depende del orden sigue pasando
- [ ] Espera real de consola y portal por consulta HTTP, aceptando códigos por debajo de error de servidor *(CA-F1-08)*
- [ ] **No se analiza el banner del framework**
- [ ] El vencimiento del plazo no aborta el arranque *(CA-F1-08)*

## 5. Archivo de estado (contrato C2)

- [ ] Escrito con **el mismo shape que C1**, no uno paralelo *(CA-F1-07)*
- [ ] Escritura atómica *(CA-F1-07)*
- [ ] **Directorio creado en el primer paso**, antes de cualquier invocación al orquestador de contenedores *(CA-F1-07)*
- [ ] Shape C2 y su equivalencia con C1 declarados en el informe de fase

## 6. Modo no interactivo y cierre

- [ ] Líneas planas con contador de paso, sin secuencias de escape *(CA-F1-04)*
- [ ] Señal periódica de vida para que la integración continua no parezca colgada *(CA-F1-04)*
- [ ] Cierre construido como función pura y probable
- [ ] Cierre impreso **dentro del dashboard y otra vez tras cerrarlo** *(CA-F1-06)*
- [ ] Lista consola, portal, API, documentación de API y pantalla de arranque
- [ ] Indica **dónde** está la credencial de primer ingreso y que se exigirá cambiarla
- [ ] **Prueba de control negativo**: con la contraseña inyectada en el entorno, ninguna línea del cierre la contiene *(CA-F1-05)*

## 7. No regresión

- [ ] **Ninguna prueba de tooling existente fue editada** — verificable en el diff *(CA-F1-09)*
- [ ] Toda opción nueva en función ya cubierta por pruebas es opcional con default sin efecto
- [ ] Secuencia de arranque, orden de pasos y condiciones de salud **sin cambios**
- [ ] Sin dependencias nuevas en el orquestador de desarrollo
- [ ] `BIND_HOST`, `nginx.dev.conf` y el defecto de proxy **sin tocar**
- [ ] Precedencia de variables de entorno respetada, sin un cuarto lugar de réplica

## 8. Verificación funcional

- [ ] Arranque en frío verificado de extremo a extremo, con descarga visible
- [ ] Arranque en caliente verificado (no vuelve a descargar)
- [ ] Modo no interactivo verificado
- [ ] Arranque verificado en Windows y en Linux

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test:tooling` | pendiente | — | — |
| `pnpm lint` | pendiente | — | — |
| `pnpm typecheck` | pendiente | — | — |
| `pnpm dev` — arranque en frío | pendiente | n/a | — |
| `pnpm dev` — modo no interactivo | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

- Ninguno al momento de la apertura.

## Salida de fase

- [ ] Todos los criterios CA-F1-01 a CA-F1-12 cubiertos con evidencia
- [ ] Informe de fase archivado con `Cached: 0`
- [ ] Fila F1 del tablero actualizada
