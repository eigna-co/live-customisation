// Keep platform-specific HTTP handling separate from the shared order service.
exports.createHttpHandler = (handler) => async (req, res) => {
  const body = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString('utf8')
    : typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null);
  const result = await handler({
    httpMethod: req.method,
    body,
    // Never forward user-supplied Netlify headers on the Firebase endpoint.
    clientAddress: req.ip || req.socket?.remoteAddress || 'unknown',
    headers: {},
  });
  res.set(result.headers);
  res.status(result.statusCode).send(result.body);
};
