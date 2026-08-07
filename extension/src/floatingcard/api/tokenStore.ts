export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

const KEY = "auth";

// Tokens live in chrome.storage.local (not just in-memory React state) so the side
// panel doesn't lose the session on every reload — the UI's server state (React
// Query) is not the source of truth for auth, storage is.
export async function getStoredAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(KEY);
  return (result[KEY] as StoredAuth | undefined) ?? null;
}

export async function setStoredAuth(auth: StoredAuth): Promise<void> {
  await chrome.storage.local.set({ [KEY]: auth });
}

export async function clearStoredAuth(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
