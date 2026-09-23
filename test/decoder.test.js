/**
 * decoder.test.js - Unit Tests for Omron Data Converters
 */

const assert = require('assert');
const {
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
} = require('../src/decoder');

console.log('--- Running Decoder Unit Tests ---');

// 1. Float Round-trip Tests
const testFloats = [0.0, 1.0, -1.0, 123.456, 3.14159, -98.765, 0.00125, 45.678];
testFloats.forEach(val => {
  const [lsw, msw] = floatToWordsBE(val);
  const decoded = wordsToFloatBE(lsw, msw);
  assert(Math.abs(decoded - val) < 0.0001, `Float mismatch for ${val}: got ${decoded}`);
});
console.log('✓ IEEE-754 32-bit Float round-trip conversions passed.');

// 2. Signed 16-bit Integer Tests
assert.strictEqual(wordsToInt16(0), 0);
assert.strictEqual(wordsToInt16(125), 125);
assert.strictEqual(wordsToInt16(65535), -1);
assert.strictEqual(wordsToInt16(32767), 32767);
assert.strictEqual(wordsToInt16(32768), -32768);
assert.strictEqual(int16ToWord(-1), 65535);
console.log('✓ 16-bit Signed/Unsigned integer conversions passed.');

// 3. 32-bit DINT Tests
assert.strictEqual(wordsToDInt32(0, 0), 0);
assert.strictEqual(wordsToDInt32(0xFFFF, 0xFFFF), -1);
assert.strictEqual(wordsToUDInt32(0xFFFF, 0xFFFF), 4294967295);
console.log('✓ 32-bit Double-Word (DINT/UDINT) conversions passed.');

// 4. BCD Tests
assert.strictEqual(wordsToBcd(0x1234), 1234);
assert.strictEqual(bcdToWord(1234), 0x1234);
assert.throws(() => wordsToBcd(0x12FA), /Invalid BCD/);
console.log('✓ 4-digit BCD conversions passed.');

// 5. String Tests
const sampleStr = 'OMRON';
const strWords = asciiToWords(sampleStr);
const decodedStr = wordsToAscii(strWords);
assert.strictEqual(decodedStr, sampleStr);
console.log('✓ ASCII string packing/unpacking passed.');

console.log('\nAll Decoder tests passed successfully!');
