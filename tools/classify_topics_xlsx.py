#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET


NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


CATEGORIES = [
    ("希望・前向き", "#7DFF80"),
    ("不安・心配", "#5BC0FF"),
    ("怒り・不満", "#FF5C5C"),
    ("悲しみ・孤独", "#7C6CFF"),
    ("提案・改善案", "#FFA24D"),
    ("願い・要望", "#FFE066"),
    ("疑問・問いかけ", "#7DFFF0"),
    ("その他", "#F4F4F4"),
]


KEYWORDS = {
    "希望・前向き": [
        r"楽しい", r"嬉しい", r"うれしい", r"良い", r"いいと思", r"わくわく", r"期待", r"安心",
    ],
    "不安・心配": [
        r"不安", r"心配", r"怖", r"こわ", r"困", r"間に合", r"大丈夫", r"不便", r"危な",
    ],
    "怒り・不満": [
        r"嫌", r"いや", r"おかしい", r"ひど", r"最悪", r"むかつ", r"不満", r"納得", r"少な",
        r"全く", r"分からない", r"わからない", r"意味をなしてない", r"レベルの低い", r"乗れない",
    ],
    "悲しみ・孤独": [
        r"悲しい", r"寂しい", r"孤独", r"辛", r"つら", r"苦しい", r"しんど", r"きつ", r"評価してくれません",
    ],
    "提案・改善案": [
        r"べき", r"した方が良", r"改善", r"導入", r"設置", r"必要", r"制度", r"ルール", r"目的をはっきり",
        r"明確", r"対応できるよう", r"カリキュラム", r"厳しくして", r"厳しくした方",
    ],
    "願い・要望": [
        r"してほしい", r"して欲しい", r"ほしい", r"欲しい", r"増やして", r"増便", r"開けてほしい",
        r"あけてほしい", r"できるように", r"したい", r"欲しか", r"必要です",
    ],
    "疑問・問いかけ": [
        r"\?", r"？", r"なぜ", r"なんで", r"どうして", r"でしょうか",
    ],
}


BOOSTS = {
    "願い・要望": [
        (r"ほしい|欲しい", 3.0),
        (r"してほしい|して欲しい", 4.0),
    ],
    "提案・改善案": [
        (r"べき", 3.5),
        (r"した方が良", 3.0),
    ],
    "怒り・不満": [
        (r"おかしい|ひど|嫌|最悪|不満", 3.5),
    ],
    "疑問・問いかけ": [
        (r"？|\?|なぜ|なんで|どうして", 3.5),
    ],
}


@dataclass
class ClassifiedRow:
    index: int
    text: str
    category: str
    color: str
    scores: dict[str, float]


def load_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for si in root.findall("a:si", NS):
        strings.append("".join((t.text or "") for t in si.iterfind(".//a:t", NS)))
    return strings


