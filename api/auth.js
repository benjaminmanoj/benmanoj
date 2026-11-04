'use strict';

const crypto = require('crypto');

// Step 1 of the GitHub OAuth web flow: redirect the browser to GitHub's
// authorize endpoint. The client secret is NOT used here (never read), only in
// the callback. See design §13.1.
module.exports = (req, res) => {
  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;

  if (!clientId) {
    // Log the missing-env NAME only, never a value.
    console.error('OAuth not configured: missing env OAUTH_GITHUB_CLIENT_ID');
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('OAuth not configured');
    return;
  }

  // Random state for CSRF hygiene (stateless; not strictly verified in the
  // callback — see design §13.2).
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo',
    redirect_uri: 'https://www.benmanoj.com/api/callback',
    state: state,
  });

  const location = 'https://github.com/login/oauth/authorize?' + params.toString();

  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
};
