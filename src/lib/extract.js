export async function extractPdfText(file){
  try{
    const pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.mjs');
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
