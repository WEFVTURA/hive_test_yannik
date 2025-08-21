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

  try {
    // Get meetings space ID by searching for a space named "Meetings"
    let meetingsSpaceId = '';
    
    // Try exact match first
    const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=eq.Meetings`, { 
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } 
    });
    const spaces = await spacesResp.json().catch(() => []);
    
    if (Array.isArray(spaces) && spaces.length > 0) {
      meetingsSpaceId = spaces[0].id;
    } else {
      // Try case-insensitive search
      const spacesResp2 = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=ilike.meetings`, { 
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } 
      });
      const spaces2 = await spacesResp2.json().catch(() => []);
      
      if (Array.isArray(spaces2) && spaces2.length > 0) {
        meetingsSpaceId = spaces2[0].id;
      }
    }

    if (!meetingsSpaceId) {
      return jres({ error: 'Meetings space not found', notes: [] }, 404, cors);
    }

    // Fetch all notes from the meetings space
    const notesResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=*&space_id=eq.${meetingsSpaceId}&order=created_at.desc`, { 
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } 
    });
    
    if (!notesResp.ok) {
      throw new Error(`Failed to fetch notes: ${notesResp.status}`);
    }
    
    const notes = await notesResp.json();

    return jres({ 
      success: true, 
      space_id: meetingsSpaceId,
      notes: Array.isArray(notes) ? notes : [],
      total: Array.isArray(notes) ? notes.length : 0
    }, 200, cors);

  } catch (error) {
    return jres({ 
      error: 'Failed to fetch meeting data', 
      message: error.message,
      notes: []
    }, 500, cors);
  }
}
