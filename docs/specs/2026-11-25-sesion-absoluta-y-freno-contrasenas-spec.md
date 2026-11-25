# Spec — Transversal · Vida absoluta de la sesión y freno de contraseñas en plataforma

**Versión:** 1.2 (GO de AI-SEC-ENG a la 1.1 para §3 y §4; esta añade sus precisiones y lo que exige §5)
**Estado:** Aprobada. G0 del CTO el 2026-11-25 sobre los seis puntos de §7, con la opción recomendada (2A, 4A).
**Fecha:** 2026-11-25
**Autor:** Claude Code
**Plazo:** antes de exponer la plataforma a internet
**Cambia:** RF-AUTH-05 de `PRD-MOD01-DEFINICION-v1.1` (refresh de 7 días) y de MOD02 (access de 15 min), [ADR-019](../adrs/ADR-019-JWT-RS256-Refresh-Rotation.md) y [ADR-081](../adrs/ADR-081-Modelo-de-Sesion-Cookie-HttpOnly.md); [límites de peticiones](2026-11-06-limites-de-peticiones-spec.md) §4

## 1. Problema

| #   | Hecho                                                                                                                       | Severidad (AI-SEC-ENG)                    |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| S1  | Cada renovación da otros 7 días y no hay máximo. Una cookie de refresh robada se mantiene viva si el titular no usa la suya | Media en LAN; alta en plataforma expuesta |
| S2  | `platform/login` admite 5 peticiones/min por IP, sin límite por cuenta y en memoria del proceso                             | Media en LAN; alta en internet            |

## 2. Alcance

**Dentro:** vida absoluta en ambas superficies, freno por cuenta e IP, aviso de ataque repartido, restricción de red de la consola.
**Fuera:** cierre por inactividad en plataforma, reautenticación en acciones sensibles, passkeys, equipo de confianza.

## 3. Vida absoluta (S1)

1. **Plataforma:** 12 h desde el ingreso. **Empresa:** 30 días desde el ingreso; se conservan 7 días sin uso.
2. Un único `sessionExpiresAt`, calculado en el servidor al ingresar y al renovar, es el menor entre 7 días e inicio + máximo. Acota `exp` del access (nunca más de su TTL), `expiresAt`, `EX` de Redis y `maxAge` de ambas cookies. Con menos de 1 s se trata como vencida. El servicio devuelve los plazos al controlador.
3. El índice y la marca de familia conservan un TTL que cubre el registro; el registro rotado, el necesario para detectar reuso.
4. **Superado el máximo:** se comprueba después del reuso y antes de `expiresAt`. Empresa: con la fila del usuario bloqueada, revoca la familia con `SESSION_MAX` y lanza el 401 tras el COMMIT. Plataforma: marca la familia revocada. El 401 por máximo, vencimiento o registro ausente borra las dos cookies de esa superficie y no toca las de la otra; perder la carrera de rotación no las borra. Las apps conservan su aviso de sesión vencida.
5. **Plataforma:** `startedAt` en Redis, copiado en cada rotación; ausente, inválido o futuro se rechaza. **Empresa:** `family_started_at timestamptz NULL` en `refresh_tokens`.
6. **Sesiones previas de empresa:** inicio = mínimo entre los `family_started_at` no nulos y los `created_at` de la familia, calculado en la transacción que rota y guardado en el sucesor. Es una cota: la purga pudo borrar ancestros. Si el código anterior convive o se revierte, sus filas NULL toman el inicio de sus hermanas.
7. Máximos por variable de entorno: mínimo 60 s y no menor que el access; tope de 12 h y 30 días en producción.

## 4. Freno de contraseñas (S2)

1. **Clave:** cuenta e IP. 10 erróneas en una ventana fija de 15 minutos → 15 minutos de rechazo para esa pareja. Quienes salen por la misma VPN o NAT comparten el freno.
2. **IP canónica:** IPv4 completa, incluida `::ffff:`; IPv6 por /64. La misma función sirve al límite por ruta. Sin IP válida se rechaza.
3. **Reserva:** un script Lua reserva el intento antes de buscar la cuenta y de bcrypt. Si hay freno o ya hay 10, rechaza; si no, incrementa y fija el vencimiento la primera vez. La décima errónea confirmada, no la décima reserva, activa el freno. Los rechazados no incrementan ni lo alargan. Un error ajeno a la contraseña libera su reserva.
4. **Éxito:** borra solo la generación que reservó, y solo si no hay freno activo, aunque falte el segundo factor.
5. **Sin oráculo:** inexistente, inactiva y suspendida hacen un `bcrypt.compare` de coste 12 (hash fijo o propio) y responden el mismo 401 sin `code`. El 403 de suspendida sale solo tras contraseña correcta.
6. **Redis:** operación con plazo de 2 s; si falla, 503 sin bcrypt ni consulta. No cambia el cliente global. Claves con HMAC de dominio propio (`login-throttle:v1:`), misma normalización de `hashEmail` y siempre con TTL.
7. **Aviso:** 50 erróneas por hora en una cuenta, sin contar las frenadas: evento `PLATFORM_PASSWORD_ATTACK`, auditoría y correo, una vez por hora con `SET NX EX`. No bloquea ni retrasa la respuesta. Correos inexistentes: solo el evento. Se audita el inicio del freno, no cada rechazo.
8. **Fuera:** cambio de contraseña e inscripción propia, que exigen sesión. `RATE_LIMIT_E2E_RELAXED` no afloja este freno.
9. **Riesgo residual:** ataque repartido entre muchas IP y por debajo de 50/h. Lo cubren MFA y §5. El titular frenado ve «Credenciales inválidas»; un runbook nuevo, `RUNBOOK-FRENO-CONTRASENAS-PLATAFORMA`, indica cómo limpiar la pareja.

