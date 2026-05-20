# PRD — Módulo 2 Frontend: Auth Empresarial de Tenant Activo

## iWana neXt Platform — Frontend Web de Autenticación

**Versión:** 1.0
**Fecha:** 2026-03-16
**Estado:** En revisión
**Modo activo:** Architect
**Autor:** AI-EM-ARCH (Lead Software Architect Senior)
**Trazabilidad base:** docs/prds/PRD-MOD02-DEFINICION-v1.0.md
**HLD de referencia:** docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md
**Informe relacionado:** docs/informes/INFORME-MOD02-DEFINICION-v1.0.md
**ADRs aplicables:** ADR-019, ADR-022, ADR-023, ADR-025, ADR-026

> Nota de alcance: este PRD no redefine el dominio Auth ni crea un nuevo bounded context. Aterriza exclusivamente la capa frontend requerida para operar MOD02 en apps/web y apps/portal sobre la base funcional ya aprobada en el PRD del módulo.

---

## 1. Contexto y motivación

MOD02 ya tiene el alcance funcional de autenticación empresarial definido a nivel de backend, seguridad, auditoría y contratos API. Sin embargo, el módulo todavía necesita un artefacto de producto específico para cerrar la ejecución frontend con criterios claros de rutas, estados de sesión, UX de seguridad, accesibilidad y pruebas.

El frontend de MOD02 no es un simple consumidor pasivo del backend. Debe orquestar flujos de seguridad con transiciones estrictas de estado:

- login normal,
- MFA requerido,
- cambio obligatorio de contraseña,
- setup MFA con token de alcance limitado,
- recuperación de contraseña,
- redirección segura según contexto de autenticación.

Sin este PRD frontend, el equipo corre el riesgo de completar pantallas aisladas pero dejar inconsistencias entre apps/web y apps/portal, comportamientos divergentes de AuthProvider, estados de error no alineados y brechas de UX en flujos críticos del módulo.

---

## 2. Alcance

### IN — Lo que sí cubre este PRD

- Definición funcional y de experiencia de usuario para los flujos auth de MOD02 en apps/web y apps/portal.
- Estados de sesión y transición requeridos en AuthProvider y formularios de autenticación.
- Rutas frontend necesarias para login, MFA verify, MFA setup, change-password, forgot-password y reset-password.
- Reglas de navegación y redirección segura antes de habilitar acceso al dashboard.
- Requerimientos de accesibilidad, validación y seguridad del lado cliente.
- Criterios mínimos de testing frontend para cierre de fase.

### OUT — Lo que no cubre este PRD

- Cambios al modelo de datos del módulo.
- Nuevos endpoints backend fuera de los ya definidos en MOD02.
- Replanteamiento del Auth híbrido aprobado por ADR-023.
- Reemplazo del design system actual o cambio de stack frontend.
- Integración de notificaciones por correo fuera del consumo de enlaces de recuperación/verificación.
- Tenant switching multi-tenant como capacidad de producto independiente.

### Dependencias explícitas

- PRD-MOD02-DEFINICION-v1.0.md aprobado como fuente funcional.
- HLD-MOD02-ARQUITECTURA-v1.0.md aprobado como fuente de flujo y decisiones técnicas.
- Endpoints /auth del backend operativos y alineados a OpenAPI.
- Componentes base de UI disponibles en @iwana/ui.

---

## 3. Personas y casos de uso

### 3.1 Personas frontend

| Persona                          | App principal          | Necesidad                                                                                         |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| ADMIN del tenant                 | apps/portal y apps/web | Completar primer acceso seguro sin entrar al dashboard antes de cambiar contraseña y activar MFA  |
| Operador crítico                 | apps/web               | Iniciar sesión con MFA obligatorio y recibir feedback claro ante TOTP requerido o setup pendiente |
| Usuario operativo                | apps/web               | Iniciar sesión, recuperar acceso y navegar sin fricción innecesaria                               |
| Suscriptor o tercero autenticado | apps/portal            | Acceder por tenant con rutas claras, errores comprensibles y aislamiento de sesión                |

### 3.2 Casos de uso prioritarios

#### UC-FE-01: Login tenant-aware

- El usuario ingresa tenant slug, email y contraseña.
- El frontend resuelve si debe continuar a dashboard, MFA verify, change-password o MFA setup.

