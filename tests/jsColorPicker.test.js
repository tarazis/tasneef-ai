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

function hexToRgb(hex) {
  var n = normalizeHex6(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16)
  };
}

function rgbToHex(r, g, b) {
  function h2(x) {
    var v = Math.max(0, Math.min(255, Math.round(x)));
    var s = v.toString(16);
    return s.length === 1 ? '0' + s : s;
  }
  return ('#' + h2(r) + h2(g) + h2(b)).toUpperCase();
}

function mixRgb(c0, c1, t) {
  return {
    r: c0.r + (c1.r - c0.r) * t,
    g: c0.g + (c1.g - c0.g) * t,
    b: c0.b + (c1.b - c0.b) * t
  };
}

function buildDocStyleSwatchHexes() {
  var out = [];
  var white = { r: 255, g: 255, b: 255 };
  var black = { r: 0, g: 0, b: 0 };
  var i;
  var c;
  var t;
  for (i = 0; i < 10; i++) {
    t = i / 9;
    c = mixRgb(black, white, t);
    out.push(rgbToHex(c.r, c.g, c.b));
  }
  var primaries = [
    '#7F1D1D',
    '#E53935',
    '#FB8C00',
    '#FDD835',
    '#43A047',
    '#00ACC1',
    '#29B6F6',
    '#1E88E5',
    '#8E24AA',
    '#D81B60'
  ];
  for (i = 0; i < primaries.length; i++) {
    out.push(normalizeHex6(primaries[i]));
  }
  for (i = 0; i < primaries.length; i++) {
    c = hexToRgb(primaries[i]);
    c = mixRgb(c, white, 0.88);
    out.push(rgbToHex(c.r, c.g, c.b));
  }
  var shadeSteps = [0.22, 0.38, 0.52, 0.68, 0.82];
  var row;
  var s;
  for (row = 0; row < shadeSteps.length; row++) {
    s = shadeSteps[row];
    for (i = 0; i < primaries.length; i++) {
      c = hexToRgb(primaries[i]);
      c = mixRgb(c, black, s);
      out.push(rgbToHex(c.r, c.g, c.b));
    }
  }
  return out;
}

assert.strictEqual(normalizeHex6('#abc'), '#AABBCC');
assert.strictEqual(normalizeHex6('aabbcc'), '#AABBCC');
assert.strictEqual(normalizeHex6('#00FF00'), '#00FF00');
assert.strictEqual(normalizeHex6(''), null);
assert.strictEqual(normalizeHex6(null), null);

var palette = buildDocStyleSwatchHexes();
assert.strictEqual(palette.length, 80);
var hexRe = /^#[0-9A-F]{6}$/;
for (var j = 0; j < palette.length; j++) {
  assert.ok(hexRe.test(palette[j]), 'invalid hex at ' + j + ': ' + palette[j]);
}

console.log('jsColorPicker tests passed');
