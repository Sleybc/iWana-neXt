import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ConsentChannel, erasureCategorySchema } from '@iwana/shared';

const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const timestamp: SchemaObject = { type: 'string', format: 'date-time' };
const nullableUuid: SchemaObject = { type: 'string', format: 'uuid', nullable: true };
const nullableUri: SchemaObject = { type: 'string', format: 'uri', nullable: true };

function objectSchema(properties: Record<string, SchemaObject>, required: string[]): SchemaObject {
  return { type: 'object', properties, required, additionalProperties: false };
}

function dataEnvelopeSchema(data: SchemaObject): SchemaObject {
  return objectSchema({ data }, ['data']);
}

const dataPurpose = {
  type: 'string',
  enum: [
    'TRATAMIENTO_CONTRACTUAL',
    'CONTACTO_COMERCIAL',
    'REPORTE_CENTRALES_RIESGO',
    'DATOS_BIOMETRICOS',
  ],
} satisfies SchemaObject;

const purposeSetting = objectSchema({ purpose: dataPurpose, enabled: { type: 'boolean' } }, [
  'purpose',
  'enabled',
]);
export const purposeSettingsResponseSchema = dataEnvelopeSchema({
  type: 'array',
  items: purposeSetting,
});
export const updatePurposeSettingsRequestSchema = objectSchema(
  { items: { type: 'array', items: purposeSetting } },
  ['items'],
);

const legalTextType = {
  type: 'string',
  enum: ['POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD', 'AUTORIZACION'],
} satisfies SchemaObject;

export const createAuthorizationRequestSchema = objectSchema(
  {
    partyId: uuid,
    purpose: dataPurpose,
    granted: { type: 'boolean' },
    channel: { type: 'string', enum: Object.values(ConsentChannel) },
    legalTextId: uuid,
    evidenceMediaId: uuid,
  },
  ['partyId', 'purpose', 'granted', 'channel', 'legalTextId'],
);

const authorizationView = objectSchema(
  {
    id: uuid,
    partyId: uuid,
    purpose: dataPurpose,
    kind: { type: 'string', enum: ['GRANT', 'REVOCATION', 'LEGACY_IMPORT'] },
    granted: { type: 'boolean' },
    channel: { type: 'string' },
    legalTextId: nullableUuid,
    capturedAt: timestamp,
  },
  ['id', 'partyId', 'purpose', 'kind', 'granted', 'channel', 'legalTextId', 'capturedAt'],
);

export const createAuthorizationResponseSchema = dataEnvelopeSchema(
  objectSchema({ authorizationId: uuid }, ['authorizationId']),
);

export const authorizationListResponseSchema = dataEnvelopeSchema({
  type: 'array',
  items: authorizationView,
});

export const authorizationProofResponseSchema = dataEnvelopeSchema(
  objectSchema(
    {
      legalTextVersion: { type: 'string' },
      sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
      evidenceUrl: nullableUri,
    },
    ['legalTextVersion', 'sha256', 'evidenceUrl'],
  ),
);

export const createLegalTextRequestSchema = objectSchema(
  {
    type: legalTextType,
    version: { type: 'string', minLength: 1, maxLength: 32 },
    content: { type: 'string', minLength: 1, maxLength: 200_000 },
    format: { type: 'string', enum: ['PLAIN', 'MARKDOWN'], default: 'PLAIN' },
    url: nullableUri,
  },
  ['type', 'version', 'content'],
);

const legalText = objectSchema(
  {
    id: uuid,
    type: legalTextType,
    version: { type: 'string' },
    sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
    content: { type: 'string' },
    format: { type: 'string', enum: ['PLAIN', 'MARKDOWN'] },
    publishedAt: timestamp,
    url: nullableUri,
    isCurrent: { type: 'boolean' },
  },
  ['id', 'type', 'version', 'sha256', 'content', 'format', 'publishedAt', 'url', 'isCurrent'],
);

export const legalTextListResponseSchema = dataEnvelopeSchema({ type: 'array', items: legalText });
export const legalTextResponseSchema = dataEnvelopeSchema(legalText);
export const currentLegalTextResponseSchema = dataEnvelopeSchema(legalText);

const privacyMark = objectSchema(
  {
    id: uuid,
    partyId: uuid,
    mark: {
      type: 'string',
      enum: ['RECLAMO_EN_TRAMITE', 'VICTIMA_FALSEDAD_PERSONAL', 'DATOS_BLOQUEADOS'],
    },
    event: { type: 'string', enum: ['OPEN', 'CLOSE'] },
    requestId: nullableUuid,
    occurredAt: timestamp,
  },
  ['id', 'partyId', 'mark', 'event', 'requestId', 'occurredAt'],
);

export const privacyMarksResponseSchema = dataEnvelopeSchema({
  type: 'array',
  items: privacyMark,
});

const retentionPolicy = objectSchema(
  {
    category: { type: 'string', minLength: 1 },
    years: { type: 'integer', minimum: 1 },
    startEvent: { type: 'string', minLength: 1 },
    legalBasis: { type: 'string', minLength: 1 },
    isLegalMinimum: { type: 'boolean' },
  },
  ['category', 'years', 'startEvent', 'legalBasis', 'isLegalMinimum'],
);

export const retentionPoliciesResponseSchema = dataEnvelopeSchema({
  type: 'array',
  items: retentionPolicy,
});
export const retentionPolicyResponseSchema = dataEnvelopeSchema(retentionPolicy);
export const updateRetentionPolicyRequestSchema = objectSchema(
  {
    category: { type: 'string', minLength: 1 },
    years: { type: 'integer', minimum: 1 },
  },
  ['category', 'years'],
);

