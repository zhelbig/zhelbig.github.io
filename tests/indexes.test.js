import { describe, it, expect } from 'vitest';
import { createSceneIndex } from '../js/core/indexes.js';

const dev = id => ({ id, x: 0, y: 0 });
const conn = (id, from, to) => ({ id, from, to, type: 'wired' });

describe('createSceneIndex', () => {
  it('looks devices up by id', () => {
    const ix = createSceneIndex();
    const a = dev('a');
    ix.rebuild([a, dev('b')], []);
    expect(ix.device('a')).toBe(a);
    expect(ix.device('nope')).toBeUndefined();
    expect(ix.deviceCount).toBe(2);
  });

  it('indexes a connection against both endpoints', () => {
    const ix = createSceneIndex();
    const c = conn('c1', 'a', 'b');
    ix.rebuild([dev('a'), dev('b')], [c]);
    expect([...ix.connectionsFor('a')]).toEqual([c]);
    expect([...ix.connectionsFor('b')]).toEqual([c]);
  });

  it('returns an empty set for an unconnected device', () => {
    const ix = createSceneIndex();
    ix.rebuild([dev('a')], []);
    expect(ix.connectionsFor('a').size).toBe(0);
    expect(ix.connectionsFor('ghost').size).toBe(0);
  });

  it('unions the edges of several devices without duplicating shared ones', () => {
    const ix = createSceneIndex();
    const ab = conn('ab', 'a', 'b'), bc = conn('bc', 'b', 'c');
    ix.rebuild([dev('a'), dev('b'), dev('c')], [ab, bc]);
    // 'ab' touches both a and b, and must appear once.
    expect(ix.connectionsForAny(['a', 'b']).size).toBe(2);
    expect([...ix.connectionsForAny(['a'])]).toEqual([ab]);
  });

  it('drops a removed device from its neighbours too', () => {
    const ix = createSceneIndex();
    const c = conn('c1', 'a', 'b');
    ix.rebuild([dev('a'), dev('b')], [c]);
    ix.removeDevice('a');
    expect(ix.device('a')).toBeUndefined();
    // b must not keep pointing at an edge whose other end is gone.
    expect(ix.connectionsFor('b').size).toBe(0);
  });

  it('removes a connection from both ends', () => {
    const ix = createSceneIndex();
    const c = conn('c1', 'a', 'b');
    ix.rebuild([dev('a'), dev('b')], [c]);
    ix.removeConnection(c);
    expect(ix.connectionsFor('a').size).toBe(0);
    expect(ix.connectionsFor('b').size).toBe(0);
  });

  it('picks up incrementally added devices and connections', () => {
    const ix = createSceneIndex();
    ix.rebuild([], []);
    const a = dev('a'), b = dev('b'), c = conn('c1', 'a', 'b');
    ix.addDevice(a); ix.addDevice(b); ix.addConnection(c);
    expect(ix.device('b')).toBe(b);
    expect([...ix.connectionsFor('a')]).toEqual([c]);
  });

  it('rebuild replaces everything rather than accumulating', () => {
    const ix = createSceneIndex();
    ix.rebuild([dev('a')], [conn('c1', 'a', 'b')]);
    ix.rebuild([dev('z')], []);
    expect(ix.device('a')).toBeUndefined();
    expect(ix.connectionsFor('a').size).toBe(0);
    expect(ix.deviceCount).toBe(1);
  });

  it('caches and invalidates measured sizes', () => {
    const ix = createSceneIndex();
    ix.setSize('a', 120, 90);
    expect(ix.size('a')).toEqual({ width: 120, height: 90 });
    ix.invalidateSize('a');
    expect(ix.size('a')).toBeUndefined();
  });

  it('keeps sizes across a rebuild, since a redraw does not resize boxes', () => {
    const ix = createSceneIndex();
    ix.setSize('a', 120, 90);
    ix.rebuild([dev('a')], []);
    expect(ix.size('a')).toEqual({ width: 120, height: 90 });
  });

  it('forgets the size of a removed device', () => {
    const ix = createSceneIndex();
    ix.rebuild([dev('a')], []);
    ix.setSize('a', 120, 90);
    ix.removeDevice('a');
    expect(ix.size('a')).toBeUndefined();
  });

  it('handles a self-referential connection without duplicating it', () => {
    const ix = createSceneIndex();
    const c = conn('c1', 'a', 'a');
    ix.rebuild([dev('a')], [c]);
    expect(ix.connectionsFor('a').size).toBe(1);
  });
});
