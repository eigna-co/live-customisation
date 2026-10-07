exports.validatePersonalisation = (product, text, fontId) => {
  if (!product || typeof text !== 'string') return null;
  const rules = product.personalisation;
  const decoration = text.trim().normalize('NFC');
  if (!decoration || (Number.isInteger(rules.maxLetters) && Array.from(decoration).length > rules.maxLetters)) return null;
  if (rules.lettersOnly && !/^\p{L}+$/u.test(decoration)) return null;
  if (/\p{Cc}/u.test(decoration)) return null; // Single-line printable input, not control codes.
  if (rules.disallowHan && /\p{Script=Han}/u.test(decoration)) return null;
  const font = rules.fonts.find((option) => option.id === fontId);
  if (!font) return null;
  return { decoration: rules.preserveCase ? decoration : decoration.toUpperCase(), font };
};
