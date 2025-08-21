export const config = { runtime: 'edge' };

function jres(obj, status){ return new Response(JSON.stringify(obj), { status, headers:{ 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' } }); }

export default async function handler(req){
  if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:{ 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type' } });
  if (req.method !== 'POST') return jres({ error:'method_not_allowed' }, 405);
  try{
    const { title='', content='' } = await req.json();
    const key = process.env.MISTRAL_API_KEY || process.env.MISTRAL || process.env.VITE_MISTRAL_API_KEY || '';
    if (!key) return jres({ error:'missing_mistral_key' }, 500);
    const prompt = `You are a concise meeting summarizer. Summarize the following meeting transcript into 5 bullet points, include key decisions and action items. Title: ${title}. Transcript (truncated):\n` + String(content).slice(0, 12000);
    const body = { model: 'mistral-large-latest', messages: [ { role:'user', content: prompt } ] };
    const r = await fetch('https://api.mistral.ai/v1/chat/completions', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    if (!r.ok){ return jres({ error:'mistral_failed', status:r.status }, 500); }
    const j = await r.json();
    const summary = j?.choices?.[0]?.message?.content || '';
    return jres({ summary }, 200);
  }catch(e){ return jres({ error:'failed', message:String(e) }, 500); }
}


