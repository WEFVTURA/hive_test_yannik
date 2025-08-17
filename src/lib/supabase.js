import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export function util_getEnv(key, promptLabel){
  const winVal = window[key];
  if (winVal) return winVal;
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
  const url = util_getEnv('SUPABASE_URL', 'SUPABASE_URL');
  const anon = util_getEnv('SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  if (!url || !anon) throw new Error('Supabase URL/ANON KEY missing');
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
