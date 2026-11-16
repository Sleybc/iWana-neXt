import { userInvitationTemplate } from './user-invitation.template';

describe('userInvitationTemplate', () => {
  const link = 'https://portal.ejemplo.example/auth/reset-password?token=abc123';

  it('invita a crear la contraseña del portal empresarial, en español y sin tecnicismos', () => {
    const mail = userInvitationTemplate({ createPasswordLink: link, expiresInDays: 7 });

    expect(mail.subject).toBe('Te invitaron a iWana');
    for (const body of [mail.html, mail.text].map((part) => part.split(link).join(''))) {
      expect(body).toContain('Crea tu contraseña para entrar al portal empresarial');
      expect(body).toContain('7 días');
      expect(body).not.toMatch(/registrarte|verifica tu correo|token|reset/iu);
    }
  });

  it('lleva el enlace al portal en el HTML y en el texto plano', () => {
    const mail = userInvitationTemplate({ createPasswordLink: link, expiresInDays: 7 });

    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.text).toContain(link);
  });

  it('no incluye datos de la persona: solo el enlace y la expiración', () => {
    const mail = userInvitationTemplate({ createPasswordLink: link, expiresInDays: 7 });
    const all = `${mail.subject}${mail.html}${mail.text}`;

    expect(all).not.toMatch(/@/u);
    expect(all).not.toMatch(/contraseña temporal/iu);
  });

  it('usa el singular cuando vence en un día', () => {
    expect(userInvitationTemplate({ createPasswordLink: link, expiresInDays: 1 }).text).toContain(
      '1 día.',
    );
  });
});
