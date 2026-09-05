import { formatFullName } from '@iwana/shared';
import { entityLabel } from './entityLabel';

interface AuditDisplayEntry {
  entityType: string;
  entityId: string | null;
  userId: string | null;
  actor?: {
    id: string | null;
    type: 'tenant' | 'platform' | 'system' | 'unknown';
    displayName: string;
    role?: string;
    status?: string;
    isDeleted?: boolean;
  } | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  requestId: string | null;
  id: string;
}

export interface DisplayText {
  title: string;
  subtitle?: string;
}

const SUBJECT_FIELDS = [
  'displayName',
  'fullName',
  'name',
  'legalName',
  'businessName',
  'companyName',
  'email',
  'firstName',
  'slug',
  'nit',
];

function valueAsString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function shortId(value: string | null | undefined, length = 8): string | null {
  if (!value) return null;
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

function pickSubjectFromPayload(payload: Record<string, unknown> | null): DisplayText | null {
  if (!payload) return null;

  const firstName = valueAsString(payload.firstName);
  const lastName = valueAsString(payload.lastName);
  const fullNameFromParts = formatFullName(firstName, lastName);
  const email = valueAsString(payload.email);

  if (fullNameFromParts) {
    return {
      title: fullNameFromParts,
      ...(email ? { subtitle: email } : {}),
    };
  }

  for (const field of SUBJECT_FIELDS) {
    const value = valueAsString(payload[field]);
    if (value) {
      return {
        title: value,
        ...(field !== 'email' && email ? { subtitle: email } : {}),
      };
    }
  }

  return null;
}

export function describeAuditSubject(entry: AuditDisplayEntry): DisplayText {
  const subject = pickSubjectFromPayload(entry.newValue) ?? pickSubjectFromPayload(entry.oldValue);
  const entity = entityLabel(entry.entityType);

  if (subject) {
    return {
      title: subject.title,
      subtitle: subject.subtitle ?? `Registro: ${entity}`,
    };
  }

  const id = shortId(entry.entityId, 10);
  return {
    title: id ? `${entity} ${id}` : entity,
    subtitle: entry.entityId ? 'ID técnico disponible' : 'Sin ID asociado',
  };
}

export function describeAuditActor(entry: AuditDisplayEntry): DisplayText {
  if (!entry.userId) {
    return { title: 'Sistema', subtitle: 'Evento automático' };
  }

  if (entry.actor?.displayName) {
    const subtitleParts = [
      entry.actor.role,
      entry.actor.isDeleted ? 'Eliminado' : entry.actor.status,
    ].filter(Boolean);
    return {
      title: entry.actor.displayName,
      subtitle: subtitleParts.join(' · ') || `ID ${shortId(entry.userId, 10) ?? entry.userId}`,
    };
  }

  return {
    title: 'Actor interno',
    subtitle: `ID ${shortId(entry.userId, 10) ?? entry.userId}`,
  };
}

export function describeIp(ipAddress: string | null): DisplayText {
  if (!ipAddress) return { title: 'Sin IP', subtitle: 'No registrada' };

  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ipAddress)) {
    return { title: 'Localhost', subtitle: ipAddress };
  }

  return { title: ipAddress };
}

export function describeTrace(entry: AuditDisplayEntry): DisplayText {
  if (entry.requestId) {
    return {
      title: `Solicitud ${shortId(entry.requestId, 8) ?? entry.requestId}`,
      subtitle: 'Correlación HTTP',
    };
  }

  return {
    title: `Log ${shortId(entry.id, 8) ?? entry.id}`,
    subtitle: 'Sin ID de solicitud',
  };
}
