/* ==========================================================================
   barcode-scanner.js — kamera + prawdziwa linia skanująca.
   Dekoder analizuje cały aktualnie widoczny kadr kamery.
   Linia pozostaje wizualnym prowadnikiem, ale NIE jest wymagana do odczytu.
   ========================================================================== */
import { h, icon, button, iconBtn, openSheet, toast } from './ui.js';
import { decodeEANImageData, normalizeScannedEAN, validScannedEAN } from './barcode-decoder.js';

function supportedNativeFormats() {
  return ['ean_13','ean_8','upc_a'];
}

export function openBarcodeScanner({ onDetected }) {
  let stream = null, videoTrack = null, timer = 0, stopped = false, busy = false, detector = null;
  let torchSupported = false, torchOn = false;
  let lastCode = '', stable = 0, lastAt = 0;
  const video = h('video', {
    class:'barcode-video',
    autoplay:true, muted:true, playsinline:true,
    'aria-label':'Podgląd aparatu do skanowania kodu kreskowego'
  });
  video.muted = true;
  video.playsInline = true;
  const canvas = document.createElement('canvas');
  const status = h('div',{class:'barcode-status','aria-live':'polite'},
    h('span',{class:'barcode-status-dot'}), h('span',null,'Zbliż kod kreskowy do aparatu'));
  const line = h('div',{class:'barcode-scan-line','aria-hidden':'true'},h('span'));
  const viewport = h('div',{class:'barcode-viewport'},video,line,
    h('div',{class:'barcode-hint'},icon('barcode',20),h('span',null,'Skieruj aparat na kod kreskowy')));
  const help = h('div',{class:'barcode-help'},
    h('strong',null,'Skanowanie EAN'),
    h('span',null,'Zbliż telefon do kodu. Skaner analizuje cały obraz i odczyta go automatycznie.'));
  const body = h('div',{class:'barcode-body'},viewport,status,help,
    h('div',{class:'barcode-actions'},button('Wpisz ręcznie',{kind:'ghost',icon:'edit',onClick:()=>finish(null)})));
  const sheet = openSheet({
    title:'Skanuj kod kreskowy', variant:'sheet', cls:'barcode-scanner-overlay',
    body, actions:[],
    onClose:()=>stop(),
  });

  function setStatus(msg, kind='') {
    status.className='barcode-status '+kind;
    status.lastChild.textContent=msg;
  }

  function finish(code) {
    if (stopped) return;
    if (code) {
      stopped=true;
      viewport.classList.add('barcode-success'); line.classList.add('barcode-scan-line-success'); setStatus('✓ Kod odczytany','ok');
      try { navigator.vibrate?.([35,45,70]); } catch (_) {}
      setTimeout(async()=>{ await onDetected(normalizeScannedEAN(code)); sheet.close('detected'); },120);
    } else {
      sheet.close('manual');
    }
  }

  async function makeDetector() {
    try {
      if (!('BarcodeDetector' in globalThis)) return null;
      const supported = typeof BarcodeDetector.getSupportedFormats === 'function'
        ? await BarcodeDetector.getSupportedFormats() : supportedNativeFormats();
      const formats = supportedNativeFormats().filter(x=>supported.includes(x));
      return formats.length ? new BarcodeDetector({formats}) : null;
    } catch (_) { return null; }
  }

  function captureFrame() {
    const vw=video.videoWidth, vh=video.videoHeight;
    if (!vw || !vh) return null;
    // Cały kadr: kod może znajdować się gdziekolwiek na ekranie.
    // Ograniczamy rozdzielczość dla płynności, bez zawężania obszaru skanowania.
    const scale=Math.min(1,1280/vw);
    const w=Math.max(1,Math.round(vw*scale)), h=Math.max(1,Math.round(vh*scale));
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(video,0,0,w,h);
    return ctx;
  }

  async function nativeDetect(ctx) {
    if (!detector || !ctx) return null;
    try {
      const found=await detector.detect(canvas);
      for (const b of found || []) {
        const code=normalizeScannedEAN(b.rawValue);
        if (validScannedEAN(code)) return code;
      }
    } catch (_) {}
    return null;
  }

  function localDetect(ctx) {
    if (!ctx) return null;
    try {
      return decodeEANImageData(ctx.getImageData(0,0,canvas.width,canvas.height));
    } catch (_) { return null; }
  }

  function acceptCandidate(code) {
    if (!code) {
      if (Date.now()-lastAt>700) { stable=0; lastCode=''; }
      return;
    }
    // Kod jest już zweryfikowany przez BarcodeDetector albo checksum lokalnego
    // dekodera. Nie czekamy na drugi kadr: użytkownik ma dostać wynik natychmiast.
    const normalized=normalizeScannedEAN(code);
    if (!validScannedEAN(normalized)) return;
    finish(normalized);
  }

  async function tick() {
    if (stopped) return;
    if (!busy && video.readyState>=2) {
      busy=true;
      const ctx=captureFrame();
      const nativeCode=await nativeDetect(ctx);
      const code=nativeCode || localDetect(ctx);
      acceptCandidate(code);
      busy=false;
    }
    timer=setTimeout(tick,120);
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Ta przeglądarka nie udostępnia aparatu.','error');
      return;
    }
    if (!window.isSecureContext) {
      setStatus('Skaner wymaga bezpiecznego połączenia HTTPS.','error');
      return;
    }
    try {
      detector=await makeDetector();
      stream=await navigator.mediaDevices.getUserMedia({
        audio:false,
        video:{
          facingMode:{ideal:'environment'},
          width:{ideal:1280,max:1920},
          height:{ideal:720,max:1440},
          frameRate:{ideal:30,max:30}
        }
      });
      try { video.srcObject=stream; } catch (_) {}
      videoTrack=stream.getVideoTracks?.()[0] || null;
      torchSupported=!!videoTrack;
      flashButton.disabled=false;
      flashButton.setAttribute('aria-label', torchSupported ? 'Włącz latarkę' : 'Latarka niedostępna w tej przeglądarce');
      flashButton.title=torchSupported ? 'Włącz latarkę' : 'Latarka niedostępna w tej przeglądarce';
      await video.play();
      setStatus('Zbliż kod kreskowy do aparatu');
      timer=setTimeout(tick,120);
    } catch (e) {
      console.error(e);
      const denied=e?.name==='NotAllowedError'||e?.name==='SecurityError';
      setStatus(denied?'Brak dostępu do aparatu. Zezwól na aparat dla tej strony.':'Nie udało się uruchomić aparatu.','error');
      toast(denied?'Zezwól Kucharzowi na dostęp do aparatu.':'Nie udało się uruchomić aparatu',{type:'error'});
    }
  }

  function supportsTorch(track) {
    try {
      if (typeof track.getCapabilities !== 'function') return false;
      const caps=track.getCapabilities();
      return caps?.torch === true || (Array.isArray(caps?.torch) && caps.torch.includes(true));
    } catch (_) { return false; }
  }

  async function toggleTorch() {
    if (!videoTrack || !torchSupported || stopped) return;
    const next=!torchOn;
    try {
      await videoTrack.applyConstraints({advanced:[{torch:next}]});
      torchOn=next;
      flashButton.classList.toggle('is-on',torchOn);
      flashButton.setAttribute('aria-label',torchOn?'Wyłącz latarkę':'Włącz latarkę');
      flashButton.title=torchOn?'Wyłącz latarkę':'Włącz latarkę';
      setStatus(torchOn?'Latarka włączona':'Latarka wyłączona',torchOn?'near':'');
    } catch (e) {
      console.warn('Torch unavailable',e);
      toast('Nie udało się przełączyć latarki w tym aparacie.',{type:'error'});
    }
  }

  function stop() {
    if (stopped && !stream) return;
    stopped=true;
    clearTimeout(timer);
    if (videoTrack && torchOn) {
      try { videoTrack.applyConstraints({advanced:[{torch:false}]}); } catch (_) {}
    }
    torchOn=false;
    videoTrack=null;
    if (stream) stream.getTracks().forEach(t=>t.stop());
    stream=null;
    video.srcObject=null;
  }

  const flashButton = iconBtn('flash','Włącz latarkę',()=>toggleTorch());
  flashButton.disabled = true;
  flashButton.classList.add('barcode-flash-btn');
  sheet.panel.querySelector('.panel-head')?.appendChild(flashButton);
  sheet.panel.querySelector('.panel-head')?.appendChild(
    iconBtn('info','Informacje o skanowaniu',()=>toast('Skaner analizuje cały obraz. Linia jest prowadnicą, ale kod nie musi jej przecinać.'))
  );
  start();
  return { close:()=>{sheet.close('api');}, stop };
}
