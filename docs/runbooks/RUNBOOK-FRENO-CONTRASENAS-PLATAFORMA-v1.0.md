# Runbook — Freno de contraseñas en plataforma

**Versión:** 1.0 · **Fecha:** 2026-11-26
**Origen:** [spec de sesión absoluta y freno](../specs/2026-11-25-sesion-absoluta-y-freno-contrasenas-spec.md) §4 · [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md) enmienda 4

## Cómo funciona

| Regla       | Valor                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clave       | Cuenta + IP (IPv4 completa; IPv6 por /64). Quienes salen por la misma VPN o NAT la comparten                                                                                               |
| Freno       | 10 contraseñas erróneas en 15 minutos → 15 minutos de rechazo para esa pareja                                                                                                              |
| Lo que ve   | «Credenciales inválidas», igual que con una contraseña errónea                                                                                                                             |
| Otras IP    | No se frenan: el titular entra desde otra red con su contraseña                                                                                                                            |
| Aviso       | 50 erróneas por hora en la cuenta: log `PLATFORM_PASSWORD_ATTACK`, auditoría y correo al titular y a los administradores activos, una vez por hora. Con un correo inexistente, solo el log |
| Redis caído | `platform/login` responde 503 sin comprobar la contraseña                                                                                                                                  |

El freno vence solo. Lo normal es esperar 15 minutos.

## Titular frenado

1. Verifica la identidad por un canal distinto del correo y del chat donde llegó el pedido.
2. Pregunta si reconoce los intentos. Si no, sigue «Ataque» y no retires el freno.
3. Si puede esperar 15 minutos, no hagas nada más.
4. No retires el freno si en la última hora hay `PLATFORM_PASSWORD_ATTACK` o auditoría `ATAQUE_CONTRASENA` para la cuenta, ni si ya se retiró hoy para esa cuenta sin aprobación de AI-SEC-ENG.
5. Si no puede esperar, obtén la IP pública desde la que entra el titular y retira el freno de esa pareja. Antes, comprueba que la IP coincide con la `ipAddress` de la auditoría `ACCOUNT_LOCKED` con motivo `FRENO_CONTRASENA` de esa cuenta; si no coincide, no la retires. El correo se escribe en la entrada estándar y se termina con Ctrl-D; no va en los argumentos:

   ```bash
   docker exec -i iwana_api_prod node dist/cli/clear-platform-login-throttle.js --ip=<ip-del-titular>
   ```

   Responde «Freno retirado.» o «La pareja no tenía freno ni intentos.». En el segundo caso el freno ya venció o el correo no es el de la cuenta.

6. Registra en el ticket quién lo pidió, quién lo ejecutó, la hora y la IP. La CLI no deja registro en la auditoría.

No toca el contador de ataque de la cuenta ni otras IP.

## Ataque

Señales: el log `PLATFORM_PASSWORD_ATTACK`, la auditoría `LOGIN_FAILED` con motivo `ATAQUE_CONTRASENA`, el correo de aviso o la auditoría `ACCOUNT_LOCKED` con motivo `FRENO_CONTRASENA` que el titular no reconoce.

```bash
docker logs --since 2h iwana_api_prod 2>&1 | grep -E 'PLATFORM_PASSWORD_ATTACK'
```

1. Escala a AI-SEC-ENG.
2. Si el titular no reconoce los intentos, trata la contraseña como expuesta: que la cambie desde una sesión abierta o sigue [RUNBOOK-RECUPERACION-MFA-PLATAFORMA](RUNBOOK-RECUPERACION-MFA-PLATAFORMA-v1.0.md) «Contraseña comprometida».
3. Si los intentos vienen de pocas IP, bloquéalas en la red. El freno no cubre un ataque repartido entre muchas IP por debajo de 50 por hora: ahí protegen el MFA y la red de la consola.

## Riesgo aceptado: aviso perdido

El aviso se reserva en Redis antes de enviar el correo. Si el correo falla, no se reintenta y no habrá otro aviso de esa cuenta hasta la hora siguiente. Quedan el log y la auditoría. Busca en el log de la API `Fallo en aviso de seguridad de plataforma` o `Fallo en aviso de ataque de contraseñas` si un administrador dice no haber recibido el aviso.

## Redis caído

Mientras Redis no responda, nadie ingresa a la consola (503) y las sesiones de la consola no se renuevan. Restablece Redis; no hay modo degradado ni variable que lo afloje. `RATE_LIMIT_E2E_RELAXED` no afecta a este freno.
