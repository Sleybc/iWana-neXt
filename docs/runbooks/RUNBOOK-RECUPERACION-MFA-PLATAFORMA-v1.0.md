# Runbook — Recuperación del segundo factor en plataforma

**Versión:** 1.0 · **Fecha:** 2026-11-25
**Origen:** [spec de MFA en plataforma](../specs/2026-11-25-mfa-plataforma-y-totp-uso-unico-spec.md) §3.3.6

## Cuándo

| Motivo (`--reason`)      | Caso                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `PERDIDA_DISPOSITIVO`    | El titular ya no tiene su aplicación autenticadora                 |
| `BLOQUEO_SEGUNDO_FACTOR` | Códigos erróneos repetidos mantienen la cuenta en espera           |
| `RELOJ_DESFASADO`        | El reloj del servidor se adelantó y los códigos nuevos se rechazan |
| `SECRETO_INDESCIFRABLE`  | La clave de cifrado cambió sin ventana de doble lectura            |

La espera dura 30 minutos como máximo y no cierra sesiones abiertas: si el titular conserva su aplicación, basta esperar.

## Antes

1. Verifica la identidad del titular por un canal distinto del correo y del chat donde llegó el pedido.
2. Si hubo códigos erróneos que el titular no reconoce, su contraseña está comprometida y el atacante podría inscribirse primero. Sigue «Contraseña comprometida» antes de ejecutar.
3. El actor es otro administrador activo. Solo si la cuenta es la única administradora activa puede figurar ella misma. El actor es declarado: correlaciónalo con el registro de acceso al servidor.

### Contraseña comprometida

Escala a AI-SEC-ENG. Cada paso manual se anota en el incidente con actor, hora y motivo, porque el SQL directo no deja auditoría.

1. Suspende la cuenta (`status = 'SUSPENDED'`): corta la renovación de sus sesiones.
2. Rota la contraseña con una temporal aleatoria, cambio obligatorio (`password_reset_required = true`) y entrega por canal seguro.
3. Reactiva (`status = 'ACTIVE'`) con el titular presente.
4. Ejecuta la recuperación y acompaña de inmediato el cambio de contraseña y la inscripción.

**Cuenta única:** mismos pasos y en la misma ventana de mantenimiento. Suspendida no hay actor válido, así que la recuperación va siempre después de reactivar. Mantener dos administradores con código evita este caso.

## Ejecución

```bash
docker exec iwana_api_prod node dist/cli/reset-platform-mfa.js --account=<uuid> --actor=<uuid> --reason=PERDIDA_DISPOSITIVO
```

En una transacción quita el MFA, pone a cero contador y espera, deja en NULL el último paso y registra `MFA_DISABLED` con actor y motivo. Si algo falla, no cambia nada.

## Después

1. Acompaña al titular: su siguiente ingreso pide inscribir el MFA. Hazlo de inmediato.
2. Las sesiones anteriores no se renuevan. Los access tokens ya emitidos vencen solos, 15 minutos por defecto.
3. Comprueba en la auditoría de plataforma el `MFA_DISABLED` y el `MFA_ENABLED` posterior.

## Alerta

El inicio de cada espera registra `PLATFORM_MFA_LOCKED` en el log de la API, en nivel error, y `ACCOUNT_LOCKED` en la auditoría. Hoy no hay canal de avisos: quien opera revisa ese evento.

```bash
docker logs --since 24h iwana_api_prod 2>&1 | grep PLATFORM_MFA_LOCKED
```
