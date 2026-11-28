import {
  UispAdminsResponseError,
  parseStoredUispStaffName,
  parseUispAdmins,
  serializeUispStaffName,
} from './uisp-admins';

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
          name: { displayName: 'Persona Uno', firstName: 'Persona', lastName: 'Uno' },
          email: 'persona.uno@example.test',
          isActive: true,
        },
        {
          uispUserId: 12,
          name: { displayName: 'pdos', firstName: null, lastName: null },
          email: null,
          isActive: false,
        },
        { uispUserId: 13, name: null, email: null, isActive: true },
      ],
    });
  });

  it('conserva nombre y apellido compuestos por separado', () => {
    const [admin] = parseUispAdmins([
      { id: 21, firstName: ' Persona María ', lastName: 'Sintética Uno', isActive: true },
    ]).admins;

    expect(admin?.name).toEqual({
      displayName: 'Persona María Sintética Uno',
      firstName: 'Persona María',
      lastName: 'Sintética Uno',
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

describe('nombre guardado en la fila de revisión', () => {
  it('ida y vuelta conserva las partes', () => {
    const name = { displayName: 'Persona María Uno', firstName: 'Persona María', lastName: 'Uno' };
    expect(parseStoredUispStaffName(serializeUispStaffName(name))).toEqual(name);
  });

  it.each(['Persona Uno', '{no es json', '{"v":2,"displayName":"x"}'])(
    'una fila anterior o desconocida se lee como texto plano sin partes: %s',
    (text) => {
      expect(parseStoredUispStaffName(text)).toEqual({
        displayName: text,
        firstName: null,
        lastName: null,
      });
    },
  );
});
