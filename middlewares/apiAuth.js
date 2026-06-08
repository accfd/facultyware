/**
 * middlewares/apiAuth.js
 * Middleware autentikasi API key untuk REST API endpoint.
 * API key dikirim via header: X-API-KEY
 */

const apiAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};

module.exports = { apiAuth };
