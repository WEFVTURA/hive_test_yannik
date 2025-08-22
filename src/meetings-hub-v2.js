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
        
        <button class="button" onclick="window.open('/src/claim-bot.html', '_blank')" style="background: var(--accent);">
          <i data-lucide="link"></i> Claim Bot
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

// View meeting function - show rich transcript view
window.viewMeetingV2 = async function(noteId) {
  // Get the note data
  const sb = getSupabase();
  const { data: note, error } = await sb
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .single();
    
  if (error || !note) {
    alert('Error loading meeting');
    return;
  }
  
  // Show rich transcript view in a modal
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999;overflow-y:auto;padding:24px;';
  modal.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;background:var(--panel);border-radius:12px;padding:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
        <h2 style="margin:0;font-size:24px;">${escapeHtml(note.title || 'Meeting Transcript')}</h2>
        <button class="button ghost" onclick="this.closest('div[style*=fixed]').remove()">✕ Close</button>
      </div>
      
      <!-- Editable metadata -->
      <div style="background:var(--panel-2);padding:16px;border-radius:8px;margin-bottom:24px;">
        <div style="display:grid;gap:16px;grid-template-columns:1fr 1fr;">
          <div>
            <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">Meeting Title</label>
            <input type="text" value="${escapeHtml(note.title || '')}" 
                   onchange="window.updateMeetingTitle('${noteId}', this.value)"
                   style="width:100%;padding:8px;border:1px solid var(--border);border-radius:4px;background:var(--panel);">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:var(--muted);margin-bottom:4px;">Participants (click to add)</label>
            <div id="speakers-${noteId}" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
              <!-- Speaker tags will be populated here -->
            </div>
            <button class="button sm ghost" onclick="window.addSpeakerTag('${noteId}')">
              + Add Participant
            </button>
          </div>
        </div>
      </div>
      
      <!-- Rich formatted transcript -->
      <div style="background:var(--panel-1);padding:24px;border-radius:8px;max-height:600px;overflow-y:auto;">
        <div id="transcript-${noteId}">
          ${window.formatEnhancedTranscript ? window.formatEnhancedTranscript(note.content, noteId) : formatTranscriptContent(note.content)}
        </div>
      </div>
      
      <!-- Actions -->
      <div style="margin-top:24px;display:flex;gap:12px;">
        <button class="button primary" onclick="window.generateSummaryForNote('${noteId}')">
          Generate Summary
        </button>
        <button class="button" onclick="navigator.clipboard.writeText(document.getElementById('transcript-${noteId}').innerText)">
          Copy Transcript
        </button>
        <button class="button ghost" onclick="window.location.hash='space/note/${noteId}'">
          Open in Space
        </button>
      </div>
      
      <!-- Summary section -->
      <div id="summary-container-${noteId}" style="margin-top:24px;display:none;">
        <h3 style="margin-bottom:12px;">AI Summary</h3>
        <div id="summary-${noteId}" style="background:var(--panel-2);padding:16px;border-radius:8px;border-left:3px solid var(--accent);">
          <!-- Summary will appear here -->
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Initialize speaker tags
  if (window.initializeSpeakerTags) {
    window.initializeSpeakerTags(noteId, note);
  }
  
  // Initialize icons
  if (window.lucide) lucide.createIcons();
};

// Fallback transcript formatting if main formatter not available
function formatTranscriptContent(content) {
  if (!content) return '<p style="color:var(--muted)">No transcript content</p>';
  
  try {
    // Try to parse as JSON for structured data
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      let html = '';
      data.forEach(segment => {
        const speaker = segment.participant?.name || 
                       segment.speaker || 
                       segment.speaker_name || 
                       'Speaker';
        const text = segment.text || 
                    (segment.words ? segment.words.map(w => w.text || w.word || w).join(' ') : '');
        
        if (text) {
          // Color-code speakers
          const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336'];
          const colorIndex = speaker.charCodeAt(0) % colors.length;
          const color = colors[colorIndex];
          
          html += `
            <div style="margin-bottom:16px;padding:12px;background:var(--panel-2);border-radius:8px;border-left:3px solid ${color};">
              <div style="font-weight:600;color:${color};margin-bottom:4px;">${escapeHtml(speaker)}</div>
              <div style="line-height:1.6;">${escapeHtml(text)}</div>
            </div>
          `;
        }
      });
      return html || '<p>No content</p>';
    }
  } catch(e) {
    // Not JSON, display as plain text
  }
  
  // Plain text fallback
  return `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(content)}</pre>`;
};

