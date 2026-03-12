# Security Rules (always active)

## Zero-Trust PII

- Nunca usar PII real en codigo, tests, logs ni documentacion.
- Nunca incluir secretos, tokens, API keys ni connection strings en archivos versionados.
- Credenciales van en variables de entorno o vaults — nunca en codigo.

## OWASP

- Validar entradas con Zod en todos los boundaries externos.
- Sanitizar outputs contra XSS.
- Prepared statements / ORM para prevenir SQL injection.
- Rate limiting en endpoints publicos y autenticacion.
- CORS restrictivo — solo origenes aprobados.

## Autenticacion y Autorizacion

- JWT con rotacion de tokens.
- Tenant resolution en cada request autenticada.
- RBAC/ABAC segun diseño del modulo.
- Audit trail en operaciones de escritura sensibles.

## Cifrado

- At-rest: cifrado de datos sensibles en PostgreSQL.
- In-transit: TLS obligatorio.

## Cumplimiento

- Ley 1581 (Habeas Data): consentimiento, derechos ARCO, retencion explicita.
- DIAN: facturacion electronica UBL 2.1, CUFE, trazabilidad fiscal.
- CRC: tiempos de respuesta, PQR, compensaciones.
- Bloquear cualquier propuesta que desactive validaciones de seguridad.

## Escalacion

- Excepciones de seguridad → siempre escalar al CTO.
- Vulnerabilidades criticas → corregir en el sprint actual, bloquean merge.
