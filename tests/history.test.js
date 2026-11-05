import { describe, it, expect } from 'vitest';
import { createHistory, DEFAULT_MAX_UNDO } from '../js/core/history.js';

describe('createHistory', () => {
  it('starts empty and refuses to undo or redo', () => {
    const h = createHistory();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo('now')).toBeNull();
    expect(h.redo('now')).toBeNull();
  });

  it('returns pushed snapshots newest-first', () => {
    const h = createHistory();
    h.push('a'); h.push('b');
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.canUndo()).toBe(false);
  });

  it('banks the current state for redo, so undo round-trips', () => {
    const h = createHistory();
    h.push('a');
    expect(h.undo('b')).toBe('a');   // now showing 'a', 'b' is banked
    expect(h.canRedo()).toBe(true);
    expect(h.redo('a')).toBe('b');   // back to 'b'
    expect(h.canRedo()).toBe(false);
    expect(h.canUndo()).toBe(true);
  });

  it('drops the redo branch on a new edit', () => {
    const h = createHistory();
    h.push('a');
    h.undo('b');
    expect(h.canRedo()).toBe(true);
    h.push('c');                      // a fresh edit invalidates the branch
    expect(h.canRedo()).toBe(false);
  });

  it('caps depth, discarding the oldest entry', () => {
    const h = createHistory({ max: 3 });
    ['1', '2', '3', '4'].forEach(s => h.push(s));
    expect(h.undoDepth).toBe(3);
    expect(h.undo('5')).toBe('4');
    expect(h.undo('4')).toBe('3');
    expect(h.undo('3')).toBe('2');
    expect(h.canUndo()).toBe(false);  // '1' was evicted
  });

  it('defaults to the documented cap', () => {
    const h = createHistory();
    for (let i = 0; i < DEFAULT_MAX_UNDO + 10; i++) h.push(String(i));
    expect(h.undoDepth).toBe(DEFAULT_MAX_UNDO);
  });

  it('clear() empties both stacks', () => {
    const h = createHistory();
    h.push('a'); h.undo('b');
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('survives a long undo/redo walk without losing entries', () => {
    const h = createHistory();
    ['a', 'b', 'c'].forEach(s => h.push(s));
    let cur = 'd';
    const back = [];
    while (h.canUndo()) { const s = h.undo(cur); back.push(s); cur = s; }
    expect(back).toEqual(['c', 'b', 'a']);
    const fwd = [];
    while (h.canRedo()) { const s = h.redo(cur); fwd.push(s); cur = s; }
    expect(fwd).toEqual(['b', 'c', 'd']);
  });
});
