export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const region = (process.env.RECALL_REGION || '').trim();
  const explicitBase = (process.env.RECALL_BASE_URL || '').trim();
  
  const bases = [];
  if (explicitBase) bases.push(explicitBase.replace(/\/$/, ''));
  bases.push('https://api.recall.ai', 'https://app.recall.ai');
  if (region){
    bases.push(`https://api.${region}.recall.ai`, `https://app.${region}.recall.ai`);
    bases.push(`https://${region}.api.recall.ai`, `https://${region}.app.recall.ai`);
  }

  const results = [];
  const headersList = [
    { Authorization:`Token ${RECALL_KEY}`, Accept:'application/json' },
    { 'X-Api-Key': RECALL_KEY, Accept:'application/json' },
  ];

  for (const base of bases) {
    for (const headers of headersList) {
      const url = `${base}/v1/transcripts?status=completed&limit=1`;
      try {
        const resp = await fetch(url, { headers });
        const status = resp.status;
        const location = resp.headers.get('Location') || '';
        let body = '';
        try { body = await resp.text(); } catch {}
        results.push({
          url,
          auth: headers.Authorization ? 'Token' : 'X-Api-Key',
          status,
          location,
          bodySnippet: body.substring(0, 200),
          ok: resp.ok
        });
        if (resp.ok) break; // Found working endpoint
      } catch (err) {
        results.push({
          url,
          auth: headers.Authorization ? 'Token' : 'X-Api-Key',
          error: err.message
        });
      }
    }
  }

  return new Response(JSON.stringify({
    api_key_present: Boolean(RECALL_KEY),
    api_key_length: RECALL_KEY.length,
    region,
    explicit_base: explicitBase,
    results
  }, null, 2), { 
    status: 200, 
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}
