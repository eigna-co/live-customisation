const test = require('node:test');
const assert = require('node:assert/strict');
const { createGetDb } = require('../firebase-functions/firebase-db');

for (const initial of [[], [{ name: '__admin__' }]]) {
  test(`database startup creates a default app when only ${initial.length ? 'an internal named app exists' : 'no apps exist'}`, () => {
    const apps = [...initial]; let initialisations = 0;
    const getDb = createGetDb({ getApps: () => apps,
      initializeApp: () => { initialisations++; const app = { name: '[DEFAULT]' }; apps.push(app); return app; },
      getFirestore: app => { assert.equal(app.name, '[DEFAULT]'); return 'db'; },
    });
    assert.equal(getDb(), 'db'); assert.equal(getDb(), 'db');
    assert.equal(initialisations, 1);
  });
}
test('database startup reuses an existing default app alongside internal apps', () => {
  const defaultApp = { name: '[DEFAULT]' };
  const getDb = createGetDb({ getApps: () => [{ name: '__admin__' }, defaultApp],
    initializeApp: () => { throw new Error('Default app should be reused'); },
    getFirestore: app => { assert.equal(app, defaultApp); return 'db'; },
  });
  assert.equal(getDb(), 'db');
});
