from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from io import BytesIO
from pathlib import Path

AUDIT_SCHEMA_VERSION = "consultation-pdf-audit/v3"
CJK_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
FORBIDDEN_PATTERN = re.compile(
    r"(?:<\/?[a-z][^>]{0,300}>|\*\*|__|`{1,3}|^\s*#{1,6}\s|"
    r"[\u2600-\u27bf\U0001f000-\U0001faff])",
    re.IGNORECASE | re.MULTILINE,
)

REQUIRED_FILE_KEYS = {
    "path",
    "plan",
    "planTitle",
    "reportNumber",
    "asOfDate",
    "expectedBodyCjk",
    "expectedTextMarkers",
    "tailMarkers",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _assert_same_file_hash(path: Path, expected_sha256: str, label: str) -> None:
    assert sha256_file(path) == expected_sha256, (
        f"{label} changed while it was being audited; refusing a mixed-byte receipt"
    )


def _assert_catalog_marked_true(marked_value) -> None:
    # pypdf BooleanObject(False) is truthy because it is an object. Inspect its
    # actual PDF boolean value so `/Marked false` cannot masquerade as tagged.
    assert getattr(marked_value, "value", marked_value) is True, (
        "PDF catalog must declare MarkInfo/Marked true"
    )


def _validate_visual_text_order(
    page_index: int,
    semantic_positions: list[tuple[float, float]],
) -> None:
    assert semantic_positions, f"page {page_index + 1} has no positioned semantic text"
    for position_index in range(1, len(semantic_positions)):
        previous_x, previous_y = semantic_positions[position_index - 1]
        current_x, current_y = semantic_positions[position_index]
        assert current_y <= previous_y + 0.01, (
            f"page {page_index + 1} semantic text order moves upward visually at "
            f"item {position_index + 1}: {(previous_x, previous_y)} -> "
            f"{(current_x, current_y)}"
        )
        if abs(current_y - previous_y) <= 0.01:
            assert current_x >= previous_x - 0.01, (
                f"page {page_index + 1} same-line semantic text does not run "
                f"left-to-right at item {position_index + 1}"
            )


def _validate_artifact_text_policy(
    page_index: int,
    page_count: int,
    artifact_positions: list[tuple[float, float]],
) -> None:
    expected_count = 2 if page_index == 0 else 4
    assert len(artifact_positions) == expected_count, (
        f"page {page_index + 1} must contain exactly {expected_count} recurring "
        f"chrome text objects, found {len(artifact_positions)}"
    )
    bottom_positions = [position for position in artifact_positions if position[1] <= 50]
    top_positions = [position for position in artifact_positions if position[1] >= 790]
    middle_positions = [
        position
        for position in artifact_positions
        if 50 < position[1] < 790
    ]
    assert not middle_positions, (
        f"page {page_index + 1} has Artifact text outside the approved header/footer "
        f"bands: {middle_positions}"
    )
    if page_index == 0:
        assert len(bottom_positions) == 2 and not top_positions, (
            "cover Artifact text must be the two footer labels only"
        )
    else:
        assert len(bottom_positions) == 2 and len(top_positions) == 2, (
            f"page {page_index + 1} must contain two header and two footer Artifact "
            "text objects"
        )
    assert 1 <= page_count, "PDF must contain at least one page"


def _validate_parent_tree_key_range(
    page_count: int,
    keys: list[int],
    limits: list[int] | tuple[int, int] | None,
) -> None:
    assert keys == list(range(page_count)), (
        "ParentTree /Nums keys must be the exact consecutive page range"
    )
    assert (
        isinstance(limits, (list, tuple))
        and len(limits) == 2
        and int(limits[0]) == 0
        and int(limits[1]) == page_count - 1
    ), "ParentTree /Limits must span the exact page-key range"


def _validate_text_rect_bounds(
    page_index: int,
    page_width: float,
    page_height: float,
    text_rect: tuple[float, float, float, float],
) -> None:
    x0, y0, x1, y1 = text_rect
    tolerance = 0.75
    assert x0 >= -tolerance and y0 >= -tolerance, (
        f"page {page_index + 1} text starts outside the page: {text_rect}"
    )
    assert x1 <= page_width + tolerance and y1 <= page_height + tolerance, (
        f"page {page_index + 1} text ends outside the page: {text_rect}"
    )
    assert x1 >= x0 and y1 >= y0, (
        f"page {page_index + 1} text rectangle is inverted: {text_rect}"
    )


def _run_policy_self_test() -> dict:
    import tempfile

    class TruthyFalse:
        value = False

        def __bool__(self):
            return True

    rejected: list[str] = []

    def expect_rejected(name: str, check) -> None:
        try:
            check()
        except AssertionError:
            rejected.append(name)
            return
        raise AssertionError(f"policy calibration unexpectedly accepted {name}")

    _assert_catalog_marked_true(True)
    expect_rejected("marked-false", lambda: _assert_catalog_marked_true(TruthyFalse()))

    _validate_visual_text_order(0, [(10, 700), (10, 400), (10, 100)])
    expect_rejected(
        "visual-order-bottom-top-middle",
        lambda: _validate_visual_text_order(0, [(10, 100), (10, 700), (10, 400)]),
    )

    _validate_artifact_text_policy(0, 1, [(10, 28), (500, 28)])
    _validate_artifact_text_policy(
        1,
        2,
        [(10, 810), (500, 810), (10, 26), (500, 26)],
    )
    expect_rejected(
        "body-hidden-as-artifact",
        lambda: _validate_artifact_text_policy(
            1,
            2,
            [(10, 810), (500, 810), (10, 400), (10, 26), (500, 26)],
        ),
    )

    _validate_parent_tree_key_range(3, [0, 1, 2], [0, 2])
    expect_rejected(
        "parent-tree-key-order",
        lambda: _validate_parent_tree_key_range(3, [1, 0, 2], [0, 2]),
    )
    expect_rejected(
        "parent-tree-limits",
        lambda: _validate_parent_tree_key_range(3, [0, 1, 2], [999, -1]),
    )

    _validate_text_rect_bounds(0, 595.28, 841.89, (48, 62, 547, 780))
    expect_rejected(
        "text-below-page-bounds",
        lambda: _validate_text_rect_bounds(0, 595.28, 841.89, (48, 820, 547, 865)),
    )

    with tempfile.TemporaryDirectory(prefix="jianyuan-pdf-audit-policy-") as directory:
        same_bytes_path = Path(directory) / "same-bytes.bin"
        same_bytes_path.write_bytes(b"audited bytes")
        audited_hash = sha256_file(same_bytes_path)
        _assert_same_file_hash(same_bytes_path, audited_hash, "calibration file")
        same_bytes_path.write_bytes(b"replaced bytes")
        expect_rejected(
            "receipt-same-bytes-toctou",
            lambda: _assert_same_file_hash(
                same_bytes_path,
                audited_hash,
                "calibration file",
            ),
        )

    assert rejected == [
        "marked-false",
        "visual-order-bottom-top-middle",
        "body-hidden-as-artifact",
        "parent-tree-key-order",
        "parent-tree-limits",
        "text-below-page-bounds",
        "receipt-same-bytes-toctou",
    ]
    return {"status": "passed", "rejectedCounterexamples": rejected}


def validate_manifest(manifest: dict) -> None:
    assert isinstance(manifest, dict), "manifest must be a JSON object"
    assert isinstance(manifest.get("outputDirectory"), str) and manifest["outputDirectory"].strip(), (
        "manifest.outputDirectory must be a non-empty string"
    )
    files = manifest.get("files")
    assert isinstance(files, dict) and files, "manifest.files must be a non-empty object"

    for file_key, spec in files.items():
        assert isinstance(spec, dict), f"manifest.files.{file_key} must be an object"
        assert "expectedSeedCounts" not in spec, (
            f"manifest.files.{file_key} uses obsolete expectedSeedCounts; "
            "use expectedTextMarkers"
        )
        missing_keys = sorted(REQUIRED_FILE_KEYS - set(spec))
        assert not missing_keys, f"manifest.files.{file_key} missing keys: {missing_keys}"
        assert spec["plan"] in {"C", "G15"}, (
            f"manifest.files.{file_key}.plan must be C or G15"
        )
        assert isinstance(spec["expectedBodyCjk"], int) and spec["expectedBodyCjk"] > 0, (
            f"manifest.files.{file_key}.expectedBodyCjk must be a positive integer"
        )
        markers = spec["expectedTextMarkers"]
        assert isinstance(markers, dict) and markers, (
            f"manifest.files.{file_key}.expectedTextMarkers must be a non-empty object"
        )
        assert all(isinstance(marker, str) and marker for marker in markers), (
            f"manifest.files.{file_key}.expectedTextMarkers keys must be non-empty strings"
        )
        assert all(isinstance(count, int) and count > 0 for count in markers.values()), (
            f"manifest.files.{file_key}.expectedTextMarkers counts must be positive integers"
        )
        tail_markers = spec["tailMarkers"]
        assert isinstance(tail_markers, list) and tail_markers, (
            f"manifest.files.{file_key}.tailMarkers must be a non-empty list"
        )
        assert all(isinstance(marker, str) and marker for marker in tail_markers), (
            f"manifest.files.{file_key}.tailMarkers values must be non-empty strings"
        )
        markers_missing_from_contract = sorted(set(tail_markers) - set(markers))
        assert not markers_missing_from_contract, (
            f"manifest.files.{file_key}.tailMarkers are absent from expectedTextMarkers: "
            f"{markers_missing_from_contract[:5]}"
        )


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def _text_operand_units(value) -> int:
    if isinstance(value, (bytes, bytearray, str)):
        return len(value)
    if isinstance(value, (list, tuple)):
        return sum(_text_operand_units(item) for item in value)
    return 0


def font_audit(reader: PdfReader) -> dict:
    fonts: dict[str, dict] = {}
    for page_index, page in enumerate(reader.pages):
        resources = dereference(page.get("/Resources", {}))
        page_fonts = dereference(resources.get("/Font", {})) if resources else {}
        for resource_name, font_ref in page_fonts.items():
            font = dereference(font_ref)
            base_font = str(font.get("/BaseFont", resource_name))
            font_program = font
            descendants = font.get("/DescendantFonts")
            if descendants:
                font_program = dereference(dereference(descendants)[0])
                base_font = str(font_program.get("/BaseFont", base_font))
            descriptor = dereference(font_program.get("/FontDescriptor", {}))
            font_streams = [
                dereference(descriptor.get(key))
                for key in ("/FontFile", "/FontFile2", "/FontFile3")
                if descriptor and descriptor.get(key) is not None
            ]
            embedded = bool(font_streams)
            embedded_bytes = sum(len(stream.get_data()) for stream in font_streams)
            has_to_unicode = font.get("/ToUnicode") is not None
            record = fonts.setdefault(
                base_font,
                {
                    "embedded": embedded,
                    "toUnicode": has_to_unicode,
                    "pages": [],
                    "subtype": str(font.get("/Subtype", "")),
                    "embeddedBytes": embedded_bytes,
                },
            )
            record["embedded"] = record["embedded"] and embedded
            record["toUnicode"] = record["toUnicode"] and has_to_unicode
            record["embeddedBytes"] = max(record["embeddedBytes"], embedded_bytes)
            record["pages"].append(page_index + 1)
    return fonts


def render_montage(pdf_bytes: bytes, output_directory: Path, artifact_key: str) -> dict:
    import fitz
    from PIL import Image, ImageDraw

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        thumbs: list[Image.Image] = []
        text_rectangles = 0
        for page_index in range(len(document)):
            page = document[page_index]
            for block in page.get_text("blocks"):
                if len(block) < 5 or not str(block[4]).strip():
                    continue
                _validate_text_rect_bounds(
                    page_index,
                    float(page.rect.width),
                    float(page.rect.height),
                    tuple(float(value) for value in block[:4]),
                )
                text_rectangles += 1
            pixmap = page.get_pixmap(matrix=fitz.Matrix(0.24, 0.24), alpha=False)
            image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
            thumbs.append(image)

        columns = min(8, max(1, len(thumbs)))
        cell_width = max(image.width for image in thumbs) + 14
        cell_height = max(image.height for image in thumbs) + 28
        rows = math.ceil(len(thumbs) / columns)
        montage = Image.new("RGB", (columns * cell_width, rows * cell_height), "#d8d2c7")
        draw = ImageDraw.Draw(montage)
        for index, image in enumerate(thumbs):
            column = index % columns
            row = index // columns
            x = column * cell_width + 7
            y = row * cell_height + 19
            montage.paste(image, (x, y))
            draw.text((x, 4 + row * cell_height), f"p.{index + 1}", fill="#292a28")

        montage_path = output_directory / f"{artifact_key.lower()}-all-pages-montage.png"
        montage.save(montage_path, optimize=True)

        sample_indices = {0, len(document) // 2, len(document) - 1}
        if "long_fields" in artifact_key.lower():
            sample_indices.update(range(min(6, len(document))))
        sample_indices = sorted(sample_indices)
        sample_paths = []
        for page_index in sample_indices:
            page = document[page_index]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.45, 1.45), alpha=False)
            sample_path = output_directory / f"{artifact_key.lower()}-page-{page_index + 1:03d}.png"
            pixmap.save(sample_path)
            sample_paths.append(str(sample_path))

        return {
            "montage": str(montage_path),
            "samples": sample_paths,
            "renderedPageCount": len(thumbs),
            "textRectangles": text_rectangles,
            "textBoundsVerified": True,
        }
    finally:
        document.close()


