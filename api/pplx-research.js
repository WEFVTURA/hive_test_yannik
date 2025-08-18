export const config = { runtime: 'edge' };

// Uses Perplexity Chat Completions API to run a deeper web-backed research
// Env: PERPLEXITY (preferred) or PPLX or VITE_PERPLEXITY
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  try {
    const { question } = await req.json();
    const apiKey = process.env.PERPLEXITY || process.env.PPLX || process.env.VITE_PERPLEXITY || '';
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'PERPLEXITY key missing on server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const system = `You are a research assistant. Do a deep, multi-step investigation using current sources.
Return a concise report with:
- Summary (bulleted)
- Key insights
- Risks/unknowns
- Recommended next steps
- 6-10 cited links with 1-line notes.
Be factual and avoid speculation.`;

    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'pplx-70b-online',
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: String(question || '') }
        ]
      })
    });
    const data = await resp.json().catch(()=>({}));
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: data?.error?.message || 'Perplexity API error' }), { status: resp.status, headers: { 'Content-Type': 'application/json' } });
    }
    const reply = (data?.choices?.[0]?.message?.content) || '';
    return new Response(JSON.stringify({ reply }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
}


