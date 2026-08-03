#target photoshop
app.displayDialogs = DialogModes.NO;

(function () {
  var SCRIPT_FILE = new File($.fileName);
  var REPO_ROOT = SCRIPT_FILE.parent.parent.parent.parent;
  var START_MARKER = new File("/tmp/jinhu-photoshop-series-started.txt");
  var OLD_ERROR_MARKER = new File("/tmp/jinhu-photoshop-series-error.txt");
  if (OLD_ERROR_MARKER.exists) OLD_ERROR_MARKER.remove();
  START_MARKER.open("w");
  START_MARKER.write("started " + new Date().toUTCString() + "\nscript=" + SCRIPT_FILE.fsName + "\nrepo=" + REPO_ROOT.fsName);
  START_MARKER.close();
  var MANIFEST_FILE = new File(REPO_ROOT.fsName + "/design-assets/jinhu-12-panel-series/photoshop-production-manifest.json");
  var LOGO_FILE = new File(REPO_ROOT.fsName + "/packages/photoshop-uxp-plugin/assets/jinhu-logo.jpg");
  var MM_PER_INCH = 25.4;

  function fail(message) { throw new Error(message); }

  function requireFile(file, label) {
    if (!file.exists) fail("Missing " + label + ": " + file.fsName);
    return file;
  }

  function readJson(file) {
    requireFile(file, "manifest");
    file.encoding = "UTF8";
    file.open("r");
    var source = file.read();
    file.close();
    // Photoshop's legacy ExtendScript engine does not provide JSON globally.
    // This manifest is a trusted local file shipped with the production task.
    return eval("(" + source + ")");
  }

  function ensureFolder(path) {
    var folder = new Folder(path);
    if (!folder.exists && !folder.create()) fail("Cannot create output folder: " + path);
    return folder;
  }

  function writeText(file, contents) {
    file.encoding = "UTF8";
    file.open("w");
    file.write(contents);
    file.close();
  }

  function mmToPx(mm, dpi) { return Math.round(mm / MM_PER_INCH * dpi); }
  function px(value) { return UnitValue(Math.round(value), "px"); }

  function color(hex) {
    var value = new SolidColor();
    value.rgb.hexValue = hex;
    return value;
  }

  function addGroup(doc, name) {
    var group = doc.layerSets.add();
    group.name = name;
    return group;
  }

  function addSolidRect(doc, group, name, x, y, width, height, hex, opacity, blendMode) {
    var layer = doc.artLayers.add();
    layer.name = name;
    doc.selection.select([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);
    doc.selection.fill(color(hex), ColorBlendMode.NORMAL, 100, false);
    doc.selection.deselect();
    layer.opacity = opacity;
    if (blendMode) layer.blendMode = blendMode;
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function paragraphText(doc, group, options) {
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
    item.leading = UnitValue(options.leadingPt || options.sizePt * 1.22, "pt");
    item.tracking = options.tracking || 0;
    item.justification = options.align === "right" ? Justification.RIGHT : Justification.LEFT;
    item.antiAliasMethod = AntiAlias.SHARP;
    item.color = color(options.colorHex);
    try { item.horizontalScale = 100; } catch (ignoreHorizontalScale) {}
    try { item.verticalScale = 100; } catch (ignoreVerticalScale) {}
    try { item.fauxBold = false; } catch (ignoreFauxBold) {}
    try { item.fauxItalic = false; } catch (ignoreFauxItalic) {}
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function resizeSourceForPrint(source, widthPx, heightPx, dpi) {
    source.flatten();
    var method = ResampleMethod.BICUBICSMOOTHER;
    try { method = ResampleMethod.PRESERVEDETAILS; } catch (ignorePreserveDetails) {}
    source.resizeImage(px(widthPx), px(heightPx), dpi, method);
    try { source.activeLayer.applyUnSharpMask(48, 1.1, 2); } catch (ignoreSharpen) {}
  }

  function convertActiveLayerToSmartObject() {
    try { executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO); } catch (ignoreSmartObject) {}
  }

  function placeMainVisual(doc, group, sourceFile, widthPx, heightPx, dpi) {
    var source = app.open(requireFile(sourceFile, "AI visual"));
    resizeSourceForPrint(source, widthPx, heightPx, dpi);
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    var layer = doc.activeLayer;
    layer.name = "11_AI_VISUAL_UPSCALED";
    convertActiveLayerToSmartObject();
    layer = doc.activeLayer;
    layer.name = "11_AI_VISUAL_SMART_OBJECT";
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function placeLogo(doc, group, dpi) {
    var source = app.open(requireFile(LOGO_FILE, "approved logo"));
    source.flatten();
    var targetWidth = mmToPx(72, dpi);
    var scale = targetWidth / source.width.as("px");
    var targetHeight = Math.round(source.height.as("px") * scale);
    source.resizeImage(px(targetWidth), px(targetHeight), dpi, ResampleMethod.BICUBICSHARPER);
    source.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
    source.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    var layer = doc.activeLayer;
    layer.name = "31_APPROVED_LOGO";
    var bounds = layer.bounds;
    var left = mmToPx(58, dpi);
    var top = mmToPx(52, dpi);
    layer.translate(px(left - bounds[0].as("px")), px(top - bounds[1].as("px")));
    layer.move(group, ElementPlacement.INSIDE);
    return layer;
  }

  function addGuides(doc, widthMm, heightMm) {
    doc.guides.add(Direction.VERTICAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.VERTICAL, UnitValue(widthMm - 18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(heightMm - 18, "mm"));
    doc.guides.add(Direction.HORIZONTAL, UnitValue(heightMm - 100, "mm"));
  }

  function resolveHeadlineSize(page, type) {
    var plainLength = page.headline.replace(/\n/g, "").length;
    if (plainLength > 13) return type.headlineLongSizePt;
    if (page.headline.indexOf("\n") >= 0) return 94;
    return type.headlineSizePt;
  }

  function shouldRenderPage(manifest, pageNumber) {
    if (!manifest.renderPages || !manifest.renderPages.length) return true;
    for (var i = 0; i < manifest.renderPages.length; i += 1) {
      if (manifest.renderPages[i] === pageNumber) return true;
    }
    return false;
  }

  function saveOutputs(doc, page, output, manifest) {
    var prefix = (page.page < 10 ? "0" : "") + page.page + "-" + page.slug;
    var psdFile = new File(output.psd.fsName + "/" + prefix + ".psd");
    var pdfFile = new File(output.pdf.fsName + "/" + prefix + "-print.pdf");
    var pngFile = new File(output.preview.fsName + "/" + prefix + "-4k.png");

    var preview = doc.duplicate("JINHU_" + page.page + "_RGB_4K_PREVIEW", false);
    try {
      app.activeDocument = preview;
      preview.changeMode(ChangeMode.RGB);
      preview.resizeImage(undefined, px(manifest.document.previewHeightPx), 150, ResampleMethod.BICUBICSHARPER);
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
      doc.convertProfile(manifest.document.preferredPrintProfile, Intent.RELATIVECOLORIMETRIC, true, true);
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

    return { psd: psdFile, pdf: pdfFile, png: pngFile };
  }

  function buildPage(page, manifest, output) {
    var dpi = manifest.document.resolution;
    var widthMm = manifest.document.widthMm;
    var heightMm = manifest.document.heightMm;
    var widthPx = mmToPx(widthMm, dpi);
    var heightPx = mmToPx(heightMm, dpi);
    var sourceFile = new File(REPO_ROOT.fsName + "/" + manifest.sourceDirectory + "/" + page.file);
    var docName = "JINHU_" + (page.page < 10 ? "0" : "") + page.page + "_" + page.slug;
    var doc = app.documents.add(UnitValue(widthMm, "mm"), UnitValue(heightMm, "mm"), dpi, docName, NewDocumentMode.RGB, DocumentFill.WHITE);

    try {
      var gBackground = addGroup(doc, "00_BACKGROUND_BASE");
      var gVisual = addGroup(doc, "10_MAIN_VISUAL_SMART_OBJECT");
      var gTone = addGroup(doc, "20_TONAL_AND_PRINT_CONTROL");
      var gBrand = addGroup(doc, "30_BRAND_LOCKUP");
      var gCopy = addGroup(doc, "40_EDITABLE_COPY_100_PERCENT_SCALE");
      var gReview = addGroup(doc, "90_REVIEW_AND_GUIDES");
      var gExport = addGroup(doc, "99_EXPORT_CONTROL");
      gBackground.visible = true;
      gReview.visible = false;
      gExport.visible = false;

      placeMainVisual(doc, gVisual, sourceFile, widthPx, heightPx, dpi);
      addSolidRect(doc, gTone, "21_NAVY_SOFT_LIGHT_UNIFIER", 0, 0, widthPx, heightPx, manifest.palette.navy, page.tone === "dark" ? 12 : 6, BlendMode.SOFTLIGHT);
      placeLogo(doc, gBrand, dpi);

      var textHex = page.tone === "dark" ? manifest.palette.warmWhite : manifest.palette.navy;
      var secondaryHex = page.tone === "dark" ? "E6EAF2" : "29486F";
      var align = page.align;
      // Photoshop 2026's legacy ExtendScript engine positions right-justified
      // paragraph boxes inconsistently. Keep the even-page copy on the right
      // side but use a reliable left-justified text box there.
      var copyXmm = align === "left" ? 60 : 180;
      var copyWidthMm = align === "left" ? 500 : 400;
      var accentXmm = copyXmm;
      var textAlign = "left";
      var multiline = page.headline.indexOf("\n") >= 0;
      var headlineSize = resolveHeadlineSize(page, manifest.typography);
      var taglineYmm = multiline ? 405 : 350;
      var bodyYmm = taglineYmm + 67;
      var accentHex = page.tone === "dark" ? manifest.palette.champagneGold : "8C641F";

      paragraphText(doc, gBrand, {
        name: "32_BRAND_NAME", contents: manifest.brand,
        x: mmToPx(150, dpi), y: mmToPx(73, dpi), width: mmToPx(360, dpi), height: mmToPx(46, dpi),
        font: manifest.typography.brandPostScriptName, sizePt: manifest.typography.brandSizePt,
        leadingPt: 34, tracking: 45, align: "left", colorHex: textHex
      });

      addSolidRect(doc, gCopy, "41_GOLD_SECTION_MARK", mmToPx(accentXmm, dpi), mmToPx(205, dpi), mmToPx(9, dpi), mmToPx(22, dpi), accentHex, 100, BlendMode.NORMAL);
      paragraphText(doc, gCopy, {
        name: "42_SECTION_" + page.section, contents: (page.page < 10 ? "0" : "") + page.page + "  " + page.section,
        x: mmToPx(copyXmm, dpi), y: mmToPx(205, dpi), width: mmToPx(copyWidthMm, dpi), height: mmToPx(36, dpi),
        font: manifest.typography.taglinePostScriptName, sizePt: 22, leadingPt: 28, tracking: 90, align: textAlign, colorHex: accentHex
      });
      paragraphText(doc, gCopy, {
        name: "43_HEADLINE", contents: page.headline.replace(/\n/g, "\r"),
        x: mmToPx(copyXmm, dpi), y: mmToPx(255, dpi), width: mmToPx(copyWidthMm, dpi), height: mmToPx(multiline ? 150 : 90, dpi),
        font: manifest.typography.headlinePostScriptName, sizePt: headlineSize, leadingPt: headlineSize * 1.18, tracking: 12, align: textAlign, colorHex: textHex
      });
      paragraphText(doc, gCopy, {
        name: "44_TAGLINE", contents: page.tagline,
        x: mmToPx(copyXmm, dpi), y: mmToPx(taglineYmm, dpi), width: mmToPx(copyWidthMm, dpi), height: mmToPx(60, dpi),
        font: manifest.typography.taglinePostScriptName, sizePt: manifest.typography.taglineSizePt, leadingPt: 62, tracking: 36, align: textAlign, colorHex: accentHex
      });
      paragraphText(doc, gCopy, {
        name: "45_BODY_COPY_MIN_32PT", contents: page.body,
        x: mmToPx(copyXmm, dpi), y: mmToPx(bodyYmm, dpi), width: mmToPx(copyWidthMm, dpi), height: mmToPx(60, dpi),
        font: manifest.typography.bodyPostScriptName, sizePt: manifest.typography.bodySizePt, leadingPt: 42, tracking: 25, align: textAlign, colorHex: secondaryHex
      });

      addGuides(doc, widthMm, heightMm);
      return saveOutputs(doc, page, output, manifest);
    } finally {
      doc.close(SaveOptions.DONOTSAVECHANGES);
    }
  }

  try {
  var manifest = readJson(MANIFEST_FILE);
  var outputRoot = ensureFolder(manifest.outputDirectory);
  var output = {
    root: outputRoot,
    psd: ensureFolder(outputRoot.fsName + "/PSD"),
    pdf: ensureFolder(outputRoot.fsName + "/PDF"),
    preview: ensureFolder(outputRoot.fsName + "/PREVIEW_4K")
  };
  var results = [];
  var errors = [];

  for (var i = 0; i < manifest.pages.length; i += 1) {
    var page = manifest.pages[i];
    if (!shouldRenderPage(manifest, page.page)) continue;
    try {
      var files = buildPage(page, manifest, output);
      results.push("PASS " + page.page + " " + page.slug + " | " + files.psd.name + " | " + files.pdf.name + " | " + files.png.name);
    } catch (error) {
      errors.push("FAIL " + page.page + " " + page.slug + " | " + error.message);
    }
  }

  var log = [
    "JINHU SCIENCE AND INNOVATION INDUSTRIAL PARK - 12 PANEL PRODUCTION",
    "Generated: " + new Date().toUTCString(),
    "Document: " + manifest.document.widthMm + "x" + manifest.document.heightMm + "mm @ " + manifest.document.resolution + "ppi",
    "Output: " + outputRoot.fsName,
    "",
    results.join("\n"),
    errors.length ? "\nERRORS\n" + errors.join("\n") : "\nCOMPLETED " + results.length + " SELECTED PANEL(S)"
  ].join("\n");
  writeText(new File(outputRoot.fsName + "/production-log.txt"), log);
  alert(errors.length ? "金湖十二联画完成，但有 " + errors.length + " 页失败。请查看 production-log.txt。" : "金湖十二联画已在 Photoshop 中完成：" + results.length + " 页。\n" + outputRoot.fsName);
  } catch (fatalError) {
    var fatalFile = new File("/tmp/jinhu-photoshop-series-error.txt");
    fatalFile.encoding = "UTF8";
    fatalFile.open("w");
    fatalFile.write("message=" + fatalError.message + "\nline=" + fatalError.line + "\nfile=" + fatalError.fileName);
    fatalFile.close();
    alert("金湖十二联画脚本初始化失败：\n" + fatalError.message + "\n行：" + fatalError.line);
  }
})();
