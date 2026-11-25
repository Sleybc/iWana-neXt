# Runbook — Recuperación del segundo factor en plataforma

**Versión:** 1.0 · **Fecha:** 2026-11-25
**Origen:** [spec de MFA en plataforma](../specs/2026-11-25-mfa-plataforma-y-totp-uso-unico-spec.md) §3.3.6

## Cuándo

| Motivo (`--reason`)       | Caso                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `PERDIDA_DISPOSITIVO`     | El titular ya no tiene su aplicación autenticadora                 |
| `BLOQUEO_SEGUNDO_FACTOR`  | Códigos erróneos repetidos mantienen la cuenta en espera           |
| `RELOJ_DESFASADO`         | El reloj del servidor se adelantó y los códigos nuevos se rechazan |
| `CONTRASENA_COMPROMETIDA` | Códigos erróneos que el titular no reconoce; exige `--output`      |
| `SECRETO_INDESCIFRABLE`   | La clave de cifrado cambió sin ventana de doble lectura            |

La espera dura 30 minutos como máximo y no cierra sesiones abiertas: si el titular conserva su aplicación, basta esperar.

## Antes

1. Verifica la identidad del titular por un canal distinto del correo y del chat donde llegó el pedido.
2. Si hubo códigos erróneos que el titular no reconoce, su contraseña está comprometida y el atacante podría inscribirse primero. Sigue «Contraseña comprometida» antes de ejecutar.
3. El actor es otro administrador activo. Solo si la cuenta es la única administradora activa puede figurar ella misma. El actor es declarado: correlaciónalo con el registro de acceso al servidor.

### Contraseña comprometida

Escala a AI-SEC-ENG y ejecuta la recuperación con rotación. Todo va en una transacción auditada, sin SQL manual ni suspensión: la contraseña anterior deja de servir a la vez que se retira el MFA y las sesiones ya no se renuevan; los access tokens emitidos vencen solos, 15 minutos por defecto. Vale para una cuenta administradora única. No activa ni reactiva cuentas pendientes o suspendidas.

```bash
docker exec iwana_api_prod node dist/cli/reset-platform-mfa.js --account=<uuid> --actor=<uuid> --reason=CONTRASENA_COMPROMETIDA --output=/tmp/recuperacion.txt
```

La temporal queda solo en ese archivo del contenedor (0600). Léela en una terminal sin grabación, entrégala por canal seguro y bórrala enseguida. No uses `docker cp`: deja otra copia en el servidor.

```bash
docker exec iwana_api_prod cat /tmp/recuperacion.txt
```

```bash
docker exec iwana_api_prod rm /tmp/recuperacion.txt
```

Acompaña de inmediato el cambio de contraseña y la inscripción del MFA. Si el contenedor se recrea antes de leerla, repite con `--output`.

**Resultado incierto:** si el comando lo avisa, busca `PASSWORD_CHANGED` con origen `RECUPERACION_CLI`. Si existe, usa el archivo. Si no, bórralo y repite.

## Ejecución

```bash
docker exec iwana_api_prod node dist/cli/reset-platform-mfa.js --account=<uuid> --actor=<uuid> --reason=PERDIDA_DISPOSITIVO
```

En una transacción quita el MFA, pone a cero contador y espera, deja en NULL el último paso y registra `MFA_DISABLED` con actor y motivo. Si falla antes de confirmar, no cambia nada.

## Después

1. Acompaña al titular: su siguiente ingreso pide inscribir el MFA. Hazlo de inmediato.
2. Las sesiones anteriores no se renuevan. Los access tokens ya emitidos vencen solos, 15 minutos por defecto.
3. Comprueba en la auditoría de plataforma el `MFA_DISABLED` (si la cuenta tenía MFA), el `PASSWORD_CHANGED` (si rotaste) y el `MFA_ENABLED` posterior.

## Alerta

El inicio de cada espera registra `PLATFORM_MFA_LOCKED` en el log de la API, en nivel error, y `ACCOUNT_LOCKED` en la auditoría. Hoy no hay canal de avisos: quien opera revisa ese evento.

```bash
docker logs --since 24h iwana_api_prod 2>&1 | grep PLATFORM_MFA_LOCKED
```
