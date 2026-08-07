/**
 * The spec named chrome.identity.getAuthToken, but that call only ever yields an
 * OAuth *access* token, not an OIDC *ID* token — and the backend (by design, see
 * spec) verifies a Google ID token via google-auth-library's audience-checked
 * verifyIdToken. chrome.identity.launchWebAuthFlow with response_type=id_token is
 * the correct call in the chrome.identity namespace for that — same permission
 * ("identity"), same manifest oauth2 client_id, no extra host_permissions.
 */
export async function signInWithGoogle(): Promise<string> {
  const clientId = chrome.runtime.getManifest().oauth2?.client_id;
  if (!clientId) {
    throw new Error("manifest oauth2.client_id is not configured");
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const nonce = crypto.randomUUID();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "id_token");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "openid email");
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("prompt", "select_account");

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
  if (!resultUrl) {
    throw new Error("Google sign-in was cancelled");
  }

  const fragment = new URL(resultUrl).hash.slice(1);
  const idToken = new URLSearchParams(fragment).get("id_token");
  if (!idToken) {
    throw new Error("Google sign-in did not return an ID token");
  }

  return idToken;
}
