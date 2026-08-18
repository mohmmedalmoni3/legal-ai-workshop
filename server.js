import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const WORKSHOP_ID = process.env.WORKSHOP_ID || 'ai-law-2026';
const CAPACITY = Number(process.env.WORKSHOP_CAPACITY || 100);
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_SECRET = process.env.ADMIN_SECRET || ADMIN_PASSWORD || crypto.randomBytes(32).toString('hex');
const ADMIN_SESSION_HOURS = Number(process.env.ADMIN_SESSION_HOURS || 12);
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and add your MongoDB Atlas connection string.');
  process.exit(1);
}

if (!Number.isInteger(CAPACITY) || CAPACITY < 1) {
  console.error('WORKSHOP_CAPACITY must be a positive number.');
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '20kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

const registrationSchema = new mongoose.Schema({
  workshopId: { type: String, required: true, index: true },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  participantType: { type: String, required: true, enum: ['محامي', 'مستشار قانوني', 'طالب قانون', 'خريج قانون', 'مدرب', 'مختص قانوني', 'أخرى'] },
  country: { type: String, required: true, trim: true, maxlength: 80 },
  experience: { type: String, trim: true, maxlength: 80 },
  consentAccepted: { type: Boolean, required: true },
  createdAt: { type: Date, default: Date.now }
});
registrationSchema.index({ workshopId: 1, email: 1 }, { unique: true });
const Registration = mongoose.model('Registration', registrationSchema);

const workshopSchema = new mongoose.Schema({
  workshopId: { type: String, unique: true, required: true },
  capacity: { type: Number, required: true },
  registeredCount: { type: Number, default: 0 },
  registrationOpen: { type: Boolean, default: true }
});
const Workshop = mongoose.model('Workshop', workshopSchema);

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 50 },
  password: { type: String, required: true, minlength: 6 },
  createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.model('Admin', adminSchema);