## 5. Red de la consola

1. Vhost propio de la consola, con `allow`/`deny` en **todo** el vhost.
2. El host público del portal niega las superficies de plataforma sin distinguir mayúsculas, también lo que cae en `/`: `/auth/platform/*`, `/platform-users/*` (incluidos el alta inicial y su estado), `/platform/*` y `/tenants/*`, salvo las rutas que el portal necesita, listadas una a una al abrir la ola 3.
3. La API acepta ingreso, renovación, tokens y cookies de plataforma solo desde el vhost de la consola, marcado con una cabecera que nginx sobrescribe en todos los vhosts; niega también el alta inicial fuera de él. En producción, cabecera ausente o distinta se rechaza; fuera no se exige. Antes se inventarían los contenedores y scripts que usan plataforma.
4. En producción se cierra el rewrite de Next hacia la API.
5. `PROXY_BIND_IP` explícita, IPv6 cerrado o atendido de extremo a extremo, y `$remote_addr` distinto de la pasarela de Docker. Con CDN o balanceador: `set_real_ip_from` y revisar `trust proxy`.
6. `scripts/lan/render-nginx-ip-ports.sh` sigue funcionando. No sustituye §4.

**Origen por vhost (revisión de 7265a9bd).** nginx escribe `X-Iwana-Origin` con el origen del vhost. En producción y staging la API responde 403, antes de CORS y de las rutas, a todo `Origin` que no sea ese o no esté en `CORS_ORIGIN`. Sin `Origin` no actúa.

## 6. Criterios de aceptación

| #     | Criterio                                                                                                                                                                                                                       | Prueba                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| CA-1  | Rotaciones sucesivas no superan el máximo; el access no vence después                                                                                                                                                          | PostgreSQL, Redis y unitaria |
| CA-2  | Superado el máximo: 401, familia revocada al releer la base (en Redis, revocada o ausente), cookies de esa superficie borradas y las de la otra intactas                                                                       | PostgreSQL, Redis y HTTP     |
| CA-3  | Dos renovaciones simultáneas no reinician el inicio; la perdedora no borra cookies                                                                                                                                             | PostgreSQL y Redis           |
| CA-4  | Sesiones previas, familia purgada y filas del código anterior: §3.6                                                                                                                                                            | PostgreSQL y Redis           |
| CA-5  | La décima errónea frena esa pareja; otra IP entra con la contraseña correcta                                                                                                                                                   | HTTP y Redis                 |
| CA-6  | En freno no hay bcrypt; fuera de él hay exactamente uno por estado de cuenta, con la misma respuesta                                                                                                                           | Unitaria y HTTP              |
| CA-7  | Veinte en paralelo, con una correcta entre ellas, no superan diez comprobaciones; un éxito en vuelo no borra un freno posterior                                                                                                | Redis real                   |
| CA-8  | Redis detenido: 503 en menos de 3 s                                                                                                                                                                                            | Redis real                   |
| CA-9  | El umbral de 50 avisa una vez por hora y no bloquea                                                                                                                                                                            | Unitaria y Redis             |
| CA-10 | `up` y `down` de la migración tenant                                                                                                                                                                                           | Integración                  |
| CA-11 | Desde una IP no autorizada y en cada vhost: login, refresh con y sin audiencia, Bearer, mayúsculas, `//`, `%2e`, barra final, `X-Forwarded-For` falso, IPv6, Host desconocido, IP directa, alta inicial y cabecera falsificada | Entorno real                 |
| CA-12 | E2E operativo en verde                                                                                                                                                                                                         | CI                           |

## 7. Puntos del G0 del CTO (aprobados el 2026-11-25)

1. Plataforma 12 h y empresa 30 días absolutos. **Recomendado.**
2. Sesiones previas. **A:** plataforma reingresa una vez; empresa puede durar hasta 30 días más desde el despliegue. **B:** la migración revoca también las de empresa. **Recomendado: A.**
3. Freno de §4 con 10/15 min y aviso a las 50/h. **Recomendado.**
4. Red de la consola. **A:** VPN, aceptando el freno compartido si no da IP por usuario. **B:** lista de IP autorizadas. **Recomendado: A.**
5. Vhost propio de la consola antes de exponer. **Recomendado.**
6. Enmiendas a RF-AUTH-05 (ambos PRD), ADR-019 y ADR-081, que cubran también §4 y §5. Bloquean el cierre, no el inicio. **Recomendado.**

§3 y §4 pueden aprobarse sin §5. La exposición a internet sigue bloqueada hasta que CA-11 pase en el entorno real.

## 8. Olas

| Ola | Contenido                                                                                                                            | Depende de                 | Para cerrarla                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------- |
| 1   | Sesión (§3)                                                                                                                          | Aviso por correo publicado | CA-1 a CA-4 y CA-10                         |
| 2   | Freno (§4)                                                                                                                           | 1                          | CA-5 a CA-9                                 |
| 3   | Red (§5): API, apps e infraestructura en el mismo tren. nginx envía la cabecera antes de que la API la exija; la reversión, al revés | 2 publicada                | Pruebas HTTP, nginx y CA-11 en ensayo; G6.5 |
| 4   | Enmiendas, runbooks y CA-12                                                                                                          | 3 con G6.5                 | G6 y G6.5                                   |

Exponer a internet exige además CA-11 en el entorno real y la decisión de producción del CTO.
