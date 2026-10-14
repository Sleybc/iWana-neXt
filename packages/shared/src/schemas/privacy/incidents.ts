import { z } from 'zod';

export const createPrivacyIncidentSchema = z
  .object({
    description: z.string().trim().min(1).max(4_000),
    affectedCategories: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  })
  .strict();

function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const reportPrivacyIncidentSchema = z
  .object({
    reportedAt: z.string().refine(isCivilDate, 'reportedAt debe ser una fecha civil válida.'),
    externalReference: z.string().trim().min(1).max(100),
  })
  .strict();

export const privacyIncidentSchema = z
  .object({
    id: z.string().uuid(),
    detectedAt: z.string().datetime({ offset: true }),
    description: z.string(),
    affectedCategories: z.array(z.string()),
    sicReportDueAt: z.string(),
    reportedAt: z.string().refine(isCivilDate).nullable(),
    externalReference: z.string().min(1).max(100).nullable(),
  })
  .strict()
  .refine(
    (incident) => (incident.reportedAt === null) === (incident.externalReference === null),
    'La fecha y la referencia del reporte deben estar informadas juntas.',
  );

export type CreatePrivacyIncident = z.infer<typeof createPrivacyIncidentSchema>;
export type ReportPrivacyIncident = z.infer<typeof reportPrivacyIncidentSchema>;
export type PrivacyIncident = z.infer<typeof privacyIncidentSchema>;
