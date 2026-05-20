# MOD09 WFM Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved MOD09 Fase 02 lightweight command center inside `/dashboard/scheduling` with prioritized KPIs, deterministic alerts, daily timeline by technician, technician load saturation, role gating, focused tests, and phase evidence.

**Architecture:** Keep all backend logic inside `WfmModule` by extending the existing `GET /api/v1/wfm/dashboard/summary` contract additively. Keep `GET /wfm/events` as the canonical timeline source and `GET /wfm/technicians/availability` as the optional availability source. In portal, split the operational surface into focused scheduling components and keep calendar/list synchronized through the existing `SchedulingFilters`.

**Tech Stack:** NestJS 11, TypeORM query builder, PostgreSQL tenant schema via `runInTenantSchema()`, Next.js App Router, React 19, TypeScript strict, Tailwind v4 CSS-first, Jest, Supertest, Playwright portal.

---

## Source documents

- Role: `docs/roles/Perfil_IA_Sr_Dev_Fullstack_v1.md`
- Prompt: `docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md`
- PRD base: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Addendum: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-ADDENDUM-COMMAND-CENTER-v1.1.md`
- HLD: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Spec: `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md`
- ADR: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- Sprint plan: `docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md`
- Live report: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`

## File map

### Backend

- Modify: `apps/api/src/modules/wfm/services/wfm-dashboard.service.ts`
  - Extend `WfmDashboardSummary`, `TechnicianLoadItem`.
  - Add `WfmDashboardAlert`, alert severity/type enums as string union types.
  - Calculate `activeCount`, `enRouteCount`, `atRiskCount`, `alerts[]`, `technicianLoad[].riskLevel`, `technicianLoad[].overdueCount`.
  - Keep `todayCount`, `overdueCount`, `upcomingCount`, `technicianLoad[].todayCount` compatible.
- Modify: `apps/api/src/modules/wfm/tests/wfm-dashboard.service.spec.ts`
  - Add focused unit tests for additive summary shape, deterministic alerts, saturation bands, and empty-data fallback.
- Modify: `apps/api/src/modules/wfm/tests/wfm.controller.http.spec.ts`
  - Add/adjust HTTP contract tests for summary role gating and additive fields.

### Portal frontend

- Modify: `apps/portal/src/lib/api-client.ts`
  - Extend `WfmDashboardSummary` and related dashboard interfaces.
- Modify: `apps/portal/src/components/scheduling/scheduling-ui.ts`
  - Add `command-center` to `SchedulingView`.
  - Add manager-only command center role helper.
  - Add alert/risk labels and variants.
  - Add pure helpers for daily filtering, timeline grouping, and technician load fallback.
- Create: `apps/portal/src/components/scheduling/SchedulingOverview.tsx`
  - Container for command center KPIs, alerts, timeline, and load strip.
- Create: `apps/portal/src/components/scheduling/SchedulingAlertRail.tsx`
  - Alert rail with CTA to open event detail or filter by technician.
- Create: `apps/portal/src/components/scheduling/SchedulingTimelineBoard.tsx`
  - Daily timeline grouped by technician, no drag-and-drop.
- Create: `apps/portal/src/components/scheduling/TechnicianLoadStrip.tsx`
  - Compact load/saturation strip.
- Modify: `apps/portal/src/components/scheduling/SchedulingToolbar.tsx`
  - Add command center tab only when allowed by role.
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
  - Default manager roles to command center.
  - Skip global summary/availability calls for `TECHNICIAN` and `CONTRACTOR`.
  - Render command center for `ADMIN`, `NOC`, `SUPPORT`; keep calendar/list for all WFM-visible roles.
- Modify/Create tests:
  - Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`
  - Create: `apps/portal/src/components/scheduling/SchedulingOverview.spec.tsx`

### E2E and docs

- Modify: `e2e/tests/portal-wfm-scheduling.spec.ts`
  - Add command-center visibility and restricted-role assertions using existing route.
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
  - Replace prepared-for-execution status with implemented evidence.
- Create or update: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`
  - Record commands, outcomes, and any blocked evidence.

---

## Task 1: Backend summary contract and dashboard service

**Files:**
- Modify: `apps/api/src/modules/wfm/services/wfm-dashboard.service.ts`
- Test: `apps/api/src/modules/wfm/tests/wfm-dashboard.service.spec.ts`

- [ ] **Step 1: Write failing tests for extended summary shape**

Add tests that expect the additive contract while preserving old fields:

