// Debug endpoint to check transcript format
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  try {
    // Get a sample transcript
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=id,title,content&limit=1&order=created_at.desc`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });
    
    const notes = await resp.json();
    if (!notes?.[0]) {
      return jres({ error: 'No transcripts found' }, 404, cors);
    }
    
    const note = notes[0];
    let contentInfo = {
      id: note.id,
      title: note.title,
      content_length: note.content?.length || 0,
      content_type: typeof note.content,
      content_sample: note.content?.substring(0, 500)
    };
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(note.content);
      contentInfo.is_json = true;
      contentInfo.is_array = Array.isArray(parsed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        contentInfo.first_item = parsed[0];
        contentInfo.item_keys = Object.keys(parsed[0]);
      }
    } catch(e) {
      contentInfo.is_json = false;
      contentInfo.parse_error = e.message;
    }
    
    return jres(contentInfo, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to check format', 
      details: e.message 
    }, 500, cors);
  }
}