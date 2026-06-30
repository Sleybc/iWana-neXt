import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DeleteUserDialog } from './DeleteUserDialog';

const baseUser = {
  id: 'user-1',
  email: 'ana@example.com',
  role: 'NOC',
  status: 'ACTIVE',
  tenantId: 'tenant-1',
  mfaEnabled: true,
  mfaRequired: false,
  isOperationalResource: false,
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

describe('DeleteUserDialog', () => {
  it('should close the dialog when pressing Escape', async () => {
    const onClose = jest.fn();

    render(
      <DeleteUserDialog
        isOpen={true}
        user={baseUser}
        onClose={onClose}
        onConfirm={jest.fn().mockResolvedValue(undefined)}
        isSubmitting={false}
        error={null}
        isSelfDelete={false}
      />,
    );

    await screen.findByRole('dialog', { name: 'Eliminar usuario' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('should confirm deletion only after matching the email', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);

    render(
      <DeleteUserDialog
        isOpen={true}
        user={baseUser}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        isSubmitting={false}
        error={null}
        isSelfDelete={false}
      />,
    );

    fireEvent.change(screen.getByLabelText(/para confirmar/i), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
