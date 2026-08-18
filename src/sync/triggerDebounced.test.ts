import { setSyncTrigger, requestSync } from './triggerDebounced';

describe('triggerDebounced', () => {
  let triggerFn: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    triggerFn = jest.fn();
    setSyncTrigger(null);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('does nothing if no trigger is set', () => {
    requestSync();
    jest.advanceTimersByTime(150);
    expect(triggerFn).not.toHaveBeenCalled();
  });

  it('triggers the function after 150ms', () => {
    setSyncTrigger(triggerFn);
    requestSync();

    expect(triggerFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(149);
    expect(triggerFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(triggerFn).toHaveBeenCalledTimes(1);
  });

  it('coalesces multiple calls within 150ms into one trigger', () => {
    setSyncTrigger(triggerFn);

    requestSync();
    jest.advanceTimersByTime(50);

    requestSync();
    jest.advanceTimersByTime(50);

    requestSync();

    // Total elapsed time is 100ms so far.
    // The timer was reset on the last requestSync call.
    // It should trigger 150ms after the last call.

    expect(triggerFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(149);
    expect(triggerFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(triggerFn).toHaveBeenCalledTimes(1);
  });

  it('cancels pending timers when setSyncTrigger is called with null', () => {
    setSyncTrigger(triggerFn);
    requestSync();

    setSyncTrigger(null);
    jest.advanceTimersByTime(150);

    expect(triggerFn).not.toHaveBeenCalled();
  });
});
