import { reportError } from './report';

export function registerGlobalListeners(): () => void {
  const handleError = (event: ErrorEvent): void => {
    reportError(event.error ?? event.message);
  };

  const handleRejection = (event: PromiseRejectionEvent): void => {
    reportError(event.reason);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
