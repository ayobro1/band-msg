function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const found = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

// Wait for CSRF token to be available (with timeout)
async function waitForCsrfToken(maxWaitMs = 2000): Promise<string> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const token = getCookie('band_chat_csrf');
    if (token) {
      return token;
    }
    // Wait 50ms before checking again
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return '';
}

export async function apiPost(
  path: string,
  payload: Record<string, unknown>,
  method: 'POST' | 'DELETE' = 'POST'
) {
  // Wait for CSRF token to be available
  const csrf = await waitForCsrfToken();
  
  // Debug logging
  if (!csrf) {
    console.warn('CSRF token not found after waiting');
  } else {
    console.log('CSRF token found:', csrf.substring(0, 10) + '...');
  }
  
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  
  // Only add CSRF token if it exists
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
