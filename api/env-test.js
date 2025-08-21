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
  
  // Check which environment variables are available
  const envVars = {
    // Mistral
    VITE_MISTRAL: Boolean(process.env.VITE_MISTRAL),
    MISTRAL_API_KEY: Boolean(process.env.MISTRAL_API_KEY),
    MISTRAL: Boolean(process.env.MISTRAL),
    VITE_MISTRAL_API_KEY: Boolean(process.env.VITE_MISTRAL_API_KEY),
    
    // Recall
    RECALL_API_KEY: Boolean(process.env.RECALL_API_KEY),
    RECALL_KEY: Boolean(process.env.RECALL_KEY),
    RECALL: Boolean(process.env.RECALL),
    RECALL_REGION: process.env.RECALL_REGION || 'not set',
    
    // Deepgram
    VITE_DEEPGRAM_API_KEY: Boolean(process.env.VITE_DEEPGRAM_API_KEY),
    DEEPGRAM_API_KEY: Boolean(process.env.DEEPGRAM_API_KEY),
    DEEPGRAM: Boolean(process.env.DEEPGRAM),
    
    // OpenAI
    VITE_OPEN_AI_API: Boolean(process.env.VITE_OPEN_AI_API),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    OPEN_AI_API: Boolean(process.env.OPEN_AI_API),
    
    // Perplexity
    PERPLEXITY_API_KEY: Boolean(process.env.PERPLEXITY_API_KEY),
    PPLX_API_KEY: Boolean(process.env.PPLX_API_KEY),
    
    // Supabase
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SERVICE_KEY: Boolean(process.env.SERVICE_KEY),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
    
    // Assembly
    ASSEMBLY_API_KEY: Boolean(process.env.ASSEMBLY_API_KEY),
    ASSEMBLYAI_API_KEY: Boolean(process.env.ASSEMBLYAI_API_KEY),
    
    // Check if any env vars start with VITE_
    has_vite_prefix: Object.keys(process.env).some(k => k.startsWith('VITE_')),
    
    // Count total env vars (to see if they're loading at all)
    total_env_vars: Object.keys(process.env).length
  };
  
  return new Response(JSON.stringify(envVars, null, 2), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}