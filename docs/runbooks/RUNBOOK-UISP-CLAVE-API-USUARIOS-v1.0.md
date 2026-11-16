# RUNBOOK — Conectar UISP para traer los usuarios del personal v1.0

**Fecha:** 2026-11-15 · **Spec:** [usuarios de UISP](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md) v1.1 · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.2 D15

## 1. Crear la clave de aplicación en UISP

1. En UISP, entra como administrador al **CRM** → **Sistema** → **Seguridad** → **Claves de aplicación** (en inglés: *System → Security → App keys*).
2. Crea una clave nueva con permiso de **solo lectura** (*Read*). Nunca de escritura.
3. Ponle un nombre que la identifique (por ejemplo «iWana — lectura de usuarios») y copia la clave. UISP solo la muestra una vez.

## 2. Obtener la huella del certificado (si UISP usa certificado autofirmado)

Desde un equipo de la red, con el navegador o con OpenSSL:

```bash
openssl s_client -connect <ip-o-dominio-de-uisp>:443 -servername <ip-o-dominio-de-uisp> </dev/null 2>/dev/null | openssl x509 -noout -fingerprint -sha256
```

Copia el valor después de `sha256 Fingerprint=` (los dos puntos se pueden dejar; iWana los limpia).

## 3. Registrar la conexión en iWana

1. **Configuración → Importaciones → Conexión con UISP.**
2. Escribe la dirección pública de UISP (`https://…`), pega la clave y, si aplica, marca «Confiar en este certificado» y pega la huella.
3. «Probar y guardar». iWana solo consulta (`GET`) y guarda la clave cifrada; no vuelve a mostrarla.

iWana rechaza direcciones de redes internas (loopback, rangos privados, link-local). UISP debe ser accesible por su dirección pública.

## 4. Traer y revisar usuarios

1. **Usuarios de UISP → Traer usuarios de UISP.** Espera «Lista actualizada».
2. En **Pendientes**, selecciona filas, elige el **rol** y usa **Crear**, **Enlazar** (solo si coincide el correo con un usuario de iWana) o **Descartar**.
   - Los activos en UISP se crean sin acceso; los inactivos quedan inactivos, sin acceso y fuera de Programación.
   - Las filas «Usuario de UISP n.º N (sin datos)» son personal que aparece en tus lotes pero que la API ya no devuelve: créalas con el nombre que conozcas o descártalas.
3. **Enviar invitación** a quien vaya a usar iWana: recibe «Te invitaron a iWana» con un enlace de 7 días para crear su contraseña.
4. En cada lote ya promovido, **Actualizar autores** para que tickets, comentarios y pagos queden a nombre de su usuario.

Las filas sin resolver se borran solas a los 30 días sin volver a traerse, y al retirar la conexión.

## 5. Desarrollo y pruebas

El E2E usa un UISP falso en `127.0.0.1`. Para que la API de desarrollo lo acepte, el entorno debe tener:

```
MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS=127.0.0.1
```

Esta variable está **prohibida en producción** (la API no arranca con ella).
