// PROPER Meetings Hub with the ORIGINAL nice view
import { getSupabase } from './lib/supabase.js';

// Speaker color palette - consistent colors for each speaker
const SPEAKER_COLORS = [
  '#4CAF50', // Green
  '#2196F3', // Blue  
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#F44336', // Red
  '#00BCD4', // Cyan
  '#FFC107', // Amber
  '#795548', // Brown
  '#607D8B', // Blue Grey
  '#E91E63'  // Pink
];

// Initialize meetings hub
export async function initMeetingsHub() {
  const content = document.getElementById('content');
  
  content.innerHTML = `
    <div style="padding: 24px; max-width: 1400px; margin: 0 auto;">
      <!-- Header -->
      <div style="margin-bottom: 32px;">
        <h1 style="font-size: 32px; margin: 0 0 8px 0;">Meetings Hub</h1>
        <p style="color: var(--muted); margin: 0;">All your meeting transcripts in one place</p>
      </div>
      
      <!-- Action Bar -->
      <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
        <button class="button primary" onclick="window.importNewTranscript()">
          <i data-lucide="plus"></i> Import Transcript
        </button>
        <button class="button" onclick="window.refreshMeetings()">
          <i data-lucide="refresh-cw"></i> Refresh
        </button>
      </div>
      
      <!-- Stats -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
        <div style="background: var(--panel); padding: 20px; border-radius: 12px;">
          <div style="font-size: 28px; font-weight: bold;" id="totalMeetings">-</div>
          <div style="color: var(--muted); margin-top: 4px;">Total Meetings</div>
        </div>
        <div style="background: var(--panel); padding: 20px; border-radius: 12px;">
          <div style="font-size: 28px; font-weight: bold;" id="thisWeek">-</div>
          <div style="color: var(--muted); margin-top: 4px;">This Week</div>
        </div>
        <div style="background: var(--panel); padding: 20px; border-radius: 12px;">
          <div style="font-size: 28px; font-weight: bold;" id="totalHours">-</div>
          <div style="color: var(--muted); margin-top: 4px;">Total Hours</div>
        </div>
      </div>
      
      <!-- Meetings List -->
      <div id="meetingsList">
        <div style="text-align: center; padding: 48px;">
          <div class="loading">Loading meetings...</div>
        </div>
      </div>
    </div>
  `;
  
  // Initialize icons
  if (window.lucide) lucide.createIcons();
  
  // Load meetings
  await loadMeetings();
}

