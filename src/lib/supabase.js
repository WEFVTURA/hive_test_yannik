import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Fallbacks to unblock production when envs are missing
const DEFAULT_SUPABASE_URL = 'https://lmrnnfjuytygomdfujhs.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxtcm5uZmp1eXR5Z29tZGZ1amhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE3MjQ3NTMsImV4cCI6MjA2NzMwMDc1M30.BFj_fQyHX-vAwd65RQrZpq0TU2B87BfdRVrIcXuAv10';

export function util_getEnv(key, promptLabel){
  const winVal = window[key];
  if (winVal) return winVal;
  // Vite build-time envs (public) – prefer VITE_ prefix
  try {
    const viteEnv = (typeof import.meta !== 'undefined' && import.meta && import.meta.env) ? import.meta.env : undefined;
    if (viteEnv){
      const viaVitePrefixed = viteEnv['VITE_'+key];
      if (viaVitePrefixed) return viaVitePrefixed;
      const viaViteDirect = viteEnv[key];
      if (viaViteDirect) return viaViteDirect;
    }
  } catch {}
  const lsKey = `HIve_${key}`;
  const fromLs = localStorage.getItem(lsKey);
  if (fromLs) return fromLs;
  // No prompt in modular app; return empty string
  return '';
}

// Cookie helpers for auth persistence
function util_getCookie(name){
  const m = document.cookie.match(new RegExp('(?:^|; )'+name.replace(/[.$?*|{}()\[\]\\\/\+^]/g,'\\$&')+'=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
function util_setCookie(name, value, maxAgeSeconds){
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const attrs = `; Path=/; SameSite=Lax${secure}` + (Number.isFinite(maxAgeSeconds) ? `; Max-Age=${maxAgeSeconds}` : '');
  document.cookie = `${name}=${encodeURIComponent(value||'')}${attrs}`;
}
function util_deleteCookie(name){ util_setCookie(name, '', 0); }

let cachedClient = null;
export function getSupabase(){
  if (cachedClient) return cachedClient;
  let url = util_getEnv('SUPABASE_URL', 'SUPABASE_URL') || DEFAULT_SUPABASE_URL;
  let anon = util_getEnv('SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY') || DEFAULT_SUPABASE_ANON_KEY;
  // Normalize values (trim quotes/spaces)
  if (typeof url === 'string') url = url.trim().replace(/^"|"$/g,'').replace(/^'|'$/g,'');
  if (typeof anon === 'string') anon = anon.trim().replace(/^"|"$/g,'').replace(/^'|'$/g,'');
  try { new URL(url); } catch { url = DEFAULT_SUPABASE_URL; }
  if (!url || !anon){ throw new Error('Supabase URL/ANON KEY missing'); }
  cachedClient = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  // Sync auth to cookies so refreshes stay logged in across tabs and reloads
  cachedClient.auth.onAuthStateChange(async (_event, session)=>{
    if (session?.access_token && session?.refresh_token){
      util_setCookie('sb_access_token', session.access_token, 60*60*24*30);
      util_setCookie('sb_refresh_token', session.refresh_token, 60*60*24*30);
    } else {
      util_deleteCookie('sb_access_token');
      util_deleteCookie('sb_refresh_token');
    }
  });
  return cachedClient;
}

// Auth helpers
export async function auth_getUser(){
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  return data?.user || null;
}

// Attempts to restore a session from cookies if localStorage is empty
export async function auth_restoreFromCookies(){
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (data?.session?.access_token) return data.session.user || null;
  const access = util_getCookie('sb_access_token');
  const refresh = util_getCookie('sb_refresh_token');
  if (access && refresh){
    try { await sb.auth.setSession({ access_token: access, refresh_token: refresh }); } catch {}
  }
  const after = await sb.auth.getUser();
  return after?.data?.user || null;
}
export async function auth_signIn(email, password){
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error; return data.user;
}
export async function auth_signUp(email, password){
  const sb = getSupabase();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error; return data.user;
}
export async function auth_signOut(){
  const sb = getSupabase();
  await sb.auth.signOut();
}

// Profile helpers (use public.profiles if present)
export async function profile_get(userId){
  const sb = getSupabase();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) return null; return data || null;
}
export async function profile_upsert(userId, fields){
  const sb = getSupabase();
  const payload = { id: userId, ...fields };
  if (!payload.email){
    const me = (await sb.auth.getUser()).data.user;
    if (me?.email) payload.email = me.email;
  }
  const { data, error } = await sb.from('profiles').upsert(payload, { onConflict: 'id' }).select('*').single();
  if (error) throw error; return data;
}
export async function profile_uploadAvatar(file){
  const sb = getSupabase();
  const user = (await sb.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');
  const path = `${user.id}/${Date.now()}_${file.name}`;
  const bucket = sb.storage.from('avatars');
  const up = await bucket.upload(path, file, { upsert: true, cacheControl: '3600' });
  if (up.error) throw up.error;
  // If bucket is public, getPublicUrl works; otherwise, generate signed URL
  const pub = bucket.getPublicUrl(path)?.data?.publicUrl || '';
  let url = pub;
  if (!url){
    const signed = await bucket.createSignedUrl(path, 60 * 60 * 24 * 365);
    if (signed.error) throw signed.error; url = signed.data.signedUrl;
  }
  // Save on profile
  await profile_upsert(user.id, { avatar_url: url });
  return url;
}

// DB helpers
export async function db_listSpaces(){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').select('*').order('created_at', { ascending: true });
  if (error) throw error; return data;
}
export async function db_getSpace(id){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').select('*').eq('id', id).single();
  if (error) throw error; return data;
}
export async function db_createSpace(name){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').insert({ name }).select('*').single();
  if (error) throw error; return data;
}
export async function db_updateSpace(id, fields){
  const sb = getSupabase();
  const { data, error } = await sb.from('spaces').update({ ...fields }).eq('id', id).select('*').single();
  if (error) throw error; return data;
}
export async function db_listFiles(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('files').select('*').eq('space_id', spaceId).order('created_at', { ascending: true });
  if (error) throw error; return data;
}
export async function db_listNotes(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').select('*').eq('space_id', spaceId).order('updated_at', { ascending: false });
  if (error) throw error; return data;
}

// Stats helpers (simple, last 30 days)
export async function stats_summary(){
  const sb = getSupabase();
  const since = new Date(Date.now() - 30*24*3600*1000).toISOString();
  const files = (await sb.from('files').select('id, created_at').gte('created_at', since)).data || [];
  const notes = (await sb.from('notes').select('id, created_at').gte('created_at', since)).data || [];
  // Heuristic: notes with titles containing '(transcribing…)' or titles like 'Call ...' likely from transcripts.
  const transcriptNotes = notes.filter(n=>/call|transcrib/i.test(n.title||''));
  // Minutes: estimate by 140 words/min if note has word count; fallback 0. (Simple client-side calc)
  const minutes = transcriptNotes.reduce((acc,n)=>{ const words=(n.content||'').split(/\s+/).filter(Boolean).length; return acc + Math.round(words/140); }, 0);
  return { filesUploaded: files.length, notesCreated: notes.length, transcribedMinutes: minutes, researchRequests: (parseInt(localStorage.getItem('hive_reqs')||'0',10)||0) };
}
export async function db_createNote(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').insert({ space_id: spaceId, title: 'Untitled', content: '' }).select('*').single();
  if (error) throw error; return data;
}
export async function db_updateNote(id, fields){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').update({ ...fields }).eq('id', id).select('*').single();
  if (error) throw error; return data;
}
export async function db_deleteNote(id){
  const sb = getSupabase();
  const { error } = await sb.from('notes').delete().eq('id', id);
  if (error) throw error;
}

// Tags helpers (files/notes) — simple string array column `tags` on tables
export async function db_updateFileTags(id, tags){
  const sb = getSupabase();
  const { data, error } = await sb.from('files').update({ tags }).eq('id', id).select('*').single();
  if (error) throw error; return data;
}
export async function db_updateNoteTags(id, tags){
  const sb = getSupabase();
  const { data, error } = await sb.from('notes').update({ tags }).eq('id', id).select('*').single();
  if (error) throw error; return data;
}

// FTS/BM25 search via RPC
export async function fts_searchNotes(query, spaceId, limit=10){
  const sb = getSupabase();
  const { data, error } = await sb.rpc('fts_search_notes', { p_query: query, p_space: spaceId || null, p_limit: limit });
  if (error) throw error; return data || [];
}

// Shares
export async function db_shareSpace(spaceId, email){
  const sb = getSupabase();
  const { data, error } = await sb.from('space_shares').insert({ space_id: spaceId, email }).select('*').single();
  if (error) throw error; return data;
}
export async function db_listShares(spaceId){
  const sb = getSupabase();
  const { data, error } = await sb.from('space_shares').select('*').eq('space_id', spaceId).order('created_at', { ascending:false });
  if (error) throw error; return data||[];
}

// Chat history (Supabase)
export async function db_listChats(){
  const sb = getSupabase();
  const { data, error } = await sb.from('chats').select('*').order('updated_at', { ascending:false });
  if (error) throw error; return data||[];
}
export async function db_saveChat(row){
  const sb = getSupabase();
  const base = { title: row.title||'Untitled chat', scope: row.scope||'ALL', model: row.model||'Mistral', messages: row.messages||[] };
  if (row.id){
    const { data, error } = await sb.from('chats').update({ ...base, updated_at: new Date().toISOString() }).eq('id', row.id).select('*').single();
    if (error) throw error; return data;
  }
  const { data, error } = await sb.from('chats').insert({ ...base }).select('*').single();
  if (error) throw error; return data;
}
export async function db_deleteChat(id){
  const sb = getSupabase();
  const { error } = await sb.from('chats').delete().eq('id', id);
  if (error) throw error;
}
