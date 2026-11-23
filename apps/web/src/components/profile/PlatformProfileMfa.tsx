'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@iwana/ui';
import { PlatformMfaQr } from '@/components/auth/PlatformMfaQr';
import { ApiError, authApi } from '@/lib/api-client';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.profileMfa;
type MfaSetup = Awaited<ReturnType<typeof authApi.setupPlatformSelfMfa>>;

export function PlatformProfileMfa({
  enabled,
  onEnabled,
}: {
  enabled: boolean;
  onEnabled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (setup) codeInput.current?.focus();
  }, [setup]);

  function close() {
    setOpen(false);
    setSetup(null);
    setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      if (setup) {
        await authApi.verifyPlatformSelfMfa(setup.challenge, String(form.get('totpCode') ?? ''));
        onEnabled();
        setSaved(true);
        close();
      } else {
        setSetup(await authApi.setupPlatformSelfMfa(String(form.get('password') ?? '')));
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        onEnabled();
        close();
      } else {
        if (setup && cause instanceof ApiError && cause.status === 400) setSetup(null);
        setError(
          cause instanceof ApiError ? cause.message : setup ? COPY.verifyError : COPY.startError,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
              {COPY.title}
            </h3>
            <Badge variant={enabled ? 'success' : 'neutral'}>
              {enabled ? COPY.enabled : COPY.disabled}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{COPY.description}</p>
        </div>
        {!enabled && (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-11 max-w-full whitespace-normal"
            onClick={() => setOpen(true)}
          >
            {COPY.action}
          </Button>
        )}
      </div>
      {saved && (
        <p
          role="status"
          className="mt-3 text-sm font-medium text-iwana-secondary-800 dark:text-iwana-secondary-100"
        >
          {COPY.saved}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{COPY.action}</DialogTitle>
            {!setup && <DialogDescription>{COPY.passwordPrompt}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            {setup ? (
              <>
                <PlatformMfaQr qrCodeBase64={setup.qrCodeBase64} otpauthUri={setup.otpauthUri} />
                <Input
                  ref={codeInput}
                  label={COPY.code}
                  name="totpCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </>
            ) : (
              <Input
                label={COPY.password}
                name="password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={close}>
                {COPY.cancel}
              </Button>
              <Button type="submit" loading={busy}>
                {setup ? COPY.confirm : COPY.continue}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
