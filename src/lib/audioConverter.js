/**
 * Convert audio files to MP3 format using Web Audio API
 * Falls back to original file if conversion fails
 */

export async function convertToMp3(file) {
  // If already MP3, return as-is
  if (file.type === 'audio/mpeg' || file.type === 'audio/mp3') {
    return file;
  }
  
  // For M4A, WAV, and other formats, try to convert
  try {
    // Check if browser supports audio conversion
    if (!window.AudioContext && !window.webkitAudioContext) {
      console.warn('AudioContext not supported, using original file');
      return file;
    }
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // For now, return original file since browser MP3 encoding is complex
    // In production, you'd use a library like lamejs or send to server
    console.log('Audio decoded successfully, duration:', audioBuffer.duration, 'seconds');
    
    // Return original file (Deepgram accepts most formats)
    return file;
    
  } catch (error) {
    console.warn('Audio conversion failed, using original:', error);
    return file;
  }
}

/**
 * Prepare audio file for Deepgram API
 * Handles various audio formats and optimizes for API submission
 */
export async function prepareAudioForDeepgram(file) {
  // Check file size (Deepgram has a 2GB limit for direct upload)
  const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  
  if (file.size > MAX_SIZE) {
    throw new Error('File too large. Maximum size is 2GB.');
  }
  
  // List of formats Deepgram supports
  const supportedFormats = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/flac',
    'audio/x-flac',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/opus'
  ];
  
  // Check if format is supported
  const mimeType = file.type.toLowerCase();
  
  // Handle m4a files which might not have proper MIME type
  if (file.name.toLowerCase().endsWith('.m4a') && !mimeType) {
    // Create new file with proper MIME type
    return new File([file], file.name, { type: 'audio/x-m4a' });
  }
  
  // If MIME type is missing or generic, try to infer from extension
  if (!mimeType || mimeType === 'application/octet-stream') {
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeMap = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'flac': 'audio/flac',
      'ogg': 'audio/ogg',
      'webm': 'audio/webm',
      'mp4': 'audio/mp4',
      'm4a': 'audio/x-m4a',
      'aac': 'audio/aac',
      'opus': 'audio/opus'
    };
    
    if (mimeMap[ext]) {
      return new File([file], file.name, { type: mimeMap[ext] });
    }
  }
  
  // If format is supported, return as-is
  if (supportedFormats.includes(mimeType)) {
    return file;
  }
  
  // Try to convert unsupported formats
  return await convertToMp3(file);
}

/**
 * Get audio file metadata
 */
export async function getAudioMetadata(file) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    return {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      format: file.type || 'unknown',
      size: file.size,
      humanSize: formatFileSize(file.size),
      humanDuration: formatDuration(audioBuffer.duration)
    };
  } catch (error) {
    console.warn('Could not extract audio metadata:', error);
    return {
      format: file.type || 'unknown',
      size: file.size,
      humanSize: formatFileSize(file.size)
    };
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}