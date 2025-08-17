export async function extractPdfText(file){
  try{
    // Load pdf.js and configure worker to avoid 404s loading pdf.worker
    // Prefer jsDelivr +esm shim; fall back to esm.sh. Use minified worker to avoid 404
    let pdfjsLib;
    try{ pdfjsLib = await import(/* @vite-ignore */ 'https://esm.sh/pdfjs-dist@3.11.174?bundle'); }
    catch{ pdfjsLib = await import(/* @vite-ignore */ 'https://cdn.skypack.dev/pin/pdfjs-dist@v3.11.174-kI0pw1V2I0sKQJQ3WQv7/mode=imports,min/optimized/pdfjs-dist.js'); }
    try{ pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }catch{}
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = '';
    for(let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it=>('str' in it? it.str: '')).join(' ') + '\n';
    }
    return text.trim();
  }catch{ return ''; }
}

export async function extractDocxText(file){
  try{
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const doc = zip.file('word/document.xml');
    if(!doc) return '';
    const xml = await doc.async('string');
    const text = xml.replace(/<w:p[^>]*>/g,'\n').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    return text.trim();
  }catch{ return ''; }
}
