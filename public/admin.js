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
const filterType = document.querySelector('#filterType');
const emptyState = document.querySelector('#emptyState');
const adminList = document.querySelector('#adminList');
const progressBar = document.querySelector('#progressBar');
const progressText = document.querySelector('#progressText');
const notificationBtn = document.querySelector('#notificationBtn');
const notificationCount = document.querySelector('#notificationCount');
const notificationPanel = document.querySelector('#notificationPanel');
const notificationList = document.querySelector('#notificationList');
const clearNotificationsBtn = document.querySelector('#clearNotificationsBtn');
const createCustomFieldForm = document.querySelector('#createCustomFieldForm');
const customFieldType = document.querySelector('#customFieldType');
const customFieldOptionsLabel = document.querySelector('#customFieldOptionsLabel');
const customFieldsList = document.querySelector('#customFieldsList');
const smsSettingsForm = document.querySelector('#smsSettingsForm');

let registrations = [];
let registrationOpen = true;
let notifications = [];

function setStatus(element, message, type = '') {
  element.className = `status ${type}`.trim();
  element.textContent = message || '';
}

function addNotification(message, type = 'info') {
  const notification = {
    id: Date.now(),
    message,
    type,
    time: new Date()
  };
  notifications.unshift(notification);
  if (notifications.length > 50) notifications.pop();
  updateNotificationUI();
}

function updateNotificationUI() {
  notificationCount.textContent = notifications.length;
  notificationCount.classList.toggle('hidden', notifications.length === 0);
  
  notificationList.innerHTML = notifications.map((notificationMessage) => `
    <div class="notification-item ${notificationMessage.type}">
      <div class="notification-message">${escapeHtml(notificationMessage.message)}</div>
      <div class="notification-time">${formatDate(notificationMessage.time)}</div>
    </div>
  `).join('');
}

function toggleNotificationPanel() {
  notificationPanel.classList.toggle('hidden');
}

function clearNotifications() {
  notifications = [];
  updateNotificationUI();
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
  const typeFilter = filterType.value;
  const filtered = registrations.filter((item) => {
    const haystack = `${item.fullName} ${item.email} ${item.phone} ${item.participantType} ${item.country} ${item.experience || ''}`.toLowerCase();
    const matchesSearch = haystack.includes(query);
    const matchesType = !typeFilter || item.participantType === typeFilter;
    return matchesSearch && matchesType;
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
  await loadAdminList();
  await loadCustomFields();
  await loadSmsSettings();
  updateProgressBar(summary.registered, summary.capacity);
  
  // Check for capacity alerts
  checkCapacityAlerts(summary.registered, summary.capacity);
}

function checkCapacityAlerts(registered, capacity) {
  const percentage = capacity > 0 ? (registered / capacity) * 100 : 0;
  
  if (percentage >= 90 && percentage < 100) {
    addNotification(`تنبيه: اقترب التسجيل من الاكتمال (${Math.round(percentage)}%)`, 'warning');
  } else if (percentage >= 100) {
    addNotification('تنبيه: اكتملت جميع المقاعد!', 'error');
  } else if (percentage >= 75 && percentage < 90) {
    addNotification(`ملاحظة: تم ملء ${Math.round(percentage)}% من المقاعد`, 'info');
  }
}

function updateProgressBar(registered, capacity) {
  const percentage = capacity > 0 ? Math.round((registered / capacity) * 100) : 0;
  progressBar.style.setProperty('--registered', `${percentage}%`);
  progressBar.setAttribute('data-registered', percentage);
  progressText.textContent = `${percentage}%`;
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
    addNotification('تم تحديث حد المقاعد بنجاح', 'success');
  } catch (error) {
    setStatus(adminStatus, error.message, 'error');
    addNotification(`خطأ: ${error.message}`, 'error');
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
    await loadAdminList();
    addNotification('تم إنشاء حساب الأدمن بنجاح', 'success');
  } catch (error) {
    setStatus(adminStatus, error.message, 'error');
    addNotification(`خطأ: ${error.message}`, 'error');
  }
});

async function loadAdminList() {
  try {
    const data = await api('/api/admin/list');
    renderAdminList(data.admins);
  } catch (error) {
    console.error('Failed to load admin list:', error);
  }
}

