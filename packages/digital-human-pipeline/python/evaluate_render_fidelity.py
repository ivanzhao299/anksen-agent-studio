"""Measure inverse-render fidelity against the governed multiview reference bundle."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage
from skimage.metrics import structural_similarity


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--contact-sheet", required=True)
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--size", type=int, default=640)
    return parser.parse_args()


def resolve_path(repo_root, value):
    path = Path(value)
    return path if path.is_absolute() else repo_root / path


def bbox(mask):
    rows, columns = np.nonzero(mask)
    if not len(rows):
        return None
    return columns.min(), rows.min(), columns.max() + 1, rows.max() + 1


def normalize_rgb(image, mask, size):
    bounds = bbox(mask)
    output = np.zeros((size, size, 3), dtype=np.uint8)
    output_mask = np.zeros((size, size), dtype=bool)
    if bounds is None:
        return output, output_mask
    x1, y1, x2, y2 = bounds
    crop = image[y1:y2, x1:x2]
    crop_mask = (mask[y1:y2, x1:x2] * 255).astype(np.uint8)
    scale = min((size * 0.90) / crop.shape[1], (size * 0.90) / crop.shape[0])
    target = (
        max(1, round(crop.shape[1] * scale)),
        max(1, round(crop.shape[0] * scale)),
    )
    resized = cv2.resize(crop, target, interpolation=cv2.INTER_LANCZOS4)
    resized_mask = cv2.resize(crop_mask, target, interpolation=cv2.INTER_NEAREST) > 127
    offset_x = (size - target[0]) // 2
    offset_y = (size - target[1]) // 2
    output[offset_y : offset_y + target[1], offset_x : offset_x + target[0]] = resized
    output_mask[
        offset_y : offset_y + target[1], offset_x : offset_x + target[0]
    ] = resized_mask
    output[~output_mask] = 0
    return output, output_mask


def reference_mask(path):
    array = np.asarray(Image.open(path).convert("L"))
    return array < 127 if array.mean() > 127 else array > 127


def rendered_silhouette_mask(path):
    array = np.asarray(Image.open(path).convert("RGBA"))
    return array[:, :, 3] > 8


def rendered_color_mask(image):
    height, width = image.shape[:2]
    samples = np.concatenate(
        [
            image[: max(8, height // 20), : max(8, width // 20)].reshape(-1, 3),
            image[: max(8, height // 20), -max(8, width // 20) :].reshape(-1, 3),
        ]
    )
    background = np.median(samples.astype(np.float32), axis=0)
    difference = np.linalg.norm(image.astype(np.float32) - background, axis=2)
    lightness = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    mask = np.logical_or(difference > 24, lightness > max(32, float(background.mean()) + 22))
    mask[int(height * 0.945) :, :] = False
    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, kernel, iterations=2)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        return mask.astype(bool)
    center = np.array([width / 2, height / 2])
    candidates = []
    for index in range(1, count):
        area = stats[index, cv2.CC_STAT_AREA]
        if area < width * height * 0.01:
            continue
        distance = np.linalg.norm((centroids[index] - center) / np.array([width, height]))
        candidates.append((area * max(0.2, 1 - distance), index))
    selected = max(candidates, default=(0, 1))[1]
    result = labels == selected
    result = ndimage.binary_fill_holes(result)
    result = ndimage.binary_closing(result, iterations=3)
    return result


def normalize_mask(mask, size):
    blank = np.zeros((*mask.shape, 3), dtype=np.uint8)
    _, normalized = normalize_rgb(blank, mask, size)
    return normalized


def silhouette_metrics(reference, candidate):
    intersection = np.logical_and(reference, candidate).sum()
    union = np.logical_or(reference, candidate).sum()
    total = reference.sum() + candidate.sum()
    return {
        "iou": float(intersection / union) if union else 1.0,
        "dice": float((2 * intersection) / total) if total else 1.0,
    }


def edge_map(image, mask):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0.8)
    edges = cv2.Canny(gray, 45, 135) > 0
    boundary = cv2.morphologyEx(
        (mask * 255).astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)
    ) > 0
    return np.logical_or(edges & ndimage.binary_dilation(mask, iterations=2), boundary)


def chamfer_similarity(reference_edges, candidate_edges, size):
    if not reference_edges.any() or not candidate_edges.any():
        return 0.0
    distance_to_candidate = ndimage.distance_transform_edt(~candidate_edges)
    distance_to_reference = ndimage.distance_transform_edt(~reference_edges)
    mean_distance = (
        distance_to_candidate[reference_edges].mean()
        + distance_to_reference[candidate_edges].mean()
    ) / 2
    return float(np.exp(-mean_distance / max(1.0, size * 0.025)))


def gradient_image(image, mask):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    gradient = cv2.magnitude(gx, gy)
    high = np.percentile(gradient[mask], 99) if mask.any() else 1.0
    gradient = np.clip(gradient / max(0.05, high), 0, 1)
    gradient[~ndimage.binary_dilation(mask, iterations=2)] = 0
    return gradient


def multiscale_structure(reference, candidate, mask):
    scores = []
    reference_level = reference
    candidate_level = candidate
    mask_level = mask
    for _ in range(3):
        if min(reference_level.shape) < 32:
            break
        score, similarity_map = structural_similarity(
            reference_level,
            candidate_level,
            data_range=1.0,
            full=True,
        )
        if mask_level.any():
            score = float(similarity_map[mask_level].mean())
        scores.append(max(0.0, min(1.0, score)))
        reference_level = cv2.resize(
            reference_level,
            (reference_level.shape[1] // 2, reference_level.shape[0] // 2),
            interpolation=cv2.INTER_AREA,
        )
        candidate_level = cv2.resize(
            candidate_level,
            (candidate_level.shape[1] // 2, candidate_level.shape[0] // 2),
            interpolation=cv2.INTER_AREA,
        )
        mask_level = (
            cv2.resize(
                mask_level.astype(np.uint8),
                (reference_level.shape[1], reference_level.shape[0]),
                interpolation=cv2.INTER_NEAREST,
            )
            > 0
        )
    return float(np.mean(scores)) if scores else 0.0


def color_material_similarity(reference, candidate, mask):
    if mask.sum() < 16:
        return 0.0
    ref_hsv = cv2.cvtColor(reference, cv2.COLOR_RGB2HSV)
    candidate_hsv = cv2.cvtColor(candidate, cv2.COLOR_RGB2HSV)
    hist_ref = cv2.calcHist([ref_hsv], [0, 1], mask.astype(np.uint8), [24, 16], [0, 180, 0, 256])
    hist_candidate = cv2.calcHist(
        [candidate_hsv], [0, 1], mask.astype(np.uint8), [24, 16], [0, 180, 0, 256]
    )
    cv2.normalize(hist_ref, hist_ref)
    cv2.normalize(hist_candidate, hist_candidate)
    distance = cv2.compareHist(hist_ref, hist_candidate, cv2.HISTCMP_BHATTACHARYYA)
    return float(max(0.0, min(1.0, 1.0 - distance)))


def crop_region(array, box):
    height, width = array.shape[:2]
    x1, y1, x2, y2 = box
    return array[
        max(0, round(y1 * height)) : min(height, round(y2 * height)),
        max(0, round(x1 * width)) : min(width, round(x2 * width)),
    ]


def region_metrics(reference, candidate, reference_mask_value, candidate_mask, box):
    ref_crop = crop_region(reference, box)
    candidate_crop = crop_region(candidate, box)
    ref_mask_crop = crop_region(reference_mask_value, box)
    candidate_mask_crop = crop_region(candidate_mask, box)
    shared_mask = np.logical_or(ref_mask_crop, candidate_mask_crop)
    ref_edges = edge_map(ref_crop, ref_mask_crop)
    candidate_edges = edge_map(candidate_crop, candidate_mask_crop)
    edge = chamfer_similarity(ref_edges, candidate_edges, max(ref_crop.shape[:2]))
    structure = multiscale_structure(
        gradient_image(ref_crop, ref_mask_crop),
        gradient_image(candidate_crop, candidate_mask_crop),
        shared_mask,
    )
    color = color_material_similarity(ref_crop, candidate_crop, shared_mask)
    composite = 0.4 * edge + 0.35 * structure + 0.25 * color
    return {
        "edgeChamferSimilarity": round(edge, 6),
        "structuralSimilarity": round(structure, 6),
        "colorMaterialSimilarity": round(color, 6),
        "composite": round(composite, 6),
    }


def find_angle_file(root, angle, kind):
    patterns = (
        [f"*{angle:03d}.png", f"silhouette-{angle:03d}.png"]
        if kind == "silhouette"
        else [f"*-{angle:03d}.png", f"*{angle:03d}.png"]
    )
    for pattern in patterns:
        matches = sorted(root.glob(pattern))
        if matches:
            return matches[0]
    raise FileNotFoundError(f"No {kind} render for angle {angle:03d} in {root}")


def add_label(image, lines):
    output = image.copy()
    draw = ImageDraw.Draw(output)
    height = 18 + len(lines) * 18
    draw.rectangle((0, 0, output.width, height), fill=(7, 12, 20, 230))
    font = ImageFont.load_default()
    for index, line in enumerate(lines):
        draw.text((10, 8 + index * 18), line, fill=(245, 248, 252), font=font)
    return output


def main():
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    config = json.loads(Path(args.config).read_text(encoding="utf-8"))
    manifest = json.loads(
        resolve_path(repo_root, config["referenceManifest"]).read_text(encoding="utf-8")
    )
    render_root = resolve_path(repo_root, config["candidateRenderRoot"])
    silhouette_root = resolve_path(repo_root, config["candidateSilhouetteRoot"])
    output_path = Path(args.output).resolve()
    contact_path = Path(args.contact_sheet).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    contact_path.parent.mkdir(parents=True, exist_ok=True)

    views = []
    contact_cells = []
    front_semantic = []
    for view in manifest["views"]:
        angle = int(view["angle"])
        reference_path = Path(view["normalizedPath"])
        reference_mask_path = Path(view["maskPath"])
        candidate_path = find_angle_file(render_root, angle, "color")
        candidate_silhouette_path = find_angle_file(silhouette_root, angle, "silhouette")

        reference_source = np.asarray(Image.open(reference_path).convert("RGB"))
        reference_source_mask = reference_mask(reference_mask_path)
        reference, normalized_reference_mask = normalize_rgb(
            reference_source, reference_source_mask, args.size
        )
        candidate_source = np.asarray(Image.open(candidate_path).convert("RGB"))
        candidate_source_mask = rendered_color_mask(candidate_source)
        candidate, normalized_candidate_color_mask = normalize_rgb(
            candidate_source, candidate_source_mask, args.size
        )
        candidate_silhouette = normalize_mask(
            rendered_silhouette_mask(candidate_silhouette_path), args.size
        )

        silhouette = silhouette_metrics(normalized_reference_mask, candidate_silhouette)
        reference_edges = edge_map(reference, normalized_reference_mask)
        candidate_edges = edge_map(candidate, normalized_candidate_color_mask)
        edge = chamfer_similarity(reference_edges, candidate_edges, args.size)
        shared_mask = np.logical_or(
            normalized_reference_mask, normalized_candidate_color_mask
        )
        structure = multiscale_structure(
            gradient_image(reference, normalized_reference_mask),
            gradient_image(candidate, normalized_candidate_color_mask),
            shared_mask,
        )
        color = color_material_similarity(reference, candidate, shared_mask)
        composite = (
            0.35 * silhouette["iou"] + 0.25 * edge + 0.25 * structure + 0.15 * color
        )
        row = {
            "angle": angle,
            "view": view["view"],
            "authority": view["authority"],
            "metricAuthority": angle == int(manifest["authoritativeView"]),
            "silhouetteIou": round(silhouette["iou"], 6),
            "silhouetteDice": round(silhouette["dice"], 6),
            "edgeChamferSimilarity": round(edge, 6),
            "multiscaleStructuralSimilarity": round(structure, 6),
            "colorMaterialSimilarity": round(color, 6),
            "composite": round(composite, 6),
        }
        views.append(row)

        reference_visual = Image.fromarray(reference).resize((256, 256))
        candidate_visual = Image.fromarray(candidate).resize((256, 256))
        overlay = np.zeros((args.size, args.size, 3), dtype=np.uint8)
        overlay[:, :, 0] = normalized_reference_mask.astype(np.uint8) * 220
        overlay[:, :, 1] = candidate_silhouette.astype(np.uint8) * 190
        overlay_visual = Image.fromarray(overlay).resize((256, 256))
        cell = Image.new("RGB", (768, 256), (8, 13, 22))
        cell.paste(reference_visual, (0, 0))
        cell.paste(candidate_visual, (256, 0))
        cell.paste(overlay_visual, (512, 0))
        contact_cells.append(
            add_label(
                cell,
                [
                    f"{angle:03d} {view['view']}",
                    f"IoU {silhouette['iou']:.3f} edge {edge:.3f} struct {structure:.3f}",
                ],
            )
        )

        if angle == int(manifest["authoritativeView"]):
            for region in config["semanticRegions"]:
                metrics = region_metrics(
                    reference,
                    candidate,
                    normalized_reference_mask,
                    normalized_candidate_color_mask,
                    region["box"],
                )
                front_semantic.append(
                    {
                        "id": region["id"],
                        "weight": region["weight"],
                        "box": region["box"],
                        **metrics,
                    }
                )

    front = next(item for item in views if item["metricAuthority"])
    generated = [item for item in views if not item["metricAuthority"]]
    targets = config["promotion"]["targets"]
    minimum_semantic = min(item["composite"] for item in front_semantic)
    weighted_semantic = sum(
        item["composite"] * item["weight"] for item in front_semantic
    ) / sum(item["weight"] for item in front_semantic)
    mean_silhouette = float(np.mean([item["silhouetteIou"] for item in views]))
    diagnostic_composite = float(np.mean([item["composite"] for item in generated]))
    gates = {
        "meanSilhouetteIou": "PASS"
        if mean_silhouette >= targets["meanSilhouetteIou"]
        else "HOLD",
        "frontSilhouetteIou": "PASS"
        if front["silhouetteIou"] >= targets["frontSilhouetteIou"]
        else "HOLD",
        "frontEdgeChamferSimilarity": "PASS"
        if front["edgeChamferSimilarity"] >= targets["frontEdgeChamferSimilarity"]
        else "HOLD",
        "frontStructuralSimilarity": "PASS"
        if front["multiscaleStructuralSimilarity"]
        >= targets["frontStructuralSimilarity"]
        else "HOLD",
        "frontColorMaterialSimilarity": "PASS"
        if front["colorMaterialSimilarity"] >= targets["frontColorMaterialSimilarity"]
        else "HOLD",
        "minimumSemanticComposite": "PASS"
        if minimum_semantic >= targets["minimumSemanticComposite"]
        else "HOLD",
        "frontComposite": "PASS"
        if front["composite"] >= targets["frontComposite"]
        else "HOLD",
    }
    status = (
        "TARGET_MET_AWAITING_OWNER_REVIEW"
        if all(value == "PASS" for value in gates.values())
        else "BASELINE_CAPTURED_GAPS_REMAIN"
    )
    failed = [key for key, value in gates.items() if value != "PASS"]
    report = {
        "schemaVersion": 1,
        "domain": "3D_MODELING",
        "check": "HIGH_RESOLUTION_INVERSE_RENDER_ALIGNMENT",
        "assetId": config["assetId"],
        "baselineVersion": config["baselineVersion"],
        "status": status,
        "releaseBlocked": True,
        "normalization": "foreground-box translation and scale normalization; lighting is not geometry authority",
        "summary": {
            "meanSilhouetteIou": round(mean_silhouette, 6),
            "frontSilhouetteIou": front["silhouetteIou"],
            "frontEdgeChamferSimilarity": front["edgeChamferSimilarity"],
            "frontStructuralSimilarity": front["multiscaleStructuralSimilarity"],
            "frontColorMaterialSimilarity": front["colorMaterialSimilarity"],
            "frontComposite": front["composite"],
            "weightedFrontSemanticComposite": round(weighted_semantic, 6),
            "minimumSemanticComposite": round(minimum_semantic, 6),
            "generatedViewDiagnosticComposite": round(diagnostic_composite, 6),
        },
        "targets": targets,
        "gates": gates,
        "failedGates": failed,
        "views": views,
        "authoritativeFrontSemanticRegions": front_semantic,
        "promotionPolicy": {
            "automaticMasterOverwrite": False,
            "requireNoAuthoritativeFrontRegression": True,
            "generatedViewsAreMetric": False,
            "nextCandidateMustBeatThisBaseline": True,
        },
        "findings": [
            "V15 geometry remains the retained baseline until every fidelity gate passes.",
            "Front semantic regions localize helmet, face, torso, limbs, boots and branding rework.",
            "Generated hidden views are diagnostic only and cannot override the authoritative front.",
        ],
        "limitations": [
            "Appearance scores include renderer lighting and material-authoring differences.",
            "AI-derived hidden views are non-metric observations.",
            "This report does not replace topology, slicer or physical-proof gates.",
        ],
        "externalModelCalled": False,
        "credentialValueRead": False,
    }
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sheet = Image.new("RGB", (1536, 1024), (8, 13, 22))
    for index, cell in enumerate(contact_cells):
        resized = cell.resize((768, 256))
        sheet.paste(resized, ((index % 2) * 768, (index // 2) * 256))
    sheet.save(contact_path, quality=94)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
