export const config = { runtime: 'edge' };

function jres(obj, status, headers) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export default async function handler(req) {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jres({ error: 'Missing Supabase configuration' }, 500, cors);
  }

  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  if (!email) {
    return jres({ error: 'Please provide an email parameter, e.g., ?email=user@example.com' }, 400, cors);
  }

  const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // 1. Find user by email
    const userResp = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`, { headers });
    if (!userResp.ok) throw new Error(`Failed to fetch user: ${await userResp.text()}`);
    const users = await userResp.json();
    if (!users || users.length === 0) {
      return jres({ error: 'User not found' }, 404, cors);
    }
    const userId = users[0].id;

    // 2. Find user's bots
    const botsResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?user_id=eq.${userId}&select=bot_id`, { headers });
    if (!botsResp.ok) throw new Error(`Failed to fetch bots: ${await botsResp.text()}`);
    const bots = await botsResp.json();
    if (!bots || bots.length === 0) {
      return jres({ email, userId, message: 'User found, but they have no bots mapped.', meeting_count: 0 }, 200, cors);
    }
    const botIds = bots.map(b => b.bot_id);

    // 3. Count meetings associated with those bots
    // Supabase REST doesn't have a direct COUNT on JSONB queries, so we fetch the IDs and count them.
    // We only need the id column, which is more efficient.
    const notesQuery = `${SUPABASE_URL}/rest/v1/notes?select=id&metadata->>bot_id=in.("${botIds.join('","')}")`;
    const notesResp = await fetch(notesQuery, { headers });
    if (!notesResp.ok) throw new Error(`Failed to fetch notes: ${await notesResp.text()}`);
    const notes = await notesResp.json();
    
    const meetingCount = notes.length;

    return jres({
      email,
      userId,
      found_bots: botIds.length,
      bot_ids: botIds,
      meeting_count: meetingCount
    }, 200, cors);

  } catch (error) {
    console.error('Error in debug-user-meetings:', error);
    return jres({ error: error.message || 'Internal Server Error' }, 500, cors);
  }
}
