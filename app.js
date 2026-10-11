const refs = {
  fileInput: document.getElementById("fileInput"),
  pickFileBtn: document.getElementById("pickFileBtn"),
  dropZone: document.getElementById("dropZone"),
  imagePreview: document.getElementById("imagePreview"),
  emptyPreview: document.getElementById("emptyPreview"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  reanalyzeBtn: document.getElementById("reanalyzeBtn"),
  xmlEditor: document.getElementById("xmlEditor"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  statusBadge: document.getElementById("statusBadge"),
  statusMessage: document.getElementById("statusMessage"),
  uiPreview: document.getElementById("uiPreview"),
  rootType: document.getElementById("rootType"),
  layoutDirection: document.getElementById("layoutDirection"),
  packageName: document.getElementById("packageName"),
  activityName: document.getElementById("activityName"),
  detectColors: document.getElementById("detectColors"),
};

let selectedFile = null;
let selectedImage = null;
let lastAnalysis = null;

refs.pickFileBtn.addEventListener("click", () => refs.fileInput.click());
refs.fileInput.addEventListener("change", (e) => {
  if (e.target.files?.[0]) setImageFile(e.target.files[0]);
});
refs.dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  refs.dropZone.classList.add("drag-over");
});
refs.dropZone.addEventListener("dragleave", () => refs.dropZone.classList.remove("drag-over"));
refs.dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  refs.dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (file) setImageFile(file);
});
refs.dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") refs.fileInput.click();
});

refs.analyzeBtn.addEventListener("click", () => runAnalysis(false));
refs.reanalyzeBtn.addEventListener("click", () => runAnalysis(true));
refs.copyBtn.addEventListener("click", copyXml);
refs.downloadBtn.addEventListener("click", downloadXml);

function setStatus(type, message) {
  refs.statusBadge.className = "status";
  if (type) refs.statusBadge.classList.add(type);
  const names = {
    ok: "نجاح",
    warn: "تنبيه",
    error: "خطأ",
    loading: "تحميل",
  };
  refs.statusBadge.textContent = names[type] || "جاهز";
  refs.statusMessage.textContent = message;
}

function setImageFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("error", "الملف المرفوع ليس صورة صالحة.");
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    refs.imagePreview.src = String(reader.result);
    refs.imagePreview.style.display = "block";
    refs.emptyPreview.style.display = "none";
    setStatus("ok", "تم تحميل الصورة بنجاح. يمكنك بدء التحليل.");
    loadImageElement(String(reader.result)).then((img) => {
      selectedImage = img;
    }).catch(() => {
      selectedImage = null;
      setStatus("error", "تعذر قراءة الصورة داخل المتصفح.");
    });
  };
  reader.readAsDataURL(file);
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function runAnalysis(isReanalysis) {
  if (!selectedFile || !selectedImage) {
    setStatus("warn", "لا توجد صورة للتحليل. اختر صورة أولًا.");
    return;
  }

  setStatus("loading", isReanalysis ? "جارٍ إعادة التحليل..." : "جارٍ تحليل الصورة...");
  refs.analyzeBtn.disabled = true;
  refs.reanalyzeBtn.disabled = true;

  try {
    await new Promise((resolve) => setTimeout(resolve, 60));
    const analysis = analyzeImage(selectedImage);
    lastAnalysis = analysis;
    const xml = buildAndroidXml(analysis);
    refs.xmlEditor.value = xml;
    renderUiPreview(analysis);

    if (analysis.warnings.length) {
      setStatus("warn", `اكتمل التحليل مع ملاحظات: ${analysis.warnings.join(" | ")}`);
    } else {
      setStatus("ok", "اكتمل التحليل وتوليد XML بنجاح.");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء التحليل.";
    setStatus("error", msg);
  } finally {
    refs.analyzeBtn.disabled = false;
    refs.reanalyzeBtn.disabled = false;
  }
}

function analyzeImage(img) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر تهيئة Canvas.");

  const maxW = 420;
  const scale = Math.min(1, maxW / img.width);
  canvas.width = Math.max(32, Math.round(img.width * scale));
  canvas.height = Math.max(32, Math.round(img.height * scale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const detectColors = refs.detectColors.checked;
  const backgroundColor = detectColors ? estimateBackgroundColor(imgData, canvas.width, canvas.height) : "#F5F5F5";

  const blocks = detectBlocks(ctx, canvas.width, canvas.height, imgData);
  const elements = classifyBlocks(blocks, canvas.width, canvas.height, detectColors);
  const warnings = [];

  if (!elements.length) {
    warnings.push("لم يتم اكتشاف عناصر واضحة؛ تم إنشاء تخطيط أساسي.");
    elements.push({
      type: "text",
      x: 16,
      y: 16,
      w: Math.max(120, canvas.width - 32),
      h: 40,
      color: "#333333",
      bgColor: "#FFFFFF",
      text: "عنوان",
      confidence: 0.3,
    });
  }

  return {
    width: canvas.width,
    height: canvas.height,
    backgroundColor,
    elements,
    warnings,
  };
}

function estimateBackgroundColor(data, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let c = 0;

  const samples = [];
  for (let x = 0; x < width; x += 4) {
    samples.push([x, 0], [x, height - 1]);
  }
  for (let y = 0; y < height; y += 4) {
    samples.push([0, y], [width - 1, y]);
  }

  for (const [x, y] of samples) {
    const i = (y * width + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    c += 1;
  }

  return rgbToHex(r / c, g / c, b / c);
}

function detectBlocks(ctx, width, height, data) {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
  }

  const edges = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[y * width + (x - 1)] - gray[(y + 1) * width + (x - 1)] +
        gray[(y - 1) * width + (x + 1)] + 2 * gray[y * width + (x + 1)] + gray[(y + 1) * width + (x + 1)];
      const gy =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
      edges[i] = Math.sqrt(gx * gx + gy * gy) > 70 ? 1 : 0;
    }
  }

  const visited = new Uint8Array(width * height);
  const blocks = [];
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (!edges[idx] || visited[idx]) continue;

      let minX = x, maxX = x, minY = y, maxY = y;
      let count = 0;
      const stack = [[x, y]];
      visited[idx] = 1;

      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
          const ni = ny * width + nx;
          if (!edges[ni] || visited[ni]) continue;
          visited[ni] = 1;
          stack.push([nx, ny]);
        }
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const area = w * h;
      if (area < 180 || count < 45) continue;

      const avg = averageColor(ctx, minX, minY, w, h);
      blocks.push({ x: minX, y: minY, w, h, area, edgePixels: count, avg });
    }
  }

  blocks.sort((a, b) => a.y - b.y || a.x - b.x);
  return mergeOverlappingBlocks(blocks, width, height);
}

function mergeOverlappingBlocks(blocks) {
  const merged = [];

  for (const block of blocks) {
    let absorbed = false;

    for (const target of merged) {
      if (intersects(block, target)) {
        const x1 = Math.min(block.x, target.x);
        const y1 = Math.min(block.y, target.y);
        const x2 = Math.max(block.x + block.w, target.x + target.w);
        const y2 = Math.max(block.y + block.h, target.y + target.h);
        target.x = x1;
        target.y = y1;
        target.w = x2 - x1;
        target.h = y2 - y1;
        target.area = target.w * target.h;
        target.avg = block.avg;
        absorbed = true;
        break;
      }
    }

    if (!absorbed) merged.push({ ...block });
  }

  return merged.filter((b) => b.w > 16 && b.h > 12);
}

function intersects(a, b) {
  const expand = 6;
  return !(
    a.x + a.w + expand < b.x ||
    b.x + b.w + expand < a.x ||
    a.y + a.h + expand < b.y ||
    b.y + b.h + expand < a.y
  );
}

function classifyBlocks(blocks, width, height, useColor) {
  const totalArea = width * height;
  let counter = 1;

  return blocks.map((b) => {
    const ratio = b.w / Math.max(1, b.h);
    const relArea = b.area / totalArea;
    let type = "text";
    let text = "نص";
    let confidence = 0.55;

    if (relArea > 0.28 || (b.w > width * 0.55 && b.h > height * 0.28)) {
      type = "image";
      text = "صورة";
      confidence = 0.72;
    } else if (ratio > 2.1 && b.h < height * 0.14) {
      type = "button";
      text = "زر";
      confidence = 0.67;
    } else if (ratio > 2.6 && b.h < height * 0.1) {
      type = "input";
      text = "إدخال";
      confidence = 0.62;
    } else if (b.h > 90 && b.w > width * 0.45) {
      type = "card";
      text = "بطاقة";
      confidence = 0.6;
    }

    const id = `${type}_${counter++}`;
    return {
      ...b,
      id,
      type,
      text,
      confidence,
      color: useColor ? b.avg : "#333333",
      bgColor: useColor ? brightenHex(b.avg, 0.86) : "#FFFFFF",
    };
  });
}

