/**
 * client.js - Robust Omron FINS UDP Client Wrapper
 *
 * Wraps the omron-fins library in modern Promises with connection timeouts,
 * discrete targeted reading, and typed read/write helpers.
 */

const fins = require('omron-fins');

const MemoryAreas = {
  DM: 'D',         // Data Memory (0x82)
  CIO: 'C',        // Core I/O (0xB0)
  WORK: 'W',       // Work Area (0xB1)
  HOLDING: 'H',    // Holding Area (0xB2)
  AUXILIARY: 'A'   // Auxiliary Area (0xB3)
};

class FinsClient {
  /**
   * @param {Object} options
   * @param {string} options.host - PLC IP address (e.g. '192.168.2.21')
   * @param {number} [options.port=9600] - FINS UDP Port (default: 9600)
   * @param {number} [options.timeout=2000] - Read/Write timeout in ms
   * @param {number} [options.dna=0] - Destination Network Address
   * @param {number} [options.da1=0] - Destination Node Address
   * @param {number} [options.sa1=54] - Source Node Address
   */
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 9600;
    this.timeout = options.timeout || 2000;
    this.dna = options.dna || 0;
    this.da1 = options.da1 || 0;
    this.sa1 = options.sa1 || 54;

    this.client = null;
    this.connected = false;
  }

  /**
   * Initializes the UDP FINS socket and waits for socket ready.
   * @returns {Promise<FinsClient>}
   */
  connect() {
    if (this.client && this.client.connected) {
      this.connected = true;
      return Promise.resolve(this);
    }

    return new Promise((resolve) => {
      const opts = {
        timeout: this.timeout,
        protocol: 'udp',
        autoConnect: true,
        DA1: this.da1,
        SA1: this.sa1,
        DNA: this.dna
      };

      this.client = fins.FinsClient(this.port, this.host, opts);

      const onOpen = () => {
        this.connected = true;
        resolve(this);
      };

      if (this.client.connected) {
        onOpen();
      } else {
        this.client.once('open', onOpen);
      }

      this.client.on('error', () => {
        this.connected = false;
      });

      // Immediate fallback if already listening
      setTimeout(() => {
        this.connected = true;
        resolve(this);
      }, 50);
    });
  }

  /**
   * Reads raw 16-bit words from PLC memory.
   *
   * @param {string|number} address - Start address (e.g. '100' or 'D100')
   * @param {number} [count=1] - Number of consecutive 16-bit words to read
   * @param {string} [area='D'] - Memory area code from MemoryAreas
   * @returns {Promise<number[]>} Array of raw 16-bit unsigned integers
   */
  async readWords(address, count = 1, area = MemoryAreas.DM) {
    if (!this.client || !this.client.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const addrNum = parseInt(String(address).replace(/^[A-Za-z]/, ''), 10);
      const regKey = `${area}${addrNum}`;

      let timer = null;
      let finished = false;

      const cleanup = () => {
        finished = true;
        if (timer) clearTimeout(timer);
      };

      timer = setTimeout(() => {
        if (!finished) {
          cleanup();
          reject(new Error(`FINS read timeout (${this.timeout}ms) for register ${regKey}`));
        }
      }, this.timeout);

      this.client.read(regKey, count, (err, msg) => {
        if (finished) return;
        cleanup();

        if (err || (msg && (msg.error || msg.timeout))) {
          const errMsg = err ? err.message : (msg && msg.timeout ? 'Read timeout' : 'FINS Read Error');
          return reject(new Error(errMsg));
        }

        let words = [];
        if (msg) {
          if (Array.isArray(msg.values)) words = msg.values;
          else if (msg.response && Array.isArray(msg.response.values)) words = msg.response.values;
          else if (Array.isArray(msg)) words = msg;
        }

        resolve(words);
      });
    });
  }

  /**
   * Writes raw 16-bit words to PLC memory.
   *
   * @param {string|number} address - Start address (e.g. '10' or 'D10')
   * @param {number|number[]} values - Single word or array of 16-bit words
   * @param {string} [area='D'] - Memory area code
   * @returns {Promise<void>}
   */
  async writeWords(address, values, area = MemoryAreas.DM) {
    if (!this.client || !this.client.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const addrNum = parseInt(String(address).replace(/^[A-Za-z]/, ''), 10);
      const regKey = `${area}${addrNum}`;
      const payload = Array.isArray(values) ? values : [values];

      let timer = null;
      let finished = false;

      timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          reject(new Error(`FINS write timeout (${this.timeout}ms) for register ${regKey}`));
        }
      }, this.timeout);

      this.client.write(regKey, payload, (err, msg) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);

        if (err || (msg && (msg.error || msg.timeout))) {
          const errMsg = err ? err.message : 'FINS Write Error';
          return reject(new Error(errMsg));
        }
        resolve();
      });
    });
  }

  /**
   * Reads a 32-bit single-precision float across 2 consecutive registers.
   *
   * @param {string|number} address - Start address (LSW, e.g. 100 for D100 & D101)
   * @param {string} [area='D'] - Memory area code
   * @returns {Promise<number>} Decoded IEEE-754 float
   */
  async readFloat(address, area = MemoryAreas.DM) {
    const { wordsToFloatBE } = require('./decoder');
    const words = await this.readWords(address, 2, area);
    if (words.length < 2) throw new Error(`Expected 2 words for float, got ${words.length}`);
    return wordsToFloatBE(words[0], words[1]);
  }

  /**
   * Writes a 32-bit single-precision float across 2 consecutive registers.
   *
   * @param {string|number} address - Start address
   * @param {number} value - Float number to write
   * @param {string} [area='D'] - Memory area code
   * @returns {Promise<void>}
   */
  async writeFloat(address, value, area = MemoryAreas.DM) {
    const { floatToWordsBE } = require('./decoder');
    const [lsw, msw] = floatToWordsBE(value);
    await this.writeWords(address, [lsw, msw], area);
  }

  /**
   * Closes the underlying UDP socket.
   */
  disconnect() {
    this.connected = false;
    if (this.client) {
      if (this.client._socket && typeof this.client._socket.close === 'function') {
        try {
          this.client._socket.close();
        } catch (_) {}
      }
      this.client = null;
    }
  }
}

module.exports = {
  FinsClient,
  MemoryAreas
};
