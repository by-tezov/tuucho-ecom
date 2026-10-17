#!/usr/bin/env python3
"""Generate fictional sample catalog + rebrand copied Pam files. Never writes under Pam."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path("/home/tezov/Local/e-com_white-brand")
PAM_MGR = Path("/home/tezov/Local/Pam/pamsurin-manager")
SAMPLE = ROOT / "sample"


def sh(cmd: list[str]) -> None:
    subprocess.check_call(cmd)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def write_webp(path: Path, color: str, label: str, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sh(
        [
            "convert",
            "-size",
            f"{size}x{size}",
            f"xc:{color}",
            "-gravity",
            "center",
            "-pointsize",
            str(max(18, size // 14)),
            "-fill",
            "#ffffff",
            "-annotate",
            "0",
            label,
            str(path),
        ]
    )


def copy_seed_sources() -> None:
    SAMPLE.mkdir(parents=True, exist_ok=True)
    product = SAMPLE / "product"
    product.mkdir(exist_ok=True)
    shutil.copy2(PAM_MGR / "product" / "data-common.json", product / "data-common.json")
    courier_dst = SAMPLE / "courier"
    if courier_dst.exists():
        shutil.rmtree(courier_dst)
    courier_dst.mkdir()
    for name in (
        "data-countries.json",
        "data-networks.json",
        "data-packet.json",
        "mondial-relay-point.json",
        "mondial-relay-home.json",
        "colissimo-home.json",
        "chronopost-home.json",
    ):
        shutil.copy2(PAM_MGR / "courier" / name, courier_dst / name)


PRODUCTS = [
    {
        "folder": "0001",
        "uid": "LX-MR-234",
        "price": 42,
        "featured": True,
        "color": "#1a1a1a",
        "shape": "almond",
        "lengths": ["medium", "long"],
        "sizes": {"XS": 2, "S": 4, "M": 6, "L": 3},
        "title": {
            "fr": "Vase Aurora",
            "en": "Aurora Vessel",
            "th": "ภาชนะออโรรา",
            "es": "Vasija Aurora",
            "it": "Vaso Aurora",
            "nl": "Aurora vaas",
            "pt": "Vaso Aurora",
        },
        "desc": {
            "fr": "Piece artisanale $shape.attributive, glaçure celadon et liseré sable.",
            "en": "Hand-thrown $shape.title piece with celadon glaze and a sand rim.",
            "th": "งานมือ$shape.attributiveเคลือบสีเขียวอ่อนขอบทราย",
            "es": "Pieza artesanal $shape.attributive, esmalte celadon y borde arena.",
            "it": "Pezzo artigianale $shape.attributive, smalto celadon e bordo sabbia.",
            "nl": "Handgemaakt $shape.attributive stuk met celadon glazuur en zandrand.",
            "pt": "Peça artesanal $shape.attributive, vidrado celadon e bordo areia.",
        },
        "occasion": {
            "fr": "maison",
            "en": "home",
            "th": "บ้าน",
            "es": "hogar",
            "it": "casa",
            "nl": "thuis",
            "pt": "casa",
        },
        "colors": (["$green", "$white"], ["$gold"]),
    },
    {
        "folder": "0002",
        "uid": "CE-DR-582",
        "price": 36,
        "featured": True,
        "color": "#c46a3a",
        "shape": "oval",
        "lengths": ["medium"],
        "sizes": {"S": 3, "M": 5, "L": 2},
        "title": {
            "fr": "Etole Cedar",
            "en": "Cedar Wrap",
            "th": "ผ้าคลุมซีดาร์",
            "es": "Pañuelo Cedar",
            "it": "Stola Cedar",
            "nl": "Cedar omslagdoek",
            "pt": "Xale Cedar",
        },
        "desc": {
            "fr": "Tissage $shape.attributive en laine merinos, teinte terre cuite.",
            "en": "$Shape.title merino weave in terracotta.",
            "th": "ทอ$shape.attributiveจากขนแกะเมอริโนโทนดินเผา",
            "es": "Tejido $shape.attributive de merino, tono terracota.",
            "it": "Tessuto $shape.attributive in merino, tono terracotta.",
            "nl": "$Shape.attributive merinoweefsel in terracotta.",
            "pt": "Tecido $shape.attributive em merino, tom terracota.",
        },
        "occasion": {
            "fr": "hiver",
            "en": "winter",
            "th": "ฤดูหนาว",
            "es": "invierno",
            "it": "inverno",
            "nl": "winter",
            "pt": "inverno",
        },
        "colors": (["$orange", "$brown"], ["$gold"]),
    },
    {
        "folder": "0003",
        "uid": "LU-MN-763",
        "price": 28,
        "featured": True,
        "color": "#2b4c7e",
        "shape": "square",
        "lengths": ["short"],
        "sizes": {"XS": 4, "S": 4, "M": 4, "L": 4},
        "title": {
            "fr": "Pendentif Lumen",
            "en": "Lumen Pendant",
            "th": "จี้ลูเมน",
            "es": "Colgante Lumen",
            "it": "Ciondolo Lumen",
            "nl": "Lumen hanger",
            "pt": "Pendente Lumen",
        },
        "desc": {
            "fr": "Forme $shape.attributive en laiton brosse, cordon lin.",
            "en": "$Shape.title brushed-brass piece on a linen cord.",
            "th": "รูป$shape.attributiveทองเหลืองด้านสายลินิน",
            "es": "Forma $shape.attributive en laton cepillado, cordon de lino.",
            "it": "Forma $shape.attributive in ottone spazzolato, cordino di lino.",
            "nl": "$Shape.attributive stuk in geborsteld messing, linnen koord.",
            "pt": "Forma $shape.attributive em latao escovado, cordao de linho.",
        },
        "occasion": {
            "fr": "cadeau",
            "en": "gift",
            "th": "ของขวัญ",
            "es": "regalo",
            "it": "regalo",
            "nl": "cadeau",
            "pt": "presente",
        },
        "colors": (["$blue", "$gold"], ["$white"]),
    },
    {
        "folder": "0004",
        "uid": "SO-ST-845",
        "price": 54,
        "featured": True,
        "color": "#8a6b2f",
        "shape": "almond",
        "lengths": ["medium"],
        "sizes": {"M": 2, "L": 2},
        "title": {
            "fr": "Bol Solstice",
            "en": "Solstice Bowl",
            "th": "ชามซอลสทิส",
            "es": "Cuenco Solstice",
            "it": "Ciotola Solstice",
            "nl": "Solstice kom",
            "pt": "Tigela Solstice",
        },
        "desc": {
            "fr": "Bol $shape.attributive, engobe miel et pied nu.",
            "en": "$Shape.title bowl with honey slip and a bare foot.",
            "th": "ชาม$shape.attributiveเคลือบน้ำผึ้งฐานดิบ",
            "es": "Cuenco $shape.attributive, engobe miel y pie crudo.",
            "it": "Ciotola $shape.attributive, ingobbio miele e piede nudo.",
            "nl": "$Shape.attributive kom met honingengobe en kale voet.",
            "pt": "Tigela $shape.attributive, engobe mel e pe nu.",
        },
        "occasion": {
            "fr": "table",
            "en": "table",
            "th": "โต๊ะ",
            "es": "mesa",
            "it": "tavola",
            "nl": "tafel",
            "pt": "mesa",
        },
        "colors": (["$gold", "$brown"], ["$white"]),
    },
    {
        "folder": "0005",
        "uid": "HA-TR-426",
        "price": 31,
        "featured": False,
        "color": "#5c7a6e",
        "shape": "oval",
        "lengths": ["short"],
        "sizes": {"S": 8},
        "title": {
            "fr": "Plateau Harbor",
            "en": "Harbor Tray",
            "th": "ถาดฮาร์เบอร์",
            "es": "Bandeja Harbor",
            "it": "Vassoio Harbor",
            "nl": "Harbor dienblad",
            "pt": "Bandeja Harbor",
        },
        "desc": {
            "fr": "Plateau $shape.attributive en chene huile, bords francs.",
            "en": "$Shape.title oiled-oak tray with square edges.",
            "th": "ถาด$shape.attributiveไม้โอ๊กน้ำมันขอบตรง",
            "es": "Bandeja $shape.attributive de roble aceitado, bordes rectos.",
            "it": "Vassoio $shape.attributive in rovere oliato, bordi netti.",
            "nl": "$Shape.attributive dienblad van geoliede eik, strakke randen.",
            "pt": "Bandeja $shape.attributive em carvalho oleado, bordos retos.",
        },
        "occasion": {
            "fr": "atelier",
            "en": "studio",
            "th": "สตูดิโอ",
            "es": "taller",
            "it": "atelier",
            "nl": "atelier",
            "pt": "atelier",
        },
        "colors": (["$brown", "$green"], ["$black"]),
    },
    {
        "folder": "0006",
        "uid": "AT-BX-917",
        "price": 47,
        "featured": True,
        "color": "#3d2c29",
        "shape": "square",
        "lengths": ["medium"],
        "sizes": {"XS": 1, "S": 2, "M": 3, "L": 1},
        "title": {
            "fr": "Coffret Atelier",
            "en": "Atelier Box",
            "th": "กล่องอาเตอลิเยร์",
            "es": "Caja Atelier",
            "it": "Cofanetto Atelier",
            "nl": "Atelier doos",
            "pt": "Caixa Atelier",
        },
        "desc": {
            "fr": "Coffret $shape.attributive, cuir vegetal et couture sellier.",
            "en": "$Shape.title vegetable-tanned leather box, saddle-stitched.",
            "th": "กล่อง$shape.attributiveหนังฟอกพืชเย็บอานม้า",
            "es": "Caja $shape.attributive de cuero vegetal, costura de talabartero.",
            "it": "Cofanetto $shape.attributive in cuoio vegetale, cucitura sellier.",
            "nl": "$Shape.attributive doos in plantaardig leer, zadelssteek.",
            "pt": "Caixa $shape.attributive em couro vegetal, costura de seleiro.",
        },
        "occasion": {
            "fr": "cadeau",
            "en": "gift",
            "th": "ของขวัญ",
            "es": "regalo",
            "it": "regalo",
            "nl": "cadeau",
            "pt": "presente",
        },
        "colors": (["$brown", "$black"], ["$gold"]),
    },
]


def generate_products() -> None:
    library = SAMPLE / "product" / "library"
    if library.exists():
        shutil.rmtree(library)
    library.mkdir(parents=True)
    registry = {}
    for item in PRODUCTS:
        folder = library / item["folder"]
        folder.mkdir()
        photos = {}
        available = {}
        shape = item["shape"]
        available[f"${shape}"] = {}
        photos[f"${shape}"] = {}
        for length in item["lengths"]:
            available[f"${shape}"][f"${length}"] = item["sizes"]
            photo_entries = []
            for index, suffix in enumerate(("1", "2"), start=1):
                for kind, size in (("small", 400), ("modal", 1200)):
                    dest = folder / kind / shape / length / f"{suffix}.webp"
                    write_webp(dest, item["color"], f"{item['title']['en']}\n{length}", size)
                photo_path = folder / "modal" / shape / length / f"{suffix}.webp"
                photo_entries.append({"photo": suffix, "hash": sha256_file(photo_path)})
            photos[f"${shape}"][f"${length}"] = photo_entries
        static = {
            "product-uid": item["uid"],
            "creation-date": "2026-10-01",
            "price": item["price"],
            "available": available,
        }
        if item["featured"]:
            static["featured"] = {"from": "2026-10-01", "for": 365}
        generated = {
            "title": item["title"],
            "desc": item["desc"],
            "alt": item["desc"],
            "occasion": item["occasion"],
            "color-main": item["colors"][0],
            "color-secondary": item["colors"][1],
            "photos": photos,
        }
        (folder / "data-static.json").write_text(json.dumps(static, indent=2, ensure_ascii=False) + "\n")
        (folder / "data-generated.json").write_text(
            json.dumps(generated, indent=2, ensure_ascii=False) + "\n"
        )
        registry[item["uid"]] = f"library/{item['folder']}"
    (SAMPLE / "product" / "data-registry.json").write_text(
        json.dumps({"product-uids": registry}, indent=2) + "\n"
    )


REPLACEMENTS = [
    ("PamSurin Nail Art", "Lumen"),
    ("PamSurin Nails", "Lumen"),
    ("PamSurin Nail", "Lumen"),
    ("Pam Surin Nails", "Lumen"),
    ("PamSurin", "Lumen"),
    ("pamsurin.nail@gmail.com", "hello@lumen.test"),
    ("contact@pamsurin.fr", "hello@lumen.test"),
]


def rebrand_tree(root: Path, suffixes: tuple[str, ...]) -> None:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", "dist", ".git", "output"}]
        for name in filenames:
            if not name.endswith(suffixes):
                continue
            path = Path(dirpath) / name
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            original = text
            for old, new in REPLACEMENTS:
                text = text.replace(old, new)
            if text != original:
                path.write_text(text, encoding="utf-8")


def main() -> None:
    copy_seed_sources()
    generate_products()
    rebrand_tree(ROOT / "front" / "src", (".ts", ".tsx", ".css", ".json", ".html", ".md"))
    rebrand_tree(ROOT / "front" / "public", (".svg", ".html", ".php"))
    rebrand_tree(ROOT / "back" / "src" / "modules" / "messaging", (".ts",))
    print("sample + rebrand done")


if __name__ == "__main__":
    main()