def _page_reference_key(reference) -> tuple[int, int] | None:
    if reference is None:
        return None
    if hasattr(reference, "idnum"):
        return (int(reference.idnum), int(reference.generation))
    indirect_reference = getattr(reference, "indirect_reference", None)
    if indirect_reference is not None:
        return (int(indirect_reference.idnum), int(indirect_reference.generation))
    return None


def _walk_structure(
    value,
    page_lookup: dict[tuple[int, int], int],
    tag_counts: dict[str, int],
    mcids_by_page: dict[int, list[int]],
    owners_by_page: dict[int, list[tuple[int, int]]],
    inherited_page=None,
    inherited_owner: tuple[int, int] | None = None,
) -> None:
    from pypdf.generic import ArrayObject, DictionaryObject

    if value is None:
        return
    if isinstance(value, ArrayObject) or isinstance(value, list):
        for child in value:
            _walk_structure(
                child,
                page_lookup,
                tag_counts,
                mcids_by_page,
                owners_by_page,
                inherited_page,
                inherited_owner,
            )
        return

    reference_key = _page_reference_key(value) or inherited_owner
    node = dereference(value)
    if isinstance(node, int):
        page_key = _page_reference_key(inherited_page)
        assert page_key in page_lookup, "structure MCID has no resolvable page"
        assert reference_key is not None, "structure MCID has no owning structure element"
        mcids_by_page[page_lookup[page_key]].append(int(node))
        owners_by_page[page_lookup[page_key]].append(reference_key)
        return
    if not isinstance(node, DictionaryObject) and not isinstance(node, dict):
        return

    node_page = node.get("/Pg", inherited_page)
    if node.get("/MCID") is not None:
        page_key = _page_reference_key(node.get("/Pg", node_page))
        assert page_key in page_lookup, "marked-content reference has no resolvable page"
        assert inherited_owner is not None, "marked-content reference has no owning structure element"
        mcids_by_page[page_lookup[page_key]].append(int(node["/MCID"]))
        owners_by_page[page_lookup[page_key]].append(inherited_owner)
        return

    tag = str(node.get("/S", "")).removeprefix("/")
    if tag:
        tag_counts[tag] = tag_counts.get(tag, 0) + 1
    _walk_structure(
        node.get("/K"),
        page_lookup,
        tag_counts,
        mcids_by_page,
        owners_by_page,
        node_page,
        reference_key,
    )


