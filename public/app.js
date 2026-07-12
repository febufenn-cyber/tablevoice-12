const $ = (selector) => document.querySelector(selector);
const state = { review: null, draft: null };

function settings() {
  return {
    token: sessionStorage.getItem('tablevoice_token') || '',
    restaurantId: sessionStorage.getItem('tablevoice_restaurant') || '',
    devMode: sessionStorage.getItem('tablevoice_dev') === 'true',
  };
}

function headers(json = false) {
  const value = settings();
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(value.token ? { authorization: `Bearer ${value.token}` } : {}),
    ...(value.devMode ? { 'x-dev-user-id': '00000000-0000-4000-8000-000000000001', 'x-dev-platform-role': 'operator' } : {}),
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `${response.status} ${response.statusText}`);
  return data;
}

function log(value) { $('#log').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function escapeHtml(value='') { return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function refresh() {
  const { restaurantId } = settings();
  if (!restaurantId) return log('Restaurant ID is required.');
  try {
    const { reviews } = await api(`/v1/restaurants/${restaurantId}/reviews?limit=100`);
    $('#queue').classList.toggle('empty', reviews.length === 0);
    $('#queue').innerHTML = reviews.length ? reviews.map(review => `
      <article class="review-card risk-${review.classification?.risk || 'unknown'}">
        <div><div class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</div><span class="badge">${escapeHtml(review.source)}</span></div>
        <div><strong>${escapeHtml(review.reviewerDisplayName || 'Anonymous')}</strong><p>${escapeHtml(review.originalText)}</p><span class="muted">${escapeHtml(review.state)} · ${escapeHtml(review.classification?.primaryCategory || 'unclassified')} · ${escapeHtml(review.classification?.risk || 'unknown')}</span></div>
        <button data-review="${review.id}">Open</button>
      </article>`).join('') : 'No reviews yet.';
    document.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => openReview(button.dataset.review)));
  } catch (error) { log(error.message); }
}

async function openReview(id) {
  try {
    const data = await api(`/v1/reviews/${id}`);
    state.review = data.review; state.draft = data.draft;
    const c = data.review.classification;
    $('#detail').innerHTML = `
      <div class="detail-grid">
        <div class="box"><h3>Customer review</h3><p class="stars">${'★'.repeat(data.review.rating)}</p><p>${escapeHtml(data.review.originalText)}</p></div>
        <div class="box"><h3>Assessment</h3><p><strong>State:</strong> ${escapeHtml(data.review.state)}</p><p><strong>Risk:</strong> ${escapeHtml(c?.risk || 'unknown')}</p><p><strong>Category:</strong> ${escapeHtml(c?.primaryCategory || 'not processed')}</p><p>${escapeHtml(c?.riskReason || '')}</p></div>
        <div class="box"><h3>Internal actions</h3>${data.actions.length ? data.actions.map(a=>`<p><strong>${escapeHtml(a.priority)}</strong> · ${escapeHtml(a.description)}</p>`).join('') : '<p class="muted">None.</p>'}</div>
        <div class="box"><h3>Public draft</h3><textarea id="draftText" rows="8">${escapeHtml(data.draft?.finalText || data.draft?.text || '')}</textarea><p class="muted">${escapeHtml(data.draft?.strategy || '')}</p></div>
        <div class="box full"><div class="actions">
          <button id="process">Process</button><button id="qa">Run QA</button><button id="approve">Approve text</button><button id="publish">Confirm published</button><button id="escalate" class="danger">Escalate</button>
        </div></div>
      </div>`;
    $('#detailPanel').hidden = false;
    $('#process').onclick = () => act(`/v1/reviews/${id}/process`, {});
    $('#qa').onclick = () => act(`/v1/reviews/${id}/qa`, { confirmedActions: [] });
    $('#approve').onclick = () => act(`/v1/reviews/${id}/decision`, { decision: 'approved_unchanged', finalText: $('#draftText').value, channel: 'web' });
    $('#publish').onclick = () => act(`/v1/reviews/${id}/publication`, { confirmed: true, evidence: 'operator confirmation' });
    $('#escalate').onclick = () => act(`/v1/reviews/${id}/escalate`, { reason: 'Operator escalation from console.' });
  } catch (error) { log(error.message); }
}

async function act(path, payload) {
  try { const result = await api(path, { method:'POST', body: JSON.stringify(payload) }); log(result); await openReview(state.review.id); await refresh(); }
  catch (error) { log(error.message); }
}

$('#saveSettings').onclick = () => {
  sessionStorage.setItem('tablevoice_token', $('#token').value.trim());
  sessionStorage.setItem('tablevoice_restaurant', $('#restaurantId').value.trim());
  sessionStorage.setItem('tablevoice_dev', String($('#devMode').checked));
  log('Session settings saved.'); refresh();
};
$('#refresh').onclick = refresh;
$('#closeDetail').onclick = () => { $('#detailPanel').hidden = true; };
$('#reviewForm').onsubmit = async (event) => {
  event.preventDefault();
  const restaurantId = settings().restaurantId;
  if (!restaurantId) return log('Restaurant ID is required.');
  const form = new FormData(event.target);
  try {
    const result = await api(`/v1/restaurants/${restaurantId}/reviews`, { method:'POST', body: JSON.stringify({
      rating: Number(form.get('rating')), reviewDate: form.get('reviewDate'), reviewerDisplayName: form.get('reviewerDisplayName') || undefined,
      source: form.get('source'), originalText: form.get('originalText'), verified: true,
    }) });
    event.target.reset(); log(result); await refresh();
  } catch (error) { log(error.message); }
};

const current = settings(); $('#token').value=current.token; $('#restaurantId').value=current.restaurantId; $('#devMode').checked=current.devMode;
$('#reviewForm [name=reviewDate]').value = new Date().toISOString().slice(0,10);
fetch('/health').then(r=>r.json()).then(v=>$('#health').textContent=`API ${v.status} · Phase ${v.phase}`).catch(()=>$('#health').textContent='API unavailable');
if (current.restaurantId) refresh();
