---
name: frontend-security-coder
description: Seguridad frontend para iWana neXt con Next.js App Router, RSC, sanitizacion de salida, navegacion segura y proteccion de datos en UI.
---

# Frontend Security Coder

## Proposito

Usa esta skill para implementar o revisar seguridad del frontend dentro del stack web real del repo.

El objetivo es reducir riesgos de XSS, fuga de datos, navegacion insegura y errores de integracion entre Server Components, Client Components y APIs internas.

## Cuando usarla

Activa esta skill para tareas como:

- Renderizado de contenido dinamico o generado por usuario.
- Formularios, tablas y vistas con datos sensibles.
- Navegacion o redireccion basada en datos externos.
- Integraciones de terceros en UI.
- Flujos autenticados en Next.js App Router.
- Reforzamiento de headers, CSP o politicas de embebido coordinadas con backend.

## Reglas obligatorias del repo

### 1. Sanitizar salida y prevenir XSS

Por defecto:

- renderiza texto como texto
- evita `dangerouslySetInnerHTML` salvo justificacion fuerte
- si debes renderizar HTML confiado por negocio, sanitizalo antes y documenta la razon
- no mezcles contenido confiable y no confiable sin una barrera explicita

### 2. No exponer PII ni secretos en UI

Nunca:

- imprimas secretos, tokens o cabeceras sensibles en consola
- serialices datos sensibles al cliente si no son estrictamente necesarios
- dejes mocks o fixtures con PII real
- pongas informacion sensible en props, data attributes o markup visible sin motivo funcional

### 3. Next.js App Router y Server Components primero

Siempre que sea viable:

- deja la obtencion de datos y la logica sensible del lado servidor
- mueve al cliente solo el estado interactivo necesario
- no conviertas componentes a `use client` por comodidad si eso expone de mas el flujo o la superficie de ataque

### 4. Validacion y navegacion seguras

- valida rutas o destinos derivados de input externo
- evita redirects abiertos
- no construyas URLs con fragmentos no validados
- si un formulario depende de reglas de negocio, no asumas que la validacion visual reemplaza la del backend

## Controles minimos por tema

### Renderizado de contenido

Prefiere:

- JSX normal para texto
- componentes que encapsulen la sanitizacion cuando exista HTML permitido
- listas allowlist para formatos enriquecidos soportados

Evita:

- `dangerouslySetInnerHTML` directo en vistas comunes
- parsear HTML arbitrario desde APIs sin sanitizacion
- confiar en regex simples como defensa XSS

### Formularios y datos visibles

- No reflejar errores internos del backend tal cual al usuario.
- Evitar mensajes que revelen detalles sensibles de cuentas, permisos o infraestructura.
- Aplicar enmascaramiento o truncamiento cuando haya datos personales o identificadores sensibles.
- Tratar archivos, previews y nombres subidos como input no confiable.

### Enlaces y redirecciones

- Permitir solo protocolos seguros esperados.
- Añadir `rel` apropiado en enlaces externos abiertos en nueva pestaña.
- Validar destinos antes de navegar programaticamente.
- Tratar query params y fragmentos como no confiables.

### Integraciones de terceros

- Minimizar scripts externos.
- Si se incorporan widgets, evaluar sandboxing, aislamiento y origen permitido.
- Evitar dependencias que requieran exponer secretos en cliente.
- Coordinar CSP y restricciones de origen con backend e infraestructura.

### Sesion y autenticacion en UI

- No persistir tokens de forma insegura por defecto.
- Mantener la UI sincronizada con el estado real de sesion, logout y expiracion.
- No codificar decisiones de autorizacion solo en frontend.
- Ocultar una accion en UI no reemplaza la autorizacion backend.

## Checklist de revision

- El contenido dinamico se renderiza de forma segura.
- No hay `dangerouslySetInnerHTML` sin sanitizacion y justificacion.
- No se exponen datos sensibles innecesarios al cliente.
- Las rutas y redirecciones derivadas de input estan validadas.
- Los enlaces externos usan atributos seguros.
- Los errores visibles no filtran detalles internos.
- Las integraciones de terceros estan acotadas y justificadas.
- La UI no asume autorizacion como responsabilidad exclusiva del cliente.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- `dangerouslySetInnerHTML` en componentes de uso comun.
- Logs de navegador con objetos completos de respuesta o sesion.
- Uso de query params para decidir destinos sin validacion.
- Componentes `use client` innecesarios con datos sensibles en props.
- Dependencias externas insertadas en layout o pagina sin control de origen.
- Mensajes de error que reflejan texto crudo del backend.

## Anti-patrones

Evita:

- Resolver seguridad frontend solo con CSP y asumir que eso cubre XSS.
- Mover logica sensible al cliente para simplificar la UI.
- Exponer estado autenticado detallado en cualquier componente por conveniencia.
- Dejar datos personales completos visibles cuando el caso de uso admite mascara o resumen.
- Tratar sanitizacion y accesibilidad como temas separados: ambos deben coexistir.

## Escalacion

Usa [ESCALACION AL CTO] si el cambio:

- requiere degradar controles de sanitizacion o aislamiento
- expone datos sensibles al cliente sin justificacion valida
- depende de terceros con riesgo alto no mitigado
- entra en conflicto con politicas de seguridad o cumplimiento del sistema
