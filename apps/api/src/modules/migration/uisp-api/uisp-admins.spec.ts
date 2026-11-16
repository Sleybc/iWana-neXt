import { UispAdminsResponseError, parseUispAdmins } from './uisp-admins';

describe('parseUispAdmins', () => {
  it('mapea activo, inactivo, sin nombre y sin correo', () => {
    const result = parseUispAdmins([
      {
        id: 11,
        unmsId: 'x',
        email: ' Persona.Uno@Example.TEST ',
        username: 'puno',
        firstName: 'Persona',
        lastName: 'Uno',
        avatarColor: '#fff',
        isActive: true,
      },
      { id: 12, email: null, username: 'pdos', firstName: null, lastName: null, isActive: false },
      { id: 13, email: 'no-es-correo', username: null, firstName: '', isActive: true },
    ]);

    expect(result).toEqual({
      skipped: 0,
      admins: [
        {
          uispUserId: 11,
          displayName: 'Persona Uno',
          email: 'persona.uno@example.test',
          isActive: true,
        },
        { uispUserId: 12, displayName: 'pdos', email: null, isActive: false },
        { uispUserId: 13, displayName: null, email: null, isActive: true },
      ],
    });
  });

  it('omite elementos inválidos o repetidos y los cuenta', () => {
    const result = parseUispAdmins([
      { id: 0, isActive: true },
      { id: 'a', isActive: true },
      { id: 5 },
      null,
      { id: 5, isActive: true },
      { id: 5, isActive: false },
    ]);

    expect(result.admins.map((admin) => admin.uispUserId)).toEqual([5]);
    expect(result.skipped).toBe(5);
  });

  it('rechaza una respuesta que no es lista', () => {
    expect(() => parseUispAdmins({ data: [] })).toThrow(UispAdminsResponseError);
  });
});