```ts
it('should return additive command center metrics without removing legacy fields', async () => {
  mockRunInTenantSchema.mockImplementationOnce(async (_ds, _schema, fn) => {
    const responses = [
      { todayCount: '6' },
      { overdueCount: '2' },
      { upcomingCount: '9' },
      { activeCount: '4' },
      { enRouteCount: '1' },
      { atRiskCount: '2' },
    ];
    const mockQr = {
      manager: {
        createQueryBuilder: () => ({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockImplementation(() => Promise.resolve(responses.shift() ?? null)),
          getRawMany: jest.fn().mockResolvedValue([
            {
              assigned_user_id: 'tech-001',
              today_count: '4',
              overdue_count: '1',
              total_minutes: '390',
            },
          ]),
        }),
      },
    };
    return fn(mockQr as any);
  });

  const summary = await service.getSummary();

  expect(summary).toMatchObject({
    todayCount: 6,
    overdueCount: 2,
    upcomingCount: 9,
    activeCount: 4,
    enRouteCount: 1,
    atRiskCount: 2,
    technicianLoad: [
      {
        assignedUserId: 'tech-001',
        todayCount: 4,
        overdueCount: 1,
        totalScheduledMinutes: 390,
        utilizationPercent: 81,
        riskLevel: 'HIGH',
      },
    ],
  });
  expect(Array.isArray(summary.alerts)).toBe(true);
});
```

- [ ] **Step 2: Run backend dashboard tests to verify failure**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts
```

Expected: FAIL because `activeCount`, `enRouteCount`, `atRiskCount`, `alerts`, and saturation fields do not exist yet.

- [ ] **Step 3: Extend service interfaces and constants**

In `wfm-dashboard.service.ts`, replace the interface block with:

```ts
export type WfmTechnicianLoadRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type WfmDashboardAlertSeverity = 'critical' | 'warning' | 'info';
export type WfmDashboardAlertType =
  | 'OVERDUE_EVENT'
  | 'DRAFT_STARTING_SOON'
  | 'HIGH_TECHNICIAN_LOAD';

export interface TechnicianLoadItem {
  assignedUserId: string;
  todayCount: number;
  overdueCount: number;
  totalScheduledMinutes: number;
  utilizationPercent: number;
  riskLevel: WfmTechnicianLoadRiskLevel;
}

export interface WfmDashboardAlert {
  id: string;
  type: WfmDashboardAlertType;
  severity: WfmDashboardAlertSeverity;
  title: string;
  description: string;
  eventId: string | null;
  assignedUserId: string | null;
  scheduledStartAt: string | null;
}

export interface WfmDashboardSummary {
  todayCount: number;
  overdueCount: number;
  upcomingCount: number;
  activeCount: number;
  enRouteCount: number;
  atRiskCount: number;
  alerts: WfmDashboardAlert[];
  technicianLoad: TechnicianLoadItem[];
}
```

Add constants below `ACTIVE_STATUSES`:

```ts
const EXPECTED_DAILY_MINUTES = 480;
const STARTING_SOON_MINUTES = 60;
const ALERT_LIMIT = 12;

