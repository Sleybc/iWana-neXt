# PROMPT — Plataforma · Experiencia de arranque · Fase F5: instalador on-premise

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH
**Destinatario:** AI-PLAT-OPS (ejecuta) · **AI-SEC-ENG (revisión obligatoria — el script manipula secretos)**
**Etapa del workflow:** 5 (implementación)
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F5-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F5-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F5-v1.0.md`

> **Bloqueo abierto sobre esta fase:** la creación del primer administrador de plataforma en producción está bloqueada por diseño ([DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md)). **La fase se ejecuta igualmente**: el instalador cierra con un bloque de pendiente explícito. No intentar resolver el bloqueo dentro de esta fase.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** un instalador que lleve un servidor limpio desde cero hasta un sistema levantado, validando requisitos **antes** de empezar en lugar de fallar a mitad, mostrando la descarga, y cerrando con instrucciones concretas.

**Lo que sí entra:**

- Script de instalación en `scripts/`, idempotente, con modo no interactivo y modo de simulación.
- Extracción de la lógica de generación de secretos ya existente a un módulo compartido, reutilizado por el generador actual y por el instalador.
- Gemelo en shell del generador de certificados que hoy solo existe para Windows.
- Verificación en integración continua de la higiene de secretos del script.
- Runbook de instalación on-premise.

**Lo que no entra:**

- **Crear el primer administrador de plataforma** — bloqueo declarado.
- **Sustituir las referencias de imagen pendientes de aprobación.** El instalador las **detecta** y se detiene; sustituirlas es decisión del CTO.
- Instalador para Windows, units de servicio del sistema, automatización de certificados de autoridad pública, copias de seguridad, renovación.
- Cambiar el comportamiento del generador de secretos existente.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §2.2 CU-03, §4.6
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) — Decisión 6 y Decisión 7
- **ADR:** [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md) — el invariante de que la credencial no la conoce quien despliega
- **Código vigente:** `scripts/generate-secrets.sh`, `scripts/generate-certs.ps1`, `docker-compose.prod.yml`, `.env.production.example`, `scripts/nginx-config.test.mjs` (patrón de validación estática de configuración), `scripts/audit-docker-context.mjs` (patrón de gate)
- **Referencia externa:** repositorio `Ubiquiti-App/UCRM`, script de instalación — referencia de **invariantes**: validar antes de empezar, preguntar solo lo necesario, mostrar la descarga, esperar a que responda, cerrar con instrucción

---

## 3. Instrucciones

1. **Shell, no Node.** El servidor on-premise solo tiene el runtime de contenedores; exigir gestor de paquetes de JavaScript únicamente para instalar sería incorrecto. Emparejar con el generador de secretos existente: modo estricto de errores y máscara de creación restrictiva desde la primera línea.

2. **Anti-duplicación de la lógica de secretos.** El generador actual ya tiene el contrato correcto: **no sobrescribe, no imprime, permisos restrictivos**. Extraerlo a un módulo compartido en `scripts/lib/` y dejar dos envoltorios finos — uno hacia el archivo de entorno local de desarrollo, con **comportamiento actual intacto**, y otro hacia el de producción. Una sola implementación de "no sobrescribir, no imprimir".

3. **Secuencia de la instalación:**
   1. Banner con la versión del producto.
   2. **Comprobaciones previas**, cada una con marca de resultado: versión del runtime de contenedores, versión de la herramienta de composición, espacio en disco, puertos libres, acceso al socket del runtime.
   3. Configuración: partir de la plantilla de producción si no existe el archivo de entorno. Preguntar dominio, puertos, zona horaria y correo del operador. Escritura idempotente y permisos restrictivos.
   4. Generar **solo los secretos ausentes** mediante el módulo compartido. Los existentes no se tocan.
   5. **Gate de referencias de imagen.** Detenerse si las referencias siguen marcadas como pendientes de aprobación, reproduciendo la tabla de decisión y dueño que ya documenta la plantilla de producción. **Sin este gate el fallo real es un error de manifiesto ilegible** que el operador no puede diagnosticar.
   6. TLS: si falta el material, ofrecer el autofirmado del gemelo en shell del generador de certificados, con aviso ruidoso de que no es material de producción. En modo no interactivo, abortar salvo consentimiento explícito por bandera.
   7. **Validación silenciosa de la composición** — la validación no debe volcar la configuración, porque contiene secretos.
   8. **Descarga con salida en streaming.** Es el momento en que el operador ve avanzar la instalación.
   9. Levantamiento. El orden ya lo garantizan las dependencias de la composición.
   10. **Espera activa** consultando la ruta de salud, con indicador de avance y líneas por servicio. Al vencer el plazo, imprimir el estado de los contenedores y las últimas líneas del servicio en fallo, y salir con código de error.
   11. **Resumen:** URL del sistema, URL del portal, ruta del archivo de entorno, comando de registro de eventos, ruta del runbook — **y un bloque de pendiente sobre el primer administrador**, remitiendo al documento de bloqueo.

4. **Idempotencia real.** Ejecutar el instalador dos veces seguidas sobre el mismo servidor no debe romper nada, no debe regenerar secretos y no debe duplicar entradas en el archivo de entorno.

5. **Verificación de higiene en integración continua.** El shell no entra en el ejecutor de pruebas del repositorio, pero el repositorio ya valida configuración de forma estática. Aplicar el mismo patrón: una prueba que analiza **el texto del script** y asserta que declara modo estricto y máscara restrictiva, que no activa traza de ejecución, que **ninguna línea emite por salida estándar una variable cuyo nombre sugiera secreto**, y que el gate de referencias de imagen nombra todas las variables que debe cubrir. Añadirla a la suite de tooling.

---

## 4. Restricciones no negociables

1. **El instalador nunca imprime el valor de un secreto**, ni en modo de simulación, ni en registro de eventos, ni en mensaje de error. Verificado por la prueba estática.
2. **Nunca sobrescribe un secreto existente.**
3. **No crea usuarios de aplicación.** El bloqueo de la Decisión 6 se declara, no se elude.
4. **No sustituye las referencias de imagen pendientes de aprobación.** Solo las detecta y se detiene.
5. **No modifica el comportamiento del generador de secretos existente** al extraer su lógica. La extracción debe ser transparente.
6. **No valida la composición de forma que imprima su contenido.**
7. **Idempotente en todas sus fases.**
8. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable.

---

## 5. Entregables técnicos obligatorios

- Instalador en `scripts/`
- Módulo compartido de secretos en `scripts/lib/`, con el generador existente refactorizado a envoltorio
- Gemelo en shell del generador de certificados
- Prueba estática de higiene, integrada en `test:tooling`
- `pnpm test:tooling` y `pnpm audit:docker-context` en verde

## 6. Entregables documentales obligatorios

- `docs/runbooks/RUNBOOK-INSTALACION-ON-PREMISE-v1.0.md` — requisitos, procedimiento, diagnóstico de fallos frecuentes, **y la regla de que la raíz sirve la pantalla mientras la sonda es la ruta de salud**
- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F5-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md)
- **Revisión de AI-SEC-ENG** sobre manejo de secretos, permisos y material TLS, archivada en `docs/security/`
- Actualizar la tabla de comandos de `AGENTS.md` con la invocación del instalador
- [CHECKLIST-PLATAFORMA-ARRANQUE-F5-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F5-v1.0.md) marcado en vivo
- Fila F5 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) al cierre

---

## 7. Criterios de aceptación

- **CA-F5-01** — El modo de simulación completa sobre un clon limpio sin modificar nada.
- **CA-F5-02** — Ejecutarlo dos veces seguidas no regenera secretos ni duplica entradas del archivo de entorno.
- **CA-F5-03** — Con referencias de imagen pendientes de aprobación, **se detiene con mensaje legible** que nombra las variables y su dueño de decisión.
- **CA-F5-04** — La prueba estática falla si se introduce una línea que emite una variable de secreto. Verificado con control negativo.
- **CA-F5-05** — Ninguna salida contiene el valor de un secreto en ningún modo.
- **CA-F5-06** — Los archivos de entorno y el material privado de TLS quedan con permisos restrictivos.
- **CA-F5-07** — Las comprobaciones previas detectan runtime ausente, versión insuficiente, disco insuficiente y puerto ocupado, y cada una produce un mensaje accionable.
- **CA-F5-08** — La descarga es visible durante la instalación.
- **CA-F5-09** — Al vencer el plazo de espera, imprime estado de contenedores y últimas líneas del servicio en fallo, y sale con código de error.
- **CA-F5-10** — El resumen final incluye el bloque de pendiente sobre el primer administrador, remitiendo al documento de bloqueo.
- **CA-F5-11** — El generador de secretos existente conserva su comportamiento tras la extracción. Con control de regresión.
- **CA-F5-12** — Revisión de AI-SEC-ENG emitida con veredicto favorable.
- **CA-F5-13** — Evidencia de suites con **`Cached: 0`**.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- Extraer la lógica de secretos altera el comportamiento del generador existente → es regresión sobre una superficie de seguridad ya auditada.
- El instalador necesita imprimir un secreto para ser usable → **entonces no es usable así**; escalar el diseño, no relajar la regla.
- AI-SEC-ENG emite veredicto desfavorable.

**Documentar causa en:** el informe de fase y la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`. Toda excepción de seguridad escala al CTO.

## 9. Criterio de salida de la fase

- [ ] Instalador verificado en modo de simulación y en servidor limpio
- [ ] Idempotencia verificada con doble ejecución
- [ ] Gate de referencias de imagen verificado con control negativo
- [ ] Prueba de higiene en la suite de tooling, verificada con control negativo
- [ ] Generador de secretos existente sin regresión
- [ ] Runbook publicado
- [ ] Revisión de seguridad archivada con veredicto favorable
- [ ] Bloque de pendiente sobre el primer administrador presente y trazado al documento de bloqueo
- [ ] Informe de fase archivado con `Cached: 0` y checklist completo
