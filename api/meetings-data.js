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

    // Per-user Meetings space lookup (isolation)
    let meetingsSpaceId = '';
    const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=eq.Meetings&owner_id=eq.${userId}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    
    debugInfo.spaces_fetch_status = spacesResp.status;
    const spaces = await spacesResp.json().catch(() => []);
    debugInfo.spaces_found_exact = spaces.length || 0;
    
    if (Array.isArray(spaces) && spaces.length > 0) {
      meetingsSpaceId = spaces[0].id;
      debugInfo.space_source = 'exact_match';
    } else {
      // Try case-insensitive search (still scoped to owner)
      const spacesResp2 = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=ilike.meetings&owner_id=eq.${userId}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      const spaces2 = await spacesResp2.json().catch(() => []);
      debugInfo.spaces_found_ilike = spaces2.length || 0;
      
      if (Array.isArray(spaces2) && spaces2.length > 0) {
        meetingsSpaceId = spaces2[0].id;
        debugInfo.space_source = 'case_insensitive';
      }
    }

    if (!meetingsSpaceId) {
      return jres({ success: true, space_id: null, notes: [], total: 0, debug: debugInfo }, 200, cors);
    }

    debugInfo.meetings_space_id = meetingsSpaceId;

    // Fetch all notes from the meetings space (implicitly owned by this user)
    const notesResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=*&space_id=eq.${meetingsSpaceId}&order=created_at.desc`, { 
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } 
    });
    
    debugInfo.notes_fetch_status = notesResp.status;
    
    if (!notesResp.ok) {
      const errorText = await notesResp.text();
      debugInfo.notes_error = errorText;
      throw new Error(`Failed to fetch notes: ${notesResp.status} - ${errorText}`);
    }
    
    const notes = await notesResp.json();
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

    return jres({ 
      success: true, 
      space_id: meetingsSpaceId,
      notes: Array.isArray(notes) ? notes : [],
      total: Array.isArray(notes) ? notes.length : 0,
      debug: debugInfo
    }, 200, cors);

  } catch (error) {
    return jres({ 
      error: 'Failed to fetch meeting data', 
      message: error.message,
      notes: []
    }, 500, cors);
  }
}