def read_first_sheet_column_a(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as zf:
        sst = load_shared_strings(zf)
        sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        texts: list[str] = []
        for row in sheet.findall(".//a:sheetData/a:row", NS):
            ref = f"A{row.attrib['r']}"
            cell = row.find(f"a:c[@r='{ref}']", NS)
            if cell is None:
                texts.append("")
                continue
            v = cell.find("a:v", NS)
            if v is None:
                texts.append("")
                continue
            value = v.text or ""
            if cell.attrib.get("t") == "s":
                value = sst[int(value)]
            texts.append(value)
        return texts


def score_text(text: str) -> dict[str, float]:
    normalized = text.strip()
    scores = {name: 0.0 for name, _ in CATEGORIES}
    if not normalized:
        scores["その他"] = 1.0
        return scores

    for category, patterns in KEYWORDS.items():
        for pattern in patterns:
            if re.search(pattern, normalized, re.IGNORECASE):
                scores[category] += 1.0

    for category, boosts in BOOSTS.items():
        for pattern, value in boosts:
            if re.search(pattern, normalized, re.IGNORECASE):
                scores[category] += value

    if re.search(r"ほしい|欲しい", normalized, re.IGNORECASE):
        scores["願い・要望"] += 1.5
    if re.search(r"べき|した方が", normalized, re.IGNORECASE):
        scores["提案・改善案"] += 1.5
    if re.search(r"少ない|ない|不足", normalized, re.IGNORECASE):
        scores["怒り・不満"] += 1.0
    if re.search(r"してほしい|欲しい", normalized, re.IGNORECASE) and scores["提案・改善案"] > 0:
        scores["願い・要望"] += 0.5

    if all(value <= 0 for value in scores.values()):
        scores["その他"] = 1.0

    return scores


def classify_text(text: str) -> tuple[str, dict[str, float]]:
    scores = score_text(text)
    priority = {name: idx for idx, (name, _) in enumerate(CATEGORIES)}
    category = max(scores.items(), key=lambda item: (item[1], -priority[item[0]]))[0]
    return category, scores


def color_for_category(category: str) -> str:
    for name, color in CATEGORIES:
        if name == category:
            return color
    return "#F4F4F4"


def weighted_round_robin_sequence(counts: Counter[str]) -> list[str]:
    remaining = {k: float(v) for k, v in counts.items() if v > 0}
    emitted = {k: 0 for k in remaining}
    total = int(sum(counts.values()))
    if total <= 0:
        return []

    sequence: list[str] = []
    for step in range(1, total + 1):
        best_key = None
        best_score = -10**9
        for key, value in remaining.items():
            if emitted[key] >= value:
                continue
            ideal = step * (value / total)
            score = ideal - emitted[key]
            if score > best_score:
                best_score = score
                best_key = key
        if best_key is None:
            break
        emitted[best_key] += 1
        sequence.append(best_key)
    return sequence


def dump_csv(rows: Iterable[ClassifiedRow], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["index", "text", "category", "color"])
        for row in rows:
            writer.writerow([row.index, row.text, row.category, row.color])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--json-out", type=Path, required=True)
    parser.add_argument("--csv-out", type=Path, required=True)
    args = parser.parse_args()

    raw_rows = read_first_sheet_column_a(args.xlsx)
    comments = [text.strip() for text in raw_rows[1:] if text and text.strip()]

    classified: list[ClassifiedRow] = []
    counts: Counter[str] = Counter()
    for idx, text in enumerate(comments, start=1):
        category, scores = classify_text(text)
        color = color_for_category(category)
        classified.append(ClassifiedRow(index=idx, text=text, category=category, color=color, scores=scores))
        counts[category] += 1

    total = len(classified)
    ratios = {
        category: {
            "count": counts.get(category, 0),
            "ratio": (counts.get(category, 0) / total) if total else 0,
            "color": color_for_category(category),
        }
        for category, _ in CATEGORIES
    }

    active_counts = Counter({k: v for k, v in counts.items() if k != "その他" and v > 0})
    active_total = int(sum(active_counts.values()))
    active_ratios = {
        category: {
            "count": active_counts.get(category, 0),
            "ratio": (active_counts.get(category, 0) / active_total) if active_total else 0,
            "color": color_for_category(category),
        }
        for category, _ in CATEGORIES
        if category != "その他"
    }

    burst_sequence = weighted_round_robin_sequence(counts)
    burst_colors = [color_for_category(category) for category in burst_sequence]
    active_burst_sequence = weighted_round_robin_sequence(active_counts)
    active_burst_colors = [color_for_category(category) for category in active_burst_sequence]

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.csv_out.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "source_file": str(args.xlsx),
        "total_comments": total,
        "categories": ratios,
        "active_total_comments": active_total,
        "active_categories": active_ratios,
        "burst_sequence": burst_sequence,
        "burst_colors": burst_colors,
        "active_burst_sequence": active_burst_sequence,
        "active_burst_colors": active_burst_colors,
        "rows": [
            {
                "index": row.index,
                "text": row.text,
                "category": row.category,
                "color": row.color,
            }
            for row in classified
        ],
    }

    args.json_out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    dump_csv(classified, args.csv_out)

    print(json.dumps({
        "total_comments": total,
        "active_total_comments": active_total,
        "counts": {category: counts.get(category, 0) for category, _ in CATEGORIES},
        "active_counts": {category: active_counts.get(category, 0) for category, _ in CATEGORIES if category != "その他"},
        "json_out": str(args.json_out),
        "csv_out": str(args.csv_out),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
