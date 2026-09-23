/**
 * decoder.js - Omron PLC Data Type Decoders & Encoders
 *
 * Provides pure mathematical and buffer functions to convert between 16-bit PLC registers
 * and JavaScript native data types (32-bit Floats, 16/32-bit Integers, BCD, Strings).
 */

/**
 * Decodes a 32-bit single-precision Float (IEEE-754) stored across two 16-bit Omron registers.
 *
 * In standard Omron CJ/CS/CP DM memory:
 *   - Word 0 (Dn):   Least Significant Word (LSW)
 *   - Word 1 (Dn+1): Most Significant Word (MSW)
 *
 * @param {number} lsw - Register Dn (LSW)
 * @param {number} msw - Register Dn+1 (MSW)
 * @returns {number} Decoded IEEE-754 float value
 */
function wordsToFloatBE(lsw, msw) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE((msw >>> 0) & 0xffff, 0); // High Word
  buf.writeUInt16BE((lsw >>> 0) & 0xffff, 2); // Low Word
  return buf.readFloatBE(0);
}

/**
 * Encodes a JavaScript number (float) into two 16-bit Omron words.
 *
 * @param {number} val - Float value to encode
 * @returns {[number, number]} [lsw, msw] pair
 */
function floatToWordsBE(val) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(val, 0);
  const msw = buf.readUInt16BE(0);
  const lsw = buf.readUInt16BE(2);
  return [lsw, msw];
}

/**
 * Decodes a signed 16-bit integer (-32,768 to 32,767) from a single 16-bit word.
 *
 * @param {number} word - Raw 16-bit unsigned register (0 to 65535)
 * @returns {number} Signed integer
 */
function wordsToInt16(word) {
  const u = (word >>> 0) & 0xffff;
  return (u & 0x8000) ? (u - 0x10000) : u;
}

/**
 * Encodes a signed 16-bit integer to an unsigned 16-bit register word.
 *
 * @param {number} val - Signed integer
 * @returns {number} 16-bit unsigned word
 */
function int16ToWord(val) {
  return (val < 0 ? 0x10000 + (val % 0x10000) : val) & 0xffff;
}

/**
 * Decodes an unsigned 16-bit integer (0 to 65,535).
 *
 * @param {number} word - Raw register
 * @returns {number} Unsigned 16-bit integer
 */
function wordsToUInt16(word) {
  return (word >>> 0) & 0xffff;
}

/**
 * Decodes a signed 32-bit integer (DINT) from two 16-bit words.
 *
 * @param {number} lsw - Low word
 * @param {number} msw - High word
 * @returns {number} Signed 32-bit integer
 */
function wordsToDInt32(lsw, msw) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE((msw >>> 0) & 0xffff, 0);
  buf.writeUInt16BE((lsw >>> 0) & 0xffff, 2);
  return buf.readInt32BE(0);
}

/**
 * Decodes an unsigned 32-bit integer (UDINT) from two 16-bit words.
 *
 * @param {number} lsw - Low word
 * @param {number} msw - High word
 * @returns {number} Unsigned 32-bit integer
 */
function wordsToUDInt32(lsw, msw) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE((msw >>> 0) & 0xffff, 0);
  buf.writeUInt16BE((lsw >>> 0) & 0xffff, 2);
  return buf.readUInt32BE(0);
}

/**
 * Decodes a 4-digit Binary Coded Decimal (BCD) word into an integer (e.g., 0x1234 -> 1234).
 *
 * @param {number} word - 16-bit BCD word
 * @returns {number} Integer representation
 */
function wordsToBcd(word) {
  const d3 = (word >> 12) & 0x0f;
  const d2 = (word >> 8) & 0x0f;
  const d1 = (word >> 4) & 0x0f;
  const d0 = word & 0x0f;
  if (d3 > 9 || d2 > 9 || d1 > 9 || d0 > 9) {
    throw new Error(`Invalid BCD word: 0x${word.toString(16)}`);
  }
  return d3 * 1000 + d2 * 100 + d1 * 10 + d0;
}

/**
 * Encodes an integer (0 to 9999) into a 16-bit BCD word.
 *
 * @param {number} val - Integer (0-9999)
 * @returns {number} BCD encoded word
 */
function bcdToWord(val) {
  if (val < 0 || val > 9999) throw new Error(`Value ${val} out of range for 4-digit BCD (0-9999)`);
  const d3 = Math.floor(val / 1000);
  const d2 = Math.floor((val % 1000) / 100);
  const d1 = Math.floor((val % 100) / 10);
  const d0 = val % 10;
  return (d3 << 12) | (d2 << 8) | (d1 << 4) | d0;
}

/**
 * Decodes an ASCII string from an array of 16-bit words.
 * Each word stores 2 ASCII characters (High Byte, then Low Byte).
 *
 * @param {number[]} words - Array of 16-bit words
 * @returns {string} Decoded ASCII string (trimmed of trailing nulls)
 */
function wordsToAscii(words) {
  const buf = Buffer.alloc(words.length * 2);
  words.forEach((w, i) => {
    buf.writeUInt16BE((w >>> 0) & 0xffff, i * 2);
  });
  return buf.toString('ascii').replace(/\0+$/, '');
}

/**
 * Encodes an ASCII string into an array of 16-bit words.
 *
 * @param {string} str - String to encode
 * @returns {number[]} Array of 16-bit words
 */
function asciiToWords(str) {
  const len = Math.ceil(str.length / 2) * 2;
  const buf = Buffer.alloc(len, 0);
  buf.write(str, 'ascii');
  const words = [];
  for (let i = 0; i < len; i += 2) {
    words.push(buf.readUInt16BE(i));
  }
  return words;
}

module.exports = {
  wordsToFloatBE,
  floatToWordsBE,
  wordsToInt16,
  int16ToWord,
  wordsToUInt16,
  wordsToDInt32,
  wordsToUDInt32,
  wordsToBcd,
  bcdToWord,
  wordsToAscii,
  asciiToWords
};
