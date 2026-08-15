# نشر المشروع على Render

المشروع يعمل كخدمة Node.js واحدة: الواجهة والـ API من نفس الخادم.

## قبل النشر

1. غيّر كلمة مرور مستخدم MongoDB Atlas لأن كلمة المرور استُخدمت أثناء التجربة.
2. حدّث `MONGODB_URI` في ملف `.env` محليًا بالكلمة الجديدة.
3. تأكد أن `.env` غير مرفوع إلى GitHub. الملف محمي داخل `.gitignore`.

## 1. رفع المشروع إلى GitHub

إذا لم يكن المشروع مرفوعًا بعد:

```powershell
git init
git add .
git commit -m "Initial workshop registration app"
git branch -M main
```

ثم أنشئ Repository جديد في GitHub واربطه:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/legal-ai-workshop.git
git push -u origin main
```

## 2. إنشاء Web Service في Render

1. افتح https://dashboard.render.com
2. اضغط `New`.
3. اختر `Web Service`.
4. اربط حساب GitHub إذا طُلب منك.
5. اختر repository الخاص بالمشروع.
6. استخدم هذه الإعدادات:

```text
Name: legal-ai-workshop
Language / Runtime: Node
Branch: main
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

اختر الخطة المجانية إذا كانت مناسبة لك.

## 3. إضافة Environment Variables

داخل صفحة إنشاء الخدمة أو من `Environment` أضف:

```env
MONGODB_URI=رابط MongoDB Atlas الحقيقي بعد تغيير كلمة المرور
WORKSHOP_ID=ai-law-2026
WORKSHOP_TITLE=كيفية إدخال واستخدام الذكاء الاصطناعي في القانون (بشكل خاص المحاماة)
WORKSHOP_CAPACITY=100
CORS_ORIGIN=
NODE_VERSION=20
ADMIN_USERNAME=اسم مستخدم لوحة الإدارة
ADMIN_PASSWORD=كلمة مرور قوية للوحة الإدارة
ADMIN_SECRET=نص طويل عشوائي لتأمين جلسة الإدارة
```

لا تضف `PORT` في Render. Render يحددها تلقائيًا.

## 4. إعداد MongoDB Network Access

في MongoDB Atlas:

1. افتح `Database & Network Access`.
2. اختر `Network Access`.
3. أضف IP:

```text
0.0.0.0/0
```

هذا ضروري غالبًا لأن Render لا يعطيك IP ثابت في الخطة المجانية.

## 5. بعد اكتمال النشر

Render سيعطيك رابطًا مثل:

```text
https://legal-ai-workshop.onrender.com
```

افتح الرابط وجرب تسجيلًا جديدًا، ثم تأكد من ظهوره في MongoDB Atlas داخل collection باسم `registrations`.

## ملاحظات مهمة

- على الخطة المجانية قد يتأخر فتح الموقع أول مرة بعد فترة خمول.
- إذا فشل النشر، افتح تبويب `Logs` في Render وابحث عن رسالة الخطأ.
- لا تضع ملف `.env` في GitHub أبدًا.