#### UC-FE-02: Primer acceso ADMIN

- El frontend obliga la secuencia login temporal → change-password → nuevo login → MFA setup → login final.
- Ningún paso permite saltar directamente al dashboard.

#### UC-FE-03: MFA ya configurado

- El usuario crítico recibe estado intermedio para capturar TOTP.
- El frontend conserva solo el contexto mínimo temporal para completar el login.

#### UC-FE-04: Recuperación de contraseña

- El frontend muestra respuesta neutra en forgot-password.
- El usuario aterriza desde el enlace de reset, define nueva contraseña y vuelve a login.

#### UC-FE-05: Expiración o inconsistencia de sesión

- Ante token inválido, refresh fallido o token de MFA setup vencido, el frontend limpia estado local y redirige a login.

---

## 4. Requerimientos funcionales

### 4.1 RF-FE-AUTH

| ID            | Requerimiento                                                                                                                                               | Prioridad |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-FE-AUTH-01 | El login debe soportar tenant slug, email y contraseña con validación cliente basada en Zod.                                                                | MVP       |
| RF-FE-AUTH-02 | El frontend debe interpretar los resultados del backend como estados explícitos: authenticated, mfa_required, password_reset_required y mfa_setup_required. | MVP       |
| RF-FE-AUTH-03 | Si el backend devuelve passwordResetRequired, el usuario debe ser redirigido obligatoriamente a /auth/change-password.                                      | MVP       |
| RF-FE-AUTH-04 | Si el backend devuelve mfaRequired, el usuario debe ser redirigido a /auth/mfa/verify sin marcar la sesión como autenticada.                                | MVP       |
| RF-FE-AUTH-05 | Si el backend devuelve mfaSetupRequired, el frontend debe persistir solo el token limitado de MFA setup y redirigir a /auth/mfa/setup.                      | MVP       |
| RF-FE-AUTH-06 | El token de alcance limitado no debe habilitar navegación a rutas protegidas ni poblar el estado user del AuthProvider.                                     | MVP       |
| RF-FE-AUTH-07 | El logout debe limpiar el estado local y retornar a login.                                                                                                  | MVP       |
| RF-FE-AUTH-08 | El frontend debe refrescar perfil autenticado con el contrato /auth/me y degradar limpiamente a estado anónimo cuando falle la sesión.                      | MVP       |

### 4.2 RF-FE-ROUTING

| ID          | Requerimiento                                                                                                                                                 | Prioridad |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RF-FE-RT-01 | apps/portal debe exponer las rutas /auth/login, /auth/change-password, /auth/forgot-password, /auth/reset-password, /auth/mfa/verify y /auth/mfa/setup.       | MVP       |
| RF-FE-RT-02 | apps/web debe mantener paridad funcional en login, change-password, forgot-password y mfa/verify; si MFA setup no existe aún, debe incorporarse en esta fase. | MVP       |
| RF-FE-RT-03 | Las rutas protegidas deben rechazar acceso anónimo y redirigir a login preservando next cuando aplique.                                                       | MVP       |
| RF-FE-RT-04 | El flujo de primer acceso no debe dejar rutas huérfanas ni ciclos de redirección.                                                                             | MVP       |

### 4.3 RF-FE-UX

| ID          | Requerimiento                                                                                                            | Prioridad |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| RF-FE-UX-01 | Cada formulario debe mostrar errores de validación campo a campo y errores de backend con lenguaje claro y no filtrante. | MVP       |
| RF-FE-UX-02 | Los formularios deben tener estados visibles de loading, éxito y error.                                                  | MVP       |
| RF-FE-UX-03 | MFA setup debe guiar al usuario con pasos explícitos: obtener QR, escanear y verificar código TOTP.                      | MVP       |
| RF-FE-UX-04 | Forgot-password debe mostrar una respuesta neutra que no revele existencia de cuenta.                                    | MVP       |
| RF-FE-UX-05 | Change-password debe reflejar política de contraseña vigente y confirmar coincidencia de campos.                         | MVP       |

### 4.4 RF-FE-SEG

