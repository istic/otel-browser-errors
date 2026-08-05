import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGlobalListeners } from './listeners';
import * as reportModule from './report';

let unregister: () => void;

beforeEach(() => {
  vi.spyOn(reportModule, 'reportError').mockImplementation(() => {});
  unregister = registerGlobalListeners();
});

afterEach(() => {
  unregister();
  vi.restoreAllMocks();
});

describe('registerGlobalListeners', () => {
  it('reports the error object from a window error event', () => {
    const error = new Error('uncaught');
    window.dispatchEvent(new ErrorEvent('error', { error }));

    expect(reportModule.reportError).toHaveBeenCalledWith(error);
  });

  it('falls back to the event message when no error object is present', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'script error' }));

    expect(reportModule.reportError).toHaveBeenCalledWith('script error');
  });

  it('reports the rejection reason from an unhandledrejection event', () => {
    const reason = new Error('rejected');
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: reason });
    window.dispatchEvent(event);

    expect(reportModule.reportError).toHaveBeenCalledWith(reason);
  });

  it('stops reporting after the returned unregister function is called', () => {
    unregister();

    // Our listener has been removed, so nothing on the page will catch this
    // dispatch. Without a catch-all handler, jsdom treats the unhandled
    // `error` event as an actual uncaught exception and propagates it up as
    // an "Unhandled Error" at the test-run level. Register a temporary no-op
    // handler so jsdom sees the event as handled, which keeps this assertion
    // about our (unregistered) listener the only thing under test.
    const noop = () => {};
    window.addEventListener('error', noop);
    try {
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('after unregister') }));

      expect(reportModule.reportError).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('error', noop);
    }
  });
});
