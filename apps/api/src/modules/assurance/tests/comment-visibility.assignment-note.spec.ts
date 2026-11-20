import { UserRole } from '@iwana/shared';
import { redactAssignmentNotes } from '../services/comment-visibility';

const TECH_A = 'tech-a';
const TECH_B = 'tech-b';

describe('redactAssignmentNotes (asignación visible: nota interna, visible también para el nuevo responsable)', () => {
  const events = [
    {
      id: 'e1',
      eventType: 'ASSIGNED',
      payload: { previousAssignedUserId: null, assignedUserId: TECH_A, note: 'Para A' },
    },
    {
      id: 'e2',
      eventType: 'REASSIGNED',
      payload: { previousAssignedUserId: TECH_A, assignedUserId: TECH_B, note: 'Para B' },
    },
    { id: 'e3', eventType: 'STATUS_CHANGED', payload: { from: 'OPEN', to: 'IN_PROGRESS' } },
    { id: 'e4', eventType: 'COMMENT_ADDED', payload: null },
    { id: 'e5', eventType: 'PRIORITY_CHANGED', payload: { note: 'no es de asignación' } },
  ];
  const noteOf = (result: typeof events, id: string) =>
    result.find((event) => event.id === id)?.payload?.note;

  it.each([UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT])('%s ve todas las notas', (role) => {
    expect(redactAssignmentNotes(events, { role, sub: 'otro' })).toEqual(events);
  });

  it.each([UserRole.TECHNICIAN, UserRole.CONTRACTOR])(
    '%s responsable de un evento ve solo la nota de ese evento',
    (role) => {
      const asA = redactAssignmentNotes(events, { role, sub: TECH_A });
      expect(noteOf(asA, 'e1')).toBe('Para A');
      expect(noteOf(asA, 'e2')).toBeUndefined();

      const asB = redactAssignmentNotes(events, { role, sub: TECH_B });
      expect(noteOf(asB, 'e1')).toBeUndefined();
      expect(noteOf(asB, 'e2')).toBe('Para B');
    },
  );

  it.each([UserRole.TECHNICIAN, UserRole.CONTRACTOR, UserRole.AUDITOR])(
    '%s ajeno a las asignaciones no recibe ninguna nota y conserva el resto del evento',
    (role) => {
      const result = redactAssignmentNotes(events, { role, sub: 'ajeno' });
      expect(result[0]).toEqual({
        id: 'e1',
        eventType: 'ASSIGNED',
        payload: { previousAssignedUserId: null, assignedUserId: TECH_A },
      });
      expect(noteOf(result, 'e2')).toBeUndefined();
      expect(result[2]).toBe(events[2]);
      expect(result[3]).toBe(events[3]);
      expect(result[4]).toBe(events[4]);
      expect(events[0]?.payload).toHaveProperty('note');
    },
  );

  it('un auditor que coincide con el responsable del evento tampoco gana la nota por rol, solo por ser el responsable', () => {
    expect(
      noteOf(redactAssignmentNotes(events, { role: UserRole.AUDITOR, sub: TECH_A }), 'e1'),
    ).toBe('Para A');
  });

  it('sin identificador de usuario no se entrega ninguna nota', () => {
    const result = redactAssignmentNotes(events, { role: UserRole.TECHNICIAN, sub: '' });
    expect(noteOf(result, 'e1')).toBeUndefined();
  });
});
