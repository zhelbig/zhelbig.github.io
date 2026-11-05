/**
 * Non-blocking notifications.
 *
 * Replaces window.alert, which halted the page and had to be dismissed
 * before anything else could happen - including the "export finished"
 * message, which interrupted the very moment the user wanted to keep
 * working. Toasts stack, dismiss themselves, and can carry one action.
 */

export const TOAST_DEFAULT_MS = 4500;

// setTimeout must be invoked with the global as its receiver; passing the
// bare reference and calling it as timers.set(...) throws "Illegal
// invocation" in Chrome. Wrapping keeps the seam for tests without that trap.
const REAL_TIMERS = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle)
};

export function createToaster(container, { timers = REAL_TIMERS } = {}) {
    const live = new Set();

    function dismiss(el) {
        if (!live.has(el)) return;
        live.delete(el);
        if (el.dataset.timer) timers.clear(Number(el.dataset.timer));
        el.classList.add('leaving');
        // Let the transition finish, but never leave the node behind if the
        // browser skips it (reduced motion, background tab).
        const drop = () => el.remove();
        el.addEventListener('transitionend', drop, { once: true });
        timers.set(drop, 400);
    }

    return {
        /**
         * @param {string} message
         * @param {{type?: 'info'|'success'|'warn'|'error', duration?: number,
         *          action?: {label: string, onClick: Function}}} [opts]
         */
        show(message, opts = {}) {
            const { type = 'info', action } = opts;
            // Errors stay until dismissed: they usually need reading twice.
            const duration = opts.duration !== undefined
                ? opts.duration
                : (type === 'error' ? 0 : TOAST_DEFAULT_MS);

            const el = document.createElement('div');
            el.className = 'toast toast-' + type;
            el.setAttribute('role', type === 'error' ? 'alert' : 'status');

            const text = document.createElement('span');
            text.className = 'toast-text';
            text.textContent = message;          // never innerHTML: messages carry user data
            el.appendChild(text);

            if (action) {
                const btn = document.createElement('button');
                btn.className = 'toast-action';
                btn.textContent = action.label;
                btn.addEventListener('click', () => { dismiss(el); action.onClick(); });
                el.appendChild(btn);
            }

            const close = document.createElement('button');
            close.className = 'toast-close';
            close.setAttribute('aria-label', 'Dismiss');
            close.textContent = '×';
            close.addEventListener('click', () => dismiss(el));
            el.appendChild(close);

            container.appendChild(el);
            live.add(el);
            if (duration > 0) el.dataset.timer = String(timers.set(() => dismiss(el), duration));

            return { dismiss: () => dismiss(el), element: el };
        },

        /** A toast that stays until explicitly resolved - for long work. */
        progress(message) {
            const handle = this.show(message, { type: 'info', duration: 0 });
            handle.element.classList.add('toast-progress');
            return {
                done: (text, type = 'success') => {
                    handle.dismiss();
                    if (text) this.show(text, { type });
                },
                fail: (text) => {
                    handle.dismiss();
                    if (text) this.show(text, { type: 'error' });
                }
            };
        },

        dismissAll() { [...live].forEach(dismiss); },
        get count() { return live.size; }
    };
}
