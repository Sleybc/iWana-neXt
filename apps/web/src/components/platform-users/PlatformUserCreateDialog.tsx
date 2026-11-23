'use client';

import { useState, type FormEvent } from 'react';
import { PlatformRole } from '@iwana/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
} from '@iwana/ui';
import { ApiError, platformUsersApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { getWebUserRoleLabel } from '@/lib/user-labels';

const COPY = PLATFORM_UI_COPY.platformUserDirectory.create;
const ROLE_OPTIONS = Object.values(PlatformRole).map((role) => ({
  value: role,
  label: getWebUserRoleLabel(role),
}));

export function PlatformUserCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [role, setRole] = useState(PlatformRole.IWANA_SUPPORT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || credential) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const firstName = String(form.get('firstName') ?? '').trim();
    const lastName = String(form.get('lastName') ?? '').trim();
    if (!firstName || !lastName) {
      setError(COPY.missingName);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await platformUsersApi.createDirectoryAccount({
        email,
        firstName,
        lastName,
        role,
      });
      setCredential({ email, password: result.temporaryPassword });
      onCreated(result.id);
    } catch (error) {
      setError(error instanceof ApiError && error.status === 409 ? COPY.duplicate : COPY.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{credential ? COPY.created : COPY.action}</DialogTitle>
          <DialogDescription>{credential ? COPY.handoff : COPY.description}</DialogDescription>
        </DialogHeader>
        {credential ? (
          <div className="space-y-4">
            <Input label={COPY.email} readOnly value={credential.email} />
            <Input
              label={COPY.temporaryPassword}
              readOnly
              value={credential.password}
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" onClick={onClose}>
              {COPY.done}
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <fieldset className="space-y-4" disabled={saving}>
              <Input label={COPY.email} name="email" type="email" maxLength={255} required />
              <Input label={COPY.firstName} name="firstName" maxLength={100} required />
              <Input label={COPY.lastName} name="lastName" maxLength={100} required />
              <Select
                label={COPY.role}
                options={ROLE_OPTIONS}
                value={role}
                disabled={saving}
                onChange={(event) => {
                  const selected = ROLE_OPTIONS.find(
                    (option) => option.value === event.target.value,
                  );
                  if (selected) setRole(selected.value);
                }}
              />
            </fieldset>
            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                {COPY.cancel}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? COPY.saving : COPY.action}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
