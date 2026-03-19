function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const found = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

export async function apiPost(
  path: string,
  payload: Record<string, unknown>,
  method: 'POST' | 'DELETE' = 'POST'
) {
  const csrf = getCookie('band_chat_csrf');
  
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  
  if (csrf) {
    headers['x-csrf-token'] = csrf;
  }

  return fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(payload),
  });
}

export async function apiGet(path: string) {
  return fetch(path, {
    credentials: 'same-origin',
  });
}
