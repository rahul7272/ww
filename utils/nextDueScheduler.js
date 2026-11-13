/**
 * Event-driven "next due" scheduler that replaces tight fixed-interval polling.
 * Sleeps with zero DB queries until the earliest scheduled item is due,
 * prevents overlapping ticks, and automatically re-arms whenever items change.
 */
export class NextDueScheduler {
  constructor({
    name,
    getNextRunAt,
    processDue,
    safetyPollMs = 5 * 60 * 1000,
    maxTimerMs = 6 * 60 * 60 * 1000,
  }) {
    this.name = name || "SCHEDULER";
    this.getNextRunAt = getNextRunAt;
    this.processDue = processDue;
    this.safetyPollMs = safetyPollMs;
    this.maxTimerMs = maxTimerMs;

    this.started = false;
    this.isRunning = false;
    this.rescheduleRequested = false;
    this.timeoutId = null;
    this.safetyIntervalId = null;
    this.scheduleEpoch = 0;
  }

  start() {
    if (this.started) return;
    this.started = true;

    console.log(
      `[${this.name}] Started next-due event-driven scheduler (zero idle polling; safety check ${Math.round(this.safetyPollMs / 1000)}s)`
    );

    if (this.safetyPollMs > 0) {
      this.safetyIntervalId = setInterval(() => {
        if (!this.isRunning) {
          this.reschedule();
        }
      }, this.safetyPollMs);
      if (typeof this.safetyIntervalId.unref === "function") {
        this.safetyIntervalId.unref();
      }
    }

    this.reschedule();
  }

  stop() {
    this.started = false;
    this.scheduleEpoch++;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.safetyIntervalId) {
      clearInterval(this.safetyIntervalId);
      this.safetyIntervalId = null;
    }
  }

  async reschedule() {
    if (!this.started) return;

    if (this.isRunning) {
      this.rescheduleRequested = true;
      return;
    }

    const epoch = ++this.scheduleEpoch;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    try {
      const nextDate = await this.getNextRunAt();
      // Abort if stopped, superseded by a newer reschedule(), or a run started in the meantime
      if (!this.started || epoch !== this.scheduleEpoch || this.isRunning) {
        return;
      }

      if (!nextDate) {
        return;
      }

      const nextMs = nextDate instanceof Date ? nextDate.getTime() : new Date(nextDate).getTime();
      if (!Number.isFinite(nextMs)) {
        return;
      }

      const delayMs = Math.max(0, nextMs - Date.now());
      if (delayMs === 0) {
        this.triggerRun();
        return;
      }

      const boundedDelay = Math.min(delayMs, this.maxTimerMs);
      this.timeoutId = setTimeout(() => {
        this.timeoutId = null;
        if (!this.started) return;
        if (delayMs > this.maxTimerMs && Date.now() < nextMs) {
          this.reschedule();
        } else {
          this.triggerRun();
        }
      }, boundedDelay);

      if (typeof this.timeoutId.unref === "function") {
        this.timeoutId.unref();
      }
    } catch (err) {
      console.error(`[${this.name}] reschedule error:`, err.message);
    }
  }

  async triggerRun() {
    if (!this.started) return;
    if (this.isRunning) {
      this.rescheduleRequested = true;
      return;
    }

    this.isRunning = true;
    this.rescheduleRequested = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    try {
      await this.processDue();
    } catch (err) {
      console.error(`[${this.name}] run error:`, err.message);
    } finally {
      this.isRunning = false;
      this.rescheduleRequested = false;
      if (this.started) {
        await this.reschedule();
      }
    }
  }
}

