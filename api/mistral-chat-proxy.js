export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }
  
  try {
    const body = await req.json();
    
    // Get Mistral API key from server environment
    const mistralKey = process.env.MISTRAL || 
                       process.env.MISTRAL_API_KEY || 
                       process.env.MISTRAL_AI_API || 
                       process.env.VITE_MISTRAL_API_KEY || '';
    
    if (!mistralKey) {
      return new Response(JSON.stringify({ 
        error: 'Mistral API key not configured on server' 
      }), { 
        status: 500, 
        headers: { ...cors, 'Content-Type': 'application/json' } 
      });
    }
    
    // Forward request to Mistral API
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralKey}`
      },
      body: JSON.stringify({
        model: body.model || 'mistral-large-latest',  // Use mistral-large-latest as default
        messages: body.messages,
        temperature: body.temperature || 0.7,
        max_tokens: body.max_tokens || 4096,
        stream: false
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: data.error || 'Mistral API error' 
      }), { 
        status: response.status, 
        headers: { ...cors, 'Content-Type': 'application/json' } 
      });
    }
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Server error' 
    }), { 
      status: 500, 
      headers: { ...cors, 'Content-Type': 'application/json' } 
    });
  }
}