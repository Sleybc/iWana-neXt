'use client';

import { useCallback, useEffect, useState } from 'react';

interface UseDiscardChangesGuardOptions {
  open: boolean;
  isDirty: boolean;
  onClose: () => void;
}

export function useDiscardChangesGuard({ open, isDirty, onClose }: UseDiscardChangesGuardOptions) {
  const [discardOpen, setDiscardOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setDiscardOpen(false);
    }
  }, [open]);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    setDiscardOpen(true);
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setDiscardOpen(false);
  }, []);

  return {
    discardOpen,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  };
}
