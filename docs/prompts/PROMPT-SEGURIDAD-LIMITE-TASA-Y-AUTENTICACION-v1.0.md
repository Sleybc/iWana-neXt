# PROMPT-SEGURIDAD-LIMITE-TASA-Y-AUTENTICACION-v1.0

## Prompt de ejecución — control de tasa del API y corrección de dos críticos de autenticación

**Versión:** 1.0
**Estado:** Emitido — **G4 cumplido**
**Fecha:** 2026-08-04
**Emite:** AI-EM-ARCH (modo Orchestrator)
**Destinatarios:** AI-SR-FULL (aplicación) · AI-PLAT-OPS (borde) · AI-SEC-ENG (verificación)
**Origen:** escalación 1 de [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md`](../informes/INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.0.md) §10bis, aprobada por el CTO el 2026-08-04 (opción A), y el dictamen de AI-SEC-ENG que la ejecución de esa aprobación produjo

> **Esta fase es transversal al API, no de MOD02.** Corre en paralelo a la recomposición del dashboard y no comparte contratos con ella.

---

## 1. Por qué este prompt es más grande que lo aprobado

El CTO aprobó cablear un límite de tasa. Al diseñarlo, AI-SEC-ENG encontró **dos condiciones críticas que no constaban en el expediente** y que cambian tanto el diseño como su secuencia. Ambas están escaladas al CTO; este prompt las incorpora porque **desplegar el límite sin cerrarlas produciría un control con apariencia de funcionar**, que es peor que no tenerlo: cierra la investigación sin cerrar el riesgo.

| ID | Condición | Por qué es crítica |
| --- | --- | --- |
| **E-01** | **El segundo factor no tiene contador de intentos fallidos.** Ante un código TOTP inválido se lanza la excepción **sin registrar el intento**, mientras que la rama de contraseña inválida sí lo registra. El bloqueo por 5 intentos nunca se dispara sobre el segundo factor | El MFA no protege en el único escenario que lo justifica: contraseña ya comprometida. Afecta a las cuentas de mayor privilegio, incluida la superficie de plataforma que cruza todos los tenants |
| **E-02** | **La IP del cliente es falsificable.** La aplicación confía en la cadena completa de reenvío, bajo una precondición que su propio comentario declara y que el proxy inverso incumple: añade en vez de sustituir. La aplicación toma el valor más a la izquierda, que lo escribe el cliente | Cualquier límite con clave por IP es evadible con una cabecera. Y el campo de IP que hoy se persiste en la traza de auditoría es **evidencia forense no confiable de forma retroactiva** |

**Secuencia obligatoria:** E-02 es prerrequisito de toda fila con clave por IP. E-01 corre en paralelo con la misma prioridad, porque no depende del limitador y es la vía más corta a un compromiso total.

---

## 2. Alcance

### Entra

1. **E-02 — cadena de confianza de origen.** Las dos mitades, coordinadas: sustitución del encabezado de reenvío en el proxy inverso, y ajuste de la confianza en la aplicación.
2. **E-01 — contador de fallos del segundo factor**, con el mismo bloqueo que ya existe para la contraseña, en las dos rutas afectadas (verificación de acceso y verificación de alta de MFA).
3. **Limitador global** registrado como guard de aplicación, implementando las superficies S1–S10 del dictamen de AI-SEC-ENG con claves compuestas.
4. **Límites de borde** en el proxy inverso: conexiones y peticiones por origen, con ubicación dedicada y más estricta para autenticación y para la superficie pública de marca.
5. **Correcciones documentales** D1–D5 del dictamen.
6. **Barreras anti-regresión** B1–B4 del dictamen.
7. Verificación del comportamiento del portal en el flujo de primer acceso con MFA, que usa un camino alternativo al cliente HTTP normal.

### No entra

Detección de comportamiento y anomalías · unificación de las respuestas del oráculo de enumeración (se registra como trabajo derivado, con su propio análisis) · cuota diaria de exportaciones · revisión de la capa de reintentos del frontend (se traslada a AI-FE-PLATFORM como consulta) · cualquier cambio en la recomposición de MOD02.

---

## 3. Tracks

### Track S — Seguridad de aplicación (AI-SR-FULL)

| # | Paso | Criterio de hecho |
| --- | --- | --- |
| S-1 | **E-01.** Registrar el intento fallido también en la rama de segundo factor inválido, en las dos rutas | Test que agota el bloqueo por códigos TOTP inválidos, no solo por contraseña |
| S-2 | **E-02, mitad de aplicación.** Sustituir la confianza en la cadena completa por número de saltos o subred del proxy | **Coordinado con S-3 del track B.** Si esta mitad cambia sin la otra, todos los límites por IP colapsan en una única clave global — fallo catastrófico y silencioso |
| S-3 | Registrar el limitador como guard global, con resolución de superficie por metadatos de ruta | La barrera B1 asierta que el guard está registrado |
| S-4 | Implementar S1–S10: claves compuestas `(tenant, actor)` anidadas para superficies autenticadas, `(cuenta)` y `(ip/64)` para autenticación, cardinalidad de cuentas y de slugs para los barridos | La barrera B2 asierta el comportamiento por dimensión de clave |
| S-5 | Almacén Redis con incremento y expiración atómicos, reusando el patrón ya validado en el guard de MOD11 | Sin atomicidad el límite es orientativo, no un control |
| S-6 | **Asimetría deliberada ante caída de Redis:** fallo cerrado en S1–S5, fallo abierto con contador local degradado y alarma en S6–S9 | Documentado en el ADR, no como efecto lateral de la implementación |
| S-7 | Barreras B1, B2 y B3 | B3 recorre las rutas públicas y exige que cada una tenga superficie asignada |

**Decisiones ya tomadas — no reabrir.** Los siete decoradores de límite hoy inertes **se conservan**: al registrarse el guard pasan a ser efectivos y sus cotas son razonables. Eliminarlos destruiría la única expresión de política por ruta que existe.

**Prohibido:** exentar por cabecera o por IP de origen. Una exención basada en un valor que el cliente controla es una puerta trasera. La única exención admitida es por ruta explícita y auditada (S10).

### Track B — Borde (AI-PLAT-OPS)

| # | Paso |
| --- | --- |
| B-1 | Límite de conexiones y de peticiones por origen en la ubicación general del API, con cota gruesa muy por encima de la de aplicación para no duplicar política |
| B-2 | Ubicaciones dedicadas y estrictas para las rutas de autenticación y para la marca pública |
| B-3 | **E-02, mitad de borde.** Sustituir el encabezado de reenvío por la dirección remota real, o configurar la reescritura de IP real con la red del proxy, en los dos archivos de configuración. **Coordinado con S-2** |
| B-4 | Tamaño máximo de cuerpo y tiempos de espera |
| B-5 | Verificar que las sondas de salud del contenedor y del propio proxy no quedan sujetas al límite |

### Track V — Verificación (AI-SEC-ENG y AI-SR-QA)

| # | Paso |
| --- | --- |
| V-1 | **Modo observación primero en S6–S9.** Contar y registrar sin rechazar, medir percentiles reales, y solo entonces activar el rechazo con cotas calibradas. Las cifras del dictamen son un punto de partida razonado, **no medido** |
| V-2 | Ajustar la suite E2E: reutilización de sesión para no reautenticar en cada spec, y **al menos un spec dedicado que verifique el 429 con cotas de producción**. Sin él, el control nunca se prueba de verdad |
| V-3 | Verificar que el token de alcance de alta de MFA resuelve identidad para la clave de S2 — el portal usa ahí un camino que se salta el cliente HTTP normal |
| V-4 | Re-verificación de AI-SEC-ENG sobre E-01 y E-02 antes de cerrar |

---

## 4. Restricciones

- **Nunca desactivar el límite en pruebas.** Cotas parametrizadas por entorno con valores holgados fuera de producción; si se desactiva, la suite deja de probar el control.
- Métricas de rechazo **sin PII**: nunca el correo ni el documento como clave ni como dimensión. El identificador de cuenta viaja como valor derivado con sal de servidor.
- Cuerpo de la respuesta de rechazo **genérico**: no revelar qué contador se agotó ni cuál era la cota.
- El limitador corre **después** de la autenticación en superficies autenticadas, para disponer de identidad verificada; **antes** de cualquier trabajo costoso en superficies públicas.
- Tenant desde el JWT verificado, **jamás** desde la cabecera de slug en rutas autenticadas.
- Sin PII ni credenciales en código, pruebas, registros ni documentos.

## 5. Criterio stop / go

**Stop —** emite `[BLOQUEO]` a AI-EM-ARCH antes de cerrar la sesión si: la corrección de E-02 no puede coordinarse en un solo despliegue entre borde y aplicación · una cota rompe un flujo legítimo que no está en la lista de riesgos de activación · aparece una tercera condición crítica.

**Go —** condición de cierre: E-01 y E-02 cerrados con re-verificación de AI-SEC-ENG · guard global registrado y barreras B1–B4 en verde · límites de borde desplegados · S1–S5 activos en rechazo y S6–S9 al menos en observación con datos · correcciones documentales D1–D5 aplicadas · suite E2E estable con el spec de 429 · sin PII en métricas ni claves.

**Este prompt no autoriza despliegue a producción.** G7 exige recomendación de AI-EM-ARCH y aprobación del CTO. El dictamen de AI-SEC-ENG declara E-01 y E-02 **bloqueantes de despliegue**, y esa clasificación se mantiene hasta su re-verificación.

## 6. Corrección del expediente

La escalación que elevé al CTO afirmaba que **tres** documentos declaraban un control inexistente. AI-SEC-ENG verificó que son **dos** —el comentario de arranque de la aplicación y las instrucciones del proyecto— y que el documento de gobernanza maestro **no afirma nada: calla**. La acción sobre él es por tanto **añadir** el control como gate, no corregir una falsedad. La decisión del CTO no se ve afectada; el expediente sí, y queda corregido aquí.

Igualmente: los decoradores inertes son **siete**, no dos, y el controlador de autenticación **no tiene ninguno** — la superficie de mayor riesgo del producto es la única sin siquiera la intención declarada del control.