function averageColor(ctx, x, y, w, h) {
  const data = ctx.getImageData(x, y, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let c = 0;

  for (let i = 0; i < data.length; i += 16) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    c += 1;
  }

  return rgbToHex(r / c, g / c, b / c);
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function brightenHex(hex, factor) {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!parsed) return "#FFFFFF";
  const r = parseInt(parsed[1], 16);
  const g = parseInt(parsed[2], 16);
  const b = parseInt(parsed[3], 16);
  const mix = (v) => Math.round(v + (255 - v) * (1 - factor));
  return rgbToHex(mix(r), mix(g), mix(b));
}

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function buildAndroidXml(analysis) {
  const rootType = refs.rootType.value;
  const direction = refs.layoutDirection.value;
  const packageName = refs.packageName.value.trim();
  const activityName = refs.activityName.value.trim();
  const lines = [];

  if (packageName || activityName) {
    lines.push("<!-- معلومات اختيارية -->");
    if (packageName) lines.push(`<!-- package: ${packageName} -->`);
    if (activityName) lines.push(`<!-- activity: ${activityName} -->`);
  }

  const rootOpen =
    rootType === "ConstraintLayout"
      ? `<androidx.constraintlayout.widget.ConstraintLayout\n    xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    xmlns:app=\"http://schemas.android.com/apk/res-auto\"\n    android:layout_width=\"match_parent\"\n    android:layout_height=\"match_parent\"\n    android:padding=\"16dp\"\n    android:background=\"${analysis.backgroundColor}\"\n    android:layoutDirection=\"${direction}\">`
      : `<LinearLayout\n    xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    android:layout_width=\"match_parent\"\n    android:layout_height=\"match_parent\"\n    android:orientation=\"vertical\"\n    android:padding=\"16dp\"\n    android:background=\"${analysis.backgroundColor}\"\n    android:layoutDirection=\"${direction}\">`;

  lines.push(rootOpen);

  const sorted = [...analysis.elements].sort((a, b) => a.y - b.y || a.x - b.x);
  sorted.forEach((el, index) => {
    const widthDp = Math.max(48, Math.round((el.w / analysis.width) * 320));
    const heightDp = Math.max(24, Math.round((el.h / analysis.height) * 640));
    const marginTop = Math.max(6, Math.round((el.y / analysis.height) * 18));
    const id = sanitizeId(el.id || `item_${index + 1}`);

    if (rootType === "ConstraintLayout") {
      lines.push(...buildConstraintItem(el, id, widthDp, heightDp, marginTop));
    } else {
      lines.push(...buildLinearItem(el, id, widthDp, heightDp, marginTop));
    }
  });

  lines.push(`</${rootType === "ConstraintLayout" ? "androidx.constraintlayout.widget.ConstraintLayout" : "LinearLayout"}>`);

  return lines.join("\n");
}

function buildConstraintItem(el, id, widthDp, heightDp, marginTop) {
  const common = [
    `    android:id=\"@+id/${id}\"`,
    `    android:layout_width=\"${widthDp}dp\"`,
    `    android:layout_height=\"${heightDp}dp\"`,
    `    android:layout_marginTop=\"${marginTop}dp\"`,
    `    app:layout_constraintTop_toTopOf=\"parent\"`,
    `    app:layout_constraintStart_toStartOf=\"parent\"`,
  ];

  if (el.type === "image") {
    return [
      "",
      "  <ImageView",
      ...common.map((c) => `    ${c.trim()}`),
      `    android:contentDescription=\"منطقة صورة\"`,
      `    android:background=\"${el.bgColor}\" />`,
    ];
  }

  if (el.type === "button") {
    return [
      "",
      "  <Button",
      ...common.map((c) => `    ${c.trim()}`),
      `    android:text=\"${el.text}\"`,
      `    android:textColor=\"#111111\"`,
      `    android:backgroundTint=\"${el.bgColor}\" />`,
    ];
  }

  if (el.type === "input") {
    return [
      "",
      "  <EditText",
      ...common.map((c) => `    ${c.trim()}`),
      `    android:hint=\"حقل إدخال\"`,
      `    android:textColor=\"#111111\"`,
      `    android:background=\"${el.bgColor}\" />`,
    ];
  }

  if (el.type === "card") {
    return [
      "",
      "  <LinearLayout",
      ...common.map((c) => `    ${c.trim()}`),
      `    android:orientation=\"vertical\"`,
      `    android:background=\"${el.bgColor}\"`,
      `    android:padding=\"12dp\">`,
      "    <TextView",
      "      android:layout_width=\"wrap_content\"",
      "      android:layout_height=\"wrap_content\"",
      "      android:text=\"بطاقة\"",
      "      android:textStyle=\"bold\" />",
      "  </LinearLayout>",
    ];
  }

  return [
    "",
    "  <TextView",
    ...common.map((c) => `    ${c.trim()}`),
    `    android:text=\"${el.text}\"`,
    `    android:textColor=\"${el.color}\"`,
    `    android:background=\"${el.bgColor}\" />`,
  ];
}

