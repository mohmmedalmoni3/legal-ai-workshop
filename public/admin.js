const loginView = document.querySelector('#loginView');
const adminView = document.querySelector('#adminView');
const loginForm = document.querySelector('#loginForm');
const loginStatus = document.querySelector('#loginStatus');
const logoutBtn = document.querySelector('#logoutBtn');
const adminStatus = document.querySelector('#adminStatus');
const capacityValue = document.querySelector('#capacityValue');
const registeredValue = document.querySelector('#registeredValue');
const remainingValue = document.querySelector('#remainingValue');
const registrationStateValue = document.querySelector('#registrationStateValue');
const capacityInput = document.querySelector('#capacityInput');
const capacityForm = document.querySelector('#capacityForm');
const createAdminForm = document.querySelector('#createAdminForm');
const toggleRegistrationBtn = document.querySelector('#toggleRegistrationBtn');
const registrationsBody = document.querySelector('#registrationsBody');
const searchInput = document.querySelector('#searchInput');
const emptyState = document.querySelector('#emptyState');

let registrations = [];
let registrationOpen = true;

function setStatus(element, message, type = '') {
  element.className = `status ${type}`.trim();
  element.textContent = message || '';
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : {};
  if (!res.ok) throw new Error(data.message || 'تعذر تنفيذ الطلب.');
  return data;
}

function showAdmin() {
  loginView.hidden = true;
  adminView.hidden = false;
}

function showLogin() {
  adminView.hidden = true;
  loginView.hidden = false;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ar-JO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function renderRows() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = registrations.filter((item) => {
    const haystack = `${item.fullName} ${item.email} ${item.phone} ${item.participantType} ${item.country} ${item.experience || ''}`.toLowerCase();
    return haystack.includes(query);
  });
  registrationsBody.innerHTML = filtered.map((item) => `
    <tr>
      <td>${escapeHtml(item.fullName)}</td>
      <td>${escapeHtml(item.email)}</td>
      <td>${escapeHtml(item.phone)}</td>
      <td>${escapeHtml(item.participantType)}</td>
      <td>${escapeHtml(item.country)}</td>
      <td>${escapeHtml(item.experience || '-')}</td>
      <td>${escapeHtml(formatDate(item.createdAt))}</td>
    </tr>
  `).join('');
  emptyState.hidden = filtered.length > 0;
}

async function loadDashboard() {
  const [summary, registrationsData] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/registrations')
  ]);
  capacityValue.textContent = summary.capacity;
  registeredValue.textContent = summary.registered;
  remainingValue.textContent = summary.remaining;
  registrationOpen = summary.registrationOpen !== false;
  registrationStateValue.textContent = registrationOpen ? 'مفتوح' : 'مغلق';
  toggleRegistrationBtn.textContent = registrationOpen ? 'إغلاق التقديم' : 'فتح التقديم';
  toggleRegistrationBtn.className = registrationOpen ? 'danger' : 'open';
  capacityInput.value = summary.capacity;
  registrations = registrationsData.registrations;
  renderRows();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(loginStatus, 'جارٍ تسجيل الدخول...');
  const payload = Object.fromEntries(new FormData(loginForm).entries());
  try {
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify(payload) });
    setStatus(loginStatus, '');
    showAdmin();
    await loadDashboard();
  } catch (error) {
    setStatus(loginStatus, error.message, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

capacityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(adminStatus, 'جارٍ حفظ الحد الجديد...');
  try {
    const data = await api('/api/admin/workshop', { method: 'PATCH', body: JSON.stringify({ capacity: Number(capacityInput.value) }) });
    capacityValue.textContent = data.capacity;
    registeredValue.textContent = data.registered;
    remainingValue.textContent = data.remaining;
    setStatus(adminStatus, data.message, 'success');
  } catch (error) {
    setStatus(adminStatus, error.message, 'error');
  }
});

createAdminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(adminStatus, 'جارٍ إنشاء حساب الأدمن...');
  try {
    const payload = Object.fromEntries(new FormData(createAdminForm).entries());
    const data = await api('/api/admin/create', { method: 'POST', body: JSON.stringify(payload) });
    setStatus(adminStatus, data.message, 'success');
    createAdminForm.reset();
  } catch (error) {
    setStatus(adminStatus, error.message, 'error');
  }
});

toggleRegistrationBtn.addEventListener('click', async () => {
  const nextState = !registrationOpen;
  setStatus(adminStatus, nextState ? 'جارٍ فتح التقديم...' : 'جارٍ إغلاق التقديم...');
  try {
    const data = await api('/api/admin/workshop', { method: 'PATCH', body: JSON.stringify({ registrationOpen: nextState }) });
    registrationOpen = data.registrationOpen !== false;
    registrationStateValue.textContent = registrationOpen ? 'مفتوح' : 'مغلق';
    toggleRegistrationBtn.textContent = registrationOpen ? 'إغلاق التقديم' : 'فتح التقديم';
    toggleRegistrationBtn.className = registrationOpen ? 'danger' : 'open';
    setStatus(adminStatus, registrationOpen ? 'تم فتح التقديم.' : 'تم إغلاق التقديم.', 'success');
  } catch (error) {
    setStatus(adminStatus, error.message, 'error');
  }
});

searchInput.addEventListener('input', renderRows);

api('/api/admin/me')
  .then(async () => {
    showAdmin();
    await loadDashboard();
  })
  .catch(showLogin);