// Load meetings
async function loadMeetings() {
  const listEl = document.getElementById('meetingsList');
  const totalEl = document.getElementById('totalMeetings');
  const weekEl = document.getElementById('thisWeek');
  const hoursEl = document.getElementById('totalHours');
  
  try {
    const token = localStorage.getItem('sb_access_token');
    const response = await fetch('/api/meetings-data', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    
    if (!response.ok) throw new Error('Failed to load meetings');
    
    const data = await response.json();
    const notes = data.notes || [];
    
    // Update stats
    totalEl.textContent = notes.length;
    
    // Calculate this week's meetings
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const thisWeekNotes = notes.filter(n => new Date(n.created_at) > weekAgo);
    weekEl.textContent = thisWeekNotes.length;
    
    // Calculate total hours (estimate based on content length)
    let totalMinutes = 0;
    notes.forEach(n => {
      if (n.content) {
        // Rough estimate: 150 words per minute, average word length 5 chars
        const chars = n.content.length;
        const words = chars / 5;
        const minutes = words / 150;
        totalMinutes += minutes;
      }
    });
    hoursEl.textContent = Math.round(totalMinutes / 60) + 'h';
    
    // Render meetings
    if (notes.length === 0) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 48px; background: var(--panel); border-radius: 12px;">
          <i data-lucide="inbox" style="width: 48px; height: 48px; margin-bottom: 16px; color: var(--muted);"></i>
          <h3>No meetings yet</h3>
          <p style="color: var(--muted);">Import your first transcript to get started</p>
        </div>
      `;
    } else {
      let html = '<div style="display: flex; flex-direction: column; gap: 16px;">';
      
      notes.forEach(note => {
        const date = new Date(note.created_at);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        html += `
          <div style="background: var(--panel); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); transition: all 0.2s;"
               onmouseover="this.style.borderColor='var(--accent)'" 
               onmouseout="this.style.borderColor='var(--border)'">
            <div style="padding: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                  <h3 style="margin: 0 0 8px 0; font-size: 18px;">
                    ${escapeHtml(note.title || 'Untitled Meeting')}
                  </h3>
                  <div style="display: flex; gap: 16px; margin-bottom: 12px;">
                    <span style="color: var(--muted); font-size: 14px;">
                      <i data-lucide="calendar" style="width: 14px; height: 14px; display: inline-block; vertical-align: -2px;"></i>
                      ${dateStr}
                    </span>
                    <span style="color: var(--muted); font-size: 14px;">
                      <i data-lucide="clock" style="width: 14px; height: 14px; display: inline-block; vertical-align: -2px;"></i>
                      ${timeStr}
                    </span>
                  </div>
                  <div style="color: var(--text-secondary); font-size: 14px; line-height: 1.5;">
                    ${getTranscriptPreview(note.content)}
                  </div>
                </div>
                <button class="button primary sm" onclick="window.viewTranscript('${note.id}')">
                  View
                </button>
              </div>
            </div>
          </div>
        `;
      });
      
      html += '</div>';
      listEl.innerHTML = html;
    }
    
    // Re-initialize icons
    if (window.lucide) lucide.createIcons();
    
  } catch(error) {
    console.error('Error loading meetings:', error);
    listEl.innerHTML = `
      <div style="text-align: center; padding: 48px; background: var(--panel); border-radius: 12px;">
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin-bottom: 16px; color: var(--danger);"></i>
        <h3>Error loading meetings</h3>
        <p style="color: var(--muted);">${error.message}</p>
        <button class="button" onclick="window.loadMeetings()" style="margin-top: 16px;">
          Try Again
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
}

// Get transcript preview
function getTranscriptPreview(content) {
  if (!content) return 'No transcript available';
  
  try {
    const data = JSON.parse(content);
    if (Array.isArray(data) && data.length > 0) {
      // Get first few utterances
      const preview = data.slice(0, 2).map(segment => {
        const speaker = segment.speaker || segment.speaker_name || 'Speaker';
        const text = segment.text || (segment.words ? segment.words.map(w => w.text || w.word || w).join(' ') : '');
        return text ? `${speaker}: ${text}` : '';
      }).filter(Boolean).join(' • ');
      
      return preview.substring(0, 200) + (preview.length > 200 ? '...' : '');
    }
  } catch(e) {}
  
  // Fallback to plain text preview
  return content.substring(0, 200) + (content.length > 200 ? '...' : '');
}

// View transcript - THE PROPER NICE VIEW
window.viewTranscript = async function(noteId) {
  const sb = getSupabase();
  const { data: note, error } = await sb
    .from('notes')
    .select('*')
    .eq('id', noteId)
    .single();
    
  if (error || !note) {
    alert('Error loading transcript');
    return;
  }
  
  // Create modal with PROPER formatting
  const modal = document.createElement('div');
  modal.id = 'transcriptModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.95);
    z-index: 10000;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;
  
  // Parse transcript data
  let transcriptHtml = '';
  let speakers = new Map();
  
  try {
    const data = JSON.parse(note.content);
    if (Array.isArray(data)) {
      // Build speaker map
      let colorIndex = 0;
      data.forEach(segment => {
        const speakerName = segment.speaker || segment.speaker_name || segment.participant?.name || 'Unknown';
        if (!speakers.has(speakerName)) {
          speakers.set(speakerName, {
            color: SPEAKER_COLORS[colorIndex % SPEAKER_COLORS.length],
            count: 0
          });
          colorIndex++;
        }
        speakers.get(speakerName).count++;
      });
      
      // Build transcript HTML with PROPER formatting
      transcriptHtml = data.map(segment => {
        const speakerName = segment.speaker || segment.speaker_name || segment.participant?.name || 'Unknown';
        const speaker = speakers.get(speakerName);
        const text = segment.text || (segment.words ? segment.words.map(w => w.text || w.word || w).join(' ') : '');
        
        if (!text.trim()) return '';
        
        return `
          <div style="display: flex; margin-bottom: 24px;">
            <!-- Speaker color bar -->
            <div style="width: 4px; background: ${speaker.color}; margin-right: 16px; border-radius: 2px;"></div>
            
            <!-- Content -->
            <div style="flex: 1;">
              <!-- Speaker name -->
              <div style="font-weight: 600; color: ${speaker.color}; margin-bottom: 8px; font-size: 14px;">
                ${escapeHtml(speakerName)}
              </div>
              
              <!-- Text -->
              <div style="color: var(--text); line-height: 1.6; font-size: 15px;">
                ${escapeHtml(text)}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch(e) {
    // Fallback for plain text
    transcriptHtml = `<pre style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">${escapeHtml(note.content)}</pre>`;
  }
  
  modal.innerHTML = `
    <!-- Header -->
    <div style="background: var(--panel); border-bottom: 1px solid var(--border); padding: 20px 24px;">
      <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="margin: 0; font-size: 24px;">
            <span contenteditable="true" id="editableTitle" style="outline: none;">${escapeHtml(note.title || 'Untitled Meeting')}</span>
          </h2>
          <div style="margin-top: 8px; display: flex; gap: 24px;">
            ${Array.from(speakers.entries()).map(([name, info]) => `
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 12px; height: 12px; background: ${info.color}; border-radius: 50%;"></div>
                <span style="color: var(--muted); font-size: 14px;">${escapeHtml(name)}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="button" onclick="window.copyTranscript('${noteId}')">
            <i data-lucide="copy"></i> Copy
          </button>
          <button class="button" onclick="window.deleteTranscript('${noteId}')">
            <i data-lucide="trash"></i> Delete
          </button>
          <button class="button primary" onclick="document.getElementById('transcriptModal').remove()">
            <i data-lucide="x"></i> Close
          </button>
        </div>
      </div>
    </div>
    
    <!-- Transcript Content -->
    <div style="flex: 1; overflow-y: auto; padding: 32px 24px;">
      <div style="max-width: 900px; margin: 0 auto;">
        ${transcriptHtml}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Initialize icons
  if (window.lucide) lucide.createIcons();
  
  // Save title on edit
  document.getElementById('editableTitle').addEventListener('blur', async function() {
    const newTitle = this.textContent.trim();
    if (newTitle && newTitle !== note.title) {
      const sb = getSupabase();
      await sb.from('notes').update({ title: newTitle }).eq('id', noteId);
    }
  });
};

// Copy transcript
window.copyTranscript = async function(noteId) {
  const sb = getSupabase();
  const { data: note } = await sb.from('notes').select('content').eq('id', noteId).single();
  
  if (note?.content) {
    let text = '';
    try {
      const data = JSON.parse(note.content);
      if (Array.isArray(data)) {
        text = data.map(segment => {
          const speaker = segment.speaker || segment.speaker_name || 'Speaker';
          const content = segment.text || (segment.words ? segment.words.map(w => w.text || w.word || w).join(' ') : '');
          return `${speaker}: ${content}`;
        }).join('\n\n');
      }
    } catch(e) {
      text = note.content;
    }
    
    await navigator.clipboard.writeText(text);
    
    // Show feedback
    const btn = event.target.closest('button');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check"></i> Copied!';
    btn.style.background = 'var(--success)';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.style.background = '';
      if (window.lucide) lucide.createIcons();
    }, 2000);
  }
};

// Delete transcript
window.deleteTranscript = async function(noteId) {
  if (!confirm('Are you sure you want to delete this transcript?')) return;
  
  const sb = getSupabase();
  const { error } = await sb.from('notes').delete().eq('id', noteId);
  
  if (!error) {
    document.getElementById('transcriptModal')?.remove();
    await loadMeetings();
  } else {
    alert('Error deleting transcript');
  }
};

// Import new transcript
window.importNewTranscript = function() {
  window.location.hash = 'meetings/transcript-list';
};


// Refresh meetings
window.refreshMeetings = loadMeetings;
window.loadMeetings = loadMeetings;

// Helper to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Auto-refresh on visibility
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && window.location.hash === '#meetings/hub') {
    loadMeetings();
  }
});