const customFieldSchema = new mongoose.Schema({
  workshopId: { type: String, required: true, index: true },
  fieldName: { type: String, required: true, trim: true },
  fieldType: { type: String, required: true, enum: ['text', 'number', 'email', 'tel', 'textarea', 'select'] },
  fieldLabel: { type: String, required: true, trim: true },
  placeholder: { type: String, trim: true },
  required: { type: Boolean, default: false },
  options: [{ type: String }], // For select fields
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const CustomField = mongoose.model('CustomField', customFieldSchema);

const smsSettingsSchema = new mongoose.Schema({
  workshopId: { type: String, required: true, unique: true },
  twilioAccountSid: { type: String, trim: true },
  twilioAuthToken: { type: String, trim: true },
  twilioPhoneNumber: { type: String, trim: true },
  smsEnabled: { type: Boolean, default: false },
  notifyOnNewRegistration: { type: Boolean, default: true },
  notifyOnCapacityAlert: { type: Boolean, default: true },
  adminPhoneNumber: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const SmsSettings = mongoose.model('SmsSettings', smsSettingsSchema);

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((cookie) => {
    const [name, ...value] = cookie.trim().split('=');
    return [name, decodeURIComponent(value.join('='))];
  }).filter(([name]) => name));
}

function timingSafeEqualText(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function sendSMS(phoneNumber, message) {
  try {
    const smsSettings = await SmsSettings.findOne({ workshopId: WORKSHOP_ID });
    if (!smsSettings || !smsSettings.smsEnabled) {
      console.log('SMS not enabled or settings not found');
      return false;
    }

    const twilio = require('twilio');
    const client = new twilio(smsSettings.twilioAccountSid, smsSettings.twilioAuthToken);
    
    await client.messages.create({
      body: message,
      from: smsSettings.twilioPhoneNumber,
      to: phoneNumber
    });
    
    return true;
  } catch (error) {
    console.error('SMS sending failed:', error.message);
    return false;
  }
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifySession(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  if (!timingSafeEqualText(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.username || !payload?.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

function adminRequired(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verifySession(cookies.admin_session);
  if (!session) return res.status(401).json({ message: 'يرجى تسجيل الدخول إلى لوحة الإدارة.' });
  req.admin = session;
  return next();
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'legal-ai-workshop-registration' });
});

app.get('/api/workshop', async (_req, res) => {
  try {
    const workshop = await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID },
      { $setOnInsert: { workshopId: WORKSHOP_ID, capacity: CAPACITY, registeredCount: 0, registrationOpen: true } },
      { upsert: true, new: true }
    ).lean();
    res.json({ title: process.env.WORKSHOP_TITLE, capacity: workshop.capacity, registered: workshop.registeredCount, remaining: Math.max(workshop.capacity - workshop.registeredCount, 0), registrationOpen: workshop.registrationOpen !== false });
  } catch {
    res.status(500).json({ message: 'تعذر تحميل معلومات الورشة.' });
  }
});

app.post('/api/register', async (req, res) => {
  const { fullName, email, phone, participantType, country, experience = '', consent } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const consentAccepted = consent === true || consent === 'true' || consent === 'on';
  if (!fullName || !/^\S+@\S+\.\S+$/.test(normalizedEmail) || !phone || !participantType || !country || !consentAccepted) {
    return res.status(400).json({ message: 'يرجى تعبئة جميع الحقول المطلوبة بشكل صحيح.' });
  }

  try {
    const currentWorkshop = await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID },
      { $setOnInsert: { workshopId: WORKSHOP_ID, capacity: CAPACITY, registeredCount: 0, registrationOpen: true } },
      { upsert: true, new: true }
    );
    if (currentWorkshop.registrationOpen === false) {
      return res.status(403).json({ message: 'التسجيل مغلق حاليًا.' });
    }

    const workshop = await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID, registrationOpen: { $ne: false }, $expr: { $lt: ['$registeredCount', '$capacity'] } },
      { $inc: { registeredCount: 1 } },
      { new: true }
    );
    if (!workshop) return res.status(409).json({ message: 'عذرًا، اكتمل العدد المسموح به للتسجيل في هذه الورشة.' });

    try {
      const registration = await Registration.create({ workshopId: WORKSHOP_ID, fullName, email: normalizedEmail, phone, participantType, country, experience, consentAccepted });
      return res.status(201).json({ message: 'تم تسجيلك بنجاح.', registrationId: registration._id.toString(), remaining: Math.max(workshop.capacity - workshop.registeredCount, 0) });
    } catch (error) {
      await Workshop.updateOne({ workshopId: WORKSHOP_ID, registeredCount: { $gt: 0 } }, { $inc: { registeredCount: -1 } });
      if (error?.code === 11000) return res.status(409).json({ message: 'هذا البريد الإلكتروني مسجل مسبقًا في هذه الورشة. لا يمكن استخدامه للتسجيل مرة أخرى.' });
      throw error;
    }
  } catch {
    res.status(500).json({ message: 'حدث خطأ غير متوقع. حاول مرة أخرى.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  
  // Check against environment variables first (for backward compatibility)
  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    const valid = timingSafeEqualText(username, ADMIN_USERNAME) && timingSafeEqualText(password, ADMIN_PASSWORD);
    if (valid) {
      const token = signSession({
        username: ADMIN_USERNAME,
        expiresAt: Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000
      });
      res.cookie('admin_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000
      });
      return res.json({ message: 'تم تسجيل الدخول بنجاح.', username: ADMIN_USERNAME });
    }
  }
  
  // Check against MongoDB admin accounts
  const hashedPassword = await hashPassword(password);
  const admin = await Admin.findOne({ username, password: hashedPassword });
  if (!admin) {
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
  }

  const token = signSession({
    username: admin.username,
    expiresAt: Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000
  });
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000
  });
  return res.json({ message: 'تم تسجيل الدخول بنجاح.', username: admin.username });
});

app.post('/api/admin/logout', (_req, res) => {
  res.clearCookie('admin_session');
  res.json({ message: 'تم تسجيل الخروج.' });
});

app.get('/api/admin/me', adminRequired, (req, res) => {
  res.json({ username: req.admin.username });
});

app.post('/api/admin/create', adminRequired, async (req, res) => {
  const { username, password } = req.body || {};
  
  if (!username || !password) {
    return res.status(400).json({ message: 'اسم المستخدم وكلمة المرور مطلوبان.' });
  }
  
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ message: 'اسم المستخدم يجب أن يكون بين 3 و 50 حرف.' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
  }
  
  try {
    const hashedPassword = await hashPassword(password);
    const admin = await Admin.create({ username, password: hashedPassword });
    return res.json({ message: 'تم إنشاء حساب الأدمن بنجاح.', username: admin.username });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'اسم المستخدم موجود بالفعل.' });
    }
    return res.status(500).json({ message: 'حدث خطأ أثناء إنشاء حساب الأدمن.' });
  }
});

