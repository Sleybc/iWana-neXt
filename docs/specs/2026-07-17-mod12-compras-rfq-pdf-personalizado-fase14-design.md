# SPEC: PDF de RFQ personalizado por proveedor — MOD12 Compras (Fase 14)

**Versión:** 1.0
**Estado:** Aprobado por CTO (2026-07-17) — G3 GO — implementado
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Submódulo Compras (purchasing)
**Superficie:** Portal tenant → `/dashboard/inventory?tab=purchasing` → "Trabajar solicitud" → pestaña "Cotizar" → zona "Invitar proveedores"
**Modo activo:** Architect + Product Architect (combinado)
**Generado por:** AI-EM-ARCH (skill `brainstorming`)
**Aprobado por:** CTO (2026-07-17)
**Clasificación:** Uso interno

---

## 1. Trazabilidad

| Artefacto | Relación |
| --- | --- |
| [ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones](../adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md) | Nivel 2 (PDF descargable, envío manual) — este trabajo sigue dentro de ese alcance, no lo modifica ni requiere ADR nuevo |
| [2026-07-17-mod12-compras-cotizar-fase10-design.md](./2026-07-17-mod12-compras-cotizar-fase10-design.md) | Fase 10 — restauró `DRAFT` y fusionó pestañas; este trabajo vive en la misma zona "Invitar proveedores" |
| `apps/api/src/modules/inventory/services/rfq-pdf.service.ts` | Servicio existente a extender, no reemplazar |

**Numeración:** las Fases 11 (múltiples rondas de RFQ), 12 (envío real al proveedor) y 13 (comparación por ítem) ya están reservadas en el backlog de Cotizar (ver Fase 10 §5). Este trabajo es independiente de esas tres — no las bloquea ni depende de ellas — y toma el siguiente número libre del submódulo: **Fase 14**.

## 2. Contexto

Hoy, `RfqPdfService.render()` genera **un solo PDF genérico por ronda de RFQ**, que lista a todos los proveedores invitados juntos en una sección "Proveedores invitados" ([rfq-pdf.service.ts:73-82](../../apps/api/src/modules/inventory/services/rfq-pdf.service.ts)). El botón "Descargar PDF" en `RfqInvitationsPanel.tsx` no permite elegir un proveedor destinatario. El comprador que quiere enviar una cotización personalizada a cada proveedor debe reenviar manualmente el mismo documento genérico, uno por uno — no hay forma de generar un documento dirigido a un solo proveedor.

## 3. Decisión (definida con el usuario)

1. **Origen de la selección:** los proveedores seleccionables para el PDF personalizado son los que **ya están invitados** a la ronda de RFQ (`PurchaseRfqInvitation` existente) — se añaden checkboxes sobre la lista de invitaciones que ya se renderiza en `RfqInvitationsPanel.tsx`. No se agrega un selector independiente de proveedores no invitados.
2. **Entrega múltiple:** al seleccionar varios proveedores, se descargan **uno por uno** (una descarga de navegador por proveedor seleccionado, secuencial) — no se empaqueta en `.zip`.
3. **Contenido personalizado:** el PDF individual difiere del genérico en tres puntos:
   - Solo aparece **ese** proveedor en la sección de destinatarios (no la lista completa de invitados).
   - Se agrega un **encabezado dirigido**, ej. "Cotización dirigida a: {nombre del proveedor}".
   - Se agregan **datos de contacto de iWana** (el tenant, no el usuario individual) para que el proveedor sepa a quién responder — ver §5 para el detalle de dependencia.
4. **Se mantiene** el botón "Descargar PDF" genérico existente (todos los invitados juntos) sin cambios, para uso de archivo/registro interno — esta es una capacidad adicional, no un reemplazo.
5. **No se automatiza el envío** — el PDF personalizado se sigue descargando y enviando manualmente por el comprador, igual que hoy. Automatizar el envío sigue siendo Fase 12, explícitamente fuera de esta fase.

## 4. Diseño funcional

### 4.1 Backend