// Helper function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update meeting title
window.updateMeetingTitle = async function(noteId, newTitle) {
  const sb = getSupabase();
  const { error } = await sb
    .from('notes')
    .update({ title: newTitle })
    .eq('id', noteId);
    
  if (error) {
    console.error('Error updating title:', error);
    alert('Failed to update title');
  }
};

// Initialize speaker tags from note metadata
window.initializeSpeakerTags = function(noteId, note) {
  const container = document.getElementById(`speakers-${noteId}`);
  if (!container) return;
  
  // Parse existing tags from metadata or content
  const metadata = note.metadata || {};
  const speakers = metadata.speakers || [];
  
  // If no speakers in metadata, try to extract from content
  if (speakers.length === 0 && note.content) {
    try {
      const data = JSON.parse(note.content);
      if (Array.isArray(data)) {
        const uniqueSpeakers = new Set();
        data.forEach(segment => {
          const speaker = segment.participant?.name || segment.speaker || segment.speaker_name;
          if (speaker) uniqueSpeakers.add(speaker);
        });
        speakers.push(...Array.from(uniqueSpeakers).map(name => ({ name, email: '', tag: '' })));
      }
    } catch(e) {}
  }
  
  // Render speaker tags
  container.innerHTML = '';
  speakers.forEach((speaker, index) => {
    const tag = document.createElement('div');
    tag.style.cssText = 'background:var(--accent);color:white;padding:4px 12px;border-radius:16px;font-size:14px;display:inline-flex;align-items:center;gap:4px;';
    tag.innerHTML = `
      <span contenteditable="true" onblur="window.updateSpeakerInfo('${noteId}', ${index}, 'name', this.textContent)">${escapeHtml(speaker.name)}</span>
      ${speaker.email ? `<span style="opacity:0.8;font-size:12px;">(${speaker.email})</span>` : ''}
      <button onclick="window.removeSpeakerTag('${noteId}', ${index})" style="background:none;border:none;color:white;cursor:pointer;padding:0;margin-left:4px;">✕</button>
    `;
    container.appendChild(tag);
  });
};

// Add new speaker tag
window.addSpeakerTag = async function(noteId) {
  const name = prompt('Enter participant name:');
  if (!name) return;
  
  const email = prompt('Enter email (optional):') || '';
  const tag = prompt('Enter tag/role (optional):') || '';
  
  const sb = getSupabase();
  const { data: note } = await sb
    .from('notes')
    .select('metadata')
    .eq('id', noteId)
    .single();
    
  const metadata = note?.metadata || {};
  const speakers = metadata.speakers || [];
  speakers.push({ name, email, tag });
  
  const { error } = await sb
    .from('notes')
    .update({ metadata: { ...metadata, speakers } })
    .eq('id', noteId);
    
  if (!error) {
    // Refresh the tags
    const { data: updatedNote } = await sb.from('notes').select('*').eq('id', noteId).single();
    window.initializeSpeakerTags(noteId, updatedNote);
  }
};

// Update speaker info
window.updateSpeakerInfo = async function(noteId, index, field, value) {
  const sb = getSupabase();
  const { data: note } = await sb
    .from('notes')
    .select('metadata')
    .eq('id', noteId)
    .single();
    
  const metadata = note?.metadata || {};
  const speakers = metadata.speakers || [];
  if (speakers[index]) {
    speakers[index][field] = value;
    
    await sb
      .from('notes')
      .update({ metadata: { ...metadata, speakers } })
      .eq('id', noteId);
  }
};

// Remove speaker tag
window.removeSpeakerTag = async function(noteId, index) {
  const sb = getSupabase();
  const { data: note } = await sb
    .from('notes')
    .select('metadata')
    .eq('id', noteId)
    .single();
    
  const metadata = note?.metadata || {};
  const speakers = metadata.speakers || [];
  speakers.splice(index, 1);
  
  const { error } = await sb
    .from('notes')
    .update({ metadata: { ...metadata, speakers } })
    .eq('id', noteId);
    
  if (!error) {
    // Refresh the tags
    const { data: updatedNote } = await sb.from('notes').select('*').eq('id', noteId).single();
    window.initializeSpeakerTags(noteId, updatedNote);
  }
};

