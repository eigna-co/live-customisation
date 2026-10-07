// Use only around idempotent order submissions with the SAME request ID/details.
// Validation, sold-out, duplicate, rate-limit and authentication failures are final.
async function withSubmissionRetry(operation, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await operation(); } catch (error) {
      const transient = error.status === 503 || error.name === 'AbortError' || (error instanceof TypeError && !error.status);
      if (!transient || attempt === 2) throw error;
      await sleep(1000 * 2 ** attempt + Math.floor(random() * 1500));
    }
  }
}
module.exports = { withSubmissionRetry };
