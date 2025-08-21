/**
 * Direct browser-to-Deepgram API implementation
 * Bypasses Vercel and Supabase entirely for audio transcription
 */

export async function transcribeDirectWithDeepgram(file, options = {}) {
  const {
    apiKey = window.DEEPGRAM_API_KEY || localStorage.getItem('deepgram_key') || 'd07d3f107acd0c8e6b9faf97ed1ff8295b900119',
    onProgress = () => {},
    model = 'nova-2',
    language = 'en'
  } = options;

  // Build query parameters for Deepgram
  const params = new URLSearchParams({
    model,
    smart_format: 'true',
    punctuate: 'true',
    paragraphs: 'true',
    diarize: 'true',
    utterances: 'true',
    language,
    filler_words: 'false',
    numerals: 'true'
  });

  const url = `https://api.deepgram.com/v1/listen?${params.toString()}`;

  // Prepare the request
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Token ${apiKey}`);
    
    // Set content type based on file type
    let contentType = file.type || 'audio/*';
    
    // Map common types for better compatibility
    const typeMap = {
      'audio/x-m4a': 'audio/mp4',
      'audio/m4a': 'audio/mp4',
      'application/octet-stream': 'audio/*'
    };
    
    if (typeMap[contentType]) {
      contentType = typeMap[contentType];
    }
    
    xhr.setRequestHeader('Content-Type', contentType);
    
    // Track upload progress
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress({ 
          stage: 'uploading', 
          progress: percentComplete,
          loaded: e.loaded,
          total: e.total
        });
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          
          // Process the response
          const result = processDeepgramResponse(response);
          
          onProgress({ stage: 'complete', progress: 100 });
          resolve(result);
        } catch (error) {
          reject(new Error('Failed to parse Deepgram response'));
        }
      } else if (xhr.status === 401) {
        reject(new Error('Invalid API key. Please check your Deepgram API key.'));
      } else if (xhr.status === 413) {
        reject(new Error('File too large. Maximum size is 2GB for Deepgram.'));
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(new Error(errorData.err_msg || `Deepgram error: ${xhr.status}`));
        } catch {
          reject(new Error(`Deepgram error: ${xhr.status}`));
        }
      }
    };
    
    xhr.onerror = () => {
      // CORS error or network issue
      reject(new Error('Network error. This might be a CORS issue. Consider using the proxy endpoint for production.'));
    };
    
    // Send the file directly
    xhr.send(file);
  });
}

/**
 * Process Deepgram response to extract transcript with speakers
 */
function processDeepgramResponse(data) {
  const result = {
    text: '',
    speaker_transcript: '',
    formatted_transcript: '',
    utterances: null,
    paragraphs: null,
    metadata: {},
    has_speakers: false
  };
  
  // Extract metadata
  if (data?.metadata) {
    result.metadata = {
      duration: data.metadata.duration,
      channels: data.metadata.channels,
      request_id: data.metadata.request_id,
      created: data.metadata.created
    };
  }
  
  // Get utterances for speaker diarization
  if (data?.results?.utterances && data.results.utterances.length > 0) {
    result.utterances = data.results.utterances;
    result.has_speakers = true;
    
    // Format transcript with speakers
    result.speaker_transcript = data.results.utterances
      .map(u => `Speaker ${u.speaker}: ${u.transcript}`)
      .join('\n\n');
  }
  
  // Get regular transcript
  const channel = data?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  
  if (alternative) {
    result.text = alternative.transcript || '';
    
    // Get formatted transcript with paragraphs
    if (alternative.paragraphs?.transcript) {
      result.formatted_transcript = alternative.paragraphs.transcript;
      result.paragraphs = alternative.paragraphs.paragraphs;
    }
  }
  
  // Use best available transcript
  if (!result.text && result.formatted_transcript) {
    result.text = result.formatted_transcript;
  }
  if (!result.text && result.speaker_transcript) {
    result.text = result.speaker_transcript;
  }
  
  return result;
}

/**
 * Alternative: Use a proxy endpoint if direct access fails due to CORS
 */
export async function transcribeViaProxy(file, options = {}) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/deepgram-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey || window.DEEPGRAM_API_KEY || ''}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Smart transcribe that tries direct first, falls back to proxy
 */
export async function smartTranscribe(file, options = {}) {
  const { onProgress = () => {}, preferProxy = false } = options;
  
  // Check file size (Deepgram max is 2GB)
  const MAX_SIZE = 2 * 1024 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('File too large. Maximum size is 2GB.');
  }
  
  // For small files or if proxy is preferred, use proxy
  const PROXY_THRESHOLD = 4 * 1024 * 1024; // 4MB (under Vercel's limit)
  
  if (preferProxy || file.size < PROXY_THRESHOLD) {
    console.log('Using proxy for transcription (file size:', formatFileSize(file.size), ')');
    return transcribeViaProxy(file, options);
  }
  
  // For larger files, try direct first
  console.log('Attempting direct Deepgram transcription (file size:', formatFileSize(file.size), ')');
  
  try {
    return await transcribeDirectWithDeepgram(file, options);
  } catch (error) {
    if (error.message.includes('CORS') || error.message.includes('Network')) {
      console.warn('Direct transcription failed, falling back to proxy:', error.message);
      
      // If file is too large for proxy, we're stuck
      if (file.size > PROXY_THRESHOLD) {
        throw new Error(`File too large for proxy (${formatFileSize(file.size)}). Maximum proxy size is 4MB. Direct API access blocked by CORS.`);
      }
      
      return transcribeViaProxy(file, options);
    }
    throw error;
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export { formatFileSize };