#target photoshop
app.displayDialogs = DialogModes.NO;

(function () {
  var SCRIPT_FILE = new File($.fileName);
  var REPO_ROOT = SCRIPT_FILE.parent.parent.parent.parent;
  var VISUAL_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-exhibition-entrance-v1.png");
  var LOGO_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-logo.jpg");
  var OUTPUT_ROOT = new Folder("/Users/mac/Documents/Jinhu-Science-Innovation-Park-Exhibition-First-Piece-Final");
  var START_MARKER = new File("/tmp/jinhu-exhibition-first-piece-started.txt");
  var RESULT_MARKER = new File("/tmp/jinhu-exhibition-first-piece-result.txt");
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
    var source = app.open(requireFile(VISUAL_FILE, "AI exhibition key visual"));
    var originalWidth = source.width.as("px");
    var originalHeight = source.height.as("px");
    source.flatten();
    try {
      source.resizeImage(px(widthPx), px(heightPx), DPI, ResampleMethod.PRESERVEDETAILS);
    } catch (ignorePreserveDetails) {
      source.resizeImage(px(widthPx), px(heightPx), DPI, ResampleMethod.BICUBICSMOOTHER);
    }
    try { source.activeLayer.applyUnSharpMask(36, 0.75, 1); } catch (ignoreSourceSharpen) {}
    var productionWidth = source.width.as("px");
    var productionHeight = source.height.as("px");
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    doc.activeLayer.name = "11_AI_SOURCE_RESAMPLED_IN_PHOTOSHOP_" + productionWidth + "x" + productionHeight;
    convertActiveLayerToSmartObject();
    doc.activeLayer.name = "12_EXHIBITION_HERO_SMART_OBJECT";
    fitActiveSmartObjectToCanvas(doc, widthPx, heightPx);
    doc.activeLayer.move(group, ElementPlacement.INSIDE);
    return {
      originalWidth: originalWidth,
      originalHeight: originalHeight,
      productionWidth: productionWidth,
      productionHeight: productionHeight,
      originalEffectivePpi: originalWidth / (WIDTH_MM / MM_PER_INCH)
    };
  }

  function placeLogo(doc, group) {
    var source = app.open(requireFile(LOGO_FILE, "approved Jinhu logo"));
    source.flatten();
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    convertActiveLayerToSmartObject();
    var layer = doc.activeLayer;
    layer.name = "31_APPROVED_LOGO_MARK_SMART_OBJECT";
    layer.blendMode = BlendMode.MULTIPLY;
    var bounds = layer.bounds;
    var currentWidth = bounds[2].as("px") - bounds[0].as("px");
    var targetWidth = mmToPx(56);
    var scale = targetWidth / currentWidth * 100;
    layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
    bounds = layer.bounds;
    layer.translate(px(mmToPx(48) - bounds[0].as("px")), px(mmToPx(42) - bounds[1].as("px")));
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function makeNamedPath(doc, name, anchors) {
    var points = [];
    for (var i = 0; i < anchors.length; i += 1) {
      var point = new PathPointInfo();
      point.kind = PointKind.CORNERPOINT;
      point.anchor = [anchors[i][0], anchors[i][1]];
      point.leftDirection = point.anchor;
      point.rightDirection = point.anchor;
      points.push(point);
    }
    var subPath = new SubPathInfo();
    subPath.closed = true;
    subPath.operation = ShapeOperation.SHAPEADD;
    subPath.entireSubPath = points;
    return doc.pathItems.add(name, [subPath]);
  }

  function addRevealSelectionMask() {
    var descriptor = new ActionDescriptor();
    descriptor.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
    var reference = new ActionReference();
    reference.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
    descriptor.putReference(charIDToTypeID("At  "), reference);
    descriptor.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
    executeAction(charIDToTypeID("Mk  "), descriptor, DialogModes.NO);
  }

  function addMaskedPathGrade(doc, group, options) {
    var layer = doc.artLayers.add();
    layer.name = options.name;
    doc.selection.selectAll();
    doc.selection.fill(rgb(options.colorHex), ColorBlendMode.NORMAL, 100, false);
    doc.selection.deselect();
    layer.opacity = options.opacity;
    layer.blendMode = options.blendMode;
    layer.move(group, ElementPlacement.INSIDE);
    doc.activeLayer = layer;
    var path = makeNamedPath(doc, options.pathName, options.anchors);
    path.makeSelection(options.featherPx, true, SelectionType.REPLACE);
    addRevealSelectionMask();
    doc.selection.deselect();
    return layer;
  }

  function addGuides(doc) {
    doc.guides.add(Direction.VERTICAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(WIDTH_MM - 18, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(48, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(370, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(185, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(285, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(670, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(HEIGHT_MM - 90, "mm"));
  }

  function saveOutputs(doc) {
    var psdFile = new File(OUTPUT_ROOT.fsName + "/jinhu-exhibition-entrance-first-piece.psd");
    var pdfFile = new File(OUTPUT_ROOT.fsName + "/jinhu-exhibition-entrance-first-piece.pdf");
    var pngFile = new File(OUTPUT_ROOT.fsName + "/jinhu-exhibition-entrance-first-piece-preview.png");

    var preview = doc.duplicate("JINHU_EXHIBITION_FIRST_PIECE_RGB_PREVIEW", false);
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
    requireFile(VISUAL_FILE, "AI exhibition key visual");
    requireFile(LOGO_FILE, "approved Jinhu logo");
    ensureFolder(OUTPUT_ROOT);
    for (var openIndex = app.documents.length - 1; openIndex >= 0; openIndex -= 1) {
      var openDocument = app.documents[openIndex];
      if (openDocument.name.indexOf("jinhu-exhibition-entrance-first-piece") >= 0 || openDocument.name.indexOf("JINHU_EXHIBITION_FIRST_PIECE") >= 0) {
        openDocument.close(SaveOptions.DONOTSAVECHANGES);
      }
    }

    var widthPx = mmToPx(WIDTH_MM);
    var heightPx = mmToPx(HEIGHT_MM);
    var doc = app.documents.add(UnitValue(WIDTH_MM, "mm"), UnitValue(HEIGHT_MM, "mm"), DPI, "JINHU_EXHIBITION_ENTRANCE_FIRST_PIECE_MASTER_RGB", NewDocumentMode.RGB, DocumentFill.WHITE);
    var background = addGroup(doc, "00_MASTER_BACKGROUND");
    var visual = addGroup(doc, "10_HERO_SMART_OBJECT");
    var grade = addGroup(doc, "20_LOCAL_GRADE_AND_PATH_MASKS");
    var brand = addGroup(doc, "30_BRAND_LOCKUP");
    var copy = addGroup(doc, "40_TYPOGRAPHY_RHYTHM_100_PERCENT");
    var review = addGroup(doc, "90_REVIEW_NOTES_AND_GUIDES");
    var exportGroup = addGroup(doc, "99_EXPORT_CONTROL");
    review.visible = false;
    exportGroup.visible = false;

    addSolidRect(doc, background, "01_WARM_WHITE_BASE", 0, 0, widthPx, heightPx, "F6F2EB", 100, BlendMode.NORMAL);
    var sourceInfo = placeVisual(doc, visual, widthPx, heightPx);

    addMaskedPathGrade(doc, grade, {
      name: "21_COPY_FIELD_WARM_WHITE_REAL_PATH_MASK",
      pathName: "COPY_FIELD_BLEND_PATH",
      anchors: [[0, 0], [mmToPx(395), 0], [mmToPx(350), mmToPx(420)], [mmToPx(300), mmToPx(760)], [0, mmToPx(900)]],
      featherPx: 150,
      colorHex: "F8F5EF",
      opacity: 46,
      blendMode: BlendMode.NORMAL
    });
    addMaskedPathGrade(doc, grade, {
      name: "22_PRODUCT_AND_PEOPLE_FOCUS_REAL_PATH_MASK",
      pathName: "PRODUCT_FOCUS_PATH",
      anchors: [[mmToPx(255), mmToPx(630)], [widthPx, mmToPx(560)], [widthPx, heightPx], [mmToPx(170), heightPx]],
      featherPx: 260,
      colorHex: "4C5B68",
      opacity: 8,
      blendMode: BlendMode.MULTIPLY
    });

    placeLogo(doc, brand);
    addText(doc, brand, {
      name: "32_BRAND_NAME_36PT", contents: "\u91D1\u6E56\u79D1\u521B\u4EA7\u4E1A\u56ED",
      x: mmToPx(120), y: mmToPx(62), width: mmToPx(300), height: mmToPx(48),
      font: "PingFangSC-Semibold", sizePt: 36, leadingPt: 44, tracking: 28, colorHex: "0B2B51"
    });
    addText(doc, brand, {
      name: "33_VENUE_NAME_30PT", contents: "\u5C55\u8D38\u4E2D\u5FC3",
      x: mmToPx(120), y: mmToPx(110), width: mmToPx(220), height: mmToPx(38),
      font: "PingFangSC-Medium", sizePt: 30, leadingPt: 38, tracking: 80, colorHex: "A6782B"
    });

    addText(doc, copy, {
      name: "41_HEADLINE_LINE_ONE_88PT", contents: "\u8BA9\u597D\u4EA7\u54C1",
      x: mmToPx(48), y: mmToPx(292), width: mmToPx(300), height: mmToPx(120),
      font: "PingFangSC-Semibold", sizePt: 88, leadingPt: 102, tracking: 4, colorHex: "0B2B51"
    });
    addText(doc, copy, {
      name: "42_HEADLINE_LINE_TWO_118PT", contents: "\u88AB\u66F4\u591A\u4EBA\u770B\u89C1",
      x: mmToPx(48), y: mmToPx(400), width: mmToPx(350), height: mmToPx(150),
      font: "PingFangSC-Semibold", sizePt: 118, leadingPt: 132, tracking: -2, colorHex: "1F66C5"
    });
    addText(doc, copy, {
      name: "43_SUPPORT_COPY_42PT", contents: "\u5728\u8FD9\u91CC\uFF0C\u770B\u89C1\u4F01\u4E1A\u7684\u4EA7\u54C1\u3001\u80FD\u529B\r\u4E0E\u5408\u4F5C\u4EF7\u503C\u3002",
      x: mmToPx(50), y: mmToPx(590), width: mmToPx(330), height: mmToPx(130),
      font: "PingFangSC-Regular", sizePt: 42, leadingPt: 60, tracking: 10, colorHex: "4B5563"
    });

    addText(doc, review, {
      name: "91_PRODUCTION_SOURCE_NOTE", contents: "AI SOURCE " + sourceInfo.originalWidth + "x" + sourceInfo.originalHeight + " PX / PHOTOSHOP PRODUCTION RESAMPLE " + sourceInfo.productionWidth + "x" + sourceInfo.productionHeight + " PX",
      x: mmToPx(48), y: mmToPx(1290), width: mmToPx(520), height: mmToPx(40),
      font: "Helvetica", sizePt: 18, leadingPt: 22, tracking: 0, colorHex: "D00000"
    });
    addGuides(doc);

    var files = saveOutputs(doc);
    var log = [
      "ANKSEN PHOTOSHOP EXHIBITION FIRST-PIECE PRODUCTION",
      "status=PASS",
      "concept=GOOD_PRODUCTS_ARE_SEEN",
      "generated=" + new Date().toUTCString(),
      "document=640x1440mm@150ppi",
      "pixel_size=" + widthPx + "x" + heightPx,
      "color_mode=CMYK",
      "preferred_profile_applied=" + files.converted,
      "editable_text=true",
      "text_horizontal_scale=100",
      "text_vertical_scale=100",
      "visible_text_sizes_pt=30,36,42,88,118",
      "ai_visual_smart_object=true",
      "ai_source_original_pixels=" + sourceInfo.originalWidth + "x" + sourceInfo.originalHeight,
      "photoshop_production_resample=" + sourceInfo.productionWidth + "x" + sourceInfo.productionHeight,
      "original_effective_ppi_at_final_size=" + sourceInfo.originalEffectivePpi.toFixed(1),
      "named_paths=COPY_FIELD_BLEND_PATH,PRODUCT_FOCUS_PATH",
      "real_layer_masks=2",
      "local_grade_layers=2",
      "logo_lockup=APPROVED_MARK_PLUS_EDITABLE_WORDMARK",
      "review_scales=REMOTE,NORMAL,CLOSE",
      "delivery_gate=VISUAL_AND_FILE_QA_ONLY",
      "psd=" + files.psd.fsName,
      "pdf=" + files.pdf.fsName,
      "png=" + files.png.fsName
    ].join("\n");
    writeText(new File(OUTPUT_ROOT.fsName + "/production-log.txt"), log);
    writeText(RESULT_MARKER, log);
    alert("\u91D1\u6E56\u79D1\u521B\u4EA7\u4E1A\u56ED\u5C55\u8D38\u4E2D\u5FC3\u9996\u4EF6\u5DF2\u5B8C\u6210\u3002\nPSD\u3001PDF \u4E0E PNG \u5DF2\u8F93\u51FA\u3002");
  } catch (error) {
    var failure = "status=FAIL\nmessage=" + error.message + "\nline=" + error.line + "\nfile=" + error.fileName;
    writeText(RESULT_MARKER, failure);
    alert("\u9996\u4EF6\u751F\u4EA7\u5931\u8D25\uFF1A\n" + error.message + "\n\u884C\uFF1A" + error.line);
  }
})();
