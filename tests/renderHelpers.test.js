'use strict';

/**
 * Node tests for insert-button lifecycle in sidebar/js/render-helpers.html.
 * These tests model the same control flow with stubs (no DOM runtime needed).
 */

const assert = require('assert');

function createButton() {
  const classes = {};
  return {
    disabled: false,
    classList: {
      add(name) { classes[name] = true; },
      remove(name) { delete classes[name]; },
      has(name) { return !!classes[name]; }
    }
  };
}

function finalizeInsertButton(btn) {
  btn.disabled = false;
  btn.classList.remove('btn-loading');
}

function runTests() {
  let passed = 0;

  function it(name, fn) {
    fn();
    passed++;
    console.log('✓ ' + name);
  }

  it('re-enables insert button after successful RPC (no follow-up border step)', function () {
    const btn = createButton();
    btn.disabled = true;
    btn.classList.add('btn-loading');
    finalizeInsertButton(btn);
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(btn.classList.has('btn-loading'), false);
  });

  console.log('\nrenderHelpers tests passed: ' + passed);
}

runTests();
