/**
 * Coalesces redraws onto animation frames.
 *
 * Pointer events fire far faster than the display refreshes - a 1000Hz mouse
 * can deliver a thousand mousemoves a second - and the old code redrew every
 * connection on each one. Work is keyed, so repeated requests within a frame
 * collapse into a single run.
 */

export function createFrameScheduler(raf, caf) {
    const request = raf || ((fn) => requestAnimationFrame(fn));
    const cancel = caf || ((h) => cancelAnimationFrame(h));

    const jobs = new Map();
    let handle = 0;

    function flush() {
        handle = 0;
        const run = [...jobs.values()];
        jobs.clear();
        run.forEach(fn => fn());
    }

    return {
        /** Queue fn under key. A later call with the same key replaces it. */
        schedule(key, fn) {
            jobs.set(key, fn);
            if (!handle) handle = request(flush);
        },
        cancel(key) { jobs.delete(key); },
        /** Run everything queued right now - for when a gesture ends and the
         *  next paint must already be correct. */
        flushNow() {
            if (!handle) return;
            cancel(handle);
            flush();
        },
        get pending() { return jobs.size; }
    };
}
