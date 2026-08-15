# إعداد MongoDB Atlas للمشروع

هذا الدليل يجهز قاعدة بيانات MongoDB Atlas حتى يعمل نموذج التسجيل ويحفظ بيانات المشاركين.

## 1. إنشاء حساب ومشروع

1. افتح موقع MongoDB Atlas: https://www.mongodb.com/cloud/atlas
2. أنشئ حسابًا أو سجل الدخول.
3. أنشئ مشروعًا جديدًا، مثل: `Legal AI Workshop`.

## 2. إنشاء Cluster مجاني

1. من داخل المشروع اختر `Build a Database`.
2. اختر الخطة المجانية `M0`.
3. اختر أقرب منطقة لك أو اترك الاختيار الافتراضي.
4. سمّ الـ cluster مثلًا: `legal-ai-workshop`.
5. اضغط `Create`.

## 3. إنشاء مستخدم قاعدة البيانات

1. افتح `Database Access`.
2. اختر `Add New Database User`.
3. اختر طريقة `Password`.
4. اكتب اسم مستخدم، مثل: `workshop_admin`.
5. أنشئ كلمة مرور قوية واحفظها في مكان آمن.
6. أعطه صلاحية `Read and write to any database`.
7. اضغط `Add User`.

مهم: هذا المستخدم ليس حسابك في MongoDB، بل مستخدم خاص يتصل به التطبيق بقاعدة البيانات.

## 4. السماح بالاتصال من جهازك أو Render

1. افتح `Network Access`.
2. اضغط `Add IP Address`.
3. أثناء التطوير المحلي اختر `Add Current IP Address`.
4. عند النشر على Render يمكنك مؤقتًا إضافة:

```text
0.0.0.0/0
```

هذا يسمح لأي خادم بالاتصال بقاعدة البيانات. استخدمه فقط إذا لم يكن لديك IP ثابت للخادم، واحرص على أن تكون كلمة مرور مستخدم قاعدة البيانات قوية.

## 5. الحصول على رابط الاتصال

1. افتح `Database`.
2. اضغط `Connect` بجانب الـ cluster.
3. اختر `Drivers`.
4. اختر `Node.js`.
5. انسخ الرابط الذي يشبه:

```text
mongodb+srv://workshop_admin:<db_password>@legal-ai-workshop.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

6. استبدل `<db_password>` بكلمة المرور.
7. أضف اسم قاعدة البيانات بعد `.net/`، مثل:

```text
mongodb+srv://workshop_admin:YOUR_PASSWORD@legal-ai-workshop.xxxxx.mongodb.net/legal_workshop?retryWrites=true&w=majority
```

إذا كانت كلمة المرور تحتوي رموزًا مثل `@` أو `#` أو `/`، فأنشئ كلمة مرور أبسط أو استخدم ترميز URL لهذه الرموز.

## 6. إنشاء ملف البيئة المحلي

انسخ الملف:

```bash
cp .env.example .env
```

على Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

ثم افتح `.env` وضع القيم الحقيقية:

```env
PORT=3000
MONGODB_URI=mongodb+srv://workshop_admin:YOUR_PASSWORD@legal-ai-workshop.xxxxx.mongodb.net/legal_workshop?retryWrites=true&w=majority
WORKSHOP_ID=ai-law-2026
WORKSHOP_TITLE=كيفية إدخال واستخدام الذكاء الاصطناعي في القانون (بشكل خاص المحاماة)
WORKSHOP_CAPACITY=100
CORS_ORIGIN=
```

اترك `CORS_ORIGIN` فارغًا في التطوير المحلي. عند النشر، يمكن وضع رابط الواجهة مثل:

```env
CORS_ORIGIN=https://your-site.onrender.com
```

## 7. تشغيل المشروع محليًا

```bash
npm install
npm start
```

ثم افتح:

```text
http://localhost:3000
```

## 8. التأكد من حفظ التسجيلات

بعد تسجيل تجربة:

1. افتح MongoDB Atlas.
2. ادخل إلى `Database`.
3. اضغط `Browse Collections`.
4. اختر قاعدة `legal_workshop`.
5. ستجد غالبًا collections باسم:
   - `registrations`
   - `workshops`

## 9. متغيرات Render لاحقًا

عند نشر المشروع على Render ضع هذه القيم داخل `Environment`:

```env
MONGODB_URI=رابط MongoDB الحقيقي
WORKSHOP_ID=ai-law-2026
WORKSHOP_TITLE=كيفية إدخال واستخدام الذكاء الاصطناعي في القانون (بشكل خاص المحاماة)
WORKSHOP_CAPACITY=100
CORS_ORIGIN=https://رابط-الموقع-بعد-النشر
```

Render يحدد `PORT` تلقائيًا، لذلك لا تحتاج غالبًا لإضافته هناك.
