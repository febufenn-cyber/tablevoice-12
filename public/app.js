const $ = (selector) => document.querySelector(selector);
const state = { review: null, draft: null, workItem: null };

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
  if (!response.ok) {
    const error = new Error(data?.error?.message || `${response.status} ${response.statusText}`);
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

function log(value) { $('#log').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function slaLabel(item) {
  if (!item) return '';
  const labels = { overdue: 'OVERDUE', due_soon: 'DUE SOON', on_track: 'ON TRACK', paused: 'PAUSED', completed: 'DONE' };
  return labels[item.slaStatus] || '';
}

async function refresh() {
  const { restaurantId } = settings();
  if (!restaurantId) return log('Restaurant ID is required.');
  try {
    let items;
    try {
      const inbox = await api(`/v1/restaurants/${restaurantId}/inbox?limit=100`);
      items = inbox.items.map(item => ({ review: {
        id: item.reviewId, rating: item.rating, source: item.source, reviewerDisplayName: item.reviewerDisplayName,
        originalText: item.preview, state: item.state, classification: { risk: item.risk },
      }, workItem: item }));
    } catch (error) {
      if (error.code !== 'workflow_disabled') throw error;
      const { reviews } = await api(`/v1/restaurants/${restaurantId}/reviews?limit=100`);
      items = reviews.map(review => ({ review, workItem: null }));
    }
    $('#queue').classList.toggle('empty', items.length === 0);
    $('#queue').innerHTML = items.length ? items.map(({ review, workItem }) => `
      <article class="review-card risk-${review.classification?.risk || 'unknown'}">
        <div><div class="stars">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</div><span class="badge">${escapeHtml(review.source)}</span></div>
        <div><strong>${escapeHtml(review.reviewerDisplayName || 'Anonymous')}</strong><p>${escapeHtml(review.originalText)}</p><span class="muted">${escapeHtml(review.state)} · ${escapeHtml(review.classification?.risk || 'unknown')}${workItem ? ` · ${escapeHtml(workItem.priority)} · ${escapeHtml(slaLabel(workItem))}` : ''}</span></div>
        <button data-review="${review.id}">Open</button>
      </article>`).join('') : 'No reviews yet.';
    document.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => openReview(button.dataset.review)));
  } catch (error) { log(error.message); }
}

async function openReview(id) {
  try {
    const data = await api(`/v1/reviews/${id}`);
    state.review = data.review; state.draft = data.draft; state.workItem = data.workItem;
    const c = data.review.classification;
    $('#detail').innerHTML = `
      <div class="detail-grid">
        <div class="box"><h3>Customer review</h3><p class="stars">${'★'.repeat(data.review.rating)}</p><p>${escapeHtml(data.review.originalText)}</p></div>
        <div class="box"><h3>Assessment</h3><p><strong>State:</strong> ${escapeHtml(data.review.state)}</p><p><strong>Risk:</strong> ${escapeHtml(c?.risk || 'unknown')}</p><p><strong>Category:</strong> ${escapeHtml(c?.primaryCategory || 'not processed')}</p><p>${escapeHtml(c?.riskReason || '')}</p></div>
        <div class="box"><h3>Queue</h3>${data.workItem ? `<p><strong>Priority:</strong> ${escapeHtml(data.workItem.priority)}</p><p><strong>Owner:</strong> ${escapeHtml(data.workItem.assigneeId || 'Unassigned')}</p><p><strong>Next:</strong> ${escapeHtml(data.workItem.nextAction)}</p><p><strong>Version:</strong> ${data.workItem.workflowVersion}</p>` : '<p class="muted">Phase 3 workflow disabled.</p>'}</div>
        <div class="box"><h3>Internal actions</h3>${data.actions.length ? data.actions.map(a=>`<p><strong>${escapeHtml(a.priority)}</strong> · ${escapeHtml(a.description)}</p>`).join('') : '<p class="muted">None.</p>'}</div>
        <div class="box full"><h3>Public draft</h3><textarea id="draftText" rows="8">${escapeHtml(data.draft?.finalText || data.draft?.text || '')}</textarea><p class="muted">${escapeHtml(data.draft?.strategy || '')}</p></div>
        <div class="box full"><div class="actions">
          ${data.workItem && !data.workItem.assigneeId ? '<button id="claim">Claim</button>' : ''}<button id="process">Process</button><button id="qa">Run QA</button><button id="approve">Approve text</button><button id="publish">Confirm published</button><button id="escalate" class="danger">Escalate</button>
        </div></div>
      </div>`;
    $('#detailPanel').hidden = false;
    if ($('#claim')) $('#claim').onclick = () => act(`/v1/reviews/${id}/claim`, { expectedVersion: state.workItem.workflowVersion });
    $('#process').onclick = () => act(`/v1/reviews/${id}/process`, {});
    $('#qa').onclick = () => act(`/v1/reviews/${id}/qa`, { confirmedActions: [] });
    $('#approve').onclick = () => act(`/v1/reviews/${id}/decision`, { decision: 'approved_unchanged', finalText: $('#draftText').value, channel: 'web', expectedReviewUpdatedAt: state.review.updatedAt });
    $('#publish').onclick = () => act(`/v1/reviews/${id}/publication`, { confirmed: true, evidence: 'operator confirmation' }, { 'idempotency-key': crypto.randomUUID() });
    $('#escalate').onclick = () => act(`/v1/reviews/${id}/escalate`, { reason: 'Operator escalation from console.' });
  } catch (error) { log(error.message); }
}

async function act(path, payload, extraHeaders = {}) {
  try { const result = await api(path, { method:'POST', body: JSON.stringify(payload), headers: extraHeaders }); log(result); await openReview(state.review.id); await refresh(); }
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