// Generate summary for a note
window.generateSummaryForNote = async function(noteId) {
  const summaryContainer = document.getElementById(`summary-container-${noteId}`);
  const summaryDiv = document.getElementById(`summary-${noteId}`);
  
  if (!summaryContainer || !summaryDiv) return;
  
  summaryContainer.style.display = 'block';
  summaryDiv.innerHTML = '<div style="color:var(--muted)">Generating summary...</div>';
  
  try {
    const sb = getSupabase();
    const { data: note } = await sb
      .from('notes')
      .select('content')
      .eq('id', noteId)
      .single();
      
    if (!note?.content) {
      summaryDiv.innerHTML = '<div style="color:var(--danger)">No content to summarize</div>';
      return;
    }
    
    // Call summary API
    const response = await fetch('/api/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sb_access_token')}`
      },
      body: JSON.stringify({ content: note.content })
    });
    
    if (!response.ok) throw new Error('Failed to generate summary');
    
    const { summary } = await response.json();
    
    // Format and display summary
    summaryDiv.innerHTML = `
      <div style="line-height:1.6;">
        ${summary.split('\n').map(line => {
          if (line.startsWith('•') || line.startsWith('-')) {
            return `<div style="margin-left:20px;margin-bottom:8px;">${escapeHtml(line)}</div>`;
          }
          return `<p style="margin-bottom:12px;">${escapeHtml(line)}</p>`;
        }).join('')}
      </div>
    `;
    
    // Save summary to note metadata
    const { data: currentNote } = await sb.from('notes').select('metadata').eq('id', noteId).single();
    const metadata = currentNote?.metadata || {};
    metadata.summary = summary;
    metadata.summary_generated_at = new Date().toISOString();
    
    await sb.from('notes').update({ metadata }).eq('id', noteId);
    
  } catch(error) {
    summaryDiv.innerHTML = `<div style="color:var(--danger)">Error: ${error.message}</div>`;
  }
};

// Enhanced transcript formatter with better speaker colors
window.formatEnhancedTranscript = function(content, noteId) {
  if (!content) return '<p style="color:var(--muted)">No transcript content</p>';
  
  try {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) throw new Error('Invalid format');
    
    // Define a better color palette for speakers
    const speakerColors = {
      default: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFC107', '#795548']
    };
    
    const speakerMap = new Map();
    let colorIndex = 0;
    
    let html = '<div style="font-size:15px;line-height:1.8;">';
    
    data.forEach((segment, i) => {
      const speakerName = segment.participant?.name || 
                         segment.speaker || 
                         segment.speaker_name || 
                         `Speaker ${i+1}`;
      
      // Assign color to speaker if not already assigned
      if (!speakerMap.has(speakerName)) {
        speakerMap.set(speakerName, speakerColors.default[colorIndex % speakerColors.default.length]);
        colorIndex++;
      }
      
      const color = speakerMap.get(speakerName);
      const text = segment.text || 
                  (segment.words ? segment.words.map(w => w.text || w.word || w).join(' ') : '');
      
      if (text.trim()) {
        // Add timestamp if available
        const timestamp = segment.start_time ? 
          `<span style="opacity:0.6;font-size:12px;">[${formatTime(segment.start_time)}]</span>` : '';
        
        html += `
          <div style="margin-bottom:20px;padding:16px;background:var(--panel-2);border-radius:8px;border-left:4px solid ${color};">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="font-weight:600;color:${color};font-size:14px;">${escapeHtml(speakerName)}</span>
              ${timestamp}
            </div>
            <div style="color:var(--text);font-size:15px;line-height:1.7;">${escapeHtml(text)}</div>
          </div>
        `;
      }
    });
    
    html += '</div>';
    
    // Add speaker legend at the top
    if (speakerMap.size > 0) {
      let legend = '<div style="margin-bottom:20px;padding:12px;background:var(--panel-2);border-radius:8px;">';
      legend += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Participants:</div>';
      legend += '<div style="display:flex;flex-wrap:wrap;gap:12px;">';
      
      speakerMap.forEach((color, name) => {
        legend += `
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:12px;height:12px;background:${color};border-radius:50%;"></div>
            <span style="font-size:14px;">${escapeHtml(name)}</span>
          </div>
        `;
      });
      
      legend += '</div></div>';
      html = legend + html;
    }
    
    return html;
    
  } catch(e) {
    // Fallback to basic formatting
    return formatTranscriptContent(content);
  }
};

// Helper to format time in MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Auto-refresh on visibility
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.location.hash === '#meetings/hub-v2') {
    loadMeetingsV2();
  }
});