function toCount(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateRiskLevel(utilizationPercent: number): WfmTechnicianLoadRiskLevel {
  if (utilizationPercent >= 80) return 'HIGH';
  if (utilizationPercent >= 50) return 'MEDIUM';
  return 'LOW';
}
```

- [ ] **Step 4: Implement additive metric queries and technician load**

Inside `getSummary()`, keep the current tenant context and day-range setup. Replace the repeated raw count parsing with six count queries:

```ts
const activeResult = await qr.manager
  .createQueryBuilder()
  .select('COUNT(*)', 'activeCount')
  .from('schedule_events', 'se')
  .where('se.tenant_id = :tenantId', { tenantId })
  .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
  .andWhere('se.deleted_at IS NULL')
  .getRawOne();

const enRouteResult = await qr.manager
  .createQueryBuilder()
  .select('COUNT(*)', 'enRouteCount')
  .from('schedule_events', 'se')
  .where('se.tenant_id = :tenantId', { tenantId })
  .andWhere('se.status = :status', { status: ScheduleEventStatus.EN_ROUTE })
  .andWhere('se.deleted_at IS NULL')
  .getRawOne();
```

For technician load, query count, overdue count, and duration:

```ts
const technicianLoadRows: {
  assigned_user_id: string;
  today_count: string;
  overdue_count: string;
  total_minutes: string;
}[] = await qr.manager
  .createQueryBuilder()
  .select('se.assigned_user_id', 'assigned_user_id')
  .addSelect('COUNT(*)', 'today_count')
  .addSelect(
    "SUM(CASE WHEN se.scheduled_end_at < :now THEN 1 ELSE 0 END)",
    'overdue_count',
  )
  .addSelect(
    "COALESCE(SUM(EXTRACT(EPOCH FROM (se.scheduled_end_at - se.scheduled_start_at)) / 60), 0)",
    'total_minutes',
  )
  .from('schedule_events', 'se')
  .where('se.tenant_id = :tenantId', { tenantId })
  .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
  .andWhere('se.deleted_at IS NULL')
  .andWhere('se.scheduled_start_at >= :todayStart', { todayStart })
  .andWhere('se.scheduled_start_at <= :todayEnd', { todayEnd })
  .groupBy('se.assigned_user_id')
  .orderBy('today_count', 'DESC')
  .getRawMany();
```

Map rows with deterministic risk:

```ts
const technicianLoad = technicianLoadRows.map((row) => {
  const totalScheduledMinutes = toCount(row.total_minutes);
  const utilizationPercent = Math.min(
    100,
    Math.round((totalScheduledMinutes / EXPECTED_DAILY_MINUTES) * 100),
  );

  return {
    assignedUserId: row.assigned_user_id,
    todayCount: toCount(row.today_count),
    overdueCount: toCount(row.overdue_count),
    totalScheduledMinutes,
    utilizationPercent,
    riskLevel: calculateRiskLevel(utilizationPercent),
  };
});
```

- [ ] **Step 5: Implement deterministic alerts**

Add two event alert queries in `getSummary()`:

```ts
const startingSoonEnd = new Date(now);
startingSoonEnd.setMinutes(startingSoonEnd.getMinutes() + STARTING_SOON_MINUTES);

const overdueAlertRows: {
  id: string;
  title: string;
  assigned_user_id: string;
  scheduled_start_at: Date;
}[] = await qr.manager
  .createQueryBuilder()
  .select('se.id', 'id')
  .addSelect('se.title', 'title')
  .addSelect('se.assigned_user_id', 'assigned_user_id')
  .addSelect('se.scheduled_start_at', 'scheduled_start_at')
  .from('schedule_events', 'se')
  .where('se.tenant_id = :tenantId', { tenantId })
  .andWhere('se.status = ANY(:statuses)', { statuses: ACTIVE_STATUSES })
  .andWhere('se.deleted_at IS NULL')
  .andWhere('se.scheduled_end_at < :now', { now })
  .orderBy('se.scheduled_end_at', 'ASC')
  .limit(ALERT_LIMIT)
  .getRawMany();

const draftSoonAlertRows: {
  id: string;
  title: string;
  assigned_user_id: string;
  scheduled_start_at: Date;
}[] = await qr.manager
  .createQueryBuilder()
  .select('se.id', 'id')
  .addSelect('se.title', 'title')
  .addSelect('se.assigned_user_id', 'assigned_user_id')
  .addSelect('se.scheduled_start_at', 'scheduled_start_at')
  .from('schedule_events', 'se')
  .where('se.tenant_id = :tenantId', { tenantId })
  .andWhere('se.status = :status', { status: ScheduleEventStatus.DRAFT })
  .andWhere('se.deleted_at IS NULL')
  .andWhere('se.scheduled_start_at >= :now', { now })
  .andWhere('se.scheduled_start_at <= :startingSoonEnd', { startingSoonEnd })
  .orderBy('se.scheduled_start_at', 'ASC')
  .limit(ALERT_LIMIT)
  .getRawMany();
```

Build alerts:

```ts
const alerts: WfmDashboardAlert[] = [
  ...overdueAlertRows.map((row) => ({
    id: `overdue-${row.id}`,
    type: 'OVERDUE_EVENT' as const,
    severity: 'critical' as const,
    title: 'Evento atrasado',
    description: row.title,
    eventId: row.id,
    assignedUserId: row.assigned_user_id,
    scheduledStartAt: row.scheduled_start_at?.toISOString?.() ?? String(row.scheduled_start_at),
  })),
  ...draftSoonAlertRows.map((row) => ({
    id: `draft-soon-${row.id}`,
    type: 'DRAFT_STARTING_SOON' as const,
    severity: 'warning' as const,
    title: 'Borrador inicia pronto',
    description: row.title,
    eventId: row.id,
    assignedUserId: row.assigned_user_id,
    scheduledStartAt: row.scheduled_start_at?.toISOString?.() ?? String(row.scheduled_start_at),
  })),
  ...technicianLoad
    .filter((item) => item.riskLevel === 'HIGH')
    .map((item) => ({
      id: `high-load-${item.assignedUserId}`,
      type: 'HIGH_TECHNICIAN_LOAD' as const,
      severity: 'warning' as const,
      title: 'Técnico con saturación alta',
      description: `${item.todayCount} eventos activos en la jornada.`,
      eventId: null,
      assignedUserId: item.assignedUserId,
      scheduledStartAt: null,
    })),
].slice(0, ALERT_LIMIT);
```

Return:

```ts
return {
  todayCount: toCount(todayResult?.todayCount),
  overdueCount: toCount(overdueResult?.overdueCount),
  upcomingCount: toCount(upcomingResult?.upcomingCount),
  activeCount: toCount(activeResult?.activeCount),
  enRouteCount: toCount(enRouteResult?.enRouteCount),
  atRiskCount: toCount(atRiskResult?.atRiskCount),
  alerts,
  technicianLoad,
};
```

- [ ] **Step 6: Run backend dashboard tests**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts
```

Expected: PASS for dashboard tests.

---

## Task 2: Backend HTTP gating and additive response tests

**Files:**
- Modify: `apps/api/src/modules/wfm/tests/wfm.controller.http.spec.ts`

- [ ] **Step 1: Add HTTP tests for restricted roles and additive summary**

In `describe('GET /api/v1/wfm/dashboard/summary')`, add:

```ts
it('returns 403 when CONTRACTOR requests dashboard', async () => {
  await request(app.getHttpServer())
    .get('/api/v1/wfm/dashboard/summary')
    .set('Authorization', 'Bearer contractor-token')
    .expect(403);
});

it('returns command center additive fields for ADMIN', async () => {
  dashboardServiceMock.getSummary.mockResolvedValue({
    todayCount: 10,
    overdueCount: 2,
    upcomingCount: 15,
    activeCount: 8,
    enRouteCount: 3,
    atRiskCount: 4,
    alerts: [
      {
        id: 'overdue-evt-001',
        type: 'OVERDUE_EVENT',
        severity: 'critical',
        title: 'Evento atrasado',
        description: 'Instalación pendiente',
        eventId: 'evt-001',
        assignedUserId: 'tech-001',
        scheduledStartAt: '2026-05-09T08:00:00.000Z',
      },
    ],
    technicianLoad: [
      {
        assignedUserId: 'tech-001',
        todayCount: 5,
        overdueCount: 1,
        totalScheduledMinutes: 420,
        utilizationPercent: 88,
        riskLevel: 'HIGH',
      },
    ],
  });

  await request(app.getHttpServer())
    .get('/api/v1/wfm/dashboard/summary')
    .set('Authorization', 'Bearer admin-token')
    .expect(200)
    .expect(({ body }) => {
      expect(body).toHaveProperty('activeCount', 8);
      expect(body).toHaveProperty('enRouteCount', 3);
      expect(body).toHaveProperty('atRiskCount', 4);
      expect(body.alerts[0]).toHaveProperty('severity', 'critical');
      expect(body.technicianLoad[0]).toHaveProperty('riskLevel', 'HIGH');
    });
});
```

- [ ] **Step 2: Run WFM HTTP tests**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm.controller.http.spec.ts
```

Expected: PASS. If it fails, fix only WFM controller/test contract drift; do not broaden roles on the endpoint.

---

## Task 3: Portal WFM types and scheduling helpers

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/scheduling/scheduling-ui.ts`
- Test: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Extend portal API types**

In `api-client.ts`, replace dashboard interfaces with:

```ts
export type WfmTechnicianLoadRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type WfmDashboardAlertSeverity = 'critical' | 'warning' | 'info';
export type WfmDashboardAlertType =
  | 'OVERDUE_EVENT'
  | 'DRAFT_STARTING_SOON'
  | 'HIGH_TECHNICIAN_LOAD';

export interface WfmDashboardTechnicianLoad {
  assignedUserId: string;
  todayCount: number;
  overdueCount: number;
  totalScheduledMinutes: number;
  utilizationPercent: number;
  riskLevel: WfmTechnicianLoadRiskLevel;
}

export interface WfmDashboardAlert {
  id: string;
  type: WfmDashboardAlertType;
  severity: WfmDashboardAlertSeverity;
  title: string;
  description: string;
  eventId: string | null;
  assignedUserId: string | null;
  scheduledStartAt: string | null;
}

export interface WfmDashboardSummary {
  todayCount: number;
  overdueCount: number;
  upcomingCount: number;
  activeCount: number;
  enRouteCount: number;
  atRiskCount: number;
  alerts: WfmDashboardAlert[];
  technicianLoad: WfmDashboardTechnicianLoad[];
}
```

- [ ] **Step 2: Extend scheduling view and role helpers**

In `scheduling-ui.ts`, change:

```ts
export type SchedulingView = 'command-center' | 'calendar' | 'list';
```

Add:

```ts
const SCHEDULING_COMMAND_CENTER_ROLES = new Set<string>([
  UserRole.ADMIN,
  UserRole.NOC,
  UserRole.SUPPORT,
]);

export function canViewSchedulingCommandCenter(role: string | null | undefined): boolean {
  return Boolean(role && SCHEDULING_COMMAND_CENTER_ROLES.has(role));
}
```

Update `buildDefaultSchedulingFilters()` to accept an optional preferred view:

```ts
export function buildDefaultSchedulingFilters(
  view: SchedulingView = 'calendar',
): SchedulingFilters {
  const today = new Date();
  const start = startOfDay(today);
  const end = addDays(start, 6);

  return {
    fromDate: toLocalDayKey(start),
    toDate: toLocalDayKey(end),
    technicianId: '',
    type: '',
    status: '',
    view,
  };
}
```

- [ ] **Step 3: Add risk and alert UI helpers**

In `scheduling-ui.ts`, add:

```ts
export function getTechnicianLoadRiskLabel(riskLevel: WfmDashboardSummary['technicianLoad'][number]['riskLevel']): string {
  if (riskLevel === 'HIGH') return 'Alta';
  if (riskLevel === 'MEDIUM') return 'Media';
  return 'Baja';
}

export function getTechnicianLoadRiskVariant(
  riskLevel: WfmDashboardSummary['technicianLoad'][number]['riskLevel'],
): BadgeVariant {
  if (riskLevel === 'HIGH') return 'error';
  if (riskLevel === 'MEDIUM') return 'warning';
  return 'success';
}

export function getDashboardAlertVariant(
  severity: WfmDashboardSummary['alerts'][number]['severity'],
): BadgeVariant {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}
```

Add daily timeline helpers:

```ts
export interface SchedulingTimelineGroup {
  technicianId: string;
  technicianName: string;
  events: WfmScheduleEvent[];
}

export function getEventsForLocalDay(events: WfmScheduleEvent[], dayKey: string): WfmScheduleEvent[] {
  return events
    .filter((event) => toLocalDayKey(new Date(event.scheduledStartAt)) === dayKey)
    .sort(
      (left, right) =>
        new Date(left.scheduledStartAt).getTime() - new Date(right.scheduledStartAt).getTime(),
    );
}

export function buildTimelineGroups(
  events: WfmScheduleEvent[],
  techniciansById: Map<string, InternalUser>,
  dayKey: string,
): SchedulingTimelineGroup[] {
  const grouped = new Map<string, WfmScheduleEvent[]>();

  getEventsForLocalDay(events, dayKey).forEach((event) => {
    const bucket = grouped.get(event.assignedUserId) ?? [];
    bucket.push(event);
    grouped.set(event.assignedUserId, bucket);
  });

  return Array.from(grouped.entries())
    .map(([technicianId, technicianEvents]) => ({
      technicianId,
      technicianName: techniciansById.has(technicianId)
        ? getTechnicianDisplayName(techniciansById.get(technicianId)!)
        : 'Técnico no disponible',
      events: technicianEvents,
    }))
    .sort((left, right) => left.technicianName.localeCompare(right.technicianName, 'es'));
}
```

- [ ] **Step 4: Run portal typecheck to catch helper typing issues**

Run:

```bash
pnpm --filter @iwana/portal typecheck
```

Expected: PASS after helper/type updates.

---

## Task 4: Command center components

**Files:**
- Create: `apps/portal/src/components/scheduling/SchedulingAlertRail.tsx`
- Create: `apps/portal/src/components/scheduling/SchedulingTimelineBoard.tsx`
- Create: `apps/portal/src/components/scheduling/TechnicianLoadStrip.tsx`
- Create: `apps/portal/src/components/scheduling/SchedulingOverview.tsx`
- Create: `apps/portal/src/components/scheduling/SchedulingOverview.spec.tsx`

- [ ] **Step 1: Write failing component tests**

Create `SchedulingOverview.spec.tsx` with tests for KPIs, alert click, timeline grouping, and load filter CTA:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { ScheduleEventStatus, UserRole, WfmWorkType } from '@iwana/shared';
import { SchedulingOverview } from './SchedulingOverview';

const technician = {
  id: 'tech-1',
  email: 'tecnico@demo.co',
  role: UserRole.TECHNICIAN,
  firstName: 'Luisa',
  lastName: 'Campos',
} as any;

const event = {
  id: 'evt-1',
  title: 'Instalación GPON barrio norte',
  type: WfmWorkType.INSTALLATION,
  status: ScheduleEventStatus.DRAFT,
  scheduledStartAt: '2026-05-09T13:00:00.000Z',
  scheduledEndAt: '2026-05-09T15:00:00.000Z',
  assignedUserId: 'tech-1',
  municipality: 'Bogotá',
} as any;

const summary = {
  todayCount: 1,
  overdueCount: 1,
  upcomingCount: 3,
  activeCount: 2,
  enRouteCount: 1,
  atRiskCount: 1,
  alerts: [
    {
      id: 'overdue-evt-1',
      type: 'OVERDUE_EVENT',
      severity: 'critical',
      title: 'Evento atrasado',
      description: 'Instalación GPON barrio norte',
      eventId: 'evt-1',
      assignedUserId: 'tech-1',
      scheduledStartAt: '2026-05-09T13:00:00.000Z',
    },
  ],
  technicianLoad: [
    {
      assignedUserId: 'tech-1',
      todayCount: 1,
      overdueCount: 1,
      totalScheduledMinutes: 420,
      utilizationPercent: 88,
      riskLevel: 'HIGH',
    },
  ],
} as any;

describe('SchedulingOverview', () => {
  it('renders command center KPIs, alerts, timeline and load strip', () => {
    render(
      <SchedulingOverview
        summary={summary}
        events={[event]}
        techniciansById={new Map([['tech-1', technician]])}
        selectedDayKey="2026-05-09"
        onSelectEvent={jest.fn()}
        onFilterTechnician={jest.fn()}
      />,
    );

    expect(screen.getByText('Command center')).toBeInTheDocument();
    expect(screen.getByText('Activos')).toBeInTheDocument();
    expect(screen.getByText('Evento atrasado')).toBeInTheDocument();
    expect(screen.getByText('Luisa Campos')).toBeInTheDocument();
    expect(screen.getByText('Instalación GPON barrio norte')).toBeInTheDocument();
    expect(screen.getByText('Saturación alta')).toBeInTheDocument();
  });

  it('opens event detail from alert and timeline actions', () => {
    const onSelectEvent = jest.fn();

    render(
      <SchedulingOverview
        summary={summary}
        events={[event]}
        techniciansById={new Map([['tech-1', technician]])}
        selectedDayKey="2026-05-09"
        onSelectEvent={onSelectEvent}
        onFilterTechnician={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Abrir alerta Evento atrasado/i }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir evento Instalación GPON barrio norte/i }));

    expect(onSelectEvent).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run failing overview test**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingOverview.spec.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement `SchedulingAlertRail`**

Create a compact rail that renders empty state and buttons with stable accessible names:

```tsx
'use client';

import { AlertTriangle } from 'lucide-react';
import { Badge, Button } from '@iwana/ui';
import type { WfmDashboardAlert } from '@/lib/api-client';
import { PortalEmptyState, PortalPanel } from '@/components/shared/portal-ui';
import { formatWfmDateTime, getDashboardAlertVariant } from './scheduling-ui';

interface SchedulingAlertRailProps {
  alerts: WfmDashboardAlert[];
  onOpenEvent: (eventId: string) => void;
  onFilterTechnician: (technicianId: string) => void;
}

export function SchedulingAlertRail({
  alerts,
  onOpenEvent,
  onFilterTechnician,
}: SchedulingAlertRailProps) {
  return (
    <PortalPanel
      eyebrow="Alertas"
      title="Riesgo operativo"
      description="Señales determinísticas sobre agenda y carga, sin persistencia nueva."
    >
      {alerts.length === 0 ? (
        <PortalEmptyState
          title="Sin alertas activas"
          description="No hay atrasos, borradores inmediatos ni saturación alta en la ventana actual."
          icon={AlertTriangle}
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <article
              key={alert.id}
              className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{alert.title}</p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    {alert.description}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {alert.scheduledStartAt ? formatWfmDateTime(alert.scheduledStartAt) : 'Sin franja'}
                  </p>
                </div>
                <Badge variant={getDashboardAlertVariant(alert.severity)}>{alert.severity}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.eventId && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onOpenEvent(alert.eventId!)}
                    aria-label={`Abrir alerta ${alert.title}`}
                  >
                    Abrir detalle
                  </Button>
                )}
                {alert.assignedUserId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => onFilterTechnician(alert.assignedUserId!)}
                  >
                    Filtrar técnico
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </PortalPanel>
  );
}
```

- [ ] **Step 4: Implement timeline and load components**

Create `SchedulingTimelineBoard.tsx` using `buildTimelineGroups()` and `TechnicianLoadStrip.tsx` using `summary.technicianLoad`. Keep buttons clickable, not draggable. Use `aria-label={`Abrir evento ${event.title}`}` for timeline blocks.

- [ ] **Step 5: Implement `SchedulingOverview` container**

Create `SchedulingOverview.tsx` that composes:

```tsx
<div className="space-y-6">
  <PortalPanel eyebrow="Supervisión" title="Command center" description="KPIs priorizados para la operación diaria de WFM.">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      // Activos, atrasados, próximos 7 días, en ruta, en riesgo
    </div>
  </PortalPanel>
  <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
    <SchedulingTimelineBoard ... />
    <SchedulingAlertRail ... />
  </div>
  <TechnicianLoadStrip ... />
</div>
```

For missing summary, render `"Resumen no disponible"` and still show timeline from events.

- [ ] **Step 6: Run component tests**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingOverview.spec.tsx
```

Expected: PASS.

---

## Task 5: Integrate command center into SchedulingClient

**Files:**
- Modify: `apps/portal/src/components/scheduling/SchedulingToolbar.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.tsx`
- Modify: `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx`

- [ ] **Step 1: Add failing tests for manager and restricted-role behavior**

In `SchedulingClient.spec.tsx`, add:

```tsx
it('muestra command center por defecto para ADMIN y abre detalle desde una alerta', async () => {
  wfmApiMock.dashboard.getSummary.mockResolvedValue({
    todayCount: 1,
    overdueCount: 1,
    upcomingCount: 2,
    activeCount: 1,
    enRouteCount: 0,
    atRiskCount: 1,
    alerts: [
      {
        id: 'overdue-evt-1',
        type: 'OVERDUE_EVENT',
        severity: 'critical',
        title: 'Evento atrasado',
        description: 'Instalación GPON barrio norte',
        eventId: 'evt-1',
        assignedUserId: 'tech-1',
        scheduledStartAt: '2026-05-07T13:00:00.000Z',
      },
    ],
    technicianLoad: [
      {
        assignedUserId: 'tech-1',
        todayCount: 1,
        overdueCount: 1,
        totalScheduledMinutes: 420,
        utilizationPercent: 88,
        riskLevel: 'HIGH',
      },
    ],
  });
  wfmApiMock.events.list.mockResolvedValue([buildEvent()]);
  wfmApiMock.events.get.mockResolvedValue(buildEvent());

  render(<SchedulingClient />);

  expect(await screen.findByText('Command center')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Abrir alerta Evento atrasado/i }));

  await waitFor(() => {
    expect(wfmApiMock.events.get).toHaveBeenCalledWith('evt-1');
  });
});

it('no solicita summary global ni muestra command center para TECHNICIAN', async () => {
  useAuthMock.mockReturnValue({
    user: buildAuthUser(UserRole.TECHNICIAN),
    isLoading: false,
  });
  wfmApiMock.events.list.mockResolvedValue([buildEvent()]);

  render(<SchedulingClient />);

  await waitFor(() => {
    expect(wfmApiMock.events.list).toHaveBeenCalledTimes(1);
  });

  expect(wfmApiMock.dashboard.getSummary).not.toHaveBeenCalled();
  expect(wfmApiMock.technicians.listAvailability).not.toHaveBeenCalled();
  expect(screen.queryByText('Command center')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Update toolbar views**

Add props:

```ts
canViewCommandCenter: boolean;
```

Render a third button before calendar when allowed:

```tsx
{canViewCommandCenter && (
  <Button
    type="button"
    variant={filters.view === 'command-center' ? 'primary' : 'secondary'}
    onClick={() => setView('command-center')}
    aria-pressed={filters.view === 'command-center'}
  >
    Command center
  </Button>
)}
```

- [ ] **Step 3: Update SchedulingClient state and data loading**

Import `SchedulingOverview` and `canViewSchedulingCommandCenter`.

Initialize filters for role after auth resolves:

```ts
const canViewCommandCenter = canViewSchedulingCommandCenter(user?.role);

useEffect(() => {
  if (!authLoading && user) {
    setFilters((current) => {
      if (canViewCommandCenter && current.view === 'calendar') {
        return { ...current, view: 'command-center' };
      }
      if (!canViewCommandCenter && current.view === 'command-center') {
        return { ...current, view: 'calendar' };
      }
      return current;
    });
  }
}, [authLoading, canViewCommandCenter, user]);
```

In `loadData()`, only call summary and availability for manager roles:

```ts
const summaryPromise = canViewCommandCenter
  ? wfmApi.dashboard.getSummary()
  : Promise.resolve<WfmDashboardSummary | null>(null);
const availabilityPromise = canViewCommandCenter
  ? wfmApi.technicians.listAvailability(availabilityParams)
  : Promise.resolve<WfmTechnicianAvailability[]>([]);
```

Render:

```tsx
{filters.view === 'command-center' && canViewCommandCenter ? (
  <SchedulingOverview
    summary={summary}
    events={events}
    techniciansById={techniciansById}
    selectedDayKey={filters.fromDate}
    onSelectEvent={(event) => void loadEventDetails(event.id)}
    onFilterTechnician={(technicianId) => setFilters((current) => ({ ...current, technicianId }))}
  />
) : filters.view === 'calendar' ? (
  <ScheduleCalendar ... />
) : (
  <ScheduleList ... />
)}
```

- [ ] **Step 4: Run scheduling client tests**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx
```

Expected: PASS.

---

## Task 6: E2E command center coverage

**Files:**
- Modify: `e2e/tests/portal-wfm-scheduling.spec.ts`

- [ ] **Step 1: Add E2E assertions**

Add tests or extend existing admin/technician flows:

```ts
test('admin visualiza command center y conserva calendario/lista', async ({ page }) => {
  await page.goto('/dashboard/scheduling');
  await expect(page.getByText('Command center')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Calendario' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lista' })).toBeVisible();
});

test('tecnico no visualiza command center global', async ({ page }) => {
  await page.goto('/dashboard/scheduling');
  await expect(page.getByText('Command center')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Calendario' })).toBeVisible();
});
```

Keep existing auth fixtures and tenant setup from the current file; do not add real credentials or PII.

- [ ] **Step 2: Run portal E2E targeted**

Run:

```bash
pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts
```

Expected: PASS, or document the blocker in `docs/informes/INFORME-MOD09-FASE-02-v1.0.md` and `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`.

---

## Task 7: Documentation and verification

**Files:**
- Modify: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`
- Create/Modify: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`

- [ ] **Step 1: Run focused backend verification**

Run:

```bash
pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts
pnpm --filter @iwana/api typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused portal verification**

Run:

```bash
pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx
pnpm --filter @iwana/portal typecheck
```

Expected: PASS.

- [ ] **Step 3: Update live report**

In `INFORME-MOD09-FASE-02-v1.0.md`, update:

- `Estado` from `Borrador` to `Implementado` if all required checks pass; otherwise `Bloqueado parcialmente`.
- `Resumen ejecutivo` with the implemented command center.
- `Entregables previstos` into implemented backend/frontend/tests.
- `Evidencia de calidad` with exact commands and outcomes.
- `Decision de salida` as `Go` only if tests and E2E are green; otherwise document stop/go blocker.

- [ ] **Step 4: Create quality evidence**

Create `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md` with:

```md
# QUALITY - MOD09 Programacion / WFM Fase 02

**Version:** 1.0
**Fecha:** 2026-05-09
**Modulo:** MOD09 Programacion / WFM
**Fase:** Fase 02 - Command center liviano

## Evidencia ejecutada

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts` | Pendiente de reemplazar por resultado real |
| `pnpm --filter @iwana/api typecheck` | Pendiente de reemplazar por resultado real |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx` | Pendiente de reemplazar por resultado real |
| `pnpm --filter @iwana/portal typecheck` | Pendiente de reemplazar por resultado real |
| `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` | Pendiente de reemplazar por resultado real |

## Criterios cubiertos

- CA-WFM-13: Command center visible para ADMIN/NOC/SUPPORT.
- CA-WFM-14: Timeline diario agrupa eventos por tecnico y abre detalle.
- CA-WFM-15: Carga y saturacion por tecnico visibles.
- CA-WFM-16: Alertas deterministicas sin tabla nueva.
- CA-WFM-17: TECHNICIAN/CONTRACTOR sin KPIs globales.
- CA-WFM-18: Cobertura parcial documentada.
- CA-WFM-19: Calendario y lista conservan filtros.
- CA-WFM-20: Tests focalizados documentados.
```

Replace `Pendiente de reemplazar por resultado real` with actual outputs before completing implementation.

---

## Self-review notes

- Spec coverage: CA-WFM-13..20 are covered by Tasks 1-7.
- No new tables, endpoints, realtime, map, drag-and-drop, Kanban, IA, or dispatch algorithm are introduced.
- Role gating remains backend-first for summary and UI-visible for command center.
- Summary changes are additive and preserve `todayCount`, `overdueCount`, `upcomingCount`, and `technicianLoad[].todayCount`.
- Any need for availability-block conflict alerts beyond existing summary/event data is deferred unless current availability queries can support it without endpoint or schema changes.
