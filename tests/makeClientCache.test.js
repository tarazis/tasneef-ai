'use strict';

/**
 * Node tests for client/makeClientCache.html (sidebar cache factory).
 * Run: npm run test:client
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CACHE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'makeClientCache.html'),
  'utf8'
).replace(/<script[^>]*>/gi, '').replace(/<\/script>/gi, '');

function mockStatusElement() {
  return {
    classList: {
      _c: new Set(),
      add: function (x) { this._c.add(x); },
      remove: function (x) { this._c.delete(x); }
    },
    innerHTML: '',
    querySelector: function () {
      return { addEventListener: function () {} };
    }
  };
}

function loadFactory(mockDocument) {
  const sandbox = {
    console,
    document: mockDocument,
    fetch: mockDocument.fetch
  };
  vm.createContext(sandbox);
  vm.runInContext(CACHE_SRC, sandbox);
  assert.strictEqual(typeof sandbox.makeClientCache, 'function', 'makeClientCache should be defined');
  return sandbox.makeClientCache;
}

function runTests() {
  const tests = [];

  function it(label, fn) {
    tests.push({ label: label, fn: fn });
  }

  const statusEl = mockStatusElement();
  const doc = {
    getElementById: function (id) {
      assert.strictEqual(id, 'status-x');
      return statusEl;
    }
  };

  it('ensure invokes onReady with raw JSON when parseData omitted', function () {
    const data = { '1:1': { text: 'a' } };
    doc.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve(data); }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/q.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      logLabel: 'test'
    });
    return new Promise(function (resolve, reject) {
      cache.ensure(function (stored) {
        try {
          assert.strictEqual(stored, data);
          assert.strictEqual(cache.lookup(1, 1).text, 'a');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('ensure applies parseData before storing', function () {
    const raw = [{ surahNo: 1, translation: ['hello'] }];
    doc.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve(raw); }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/t.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      parseData: function (arr) {
        const map = {};
        map[arr[0].surahNo + ':1'] = arr[0].translation[0];
        return map;
      },
      logLabel: 'test'
    });
    return new Promise(function (resolve, reject) {
      cache.ensure(function (stored) {
        try {
          assert.strictEqual(stored['1:1'], 'hello');
          assert.strictEqual(cache.lookup(1, 1), 'hello');
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('queues callbacks while loading and fires both after success', function () {
    let resolveJson;
    doc.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return new Promise(function (r) { resolveJson = r; });
        }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/q.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      logLabel: 'test'
    });
    const seq = [];
    cache.ensure(function () { seq.push('a'); });
    cache.ensure(function () { seq.push('b'); });
    return new Promise(function (resolve, reject) {
      setImmediate(function () {
        resolveJson({});
        setImmediate(function () {
          try {
            assert.deepStrictEqual(seq, ['a', 'b']);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  it('loadEdition clears cache and refetches new URL', function () {
    let fetchUrl = '';
    const responses = {
      'https://example.com/first.json': { '1:1': 1 },
      'https://example.com/second.json': { '1:1': 2 }
    };
    doc.fetch = function (url) {
      fetchUrl = url;
      const payload = responses[url];
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve(payload); }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/first.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      logLabel: 'test'
    });
    return new Promise(function (resolve, reject) {
      cache.ensure(function () {
        try {
          assert.strictEqual(cache.lookup(1, 1), 1);
        } catch (e) {
          reject(e);
          return;
        }
        cache.loadEdition('https://example.com/second.json', function () {
          try {
            assert.strictEqual(fetchUrl, 'https://example.com/second.json');
            assert.strictEqual(cache.lookup(1, 1), 2);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  it('loadEdition is no-op when URL matches an already-loaded cache', function () {
    let fetchCount = 0;
    doc.fetch = function () {
      fetchCount++;
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve({ x: 1 }); }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/same.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      logLabel: 'test'
    });
    return new Promise(function (resolve, reject) {
      cache.ensure(function () {
        cache.loadEdition('https://example.com/same.json', function (data) {
          try {
            assert.strictEqual(fetchCount, 1);
            assert.deepStrictEqual(data, { x: 1 });
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  it('parseSurahMetaData converts raw object to sorted surah array', function () {
    const rawObj = {
      '1':   { id: 1,   name_arabic: 'الفاتحة', name_simple: 'Al-Fatihah', verses_count: 7 },
      '2':   { id: 2,   name_arabic: 'البقرة',  name_simple: 'Al-Baqarah', verses_count: 286 },
      '114': { id: 114, name_arabic: 'الناس',   name_simple: 'An-Nas',     verses_count: 6 }
    };
    function parseSurahMetaData(obj) {
      var list = [];
      for (var i = 1; i <= 114; i++) {
        var s = obj[String(i)];
        if (!s) continue;
        list.push({
          number: s.id,
          nameArabic: s.name_arabic || '',
          nameEnglish: s.name_simple || s.name || '',
          ayahCount: s.verses_count || 0
        });
      }
      return list;
    }
    const result = parseSurahMetaData(rawObj);
    assert.strictEqual(result.length, 3);
    assert.deepStrictEqual(result[0], { number: 1, nameArabic: 'الفاتحة', nameEnglish: 'Al-Fatihah', ayahCount: 7 });
    assert.deepStrictEqual(result[1], { number: 2, nameArabic: 'البقرة', nameEnglish: 'Al-Baqarah', ayahCount: 286 });
    assert.deepStrictEqual(result[2], { number: 114, nameArabic: 'الناس', nameEnglish: 'An-Nas', ayahCount: 6 });
  });

  it('parseSurahMetaData falls back to name when name_simple is absent', function () {
    const rawObj = { '5': { id: 5, name_arabic: 'المائدة', name: 'Al-Maidah', verses_count: 120 } };
    function parseSurahMetaData(obj) {
      var list = [];
      for (var i = 1; i <= 114; i++) {
        var s = obj[String(i)];
        if (!s) continue;
        list.push({ number: s.id, nameArabic: s.name_arabic || '', nameEnglish: s.name_simple || s.name || '', ayahCount: s.verses_count || 0 });
      }
      return list;
    }
    const result = parseSurahMetaData(rawObj);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].nameEnglish, 'Al-Maidah');
  });

  it('ensure with parseSurahMetaData stores array accessible via onReady callback', function () {
    const rawObj = {
      '1': { id: 1, name_arabic: 'الفاتحة', name_simple: 'Al-Fatihah', verses_count: 7 }
    };
    doc.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () { return Promise.resolve(rawObj); }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/surah-meta.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      parseData: function (obj) {
        var list = [];
        for (var i = 1; i <= 114; i++) {
          var s = obj[String(i)];
          if (!s) continue;
          list.push({ number: s.id, nameArabic: s.name_arabic || '', nameEnglish: s.name_simple || '', ayahCount: s.verses_count || 0 });
        }
        return list;
      },
      logLabel: 'surah-meta-test'
    });
    return new Promise(function (resolve, reject) {
      cache.ensure(function (list) {
        try {
          assert.ok(Array.isArray(list), 'parsed result should be an array');
          assert.strictEqual(list.length, 1);
          assert.strictEqual(list[0].number, 1);
          assert.strictEqual(list[0].nameEnglish, 'Al-Fatihah');
          assert.strictEqual(list[0].ayahCount, 7);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  });

  it('lookup returns null while JSON pending then returns value', function () {
    let finishJson;
    doc.fetch = function () {
      return Promise.resolve({
        ok: true,
        json: function () {
          return new Promise(function (r) { finishJson = r; });
        }
      });
    };
    const makeClientCache = loadFactory(doc);
    const cache = makeClientCache({
      url: 'https://example.com/q.json',
      statusElId: 'status-x',
      loadingMsg: '…',
      errorMsg: 'err',
      logLabel: 'test'
    });
    cache.ensure(function () {});
    assert.strictEqual(cache.lookup(1, 1), null);
    return new Promise(function (resolve, reject) {
      setImmediate(function () {
        if (typeof finishJson !== 'function') {
          reject(new Error('finishJson not set; json() not yet invoked'));
          return;
        }
        finishJson({ '1:1': 'ok' });
        setImmediate(function () {
          try {
            assert.strictEqual(cache.lookup(1, 1), 'ok');
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  });

  let ran = 0;
  let failed = 0;
  const chain = tests.reduce(function (p, t) {
    return p.then(function () {
      return Promise.resolve(t.fn())
        .then(function () {
          console.log('  ✓ ' + t.label);
          ran++;
        })
        .catch(function (e) {
          console.log('  ✗ ' + t.label + '\n      → ' + (e && e.message ? e.message : e));
          failed++;
        });
    });
  }, Promise.resolve());

  return chain.then(function () {
    console.log('\nmakeClientCache: ' + ran + ' passed, ' + failed + ' failed.');
    if (failed > 0) process.exit(1);
  });
}

runTests();