function renderAdminList(admins) {
  adminList.innerHTML = admins.map((admin) => `
    <div class="admin-item">
      <div class="admin-info">
        <span class="admin-username">${escapeHtml(admin.username)}</span>
        <span class="admin-date">${formatDate(admin.createdAt)}</span>
      </div>
      <button class="delete-admin-btn" data-username="${escapeHtml(admin.username)}">حذف</button>
    </div>
  `).join('');

  document.querySelectorAll('.delete-admin-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.username;
      if (!confirm(`هل أنت متأكد من حذف حساب الأدمن "${username}"؟`)) return;
      
      try {
        await api(`/api/admin/${username}`, { method: 'DELETE' });
        setStatus(adminStatus, 'تم حذف حساب الأدمن بنجاح.', 'success');
        addNotification('تم حذف حساب الأدمن', 'success');
        await loadAdminList();
      } catch (error) {
        setStatus(adminStatus, error.message, 'error');
        addNotification(`خطأ: ${error.message}`, 'error');
      }
    });
  });
}

async function loadCustomFields() {
  try {
    const data = await api('/api/admin/custom-fields');
    renderCustomFields(data.fields);
  } catch (error) {
    console.error('Failed to load custom fields:', error);
  }
}

function renderCustomFields(fields) {
  customFieldsList.innerHTML = fields.map((field) => `
    <div class="custom-field-item">
      <div class="custom-field-info">
        <span class="custom-field-name">${escapeHtml(field.fieldLabel)}</span>
        <span class="custom-field-details">${escapeHtml(field.fieldType)} ${field.required ? '(إلزامي)' : ''}</span>
      </div>
      <button class="delete-field-btn" data-field-id="${field._id}">حذف</button>
    </div>
  `).join('');

  document.querySelectorAll('.delete-field-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const fieldId = btn.dataset.fieldId;
      if (!confirm('هل أنت متأكد من حذف هذا الحقل؟')) return;
      
      try {
        await api(`/api/admin/custom-fields/${fieldId}`, { method: 'DELETE' });
        addNotification('تم حذف الحقل المخصص', 'success');
        await loadCustomFields();
      } catch (error) {
        addNotification(`خطأ: ${error.message}`, 'error');
      }
    });
  });
}

async function loadSmsSettings() {
  try {
    const settings = await api('/api/admin/sms-settings');
    document.getElementById('smsEnabled').checked = settings.smsEnabled;
    document.getElementById('twilioAccountSid').value = settings.twilioAccountSid || '';
    document.getElementById('twilioAuthToken').value = ''; // Never load auth token for security
    document.getElementById('twilioPhoneNumber').value = settings.twilioPhoneNumber || '';
    document.getElementById('adminPhoneNumber').value = settings.adminPhoneNumber || '';
    document.getElementById('notifyOnNewRegistration').checked = settings.notifyOnNewRegistration;
    document.getElementById('notifyOnCapacityAlert').checked = settings.notifyOnCapacityAlert;
  } catch (error) {
    console.error('Failed to load SMS settings:', error);
  }
}

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
    addNotification(registrationOpen ? 'تم فتح التقديم' : 'تم إغلاق التقديم', 'success');
  } catch (error) {
    setStatus(adminStatus, error.message, 'error');
    addNotification(`خطأ: ${error.message}`, 'error');
  }
});

searchInput.addEventListener('input', renderRows);
filterType.addEventListener('change', renderRows);

notificationBtn.addEventListener('click', toggleNotificationPanel);
clearNotificationsBtn.addEventListener('click', clearNotifications);

customFieldType.addEventListener('change', () => {
  customFieldOptionsLabel.classList.toggle('hidden', customFieldType.value !== 'select');
});

createCustomFieldForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(createCustomFieldForm).entries());
    payload.required = payload.required === 'on';
    
    if (payload.fieldType === 'select') {
      payload.options = payload.options ? payload.options.split(',').map(opt => opt.trim()) : [];
    } else {
      delete payload.options;
    }
    
    const data = await api('/api/admin/custom-fields', { method: 'POST', body: JSON.stringify(payload) });
    addNotification('تم إنشاء الحقل المخصص بنجاح', 'success');
    createCustomFieldForm.reset();
    customFieldOptionsLabel.classList.add('hidden');
    await loadCustomFields();
  } catch (error) {
    addNotification(`خطأ: ${error.message}`, 'error');
  }
});

smsSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(smsSettingsForm).entries());
    payload.smsEnabled = payload.smsEnabled === 'on';
    payload.notifyOnNewRegistration = payload.notifyOnNewRegistration === 'on';
    payload.notifyOnCapacityAlert = payload.notifyOnCapacityAlert === 'on';
    
    const data = await api('/api/admin/sms-settings', { method: 'POST', body: JSON.stringify(payload) });
    addNotification('تم حفظ إعدادات SMS بنجاح', 'success');
  } catch (error) {
    addNotification(`خطأ: ${error.message}`, 'error');
  }
});

api('/api/admin/me')
  .then(async () => {
    showAdmin();
    await loadDashboard();
  })
  .catch(showLogin);
