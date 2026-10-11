# Img2XML AI (Offline Local Reconstructor)

## العربية

هذه الأداة تعمل **محليًا بالكامل** داخل المتصفح لتحليل صورة واجهة (Screenshot/UI Mock) وإعادة بنائها كنموذج واجهة قابل للتعديل ثم توليد Android XML.

> ملاحظة مهمة: التحويل من صورة واحدة ليس مطابقًا 100% لهيكل المشروع الأصلي في Android Studio، لأن الصورة لا تحتوي على source hierarchy أو النص الأصلي الحقيقي دائمًا. لذلك تنتج الأداة **نموذجًا عمليًا متكاملًا قابلًا للتعديل** مع درجات ثقة وتحذيرات.

### الميزات

- بدون API خارجي أو نموذج ذكاء اصطناعي خارجي أو إنترنت.
- Pipeline محلي متعدد المراحل:
  - قراءة الأبعاد ونسبة الصورة.
  - تقدير الخلفية.
  - استخراج مناطق متصلة وتحليل الحواف.
  - تصنيف عناصر مرئية (حاويات/بطاقات/صور/أيقونات/أزرار/حقول/نصوص تقديرية).
  - بناء شجرة Screen > Containers > Components.
- محرر بصري:
  - صناديق فوق الصورة.
  - اختيار عنصر وتعديل النوع/ID/النص/اللون/الثقة.
  - إضافة/حذف/دمج عناصر.
- توليد Android XML مع namespace صحيح وخصائص layout أساسية.
- مخرجات:
  - `layout.xml`
  - `model.json`
  - ملف ZIP يحوي XML + JSON + resources + README.
- معاينة للصورة الأصلية وللواجهة المستنتجة.

### التشغيل

1. افتح `index.html` مباشرة (أو عبر GitHub Pages).
2. ارفع صورة.
3. اضغط **تحليل الصورة**.
4. عدّل العناصر في المحرر.
5. صدّر XML/JSON أو ZIP.

> يوجد ملفا اختبار محليان داخل `fixtures/` للتجربة السريعة.

### تحسين النتيجة داخل Android Studio

- راجع العناصر ذات الثقة المنخفضة أولًا.
- حسّن القيود Constraints يدويًا في `ConstraintLayout`.
- استبدل نصوص placeholder بالنصوص الحقيقية.
- انقل الألوان/الأبعاد إلى `colors.xml` و `dimens.xml` بشكل نهائي.
- افحص الوضعين Light/Dark على محاكي Android.

---

## English

This tool runs **fully offline in-browser** to analyze a single UI image/screenshot, reconstruct an editable UI model, and generate Android XML.

> Important: single-image conversion cannot be 100% identical to original Android source hierarchy/text. The app therefore outputs a **practical editable UI model** with confidence scores and warnings.

### Features

- No external AI API, no internet dependency.
- Multi-stage local pipeline:
  - image dimensions/aspect detection,
  - background estimation,
  - connected regions + edge analysis,
  - visual component classification,
  - Screen > containers > components tree.
- Visual editor:
  - overlay boxes,
  - edit type/ID/text/color/confidence,
  - add/delete/merge nodes.
- Android XML generation with valid namespaces and layout attributes.
- Export outputs:
  - `layout.xml`
  - `model.json`
  - ZIP bundle with generated artifacts.
- Original-vs-inferred preview modes.

### How to run

1. Open `index.html` directly (or host on GitHub Pages).
2. Upload an image.
3. Click **Analyze Image**.
4. Refine detected nodes in the editor.
5. Export XML/JSON/ZIP.

> Local sample fixtures are available in `fixtures/` for quick testing.

### Post-process in Android Studio

- Prioritize low-confidence elements for manual adjustment.
- Refine constraints and responsive behavior.
- Replace placeholders with real text and resources.
- Validate dark/light themes and device sizes.
