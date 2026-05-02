# Spec — Busqueda global Typesense tipo UISP

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-05-02  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH

## 1. Resumen

Se disena un buscador global para `apps/web` inspirado en UISP/Ubiquiti. La barra del header debe pasar de ser un filtro local por URL a una experiencia de busqueda transversal: mientras el usuario escribe, aparecen resultados agrupados por Empresas, Usuarios y Modulos/Navegacion, con ranking fuzzy y navegacion por teclado.

El motor seleccionado para el diseno es Typesense. PostgreSQL se mantiene como fuente de verdad; Typesense es un indice derivado para lectura rapida y ranking.

## 2. Objetivos

- Buscar desde cualquier pantalla de la consola administrativa.
- Mostrar resultados vivos mientras se escribe.
- Soportar fuzzy/typo tolerance y ranking por relevancia.
- Buscar usuarios cross-tenant para actores autorizados de plataforma.
- Evitar exponer API keys, secretos o PII sensible al navegador.
- Mantener UX compacta y operativa similar a UISP.

## 3. No objetivos v1

- No indexar auditoria, tickets, pagos, CRM ni suscriptores.
- No usar Typesense como fuente de verdad.
- No validar reglas de negocio contra el indice.
- No exponer API directa de Typesense al frontend.
- No indexar documentos, telefonos, direcciones ni informacion sensible adicional.

## 4. Experiencia de usuario

### 4.1 Header

El header mantiene un campo de busqueda visible en desktop. En mobile puede exponerse como boton/icono que abre el mismo overlay.

Comportamiento:

- Click/focus abre overlay.
- `Cmd/Ctrl + K` enfoca el buscador.
- Escribir 2+ caracteres dispara busqueda con debounce.
- `Escape` cierra overlay.
- Flechas verticales cambian resultado seleccionado.
- `Enter` navega al resultado seleccionado.

### 4.2 Overlay

Patron visual tipo UISP:

- Panel flotante debajo de la barra.
- Fondo de pagina atenuado opcional, sin bloquear lectura del contexto.
- Grupos con icono y label:
  - Empresas
  - Usuarios
  - Modulos
- Cada item incluye titulo, subtitulo, meta y highlight.
- Primer resultado seleccionado automaticamente.
- Pie contextual con ayuda de teclado.

### 4.3 Estados

| Estado | UI esperada |
|--------|-------------|
| Vacio | Recientes y accesos rapidos a Dashboard, Empresas, Usuarios, Auditoria, Configuracion. |
| Menos de 2 caracteres | Mensaje breve: `Escribe al menos 2 caracteres`. |
| Cargando | Skeleton compacto por grupo o spinner discreto. |
| Con resultados | Grupos ordenados por relevancia y tipo. |
| Sin resultados | Mensaje neutro y sugerencia de revisar texto. |
| Error | Error recuperable con opcion `Reintentar`. |

## 5. Ranking esperado

Orden recomendado:

1. Coincidencia exacta en titulo/email/slug.
2. Prefijo en titulo/email/slug.
3. Fuzzy con typo tolerance.
4. Boost por entidad activa.
5. Boost por navegacion/modulo frecuente.
6. Recencia (`updatedAt`) como desempate.

Pesos iniciales sugeridos:

| Dominio | Campos altos | Campos medios | Campos bajos |
|---------|--------------|----------------|--------------|
| Empresas | `name`, `slug` | `legalName`, `contactEmail` | `status` |
| Usuarios | `email`, `firstName`, `lastName` | `tenantName`, `tenantSlug` | `jobTitle`, `role` |
| Modulos | `title`, `keywords` | `description` | `route` |

## 6. Contrato de resultado frontend

```typescript
type GlobalSearchGroupType = 'tenants' | 'users' | 'modules';
type GlobalSearchItemType = 'tenant' | 'user' | 'module';

interface GlobalSearchResponse {
  query: string;
  groups: GlobalSearchGroup[];
  tookMs: number;
}

interface GlobalSearchGroup {
  type: GlobalSearchGroupType;
  label: string;
  total: number;
  items: GlobalSearchItem[];
}

interface GlobalSearchItem {
  id: string;
  type: GlobalSearchItemType;
  title: string;
  subtitle: string;
  meta?: string;
  route: string;
  highlights?: string[];
}
```

## 7. Datos y privacidad

### Permitido en v1

- Empresas: nombre, slug, razon social, estado y ruta.
- Usuarios: email, nombres, apellidos, cargo, rol, estado, empresa y ruta.
- Modulos: titulo, keywords, descripcion corta y ruta.

### Prohibido en v1

- Passwords, hashes, tokens o secretos.
- MFA secrets.
- Documento, telefono, direccion o datos sensibles adicionales.
- Query completa en logs por defecto.

## 8. Arquitectura de implementacion

### Backend

- `SearchModule` en `apps/api`.
- Cliente Typesense encapsulado.
- Endpoint protegido `GET /api/v1/search/global`.
- Indexador inicial y jobs BullMQ incrementales.
- OpenAPI documentado.

### Frontend

- `GlobalSearch` en `apps/web/src/components/search`.
- `globalSearchApi` en `apps/web/src/lib/api-client.ts`.
- Integracion en `TopHeader`.
- Tests de interaccion y accesibilidad basica.

### Infraestructura

- Servicio Typesense en Docker dev.
- Variables de entorno documentadas.
- Health check.
- Runbook futuro de rebuild y troubleshooting.

## 9. Aceptacion funcional

- Buscar `lili` muestra usuarios y empresas coincidentes si existen en el indice.
- Buscar un slug de empresa muestra la empresa como resultado top.
- Buscar `usuarios` muestra el modulo Usuarios.
- `Cmd/Ctrl + K` enfoca el buscador.
- Flechas y Enter permiten navegar sin mouse.
- `Escape` cierra overlay.
- La UI no queda bloqueada si Typesense falla; muestra error recuperable.
- El endpoint no responde resultados cross-tenant para actores sin permisos.

## 10. Aceptacion tecnica

- ADR-036 aprobado antes de implementar.
- Typesense no es accesible desde frontend directo.
- API key no aparece en bundle cliente.
- Tests validan que payload de usuario no incluya PII sensible prohibida.
- Rebuild de indices reproducible localmente.
- Jobs incrementales idempotentes.
- `pnpm --filter @iwana/api typecheck` y `pnpm --filter @iwana/web typecheck` en verde.

## 11. Preguntas cerradas

- Motor dedicado: Typesense.
- UX: overlay flotante tipo UISP.
- Alcance inicial: Empresas, Usuarios y Modulos/Navegacion.
- Usuarios: cross-tenant para actores autorizados.
- Ranking: fuzzy con relevancia.

## 12. Preguntas pendientes

- Politica final de telemetria: longitud/hash de query vs query completa. Recomendacion: no guardar query completa.
- Interfaz exacta de rebuild: comando CLI, endpoint admin o job manual.
- Conservacion de `q` en dashboard como filtro local o retiro gradual.
