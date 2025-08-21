export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const { prompt, model } = await req.json();
    const apiKey = process.env.MISTRAL || process.env.VITE_MISTRAL || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'MISTRAL env missing on server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'mistral-medium-latest',
        messages: [{ role: 'user', content: String(prompt || '') }]
      })
    });
    const data = await resp.json().catch(()=>({}));
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || 'Mistral API error' }), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
    }
    const reply = (data?.choices?.[0]?.message?.content) || '';
    return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}