def accessibility_audit(reader) -> dict:
    from pypdf.generic import ContentStream

    root = dereference(reader.trailer["/Root"])
    mark_info = dereference(root.get("/MarkInfo", {}))
    marked_value = mark_info.get("/Marked") if mark_info else None
    assert mark_info, "PDF catalog is missing MarkInfo"
    _assert_catalog_marked_true(marked_value)
    structure_root = dereference(root.get("/StructTreeRoot"))
    assert structure_root, "PDF catalog is missing StructTreeRoot"
    assert str(structure_root.get("/Type", "")) == "/StructTreeRoot", (
        "StructTreeRoot has the wrong type"
    )
    parent_tree = dereference(structure_root.get("/ParentTree"))
    assert parent_tree is not None, (
        "StructTreeRoot is missing ParentTree"
    )
    assert "/_items" not in parent_tree and "/limits" not in parent_tree, (
        "ParentTree was serialized as implementation fields instead of a PDF number tree"
    )
    parent_tree_nums = dereference(parent_tree.get("/Nums"))
    assert isinstance(parent_tree_nums, list) and len(parent_tree_nums) > 0, (
        "ParentTree must expose a non-empty /Nums array"
    )
    assert len(parent_tree_nums) % 2 == 0, "ParentTree /Nums must contain key/value pairs"
    parent_tree_keys = [
        int(parent_tree_nums[index])
        for index in range(0, len(parent_tree_nums), 2)
    ]
    parent_tree_limits = dereference(parent_tree.get("/Limits"))
    _validate_parent_tree_key_range(
        len(reader.pages),
        parent_tree_keys,
        parent_tree_limits,
    )
    parent_tree_entries = {
        int(parent_tree_nums[index]): dereference(parent_tree_nums[index + 1])
        for index in range(0, len(parent_tree_nums), 2)
    }
    language = str(root.get("/Lang", ""))
    assert language == "zh-TW", "PDF catalog language must be zh-TW"

    page_lookup: dict[tuple[int, int], int] = {}
    for page_index, page in enumerate(reader.pages):
        page_key = _page_reference_key(page.indirect_reference)
        assert page_key is not None
        page_lookup[page_key] = page_index

    tag_counts: dict[str, int] = {}
    tree_mcids_by_page = {index: [] for index in range(len(reader.pages))}
    tree_owners_by_page = {index: [] for index in range(len(reader.pages))}
    structure_children = dereference(structure_root.get("/K"))
    assert structure_children is not None, "StructTreeRoot has no children"
    root_children = structure_children if isinstance(structure_children, list) else [structure_children]
    root_tags = [
        str(dereference(child).get("/S", "")).removeprefix("/")
        for child in root_children
        if hasattr(dereference(child), "get")
    ]
    assert root_tags == ["Document"], (
        f"logical structure must have exactly one Document root, found {root_tags}"
    )
    _walk_structure(
        structure_children,
        page_lookup,
        tag_counts,
        tree_mcids_by_page,
        tree_owners_by_page,
    )

    stream_mcids_by_page: dict[int, list[int]] = {}
    text_objects = 0
    marked_text_objects = 0
    semantic_text_objects = 0
    artifact_text_objects = 0
    artifact_sequences = 0
    artifact_text_units = 0
    maximum_artifact_text_units = 0
    semantic_positions_by_page: dict[int, list[tuple[float, float]]] = {}
    artifact_positions_by_page: dict[int, list[tuple[float, float]]] = {}
    for page_index, page in enumerate(reader.pages):
        struct_parent_key = page.get("/StructParents")
        assert struct_parent_key is not None, (
            f"page {page_index + 1} is missing StructParents"
        )
        struct_parent_key = int(struct_parent_key)
        assert struct_parent_key in parent_tree_entries, (
            f"page {page_index + 1} StructParents key is absent from ParentTree"
        )
        assert str(page.get("/Tabs", "")) == "/S", (
            f"page {page_index + 1} tab order must follow the structure tree"
        )
        content = ContentStream(page.get_contents(), reader)
        marked_stack: list[tuple[str, int | None]] = []
        stream_mcids: list[int] = []
        mcids_with_text: set[int] = set()
        semantic_positions: list[tuple[float, float]] = []
        artifact_positions: list[tuple[float, float]] = []
        active_text: dict[str, object] | None = None
        for operands, operator in content.operations:
            if operator == b"BMC":
                tag = str(operands[0]).removeprefix("/") if operands else ""
                marked_stack.append((tag, None))
                if tag == "Artifact":
                    artifact_sequences += 1
            elif operator == b"BDC":
                tag = str(operands[0]).removeprefix("/") if operands else ""
                properties = dereference(operands[1]) if len(operands) > 1 else {}
                mcid = (
                    int(properties["/MCID"])
                    if properties and properties.get("/MCID") is not None
                    else None
                )
                marked_stack.append((tag, mcid))
                if tag == "Artifact":
                    artifact_sequences += 1
                if mcid is not None:
                    stream_mcids.append(mcid)
            elif operator == b"EMC":
                assert marked_stack, f"page {page_index + 1} has an unmatched EMC"
                marked_stack.pop()
            elif operator == b"BT":
                assert active_text is None, (
                    f"page {page_index + 1} contains nested text objects"
                )
                text_objects += 1
                assert marked_stack, (
                    f"page {page_index + 1} contains unmarked text content"
                )
                marked_text_objects += 1
                semantic_mcid = next(
                    (mcid for _tag, mcid in reversed(marked_stack) if mcid is not None),
                    None,
                )
                if semantic_mcid is not None:
                    semantic_text_objects += 1
                    mcids_with_text.add(semantic_mcid)
                    active_text = {
                        "kind": "semantic",
                        "position": None,
                        "position_operators": 0,
                        "show_operators": 0,
                        "text_units": 0,
                        "font_sizes": [],
                        "complex_show": False,
                    }
                else:
                    assert any(tag == "Artifact" for tag, _mcid in marked_stack), (
                        f"page {page_index + 1} text is marked but has no semantic MCID "
                        "and is not an Artifact"
                    )
                    artifact_text_objects += 1
                    active_text = {
                        "kind": "artifact",
                        "position": None,
                        "position_operators": 0,
                        "show_operators": 0,
                        "text_units": 0,
                        "font_sizes": [],
                        "complex_show": False,
                    }
            elif operator in (b"Tm", b"Td", b"TD") and active_text is not None:
                active_text["position_operators"] += 1
                if active_text["position"] is None:
                    if operator == b"Tm":
                        active_text["position"] = (float(operands[4]), float(operands[5]))
                    else:
                        active_text["position"] = (float(operands[0]), float(operands[1]))
            elif operator == b"Tf" and active_text is not None:
                active_text["font_sizes"].append(float(operands[1]))
            elif operator in (b"Tj", b"TJ", b"'", b'"') and active_text is not None:
                active_text["show_operators"] += 1
                active_text["text_units"] += _text_operand_units(operands)
                if operator not in (b"Tj", b"TJ"):
                    active_text["complex_show"] = True
            elif operator == b"ET":
                assert active_text is not None, (
                    f"page {page_index + 1} has ET without a matching BT"
                )
                position = active_text["position"]
                assert isinstance(position, tuple) and len(position) == 2, (
                    f"page {page_index + 1} text object has no auditable Tm/Td position"
                )
                if active_text["kind"] == "semantic":
                    semantic_positions.append(position)
                else:
                    assert active_text["position_operators"] == 1, (
                        f"page {page_index + 1} Artifact text must use one fixed Tm/Td position"
                    )
                    assert active_text["show_operators"] == 1, (
                        f"page {page_index + 1} Artifact text must use one bounded text-show operator"
                    )
                    assert not active_text["complex_show"], (
                        f"page {page_index + 1} Artifact text may not move the text line while showing"
                    )
                    assert active_text["font_sizes"] and max(active_text["font_sizes"]) <= 7.2, (
                        f"page {page_index + 1} Artifact text exceeds the chrome font-size whitelist"
                    )
                    assert 0 < active_text["text_units"] <= 80, (
                        f"page {page_index + 1} Artifact text exceeds the chrome text-volume whitelist"
                    )
                    artifact_text_units += active_text["text_units"]
                    maximum_artifact_text_units = max(
                        maximum_artifact_text_units,
                        active_text["text_units"],
                    )
                    artifact_positions.append(position)
                active_text = None
        assert active_text is None, f"page {page_index + 1} has an unclosed text object"
        assert not marked_stack, f"page {page_index + 1} has unclosed marked content"
        assert stream_mcids, f"page {page_index + 1} has no semantic marked content"
        assert stream_mcids == list(range(len(stream_mcids))), (
            f"page {page_index + 1} MCIDs are not emitted in reading order: "
            f"{stream_mcids[:12]}"
        )
        assert mcids_with_text == set(stream_mcids), (
            f"page {page_index + 1} contains empty semantic MCIDs or semantic text "
            "outside the structure sequence"
        )
        _validate_visual_text_order(page_index, semantic_positions)
        _validate_artifact_text_policy(
            page_index,
            len(reader.pages),
            artifact_positions,
        )
        semantic_positions_by_page[page_index] = semantic_positions
        artifact_positions_by_page[page_index] = artifact_positions
        stream_mcids_by_page[page_index] = stream_mcids

    assert text_objects > 0, "PDF contains no text objects"
    assert marked_text_objects == text_objects, "not all PDF text is marked"
    expected_artifact_text_objects = 2 + (max(0, len(reader.pages) - 1) * 4)
    assert artifact_text_objects == expected_artifact_text_objects, (
        "Artifact text must be limited to the fixed cover/header/footer chrome"
    )
    for page_index, stream_mcids in stream_mcids_by_page.items():
        assert tree_mcids_by_page[page_index] == stream_mcids, (
            f"page {page_index + 1} structure-tree reading order does not match "
            f"content-stream order"
        )
        page_struct_parent = int(reader.pages[page_index]["/StructParents"])
        parent_owners = parent_tree_entries[page_struct_parent]
        assert isinstance(parent_owners, list), (
            f"page {page_index + 1} ParentTree entry must be an array"
        )
        parent_owner_keys = [_page_reference_key(owner) for owner in parent_owners]
        assert all(owner is not None for owner in parent_owner_keys), (
            f"page {page_index + 1} ParentTree contains a non-reference owner"
        )
        assert parent_owner_keys == tree_owners_by_page[page_index], (
            f"page {page_index + 1} ParentTree owners do not map MCIDs to the "
            "structure elements that contain them"
        )
    assert len(parent_tree_entries) == len(reader.pages), (
        "ParentTree must contain exactly one entry per page"
    )
    assert int(structure_root.get("/ParentTreeNextKey", -1)) == len(reader.pages), (
        "ParentTreeNextKey must match the number of structured pages"
    )
    assert tag_counts.get("Document") == 1
    assert tag_counts.get("H1", 0) >= 1
    assert tag_counts.get("H2", 0) >= 1
    assert tag_counts.get("P", 0) >= 1

    return {
        "marked": True,
        "language": language,
        "structureTags": tag_counts,
        "pagesWithStructureOrder": len(stream_mcids_by_page),
        "markedContentItems": sum(len(values) for values in stream_mcids_by_page.values()),
        "textObjects": text_objects,
        "semanticTextObjects": semantic_text_objects,
        "artifactTextObjects": artifact_text_objects,
        "expectedArtifactTextObjects": expected_artifact_text_objects,
        "artifactTextUnits": artifact_text_units,
        "maximumArtifactTextUnits": maximum_artifact_text_units,
        "artifactSequences": artifact_sequences,
        "readingOrderVerified": True,
        "visualOrderVerified": True,
        "artifactPolicyVerified": True,
        "parentTreeVerified": True,
        "allTextMarked": True,
    }


