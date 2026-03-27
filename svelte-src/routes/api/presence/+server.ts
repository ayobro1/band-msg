import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updatePresence } from '../../../lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
  const sessionToken = locals.sessionToken;
  
  if (!sessionToken) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { status } = await request.json();
    
    if (!['online', 'idle', 'dnd', 'offline'].includes(status)) {
      return json({ error: 'Invalid status' }, { status: 400 });
    }

    const result = await updatePresence({ sessionToken, status });
    
    if (!result.ok) {
      return json({ error: result.error }, { status: result.code });
    }

    return json({ success: true });
  } catch (error) {
    console.error('Presence update error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
