'use strict';

/**
 * Node tests for js-color-picker palette helpers.
 * Implementations duplicated from sidebar/js/js-color-picker.html.
 *
 * Run: npm run test:colorpicker
 */

const assert = require('assert');

function normalizeHex6(value) {
  if (value == null || typeof value !== 'string') return null;
  var s = value.trim();
  if (s.charAt(0) === '#') s = s.slice(1);
  if (s.length === 3) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toUpperCase();
}

var PRESET_SWATCH_HEXES_RAW = [
  '#EE7EA0', '#FFA9BA', '#FFD7D6', '#FF9797', '#EA7D70', '#F65353', '#D20000',
  '#FD5E00', '#F58553', '#FFA07A', '#FBBF9B', '#FFAF6E', '#F59A23', '#FCB55C',
  '#FFCC80', '#FFD6A2', '#EEB649', '#CE8540', '#FEF7B5', '#F6DE6C', '#F7CE15',
  '#BCC07B', '#DBE098', '#C1DB9E', '#91CA57', '#669E63', '#007355', '#007D75',
  '#75B39C', '#ADD2CA', '#D5E2D3', '#7CCED2', '#D5EDF8', '#ABCDDE', '#65C0E6',
  '#1EB0E6', '#03468F', '#7D8BE0', '#B5BEF5', '#CDBDEB', '#E1CEE5', '#EFD5FF',
  '#F6E7FF', '#9A81B0', '#7851A5', '#E6B1D3', '#B19F9A', '#E1CFCA', '#F1ECEA',
  '#E5DACA', '#C9A98D', '#8E715B', '#4F3F3E', '#D2D2D2', '#AAAAAA', '#363636'
];

function buildPresetSwatchHexes() {
  var out = [];
  for (var i = 0; i < PRESET_SWATCH_HEXES_RAW.length; i++) {
    out.push(normalizeHex6(PRESET_SWATCH_HEXES_RAW[i]));
  }
  return out;
}

function rgbToHex(r, g, b) {
  function h2(x) {
    var v = Math.max(0, Math.min(255, Math.round(x)));
    var s = v.toString(16);
    return s.length === 1 ? '0' + s : s;
  }
  return ('#' + h2(r) + h2(g) + h2(b)).toUpperCase();
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var d = max - min;
  var h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h *= 360;
  var s = max === 0 ? 0 : d / max;
  var v = max;
  return { h: h, s: s, v: v };
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  var c = v * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m = v - c;
  var rp;
  var gp;
  var bp;
  if (h < 60) {
    rp = c;
    gp = x;
    bp = 0;
  } else if (h < 120) {
    rp = x;
    gp = c;
    bp = 0;
  } else if (h < 180) {
    rp = 0;
    gp = c;
    bp = x;
  } else if (h < 240) {
    rp = 0;
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    gp = 0;
    bp = c;
  } else {
    rp = c;
    gp = 0;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255)
  };
}

assert.strictEqual(normalizeHex6('#abc'), '#AABBCC');
assert.strictEqual(normalizeHex6('aabbcc'), '#AABBCC');
assert.strictEqual(normalizeHex6('#00FF00'), '#00FF00');
assert.strictEqual(normalizeHex6(''), null);
assert.strictEqual(normalizeHex6(null), null);

var palette = buildPresetSwatchHexes();
assert.strictEqual(palette.length, 56);
assert.strictEqual(palette[0], '#EE7EA0');
assert.strictEqual(palette[55], '#363636');
var hexRe = /^#[0-9A-F]{6}$/;
for (var j = 0; j < palette.length; j++) {
  assert.ok(hexRe.test(palette[j]), 'invalid hex at ' + j + ': ' + palette[j]);
}

function assertRgbRoundtrip(r, g, b) {
  var hsv = rgbToHsv(r, g, b);
  var out = hsvToRgb(hsv.h, hsv.s, hsv.v);
  assert.ok(Math.abs(out.r - r) <= 1, 'r ' + r + ' got ' + out.r);
  assert.ok(Math.abs(out.g - g) <= 1, 'g ' + g + ' got ' + out.g);
  assert.ok(Math.abs(out.b - b) <= 1, 'b ' + b + ' got ' + out.b);
}

assertRgbRoundtrip(255, 0, 0);
assertRgbRoundtrip(0, 255, 0);
assertRgbRoundtrip(0, 0, 255);
assertRgbRoundtrip(110, 12, 12);
assertRgbRoundtrip(128, 128, 128);
assertRgbRoundtrip(0, 0, 0);
assertRgbRoundtrip(255, 255, 255);

console.log('jsColorPicker tests passed');
