# DECISIÓN DE BLOQUEO TÉCNICO — Primer administrador de plataforma en producción

**Identificador del bloqueo:** B-01
**Versión:** 1.0
**Estado:** **Abierto — escalado al CTO**

## Identificación

- **Frente:** Plataforma transversal — experiencia de arranque e instalación
- **Fase afectada:** F5 (instalador on-premise). **No afecta a F0, F1, F2, F3, F4 ni F6**
- **Fecha:** 2026-08-08
- **Emitido por:** AI-EM-ARCH
- **Marcador:** `[ESCALACION AL CTO]`
- **Prioridad:** Alta
- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §4.6, §8
- **ADR que lo declara:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) *(propuesto)* — Decisión 6

---

## 1. Resumen del bloqueo

**Descripción.** El instalador on-premise que produce F5 puede llevar un servidor limpio hasta un sistema levantado y respondiendo, pero **no puede entregar al operador ninguna forma de entrar**. La instancia queda operativa y sin acceso.

Esto rompe el segundo invariante que el CTO pidió replicar de la referencia externa: *el cierre es accionable*. Un instalador que termina con "el sistema está listo" pero sin decir cómo entrar, no ha terminado.

**Fecha de detección:** 2026-08-08, durante el diseño técnico del frente.
**Severidad:** Alta. No compromete seguridad ni datos; compromete la usabilidad completa del despliegue on-premise.

---

## 2. Causa raíz verificable

**Restricción técnica.** La validación de configuración de la API **rechaza explícitamente** las variables de credencial de arranque de plataforma cuando el entorno declarado es productivo o de staging. El mensaje de rechazo es deliberado y dice, en esencia, que la credencial de arranque es **conocida por diseño** y que el usuario de plataforma debe crearse por un flujo autenticado.

**Dependencia faltante.** Ese "flujo de bootstrap autenticado" al que remite el mensaje **no existe todavía** como camino ejecutable en producción:

- El servicio que crea el superusuario al arrancar la aplicación depende de esas mismas variables, así que en producción **no se dispara nunca**.
- No existe comando de línea equivalente en el paquete de la API.
- El alta de tenants y sus administradores requiere ya un token de plataforma — es decir, requiere el usuario que no se puede crear.

**Es una restricción correcta, no un defecto.** Deriva del invariante de [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md): la credencial inicial **no debe ser conocida por quien despliega**. Ese invariante ya eliminó la contraseña compartida de tenants y es el que hace que el ADMIN inicial nazca bloqueado. El bloqueo actual es el precio de haberlo aplicado también a la plataforma. **La solución no puede ser relajarlo.**

**Evidencia:** validación de configuración de la API con su mensaje de rechazo · servicio de bootstrap de plataforma condicionado a esas variables · prueba dedicada que cubre el rechazo en entorno productivo · [ADR-057](../adrs/ADR-057-Credenciales-Iniciales-Por-Tenant.md).

---

## 3. Impacto

| Dimensión | Impacto |
| --- | --- |
| **Backend** | Ninguno sobre lo existente. Resolverlo exige un camino nuevo de creación de administrador de plataforma |
| **Frontend** | Ninguno. El flujo de primer ingreso con cambio forzado de contraseña ya existe y funciona; el problema es que no hay credencial que introducir |
| **Base de datos** | Ninguno. No requiere migración |
| **Cronograma** | Bloquea **solo el cierre de F5**. F0, F1, F2, F3, F4 y F6 avanzan sin depender de esta decisión |
| **Calidad y seguridad** | **Positivo si se resuelve bien, grave si se resuelve mal.** La tentación es permitir la credencial por variable de entorno en producción: eso reintroduciría exactamente el defecto que ADR-057 cerró |

**Mitigación provisional en vigor:** el instalador v1 cierra con un bloque `[PENDIENTE]` que remite a este documento. Es honesto y no crea deuda oculta, pero no es una experiencia aceptable a medio plazo.

---

## 4. Opciones evaluadas

### Opción 1 — Servicio one-shot de bootstrap de administrador *(recomendada)*