app.get('/api/admin/list', adminRequired, async (_req, res) => {
  try {
    const admins = await Admin.find().select('username createdAt -_id').sort({ createdAt: -1 });
    return res.json({ admins });
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب قائمة الأدمن.' });
  }
});

app.delete('/api/admin/:username', adminRequired, async (req, res) => {
  const { username } = req.params;
  
  // Prevent deleting the currently logged in admin
  if (username === req.admin.username) {
    return res.status(400).json({ message: 'لا يمكنك حذف حسابك الحالي.' });
  }
  
  // Prevent deleting the environment admin
  if (username === ADMIN_USERNAME) {
    return res.status(400).json({ message: 'لا يمكن حذف حساب الأدمن الأساسي.' });
  }
  
  try {
    const result = await Admin.deleteOne({ username });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'حساب الأدمن غير موجود.' });
    }
    return res.json({ message: 'تم حذف حساب الأدمن بنجاح.' });
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف حساب الأدمن.' });
  }
});

app.get('/api/admin/summary', adminRequired, async (_req, res) => {
  const [workshop, registrationsCount] = await Promise.all([
    Workshop.findOne({ workshopId: WORKSHOP_ID }).lean(),
    Registration.countDocuments({ workshopId: WORKSHOP_ID })
  ]);
  res.json({
    workshopId: WORKSHOP_ID,
    title: process.env.WORKSHOP_TITLE,
    capacity: workshop?.capacity ?? CAPACITY,
    registered: registrationsCount,
    remaining: Math.max((workshop?.capacity ?? CAPACITY) - registrationsCount, 0),
    registrationOpen: workshop?.registrationOpen !== false
  });
});

app.patch('/api/admin/workshop', adminRequired, async (req, res) => {
  const update = {};
  let capacity;
  if (Object.hasOwn(req.body || {}, 'capacity')) {
    capacity = Number(req.body?.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      return res.status(400).json({ message: 'عدد المقاعد يجب أن يكون رقمًا صحيحًا أكبر من صفر.' });
    }
    update.capacity = capacity;
  }

  if (Object.hasOwn(req.body || {}, 'registrationOpen')) {
    update.registrationOpen = req.body.registrationOpen === true;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ message: 'لا يوجد تعديل مطلوب.' });
  }

  const registrationsCount = await Registration.countDocuments({ workshopId: WORKSHOP_ID });
  if (capacity && capacity < registrationsCount) {
    return res.status(400).json({ message: `لا يمكن جعل الحد أقل من عدد المسجلين الحالي (${registrationsCount}).` });
  }

  const setOnInsert = { workshopId: WORKSHOP_ID };
  if (!Object.hasOwn(update, 'capacity')) setOnInsert.capacity = CAPACITY;
  if (!Object.hasOwn(update, 'registrationOpen')) setOnInsert.registrationOpen = true;

  const workshop = await Workshop.findOneAndUpdate(
    { workshopId: WORKSHOP_ID },
    { $set: { ...update, registeredCount: registrationsCount }, $setOnInsert: setOnInsert },
    { upsert: true, new: true }
  ).lean();
  res.json({ message: 'تم تحديث إعدادات الورشة.', capacity: workshop.capacity, registered: registrationsCount, remaining: Math.max(workshop.capacity - registrationsCount, 0), registrationOpen: workshop.registrationOpen !== false });
});

app.get('/api/admin/registrations', adminRequired, async (_req, res) => {
  const registrations = await Registration.find({ workshopId: WORKSHOP_ID })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ registrations });
});