| ID           | Requerimiento                                                                                                                         | Prioridad   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| RF-FE-SEC-01 | El frontend no debe exponer secretos, lógica de tenant sensible ni tokens en logs o mensajes de error.                                | Obligatorio |
| RF-FE-SEC-02 | El tenant debe resolverse del lado servidor o por input controlado; no se debe derivar desde lógica cliente opaca o hardcoded.        | Obligatorio |
| RF-FE-SEC-03 | El token temporal de MFA setup debe almacenarse con clave separada, vida corta y eliminación inmediata tras uso exitoso o expiración. | Obligatorio |
| RF-FE-SEC-04 | La UI debe limpiar sesión local ante errores 401/403 relevantes para evitar estados inconsistentes.                                   | Obligatorio |

---

## 5. Requerimientos no funcionales

| Categoría      | Requerimiento                                                                                                                     | Meta           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Arquitectura   | Next.js App Router con Server Components por defecto y Client Components solo donde haya interacción real.                        | Obligatorio    |
| Accesibilidad  | Cumplir WCAG 2.2 AA en formularios, navegación por teclado, labels, mensajes de error y aria-live en estados críticos.            | Obligatorio    |
| Seguridad      | Sin secretos ni PII real en bundle, logs, fixtures ni mensajes UI.                                                                | Obligatorio    |
| Consistencia   | apps/web y apps/portal deben compartir el mismo lenguaje de estados auth y la misma semántica de errores.                         | Obligatorio    |
| UX             | Flujos críticos de auth deben minimizar ambigüedad y evitar dead ends.                                                            | Objetivo MVP   |
| Testing        | E2E de primer acceso y recuperación de contraseña disponibles para cierre; unit tests en lógica crítica de estado cuando aplique. | Gate de salida |
| Mantenibilidad | Comentarios en español en flujos no triviales y tipado estricto en contratos auth del frontend.                                   | Obligatorio    |

---

## 6. Modelo de datos borrador

### 6.1 Estado frontend de autenticación

El frontend no introduce nuevas entidades persistentes de dominio. Opera con estos estados de sesión y apoyo:

- user autenticado derivado de /auth/me,
- access token de sesión normal,
- refresh token vía cookie httpOnly manejada por backend,
- token temporal de MFA setup,
- contexto temporal de MFA login pendiente,
- tenant slug persistido para continuidad del flujo.

### 6.2 Estructura lógica mínima

| Elemento              | Origen                     | Uso                                                         |
| --------------------- | -------------------------- | ----------------------------------------------------------- |
| LoginResult           | AuthProvider               | Determinar redirección posterior al login                   |
| JwtProfile            | /auth/me                   | Construir estado user de la app                             |
| pendingTenantMfaLogin | estado temporal de cliente | Completar MFA verify cuando el backend exige TOTP           |
| mfa-setup-token       | localStorage separado      | Autorizar exclusivamente /auth/mfa/setup y /auth/mfa/verify |

### 6.3 Restricciones de modelado

- El token limitado de MFA setup no representa una sesión autenticada completa.
- El frontend no debe persistir más contexto sensible del estrictamente necesario para completar MFA.
- No se introducen stores globales alternativos ni estado cross-app fuera del patrón actual con AuthProvider.

---

## 7. Contratos de API borrador

### 7.1 Endpoints consumidos por frontend MOD02

| Método | Ruta                                   | Uso frontend                                      |
| ------ | -------------------------------------- | ------------------------------------------------- |
| POST   | /api/v1/auth/login                     | Resolver estado inicial de autenticación          |
| GET    | /api/v1/auth/me                        | Poblar perfil autenticado                         |
| POST   | /api/v1/auth/refresh                   | Renovar access token cuando expire                |
| POST   | /api/v1/auth/logout                    | Cerrar sesión                                     |
| POST   | /api/v1/auth/change-password           | Completar cambio obligatorio o cambio autenticado |
| POST   | /api/v1/auth/mfa/setup                 | Obtener QR y secret de activación                 |
| POST   | /api/v1/auth/mfa/verify                | Confirmar MFA setup o MFA login según flujo       |
| POST   | /api/v1/auth/forgot-password           | Solicitar recuperación                            |
| POST   | /api/v1/auth/reset-password            | Definir nueva contraseña con token temporal       |
| POST   | /api/v1/auth/email/verify              | Confirmar verificación de email                   |
| POST   | /api/v1/auth/email/resend-verification | Reenviar verificación                             |

### 7.2 Reglas de contrato relevantes para frontend

