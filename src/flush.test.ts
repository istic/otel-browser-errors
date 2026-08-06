import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFlushOnUnload } from './flush';

function fakeProvider() {
  return { forceFlush: vi.fn().mockResolvedValue(undefined) };
}

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
}

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
  setVisibilityState('visible');
  vi.restoreAllMocks();
});

describe('registerFlushOnUnload', () => {
  it('flushes the provider on pagehide', () => {
    const provider = fakeProvider();
    unregister = registerFlushOnUnload(provider as never);

    window.dispatchEvent(new Event('pagehide'));

    expect(provider.forceFlush).toHaveBeenCalledTimes(1);
  });

  it('flushes the provider when visibility changes to hidden', () => {
    const provider = fakeProvider();
    unregister = registerFlushOnUnload(provider as never);

    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(provider.forceFlush).toHaveBeenCalledTimes(1);
  });

  it('does not flush when visibility changes to visible', () => {
    const provider = fakeProvider();
    unregister = registerFlushOnUnload(provider as never);

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(provider.forceFlush).not.toHaveBeenCalled();
  });

  it('stops flushing after the returned unregister function is called', () => {
    const provider = fakeProvider();
    const stop = registerFlushOnUnload(provider as never);
    stop();

    window.dispatchEvent(new Event('pagehide'));
    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(provider.forceFlush).not.toHaveBeenCalled();
  });

  it('does not throw when forceFlush rejects', () => {
    const provider = { forceFlush: vi.fn().mockRejectedValue(new Error('boom')) };
    unregister = registerFlushOnUnload(provider as never);

    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
  });
});