- Nuevo endpoint `GET /purchasing/rfqs/:rfqId/invitations/:invitationId/pdf` (mismo guard/roles que el endpoint genérico existente `GET /rfqs/:rfqId/pdf`), en vez de convertir el endpoint genérico en un query param opcional — mantiene el caso "todos juntos" completamente intacto y separa semánticamente ambos casos de uso, siguiendo el mismo patrón de anidamiento que ya usa `POST /rfqs/:rfqId/invitations/:invId/decline`.
- `RfqPdfService`: nuevo método (ej. `renderForInvitation(rfqId, invitationId)`) que reutiliza la construcción del documento existente pero:
  - Valida que la invitación pertenezca a la RFQ solicitada (404/400 si no).
  - Filtra la sección de destinatarios a un solo proveedor.
  - Agrega la línea de encabezado dirigido.
  - Agrega una sección de contacto con los datos del tenant (ver §5).
  - Nombre de archivo distinto por proveedor para evitar colisiones al descargar varios seguidos (ej. `${rfq.rfqNumber}-${slug(nombreProveedor)}.pdf`).
- El endpoint y método genéricos (`render()`, `renderOrThrow()`, `GET /rfqs/:rfqId/pdf`) **no se modifican** — se reutiliza la lógica de construcción del documento (líneas, cabecera de RFQ) como función compartida, no se duplica.

### 4.2 Frontend

- `RfqInvitationsPanel.tsx`: cada fila de invitación gana un checkbox de selección (estado local, ej. `Set<invitationId>`).
- Nuevo botón "Descargar PDF (seleccionados)", habilitado solo si hay al menos una invitación marcada; deshabilitado mientras haya una descarga en curso.
- Al hacer clic, se itera sobre las invitaciones seleccionadas y se dispara una descarga por cada una (mismo patrón de `handleDownloadPdf`: blob → anchor → click → revoke), de forma secuencial para evitar que el navegador bloquee descargas múltiples simultáneas como pop-ups.
- El botón "Descargar PDF" genérico existente no cambia de comportamiento ni de posición.
- `api-client.ts`: nueva función `downloadRfqInvitationPdf(rfqId, invitationId)`, mismo patrón que `downloadRfqPdf`.

## 5. Dependencia a resolver (factibilidad)

**Datos de contacto de iWana en el PDF:** ningún módulo fuera de `tenant`/`users` lee `Tenant.contactEmail` hoy (verificado por grep en `apps/api/src/modules`) — no hay precedente de acceso directo desde `inventory`. Por boundary del Modulith (`AGENTS.md`: "no acceso directo a tablas de otro módulo; comunicación solo por interfaces tipadas"), esto requiere un **port tipado nuevo y pequeño** (mismo patrón que `SupplierPartyPort` para `parties`), ej. `TenantContactPort` con un único método `getContactInfo(tenantId): { contactEmail, phone, legalName }`, implementado por un adapter sobre `TenantService`/`Tenant` entity. Es una adición acotada (mismo patrón ya aprobado en el módulo), no un cambio de arquitectura — no requiere ADR. Se deja como parte del alcance de esta fase, sujeto a confirmación de AI-SR-FULL en G3.

## 6. Fuera de alcance de esta fase

| Ítem | Motivo |
| --- | --- |
| Selección de proveedores no invitados | Decisión del usuario — el PDF depende de datos de la RFQ, se limita a invitados |
| Empaquetado en `.zip` | Decisión del usuario — descargas individuales secuenciales |
| Envío automático (email/WhatsApp) | Fase 12, sigue fuera de alcance — esto sigue siendo descarga + envío manual |
| Múltiples rondas de RFQ | Fase 11, no relacionado |
| Comparación de ofertas por ítem | Fase 13, no relacionado |

## 7. Impacto declarado

- **Multi-tenant:** sin impacto — el nuevo port respeta `TenantContext.getOrThrow()`; la lectura de `Tenant` se hace por `tenantId` verificado, nunca desde input.
- **Seguridad:** sin impacto — mismos guards/roles que el endpoint PDF existente; sin PII de proveedor nueva (el contacto agregado es del tenant, dato ya expuesto en otras superficies del portal).
- **Escala:** sin impacto — una consulta adicional por invitación al tenant (liviana, por PK).
- **Boundaries:** un port nuevo, pequeño, siguiendo un patrón ya existente — no es un cambio de arquitectura.
- **Regulación:** sin impacto.

## 8. Autorrevisión (skill `brainstorming`)

- **Placeholders:** ninguno pendiente.
- **Consistencia interna:** §5 declara la única dependencia no trivial; el resto del diseño no depende de ella (si se decidiera diferir el contacto de iWana, el resto de la fase — selección + PDF individual + encabezado dirigido — sigue siendo válido sin cambios).
- **Alcance:** acotado a un endpoint nuevo + un port nuevo + una extensión de UI ya existente; no requiere descomposición adicional.
- **Ambigüedad:** ninguna — las tres decisiones de diseño (origen de selección, entrega individual, contenido personalizado) fueron confirmadas explícitamente por el usuario.