Un servicio de ejecución única en la composición de producción, invocado por el instalador, que crea el administrador de plataforma con contraseña generada aleatoriamente y **la escribe a un archivo del host con permisos restrictivos**. Nunca a la salida estándar, nunca al registro de eventos. El administrador nace con cambio de contraseña obligatorio, como ya ocurre en desarrollo. Idempotente: si el usuario existe, no hace nada.

- **Pros:** preserva el invariante de ADR-057 —quien despliega no conoce la credencial hasta que la lee del archivo protegido, y se le exige cambiarla—. Reutiliza el flujo de primer ingreso que ya existe y está auditado. Encaja en la secuencia del instalador sin intervención manual. El archivo es revocable: se borra tras el primer ingreso.
- **Contras:** superficie nueva en la composición de producción. Exige cuidado con permisos y propiedad del archivo. Requiere que el instalador instruya sobre borrarlo.

### Opción 2 — Comando de línea ejecutado dentro del contenedor

Un comando en el paquete de la API que el operador ejecuta manualmente tras la instalación, dentro del contenedor ya corriendo.

- **Pros:** sin servicio nuevo en la composición. Control explícito del operador sobre cuándo se crea la cuenta.
- **Contras:** paso manual fuera del instalador, justo en el momento de mayor fricción. El operador debe saber invocar comandos dentro de contenedores. La salida del comando es el canal natural de la contraseña, y **la salida estándar es precisamente donde no debe ir**.

### Opción 3 — Aceptar el bloqueo en v1

El instalador cierra con bloque de pendiente y el alta se documenta como procedimiento manual en el runbook.

- **Pros:** coste cero, ninguna superficie nueva, ningún riesgo introducido.
- **Contras:** el despliegue on-premise **no queda utilizable de extremo a extremo**. Incumple el objetivo declarado del frente. Traslada al operador un problema que el producto debería resolver.

---

## 5. Recomendación

**Recomendación de AI-EM-ARCH: Opción 1** — servicio one-shot de bootstrap de administrador con escritura a archivo protegido del host.

**Justificación.** Es la única que cierra el flujo de extremo a extremo **sin tocar el invariante de ADR-057**. La Opción 2 empuja la contraseña hacia la salida estándar, que es el canal que todo el resto del frente prohíbe expresamente. La Opción 3 no resuelve el problema: lo documenta.

**Requiere ADR propio**, con el siguiente número libre en el momento de emitirlo — *este documento no reserva número: una cita a un ADR inexistente no confiere autoridad y el gate de citas la bloquea*. No se resuelve dentro de ADR-079 *(propuesto)*: es una superficie de creación de credenciales en producción, que es materia de decisión del CTO por sí sola.

**Condiciones para retomar F5 hasta el cierre:**

1. Decisión del CTO sobre la opción.
2. Si es la Opción 1 o la 2: el ADR correspondiente, emitido y **aprobado**.
3. Revisión de AI-SEC-ENG sobre el mecanismo elegido, con atención específica a permisos, propiedad y ciclo de vida del material generado.

**Repriorización.** No procede. F5 **se ejecuta igualmente** hasta su penúltimo paso; solo su criterio de salida queda condicionado. Ninguna otra fase se repriorizará por este bloqueo.

---

## 6. Decisión

- **Continuar con las demás fases:** Sí — F0, F1, F2, F3, F4 y F6 no dependen de esta decisión
- **Continuar con F5 hasta el bloque de pendiente:** Sí
- **Cerrar F5:** **No**, hasta que se resuelva
- **Repriorizar:** No
- **Requiere aprobación del CTO:** **Sí**
- **Requiere ADR nuevo:** Sí, si se elige la Opción 1 o la 2 — con el siguiente número libre al emitirlo
- **Aprobadores:** CTO
- **Decisión requerida antes de:** el cierre de F5 y, por tanto, antes de que el frente pueda recomendar G7

---

## 7. Trazabilidad

- **Registrado en:** [tablero](CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) §4 como B-01 · [checklist F5](CHECKLIST-PLATAFORMA-ARRANQUE-F5-v1.0.md) §Pendientes · [informe consolidado](../informes/INFORME-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) §8
- **Regla de caducidad:** un marcador emitido y no atendido **no caduca: escala**. Si no se resuelve en la sesión siguiente a su emisión, sube al CTO como escalación con la opción recomendada
