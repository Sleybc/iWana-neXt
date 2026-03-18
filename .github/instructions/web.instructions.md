---
description: "Use when working on apps/web platform-admin screens, platform authentication, tenant administration UI, platform users, or protected routes for SYSTEM_ADMIN and IWANA_SUPPORT. Covers rules specific to the platform console."
applyTo: "apps/web/**"
---

# Web Platform Console Instructions

- `apps/web` es la consola de plataforma; no tratarla como superficie tenant-aware equivalente a `apps/portal`.
- La autenticacion principal de esta app usa contratos de plataforma como `POST /auth/platform/login` y perfiles de usuarios de plataforma.
- Mantener separacion entre usuarios de plataforma (`SYSTEM_ADMIN`, `IWANA_SUPPORT`) y usuarios del tenant.
- No introducir logica de tenant slug en pantallas de plataforma salvo que el flujo lo requiera explicitamente para administrar tenants desde la plataforma.
- Las rutas protegidas de `apps/web` deben conservar semantica de gobierno y operacion de plataforma: tenants, usuarios de plataforma, audit global y configuracion administrativa.
- Cuando una pantalla administre tenants desde plataforma, distinguir claramente entre acciones globales y vistas self-service del tenant para no mezclar boundaries.
- La UX y el copy deben hablar de plataforma, administracion y operacion interna; no reutilizar copy de suscriptor ni copy del portal empresarial.
- Los flujos de recovery o soporte en `apps/web` pueden ser controlados y no necesariamente self-service; no abrir autoservicio si el backend no lo soporta.
- Respetar el manejo de MFA y sesiones propio de plataforma en `AuthProvider` y `api-client`; no copiar sin revisar los patrones de `apps/portal`.
- Tras cambios en `apps/web`, actualizar el informe vivo relacionado en `docs/informes/`.