- login puede devolver estado completo, requerimiento de TOTP, requerimiento de cambio de contraseña o requerimiento de setup MFA.
- refresh viaja por cookie httpOnly y no debe tratarse como token accesible desde la UI.
- /auth/mfa/setup y /auth/mfa/verify aceptan token normal o token scope mfa-setup según el HLD.
- forgot-password siempre debe tratarse como respuesta exitosa neutral desde la perspectiva de UI.

### 7.3 Restricciones de integración

- Todo request tenant-aware debe enviar X-Tenant-Slug cuando aplique.
- La lógica de reintento por refresh debe degradar a login si el backend invalida la sesión.
- Si el token mfa-setup expira, el frontend debe forzar reinicio del flujo desde login.

---

## 8. Criterios de aceptación

1. apps/portal y apps/web exponen el conjunto de rutas de auth requerido por MOD02 sin flujos rotos.
2. El resultado del login se modela con estados explícitos y cada estado redirige al siguiente paso correcto.
3. El ADMIN de primer acceso no puede llegar al dashboard sin completar change-password y MFA setup.
4. Los roles críticos con MFA configurado pueden completar login vía MFA verify sin inconsistencias de estado.
5. El token temporal de MFA setup se almacena por separado, no autentica la app y se elimina al terminar o expirar.
6. Forgot-password y reset-password operan con UX segura, mensajes no filtrantes y retorno claro a login.
7. Los formularios cumplen validación accesible, estados de carga y feedback de error visible.
8. Las rutas protegidas redirigen correctamente al usuario anónimo y no generan loops.
9. Existen pruebas E2E para flujo de primer acceso y recuperación de contraseña, alineadas al PRD del módulo.
10. La documentación de MOD02 queda trazada con este PRD frontend y su informe relacionado.

---

## 9. Dependencias y riesgos

### Dependencias

- Implementación backend ya cerrada de MOD02 Sprint 01.
- Contratos auth estables entre apps frontend y API.
- Design system y componentes auth reutilizables disponibles en @iwana/ui y en cada app.

### Riesgos

| ID            | Riesgo                                                                          | Impacto | Tratamiento                                                       |
| ------------- | ------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| R-FE-MOD02-01 | Divergencia de comportamiento entre apps/web y apps/portal                      | Alto    | Definir paridad de estados y rutas como requisito del PRD         |
| R-FE-MOD02-02 | Token temporal de MFA setup tratado como sesión normal                          | Crítico | Mantener storage separado y exclusión explícita del estado user   |
| R-FE-MOD02-03 | Change-password redirige al destino incorrecto según app                        | Medio   | Formalizar reglas de navegación por flujo y validar con E2E       |
| R-FE-MOD02-04 | Errores de backend se muestran con mensajes filtrantes o inconsistentes         | Alto    | Catálogo de mensajes seguro y revisión UX/security                |
| R-FE-MOD02-05 | Falta de MFA setup equivalente en apps/web deja cobertura incompleta del módulo | Alto    | Incluirlo explícitamente en alcance o documentar gap como bloqueo |

### Escalación

[ESCALACION AL CTO]
Prioridad: Media
Contexto: si se decide que apps/web no tendrá paridad funcional para MFA setup en esta fase y se acepta una cobertura parcial del frontend MOD02.
Opciones evaluadas: implementar paridad completa, aceptar solo portal como superficie inicial, mover apps/web a sprint siguiente con bloqueo documental.
Recomendación: exigir paridad mínima de flujos críticos entre ambas apps o dejar el recorte aprobado explícitamente antes del cierre de fase.
Decision requerida antes de: aprobación final del PRD frontend y planificación de ejecución.

---

## 10. Definition of Done

- PRD frontend emitido y trazado a PRD/HLD del módulo.
- Rutas auth requeridas implementadas y operativas en la o las apps definidas en alcance.
- AuthProvider y api-client reflejan de forma consistente los cuatro estados de login requeridos.
- MFA setup con token limitado funciona sin convertir al usuario en autenticado completo.
- Change-password, forgot-password y reset-password tienen UX y validación alineadas a seguridad.
- E2E críticos de primer acceso y recuperación están implementados y listos para ejecución.
- No hay secretos, PII real ni tokens expuestos en código o documentación.
- Informe vivo de MOD02 actualizado con el nuevo artefacto documental y su estado.
