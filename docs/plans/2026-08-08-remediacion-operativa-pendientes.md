# Remediación operativa pendiente — Plan de implementación

> **Para agentes ejecutores:** usar `subagent-driven-development`; cada tarea requiere revisión de especificación y de calidad separadas.

**Objetivo:** convertir los riesgos residuales de configuración local y contexto Docker en controles versionados y verificables, sin tocar secretos reales ni recursos externos.

**Arquitectura:** un script Node puro inspecciona el contexto de build antes de Docker; el generador de secretos sólo escribe la capa local que API/worker ya cargan y nunca sobrescribe valores. CI invoca el auditor antes de construir imágenes. La validación limpia se ejecuta en una copia temporal sin modificar `main`.

**Stack:** Node.js, pnpm, Docker Compose, GitHub Actions.

---

## Alcance congelado

- Entra: auditor del contexto Docker, gate CI, generador local seguro, validación limpia, informe actualizado.
- No entra: revocar cuentas, inspeccionar/purgar registros o cachés remotos, reescribir historia Git, modificar `.env*` locales, habilitar Redis auth, pgBouncer, segmentación de red, dominio/TLS ni aprobar ADRs.
- Contratos API y componente: sin cambios.

### Tarea 1 — Guard de contexto Docker

**Responsable:** AI-PLAT-OPS.  
**Archivos:** crear `scripts/audit-docker-context.mjs`, crear su prueba Node, modificar `package.json` y `.github/workflows/ci.yml`.

- [ ] Definir una lista explícita de rutas/patrones prohibidos: `.backups`, `apps/api/storage`, `login-request.json`, `.env` reales, HAR/trace y cachés locales.
- [ ] Hacer que el auditor falle si `.dockerignore` deja cualquiera fuera, sin leer contenidos sensibles ni construir una imagen.
- [ ] Probar caso base verde y una regla ausente roja mediante fixture temporal.
- [ ] Añadir script raíz y paso CI anterior a los cinco `docker build`.
- [ ] Ejecutar prueba y render de workflow/configuración aplicable.

### Tarea 2 — Generación local segura de secretos

**Responsable:** AI-SR-FULL, consultando AI-SEC-ENG.  
**Archivos:** `scripts/generate-secrets.sh`, `.env.example`, y prueba aislada del script si el runtime disponible lo permite.

- [ ] Usar permisos restrictivos antes de crear claves y confirmar que existe `secrets/.gitkeep` sin registrar PEM.
- [ ] Escribir sólo `.env.development.local`, capa que API/worker cargan, y nunca `.env.local`.
- [ ] No sobrescribir claves/variables existentes; generar valores independientes para MFA, PII y JWT compatibles con las variables que consume la aplicación.
- [ ] Actualizar la plantilla con la invocación y precedencia correctas, sin secretos reales.
- [ ] Probar en directorio temporal que no se imprimen valores, que no se toca un archivo existente y que no se escriben archivos versionados.

### Tarea 3 — Evidencia y decisiones externas

**Responsable:** AI-SR-QA + AI-SEC-ENG, sin cambios de infraestructura externa.  
**Archivos:** actualizar `docs/informes/INFORME-PLATAFORMA-REMEDIACION-RAIZ-v1.0.md`.

- [ ] Ejecutar `pnpm install --frozen-lockfile --ignore-scripts` en copia temporal limpia si las dependencias están disponibles; registrar éxito o bloqueo real.
- [ ] Registrar la ejecución completa o parcial de pruebas con conteos, sin logs/payloads.
- [ ] Mantener G6/G6.5/G7 separados.
- [ ] Conservar `[ESCALACION AL CTO]` para revocación, cachés/registro e historia; añadir decisiones pendientes de Redis, pgBouncer y redes como propuestas, no como aprobaciones.

## Stop/go

Detener ante cualquier necesidad de leer, imprimir o reemplazar un secreto real, de cambiar datos de Docker/PostgreSQL, o de actuar sobre un servicio remoto. Emitir `[ESCALACION AL CTO]` para esos casos.
