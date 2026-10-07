// Firebase Functions may register a named internal app before the default app.
// A nonempty getApps() list does not imply that getFirestore() has a default app.
exports.createGetDb = ({ getApps, initializeApp, getFirestore }) => () => {
  const app = getApps().find(candidate => candidate.name === '[DEFAULT]') || initializeApp();
  return getFirestore(app);
};
