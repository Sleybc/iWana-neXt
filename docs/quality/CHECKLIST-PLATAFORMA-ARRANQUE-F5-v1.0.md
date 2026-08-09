# CHECKLIST — Plataforma · Experiencia de arranque · F5 instalador on-premise

**Fecha de apertura:** 2026-08-09
**Estado:** Abierto — **con bloqueo declarado abierto** sobre el cierre de la fase
**Prompt:** [PROMPT-PLATAFORMA-ARRANQUE-F5-v1.0.md](../prompts/PROMPT-PLATAFORMA-ARRANQUE-F5-v1.0.md)
**Informe:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F5-v1.0.md`
**Responsables:** AI-PLAT-OPS (ejecuta) · **AI-SEC-ENG (revisión obligatoria)**
**Bloqueo:** [DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md)
**Tablero:** [CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)

---

## Protocolo de actualización en vivo

1. **Marca `[x]` en el mismo commit que entrega el ítem.**
2. **Todo `[x]` lleva evidencia citable.** Un `[x]` sin evidencia es **defecto bloqueante**.
3. **Un ítem que no cierra se deja `[ ]`** y abre `[BLOQUEO]` hacia AI-EM-ARCH. No caduca: escala.
4. **No marques ítems de otra fase.**
5. **Al cerrar, actualiza tu fila del tablero.**
6. **Toda evidencia de suite adjunta `Cached: 0`.**

---

## 1. Estructura y anti-duplicación

- [ ] Instalador en `scripts/`, en shell, con modo estricto de errores y máscara restrictiva desde la primera línea
- [ ] Módulo compartido de secretos extraído a `scripts/lib/`
- [ ] Generador de secretos existente refactorizado a envoltorio fino
- [ ] **Comportamiento del generador existente intacto** — con control de regresión *(CA-F5-11)*
- [ ] Instalador como segundo envoltorio, hacia el archivo de entorno de producción
- [ ] Gemelo en shell del generador de certificados
- [ ] Modo no interactivo y modo de simulación implementados

## 2. Secuencia

- [ ] Banner con la versión del producto
- [ ] Comprobaciones previas con marca de resultado por línea: runtime, herramienta de composición, disco, puertos, acceso al socket *(CA-F5-07)*
- [ ] Cada comprobación fallida produce un **mensaje accionable** *(CA-F5-07)*
- [ ] Configuración desde la plantilla de producción si el archivo de entorno no existe
- [ ] Preguntas: dominio, puertos, zona horaria, correo del operador
- [ ] Escritura idempotente del archivo de entorno, con permisos restrictivos *(CA-F5-06)*
- [ ] Generación de **solo los secretos ausentes** mediante el módulo compartido
- [ ] **Gate de referencias de imagen**: se detiene con mensaje legible que nombra variables y dueño de decisión *(CA-F5-03)*
- [ ] TLS: autofirmado ofrecido con aviso ruidoso; en modo no interactivo aborta salvo bandera explícita
- [ ] Material privado de TLS con permisos restrictivos *(CA-F5-06)*
- [ ] **Validación de composición silenciosa**, sin volcar contenido
- [ ] Descarga con salida en streaming *(CA-F5-08)*
- [ ] Levantamiento
- [ ] Espera activa contra la ruta de salud, con indicador de avance
- [ ] Al vencer el plazo: estado de contenedores, últimas líneas del servicio en fallo, código de salida de error *(CA-F5-09)*
- [ ] Resumen: URL del sistema, URL del portal, ruta del archivo de entorno, comando de registro de eventos, ruta del runbook
- [ ] **Bloque de pendiente sobre el primer administrador**, remitiendo al documento de bloqueo *(CA-F5-10)*

## 3. Higiene de secretos

- [ ] **El instalador nunca imprime el valor de un secreto** — ni en simulación, ni en logs, ni en errores *(CA-F5-05)*
- [ ] **Nunca sobrescribe un secreto existente** *(CA-F5-02)*
- [ ] Prueba estática integrada en `test:tooling`: declara modo estricto y máscara restrictiva
- [ ] La prueba asserta que no se activa traza de ejecución
- [ ] La prueba asserta que **ninguna línea emite una variable cuyo nombre sugiera secreto**
- [ ] La prueba asserta que el gate de referencias de imagen nombra todas las variables que debe cubrir
- [ ] **Control negativo**: introducir una línea que emite un secreto hace fallar la prueba *(CA-F5-04)*

## 4. Idempotencia y límites

- [ ] Doble ejecución seguida: no rompe nada, no regenera secretos, no duplica entradas *(CA-F5-02)*
- [ ] Simulación completa sobre clon limpio **sin modificar nada** *(CA-F5-01)*
- [ ] **No crea usuarios de aplicación** — el bloqueo se declara, no se elude
- [ ] **No sustituye las referencias de imagen pendientes** — solo las detecta
- [ ] No se implementó instalador para Windows, units de servicio, automatización de certificados, copias de seguridad ni renovación

## 5. Revisión de seguridad

- [ ] Revisión formal de AI-SEC-ENG sobre manejo de secretos, permisos y material TLS, archivada en `docs/security/`
- [ ] **Veredicto favorable** *(CA-F5-12)*

## 6. Documentación

- [ ] `docs/runbooks/RUNBOOK-INSTALACION-ON-PREMISE-v1.0.md` publicado
- [ ] Runbook incluye requisitos, procedimiento y diagnóstico de fallos frecuentes
- [ ] Runbook incluye la regla: **la raíz sirve la pantalla; la sonda máquina-a-máquina es la ruta de salud**
- [ ] Tabla de comandos de `AGENTS.md` actualizada con la invocación del instalador

---

## Evidencia automatizada

| Suite / comando | Resultado | `Cached: 0` | Fecha |
| --- | --- | --- | --- |
| `pnpm test:tooling` (higiene del instalador) | pendiente | — | — |
| `pnpm audit:docker-context` | pendiente | n/a | — |
| Simulación sobre clon limpio | pendiente | n/a | — |
| Doble ejecución (idempotencia) | pendiente | n/a | — |
| Control negativo de higiene | pendiente | n/a | — |
| Control de regresión del generador existente | pendiente | n/a | — |

---

## Pendientes, bloqueos y consultas

**`[BLOQUEO]` De: AI-EM-ARCH → A: CTO · Abierto desde 2026-08-09**
**Contexto:** creación del primer administrador de plataforma en producción.
**Causa:** la configuración de la API rechaza por validación las variables de credencial de arranque cuando el entorno es productivo o de staging, y no existe camino alternativo. El instalador dejaría la instancia levantada y sin forma de entrar.
**Bloqueante:** para el cierre de F5. **No bloquea F1, F2, F3, F4a ni F6.**
**Supuesto mientras tanto:** el instalador cierra con bloque de pendiente explícito.
**Detalle y opciones:** [DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md)

**Recordatorio de escalación:** toda excepción de seguridad escala al CTO. AI-EM-ARCH no puede concederla.

## Salida de fase

- [ ] Todos los criterios CA-F5-01 a CA-F5-13 cubiertos con evidencia
- [ ] Revisión de seguridad archivada con veredicto favorable
- [ ] Runbook publicado
- [ ] Informe de fase archivado con `Cached: 0`
- [ ] Fila F5 del tablero actualizada, **con el bloqueo reflejado si sigue abierto**
