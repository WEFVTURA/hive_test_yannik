// Meetings Hub V2 - Clean implementation with working buttons
import { getSupabase } from './lib/supabase.js';

export async function renderMeetingsHubV2(root) {
  // Clear any existing content
  root.innerHTML = '';
  
  // Get auth info
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token || '';
  
  if (!user) {
    root.innerHTML = `
      <div style="padding: 48px; text-align: center;">
        <h2>Please log in to view meetings</h2>
      </div>
    `;
    return;
  }
  
  // Create the UI structure
  root.innerHTML = `
    <div class="meetings-hub-v2">
      <!-- Header -->
      <div class="content-head" style="display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border);">
        <h1 style="margin: 0; font-size: 24px; display: flex; align-items: center; gap: 8px;">
          <i data-lucide="calendar" style="width: 24px; height: 24px;"></i>
          Meetings Hub
        </h1>
        
        <!-- Navigation Buttons -->
        <button class="button ghost" onclick="window.location.hash=''" style="margin-left: 24px;">
          <i data-lucide="arrow-left"></i> Library
        </button>
        
        <button class="button primary" onclick="window.location.hash='transcripts'">
          <i data-lucide="list"></i> Browse Transcripts
        </button>
        
        <button class="button" onclick="window.location.hash='meetings/import'">
          <i data-lucide="upload"></i> Import
        </button>
        
        <button class="button" onclick="window.refreshMeetingsV2()" style="background: var(--success);">
          <i data-lucide="refresh-cw"></i> Refresh
        </button>
        
        <button class="button" onclick="window.debugMeetingsV2()" style="background: var(--warning);">
          <i data-lucide="bug"></i> Debug
        </button>
      </div>
      
      <!-- Stats Bar -->
      <div id="statsBar" style="padding: 16px; background: var(--panel-1); display: flex; gap: 24px;">
        <div>
          <div style="font-size: 12px; color: var(--muted);">Total Meetings</div>
          <div id="totalCount" style="font-size: 20px; font-weight: bold;">-</div>
        </div>
        <div>
          <div style="font-size: 12px; color: var(--muted);">This Week</div>
          <div id="weekCount" style="font-size: 20px; font-weight: bold;">-</div>
        </div>
        <div>
          <div style="font-size: 12px; color: var(--muted);">Status</div>
          <div id="statusText" style="font-size: 14px;">Loading...</div>
        </div>
      </div>
      
      <!-- Main Content -->
      <div id="meetingsContent" style="padding: 24px;">
        <div class="loading">Loading your meetings...</div>
      </div>
    </div>
  `;
  
  // Initialize icons
  if (window.lucide) lucide.createIcons();
  
  // Load meetings data
  await loadMeetingsV2();
}

// Load meetings data
async function loadMeetingsV2() {
  const contentEl = document.getElementById('meetingsContent');
  const statusEl = document.getElementById('statusText');
  const totalEl = document.getElementById('totalCount');
  const weekEl = document.getElementById('weekCount');
  
  try {
    // Get auth token
    const sb = getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || '';
    
    // Fetch from API
    statusEl.textContent = 'Fetching...';
    const response = await fetch('/api/meetings-data', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `API Error: ${response.status}`);
    }
    
    const notes = data.notes || [];
    
    // Update stats
    totalEl.textContent = notes.length;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekNotes = notes.filter(n => new Date(n.created_at) > weekAgo);
    weekEl.textContent = weekNotes.length;
    statusEl.textContent = '✅ Loaded';
    statusEl.style.color = 'var(--success)';
    
    // Display meetings
    if (notes.length === 0) {
      contentEl.innerHTML = `
        <div style="text-align: center; padding: 48px; color: var(--muted);">
          <i data-lucide="inbox" style="width: 64px; height: 64px; margin-bottom: 16px;"></i>
          <h3>No meetings found</h3>
          <p>Import transcripts to see them here</p>
          <button class="button primary" onclick="window.location.hash='meetings/import'" style="margin-top: 16px;">
            Import Transcript
          </button>
        </div>
      `;
    } else {
      // Create meeting cards
      let html = '<div style="display: grid; gap: 16px;">';
      
      notes.forEach(note => {
        const date = new Date(note.created_at).toLocaleDateString();
        const time = new Date(note.created_at).toLocaleTimeString();
        const title = note.title || 'Untitled Meeting';
        const preview = note.content ? note.content.substring(0, 200) + '...' : 'No content';
        
        html += `
          <div style="background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
              <div>
                <h3 style="margin: 0 0 4px 0; font-size: 16px;">${escapeHtml(title)}</h3>
                <div style="font-size: 12px; color: var(--muted);">${date} at ${time}</div>
              </div>
              <button class="button sm" onclick="window.viewMeetingV2('${note.id}')">
                View
              </button>
            </div>
            <div style="font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
              ${escapeHtml(preview)}
            </div>
          </div>
        `;
      });
      
      html += '</div>';
      contentEl.innerHTML = html;
    }
    
    // Re-initialize icons
    if (window.lucide) lucide.createIcons();
    
  } catch (error) {
    console.error('Error loading meetings:', error);
    statusEl.textContent = '❌ Error';
    statusEl.style.color = 'var(--danger)';
    totalEl.textContent = '0';
    weekEl.textContent = '0';
    
    contentEl.innerHTML = `
      <div style="text-align: center; padding: 48px; color: var(--danger);">
        <i data-lucide="alert-circle" style="width: 64px; height: 64px; margin-bottom: 16px;"></i>
        <h3>Error loading meetings</h3>
        <p>${error.message}</p>
        <button class="button" onclick="window.refreshMeetingsV2()" style="margin-top: 16px;">
          Try Again
        </button>
      </div>
    `;
    
    if (window.lucide) lucide.createIcons();
  }
}

