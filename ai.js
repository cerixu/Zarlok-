/* ==========================================================================
   ai.js — Żarłok AI client.
   IMPORTANT: no OpenAI API key is accepted or stored here.
   The PWA talks only to the user's own AI gateway. Gateway token is
   session-only and is never written to IndexedDB/localStorage.
   ========================================================================== */
import { getSetting, setSetting, normalizeRecipe, blankRecipe } from './recipes.js';

let gatewayToken = '';
let gatewayTokenBinding = '';

function gatewayIdentity(u) {
  return u.origin + u.pathname.replace(/\/+$/, '');
}

function parseGatewayUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  let u;
  try { u = new URL(value); } catch (_) { throw new Error('Adres gatewaya jest niepoprawny.'); }
  if (u.protocol !== 'https:') throw new Error('Gateway AI musi używać HTTPS.');
  if (u.username || u.password) throw new Error('Adres gatewaya nie może zawierać danych logowania.');
  if (u.search || u.hash) throw new Error('Adres gatewaya nie może zawierać parametrów ani fragmentu URL.');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
    host === '0.0.0.0' || host === '::1' ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^(fc|fd|fe80):/i.test(host)
  ) throw new Error('Adres gatewaya wskazuje na lokalny lub prywatny host.');
  u.hash = '';
  u.search = '';
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u;
}

export function normalizeAIGatewayUrl(url) {
  const u = parseGatewayUrl(url);
  return u ? u.href.replace(/\/+$/, '') : '';
}

export function getAIGatewayUrl() {
  return String(getSetting('aiGatewayUrl') || '').trim();
}

export function setAIGatewayUrl(url) {
  return setSetting('aiGatewayUrl', normalizeAIGatewayUrl(url));
}

export function setAIGatewayToken(token) {
  gatewayToken = String(token || '').trim();
  gatewayTokenBinding = gatewayToken ? normalizeAIGatewayUrl(getAIGatewayUrl()) : '';
}

export function clearAIGatewayToken() {
  gatewayToken = '';
  gatewayTokenBinding = '';
}

export function hasAIAccess() {
  return !!getAIGatewayUrl() && !!gatewayToken;
}

export function aiEnabled() {
  return getSetting('aiEnabled') !== false;
}

function gatewayBase() {
  const raw = getAIGatewayUrl();
  if (!raw) throw new Error('Ustaw najpierw adres Żarłok AI Gateway.');
  return parseGatewayUrl(raw);
}

async function request(path, body, { method = 'POST' } = {}) {
  if (!aiEnabled()) throw new Error('Żarłok AI jest wyłączony w Ustawieniach.');
  if (!gatewayToken) throw new Error('Brak tokenu AI. W Ustawieniach połącz Kucharek z Twoim gatewayem.');
  const u = gatewayBase();
  if (!gatewayTokenBinding || gatewayTokenBinding !== gatewayIdentity(u)) {
    throw new Error('Token AI jest przypisany do innego gatewaya. Wklej token ponownie.');
  }
  u.pathname = u.pathname.replace(/\/+$/, '') + path;

  const res = await fetch(u.href, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + gatewayToken,
    },
    cache: 'no-store',
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });

  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || ('Gateway AI zwrócił HTTP ' + res.status + '.'));
  }
  return data || {};
}

export async function testAIGateway() {
  return request('/health', null, { method: 'GET' });
}

function cleanRecipe(raw, sourceUrl = '') {
  const b = blankRecipe();
  const x = raw && typeof raw === 'object' ? raw : {};
  const recipe = normalizeRecipe({
    ...b,
    name: String(x.name || '').trim(),
    description: String(x.description || '').trim(),
    servings: Number(x.servings) > 0 ? Number(x.servings) : 1,
    prepTime: Number(x.prepTime) >= 0 ? Number(x.prepTime) : 0,
    cookTime: Number(x.cookTime) >= 0 ? Number(x.cookTime) : 0,
    fermentTime: Number(x.fermentTime) >= 0 ? Number(x.fermentTime) : 0,
    temperature: String(x.temperature || ''),
    category: String(x.category || 'cat-inne'),
    traditional: !!x.traditional,
    origin: String(x.origin || ''),
    tags: Array.isArray(x.tags) ? x.tags.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12) : [],
    sections: Array.isArray(x.sections) && x.sections.length ? x.sections.map((sec) => ({
      name: String(sec?.name || ''),
      ingredients: Array.isArray(sec?.ingredients) ? sec.ingredients.map((i) => ({
        name: String(i?.name || '').trim(),
        amount: Number.isFinite(i?.amount) ? Number(i.amount) : null,
        unit: String(i?.unit || '').trim()
      })).filter((i) => i.name) : []
    })).filter((sec) => sec.ingredients.length || sec.name) : [{ name: '', ingredients: [] }],
    steps: Array.isArray(x.steps) ? x.steps.map((s) => ({ text: String(s?.text || '').trim() })).filter((s) => s.text) : [],
    source: String(x.source || ''),
    sourceUrl: String(x.sourceUrl || sourceUrl || ''),
  });
  return recipe;
}

export async function importRecipeFromUrl(url) {
  const value = String(url || '').trim();
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error('Wklej poprawny adres strony.'); }
  if (parsed.protocol !== 'https:') throw new Error('Importer URL przyjmuje tylko adresy HTTPS.');
  const data = await request('/v1/recipe-from-url', { url: parsed.href });
  if (!data.recipe) throw new Error('AI nie zwróciło receptury.');
  return cleanRecipe(data.recipe, parsed.href);
}

export async function askRecipeAI({ question, recipe, currentStep = '', history = [] }) {
  const q = String(question || '').trim();
  if (!q) throw new Error('Napisz pytanie.');
  const r = recipe && typeof recipe === 'object' ? recipe : {};
  const safeHistory = Array.isArray(history) ? history.slice(-8).map((x) => ({
    q: String(x?.q || '').slice(0, 800),
    a: String(x?.a || '').slice(0, 1200)
  })) : [];
  const data = await request('/v1/ask-recipe', {
    question: q,
    currentStep: String(currentStep || '').slice(0, 3000),
    history: safeHistory,
    recipe: r
  });
  const answer = String(data.answer || '').trim();
  if (!answer) throw new Error('AI nie zwróciło odpowiedzi.');
  return answer;
}

export function recipeAIContext(recipe) {
  const r = recipe || {};
  return {
    name: r.name || '',
    servings: r.servings || 1,
    description: r.description || '',
    ingredients: (r.sections || []).map((sec) => ({
      section: sec.name || '',
      items: (sec.ingredients || []).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit }))
    })),
    steps: (r.steps || []).map((s) => s.text),
    temperature: r.temperature || '',
    notes: r.notes || ''
  };
}
