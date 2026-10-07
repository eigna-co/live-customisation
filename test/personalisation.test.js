const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePersonalisation } = require('../firebase-functions/personalisation');
const { _test } = require('../firebase-functions/redemption');
const event = require('../firebase-functions/event-config.json');
const product = event.products[0];
const details = {
  name: 'Jane Tan', company: 'Example', email: 'jane@example.com',
  phone: '+6591234567', gift: product.name, font: 'times-new-roman', decoration: 'Jane',
};

test('accepts one to five letters and preserves casing for all three selected fonts', () => {
  for (const font of product.personalisation.fonts) {
    for (const name of ['A', 'Jane', 'Alice', 'Émil', '王明']) {
      const result = validatePersonalisation(product, name, font.id);
      assert.equal(result.decoration, name);
      assert.equal(result.font.name, font.name);
    }
  }
});

test('rejects overlong names, blank names, symbols, numbers and unapproved fonts server-side', () => {
  for (const decoration of ['Robert', '', '   ', 'A B', 'Jane1', '<svg>', 'Jane\nTan', '😊']) {
    assert.equal(_test.validateRedemption({ ...details, decoration }), null);
  }
  for (const font of ['viner-hand', 'arbitrary-css', null, undefined]) {
    assert.equal(_test.validateRedemption({ ...details, font }), null);
  }
});

test('normalises surrounding whitespace and decomposed accented letters', () => {
  assert.equal(validatePersonalisation(product, ' E\u0301mil ', 'times-new-roman').decoration, 'Émil');
});

test('rejects removed products even if the name and font are otherwise valid', () => {
  for (const gift of ['Coffee Tumbler', 'Notebook', 'NETS Prepaid Card']) {
    assert.equal(_test.validateRedemption({ ...details, gift }), null);
  }
});
