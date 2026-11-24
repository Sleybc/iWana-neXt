# ADR-116: Alta del primer administrador de plataforma en producción

**Versión:** 1.0
**Estado:** Aprobado
**Aprobación:** CTO, 2026-11-24 («Implementar opción 1»), sobre la [decisión de bloqueo B-01](../quality/DECISION-BLOQUEO-ADMIN-BOOTSTRAP-PRODUCCION-v1.0.md). Obligan las condiciones de §5.
**Fecha:** 2026-11-24
**Autor:** Claude Code (AI-PLAT-OPS) · **Revisión de seguridad:** AI-SEC-ENG (§6)
**Módulos:** `apps/api` (`cli`, `auth`) · `docker-compose.prod.yml`
**Origen:** [plan del entorno estable en la LAN](../plans/2026-11-24-piloto-lan-a-entorno-estable.md) §2.1

## 1. Contexto

Con `NODE_ENV=production`, la API rechaza las variables `PLATFORM_SUPER_ADMIN_*`: una credencial puesta en el despliegue la conoce quien despliega ([ADR-057](ADR-057-Credenciales-Iniciales-Por-Tenant.md)). El alta de tenants y de nuevas cuentas de plataforma exige ya una sesión de plataforma. Por eso una base vacía queda sin forma de entrar. El piloto LAN lo resolvió con un script fuera del repositorio que dejó la contraseña y el secreto TOTP en un mismo archivo (hallazgo H6 del plan).

## 2. Decisión

| # | Decisión |
| --- | --- |
| D1 | El CLI `apps/api/src/cli/bootstrap-platform-admin.ts` crea un `SYSTEM_ADMIN` con contraseña aleatoria de 24 bytes. La escribe solo en un archivo creado en exclusiva (`O_EXCL`, `O_NOFOLLOW`) con permisos `0600`. Nunca sale por stdout, stderr ni al registro de eventos. |
| D2 | El servicio `platform-admin-bootstrap` del overlay de producción lo ejecuta. Vive en el perfil `bootstrap`: `up --profile production` no lo arranca. El operador lo lanza una vez con su uid y su gid, para que el archivo quede suyo. |
| D3 | Si existe algún `SYSTEM_ADMIN` sin borrar, no hace nada y sale en 0. El canal de arranque solo sirve para la primera cuenta. Las siguientes se dan de alta desde la consola ([ADR-115](ADR-115-Activacion-de-Cuentas-de-Plataforma.md) (en revisión)). |
| D4 | La cuenta nace `PENDING_VERIFICATION`, con `passwordResetRequired = true` y sin MFA. El primer ingreso solo permite cambiar la contraseña. El siguiente solo entrega el token de enrolamiento MFA, el mismo camino que las altas desde consola. La consola se habilita al completar el MFA. Los campos los fija `buildBootstrapSuperAdmin`, compartida con el bootstrap de desarrollo; este conserva `ACTIVE`. |
| D5 | El alta y su registro en `platform_audit_logs` (`origen: BOOTSTRAP_CLI`, sin correo) van en una sola transacción, serializada con un advisory lock. Si el archivo no se escribe completo, la transacción se revierte. Si la confirmación falla, el archivo se borra. Un archivo previo nunca se sobrescribe ni se borra. |
| D6 | El operador borra el archivo tras el primer ingreso. |

## 3. Alternativas descartadas

| Alternativa | Por qué no |
| --- | --- |
| Credencial por variable de entorno en producción | Reintroduce el defecto que cerró ADR-057 |
| Comando que imprime la contraseña (opción 2 de B-01) | La salida estándar acaba en el historial de la terminal y en los logs del contenedor |
| Aceptar el bloqueo (opción 3) | El entorno queda arrancado y sin acceso |

## 4. Consecuencias

- Una base vacía queda utilizable de extremo a extremo sin archivos fuera del repositorio.
- Durante la ventana entre el alta y el primer ingreso, la credencial existe en un archivo del host. Se mitiga con `0600`, el cambio obligatorio y el borrado de D6.
- El CLI usa la conexión del rol de aplicación. No crea roles ni amplía grants.

## 5. Condiciones

1. El archivo se genera dentro de una carpeta ignorada por Git o fuera del repositorio.
2. Mientras la cuenta no exista, el 443 queda limitado al servidor (`docker-user-firewall.sh apply --allow <IP>/32`).
3. El primer ingreso, con cambio de contraseña y MFA, ocurre antes de abrir el acceso a la LAN.

## 6. Revisión de AI-SEC-ENG

AI-SEC-ENG, 2026-11-24. Veredicto inicial **NO-GO** por un hallazgo alto; quedó en **GO** tras corregirlo en la misma ola.

| # | Severidad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| A-01 | Alta | Creada `ACTIVE` sin MFA, tras el cambio de contraseña la cuenta obtenía sesión completa solo con contraseña | La cuenta nace `PENDING_VERIFICATION` (D4). Pruebas: estado en `bootstrap-platform-admin.spec.ts`; secuencia de login en `auth.service.spec.ts` |
| M-01 | Media | Si la conexión cae durante el COMMIT, la base puede haber confirmado aunque el cliente vea error: queda un admin sin credencial conocida y el reintento se omite | Recuperación documentada en el runbook §1.3: borrado auditado de la cuenta y reintento |
| B-01 | Baja | Un fallo de `unlinkSync` ocultaba el error original | `removeQuietly` |
| B-02 | Baja | `--email` queda en el historial del shell y en `ps` | Aceptado; anotado en el runbook |
| B-03 | Baja | Si la carpeta de salida no existe, Docker la crea como root y el alta falla con EACCES | El runbook crea la carpeta antes, con 0700 y del operador |

Sin hallazgos: fuga de la contraseña, manejo del archivo (`O_EXCL`, `O_NOFOLLOW`, 0600, fsync), concurrencia, PII y endurecimiento del contenedor.
