'use client';

import { useEffect } from 'react';

/**
 * Warns the user before leaving the page when there are unsaved changes.
 *
 * @param isDirty  Whether the form has unsaved changes.
 */
export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}
