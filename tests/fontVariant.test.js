'use strict';

/**
 * Node tests for Google Fonts variant token parsing (parity with FontService.parseGoogleFontVariant).
 * Run: npm run test:font
 */

const assert = require('assert');

function parseGoogleFontVariant(token) {
  if (token == null || typeof token !== 'string') return { weight: 400, italic: false };
  var t = token.replace(/\s/g, '');
  if (t === '') return { weight: 400, italic: false };
  if (t === 'regular') return { weight: 400, italic: false };
  if (t === 'italic') return { weight: 400, italic: true };
  var italic = /italic$/i.test(t);
  if (italic) t = t.replace(/italic$/i, '');
  var w = parseInt(t, 10);
  if (!isNaN(w)) return { weight: w, italic: italic };
  return { weight: 400, italic: false };
}

function pickDefaultRegularVariant(variants) {
  if (!variants || !variants.length) return 'regular';
  if (variants.indexOf('regular') >= 0) return 'regular';
  for (var i = 0; i < variants.length; i++) {
    var p = parseGoogleFontVariant(variants[i]);
    if (p.weight === 400 && !p.italic) return variants[i];
  }
  return variants[0];
}

function buildGoogleFontsPreviewHref(family, variantTokens) {
  var famEnc = family.replace(/ /g, '+');
  var pairSet = {};
  var hasItal = false;
  var hasRom = false;
  for (var i = 0; i < variantTokens.length; i++) {
    var p = parseGoogleFontVariant(variantTokens[i]);
    if (p.italic) hasItal = true;
    else hasRom = true;
    var pair = (p.italic ? 1 : 0) + ',' + p.weight;
    pairSet[pair] = true;
  }
  var pairs = Object.keys(pairSet).sort(function (a, b) {
    var aa = a.split(',');
    var bb = b.split(',');
    if (aa[0] !== bb[0]) return parseInt(aa[0], 10) - parseInt(bb[0], 10);
    return parseInt(aa[1], 10) - parseInt(bb[1], 10);
  });
  if (!hasItal) {
    var wOnly = [];
    for (var j = 0; j < pairs.length; j++) {
      wOnly.push(pairs[j].split(',')[1]);
    }
    return 'https://fonts.googleapis.com/css2?family=' + famEnc + ':wght@' + wOnly.join(';') + '&display=swap';
  }
  if (!hasRom) {
    var italOnly = pairs.map(function (pr) { return '1,' + pr.split(',')[1]; });
    return 'https://fonts.googleapis.com/css2?family=' + famEnc + ':ital,wght@' + italOnly.join(';') + '&display=swap';
  }
  return 'https://fonts.googleapis.com/css2?family=' + famEnc + ':ital,wght@' + pairs.join(';') + '&display=swap';
}

var passed = 0;
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name, e.message);
    process.exitCode = 1;
  }
}

console.log('fontVariant');
it('regular → 400 roman', function () {
  var p = parseGoogleFontVariant('regular');
  assert.strictEqual(p.weight, 400);
  assert.strictEqual(p.italic, false);
});
it('italic → 400 italic', function () {
  var p = parseGoogleFontVariant('italic');
  assert.strictEqual(p.weight, 400);
  assert.strictEqual(p.italic, true);
});
it('700 → 700 roman', function () {
  var p = parseGoogleFontVariant('700');
  assert.strictEqual(p.weight, 700);
  assert.strictEqual(p.italic, false);
});
it('700italic → 700 italic', function () {
  var p = parseGoogleFontVariant('700italic');
  assert.strictEqual(p.weight, 700);
  assert.strictEqual(p.italic, true);
});
it('preview href roman weights only', function () {
  var h = buildGoogleFontsPreviewHref('Amiri', ['regular', '700']);
  assert.ok(h.indexOf('family=Amiri') > 0 && h.indexOf(':wght@') > 0, h);
});
it('preview href mixed roman and italic', function () {
  var h = buildGoogleFontsPreviewHref('Amiri', ['regular', 'italic']);
  assert.ok(h.indexOf('ital,wght@') > 0, h);
});
it('pickDefaultRegularVariant prefers regular token', function () {
  assert.strictEqual(pickDefaultRegularVariant(['700', 'regular', 'italic']), 'regular');
});
it('pickDefaultRegularVariant uses first 400 roman when regular missing', function () {
  assert.strictEqual(pickDefaultRegularVariant(['300', '400', '700']), '400');
});
it('pickDefaultRegularVariant falls back to first token', function () {
  assert.strictEqual(pickDefaultRegularVariant(['700', '800']), '700');
});
it('pickDefaultRegularVariant empty → regular', function () {
  assert.strictEqual(pickDefaultRegularVariant([]), 'regular');
});

console.log('fontVariant:', passed, 'passed');
