'use client';

import { useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import type { PlatformUserDirectoryEntry } from '@iwana/shared';
import { platformUsersApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.platformUserDirectory.edit;

export function PlatformUserNameDialog({
  account,
  onClose,
  onSaved,
}: {
  account: PlatformUserDirectoryEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(false);
    try {
      await platformUsersApi.updateDirectoryName(account.id, {
        firstName: String(form.get('firstName') ?? '').trim(),
        lastName: String(form.get('lastName') ?? '').trim(),
      });
      onSaved();
    } catch {
      setError(true);
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
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset className="space-y-4" disabled={saving}>
            <Input
              label={COPY.firstName}
              name="firstName"
              autoComplete="off"
              maxLength={100}
              defaultValue={account.firstName ?? ''}
            />
            <Input
              label={COPY.lastName}
              name="lastName"
              autoComplete="off"
              maxLength={100}
              defaultValue={account.lastName ?? ''}
            />
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {COPY.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {COPY.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? COPY.saving : COPY.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
