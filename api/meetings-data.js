export const config = { runtime: 'edge' };

function jres(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return jres({ error: 'Missing Supabase configuration' }, 500, cors);
  }

  // Temporary debug feature to get user meeting count by email
  const url = new URL(req.url);
  const debugEmail = url.searchParams.get('email');
  if (debugEmail) {
    const headers = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` };
    try {
      // Use Supabase Auth Admin API to lookup user by email
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(debugEmail)}`, { headers });
      if (!userResp.ok) {
        const msg = await userResp.text().catch(()=>'');
        return jres({ error: 'Admin user lookup failed', details: msg }, 500, cors);
      }
      const users = await userResp.json().catch(()=>null);
      const userId = Array.isArray(users) && users[0]?.id ? users[0].id : users?.id || null;
      if (!userId) return jres({ error: 'User not found for email: ' + debugEmail }, 404, cors);

      // Find user's bots
      const botsResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?user_id=eq.${userId}&select=bot_id`, { headers });
      if (!botsResp.ok) {
        const err = await botsResp.text().catch(()=> '');
        return jres({ error: 'Failed to fetch bots', details: err }, 500, cors);
      }
      const bots = await botsResp.json();
      if (!bots || bots.length === 0) return jres({ email: debugEmail, userId, meeting_count: 0, message: 'User has no bots.' }, 200, cors);
      const botIds = bots.map(b => b.bot_id);

      // Count meetings
      const notesQuery = `${SUPABASE_URL}/rest/v1/notes?select=id&metadata->>bot_id=in.("${botIds.join('","')}")`;
      const notesResp = await fetch(notesQuery, { headers });
      if (!notesResp.ok) {
        const err = await notesResp.text().catch(()=> '');
        return jres({ error: 'Failed to fetch notes', details: err }, 500, cors);
      }
      const notes = await notesResp.json();
      return jres({ email: debugEmail, userId, bot_count: botIds.length, meeting_count: notes.length }, 200, cors);
    } catch (e) {
      return jres({ error: 'Error during debug lookup: ' + e.message }, 500, cors);
    }
  }


  // Temporary allowlist while we harden per-user access
  const ALLOWED_EMAILS = ['ggg@fvtura.com'];

  async function getToken(){
    const authz = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (authz.startsWith('Bearer ')) return authz.slice(7).trim();
    const cookie = req.headers.get('cookie') || req.headers.get('Cookie') || '';
    const m = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  async function getUser(){
    try{
      const token = await getToken();
      if (!token) return null;
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
      if (!r.ok) return null; const j = await r.json().catch(()=>null); return j || null;
    }catch{ return null; }
  }

  try {
    const user = await getUser();
    if (!user?.id){
      return jres({ error: 'Forbidden', message: 'Not authenticated' }, 401, cors);
    }
    const userId = user.id;

    // Debug info to help diagnose issues
    const debugInfo = {
      supabase_url: SUPABASE_URL.substring(0, 30) + '...',
      has_service_key: Boolean(SERVICE_KEY),
      timestamp: new Date().toISOString()
    };

    // Strong isolation: fetch notes by owner_id AND bot mappings
    let notes = [];
    let fetchStatus = 200;
    let fetchOk = true;
    
    // First, get all bot IDs mapped to this user
    let userBotIds = [];
    try {
      const botMappingsResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?select=bot_id&user_id=eq.${userId}`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      });
      if (botMappingsResp.ok) {
        const mappings = await botMappingsResp.json();
        userBotIds = mappings.map(m => m.bot_id);
        debugInfo.mapped_bots = userBotIds.length;
      }
    } catch(e) {
      debugInfo.bot_mapping_error = e.message;
    }
    
    try{
      // Build query to get notes by owner_id OR by bot_id in metadata
      let query = `${SUPABASE_URL}/rest/v1/notes?select=*&order=created_at.desc`;
      
      if (userBotIds.length > 0) {
        // Include notes owned by user OR linked to user's bots
        const botConditions = userBotIds.map(id => 
          `metadata->>bot_id.eq.${id},metadata->>recording_id.eq.${id}`
        ).join(',');
        query += `&or=(owner_id.eq.${userId},${botConditions})`;
      } else {
        // Just get notes owned by user
        query += `&owner_id=eq.${userId}`;
      }
      
      const byOwner = await fetch(query, { 
        headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } 
      });
      fetchStatus = byOwner.status;
      fetchOk = byOwner.ok;
      if (byOwner.ok){ 
        notes = await byOwner.json().catch(()=>[]); 
        debugInfo.mode='owner_and_bots'; 
      }
    }catch(e){
      debugInfo.fetch_error = e.message;
    }
    
    if (!Array.isArray(notes) || notes.length===0){
      // Optional fallback: look for a user-owned Meetings space and scope to it
      let meetingsSpaceId = '';
      try{
        const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=eq.Meetings&owner_id=eq.${userId}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
        const spaces = await spacesResp.json().catch(() => []);
        if (Array.isArray(spaces) && spaces.length > 0){ 
          meetingsSpaceId = spaces[0].id; 
          debugInfo.space_source='owner_meetings'; 
        }
      }catch{}
      
      if (meetingsSpaceId){
        const notesResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=*&space_id=eq.${meetingsSpaceId}&order=created_at.desc`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
        fetchStatus = notesResp.status;
        fetchOk = notesResp.ok;
        if (notesResp.ok){ 
          notes = await notesResp.json().catch(()=>[]); 
          debugInfo.mode='space_fallback'; 
        }
      }
    }
    
    debugInfo.notes_fetch_status = fetchStatus;
    debugInfo.notes_fetch_ok = fetchOk;
    
    debugInfo.notes_type = Array.isArray(notes) ? 'array' : typeof notes;
    debugInfo.notes_count = Array.isArray(notes) ? notes.length : 0;
    
    // Add some sample note info for debugging
    if (Array.isArray(notes) && notes.length > 0) {
      debugInfo.sample_note = {
        id: notes[0].id,
        title: notes[0].title?.substring(0, 50),
        content_length: notes[0].content?.length || 0,
        created_at: notes[0].created_at
      };
    }

    return jres({ success: true, notes: Array.isArray(notes) ? notes : [], total: Array.isArray(notes) ? notes.length : 0, debug: debugInfo }, 200, cors);

  } catch (error) {
    return jres({ 
      error: 'Failed to fetch meeting data', 
      message: error.message,
      notes: []
    }, 500, cors);
  }
}

