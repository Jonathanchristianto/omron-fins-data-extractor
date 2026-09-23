/**
 * poller.js - Industrial Momentary Rising Edge Poller
 *
 * Implements high-reliability event polling for PLC triggers.
 * Detects clean 0 -> 1 transitions while rejecting sustained high (1 -> 1),
 * falling edges (1 -> 0), or idle noise.
 */

const EventEmitter = require('events');

class FinsPoller extends EventEmitter {
  /**
   * @param {FinsClient} client - Configured FinsClient instance
   * @param {Object} options
   * @param {number} [options.interval=500] - Polling interval in milliseconds
   * @param {string|number} options.triggerRegister - Start register to poll (e.g. 'D1')
   * @param {number} [options.triggerCount=1] - Number of trigger words to read
   */
  constructor(client, options = {}) {
    super();
    this.client = client;
    this.interval = options.interval || 500;
    this.triggerRegister = options.triggerRegister || 'D1';
    this.triggerCount = options.triggerCount || 1;

    this.timer = null;
    this.isPolling = false;
    this.lastValues = new Array(this.triggerCount).fill(0);
  }

  /**
   * Starts the polling loop.
   */
  start() {
    if (this.isPolling) return;
    this.isPolling = true;

    const poll = async () => {
      if (!this.isPolling) return;

      try {
        const words = await this.client.readWords(this.triggerRegister, this.triggerCount);

        for (let i = 0; i < words.length; i++) {
          const current = (words[i] >>> 0) & 0xffff;
          const previous = this.lastValues[i];

          // 1. Rising edge detection (0 -> 1)
          if (previous === 0 && current === 1) {
            this.emit('rising-edge', {
              index: i,
              registerOffset: i,
              value: current
            });
          }

          // 2. Falling edge detection (1 -> 0)
          if (previous === 1 && current === 0) {
            this.emit('falling-edge', {
              index: i,
              registerOffset: i,
              value: current
            });
          }

          // 3. Any change event
          if (previous !== current) {
            this.emit('change', {
              index: i,
              previous,
              current
            });
          }

          this.lastValues[i] = current;
        }
      } catch (err) {
        this.emit('error', err);
      }

      if (this.isPolling) {
        this.timer = setTimeout(poll, this.interval);
      }
    };

    poll();
  }

  /**
   * Stops the polling loop.
   */
  stop() {
    this.isPolling = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  FinsPoller
};