app.get('/api/admin/registrations.csv', adminRequired, async (_req, res) => {
  const registrations = await Registration.find({ workshopId: WORKSHOP_ID })
    .sort({ createdAt: -1 })
    .lean();
  const headers = ['fullName', 'email', 'phone', 'participantType', 'country', 'experience', 'consentAccepted', 'createdAt'];
  const rows = [
    headers.join(','),
    ...registrations.map((registration) => headers.map((header) => csvEscape(registration[header])).join(','))
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(`\uFEFF${rows.join('\n')}`);
});

app.get('/api/admin/registrations.json', adminRequired, async (_req, res) => {
  const registrations = await Registration.find({ workshopId: WORKSHOP_ID })
    .sort({ createdAt: -1 })
    .lean();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.json"');
  res.json(registrations);
});

app.get('/api/admin/custom-fields', adminRequired, async (_req, res) => {
  try {
    const fields = await CustomField.find({ workshopId: WORKSHOP_ID, active: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return res.json({ fields });
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب الحقول المخصصة.' });
  }
});

app.post('/api/admin/custom-fields', adminRequired, async (req, res) => {
  const { fieldName, fieldType, fieldLabel, placeholder, required, options } = req.body || {};
  
  if (!fieldName || !fieldType || !fieldLabel) {
    return res.status(400).json({ message: 'اسم الحقل ونوع الحقل وتسمية الحقل مطلوبة.' });
  }
  
  try {
    const maxOrder = await CustomField.findOne({ workshopId: WORKSHOP_ID })
      .sort({ order: -1 })
      .lean();
    const field = await CustomField.create({
      workshopId: WORKSHOP_ID,
      fieldName,
      fieldType,
      fieldLabel,
      placeholder: placeholder || '',
      required: required || false,
      options: options || [],
      order: (maxOrder?.order || 0) + 1
    });
    return res.json({ message: 'تم إنشاء الحقل المخصص بنجاح.', field });
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء إنشاء الحقل المخصص.' });
  }
});

app.delete('/api/admin/custom-fields/:fieldId', adminRequired, async (req, res) => {
  const { fieldId } = req.params;
  
  try {
    const result = await CustomField.deleteOne({ _id: fieldId, workshopId: WORKSHOP_ID });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'الحقل المخصص غير موجود.' });
    }
    return res.json({ message: 'تم حذف الحقل المخصص بنجاح.' });
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء حذف الحقل المخصص.' });
  }
});

app.get('/api/admin/sms-settings', adminRequired, async (_req, res) => {
  try {
    const settings = await SmsSettings.findOne({ workshopId: WORKSHOP_ID }).lean();
    if (!settings) {
      return res.json({ 
        smsEnabled: false, 
        notifyOnNewRegistration: true, 
        notifyOnCapacityAlert: true 
      });
    }
    // Don't send sensitive data
    const { twilioAuthToken, ...safeSettings } = settings;
    return res.json(safeSettings);
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء جلب إعدادات SMS.' });
  }
});

app.post('/api/admin/sms-settings', adminRequired, async (req, res) => {
  const { twilioAccountSid, twilioAuthToken, twilioPhoneNumber, smsEnabled, notifyOnNewRegistration, notifyOnCapacityAlert, adminPhoneNumber } = req.body || {};
  
  try {
    const settings = await SmsSettings.findOneAndUpdate(
      { workshopId: WORKSHOP_ID },
      { 
        twilioAccountSid, 
        twilioAuthToken, 
        twilioPhoneNumber, 
        smsEnabled: smsEnabled || false, 
        notifyOnNewRegistration: notifyOnNewRegistration !== false, 
        notifyOnCapacityAlert: notifyOnCapacityAlert !== false, 
        adminPhoneNumber,
        updatedAt: Date.now()
      },
      { upsert: true, new: true }
    );
    
    const { twilioAuthToken: _, ...safeSettings } = settings.toObject();
    return res.json({ message: 'تم حفظ إعدادات SMS بنجاح.', settings: safeSettings });
  } catch (error) {
    return res.status(500).json({ message: 'حدث خطأ أثناء حفظ إعدادات SMS.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

mongoose.connect(MONGODB_URI)
  .then(async () => {
    await Promise.all([Registration.init(), Workshop.init(), Admin.init(), CustomField.init(), SmsSettings.init()]);
    await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID },
      { $setOnInsert: { workshopId: WORKSHOP_ID, capacity: CAPACITY, registeredCount: 0, registrationOpen: true } },
      { upsert: true }
    );
    app.listen(PORT, HOST, () => console.log(`Workshop app running on ${HOST}:${PORT}`));
  })
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