// Refresh function
window.refreshMeetingsV2 = async function() {
  const btn = event?.target?.closest('button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="spinning"></i> Loading...';
  }
  
  await loadMeetingsV2();
  
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh';
    if (window.lucide) lucide.createIcons();
  }
};

// Debug function
window.debugMeetingsV2 = async function() {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token || '';
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999';
  modal.innerHTML = `
    <div style="background:white;color:black;border-radius:12px;padding:24px;max-width:900px;max-height:80vh;overflow-y:auto;width:90%">
      <h2 style="margin-bottom:16px">Debug Information</h2>
      <div id="debugInfo">Loading...</div>
      <button class="button" onclick="this.closest('div').parentElement.remove()" style="margin-top:16px">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  const debugEl = modal.querySelector('#debugInfo');
  let html = '';
  
  // User info
  html += '<h3>User</h3>';
  html += `<pre style="background:#f5f5f5;padding:12px;border-radius:6px">`;
  html += `Email: ${user?.email || 'Not logged in'}\n`;
  html += `ID: ${user?.id || 'N/A'}\n`;
  html += `Has Token: ${token ? 'Yes' : 'No'}`;
  html += `</pre>`;
  
  // Direct DB query
  html += '<h3>Direct Database Query</h3>';
  try {
    const { data: notes, error } = await sb
      .from('notes')
      .select('id, title, owner_id, created_at')
      .eq('owner_id', user?.id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      html += `<pre style="background:#ffebee;padding:12px;border-radius:6px">Error: ${error.message}</pre>`;
    } else {
      html += `<pre style="background:#f5f5f5;padding:12px;border-radius:6px">`;
      html += `Found ${notes?.length || 0} notes\n\n`;
      notes?.forEach((n, i) => {
        html += `${i+1}. ${n.title}\n`;
      });
      html += `</pre>`;
    }
  } catch(e) {
    html += `<pre style="background:#ffebee;padding:12px;border-radius:6px">Error: ${e.message}</pre>`;
  }
  
  // API test
  html += '<h3>API Test</h3>';
  try {
    const resp = await fetch('/api/meetings-data', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const data = await resp.json();
    html += `<pre style="background:#f5f5f5;padding:12px;border-radius:6px">`;
    html += `Status: ${resp.status}\n`;
    html += `Notes: ${data.notes?.length || 0}\n`;
    html += `Mode: ${data.debug?.mode || 'unknown'}`;
    html += `</pre>`;
  } catch(e) {
    html += `<pre style="background:#ffebee;padding:12px;border-radius:6px">API Error: ${e.message}</pre>`;
  }
  
  debugEl.innerHTML = html;
};

// View meeting function
window.viewMeetingV2 = function(noteId) {
  window.location.hash = `space/note/${noteId}`;
};

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auto-refresh on visibility
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.location.hash === '#meetings/hub-v2') {
    loadMeetingsV2();
  }
});