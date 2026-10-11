# img2xml-ai (Offline Web App)

## العربية

تطبيق ويب static لتحويل صورة واجهة إلى **Android XML** بشكل محلي بالكامل داخل المتصفح، بدون أي API خارجي، وبدون أي نموذج ذكاء اصطناعي.

### الميزات
- واجهة عربية حديثة RTL ومتجاوبة (هاتف/سطح مكتب).
- رفع الصورة عبر اختيار ملف أو السحب والإفلات.
- تحليل محلي باستخدام JavaScript + Canvas + heuristics (تقديري).
- استخراج تقديرات لعناصر شائعة: الخلفية، الصور الكبيرة، النصوص، الأزرار، البطاقات، حقول الإدخال.
- توليد Android XML صالح باستخدام:
  - `ConstraintLayout` أو `LinearLayout`
  - عناصر `ImageView`, `TextView`, `Button`, `EditText`
- محرر XML قابل للتعديل + نسخ + تنزيل.
- معاينة تقريبية للواجهة الناتجة.
- إعدادات للتحكم في نوع الجذر، اتجاه التخطيط، الحزمة/النشاط (اختياري)، والتعرف على الألوان.
- حالات واضحة: عدم وجود صورة، التحميل، النجاح، الأخطاء، التحذيرات.

### التشغيل المحلي
#### الطريقة الأسرع
1. افتح الملف التالي مباشرة في المتصفح:
   - `/home/runner/work/img2xml-ai/img2xml-ai/index.html`

#### (اختياري) تشغيل عبر خادم محلي بسيط
يمكنك استخدام أي خادم static محلي (مثل `python -m http.server`) إذا رغبت، لكن ذلك غير مطلوب.

### الخصوصية
- جميع المعالجة تتم داخل المتصفح محليًا.
- لا يوجد أي اتصال شبكي مطلوب للتشغيل.
- لا يتم رفع الصور لأي خدمة خارجية.

### حدود التحليل (Heuristics)
- النتائج **تقديرية** وليست OCR أو فهمًا بصريًا دقيقًا.
- في الواجهات المعقدة قد لا يتم اكتشاف كل العناصر أو قد يتم تصنيف بعض العناصر بشكل مختلف.
- يمكنك دائمًا تعديل XML الناتج يدويًا من المحرر.

### طريقة الاستخدام
1. اختر صورة أو اسحبها لمنطقة الرفع.
2. عدّل الإعدادات حسب الحاجة.
3. اضغط "تحليل الصورة وتوليد XML".
4. راجع المعاينة وXML، ثم عدّل يدويًا إذا لزم.
5. انسخ XML أو نزّله كملف.

---

## English

A fully static web app that converts a UI image into **Android XML** completely offline in the browser, with no external APIs and no AI models.

### Features
- Arabic RTL responsive interface (mobile/desktop).
- Image upload by file picker or drag-and-drop.
- Local analysis using JavaScript + Canvas + heuristic rules.
- Practical estimation of common UI parts: background, large image regions, text-like regions, buttons, cards, and input fields.
- Valid Android XML generation using:
  - `ConstraintLayout` or `LinearLayout`
  - `ImageView`, `TextView`, `Button`, `EditText`
- Editable XML area with copy/download actions.
- Approximate UI preview for generated structure.
- Settings panel for root layout, direction, optional package/activity name, and color detection.
- Clear app states: no image, loading, success, error, warnings.

### Local run
- Open `index.html` directly in any modern browser.
- No install steps and no backend required.

### Privacy
- All processing happens locally in the browser.
- No network calls are required for app functionality.
- Images never leave the local device.

### Heuristic limitations
- Output is estimation-based and not perfect OCR/semantic detection.
- Complex designs may require manual XML adjustments.
- Re-run analysis with different settings, then refine the XML manually.
