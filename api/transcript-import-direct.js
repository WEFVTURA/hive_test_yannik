export const config = { runtime: 'edge' };

function jres(obj, status, cors){ 
  return new Response(JSON.stringify(obj), { 
    status, 
    headers:{ ...(cors||{}), 'Content-Type':'application/json' } 
  }); 
}

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405, cors);
  
  try {
    const { title, content, source = 'manual' } = await req.json();
    
    if (!title || !content) {
      return jres({ error: 'Missing title or content' }, 400, cors);
    }
    
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
    
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return jres({ error: 'Missing configuration' }, 500, cors);
    }
    
    // Get or create Meetings space
    let spaceId = '';
    const spacesResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id,name&name=ilike.meetings`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const spaces = await spacesResp.json().catch(() => []);
    
    if (spaces.length > 0) {
      spaceId = spaces[0].id;
    } else {
      // Create Meetings space
      const createResp = await fetch(`${SUPABASE_URL}/rest/v1/spaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify({ name: 'Meetings', visibility: 'private' })
      });
      const created = await createResp.json().catch(() => ({}));
      spaceId = created?.[0]?.id || created?.id || '';
    }
    
    if (!spaceId) {
      return jres({ error: 'Failed to access Meetings space' }, 500, cors);
    }
    
    // Save the transcript
    const saveResp = await fetch(`${SUPABASE_URL}/rest/v1/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      },
      body: JSON.stringify({
        space_id: spaceId,
        title: `[${source}] ${title}`,
        content: content
      })
    });
    
    if (!saveResp.ok) {
      const error = await saveResp.text();
      return jres({ error: 'Failed to save transcript', details: error }, 500, cors);
    }
    
    const saved = await saveResp.json();
    
    return jres({
      success: true,
      note_id: saved[0]?.id || saved?.id,
      space_id: spaceId,
      message: 'Transcript imported successfully'
    }, 200, cors);
    
  } catch(e) {
    return jres({ error: 'Import failed', details: e.message }, 500, cors);
  }
}