export const config = { runtime: 'edge' };

function jres(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jres({ error: 'Method Not Allowed' }, 405, cors);
  
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jres({ error: 'Missing Supabase configuration' }, 500, cors);
  }

  async function getToken() {
    const authz = req.headers.get('authorization') || '';
    if (authz.startsWith('Bearer ')) return authz.slice(7).trim();
    return null;
  }

  async function getUser() {
    try {
      const token = await getToken();
      if (!token) return null;
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch {
      return null;
    }
  }

  try {
    const user = await getUser();
    if (!user?.id) {
      return jres({ error: 'Unauthorized' }, 401, cors);
    }
    const userId = user.id;

    const { note_id } = await req.json();
    if (!note_id) {
      return jres({ error: 'note_id is required' }, 400, cors);
    }
    
    // Perform delete, ensuring user owns the note.
    // The RLS policy should enforce this, but an explicit check is good practice.
    const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=eq.${note_id}&owner_id=eq.${userId}`, {
        method: 'DELETE',
        headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json'
        }
    });

    if (deleteResponse.status === 204) { // 204 No Content is success for DELETE
        return jres({ success: true }, 200, cors);
    } else {
        const errorData = await deleteResponse.json().catch(() => null);
        console.error('Supabase delete error:', errorData);
        // Check if the item was not found vs. a real error. 
        // A GET before DELETE might be safer but adds latency.
        // For now, we assume if it's not a 204, something went wrong, possibly RLS failure.
        return jres({ error: 'Failed to delete transcript', details: errorData?.message }, deleteResponse.status, cors);
    }

  } catch (error) {
    console.error('Error in delete-note:', error);
    return jres({ error: error.message || 'Internal Server Error' }, 500, cors);
  }
}


