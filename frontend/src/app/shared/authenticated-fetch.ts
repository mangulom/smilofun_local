const TOKEN_KEY = "dentamia_token";

/** Fetch protected binary assets with the same bearer token used by HttpClient. */
export function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