def audit_one(spec: dict, output_directory: Path) -> dict:
    from pypdf import PdfReader

    pdf_path = Path(spec["path"]).resolve()
    pdf_bytes = pdf_path.read_bytes()
    pdf_sha256 = sha256_bytes(pdf_bytes)
    reader = PdfReader(BytesIO(pdf_bytes))
    assert not reader.is_encrypted, f"{spec['plan']}: PDF must not be encrypted for customer access"
    page_count = len(reader.pages)
    assert page_count >= (20 if spec["plan"] == "G15" else 12), (
        f"{spec['plan']}: page count too low for long-form content: {page_count}"
    )
    assert page_count <= (180 if spec["plan"] == "G15" else 100), (
        f"{spec['plan']}: abnormal pagination: {page_count}"
    )
    assert len(pdf_bytes) < 20_000_000, (
        f"{spec['plan']}: PDF is too large for delivery; CJK font may not be subset: "
        f"{len(pdf_bytes)} bytes"
    )

    page_texts = [(page.extract_text() or "") for page in reader.pages]
    assert all(len(text.strip()) >= 15 for text in page_texts), f"{spec['plan']}: blank or near-blank page found"
    orphaned_evidence_headings = [
        page_index + 1
        for page_index, text in enumerate(page_texts)
        if "參考來源與使用邊界" in re.sub(r"\s+", "", text)
        and "證據狀態：" not in re.sub(r"\s+", "", text)
    ]
    assert not orphaned_evidence_headings, (
        f"{spec['plan']}: evidence heading orphaned from its first evidence card on pages "
        f"{orphaned_evidence_headings}"
    )
    extracted = "\n".join(page_texts)
    body_page_texts = [
        "\n".join(
            line
            for line in text.splitlines()
            if "LIVING DOSSIER" not in line
            and not line.startswith("報告編號 ")
            and "PRIVATE COPY" not in line
        )
        for text in page_texts
    ]
    body_extracted = "\n".join(body_page_texts)
    compact = re.sub(r"\s+", "", extracted)
    body_compact = re.sub(r"\s+", "", body_extracted)
    cjk_count = len(CJK_PATTERN.findall(body_extracted))
    assert cjk_count >= spec["expectedBodyCjk"], (
        f"{spec['plan']}: extracted CJK {cjk_count} < expected body {spec['expectedBodyCjk']}"
    )

    missing_text_markers = []
    for marker, expected_count in spec["expectedTextMarkers"].items():
        # PDF text extractors may insert whitespace at a visual line or page
        # break. Compare the same whitespace-normalized representation used by
        # the paragraph-tail completeness check so intact markers do not fail
        # merely because the renderer wrapped between two CJK glyphs.
        normalized_marker = re.sub(r"\s+", "", marker)
        actual_count = body_compact.count(normalized_marker)
        if actual_count < expected_count:
            missing_text_markers.append({
                "marker": marker,
                "expected": expected_count,
                "actual": actual_count,
            })
    assert not missing_text_markers, (
        f"{spec['plan']}: text marker count shortfall: {missing_text_markers[:5]}"
    )

    missing_tail_markers = [marker for marker in spec["tailMarkers"] if marker not in body_compact]
    assert not missing_tail_markers, (
        f"{spec['plan']}: {len(missing_tail_markers)} paragraph tail markers missing"
    )
    assert not FORBIDDEN_PATTERN.search(extracted), f"{spec['plan']}: forbidden markup or emoji in rendered text"
    assert "參考與限制" in compact, f"{spec['plan']}: final appendix heading missing"
    assert "基準日與人物範圍" in compact, f"{spec['plan']}: final person scope missing"
    assert "report:" not in extracted.lower(), f"{spec['plan']}: raw internal report id leaked"
    assert spec["reportNumber"] in compact, f"{spec['plan']}: client report number missing"

    metadata = reader.metadata or {}
    assert spec["planTitle"] in str(metadata.get("/Title", "")), f"{spec['plan']}: title metadata mismatch"
    assert str(metadata.get("/Author", "")) == "鑑源 JianYuan", f"{spec['plan']}: author metadata mismatch"
    assert str(metadata.get("/Creator", "")) == "JianYuan Consultation PDF", (
        f"{spec['plan']}: creator metadata mismatch"
    )
    assert spec["asOfDate"] in str(metadata.get("/Subject", "")), f"{spec['plan']}: as-of metadata missing"

    root = dereference(reader.trailer["/Root"])
    assert str(root.get("/Lang", "")) == "zh-TW", f"{spec['plan']}: document language must be zh-TW"
    accessibility = accessibility_audit(reader)

    fonts = font_audit(reader)
    assert fonts, f"{spec['plan']}: no PDF font resources found"
    assert all(record["embedded"] for record in fonts.values()), f"{spec['plan']}: unembedded font found: {fonts}"
    assert all(record["toUnicode"] for record in fonts.values()), f"{spec['plan']}: ToUnicode map missing: {fonts}"
    assert all(record["embeddedBytes"] < 12_000_000 for record in fonts.values()), (
        f"{spec['plan']}: embedded font is not a bounded subset: {fonts}"
    )

    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        assert abs(width - 595.28) < 1.0 and abs(height - 841.89) < 1.0, (
            f"{spec['plan']}: page is not A4 ({width} x {height})"
        )

    render = render_montage(pdf_bytes, output_directory, pdf_path.stem)
    assert render["renderedPageCount"] == page_count
    _assert_same_file_hash(pdf_path, pdf_sha256, f"{spec['plan']} PDF")
    return {
        "plan": spec["plan"],
        "path": str(pdf_path),
        "sha256": pdf_sha256,
        "bytes": len(pdf_bytes),
        "pages": page_count,
        "extractedCjk": cjk_count,
        "expectedBodyCjk": spec["expectedBodyCjk"],
        "tailMarkers": len(spec["tailMarkers"]),
        "fonts": fonts,
        "metadata": {key: str(value) for key, value in metadata.items()},
        "accessibility": accessibility,
        "render": render,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path, nargs="?")
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate the manifest contract without opening or rendering PDFs.",
    )
    parser.add_argument(
        "--accessibility-only",
        type=Path,
        help="Directly audit one PDF's tagged structure and reading order.",
    )
    parser.add_argument(
        "--policy-self-test",
        action="store_true",
        help="Run dependency-free negative calibrations for accessibility policies.",
    )
    args = parser.parse_args()
    if args.policy_self_test:
        print(json.dumps(_run_policy_self_test(), ensure_ascii=False))
        return 0
    if args.accessibility_only is not None:
        from pypdf import PdfReader

        pdf_path = args.accessibility_only.resolve()
        pdf_bytes = pdf_path.read_bytes()
        pdf_sha256 = sha256_bytes(pdf_bytes)
        auditor_path = Path(__file__).resolve()
        auditor_sha256 = sha256_file(auditor_path)
        accessibility = accessibility_audit(PdfReader(BytesIO(pdf_bytes)))
        _assert_same_file_hash(pdf_path, pdf_sha256, "accessibility PDF")
        _assert_same_file_hash(auditor_path, auditor_sha256, "accessibility auditor")
        print(json.dumps({
            "status": "passed",
            "schemaVersion": AUDIT_SCHEMA_VERSION,
            "path": str(pdf_path),
            "sha256": pdf_sha256,
            "auditor": {
                "path": str(auditor_path),
                "sha256": auditor_sha256,
            },
            "accessibility": accessibility,
        }, ensure_ascii=False))
        return 0
    assert args.manifest is not None, "manifest path is required"
    manifest_path = args.manifest.resolve()
    manifest_bytes = manifest_path.read_bytes()
    manifest_sha256 = sha256_bytes(manifest_bytes)
    manifest = json.loads(manifest_bytes.decode("utf-8"))
    validate_manifest(manifest)
    if args.validate_only:
        _assert_same_file_hash(manifest_path, manifest_sha256, "manifest")
        print(json.dumps({"status": "valid", "manifest": str(manifest_path)}, ensure_ascii=False))
        return 0
    output_directory = Path(manifest["outputDirectory"]).resolve()
    auditor_path = Path(__file__).resolve()
    auditor_sha256 = sha256_file(auditor_path)
    results = [audit_one(spec, output_directory) for spec in manifest["files"].values()]
    _assert_same_file_hash(manifest_path, manifest_sha256, "manifest")
    _assert_same_file_hash(auditor_path, auditor_sha256, "auditor")
    for result in results:
        _assert_same_file_hash(Path(result["path"]), result["sha256"], f"{result['plan']} PDF")
    audit_path = output_directory / "pdf-audit.json"
    receipt = {
        "status": "passed",
        "schemaVersion": AUDIT_SCHEMA_VERSION,
        "manifest": {
            "path": str(manifest_path),
            "sha256": manifest_sha256,
        },
        "auditor": {
            "path": str(auditor_path),
            "sha256": auditor_sha256,
        },
        "results": results,
    }
    audit_path.write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({**receipt, "audit": str(audit_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
