import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const WORKSHOP_ID = process.env.WORKSHOP_ID || 'ai-law-2026';
const CAPACITY = Number(process.env.WORKSHOP_CAPACITY || 100);
const MONGODB_URI = process.env.MONGODB_URI;
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
  registeredCount: { type: Number, default: 0 }
});
const Workshop = mongoose.model('Workshop', workshopSchema);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'legal-ai-workshop-registration' });
});

app.get('/api/workshop', async (_req, res) => {
  try {
    const workshop = await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID },
      { $setOnInsert: { workshopId: WORKSHOP_ID, capacity: CAPACITY, registeredCount: 0 } },
      { upsert: true, new: true }
    ).lean();
    res.json({ title: process.env.WORKSHOP_TITLE, capacity: workshop.capacity, registered: workshop.registeredCount, remaining: Math.max(workshop.capacity - workshop.registeredCount, 0) });
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
    const workshop = await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID, $expr: { $lt: ['$registeredCount', '$capacity'] } },
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

app.use(express.static(path.join(__dirname, 'public')));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

mongoose.connect(MONGODB_URI)
  .then(async () => {
    await Workshop.findOneAndUpdate(
      { workshopId: WORKSHOP_ID },
      { $setOnInsert: { workshopId: WORKSHOP_ID, capacity: CAPACITY, registeredCount: 0 } },
      { upsert: true }
    );
    app.listen(PORT, HOST, () => console.log(`Workshop app running on ${HOST}:${PORT}`));
  })
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });
