import { describe, it, expect, vi } from 'vitest';
import { createFrameScheduler } from '../js/render/scheduler.js';

/** Manual frame pump, so these tests do not depend on a real rAF. */
function harness() {
  let queued = null, next = 1;
  const raf = vi.fn(fn => { queued = fn; return next++; });
  const caf = vi.fn(() => { queued = null; });
  return {
    scheduler: createFrameScheduler(raf, caf),
    frame() { const fn = queued; queued = null; if (fn) fn(); },
    get rafCalls() { return raf.mock.calls.length; },
    get cafCalls() { return caf.mock.calls.length; }
  };
}

describe('createFrameScheduler', () => {
  it('runs queued work on the next frame, not immediately', () => {
    const h = harness();
    const job = vi.fn();
    h.scheduler.schedule('a', job);
    expect(job).not.toHaveBeenCalled();
    h.frame();
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('collapses repeated requests under one key into a single run', () => {
    const h = harness();
    const job = vi.fn();
    for (let i = 0; i < 100; i++) h.scheduler.schedule('a', job);
    h.frame();
    expect(job).toHaveBeenCalledTimes(1);
    expect(h.rafCalls).toBe(1);  // and only one frame was ever requested
  });

  it('keeps the newest callback for a key', () => {
    const h = harness();
    const stale = vi.fn(), fresh = vi.fn();
    h.scheduler.schedule('a', stale);
    h.scheduler.schedule('a', fresh);
    h.frame();
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('runs different keys independently in the same frame', () => {
    const h = harness();
    const a = vi.fn(), b = vi.fn();
    h.scheduler.schedule('a', a);
    h.scheduler.schedule('b', b);
    h.frame();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('cancel drops work that has not run yet', () => {
    const h = harness();
    const job = vi.fn();
    h.scheduler.schedule('a', job);
    h.scheduler.cancel('a');
    h.frame();
    expect(job).not.toHaveBeenCalled();
  });

  it('flushNow runs the work synchronously and cancels the frame', () => {
    const h = harness();
    const job = vi.fn();
    h.scheduler.schedule('a', job);
    h.scheduler.flushNow();
    expect(job).toHaveBeenCalledTimes(1);
    expect(h.cafCalls).toBe(1);
    h.frame();                       // the frame must not run it twice
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('flushNow with nothing queued is a no-op', () => {
    const h = harness();
    expect(() => h.scheduler.flushNow()).not.toThrow();
    expect(h.cafCalls).toBe(0);
  });

  it('requests a fresh frame after one has run', () => {
    const h = harness();
    const job = vi.fn();
    h.scheduler.schedule('a', job);
    h.frame();
    h.scheduler.schedule('a', job);
    h.frame();
    expect(job).toHaveBeenCalledTimes(2);
    expect(h.rafCalls).toBe(2);
  });

  it('work scheduled from inside a job lands on the following frame', () => {
    const h = harness();
    const later = vi.fn();
    h.scheduler.schedule('a', () => h.scheduler.schedule('b', later));
    h.frame();
    expect(later).not.toHaveBeenCalled();
    h.frame();
    expect(later).toHaveBeenCalledTimes(1);
  });
});
