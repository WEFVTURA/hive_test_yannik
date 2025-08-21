import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type TranscribeReq = { url?: string; space_id?: string; title?: string; api_key?: string };

function buildCors(req: Request): Record<string,string> {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

async function fetchJson(url: string, init: RequestInit){
  const r = await fetch(url, init);
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error((j as any)?.error || JSON.stringify(j));
  return j;
}

serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  let body: TranscribeReq = {};
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400, headers: corsHeaders }); }
  const audioUrl = body.url || '';
  let spaceId = body.space_id || '';
  const title = body.title || 'Audio transcription';
  const API_KEY = body.api_key || Deno.env.get('ASSEMBLYAI_API_KEY') || '';
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!audioUrl) return new Response(JSON.stringify({ error:'url required' }), { status:400, headers:{...corsHeaders,'Content-Type':'application/json'} });
  if (!API_KEY) return new Response(JSON.stringify({ error:'ASSEMBLYAI_API_KEY missing' }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} });
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response(JSON.stringify({ error:'SUPABASE_URL or SERVICE_ROLE missing' }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} });

  if (!spaceId){
    try{
      const q = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id&name=eq.Meetings`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      const arr = await q.json().catch(()=>[]);
      if (Array.isArray(arr) && arr.length) spaceId = arr[0].id;
    }catch{}
  }

  const start = await fetchJson('https://api.assemblyai.com/v2/transcript', {
    method:'POST', headers:{ 'Authorization': API_KEY, 'Content-Type':'application/json' },
    body: JSON.stringify({ audio_url: audioUrl })
  });
  const id = (start as any)?.id || '';
  if (!id) return new Response(JSON.stringify({ error:'start_failed', detail:start }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} });

  const deadline = Date.now() + 120000;
  let transcriptText = '';
  while(Date.now() < deadline){
    await new Promise(r=>setTimeout(r, 2000));
    const st = await fetchJson(`https://api.assemblyai.com/v2/transcript/${id}`, { headers:{ 'Authorization': API_KEY } });
    const status = (st as any)?.status || '';
    if (status === 'completed'){ transcriptText = (st as any).text || ''; break; }
    if (status === 'error'){ return new Response(JSON.stringify({ error:'transcription_error', detail: (st as any)?.error }), { status:500, headers:{...corsHeaders,'Content-Type':'application/json'} }); }
  }
  if (!transcriptText){ return new Response(JSON.stringify({ error:'timeout', id }), { status:504, headers:{...corsHeaders,'Content-Type':'application/json'} }); }

  try{
    await fetchJson(`${SUPABASE_URL}/rest/v1/notes`, {
      method:'POST', headers:{ 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ space_id: spaceId||null, title, content: transcriptText })
    });
  }catch{}

  return new Response(JSON.stringify({ ok:true, transcript: transcriptText, space_id: spaceId||null }), { headers:{...corsHeaders,'Content-Type':'application/json'} });
});


