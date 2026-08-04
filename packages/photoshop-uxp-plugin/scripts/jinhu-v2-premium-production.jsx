#target photoshop
app.displayDialogs = DialogModes.NO;

(function () {
  var SCRIPT_FILE = new File($.fileName);
  var REPO_ROOT = SCRIPT_FILE.parent.parent.parent.parent;
  var VISUAL_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-key-visual-v2.png");
  var LOGO_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-logo.jpg");
  var OUTPUT_ROOT = new Folder("/Users/mac/Documents/Jinhu-Science-Innovation-Park-Design-V2-Final");
  var START_MARKER = new File("/tmp/jinhu-v2-production-started.txt");
  var RESULT_MARKER = new File("/tmp/jinhu-v2-production-result.txt");
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
    item.antiAliasMethod = AntiAlias.SHARP;
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

  function placeVisual(doc, group, widthPx, heightPx) {
    var source = app.open(requireFile(VISUAL_FILE, "AI key visual"));
    source.flatten();
    var method = ResampleMethod.BICUBICSMOOTHER;
    try { method = ResampleMethod.PRESERVEDETAILS; } catch (ignorePreserveDetails) {}
    source.resizeImage(px(widthPx), px(heightPx), DPI, method);
    try { source.activeLayer.applyUnSharpMask(42, 0.9, 2); } catch (ignoreSharpen) {}
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    doc.activeLayer.name = "11_AI_KEY_VISUAL_UPSCALED";
    convertActiveLayerToSmartObject();
    doc.activeLayer.name = "11_AI_KEY_VISUAL_SMART_OBJECT";
    doc.activeLayer.move(group, ElementPlacement.INSIDE);
  }

  function placeLogo(doc, group) {
    var source = app.open(requireFile(LOGO_FILE, "approved logo"));
    source.flatten();
    var targetWidth = mmToPx(74);
    var ratio = targetWidth / source.width.as("px");
    source.resizeImage(px(targetWidth), px(source.height.as("px") * ratio), DPI, ResampleMethod.BICUBICSHARPER);
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    var layer = doc.activeLayer;
    layer.name = "31_APPROVED_LOGO_LOCKUP";
    var bounds = layer.bounds;
    layer.translate(px(mmToPx(42) - bounds[0].as("px")), px(mmToPx(38) - bounds[1].as("px")));
    convertActiveLayerToSmartObject();
    doc.activeLayer.name = "31_APPROVED_LOGO_SMART_OBJECT";
    doc.activeLayer.move(group, ElementPlacement.INSIDE);
  }

  function addGuides(doc) {
    doc.guides.add(Direction.VERTICAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(WIDTH_MM - 18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(HEIGHT_MM - 18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(HEIGHT_MM - 150, "mm"));
  }

  function saveOutputs(doc) {
    var psdFile = new File(OUTPUT_ROOT.fsName + "/jinhu-park-premium-v2.psd");
    var pdfFile = new File(OUTPUT_ROOT.fsName + "/jinhu-park-premium-v2-print.pdf");
    var pngFile = new File(OUTPUT_ROOT.fsName + "/jinhu-park-premium-v2-4k.png");

    var preview = doc.duplicate("JINHU_PREMIUM_V2_RGB_4K", false);
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
    requireFile(VISUAL_FILE, "AI key visual");
    requireFile(LOGO_FILE, "approved logo");
    ensureFolder(OUTPUT_ROOT);

    var widthPx = mmToPx(WIDTH_MM);
    var heightPx = mmToPx(HEIGHT_MM);
    var doc = app.documents.add(UnitValue(WIDTH_MM, "mm"), UnitValue(HEIGHT_MM, "mm"), DPI, "JINHU_PARK_PREMIUM_V2", NewDocumentMode.RGB, DocumentFill.WHITE);
    var background = addGroup(doc, "00_BACKGROUND_BASE");
    var visual = addGroup(doc, "10_AI_VISUAL_SMART_OBJECT");
    var tone = addGroup(doc, "20_TONAL_AND_PRINT_CONTROL");
    var brand = addGroup(doc, "30_BRAND_LOCKUP");
    var copy = addGroup(doc, "40_EDITABLE_COPY_100_PERCENT_SCALE");
    var review = addGroup(doc, "90_REVIEW_GUIDES_SAFE_AREA");
    var exportGroup = addGroup(doc, "99_EXPORT_CONTROL");
    review.visible = false;
    exportGroup.visible = false;

    addSolidRect(doc, background, "01_DEEP_NAVY_BASE", 0, 0, widthPx, heightPx, "111C2D", 100, BlendMode.NORMAL);
    placeVisual(doc, visual, widthPx, heightPx);
    addSolidRect(doc, tone, "21_TOP_CONTRAST_VEIL", 0, 0, widthPx, mmToPx(610), "06101F", 18, BlendMode.MULTIPLY);
    addSolidRect(doc, tone, "22_GLOBAL_NAVY_UNIFIER", 0, 0, widthPx, heightPx, "0B1A30", 7, BlendMode.SOFTLIGHT);
    placeLogo(doc, brand);

    addText(doc, brand, {
      name: "32_BRAND_NAME_54PT", contents: "\u91D1\u6E56\u79D1\u521B\u4EA7\u4E1A\u56ED",
      x: mmToPx(132), y: mmToPx(78), width: mmToPx(400), height: mmToPx(54),
      font: "PingFangSC-Semibold", sizePt: 54, leadingPt: 64, tracking: 35, colorHex: "F5F7FA"
    });
    addSolidRect(doc, copy, "41_CHAMPAGNE_VERTICAL_MARK", mmToPx(48), mmToPx(204), mmToPx(7), mmToPx(30), "D7B978", 100, BlendMode.NORMAL);
    addText(doc, copy, {
      name: "42_HEADLINE_140PT_NO_DISTORTION", contents: "\u805A\u52BF \u00B7 \u5171\u521B\r\u5411\u65B0\u800C\u884C",
      x: mmToPx(48), y: mmToPx(276), width: mmToPx(536), height: mmToPx(235),
      font: "PingFangSC-Semibold", sizePt: 140, leadingPt: 168, tracking: 8, colorHex: "F7F8FA"
    });
    addText(doc, copy, {
      name: "43_VALUE_LINE_42PT", contents: "\u521B\u65B0\u7B56\u6E90  \u00B7  \u4EA7\u4E1A\u534F\u540C  \u00B7  \u4F01\u4E1A\u6210\u957F",
      x: mmToPx(50), y: mmToPx(542), width: mmToPx(540), height: mmToPx(66),
      font: "PingFangSC-Medium", sizePt: 42, leadingPt: 54, tracking: 26, colorHex: "D7B978"
    });
    addGuides(doc);

    var files = saveOutputs(doc);
    var log = [
      "ANKSEN PHOTOSHOP DESIGN PRODUCTION V2",
      "status=PASS",
      "generated=" + new Date().toUTCString(),
      "document=640x1440mm@150ppi",
      "pixel_size=" + widthPx + "x" + heightPx,
      "color_mode=CMYK",
      "preferred_profile_applied=" + files.converted,
      "editable_text=true",
      "text_horizontal_scale=100",
      "text_vertical_scale=100",
      "minimum_text_size_pt=42",
      "ai_visual_smart_object=true",
      "psd=" + files.psd.fsName,
      "pdf=" + files.pdf.fsName,
      "png=" + files.png.fsName
    ].join("\n");
    writeText(new File(OUTPUT_ROOT.fsName + "/production-log.txt"), log);
    writeText(RESULT_MARKER, log);
    alert("\u91D1\u6E56\u79D1\u521B\u4EA7\u4E1A\u56ED V2 \u751F\u4EA7\u7A3F\u5DF2\u5B8C\u6210\u3002\nPSD\u3001\u5370\u5237 PDF \u4E0E 4K PNG \u5DF2\u8F93\u51FA\uFF1A\n" + OUTPUT_ROOT.fsName);
  } catch (error) {
    var failure = "status=FAIL\nmessage=" + error.message + "\nline=" + error.line + "\nfile=" + error.fileName;
    writeText(RESULT_MARKER, failure);
    alert("V2 \u751F\u4EA7\u5931\u8D25\uFF1A\n" + error.message + "\n\u884C\uFF1A" + error.line);
  }
})();