function buildLinearItem(el, id, widthDp, heightDp, marginTop) {
  const common = [
    `    android:id=\"@+id/${id}\"`,
    `    android:layout_width=\"match_parent\"`,
    `    android:layout_height=\"${heightDp}dp\"`,
    `    android:layout_marginTop=\"${marginTop}dp\"`,
  ];

  if (el.type === "image") {
    return ["", "  <ImageView", ...common.map((c) => `    ${c.trim()}`), `    android:contentDescription=\"منطقة صورة\"`, `    android:background=\"${el.bgColor}\" />`];
  }
  if (el.type === "button") {
    return ["", "  <Button", ...common.map((c) => `    ${c.trim()}`), `    android:text=\"${el.text}\"`, `    android:backgroundTint=\"${el.bgColor}\" />`];
  }
  if (el.type === "input") {
    return ["", "  <EditText", ...common.map((c) => `    ${c.trim()}`), `    android:hint=\"حقل إدخال\"`, `    android:background=\"${el.bgColor}\" />`];
  }
  if (el.type === "card") {
    return [
      "",
      "  <LinearLayout",
      ...common.map((c) => `    ${c.trim()}`),
      "    android:orientation=\"vertical\"",
      `    android:background=\"${el.bgColor}\"`,
      "    android:padding=\"12dp\">",
      "    <TextView",
      "      android:layout_width=\"wrap_content\"",
      "      android:layout_height=\"wrap_content\"",
      "      android:text=\"بطاقة\" />",
      "  </LinearLayout>",
    ];
  }

  return ["", "  <TextView", ...common.map((c) => `    ${c.trim()}`), `    android:text=\"${el.text}\"`, `    android:textColor=\"${el.color}\"`, `    android:background=\"${el.bgColor}\" />`];
}

function renderUiPreview(analysis) {
  refs.uiPreview.innerHTML = "";
  const root = document.createElement("div");
  root.className = "preview-root";
  refs.uiPreview.appendChild(root);

  const elements = [...analysis.elements].sort((a, b) => a.y - b.y || a.x - b.x);
  elements.forEach((el) => {
    const item = document.createElement("div");
    item.className = `preview-item ${el.type}`;
    const label = `${toArabicType(el.type)} · ثقة ${(el.confidence * 100).toFixed(0)}%`;
    item.textContent = label;
    item.style.minHeight = `${Math.max(24, Math.round((el.h / analysis.height) * 120))}px`;
    item.style.background = el.bgColor;
    root.appendChild(item);
  });
}

function toArabicType(type) {
  const map = {
    image: "صورة",
    text: "نص",
    button: "زر",
    input: "إدخال",
    card: "بطاقة",
  };
  return map[type] || "عنصر";
}

async function copyXml() {
  const content = refs.xmlEditor.value.trim();
  if (!content) {
    setStatus("warn", "لا يوجد XML للنسخ.");
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    setStatus("ok", "تم نسخ XML إلى الحافظة.");
  } catch {
    refs.xmlEditor.select();
    document.execCommand("copy");
    setStatus("warn", "تم النسخ بطريقة بديلة. تحقق من الحافظة.");
  }
}

function downloadXml() {
  const content = refs.xmlEditor.value.trim();
  if (!content) {
    setStatus("warn", "لا يوجد XML للتنزيل.");
    return;
  }

  const blob = new Blob([content], { type: "text/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "layout_generated.xml";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("ok", "تم تنزيل ملف XML.");
}

setStatus("", "ابدأ برفع صورة ثم اضغط تحليل.");
if (lastAnalysis === null) {
  refs.uiPreview.innerHTML = '<p class="muted">سيتم عرض المعاينة بعد التحليل</p>';
}
