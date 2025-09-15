// Content script: scans page text for blocked keywords and requests background to block if found.
(function(){
  const SCAN_INTERVAL_MS = 4000; // periodic rescans (dynamic pages)
  let blockedKeywords = [];
  let lastBlockedMatch = null;
  let keywordScanEnabled = true;

  function collectTextSample(limit = 80000){
    try {
      let text = '';
      const push = (t) => { if (t && text.length < limit) text += ' ' + t.toLowerCase(); };
      // Title & meta
      push(document.title || '');
      document.querySelectorAll('meta[name="description"], meta[property="og:description"], meta[name="keywords"]').forEach(m => push(m.getAttribute('content')));
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode()) && text.length < limit){
        const t = node.nodeValue;
        if (t && /[a-zA-Z0-9]/.test(t)) push(t.trim());
      }
      return text;
    } catch(e){ return ''; }
  }

  async function loadKeywords(){
    try {
      const resp = await chrome.runtime.sendMessage({ action: 'getBlockedKeywords' });
      const list = Array.isArray(resp?.keywords) ? resp.keywords : [];
      blockedKeywords = list.filter(k => Array.isArray(k) ? k[1]?.enabled !== false : true)
                            .map(k => Array.isArray(k) ? k[0] : k)
                            .filter(Boolean)
                            .map(s => s.toLowerCase());
    } catch(e){ /* ignore */ }
  }

  async function loadSetting(){
    try {
      const { keywordScanEnabled: enabled = true } = await chrome.storage.local.get(['keywordScanEnabled']);
      keywordScanEnabled = !!enabled;
    } catch(e){ keywordScanEnabled = true; }
  }

  function keywordFoundInPage(){
    if(!blockedKeywords.length) return null;
    const sample = collectTextSample();
    for(const kw of blockedKeywords){
      if(!kw) continue;
      // word boundary like match but allow substring fallback for short tokens
      const pattern = kw.length >= 3 ? new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`, 'i') : new RegExp(kw.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&'),'i');
      if(pattern.test(sample)) return kw;
    }
    return null;
  }

  async function evaluate(){
    if(!keywordScanEnabled) return; // feature disabled by user
    const match = keywordFoundInPage();
    if(match && match !== lastBlockedMatch){
      lastBlockedMatch = match;
      try { await chrome.runtime.sendMessage({ action: 'contentKeywordDetected', keyword: match, url: location.href }); } catch(e) {}
    }
  }

  async function init(){
    await Promise.all([loadSetting(), loadKeywords()]);
    evaluate();
    setInterval(evaluate, SCAN_INTERVAL_MS);
    // refresh keywords & setting every minute in case user changes list
    setInterval(() => { loadKeywords(); loadSetting(); }, 60000);
    chrome.runtime.onMessage.addListener((msg) => {
      if(msg?.action === 'keywordScanSettingChanged'){
        keywordScanEnabled = !!msg.enabled;
        if(keywordScanEnabled){
          // If re-enabled, re-run immediate evaluation
          evaluate();
        }
      }
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();