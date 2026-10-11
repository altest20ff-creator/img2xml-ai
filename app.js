(() => {
  const el = {
    imageInput: document.getElementById('imageInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    resetBtn: document.getElementById('resetBtn'),
    progress: document.getElementById('progress'),
    warnings: document.getElementById('warnings'),
    sourceCanvas: document.getElementById('sourceCanvas'),
    overlay: document.getElementById('overlay'),
    inferredPreview: document.getElementById('inferredPreview'),
    treeView: document.getElementById('treeView'),
    selectedMeta: document.getElementById('selectedMeta'),
    propType: document.getElementById('propType'),
    propId: document.getElementById('propId'),
    propText: document.getElementById('propText'),
    propColor: document.getElementById('propColor'),
    propConfidence: document.getElementById('propConfidence'),
    propRadius: document.getElementById('propRadius'),
    savePropBtn: document.getElementById('savePropBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    addChildBtn: document.getElementById('addChildBtn'),
    mergeBtn: document.getElementById('mergeBtn'),
    toggleModeBtn: document.getElementById('toggleModeBtn'),
    regenBtn: document.getElementById('regenBtn'),
    xmlOutput: document.getElementById('xmlOutput'),
    jsonOutput: document.getElementById('jsonOutput'),
    resOutput: document.getElementById('resOutput'),
    copyXmlBtn: document.getElementById('copyXmlBtn'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),
    downloadXmlBtn: document.getElementById('downloadXmlBtn'),
    downloadJsonBtn: document.getElementById('downloadJsonBtn'),
    downloadZipBtn: document.getElementById('downloadZipBtn'),
    designWidth: document.getElementById('designWidth'),
    designHeight: document.getElementById('designHeight'),
    dpScale: document.getElementById('dpScale'),
    edgeSensitivity: document.getElementById('edgeSensitivity'),
    minArea: document.getElementById('minArea'),
    rootType: document.getElementById('rootType'),
    colorSystem: document.getElementById('colorSystem'),
    textDetect: document.getElementById('textDetect'),
    iconDetect: document.getElementById('iconDetect'),
    manualMode: document.getElementById('manualMode'),
    moveUpBtn: document.getElementById('moveUpBtn'),
    moveDownBtn: document.getElementById('moveDownBtn'),
    toRootBtn: document.getElementById('toRootBtn')
  };

  const state = {
    image: null,
    model: null,
    selectedId: null,
    secondarySelectedId: null,
    showInferred: false,
    idCounter: 1,
    warnings: []
  };

  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
  const rgbToHex = (r, g, b) => `#${[r,g,b].map(v => clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('')}`;
  const pxToDp = (px) => Math.max(1, Math.round(px / Number(el.dpScale.value || 3)));
  const pxToSp = (px) => Math.max(10, Math.round(px / Number(el.dpScale.value || 3)));

  function setProgress(text) { el.progress.textContent = text; }
  function warn(text) { state.warnings.push(`• ${text}`); el.warnings.textContent = state.warnings.join('\n'); }

  function resetAll() {
    state.image = null; state.model = null; state.selectedId = null; state.secondarySelectedId = null;
    state.idCounter = 1; state.warnings = [];
    el.warnings.textContent = '';
    el.overlay.innerHTML = '';
    el.inferredPreview.innerHTML = '';
    el.treeView.innerHTML = '';
    el.xmlOutput.value = '';
    el.jsonOutput.value = '';
    el.resOutput.value = '';
    const ctx = el.sourceCanvas.getContext('2d');
    ctx.clearRect(0, 0, el.sourceCanvas.width, el.sourceCanvas.height);
    setProgress('تمت إعادة الضبط.');
  }

  function uniqueId(prefix = 'view') {
    return `${prefix}_${state.idCounter++}`;
  }

  function getImageData(img) {
    const c = document.createElement('canvas');
    const maxEdge = 1200;
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { data: c.getContext('2d').getImageData(0, 0, c.width, c.height), w: c.width, h: c.height, scaleBack: 1 / scale };
  }

  function estimateBackground(pixels, w, h) {
    let rs = 0, gs = 0, bs = 0, n = 0;
    const border = Math.max(2, Math.floor(Math.min(w, h) * 0.03));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < border || y < border || x >= w - border || y >= h - border) {
          const i = (y * w + x) * 4;
          rs += pixels[i]; gs += pixels[i + 1]; bs += pixels[i + 2]; n++;
        }
      }
    }
    return { r: rs / n, g: gs / n, b: bs / n };
  }

  function createMask(data, w, h, bg, sensitivity) {
    const mask = new Uint8Array(w * h);
    const edgeMask = new Uint8Array(w * h);
    const lum = new Float32Array(w * h);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const dist = Math.abs(data[i] - bg.r) + Math.abs(data[i + 1] - bg.g) + Math.abs(data[i + 2] - bg.b);
      if (dist > sensitivity * 2.7) mask[p] = 1;
    }

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        const gx = lum[p + 1] - lum[p - 1];
        const gy = lum[p + w] - lum[p - w];
        const mag = Math.abs(gx) + Math.abs(gy);
        if (mag > sensitivity) edgeMask[p] = 1;
      }
    }
    return { mask, edgeMask, lum };
  }

  function connectedComponents(mask, w, h, minArea) {
    const seen = new Uint8Array(mask.length);
    const comps = [];
    const queueX = new Int32Array(mask.length);
    const queueY = new Int32Array(mask.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!mask[idx] || seen[idx]) continue;
        let qh = 0, qt = 0;
        queueX[qt] = x; queueY[qt] = y; qt++;
        seen[idx] = 1;
        let minX = x, minY = y, maxX = x, maxY = y, area = 0;
        while (qh < qt) {
          const cx = queueX[qh], cy = queueY[qh]; qh++; area++;
          if (cx < minX) minX = cx;
          if (cy < minY) minY = cy;
          if (cx > maxX) maxX = cx;
          if (cy > maxY) maxY = cy;
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = ny * w + nx;
            if (!seen[ni] && mask[ni]) {
              seen[ni] = 1;
              queueX[qt] = nx; queueY[qt] = ny; qt++;
            }
          }
        }
        if (area >= minArea) {
          comps.push({ minX, minY, maxX, maxY, area, w: maxX-minX+1, h: maxY-minY+1 });
        }
      }
    }
    return comps;
  }

  function estimateTextLines(imgData, w, box) {
    const bins = new Array(box.h).fill(0);
    for (let y = box.minY; y <= box.maxY; y++) {
      let dark = 0;
      for (let x = box.minX; x <= box.maxX; x++) {
        const i = (y * w + x) * 4;
        const l = imgData[i] * 0.299 + imgData[i+1] * 0.587 + imgData[i+2] * 0.114;
        if (l < 120) dark++;
      }
      bins[y - box.minY] = dark;
    }
    let lines = 0, inLine = false;
    const threshold = box.w * 0.09;
    for (const v of bins) {
      if (v > threshold && !inLine) { lines++; inLine = true; }
      if (v <= threshold) inLine = false;
    }
    return clamp(lines || 1, 1, 5);
  }

  function avgColor(imgData, w, box) {
    let r=0,g=0,b=0,n=0;
    for (let y = box.minY; y <= box.maxY; y+=2) {
      for (let x = box.minX; x <= box.maxX; x+=2) {
        const i = (y*w+x)*4;
        r += imgData[i]; g += imgData[i+1]; b += imgData[i+2]; n++;
      }
    }
    return { r: r/n, g: g/n, b: b/n };
  }

  function classify(comp, imgData, w, h, options) {
    const ratio = comp.w / comp.h;
    const areaRatio = comp.area / (w * h);
    const c = avgColor(imgData, w, comp);
    const color = rgbToHex(c.r, c.g, c.b);
    const lines = options.textDetect ? estimateTextLines(imgData, w, comp) : 1;

    let type = 'unknown', confidence = 0.45, text = '';
    if (areaRatio > 0.28 && comp.h > h * 0.18) { type = 'container'; confidence = 0.74; }
    if (ratio > 2.3 && comp.h < h * 0.12) { type = 'button'; confidence = 0.78; text = 'زر قابل للتعديل'; }
    if (ratio > 2.4 && comp.h < h * 0.08 && comp.minY < h * 0.15) { type = 'nav'; confidence = 0.73; }
    if (ratio > 2.6 && comp.h < h * 0.11 && comp.minY > h * 0.2) { type = 'input'; confidence = 0.76; text = 'Hint'; }
    if (Math.max(comp.w, comp.h) < Math.min(w,h) * 0.12) { type = options.iconDetect ? 'icon' : 'unknown'; confidence = 0.62; }
    if (lines >= 2 && comp.h < h * 0.18) { type = 'text'; confidence = 0.69; text = `نص قابل للتعديل (${lines} سطر)`; }
    if (ratio > 0.85 && ratio < 1.15 && comp.w > w * 0.22) { type = 'image'; confidence = Math.max(confidence, 0.71); }

    return {
      id: uniqueId(type === 'unknown' ? 'view' : type),
      type,
      confidence,
      text,
      bounds: {
        x: comp.minX,
        y: comp.minY,
        width: comp.w,
        height: comp.h,
        right: comp.maxX,
        bottom: comp.maxY
      },
      percentBounds: {
        x: +(comp.minX / w).toFixed(4),
        y: +(comp.minY / h).toFixed(4),
        width: +(comp.w / w).toFixed(4),
        height: +(comp.h / h).toFixed(4)
      },
      style: {
        color,
        radius: Math.round(Math.min(comp.w, comp.h) * 0.09)
      },
      layout: { margin: 4, padding: 6, gravity: 'start' },
      metadata: {
        estimatedTextLines: lines,
        area: comp.area
      },
      children: []
    };
  }

  function overlaps(a, b) {
    const ix = Math.max(0, Math.min(a.bounds.right, b.bounds.right) - Math.max(a.bounds.x, b.bounds.x));
    const iy = Math.max(0, Math.min(a.bounds.bottom, b.bounds.bottom) - Math.max(a.bounds.y, b.bounds.y));
    return ix * iy;
  }

  function mergeClose(nodes, w, h) {
    const out = [];
    const used = new Set();
    const gap = Math.max(6, Math.round(Math.min(w, h) * 0.012));
    for (let i = 0; i < nodes.length; i++) {
      if (used.has(i)) continue;
      let base = structuredClone(nodes[i]);
      for (let j = i + 1; j < nodes.length; j++) {
        if (used.has(j)) continue;
        const n = nodes[j];
        const near = Math.abs((base.bounds.x + base.bounds.width) - n.bounds.x) < gap || Math.abs((n.bounds.x + n.bounds.width) - base.bounds.x) < gap;
        const sameRow = Math.abs(base.bounds.y - n.bounds.y) < gap;
        const sameType = base.type === n.type;
        if ((overlaps(base, n) > 0 || (near && sameRow)) && sameType) {
          used.add(j);
          base.bounds.x = Math.min(base.bounds.x, n.bounds.x);
          base.bounds.y = Math.min(base.bounds.y, n.bounds.y);
          base.bounds.right = Math.max(base.bounds.right, n.bounds.right);
          base.bounds.bottom = Math.max(base.bounds.bottom, n.bounds.bottom);
          base.bounds.width = base.bounds.right - base.bounds.x;
          base.bounds.height = base.bounds.bottom - base.bounds.y;
          base.confidence = Math.min(0.95, (base.confidence + n.confidence) / 2 + 0.05);
        }
      }
      out.push(base);
    }
    return out;
  }

  function buildHierarchy(nodes, screenW, screenH) {
    const sorted = [...nodes].sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height));
    const root = {
      id: 'screen_root',
      type: 'screen',
      confidence: 1,
      text: '',
      bounds: { x: 0, y: 0, width: screenW, height: screenH, right: screenW, bottom: screenH },
      percentBounds: { x: 0, y: 0, width: 1, height: 1 },
      style: {},
      layout: {},
      metadata: {},
      children: []
    };

    const all = [root, ...sorted];
    for (let i = 1; i < all.length; i++) {
      let parent = root;
      for (let j = 1; j < all.length; j++) {
        if (i === j) continue;
        const candidate = all[j];
        const inside = all[i].bounds.x >= candidate.bounds.x && all[i].bounds.y >= candidate.bounds.y && all[i].bounds.right <= candidate.bounds.right && all[i].bounds.bottom <= candidate.bounds.bottom;
        if (inside) {
          const pArea = parent.bounds.width * parent.bounds.height;
          const cArea = candidate.bounds.width * candidate.bounds.height;
          if (cArea < pArea) parent = candidate;
        }
      }
      parent.children.push(all[i]);
    }

    function sortChildren(node) {
      node.children.sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
      node.children.forEach(sortChildren);
    }
    sortChildren(root);
    return root;
  }

  function inferRootLayout(root) {
    const choice = el.rootType.value;
    if (choice !== 'auto') return choice;
    const c = root.children;
    if (c.length <= 1) return 'FrameLayout';
    const rowSimilarity = c.slice(1).every((n, i) => Math.abs(n.bounds.y - c[i].bounds.y) < root.bounds.height * 0.03);
    if (rowSimilarity) return 'LinearLayout';
    return 'ConstraintLayout';
  }

  function traverse(node, fn) { fn(node); node.children.forEach((c) => traverse(c, fn)); }

  function modelWarnings(model) {
    const warnings = [];
    let low = 0;
    traverse(model.root, (n) => {
      if (n.type !== 'screen' && n.confidence < 0.55) low++;
    });
    if (!model.root.children.length) warnings.push('لم يتم اكتشاف عناصر مؤكدة. جرّب تقليل الحد الأدنى للحجم أو تعديل حساسية الحدود.');
    if (low > 0) warnings.push(`${low} عنصر/عناصر بثقة منخفضة؛ راجعها يدويًا قبل التصدير.`);
    if (model.meta.scrollable) warnings.push('تم تفعيل نمط قابل للتمرير بناءً على طول المحتوى.');
    return warnings;
  }

  async function analyzeImage() {
    state.warnings = []; el.warnings.textContent = '';
    if (!state.image) return warn('الرجاء رفع صورة أولاً.');
    const edgeSensitivity = Number(el.edgeSensitivity.value || 22);
    const minArea = Number(el.minArea.value || 320);
    if (state.image.width < 48 || state.image.height < 48) return warn('الصورة صغيرة جدًا للتحليل.');

    setProgress('المرحلة 1/7: قراءة الأبعاد والهوامش...');
    const raw = getImageData(state.image);
    await nextFrame();

    setProgress('المرحلة 2/7: اكتشاف الخلفية...');
    const bg = estimateBackground(raw.data.data, raw.w, raw.h);
    const background = {
      solid: rgbToHex(bg.r, bg.g, bg.b),
      gradient: { from: rgbToHex(bg.r * 0.93, bg.g * 0.93, bg.b * 0.93), to: rgbToHex(bg.r * 1.05, bg.g * 1.05, bg.b * 1.05) }
    };
    await nextFrame();

    setProgress('المرحلة 3/7: استخراج الحواف والمناطق المتصلة...');
    const { mask, edgeMask } = createMask(raw.data.data, raw.w, raw.h, bg, edgeSensitivity);
    await nextFrame();

    setProgress('المرحلة 4/7: تقسيم المكونات...');
    const comps = connectedComponents(mask, raw.w, raw.h, minArea);
    await nextFrame();

    setProgress('المرحلة 5/7: تصنيف العناصر ودمج المتجاور...');
    const typed = comps.map((c) => classify(c, raw.data.data, raw.w, raw.h, { textDetect: el.textDetect.checked, iconDetect: el.iconDetect.checked }));
    const merged = mergeClose(typed, raw.w, raw.h);
    await nextFrame();

    setProgress('المرحلة 6/7: بناء شجرة الواجهة...');
    const root = buildHierarchy(merged, raw.w, raw.h);
    const scrollable = root.children.some((n) => n.bounds.bottom > raw.h * 0.98) || (root.children.length > 14);
    await nextFrame();

    setProgress('المرحلة 7/7: توليد XML والموارد...');
    const model = {
      meta: {
        source: { width: state.image.width, height: state.image.height, ratio: +(state.image.width / state.image.height).toFixed(4) },
        analyzed: { width: raw.w, height: raw.h },
        background,
        scrollable,
        rootLayout: inferRootLayout(root),
        settings: {
          designWidthDp: Number(el.designWidth.value), designHeightDp: Number(el.designHeight.value), dpScale: Number(el.dpScale.value), edgeSensitivity, minArea,
          textDetection: el.textDetect.checked, iconDetection: el.iconDetect.checked, colorSystem: el.colorSystem.value
        }
      },
      root
    };
    state.model = model;

    renderModel();
    setProgress('اكتمل التحليل. يمكنك الآن تعديل العناصر وتصدير النتائج.');
  }

  function drawImage() {
    const c = el.sourceCanvas;
    const ctx = c.getContext('2d');
    const frame = document.getElementById('phoneFrame').getBoundingClientRect();
    c.width = frame.width;
    c.height = frame.height;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!state.image) return;

    const imgRatio = state.image.width / state.image.height;
    const canRatio = c.width / c.height;
    let dw, dh, dx, dy;
    if (imgRatio > canRatio) { dw = c.width; dh = dw / imgRatio; dx = 0; dy = (c.height - dh) / 2; }
    else { dh = c.height; dw = dh * imgRatio; dy = 0; dx = (c.width - dw) / 2; }
    ctx.drawImage(state.image, dx, dy, dw, dh);
  }

  function flattenNodes() {
    const arr = [];
    if (!state.model) return arr;
    traverse(state.model.root, (n) => { if (n.type !== 'screen') arr.push(n); });
    return arr;
  }

  function pickNodeById(id) {
    let found = null;
    traverse(state.model.root, (n) => { if (n.id === id) found = n; });
    return found;
  }

  function renderOverlay() {
    el.overlay.innerHTML = '';
    if (!state.model) return;
    const nodes = flattenNodes();

    nodes.forEach((n) => {
      const b = n.percentBounds;
      const box = document.createElement('div');
      box.className = 'box' + (state.selectedId === n.id ? ' selected' : '');
      box.style.left = `${b.x * 100}%`;
      box.style.top = `${b.y * 100}%`;
      box.style.width = `${b.width * 100}%`;
      box.style.height = `${b.height * 100}%`;
      box.textContent = `${n.type} (${Math.round(n.confidence * 100)}%)`;
      box.style.pointerEvents = 'auto';
      box.onclick = (ev) => {
        if (!el.manualMode.checked) return;
        if (ev.ctrlKey || ev.metaKey) state.secondarySelectedId = n.id;
        else state.selectedId = n.id;
        syncSelectedFields();
        renderModel();
      };
      el.overlay.appendChild(box);
    });
  }

  function renderTree() {
    el.treeView.innerHTML = '';
    if (!state.model) return;
    const build = (node, depth) => {
      if (node.type !== 'screen') {
        const li = document.createElement('li');
        li.textContent = `${'—'.repeat(depth)} ${node.id} [${node.type}]`;
        if (state.selectedId === node.id) li.classList.add('active');
        li.onclick = () => { state.selectedId = node.id; syncSelectedFields(); renderModel(); };
        el.treeView.appendChild(li);
      }
      node.children.forEach((c) => build(c, depth + 1));
    };
    build(state.model.root, 0);
  }

  function renderInferredPreview() {
    el.inferredPreview.innerHTML = '';
    if (!state.model) return;
    const root = state.model.root;
    const bg = document.createElement('div');
    bg.style.position = 'absolute'; bg.style.inset = '0'; bg.style.background = state.model.meta.background.solid;
    el.inferredPreview.appendChild(bg);

    flattenNodes().forEach((n) => {
      const d = document.createElement('div');
      d.className = 'preview-node';
      d.style.left = `${n.percentBounds.x * 100}%`;
      d.style.top = `${n.percentBounds.y * 100}%`;
      d.style.width = `${n.percentBounds.width * 100}%`;
      d.style.height = `${n.percentBounds.height * 100}%`;
      d.style.borderRadius = `${n.style.radius || 0}px`;
      d.style.background = ['text','icon'].includes(n.type) ? 'transparent' : (n.style.color || 'transparent');
      d.style.color = '#fff';
      d.style.fontSize = '10px';
      d.style.overflow = 'hidden';
      d.textContent = n.type === 'text' ? (n.text || 'Text') : '';
      el.inferredPreview.appendChild(d);
    });

    if (state.model.meta.scrollable) el.inferredPreview.style.overflowY = 'auto';
    else el.inferredPreview.style.overflow = 'hidden';
  }

  function nodeToTag(node) {
    switch (node.type) {
      case 'text': return 'TextView';
      case 'button': return 'Button';
      case 'input': return 'EditText';
      case 'image':
      case 'icon': return 'ImageView';
      default: return 'View';
    }
  }

  function generateResources(model) {
    const colors = new Map();
    const dimen = new Map();
    flattenNodes().forEach((n, i) => {
      if (n.style.color) colors.set(`c_${i}`, n.style.color);
      dimen.set(`${n.id}_w`, `${pxToDp(n.bounds.width)}dp`);
      dimen.set(`${n.id}_h`, `${pxToDp(n.bounds.height)}dp`);
      dimen.set(`${n.id}_m`, `${pxToDp(n.layout.margin || 4)}dp`);
    });
    const colorsXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${[...colors].map(([k,v]) => `    <color name="${k}">${v}</color>`).join('\n')}\n</resources>`;
    const dimenXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${[...dimen].map(([k,v]) => `    <dimen name="${k}">${v}</dimen>`).join('\n')}\n</resources>`;
    return { colorsXml, dimenXml };
  }

  function generateAndroidXml(model) {
    const rootLayout = model.meta.rootLayout;
    const ns = `xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    xmlns:app=\"http://schemas.android.com/apk/res-auto\"\n    android:layout_width=\"match_parent\"\n    android:layout_height=\"match_parent\"`;

    const safeId = (id) => id.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const textColor = model.meta.settings.colorSystem === 'dark' ? '#FFFFFF' : '#1C1C1C';
    const bgColor = model.meta.settings.colorSystem === 'light'
      ? '#FFFFFF'
      : (model.meta.settings.colorSystem === 'dark' ? '#121212' : model.meta.background.solid);
    const groupTag = (type) => (type === 'container' || type === 'card' || type === 'list' ? 'LinearLayout' : 'FrameLayout');
    const isGroup = (type) => ['container', 'card', 'list', 'nav'].includes(type);
    const xmlLines = [];

    const buildNodeXml = (node, depth, parentLayout, index, siblings) => {
      const indent = '    '.repeat(depth);
      const tag = isGroup(node.type) ? groupTag(node.type) : nodeToTag(node);
      const id = safeId(node.id);
      const attrs = [
        `android:id=\"@+id/${id}\"`,
        `android:layout_width=\"${pxToDp(node.bounds.width)}dp\"`,
        `android:layout_height=\"${pxToDp(node.bounds.height)}dp\"`,
        `android:layout_margin=\"${pxToDp(node.layout.margin || 4)}dp\"`,
        `android:background=\"${node.style.color || '@android:color/transparent'}\"`,
        `android:enabled=\"true\"`
      ];
      if (isGroup(node.type)) attrs.push('android:orientation=\"vertical\"');
      if (['button','card','nav'].includes(node.type)) attrs.push('android:clickable=\"true\"');
      if (node.style?.radius > 0) attrs.push(`android:padding=\"${pxToDp(Math.max(2, node.style.radius * 0.25))}dp\"`);

      if (tag === 'TextView' || tag === 'Button') {
        attrs.push(`android:text=\"${escapeXml(node.text || 'نص placeholder')}\"`);
        attrs.push(`android:textColor=\"${textColor}\"`);
        attrs.push(`android:textSize=\"${pxToSp(Math.max(12, node.bounds.height * 0.32))}sp\"`);
        attrs.push(`android:gravity=\"center_vertical|start\"`);
      }
      if (tag === 'EditText') {
        attrs.push(`android:hint=\"${escapeXml(node.text || 'Hint placeholder')}\"`);
        attrs.push('android:inputType=\"text\"');
      }
      if (tag === 'ImageView') attrs.push('android:scaleType=\"centerCrop\"');

      if (parentLayout === 'ConstraintLayout') {
        attrs.push('app:layout_constraintStart_toStartOf=\"parent\"');
        if (index === 0) attrs.push('app:layout_constraintTop_toTopOf=\"parent\"');
        else attrs.push(`app:layout_constraintTop_toBottomOf=\"@id/${safeId(siblings[index - 1].id)}\"`);
      } else if (parentLayout === 'LinearLayout') {
        attrs.push('android:layout_width=\"match_parent\"');
      }
      if (node.confidence < 0.58) xmlLines.push(`${indent}<!-- ${node.id}: low confidence (${node.confidence.toFixed(2)}) -->`);

      if (!node.children.length) {
        xmlLines.push(`${indent}<${tag}\n${indent}    ${attrs.join(`\n${indent}    `)} />`);
        return;
      }

      xmlLines.push(`${indent}<${tag}\n${indent}    ${attrs.join(`\n${indent}    `)}>`);
      node.children.forEach((child, childIdx) => buildNodeXml(child, depth + 1, tag === 'FrameLayout' ? 'FrameLayout' : 'LinearLayout', childIdx, node.children));
      xmlLines.push(`${indent}</${tag}>`);
    };

    model.root.children.forEach((n, i) => buildNodeXml(n, 1, rootLayout, i, model.root.children));
    const inner = xmlLines.join('\n');
    const rootOpen = `<${rootLayout}\n    ${ns}\n    android:background=\"${bgColor}\">`;
    const rootClose = `</${rootLayout}>`;

    if (model.meta.scrollable) {
      return `<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<ScrollView\n    xmlns:android=\"http://schemas.android.com/apk/res/android\"\n    android:layout_width=\"match_parent\"\n    android:layout_height=\"match_parent\">\n\n${rootOpen}\n${inner}\n${rootClose}\n\n</ScrollView>`;
    }
    return `<?xml version=\"1.0\" encoding=\"utf-8\"?>\n${rootOpen}\n${inner}\n${rootClose}`;
  }

  function escapeXml(v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function renderOutputs() {
    if (!state.model) return;
    const xml = generateAndroidXml(state.model);
    const res = generateResources(state.model);
    const readme = `Assumptions:\n- Generated from single screenshot without source hierarchy or OCR truth.\n- Low-confidence elements must be reviewed manually in Android Studio.\n- Placeholder texts/hints were inserted where textual certainty is limited.`;

    el.xmlOutput.value = xml;
    el.jsonOutput.value = JSON.stringify(state.model, null, 2);
    el.resOutput.value = `${res.colorsXml}\n\n${res.dimenXml}\n\n${readme}`;
  }

  function renderModel() {
    drawImage();
    renderOverlay();
    renderTree();
    renderInferredPreview();
    renderOutputs();
    syncSelectedFields();
    const warns = modelWarnings(state.model);
    if (warns.length) el.warnings.textContent = warns.map((w) => `• ${w}`).join('\n');
  }

  function syncSelectedFields() {
    const node = state.model && state.selectedId ? pickNodeById(state.selectedId) : null;
    if (!node) {
      el.selectedMeta.textContent = 'لا يوجد عنصر محدد';
      return;
    }
    el.selectedMeta.textContent = `الموقع: (${node.bounds.x}, ${node.bounds.y}) الحجم: ${node.bounds.width}×${node.bounds.height}px`;
    el.propType.value = node.type;
    el.propId.value = node.id;
    el.propText.value = node.text || '';
    el.propColor.value = node.style.color || '';
    el.propConfidence.value = node.confidence;
    el.propRadius.value = node.style.radius || 0;
  }

  function findParentAndIndex(root, id, parent = null) {
    for (let i = 0; i < root.children.length; i++) {
      const c = root.children[i];
      if (c.id === id) return { parent: root, index: i, node: c };
      const deep = findParentAndIndex(c, id, root);
      if (deep) return deep;
    }
    return null;
  }

  function addChild() {
    if (!state.model || !state.selectedId) return;
    const target = pickNodeById(state.selectedId);
    if (!target) return;
    const node = {
      id: uniqueId('manual'), type: 'text', confidence: 0.8, text: 'Text placeholder',
      bounds: { x: target.bounds.x + 8, y: target.bounds.y + 8, width: Math.max(40, Math.floor(target.bounds.width * 0.45)), height: 24, right: 0, bottom: 0 },
      percentBounds: { x: 0, y: 0, width: 0, height: 0 },
      style: { color: '#444444', radius: 4 }, layout: { margin: 4, padding: 4, gravity: 'start' }, metadata: { manual: true }, children: []
    };
    node.bounds.right = node.bounds.x + node.bounds.width;
    node.bounds.bottom = node.bounds.y + node.bounds.height;
    node.percentBounds.x = +(node.bounds.x / state.model.meta.analyzed.width).toFixed(4);
    node.percentBounds.y = +(node.bounds.y / state.model.meta.analyzed.height).toFixed(4);
    node.percentBounds.width = +(node.bounds.width / state.model.meta.analyzed.width).toFixed(4);
    node.percentBounds.height = +(node.bounds.height / state.model.meta.analyzed.height).toFixed(4);
    target.children.push(node);
    renderModel();
  }

  function deleteSelected() {
    if (!state.model || !state.selectedId) return;
    const x = findParentAndIndex(state.model.root, state.selectedId);
    if (!x) return;
    x.parent.children.splice(x.index, 1);
    state.selectedId = null;
    renderModel();
  }

  function saveProps() {
    if (!state.model || !state.selectedId) return;
    const n = pickNodeById(state.selectedId);
    if (!n) return;
    n.type = el.propType.value;
    n.id = el.propId.value.trim() || n.id;
    n.text = el.propText.value;
    n.style.color = el.propColor.value || n.style.color;
    n.confidence = clamp(Number(el.propConfidence.value || n.confidence), 0, 1);
    n.style.radius = Number(el.propRadius.value || n.style.radius || 0);
    renderModel();
  }

  function mergeSelected() {
    if (!state.model || !state.selectedId || !state.secondarySelectedId || state.selectedId === state.secondarySelectedId) {
      return warn('حدد عنصرًا أولًا ثم Ctrl+Click لعنصر ثانٍ للدمج.');
    }
    const a = pickNodeById(state.selectedId);
    const b = pickNodeById(state.secondarySelectedId);
    if (!a || !b) return;
    a.bounds.x = Math.min(a.bounds.x, b.bounds.x);
    a.bounds.y = Math.min(a.bounds.y, b.bounds.y);
    a.bounds.right = Math.max(a.bounds.right, b.bounds.right);
    a.bounds.bottom = Math.max(a.bounds.bottom, b.bounds.bottom);
    a.bounds.width = a.bounds.right - a.bounds.x;
    a.bounds.height = a.bounds.bottom - a.bounds.y;
    a.confidence = Math.min(0.96, (a.confidence + b.confidence) / 2 + 0.08);
    const p = findParentAndIndex(state.model.root, b.id);
    if (p) p.parent.children.splice(p.index, 1);
    state.secondarySelectedId = null;
    renderModel();
  }

  function moveSelected(direction) {
    if (!state.model || !state.selectedId) return;
    const info = findParentAndIndex(state.model.root, state.selectedId);
    if (!info) return;
    const target = info.index + direction;
    if (target < 0 || target >= info.parent.children.length) return;
    const arr = info.parent.children;
    [arr[info.index], arr[target]] = [arr[target], arr[info.index]];
    renderModel();
  }

  function moveSelectedToRoot() {
    if (!state.model || !state.selectedId) return;
    const info = findParentAndIndex(state.model.root, state.selectedId);
    if (!info || info.parent.id === 'screen_root') return;
    const node = info.parent.children.splice(info.index, 1)[0];
    state.model.root.children.push(node);
    renderModel();
  }

  function togglePreviewMode() {
    state.showInferred = !state.showInferred;
    el.inferredPreview.style.display = state.showInferred ? 'block' : 'none';
    el.overlay.style.display = state.showInferred ? 'none' : 'block';
    el.toggleModeBtn.textContent = `عرض: ${state.showInferred ? 'المستنتج' : 'الأصل'}`;
  }

  function activateTabs() {
    document.querySelectorAll('.tabs button').forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.out').forEach((o) => o.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        if (target === 'xml') el.xmlOutput.classList.add('active');
        if (target === 'json') el.jsonOutput.classList.add('active');
        if (target === 'res') el.resOutput.classList.add('active');
      };
    });
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); setProgress('تم النسخ إلى الحافظة.'); }
    catch { warn('تعذر النسخ؛ يمكنك النسخ يدويًا.'); }
  }

  function download(name, content, type='text/plain') {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 800);
  }

  // Minimal ZIP (store mode, no compression)
  function makeZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    const crcTable = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c >>> 0;
      }
      return t;
    })();
    const crc32 = (bytes) => {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
    const u16 = (v) => [v & 255, (v >>> 8) & 255];
    const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

    files.forEach((f) => {
      const nameBytes = enc.encode(f.name);
      const data = enc.encode(f.content);
      const crc = crc32(data);
      const local = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
        ...nameBytes, ...data
      ]);
      chunks.push(local);

      const cen = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes
      ]);
      central.push(cen);
      offset += local.length;
    });

    const cenSize = central.reduce((s, c) => s + c.length, 0);
    const cenOffset = offset;
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(cenSize), ...u32(cenOffset), ...u16(0)
    ]);

    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  function downloadZip() {
    if (!state.model) return;
    const xml = el.xmlOutput.value;
    const json = el.jsonOutput.value;
    const resources = el.resOutput.value;
    const readme = `Generated by Img2XML AI Offline\n\nThis package includes inferred Android layout from a single image.\nReview IDs, constraints, and low-confidence elements manually in Android Studio.`;
    const zip = makeZip([
      { name: 'res/layout/generated_layout.xml', content: xml },
      { name: 'model/model.json', content: json },
      { name: 'res/values/generated_resources.txt', content: resources },
      { name: 'README.txt', content: readme }
    ]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = 'img2xml-output.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 900);
  }

  function attachEvents() {
    el.resetBtn.onclick = resetAll;
    el.analyzeBtn.onclick = analyzeImage;
    el.regenBtn.onclick = renderOutputs;
    el.toggleModeBtn.onclick = togglePreviewMode;
    el.savePropBtn.onclick = saveProps;
    el.deleteBtn.onclick = deleteSelected;
    el.addChildBtn.onclick = addChild;
    el.mergeBtn.onclick = mergeSelected;
    el.moveUpBtn.onclick = () => moveSelected(-1);
    el.moveDownBtn.onclick = () => moveSelected(1);
    el.toRootBtn.onclick = moveSelectedToRoot;
    el.copyXmlBtn.onclick = () => copyText(el.xmlOutput.value);
    el.copyJsonBtn.onclick = () => copyText(el.jsonOutput.value);
    el.downloadXmlBtn.onclick = () => download('generated_layout.xml', el.xmlOutput.value, 'application/xml');
    el.downloadJsonBtn.onclick = () => download('model.json', el.jsonOutput.value, 'application/json');
    el.downloadZipBtn.onclick = downloadZip;

    el.imageInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) return warn('الملف غير صالح. الرجاء اختيار صورة.');
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          state.image = img;
          drawImage();
          setProgress(`تم تحميل الصورة: ${img.width}×${img.height}`);
          if (img.width > 3000 || img.height > 3000) warn('الصورة كبيرة؛ تم تفعيل التحليل المصغّر مع الحفاظ على الإخراج النسبي.');
        };
        img.onerror = () => warn('تعذر قراءة الصورة.');
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };

    window.addEventListener('resize', drawImage);
    activateTabs();
  }

  attachEvents();
})();
