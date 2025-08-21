export const config = { runtime: 'edge' };

function jres(obj, status){ return new Response(JSON.stringify(obj), { status, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' } }); }

export default async function handler(req){
  if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:{ 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' } });
  if (req.method !== 'POST') return jres({ error:'method_not_allowed' }, 405);
  try{
    const { id, summary } = await req.json();
    if (!id || !summary) return jres({ error:'missing_params', details:'id and summary required' }, 400);
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('Missing Supabase config:', { 
        hasUrl: Boolean(SUPABASE_URL), 
        hasKey: Boolean(SERVICE_KEY) 
      });
      return jres({ error:'missing_supabase_config', hasUrl: Boolean(SUPABASE_URL), hasKey: Boolean(SERVICE_KEY) }, 500);
    }
    // First check if the note exists
    const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=eq.${encodeURIComponent(id)}&select=id,title`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const checkData = await checkResp.json().catch(() => []);
    
    if (!Array.isArray(checkData) || checkData.length === 0) {
      return jres({ error: 'note_not_found', id }, 404);
    }
    
    // For now, store summary in the content field with a marker
    // Since the notes table might not have a summary column
    const noteResp = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=eq.${encodeURIComponent(id)}&select=content`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    const noteData = await noteResp.json().catch(() => []);
    const currentContent = noteData[0]?.content || '';
    
    // Add summary at the beginning with a marker
    const updatedContent = `## AI Summary\n${summary}\n\n---\n\n${currentContent}`;
    
    const r = await fetch(`${SUPABASE_URL}/rest/v1/notes?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ content: updatedContent })
    });
    if (!r.ok) {
      const errorText = await r.text().catch(() => '');
      console.error('Save summary failed:', r.status, errorText);
      return jres({ error:'save_failed', status:r.status, details: errorText.slice(0, 200) }, 500);
    }
    return jres({ ok:true }, 200);
  }catch(e){ 
    console.error('Save summary error:', e);
    return jres({ error:'failed', message:String(e) }, 500); 
  }
}