const privacyIncident = objectSchema(
  {
    id: uuid,
    detectedAt: timestamp,
    description: { type: 'string' },
    affectedCategories: { type: 'array', items: { type: 'string' } },
    sicReportDueAt: { type: 'string', format: 'date' },
    reportedAt: { type: 'string', format: 'date', nullable: true },
    externalReference: { type: 'string', maxLength: 100, nullable: true },
  },
  [
    'id',
    'detectedAt',
    'description',
    'affectedCategories',
    'sicReportDueAt',
    'reportedAt',
    'externalReference',
  ],
);

export const createPrivacyIncidentRequestSchema = objectSchema(
  {
    description: { type: 'string', minLength: 1, maxLength: 4_000 },
    affectedCategories: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
  ['description', 'affectedCategories'],
);

export const reportPrivacyIncidentRequestSchema = objectSchema(
  {
    reportedAt: { type: 'string', format: 'date' },
    externalReference: { type: 'string', minLength: 1, maxLength: 100 },
  },
  ['reportedAt', 'externalReference'],
);

export const privacyIncidentsResponseSchema = dataEnvelopeSchema({
  type: 'array',
  items: privacyIncident,
});
export const privacyIncidentResponseSchema = dataEnvelopeSchema(privacyIncident);

export const privacyEvidenceResponseSchema = dataEnvelopeSchema(
  objectSchema(
    {
      mediaId: uuid,
      mimeType: {
        type: 'string',
        enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      },
      sizeBytes: { type: 'integer', minimum: 1, maximum: 10 * 1024 * 1024 },
    },
    ['mediaId', 'mimeType', 'sizeBytes'],
  ),
);

export const requesterEvidenceResponseSchema = dataEnvelopeSchema(
  objectSchema(
    {
      url: { type: 'string', format: 'uri' },
      expiresAt: timestamp,
    },
    ['url', 'expiresAt'],
  ),
);

const erasureCategory = {
  type: 'string',
  enum: erasureCategorySchema.options,
} satisfies SchemaObject;

const erasureCounts = objectSchema(
  Object.fromEntries(
    erasureCategorySchema.options.map((category) => [
      category,
      { type: 'integer', minimum: 0 } satisfies SchemaObject,
    ]),
  ),
  [],
);

const erasureBlocker = {
  type: 'string',
  enum: [
    'IDENTITY_NOT_VERIFIED',
    'INVALID_STATUS',
    'CONSERVATION_DUTY',
    'UNRECONCILED_TITULAR',
    'ACTIVE_USER_ACCOUNT',
    'TOO_MANY_CANDIDATES',
  ],
} satisfies SchemaObject;

export const resolveErasureBodySchema = objectSchema(
  {
    confirm: { type: 'boolean', enum: [true] },
    expedienteIds: { type: 'array', maxItems: 500, items: uuid },
  },
  ['confirm', 'expedienteIds'],
);

export const resolveDataSubjectRequestSchema = objectSchema(
  {
    responseText: { type: 'string', minLength: 1, maxLength: 4000 },
    responseChannel: {
      type: 'string',
      enum: ['EMAIL', 'CORREO_FISICO', 'PRESENCIAL', 'PORTAL_ISP'],
    },
    dataChangeReference: { type: 'string', maxLength: 200 },
    erasure: resolveErasureBodySchema,
  },
  ['responseText', 'responseChannel'],
);

export const erasurePreviewResponseSchema = dataEnvelopeSchema(
  objectSchema(
    {
      eligible: { type: 'boolean' },
      blockers: { type: 'array', items: erasureBlocker },
      candidateExpedienteIds: { type: 'array', maxItems: 500, items: uuid },
      counts: erasureCounts,
      categories: { type: 'array', items: erasureCategory },
    },
    ['eligible', 'blockers', 'candidateExpedienteIds', 'counts', 'categories'],
  ),
);

const privacyInventoryDatabase = objectSchema(
  {
    key: {
      type: 'string',
      enum: ['CLIENTES', 'PROSPECTOS', 'PROVEEDORES', 'USUARIOS_SISTEMA'],
    },
    categories: { type: 'array', items: { type: 'string', minLength: 1 } },
    purposes: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'TRATAMIENTO_CONTRACTUAL',
          'CONTACTO_COMERCIAL',
          'REPORTE_CENTRALES_RIESGO',
          'DATOS_BIOMETRICOS',
        ],
      },
    },
    retention: {
      type: 'array',
      items: objectSchema(
        {
          category: { type: 'string', minLength: 1 },
          years: { type: 'integer', minimum: 0 },
        },
        ['category', 'years'],
      ),
    },
    hasSensitiveData: { type: 'boolean' },
    internationalTransfer: { type: 'string', enum: ['NO_DECLARADA'] },
    securityMeasures: { type: 'array', items: { type: 'string', minLength: 1 } },
  },
  [
    'key',
    'categories',
    'purposes',
    'retention',
    'hasSensitiveData',
    'internationalTransfer',
    'securityMeasures',
  ],
);

export const privacyInventoryResponseSchema = dataEnvelopeSchema(
  objectSchema(
    {
      generatedAt: timestamp,
      databases: { type: 'array', items: privacyInventoryDatabase },
    },
    ['generatedAt', 'databases'],
  ),
);
