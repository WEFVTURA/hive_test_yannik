#!/usr/bin/env node
import fs from 'fs';

// Read API key from .env.local file
const envContent = fs.readFileSync('.env.local', 'utf-8');
const DEEPGRAM_API_KEY = envContent.match(/DEEPGRAM_API_KEY=(.+)/)?.[1] || 'd07d3f107acd0c8e6b9faf97ed1ff8295b900119';

async function testDeepgramAPI() {
  console.log('Testing Deepgram API connection...\n');
  
  // Test with a sample audio URL
  const testUrl = 'https://static.deepgram.com/examples/interview_speech-analytics.wav';
  
  const params = new URLSearchParams({
    model: 'nova-2',
    smart_format: 'true',
    punctuate: 'true',
    paragraphs: 'true',
    diarize: 'true',
    utterances: 'true',
    language: 'en',
    filler_words: 'false',
    numerals: 'true'
  });
  
  try {
    console.log('Sending request to Deepgram...');
    const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: testUrl })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('❌ API Error:', data);
      return;
    }
    
    console.log('✅ API Response received!\n');
    
    // Check for different response formats
    if (data?.results?.utterances) {
      console.log('Speaker Diarization Found:');
      console.log('=' .repeat(50));
      data.results.utterances.slice(0, 3).forEach(u => {
        console.log(`Speaker ${u.speaker}: ${u.transcript.substring(0, 100)}...`);
      });
      console.log('...\n');
    }
    
    if (data?.results?.channels?.[0]?.alternatives?.[0]) {
      const alt = data.results.channels[0].alternatives[0];
      console.log('Transcript Preview:');
      console.log('=' .repeat(50));
      console.log(alt.transcript.substring(0, 200) + '...\n');
      
      if (alt.paragraphs) {
        console.log('✅ Paragraphs formatting available');
      }
      if (alt.words) {
        console.log(`✅ Word-level timestamps available (${alt.words.length} words)`);
      }
    }
    
    if (data?.metadata) {
      console.log('\nMetadata:');
      console.log('=' .repeat(50));
      console.log(`Duration: ${data.metadata.duration?.toFixed(2)} seconds`);
      console.log(`Channels: ${data.metadata.channels}`);
      console.log(`Request ID: ${data.metadata.request_id}`);
      console.log(`Model: ${data.metadata.models?.[0] || 'nova-2'}`);
    }
    
    // Save full response for inspection
    fs.writeFileSync('deepgram-test-response.json', JSON.stringify(data, null, 2));
    console.log('\n✅ Full response saved to deepgram-test-response.json');
    
  } catch (error) {
    console.error('❌ Error testing Deepgram API:', error);
  }
}

testDeepgramAPI();