export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  
  // Check all possible env var names
  const result = {
    env_vars_checked: {
      MISTRAL_API_KEY: Boolean(process.env.MISTRAL_API_KEY),
      MISTRAL: Boolean(process.env.MISTRAL),
      VITE_MISTRAL_API_KEY: Boolean(process.env.VITE_MISTRAL_API_KEY),
      MISTRAL_AI_API_KEY: Boolean(process.env.MISTRAL_AI_API_KEY)
    },
    key_found: false,
    key_length: 0,
    test_result: null
  };
  
  // Get the key
  const key = process.env.MISTRAL_API_KEY || 
              process.env.MISTRAL || 
              process.env.VITE_MISTRAL_API_KEY || 
              process.env.MISTRAL_AI_API_KEY || '';
  
  result.key_found = Boolean(key);
  result.key_length = key ? key.length : 0;
  
  if (key) {
    // Test the API key with a simple request
    try {
      const response = await fetch('https://api.mistral.ai/v1/models', {
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      
      result.test_result = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      };
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        result.test_result.error = errorText.slice(0, 200);
      } else {
        const data = await response.json();
        result.test_result.models_count = data.data ? data.data.length : 0;
      }
    } catch (e) {
      result.test_result = { error: e.message };
    }
  }
  
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}