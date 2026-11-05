'use strict';

// Step 2 of the GitHub OAuth web flow: exchange the code for an access token
// and hand it to the Decap opener window via an origin-pinned postMessage.
// The client secret is read from process.env ONLY and is never logged nor sent
// to the browser. See design §13.2.

// The single canonical origin the token is posted to (never '*'). The
// vercel.json apex->www redirect guarantees the opener is always this host.
const ALLOWED_ORIGIN = 'https://www.benmanoj.com';

// Build the HTML page that performs the Decap postMessage handshake. The inline
// script posts `authorizing:github` to the opener, verifies the opener's origin
// against ALLOWED_ORIGIN, then posts the success (or error) message targeting
// ONLY that single origin.
function renderHandshake(messageJson) {
  // messageJson is a JSON string already embedded safely as a JS string literal.
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Authorizing…</title></head>
<body>
<script>
(function () {
  var allowedOrigin = ${JSON.stringify(ALLOWED_ORIGIN)};
  var message = ${JSON.stringify(messageJson)};

  function send() {
    if (!window.opener) { return; }
    window.opener.postMessage(message, allowedOrigin);
    window.close();
  }

  function receiveMessage(e) {
    // Fail safe: only continue if the opener is on the single allowed origin.
    if (e.origin !== allowedOrigin) { return; }
    window.removeEventListener('message', receiveMessage, false);
    send();
  }

  window.addEventListener('message', receiveMessage, false);
  // Kick off the handshake: tell the opener we are authorizing.
  if (window.opener) {
    window.opener.postMessage('authorizing:github', allowedOrigin);
  }
})();
</script>
</body>
</html>`;
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

module.exports = async (req, res) => {
  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Names only, never values.
    console.error(
      'OAuth not configured: missing env ' +
        (!clientId ? 'OAUTH_GITHUB_CLIENT_ID ' : '') +
        (!clientSecret ? 'OAUTH_GITHUB_CLIENT_SECRET' : '')
    );
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('OAuth not configured');
    return;
  }

  // Read the authorization code from the query string.
  const url = new URL(req.url, ALLOWED_ORIGIN);
  const code = url.searchParams.get('code');

  if (!code) {
    console.warn('OAuth callback missing code query param');
    sendHtml(res, 400, '<!DOCTYPE html><html><body>Missing code</body></html>');
    return;
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: 'https://www.benmanoj.com/api/callback',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('GitHub token endpoint returned status ' + tokenResponse.status);
      sendHtml(
        res,
        200,
        renderHandshake('authorization:github:error:token endpoint error ' + tokenResponse.status)
      );
      return;
    }

    const data = await tokenResponse.json();

    if (data.error || !data.access_token) {
      // Log GitHub's error code, never the secret.
      console.warn('GitHub OAuth error: ' + (data.error || 'no access_token'));
      sendHtml(
        res,
        200,
        renderHandshake('authorization:github:error:' + (data.error || 'no access_token'))
      );
      return;
    }

    const payload = JSON.stringify({ token: data.access_token, provider: 'github' });
    sendHtml(res, 200, renderHandshake('authorization:github:success:' + payload));
  } catch (err) {
    console.error('OAuth callback network error: ' + (err && err.message ? err.message : 'unknown'));
    sendHtml(res, 200, renderHandshake('authorization:github:error:network error'));
  }
};
