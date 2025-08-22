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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
  
  // Get bot_id from query or body
  const url = new URL(req.url);
  const bot_id = url.searchParams.get('bot_id') || '089c5b47-bc78-4aa5-9c9c-de8245c408fe';
  
  try {
    // Check bot mapping
    const mapResp = await fetch(`${SUPABASE_URL}/rest/v1/recall_bots?bot_id=eq.${bot_id}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });
    
    const mappings = await mapResp.json();
    
    // Check notes with this bot_id
    const notesResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?or=(metadata->>bot_id.eq.${bot_id},metadata->>recording_id.eq.${bot_id})&select=id,title,space_id,owner_id,created_at,metadata`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });
    
    const notes = await notesResp.json();
    
    // Get user info if mapped
    let userInfo = null;
    if (mappings?.[0]?.user_id) {
      const userResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${mappings[0].user_id}`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`
        }
      });
      if (userResp.ok) {
        userInfo = await userResp.json();
      }
    }
    
    return jres({
      bot_id,
      mapping: {
        exists: mappings?.length > 0,
        user_id: mappings?.[0]?.user_id || null,
        user_email: userInfo?.email || null,
        created_at: mappings?.[0]?.created_at || null
      },
      notes: {
        count: notes?.length || 0,
        list: notes?.map(n => ({
          id: n.id,
          title: n.title,
          space_id: n.space_id,
          owner_id: n.owner_id,
          bot_id: n.metadata?.bot_id || n.metadata?.recording_id,
          created_at: n.created_at
        }))
      },
      debug: {
        mapping_raw: mappings,
        notes_raw: notes?.slice(0, 2) // First 2 for debugging
      }
    }, 200, cors);
    
  } catch(e) {
    return jres({ 
      error: 'Failed to check bot', 
      details: e.message 
    }, 500, cors);
  }
}