import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
  // For now, return false since we don't have a database table for subscriptions yet
  // This can be enhanced later to check actual subscription status
  return json({ subscribed: false });
};
