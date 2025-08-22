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
  };
  
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jres({ error:'Method not allowed' }, 405, cors);
  
  // Temporary allowlist
  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || '';
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
      const token = await getToken(); if (!token) return null;
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey: SERVICE_KEY, Authorization:`Bearer ${token}` } });
      if (!r.ok) return null; return await r.json();
    }catch{ return null; }
  }
  const user = await getUser();
  const email = (user?.email||'').toLowerCase();
  if (!email || !ALLOWED_EMAILS.includes(email)){
    return jres({ error: 'Forbidden', message: 'Access denied' }, 403, cors);
  }
  const userId = user?.id || '';

  try {
    const { transcripts } = await req.json();
    
    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      return jres({ error: 'No transcripts provided' }, 400, cors);
    }
    
    // SUPABASE_URL and SERVICE_KEY declared above
    
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
    
    // Process each transcript
    const results = {
      imported: 0,
      failed: 0,
      errors: []
    };
    
    for (const transcript of transcripts) {
      try {
        const { title, content, source = 'batch' } = transcript;
        
        if (!title || !content) {
          results.failed++;
          results.errors.push(`Missing title or content for transcript`);
          continue;
        }
        
        // Check for duplicates
        const checkResp = await fetch(
          `${SUPABASE_URL}/rest/v1/notes?select=id&space_id=eq.${spaceId}&title=ilike.${encodeURIComponent(title)}`,
          { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
        );
        const existing = await checkResp.json().catch(() => []);
        
        if (existing.length > 0) {
          results.failed++;
          results.errors.push(`Duplicate: ${title}`);
          continue;
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
            ...(userId ? { owner_id: userId } : {}),
            title: `[${source}] ${title}`,
            content: content
          })
        });
        
        if (saveResp.ok) {
          results.imported++;
        } else {
          results.failed++;
          const error = await saveResp.text();
          results.errors.push(`Failed to save "${title}": ${error.substring(0, 100)}`);
        }
        
      } catch(e) {
        results.failed++;
        results.errors.push(`Error processing transcript: ${e.message}`);
      }
    }
    
    return jres({
      success: true,
      total: transcripts.length,
      imported: results.imported,
      failed: results.failed,
      errors: results.errors.slice(0, 10),
      space_id: spaceId
    }, 200, cors);
    
  } catch(e) {
    return jres({ error: 'Batch import failed', details: e.message }, 500, cors);
  }
}