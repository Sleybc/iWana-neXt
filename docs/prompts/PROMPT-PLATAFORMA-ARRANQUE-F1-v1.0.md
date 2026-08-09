# PROMPT — Plataforma · Experiencia de arranque · Fase F1: progreso en la terminal de desarrollo

**Versión:** 1.0
**Fecha:** 2026-08-08
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-PLAT-OPS
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F1-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F1-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F1-v1.0.md`

---

## Contratos congelados que consume esta fase

| Id | Contrato | Ruta | Versión |
|---|---|---|---|
| C1 | Tipos de estado de arranque | `packages/shared/src/contracts/system/boot-status.contract.ts` | 1.0 |
| C4 | Identificadores de paso y copy | `docs/specs/2026-08-08-arranque-sistema-ux-spec.md` | 1.0 |

**C2 lo produce esta fase:** el archivo de estado de desarrollo usa **el mismo shape que C1**, no uno paralelo. Se declara en el informe de fase.

Mientras se respeten C1 y C4 y no se toque alcance, boundary ni dependencias nuevas, esta fase **decide y ejecuta sin gate intermedio**. Un cambio de contrato es el único evento que fuerza re-sincronización, y se coordina vía AI-EM-ARCH.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que `pnpm dev` muestre en todo momento qué paso corre sobre el total, qué porcentaje lleva, cuánto tiempo lleva ese paso — y, durante la descarga de imágenes, cuántos servicios y capas van. Al terminar, un cierre accionable. Y que ese mismo progreso quede publicado en un archivo para que la pantalla web lo consuma.

**Lo que sí entra:**

- Módulos nuevos en `scripts/lib/` para el seguimiento de progreso, el análisis de la salida del orquestador de contenedores y la escritura del archivo de estado — **cada uno con su prueba**.
- Cableado en `scripts/dev.mjs`: línea de progreso en el dashboard, contador de paso, elapsed, spinner.
- **Paso explícito de descarga de imágenes**, previo al levantamiento, con salida en streaming.
- Espera real de consola y portal antes de declarar el sistema listo.
- Cierre con URLs y con la indicación de dónde está la credencial de primer ingreso.
- Degradación a líneas planas en modo no interactivo.

**Lo que no entra:**

- El endpoint de la API (F2), la pantalla web (F3), la configuración de nginx y los montajes de volumen (F4), el instalador (F5).
- Cambiar la secuencia de arranque, el orden de los pasos o las condiciones de salud existentes.
- Tocar `BIND_HOST` o el defecto de proxy en desarrollo — **prohibido por [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md)** *(propuesto)*.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §2.2 CU-01, §7.1 R1–R6
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) *(propuesto)* — Decisión 1 y **Decisión 7**
- **Código vigente:** `scripts/dev.mjs`, `scripts/dev.test.mjs`, `scripts/lib/pii-hmac.mjs` (patrón de módulo auxiliar), `package.json` → `test:tooling`
- **Informe de estado:** [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md)

---

## 3. Estado verificado del sistema — no re-derivar

Estos hechos ya están comprobados. Partir de ellos, no volver a investigarlos.

- `createDashboard()` devuelve `null` cuando la entrada o la salida no son interactivas. **De ahí se deriva el modo una sola vez**; no volver a consultar el estado del terminal en cada línea.
- La secuencia de arranque tiene diez pasos lógicos: liberación de puertos, levantamiento de infraestructura, inicializador de almacenamiento, verificación, dos compilaciones de paquete, migraciones, API en modo observado con espera de salud, y el resto de aplicaciones.
- La espera de salud de la API hace **dos cosas en orden**: espera a que la compilación termine y luego consulta el endpoint de salud. **Hay una prueba que depende de ese orden.**
- Consola y portal se lanzan y **nadie comprueba que estén listos**.
- El dashboard usa buffer alterno de terminal: **todo lo impreso antes de cerrarlo desaparece de la pantalla**.
- La cabecera del dashboard ocupa tres líneas y la altura de contenido se calcula restando seis a las filas disponibles.
- El repositorio ya sufrió un fallo de event loop retenido; el código lo documenta junto al bloque de apagado.
- Existe una precedencia de carga de variables de entorno de tipo primera-gana, replicada en tres lugares independientes.

---

## 4. Instrucciones

1. **Extraer, no engordar.** `scripts/dev.mjs` ya pasa de 38 KB. Crear módulos nuevos en `scripts/lib/` —seguimiento de progreso, análisis de salida del orquestador, escritura del archivo de estado— cada uno con su archivo de prueba junto. Añadirlos a `test:tooling` en `package.json`.

2. **Seguimiento de progreso.** Plan de pasos con los identificadores y pesos que fija C4, sumando 100. El porcentaje es la suma de pesos completados más la fracción del paso en curso, y es **monotónico por construcción**. Cada paso publica su elapsed. Estado interno mínimo: índice, total, identificador, copy, porcentaje, elapsed total, elapsed del paso, fase y detalle.

3. **Sin estimación de tiempo restante.** En un arranque en frío domina el ancho de banda: cualquier estimación mentiría justo en el arranque que más importa. Se muestra elapsed, que es honesto. La referencia externa tampoco estima.

4. **Descarga visible.** Añadir un **paso explícito de descarga previo al levantamiento**, con salida en streaming y análisis de sus líneas. Agregar a dos granularidades: por servicio, que es fiable, y global de capas, que es aproximado — el formato de línea de capa no lleva el nombre del servicio, así que no se puede atribuir. Mostrar servicios listos sobre total y capas completadas sobre total.

5. **La descarga nunca puede tumbar el arranque (ADR-079 *(propuesto)* Decisión 7).** El paso es **opcional**: si la opción no existe en la versión instalada, o no hay red, o el formato cambia, avisa y la secuencia continúa. El análisis es orientativo: sin coincidencias, la barra queda indeterminada y las líneas siguen fluyendo a su sección. Prever una variable de entorno para omitir el paso por completo y una política que evite descargar lo ya presente.

6. **Cableado del dashboard.** Añadir la línea de progreso a la cabecera. **Ajustar la altura de contenido en el mismo cambio** — la cabecera crece una línea y sin el ajuste se pisa la última línea de contenido. Toda línea nueva pasa por las utilidades de truncado y padding existentes, o un cambio de tamaño de ventana corrompe el frame. Añadir el contador de paso al pie.

7. **Spinner con `unref()` obligatorio.** El temporizador solo tickea mientras hay un paso en curso y se limpia al terminar o al fallar. Sin `unref()` se reintroduce la clase de fallo que el propio archivo documenta.

8. **Sub-progreso de la API sin romper pruebas.** **No partir en dos pasos** la espera de salud: hay una prueba que depende del orden actual. Añadir una opción de notificación de fase **opcional con default sin efecto**, que publique fracción durante la compilación y durante la consulta de salud. Las firmas existentes quedan retrocompatibles y **ninguna prueba existente se edita**.

9. **Espera real de consola y portal.** Consultar por HTTP hasta obtener respuesta, aceptando cualquier código por debajo de error de servidor. **No analizar el banner del framework**: cambia entre versiones mayores. El vencimiento del plazo **no es fatal**: se informa que sigue compilando y el arranque continúa.

10. **Archivo de estado (C2).** Escribir el progreso con **el mismo shape que C1**, con escritura atómica. **Crear el directorio contenedor en el primer paso**, antes de cualquier invocación al orquestador de contenedores — si no, en Windows el motor lo crea con propietario incorrecto. F4 lo montará como directorio, nunca como archivo suelto.

11. **Modo no interactivo.** Líneas planas con contador de paso, sin secuencias de escape, sin spinner, y una señal periódica de que el proceso sigue vivo para que la integración continua no parezca colgada.

12. **Cierre.** Construir el bloque final como función pura y probable. Imprimirlo **en los dos sitios**: dentro del dashboard al completarse, y otra vez en pantalla normal tras cerrarlo. Debe listar consola, portal, API, documentación de API y la pantalla de arranque, e indicar **dónde** está la credencial de primer ingreso y que se exigirá cambiarla.

---

## 5. Restricciones no negociables

1. **Ningún banner, log ni salida imprime el valor de un secreto.** Se nombra la variable y el archivo, nunca el contenido. Prueba obligatoria: inyectar la contraseña de arranque en el entorno y asertar que ninguna línea del cierre la contiene.
2. **Toda opción nueva en una función ya cubierta por pruebas es opcional con default sin efecto.** Ninguna prueba existente se edita.
3. **La descarga es un paso opcional.** Un fallo de descarga nunca puede detener el arranque (ADR-079 *(propuesto)* Decisión 7).
4. **No tocar `BIND_HOST`, `nginx.dev.conf` ni el defecto de proxy** — ADR-078 *(propuesto)* y alcance de F4.
5. **No cambiar la secuencia de arranque ni sus condiciones de salud.** Esta fase añade observabilidad, no reordena.
6. **No introducir dependencias nuevas** en el orquestador de desarrollo. Todo con la biblioteca estándar.
7. **Respetar la precedencia de variables de entorno** existente. No añadir un cuarto lugar donde se replique.
8. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 6. Entregables técnicos obligatorios

- Tres módulos nuevos en `scripts/lib/` con sus pruebas
- `scripts/dev.mjs` cableado
- `scripts/dev.test.mjs` con pruebas nuevas: forma del plan de pasos y ausencia de secretos en el cierre
- `package.json` → `test:tooling` incluye las pruebas nuevas
- `pnpm test:tooling`, `pnpm lint` y `pnpm typecheck` en verde

## 7. Entregables documentales obligatorios

- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F1-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md), **declarando el shape C2 y su equivalencia con C1**
- [CHECKLIST-PLATAFORMA-ARRANQUE-F1-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F1-v1.0.md) marcado en vivo
- Fila F1 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre
- Actualizar la tabla de comandos de `AGENTS.md` **solo si** se añade un script nuevo a `package.json`

---

## 8. Criterios de aceptación

- **CA-F1-01** — Con caché de imágenes vacía, la descarga es visible y muestra servicios listos sobre total.
- **CA-F1-02** — El porcentaje es monotónico de 0 a 100 y no retrocede en ningún punto.
- **CA-F1-03** — Con la opción de descarga desactivada, con red caída o con versión de herramienta sin soporte, el arranque **completa igual**. Verificado con control negativo.
- **CA-F1-04** — En modo no interactivo se emiten líneas con contador de paso y señal periódica de vida, sin secuencias de escape.
- **CA-F1-05** — El cierre no contiene el valor de ningún secreto, con prueba de control negativo.
- **CA-F1-06** — El cierre se ve en pantalla normal después de cerrar el dashboard.
- **CA-F1-07** — El archivo de estado se escribe con el shape de C1, de forma atómica, y su directorio existe antes del primer contacto con el orquestador de contenedores.
- **CA-F1-08** — Consola y portal se declaran listos por consulta HTTP, y el vencimiento del plazo no aborta el arranque.
- **CA-F1-09** — Las pruebas de tooling existentes pasan **sin haber sido editadas**. Verificable en el diff.
- **CA-F1-10** — El dashboard no se corrompe al cambiar el tamaño de la ventana en ninguna vista.
- **CA-F1-11** — El proceso termina y devuelve el prompt; ningún temporizador retiene el event loop.
- **CA-F1-12** — Evidencia de suites con **`Cached: 0`** en el resumen de Turbo.

---

## 9. Criterio de stop/go

**Detenerse inmediatamente si:**

- Cablear el progreso obliga a editar una prueba de tooling existente → es señal de que la firma no quedó retrocompatible.
- La única forma de hacer visible la descarga resulta ser bloqueante o frágil de modo que un fallo detenga el arranque → **la observabilidad no vale una regresión de arranque**.
- El archivo de estado no puede escribirse de forma atómica en Windows.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`.

## 10. Criterio de salida de la fase

- [ ] Arranque en frío verificado de extremo a extremo con descarga visible
- [ ] Arranque en caliente verificado (la descarga no vuelve a bajar nada)
- [ ] Modo no interactivo verificado
- [ ] Pruebas de tooling en verde con `Cached: 0`, sin editar pruebas existentes
- [ ] Archivo de estado producido y validado contra el shape de C1
- [ ] Informe de fase archivado y checklist completo
