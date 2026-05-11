// Debounced "the user just mutated something" trigger.
//
// Every mutation calls `enqueueSync` to record the change in sync_queue.
// `enqueueSync` then calls requestSync() to schedule a sync cycle so the
// change pushes (and a pull-and-reconcile follows) without waiting on a
// timer interval.
//
// Lives in this tiny module — separately from syncEngine — so the db query
// layer can call into it without forming a static import cycle with the sync
// engine (which transitively imports db/queries via pushChanges).
// syncEngine.start() registers the actual sync function via setSyncTrigger;
// stop() clears it. Calls made while no trigger is registered (e.g. between
// sign-out and sign-in) are silently dropped — there's no sync engine to run.

type SyncTrigger = () => void;

let trigger: SyncTrigger | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

// Window long enough that a single SQLite transaction enqueuing multiple
// rows (e.g. createExpense + N photos) coalesces into one sync, but short
// enough that the user experiences "I tapped save, sync started" as
// immediate. 150ms is below the perceptual snap threshold for UI feedback.
const DEBOUNCE_MS = 150;

export function setSyncTrigger(fn: SyncTrigger | null): void {
  trigger = fn;
  if (!fn && timer) {
    clearTimeout(timer);
    timer = null;
  }
}

export function requestSync(): void {
  if (!trigger) return;
  if (timer) clearTimeout(timer);
  const fn = trigger;
  timer = setTimeout(() => {
    timer = null;
    fn();
  }, DEBOUNCE_MS);
}
