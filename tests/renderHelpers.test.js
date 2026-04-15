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

function finalizeButton(btn) {
  btn.disabled = false;
  btn.classList.remove('btn-loading');
}

function handleInsertSuccess(btn, result, applyPendingBordersFn) {
  applyPendingBordersFn(result, function () {
    finalizeButton(btn);
  });
}

function makeApplyPendingBordersStub(opts) {
  const calls = [];
  const toasts = [];
  return {
    calls,
    toasts,
    fn: function (result, done) {
      calls.push(result);
      if (!result || !result.pendingBorders) {
        done();
        return;
      }
      if (opts && opts.fail) {
        toasts.push("Ayah inserted but styling couldn't be applied — try re-inserting.");
      }
      if (!opts || !opts.deferDone) {
        done();
      } else {
        opts.deferDone(done);
      }
    }
  };
}

function runTests() {
  let passed = 0;

  function it(name, fn) {
    fn();
    passed++;
    console.log('✓ ' + name);
  }

  it('re-enables immediately when no pendingBorders exists', function () {
    const btn = createButton();
    btn.disabled = true;
    btn.classList.add('btn-loading');
    const stub = makeApplyPendingBordersStub();
    handleInsertSuccess(btn, { success: true }, stub.fn);
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(btn.classList.has('btn-loading'), false);
  });

  it('keeps loading state until deferred border callback completes', function () {
    const btn = createButton();
    btn.disabled = true;
    btn.classList.add('btn-loading');
    let releaseDone = null;
    const stub = makeApplyPendingBordersStub({
      deferDone: function (done) {
        releaseDone = done;
      }
    });
    handleInsertSuccess(btn, { pendingBorders: { docId: 'x', tableOrdinal: 1 } }, stub.fn);
    assert.strictEqual(btn.disabled, true);
    assert.strictEqual(btn.classList.has('btn-loading'), true);
    releaseDone();
    assert.strictEqual(btn.disabled, false);
    assert.strictEqual(btn.classList.has('btn-loading'), false);
  });

  it('records styling-failure toast path when border RPC fails', function () {
    const btn = createButton();
    btn.disabled = true;
    btn.classList.add('btn-loading');
    const stub = makeApplyPendingBordersStub({ fail: true });
    handleInsertSuccess(btn, { pendingBorders: { docId: 'x', tableOrdinal: 1 } }, stub.fn);
    assert.strictEqual(stub.toasts.length, 1);
    assert.strictEqual(
      stub.toasts[0],
      "Ayah inserted but styling couldn't be applied — try re-inserting."
    );
    assert.strictEqual(btn.disabled, false);
  });

  console.log('\nrenderHelpers tests passed: ' + passed);
}

runTests();
