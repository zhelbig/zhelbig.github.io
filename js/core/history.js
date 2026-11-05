/**
 * Undo/redo as two stacks of opaque snapshots. Knows nothing about what a
 * snapshot contains or how to apply one - the caller owns serialization and
 * re-rendering. Pure, so the stack semantics are testable on their own.
 */

export const DEFAULT_MAX_UNDO = 50;

export function createHistory({ max = DEFAULT_MAX_UNDO } = {}) {
    const undoStack = [];
    const redoStack = [];

    return {
        get undoDepth() { return undoStack.length; },
        get redoDepth() { return redoStack.length; },
        canUndo() { return undoStack.length > 0; },
        canRedo() { return redoStack.length > 0; },

        /** Record a pre-change snapshot. Invalidates the redo branch, which
         *  is why callers must not push for no-op interactions. */
        push(snapshot) {
            undoStack.push(snapshot);
            if (undoStack.length > max) undoStack.shift();
            redoStack.length = 0;
        },

        /** Returns the snapshot to restore, or null. `current` is banked for redo. */
        undo(current) {
            if (undoStack.length === 0) return null;
            redoStack.push(current);
            return undoStack.pop();
        },

        redo(current) {
            if (redoStack.length === 0) return null;
            undoStack.push(current);
            return redoStack.pop();
        },

        clear() {
            undoStack.length = 0;
            redoStack.length = 0;
        }
    };
}
