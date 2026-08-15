# MOD00 prioridad dinámica del hub de Configuración

**Versión:** 1.0
**Estado:** Aprobado para ejecución correctiva
**Fecha:** 2026-08-15
**Módulo:** MOD00 Configuración Control Plane
**Origen:** auditoría UI/UX de `/dashboard/settings`
**Spec base:** `docs/specs/2026-05-30-mod00-settings-hub-redesign-design.md`
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
**Informe vivo:** `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

## 1. Objetivo y alcance

El hub mostrará una única recomendación accionable solo cuando exista una condición real que el administrador pueda resolver. El hub raíz y sus tarjetas permanecen dentro del alcance; las subpantallas no se rediseñan.

La recomendación no se infiere desde el registry estático ni desde la presencia de una ruta. MOD00 expone un read-model agregado y el portal lo consume por un contrato tipado.

## 2. Contrato de lectura

`GET /api/v1/configuration/settings-priority`

- Guards: JWT, `UserRole.ADMIN` y `AccessPermissionKey.SETTINGS_READ`.
- No acepta tenant, schema, body ni query. El contexto viene de la sesión verificada.
- No devuelve copy, cantidades, PII ni mensajes internos.
- Los fallos parciales se representan como `evaluation: PARTIAL`; no se exponen excepciones.

```ts
interface SettingsPriorityResponse {
  state: 'ACTION_REQUIRED' | 'NONE' | 'UNKNOWN';
  item: null | {
    key:
      | 'MFA_POLICY_DISABLED'
      | 'MFA_ENROLLMENT_INCOMPLETE'
      | 'NO_ACTIVE_ORGANIZATION_SITE'
      | 'COMPANY_HOURS_NOT_CONFIGURED'
      | 'BRANDING_NOT_CUSTOMIZED';
    level: 'HIGH' | 'MEDIUM' | 'LOW';
    sectionKey: SettingsSectionKey;
    targetPath: string;
  };
  evaluation: 'COMPLETE' | 'PARTIAL';
  unknownSources: Array<'TENANT' | 'USERS' | 'ORGANIZATION'>;
}
```

## 3. Evaluación determinista

Las fuentes se consultan mediante puertos tipados de Tenant, Users y Organization. Configuration usa `Promise.allSettled`, no importa servicios, entidades ni tablas de otros módulos y no añade caché ni migraciones.

La primera regla accionable gana:

1. `mfaRequiredAll === false` → `MFA_POLICY_DISABLED`, nivel `HIGH`, destino `/dashboard/settings/access#politicas-de-autenticacion`.
2. Política activa, `activeUsers > 0` y `mfaEnabledActiveUsers < activeUsers` → `MFA_ENROLLMENT_INCOMPLETE`, `HIGH`, mismo destino.
3. `activeOrganizationSites === 0` → `NO_ACTIVE_ORGANIZATION_SITE`, `MEDIUM`, destino `/dashboard/settings/organization#sedes`.
4. Sin día abierto válido de horario empresarial → `COMPANY_HOURS_NOT_CONFIGURED`, `MEDIUM`, destino `/dashboard/settings/calendar#horario-base`.
5. Sin URL, asset o metadata de marca explícita → `BRANDING_NOT_CUSTOMIZED`, `LOW`, destino `/dashboard/settings/branding`.

Cero usuarios no dispara una recomendación de MFA. `[]` o siete días cerrados equivalen a horario no configurado. Los fallbacks de marca no cuentan como personalización.

- Sin regla y todas las fuentes conocidas: `NONE`, `COMPLETE`, `item: null`.
- Sin regla y una o más fuentes fallidas: `UNKNOWN`, `PARTIAL`, `item: null`.
- Con regla conocida y alguna fuente fallida: `ACTION_REQUIRED`, `PARTIAL`, conserva el item y lista `unknownSources`.

## 4. Copy canónico del portal

El portal traduce la clave a lenguaje de producto:

| Clave | Título | Descripción | CTA |
|---|---|---|---|
| `MFA_POLICY_DISABLED` | Activa la verificación en dos pasos | Protege el acceso de toda la empresa haciendo obligatoria la verificación en dos pasos. | Configurar verificación |
| `MFA_ENROLLMENT_INCOMPLETE` | Completa la verificación del equipo | Aún hay personas activas sin verificación en dos pasos. | Revisar autenticación |
| `NO_ACTIVE_ORGANIZATION_SITE` | Registra una sede activa | La empresa necesita al menos una sede activa para organizar su operación. | Revisar sedes |
| `COMPANY_HOURS_NOT_CONFIGURED` | Define el horario de la empresa | Configura al menos un día abierto para orientar jornadas y atención. | Configurar horario |
| `BRANDING_NOT_CUSTOMIZED` | Personaliza la marca de tu empresa | Añade los recursos visuales que identificarán a tu empresa en el portal. | Revisar marca |

La tarjeta del área de acceso se presenta como **Perfiles y autenticación** y su acción como **Revisar perfiles y autenticación**. La navegación global conserva **Usuarios y accesos**.

## 5. Reglas de renderizado y accesibilidad

- Renderizar “Recomendado ahora” solo con `ACTION_REQUIRED`, una sección disponible y un destino operable para la sesión.
- Ocultar la recomendación para `NONE`, `UNKNOWN`, errores del endpoint, `403` o permisos insuficientes; el resto del hub continúa usable.
- Usar `Button asChild size="lg"` para CTA y reintento, con foco visible y objetivo mínimo de 44 × 44 px.
- En modo oscuro, usar tokens de contraste aprobados (`iwana-primary-300` o equivalente semántico), nunca color literal.
- Usar `Badge`, `PortalEmptyState` y superficies existentes de `@iwana/ui`; no crear anatomías paralelas.
- Anunciar carga con `role="status"` y `aria-live="polite"`; mapear errores a copy controlado.

## 6. Criterios de aceptación

1. Ningún usuario sin acceso a una sección recibe un CTA prioritario hacia ella.
2. La recomendación aparece una sola vez y se oculta cuando no existe una acción real.
3. Las cinco reglas y los estados `NONE`, `UNKNOWN` y parcial tienen pruebas unitarias.
4. El contrato HTTP documenta `200`, `401`, `403`, enums y nullabilidad.
5. Axe no reporta contraste en 390×844, 1024×768 ni 1440×900.
6. El núcleo del hub alcanza al menos 80 % en líneas, ramas, funciones y statements.
7. La navegación E2E autenticada cubre cada destino prioritario y estados de permisos.
