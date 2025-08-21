export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return new Response(JSON.stringify({ error:'supabase_env_missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} }); }

  let body={};
  try{ body = await req.json(); }catch{ body={}; }

  const spaceId = (new URL(req.url)).searchParams.get('space_id') || body?.space_id || '';
  const title = (new URL(req.url)).searchParams.get('title') || body?.title || `Deepgram ${new Date().toLocaleString()}`;
  // Enhanced extraction with speaker diarization
  let text = '';
  let metadata = {};
  
  // Try to get speaker-formatted transcript first
  if (body?.results?.utterances && Array.isArray(body.results.utterances)) {
    const speakerTranscript = body.results.utterances
      .map(u => `Speaker ${u.speaker}: ${u.transcript}`)
      .join('\n\n');
    if (speakerTranscript) {
      text = speakerTranscript;
      metadata.has_speakers = true;
    }
  }
  
  // Fallback to paragraphs or regular transcript
  if (!text) {
    text = body?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript
      || body?.results?.channels?.[0]?.alternatives?.[0]?.transcript
      || body?.transcript || '';
  }
  
  // Store additional metadata if available
  if (body?.metadata) {
    metadata.duration = body.metadata.duration;
    metadata.channels = body.metadata.channels;
    metadata.request_id = body.metadata.request_id;
  }

  if (!text){ return new Response(JSON.stringify({ ok:true, saved:false }), { status:200, headers:{...cors,'Content-Type':'application/json'} }); }

  try{
    // Include metadata in the title if we have speaker info
    const enhancedTitle = metadata.has_speakers ? `${title} (with speakers)` : title;
    
    await fetch(`${SUPABASE_URL}/rest/v1/notes`, { 
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json', 
        apikey: SERVICE_KEY, 
        Authorization: `Bearer ${SERVICE_KEY}` 
      }, 
      body: JSON.stringify({ 
        space_id: spaceId || null, 
        title: enhancedTitle, 
        content: text,
        metadata: metadata // Store additional info if your schema supports it
      }) 
    });
  }catch{}

  return new Response(JSON.stringify({ ok:true, saved:true }), { status:200, headers:{...cors,'Content-Type':'application/json'} });
}


