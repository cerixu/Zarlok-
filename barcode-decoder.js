/* ==========================================================================
   barcode-decoder.js — lokalny dekoder EAN dla skanera aparatu.
   Nie korzysta z sieci ani z zewnętrznego API. Dekoduje pasek pod linią skanującą.
   Obsługa: EAN-13, EAN-8 oraz UPC-A (UPC-A normalizujemy do EAN-13 z zerem).
   ========================================================================== */

const L = {
  '0':'0001101','1':'0011001','2':'0010011','3':'0111101','4':'0100011',
  '5':'0110001','6':'0101111','7':'0111011','8':'0110111','9':'0001011',
};
const G = {
  '0':'0100111','1':'0110011','2':'0011011','3':'0100001','4':'0011101',
  '5':'0111001','6':'0000101','7':'0010001','8':'0001001','9':'0010111',
};
const R = {
  '0':'1110010','1':'1100110','2':'1101100','3':'1000010','4':'1011100',
  '5':'1001110','6':'1010000','7':'1000100','8':'1001000','9':'1110100',
};
const LREV = Object.fromEntries(Object.entries(L).map(([d,b]) => [b,d]));
const GREV = Object.fromEntries(Object.entries(G).map(([d,b]) => [b,d]));
const RREV = Object.fromEntries(Object.entries(R).map(([d,b]) => [b,d]));
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

