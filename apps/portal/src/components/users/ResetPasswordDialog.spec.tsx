import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResetPasswordDialog } from './ResetPasswordDialog';

const baseUser = {
  id: 'user-1',
  email: 'ana@example.com',
  role: 'NOC',
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  mfaEnabled: true,
  mfaRequired: false,
  emailVerified: true,
  passwordResetRequired: false,
  lastLoginAt: '2026-05-01T10:00:00.000Z',
  createdAt: '2026-04-01T08:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  deletedAt: null,
  firstName: 'Ana',
  lastName: 'Pérez',
  phone: null,
  jobTitle: null,
  documentType: null,
  documentNumber: null,
  avatarUrl: null,
} as const;

describe('ResetPasswordDialog', () => {
  it('should close the dialog when pressing Escape', async () => {
    const onClose = jest.fn();

    render(
      <ResetPasswordDialog
        isOpen={true}
        user={baseUser}
        onClose={onClose}
        onConfirm={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
      />,
    );

    await screen.findByRole('dialog', { name: 'Reiniciar contraseña' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('should trigger password reset confirmation from the dialog action', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);

    render(
      <ResetPasswordDialog
        isOpen={true}
        user={baseUser}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        isSubmitting={false}
        error={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar contraseña' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
