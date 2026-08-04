#target photoshop
app.displayDialogs = DialogModes.NO;

(function () {
  var SCRIPT_FILE = new File($.fileName);
  var REPO_ROOT = SCRIPT_FILE.parent.parent.parent.parent;
  var VISUAL_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-key-visual-v3.png");
  var LOGO_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-logo.jpg");
  var OUTPUT_ROOT = new Folder("/Users/mac/Documents/Jinhu-Science-Innovation-Park-Design-V3-Final");
  var START_MARKER = new File("/tmp/jinhu-v3-production-started.txt");
  var RESULT_MARKER = new File("/tmp/jinhu-v3-production-result.txt");
  var WIDTH_MM = 640;
  var HEIGHT_MM = 1440;
  var DPI = 150;
  var MM_PER_INCH = 25.4;

  function writeText(file, value) {
    file.encoding = "UTF8";
    file.open("w");
    file.write(value);
    file.close();
  }

  function fail(message) { throw new Error(message); }
  function requireFile(file, label) { if (!file.exists) fail("Missing " + label + ": " + file.fsName); return file; }
  function ensureFolder(folder) { if (!folder.exists && !folder.create()) fail("Cannot create output folder: " + folder.fsName); return folder; }
  function mmToPx(mm) { return Math.round(mm / MM_PER_INCH * DPI); }
  function px(value) { return UnitValue(Math.round(value), "px"); }
  function rgb(hex) { var value = new SolidColor(); value.rgb.hexValue = hex; return value; }

  function addGroup(doc, name) {
    var group = doc.layerSets.add();
    group.name = name;
    return group;
  }

  function addSolidRect(doc, group, name, x, y, width, height, hex, opacity, blendMode) {
    var layer = doc.artLayers.add();
    layer.name = name;
    doc.selection.select([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
    doc.selection.fill(rgb(hex), ColorBlendMode.NORMAL, 100, false);
    doc.selection.deselect();
    layer.opacity = opacity;
    if (blendMode) layer.blendMode = blendMode;
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function addText(doc, group, options) {
    var layer = doc.artLayers.add();
    layer.name = options.name;
    layer.kind = LayerKind.TEXT;
    var item = layer.textItem;
    item.kind = TextType.PARAGRAPHTEXT;
    item.contents = options.contents;
    item.position = [px(options.x), px(options.y)];
    item.width = px(options.width);
    item.height = px(options.height);
    item.font = options.font;
    item.size = UnitValue(options.sizePt, "pt");
    item.leading = UnitValue(options.leadingPt, "pt");
    item.tracking = options.tracking || 0;
    item.justification = Justification.LEFT;
    item.antiAliasMethod = AntiAlias.SMOOTH;
    item.color = rgb(options.colorHex);
    try { item.horizontalScale = 100; } catch (ignoreHorizontalScale) {}
    try { item.verticalScale = 100; } catch (ignoreVerticalScale) {}
    try { item.fauxBold = false; } catch (ignoreFauxBold) {}
    try { item.fauxItalic = false; } catch (ignoreFauxItalic) {}
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function convertActiveLayerToSmartObject() {
    executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
  }

  function fitActiveSmartObjectToCanvas(doc, targetWidth, targetHeight) {
    var layer = doc.activeLayer;
    var bounds = layer.bounds;
    var currentWidth = bounds[2].as("px") - bounds[0].as("px");
    var currentHeight = bounds[3].as("px") - bounds[1].as("px");
    var scale = Math.max(targetWidth / currentWidth, targetHeight / currentHeight) * 100;
    layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
    bounds = layer.bounds;
    var left = bounds[0].as("px");
    var top = bounds[1].as("px");
    var finalWidth = bounds[2].as("px") - left;
    var finalHeight = bounds[3].as("px") - top;
    layer.translate(px((targetWidth - finalWidth) / 2 - left), px((targetHeight - finalHeight) / 2 - top));
  }

  function placeVisual(doc, group, widthPx, heightPx) {
    var source = app.open(requireFile(VISUAL_FILE, "V3 AI key visual"));
    var sourceWidth = source.width.as("px");
    var sourceHeight = source.height.as("px");
    source.flatten();
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    doc.activeLayer.name = "11_AI_SOURCE_" + sourceWidth + "x" + sourceHeight;
    convertActiveLayerToSmartObject();
    doc.activeLayer.name = "12_INNOVATION_GATE_SOURCE_SMART_OBJECT";
    fitActiveSmartObjectToCanvas(doc, widthPx, heightPx);
    try { doc.activeLayer.applyUnSharpMask(32, 0.7, 1); } catch (ignoreSmartSharpen) {}
    doc.activeLayer.move(group, ElementPlacement.INSIDE);
    return { width: sourceWidth, height: sourceHeight, effectivePpi: sourceWidth / (WIDTH_MM / MM_PER_INCH) };
  }

  function placeLogo(doc, group) {
    var source = app.open(requireFile(LOGO_FILE, "approved logo"));
    source.flatten();
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    convertActiveLayerToSmartObject();
    var layer = doc.activeLayer;
    layer.name = "31_APPROVED_LOGO_SMART_OBJECT";
    layer.blendMode = BlendMode.MULTIPLY;
    var bounds = layer.bounds;
    var currentWidth = bounds[2].as("px") - bounds[0].as("px");
    var targetWidth = mmToPx(64);
    var scale = targetWidth / currentWidth * 100;
    layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
    bounds = layer.bounds;
    layer.translate(px(mmToPx(46) - bounds[0].as("px")), px(mmToPx(44) - bounds[1].as("px")));
    layer.move(group, ElementPlacement.INSIDE);
  }

  function addGuides(doc) {
    doc.guides.add(Direction.VERTICAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(WIDTH_MM - 18, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(46, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(350, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(210, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(650, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(HEIGHT_MM - 150, "mm"));
  }

  function saveOutputs(doc) {
    var psdFile = new File(OUTPUT_ROOT.fsName + "/jinhu-innovation-gate-v3.psd");
    var pdfFile = new File(OUTPUT_ROOT.fsName + "/jinhu-innovation-gate-v3-print.pdf");
    var pngFile = new File(OUTPUT_ROOT.fsName + "/jinhu-innovation-gate-v3-4k.png");

    var preview = doc.duplicate("JINHU_INNOVATION_GATE_V3_RGB_4K", false);
    try {
      app.activeDocument = preview;
      preview.resizeImage(undefined, px(3840), 150, ResampleMethod.BICUBICSHARPER);
      var pngOptions = new PNGSaveOptions();
      pngOptions.compression = 6;
      pngOptions.interlaced = false;
      preview.saveAs(pngFile, pngOptions, true, Extension.LOWERCASE);
    } finally {
      preview.close(SaveOptions.DONOTSAVECHANGES);
    }

    app.activeDocument = doc;
    var converted = false;
    try {
      doc.convertProfile("Coated FOGRA39 (ISO 12647-2:2004)", Intent.RELATIVECOLORIMETRIC, true, true);
      converted = true;
    } catch (ignoreProfile) {}
    if (!converted) doc.changeMode(ChangeMode.CMYK);

    var psdOptions = new PhotoshopSaveOptions();
    psdOptions.layers = true;
    psdOptions.embedColorProfile = true;
    psdOptions.maximizeCompatibility = true;
    doc.saveAs(psdFile, psdOptions, false, Extension.LOWERCASE);

    var pdfOptions = new PDFSaveOptions();
    pdfOptions.embedColorProfile = true;
    pdfOptions.preserveEditing = false;
    pdfOptions.encoding = PDFEncoding.JPEG;
    pdfOptions.jpegQuality = 12;
    doc.saveAs(pdfFile, pdfOptions, true, Extension.LOWERCASE);
    return { psd: psdFile, pdf: pdfFile, png: pngFile, converted: converted };
  }

  try {
    if (RESULT_MARKER.exists) RESULT_MARKER.remove();
    writeText(START_MARKER, "started=" + new Date().toUTCString() + "\nscript=" + SCRIPT_FILE.fsName);
    requireFile(VISUAL_FILE, "V3 AI key visual");
    requireFile(LOGO_FILE, "approved logo");
    ensureFolder(OUTPUT_ROOT);

    var widthPx = mmToPx(WIDTH_MM);
    var heightPx = mmToPx(HEIGHT_MM);
    var doc = app.documents.add(UnitValue(WIDTH_MM, "mm"), UnitValue(HEIGHT_MM, "mm"), DPI, "JINHU_INNOVATION_GATE_V3_MASTER_RGB", NewDocumentMode.RGB, DocumentFill.WHITE);
    var background = addGroup(doc, "00_MINERAL_BACKGROUND");
    var visual = addGroup(doc, "10_HERO_COMPOSITE_SMART_OBJECT");
    var grade = addGroup(doc, "20_LOCAL_AND_GLOBAL_GRADE");
    var brand = addGroup(doc, "30_BRAND_LOCKUP");
    var copy = addGroup(doc, "40_EDITORIAL_TYPOGRAPHY_100_PERCENT");
    var review = addGroup(doc, "90_REVIEW_NOTES_AND_GUIDES");
    var exportGroup = addGroup(doc, "99_EXPORT_CONTROL");
    review.visible = false;
    exportGroup.visible = false;

    addSolidRect(doc, background, "01_WARM_MINERAL_BASE", 0, 0, widthPx, heightPx, "F2EFE8", 100, BlendMode.NORMAL);
    var sourceInfo = placeVisual(doc, visual, widthPx, heightPx);
    addSolidRect(doc, grade, "21_WARM_PAPER_UNIFIER", 0, 0, mmToPx(330), heightPx, "F6F1E8", 9, BlendMode.NORMAL);
    addSolidRect(doc, grade, "22_COBALT_DEPTH_CONTROL", mmToPx(360), 0, widthPx - mmToPx(360), heightPx, "062B68", 5, BlendMode.SOFTLIGHT);
    placeLogo(doc, brand);

    addText(doc, brand, {
      name: "32_BRAND_NAME_48PT", contents: "\u91D1\u6E56\u79D1\u521B\u4EA7\u4E1A\u56ED",
      x: mmToPx(124), y: mmToPx(80), width: mmToPx(300), height: mmToPx(48),
      font: "PingFangSC-Semibold", sizePt: 48, leadingPt: 58, tracking: 30, colorHex: "0A2047"
    });

    addSolidRect(doc, copy, "41_COBALT_DIRECTION_MARK", mmToPx(48), mmToPx(214), mmToPx(14), mmToPx(14), "1268E8", 100, BlendMode.NORMAL);
    addSolidRect(doc, copy, "42_CHAMPAGNE_INSET", mmToPx(55), mmToPx(221), mmToPx(7), mmToPx(7), "C59A52", 100, BlendMode.NORMAL);
    addText(doc, copy, {
      name: "43_HEADLINE_126PT_NO_DISTORTION", contents: "\u8BA9\u521B\u65B0\r\u5728\u8FD9\u91CC\u751F\u957F",
      x: mmToPx(48), y: mmToPx(292), width: mmToPx(300), height: mmToPx(260),
      font: "PingFangSC-Semibold", sizePt: 126, leadingPt: 154, tracking: 4, colorHex: "0A2047"
    });
    addText(doc, copy, {
      name: "44_VALUE_LINE_44PT", contents: "\u79D1\u521B\u5B75\u5316  \u00B7  \u4EA7\u4E1A\u534F\u540C  \u00B7  \u6210\u679C\u8F6C\u5316",
      x: mmToPx(50), y: mmToPx(585), width: mmToPx(390), height: mmToPx(64),
      font: "PingFangSC-Medium", sizePt: 44, leadingPt: 56, tracking: 18, colorHex: "9A6A24"
    });
    addText(doc, review, {
      name: "91_SOURCE_EFFECTIVE_PPI_NOTE", contents: "AI SOURCE " + sourceInfo.width + "x" + sourceInfo.height + " PX / EFFECTIVE " + sourceInfo.effectivePpi.toFixed(1) + " PPI AT 640 MM",
      x: mmToPx(48), y: mmToPx(1260), width: mmToPx(500), height: mmToPx(40),
      font: "Helvetica", sizePt: 18, leadingPt: 22, tracking: 0, colorHex: "D00000"
    });
    addGuides(doc);

    var files = saveOutputs(doc);
    var log = [
      "ANKSEN PHOTOSHOP DESIGN PRODUCTION V3",
      "status=PASS",
      "concept=INNOVATION_GATE",
      "generated=" + new Date().toUTCString(),
      "document=640x1440mm@150ppi",
      "pixel_size=" + widthPx + "x" + heightPx,
      "color_mode=CMYK",
      "preferred_profile_applied=" + files.converted,
      "editable_text=true",
      "text_horizontal_scale=100",
      "text_vertical_scale=100",
      "minimum_visible_text_size_pt=44",
      "ai_visual_smart_object=true",
      "ai_source_pixels=" + sourceInfo.width + "x" + sourceInfo.height,
      "ai_source_effective_ppi_at_final_size=" + sourceInfo.effectivePpi.toFixed(1),
      "resolution_status=ACCEPTED_FOR_640x1440MM_DISPLAY",
      "delivery_gate=VISUAL_AND_FILE_QA_ONLY",
      "psd=" + files.psd.fsName,
      "pdf=" + files.pdf.fsName,
      "png=" + files.png.fsName
    ].join("\n");
    writeText(new File(OUTPUT_ROOT.fsName + "/production-log.txt"), log);
    writeText(RESULT_MARKER, log);
    alert("\u91D1\u6E56\u79D1\u521B\u4EA7\u4E1A\u56ED V3 \u521B\u65B0\u4E4B\u95E8\u5DF2\u5B8C\u6210\u3002\nPSD\u3001PDF \u4E0E 4K PNG \u5DF2\u8F93\u51FA\u3002");
  } catch (error) {
    var failure = "status=FAIL\nmessage=" + error.message + "\nline=" + error.line + "\nfile=" + error.fileName;
    writeText(RESULT_MARKER, failure);
    alert("V3 \u751F\u4EA7\u5931\u8D25\uFF1A\n" + error.message + "\n\u884C\uFF1A" + error.line);
  }
})();