function checksumEAN(code) {
  if (!Array.from(code).every((ch) => ch >= '0' && ch <= '9')) return false;
  const digits = code.split('').map(Number);
  const body = digits.slice(0, -1);
  const sum = body.reduce((acc, d, i) => acc + d * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[digits.length - 1];
}

function decodeEAN13Bits(bits) {
  if (bits.length < 95 || bits.slice(0,3) !== '101' || bits.slice(45,50) !== '01010' || bits.slice(92,95) !== '101') return null;
  const left = [], parity = [];
  for (let i = 0; i < 6; i++) {
    const b = bits.slice(3 + i * 7, 10 + i * 7);
    if (LREV[b] != null) { left.push(LREV[b]); parity.push('L'); }
    else if (GREV[b] != null) { left.push(GREV[b]); parity.push('G'); }
    else return null;
  }
  const p = parity.join('');
  const first = PARITY.indexOf(p);
  if (first < 0) return null;
  const right = [];
  for (let i = 0; i < 6; i++) {
    const b = bits.slice(50 + i * 7, 57 + i * 7);
    if (RREV[b] == null) return null;
    right.push(RREV[b]);
  }
  const code = String(first) + left.join('') + right.join('');
  return checksumEAN(code) ? code : null;
}

function decodeEAN8Bits(bits) {
  if (bits.length < 67 || bits.slice(0,3) !== '101' || bits.slice(31,36) !== '01010' || bits.slice(64,67) !== '101') return null;
  const left = [], right = [];
  for (let i = 0; i < 4; i++) {
    const b = bits.slice(3 + i * 7, 10 + i * 7);
    if (LREV[b] == null) return null;
    left.push(LREV[b]);
  }
  for (let i = 0; i < 4; i++) {
    const b = bits.slice(36 + i * 7, 43 + i * 7);
    if (RREV[b] == null) return null;
    right.push(RREV[b]);
  }
  const code = left.join('') + right.join('');
  return checksumEAN(code) ? code : null;
}

function runsFromLine(gray, lineLength, lineIndex, stride = 1) {
  const values = new Uint8Array(lineLength);
  for (let i = 0; i < lineLength; i++) values[i] = gray[lineIndex * lineLength * stride + i * stride];
  let min = 255, max = 0;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  if (max - min < 35) return null;
  const hist = new Uint32Array(256);
  for (const v of values) hist[v]++;
  let sum = 0, count = 0;
  for (let i = 0; i < 256; i++) { sum += i * hist[i]; count += hist[i]; }
  const mean = sum / Math.max(1, count);
  const threshold = Math.max(min + 20, Math.min(max - 20, mean));
  const runs = [];
  let black = values[0] < threshold, start = 0;
  for (let x = 1; x < width; x++) {
    const b = values[x] < threshold;
    if (b !== black) {
      runs.push({ black, start, end:x, width:x-start });
      start = x; black = b;
    }
  }
  runs.push({ black, start, end:width, width:width-start });
  return runs;
}

function sampleBits(values, start, moduleWidth, count, threshold, reverse = false) {
  const bits = [];
  for (let i = 0; i < count; i++) {
    const pos = start + (i + .5) * moduleWidth;
    const x = Math.max(0, Math.min(values.length - 1, Math.floor(reverse ? values.length - 1 - pos : pos)));
    bits.push(values[x] < threshold ? '1' : '0');
  }
  return bits.join('');
}

function thresholds(values) {
  let min = 255, max = 0, sum = 0;
  for (const v of values) { min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  const mean = sum / Math.max(1, values.length);
  const out = [128, mean, Math.max(min + 18, Math.min(max - 18, mean))];
  return [...new Set(out.map(v => Math.round(v)))].filter(v => v > min && v < max);
}

function decodeLine(values) {
  if (!values || values.length < 120) return null;
  for (const threshold of thresholds(values)) {
    let black = values[0] < threshold, start = 0;
    const runs = [];
    for (let x = 1; x < values.length; x++) {
      const b = values[x] < threshold;
      if (b !== black) {
        runs.push({ black, start, end:x, width:x-start });
        start = x; black = b;
      }
    }
    runs.push({ black, start, end:values.length, width:values.length-start });

    for (let i = 0; i < runs.length - 2; i++) {
      const a=runs[i], b=runs[i+1], c=runs[i+2];
      if (!a.black || b.black || !c.black) continue;
      const moduleWidth=(a.width+b.width+c.width)/3;
      if (moduleWidth < 0.8 || moduleWidth > values.length/20) continue;
      const ratio=Math.max(a.width,b.width,c.width)/Math.max(0.1,Math.min(a.width,b.width,c.width));
      if (ratio > 2.2) continue;

      for (const drift of [-0.08,-0.04,0,0.04,0.08]) {
        const w=moduleWidth*(1+drift);
        for (const startShift of [-0.35,0,0.35]) {
          const s=a.start + startShift*w;
          const t=threshold;
          const b95=sampleBits(values,s,w,95,t,false);
          let code=decodeEAN13Bits(b95);
          if (code) return code;
          code=decodeEAN13Bits(b95.split('').reverse().join(''));
          if (code) return code;

          const b67=sampleBits(values,s,w,67,t,false);
          code=decodeEAN8Bits(b67);
          if (code) return code;
          code=decodeEAN8Bits(b67.split('').reverse().join(''));
          if (code) return code;
        }
      }
    }
  }
  return null;
}

function decodeDirection(gray, width, height, vertical = false) {
  const lineLength = vertical ? height : width;
  const lineCount = vertical ? width : height;
  const fractions = [0.10,0.16,0.22,0.28,0.34,0.40,0.46,0.50,0.54,0.60,0.66,0.72,0.78,0.84,0.90];
  for (const f of fractions) {
    const idx=Math.max(0,Math.min(lineCount-1,Math.floor(lineCount*f)));
    const values=new Uint8Array(lineLength);
    if (!vertical) {
      values.set(gray.subarray(idx*width,(idx+1)*width));
    } else {
      for (let y=0;y<height;y++) values[y]=gray[y*width+idx];
    }
    const code=decodeLine(values);
    if (code) return code;
  }
  return null;
}

export function decodeEANImageData(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      gray[y * width + x] = Math.round(data[p] * .299 + data[p+1] * .587 + data[p+2] * .114);
    }
  }
  // EAN bars are normally vertical, but the phone can be rotated. Try both axes.
  return decodeDirection(gray,width,height,false) || decodeDirection(gray,width,height,true);
}

export function normalizeScannedEAN(value) {
  const digits = Array.from(String(value ?? '')).filter((ch) => ch >= '0' && ch <= '9').join('');
  if (digits.length === 12) return '0' + digits;
  if (digits.length === 13 || digits.length === 8) return digits;
  return '';
}

export function validScannedEAN(value) {
  const code = normalizeScannedEAN(value);
  return (code.length === 13 || code.length === 8) && checksumEAN(code);
}
