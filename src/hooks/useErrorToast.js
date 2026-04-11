// Local error toast state hook. Each component that wants in-place error
// reporting can use this to replace `alert()` calls without ceremony.
//
// Usage:
//   const { errorMsg, showError, hideError } = useErrorToast();
//   // ...
//   catch { showError("Couldn't save tasting. Check your connection."); }
//   // In render:
//   <Toast message={errorMsg} open={!!errorMsg} onClose={hideError} variant="error" />
//
// Kept deliberately light (no context/provider) so it can be dropped into
// existing components without restructuring the app shell.
import { useState, useCallback } from 'react';

export function useErrorToast() {
  const [errorMsg, setErrorMsg] = useState(null);
  const showError = useCallback((msg) => setErrorMsg(msg || 'Something went wrong.'), []);
  const hideError = useCallback(() => setErrorMsg(null), []);
  return { errorMsg, showError, hideError };
}
