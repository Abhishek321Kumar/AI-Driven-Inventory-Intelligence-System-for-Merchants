"""Decision adapter. Google Gemini picks the label. Cash and units stay computed here."""
import json
import os
import urllib.error
import urllib.request

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
TIMEOUT = 30
SOURCE = "Google Gemini"
MULT = {"HIGH_SURGE": 2.2, "MODERATE_GROWTH": 1.35, "STABLE": 1.0, "SLUMP": 0.6}
MARKDOWNS = ("10", "15", "20")


def _context(sku):
    cat = sku.get("cat") or ""
    if cat == "Jackets":
        return "Seasonal outerwear. A heavy winter jacket in tropical Bengaluru during October is a climate mismatch."
    if cat in ("Shirts", "Pants", "Shoes"):
        return "Staple category. Benchmark shelf life is longer than one festival season."
    return "Fashion category. Benchmark shelf life is a single season."


def _unit(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1:
        number = number / 100.0
    return max(0.0, min(1.0, number))


def _regime(value):
    key = str(value or "").strip().upper().replace(" ", "_").replace("-", "_")
    aliases = {
        "HIGH": "HIGH_SURGE",
        "SURGE": "HIGH_SURGE",
        "MODERATE": "MODERATE_GROWTH",
        "GROWTH": "MODERATE_GROWTH",
        "LOW": "SLUMP",
        "DECLINE": "SLUMP",
    }
    if key in MULT:
        return key
    return aliases.get(key)


def _markdown(value):
    text = str(value or "").replace("%", "").strip()
    if text in ("0.1", "0.10"):
        return "10"
    if text in ("0.15",):
        return "15"
    if text in ("0.2", "0.20"):
        return "20"
    if text in MARKDOWNS:
        return text
    return None


def _parse_items(text):
    raw = json.loads(text)
    items = raw.get("items") if isinstance(raw, dict) else raw
    if isinstance(raw, dict) and not items:
        items = [raw]
    if not isinstance(items, list):
        raise RuntimeError("model-bad-json")
    return items


def ask(skus):
    lines = []
    for sku in skus:
        lines.append(
            "%s | %s | %s | age %s days | velocity %s/day | cover %s days | capital %s | events %s | %s"
            % (
                sku.get("id"),
                sku.get("name") or sku.get("id"),
                sku.get("cat"),
                sku.get("age"),
                sku.get("baseline"),
                sku.get("days"),
                sku.get("capital"),
                ", ".join(sku.get("events") or []) or "none",
                _context(sku),
            )
        )
    prompt = (
        "You decide inventory for a Bengaluru apparel shop. "
        "Return JSON {\"items\":[...]} with one object per product, same order. "
        "Fields: id, regime, regime_confidence, dead, markdown, markdown_confidence. "
        "regime is exactly HIGH_SURGE, MODERATE_GROWTH, STABLE, or SLUMP, judged against the given daily velocity and events. "
        "dead is the probability this stock will not sell, from 0 to 1. "
        "markdown is exactly 10, 15, or 20. "
        "confidences are from 0 to 1. Do not invent rupees.\n"
        + "\n".join(lines)
    )
    return _parse_items(_gemini([{"text": prompt}]))


def _gemini(parts, search=False):
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("model-unavailable")
    request = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"temperature": 0}}
    # Google Search grounding cannot be combined with JSON mode, so JSON is pulled out of the text instead.
    if search:
        request["tools"] = [{"google_search": {}}]
    else:
        request["generationConfig"]["responseMimeType"] = "application/json"
    body = json.dumps(request).encode()
    req = urllib.request.Request(
        GEMINI_URL % GEMINI_MODEL,
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            data = json.loads(res.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise RuntimeError("model-unavailable") from exc
    try:
        return "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"])
    except (AttributeError, TypeError, KeyError, IndexError) as exc:
        raise RuntimeError("model-bad-json") from exc


def _open_food_facts(code):
    url = ("https://world.openfoodfacts.org/api/v2/product/%s.json"
           "?fields=product_name,product_name_en,brands,quantity,image_front_small_url,categories" % code)
    req = urllib.request.Request(url, headers={"User-Agent": "Mercura/1.0 (inventory app)"})
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            data = json.loads(res.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    product = data.get("product") if data.get("status") == 1 else None
    if not product or not (product.get("product_name_en") or product.get("product_name")):
        return None
    image = product.get("image_front_small_url") or ""
    return {
        "name": product.get("product_name_en") or product.get("product_name"),
        "brand": (product.get("brands") or "").split(",")[0],
        "size": product.get("quantity"),
        "category": (product.get("categories") or "").split(",")[0],
        "image": image if image.startswith("https://") else "",
    }


def _upc_item_db(code):
    req = urllib.request.Request("https://api.upcitemdb.com/prod/trial/lookup?upc=%s" % code,
                                 headers={"User-Agent": "Mercura/1.0 (inventory app)"})
    try:
        with urllib.request.urlopen(req, timeout=6) as res:
            items = json.loads(res.read().decode()).get("items") or []
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, AttributeError):
        return None
    if not items or not items[0].get("title"):
        return None
    item = items[0]
    image = next((url for url in item.get("images") or [] if str(url).startswith("https://")), "")
    return {
        "name": item.get("title"),
        "brand": item.get("brand"),
        "size": item.get("size"),
        "category": (item.get("category") or "").split(">")[-1].strip(),
        "image": image,
    }


def _first_json(text):
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        raw = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def _clean_identity(raw, code, source):
    raw = raw if isinstance(raw, dict) else {}
    text = lambda key, size: " ".join(str(raw.get(key) or "").split())[:size] or None
    name = text("name", 120)
    if name and name.lower() in ("null", "none", "unknown"):
        name = None
    return {
        "barcode": code,
        "name": name,
        "brand": text("brand", 60),
        "category": text("category", 60),
        "size": text("size", 30),
        "mrp": _number(raw.get("mrp")) or None,
        "image": raw.get("image") if str(raw.get("image") or "").startswith("https://") else None,
        "source": source if name else None,
    }


def identify(body):
    body = body if isinstance(body, dict) else {}
    code = "".join(ch for ch in str(body.get("barcode") or "") if ch.isalnum())[:32]
    upload = _upload(body, IMAGE_TYPES) if body.get("image") else None
    if not code and not upload:
        raise RuntimeError("bad-image")
    if code.isdigit() and len(code) in (8, 12, 13, 14):
        for lookup, source in ((_open_food_facts, "Open Food Facts"), (_upc_item_db, "UPCitemdb")):
            found = lookup(code)
            if found:
                return _clean_identity(found, code, source)
    ask = (
        "Reply with only a JSON object with fields name, brand, category, size, mrp. "
        "name: the product's retail name. category: a short shop category such as Snacks, Beverages, Apparel. "
        "size: pack size or garment size. mrp: Indian MRP in rupees as a number if printed or known. "
        "Use null for anything you cannot confirm. Do not invent a product."
    )
    photo = [upload] if upload else []
    if code:
        try:
            prompt = "Identify the retail product with barcode %s. Search the web for this exact number. " % code
            found = _first_json(_gemini([{"text": prompt + ("A photo is attached. " if upload else "") + ask}] + photo, search=True))
            if found.get("name"):
                return _clean_identity(found, code, "Google Search")
        except RuntimeError:
            pass
    if not upload:
        return _clean_identity({}, code, None)
    prompt = "Identify this retail product from the photo, like Google Lens: read the brand and name on the pack or tag. "
    if not code:
        prompt += "Also return field barcode: the digits printed under the barcode, or null. "
    seen = _first_json(_gemini([{"text": prompt + ask}] + photo))
    printed = "".join(ch for ch in str(seen.get("barcode") or "") if ch.isdigit())
    if not code and len(printed) in (8, 12, 13, 14):
        return identify({"barcode": printed}) if not seen.get("name") else {**_clean_identity(seen, printed, "Gemini photo"), **{
            k: v for k, v in identify({"barcode": printed}).items() if v}}
    return _clean_identity(seen, code, "Gemini photo")


CATEGORIES = ("Ethnic Wear", "Apparel", "Footwear", "Outerwear", "Activewear", "Accessories", "Essentials")
IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")


def _upload(body, types):
    image = body.get("image") if isinstance(body, dict) else None
    mime = body.get("mime") if isinstance(body, dict) else None
    if not isinstance(image, str) or mime not in types or not image or len(image) > 6_000_000:
        raise RuntimeError("bad-image")
    return {"inline_data": {"mime_type": mime, "data": image}}


def _number(value):
    try:
        number = float(str(value if value is not None else "").replace(",", "").replace("₹", "").strip())
    except ValueError:
        return 0
    return round(number, 2) if number > 0 else 0


def _clean_bill(raw):
    raw = raw if isinstance(raw, dict) else {}
    text = lambda value, size: " ".join(str(value or "").split())[:size]
    items = []
    for item in (raw.get("items") or [])[:100]:
        if not isinstance(item, dict) or not text(item.get("name"), 120):
            continue
        items.append({
            "name": text(item.get("name"), 120),
            "sku": "".join(ch for ch in str(item.get("sku") or "") if ch.isalnum() or ch == "-")[:32],
            "qty": int(_number(item.get("qty"))),
            "cost": _number(item.get("cost")),
            "price": _number(item.get("mrp")),
            "category": item.get("category") if item.get("category") in CATEGORIES else None,
        })
    phone = "".join(ch for ch in str(raw.get("phone") or "") if ch.isdigit() or ch == "+")[:16]
    return {
        "vendor": text(raw.get("vendor"), 120),
        "phone": phone,
        "number": text(raw.get("invoice_number"), 40),
        "date": text(raw.get("date"), 20),
        "items": items,
    }


def scan_bill(body):
    upload = _upload(body, IMAGE_TYPES + ("application/pdf",))
    prompt = (
        "This is a supplier bill or purchase invoice for a retail shop. "
        "Return JSON with fields vendor, phone, invoice_number, date (YYYY-MM-DD), items. "
        "items is a list of every product line with fields name, sku, qty, cost, mrp, category. "
        "sku: the item code or barcode printed on that line, or null. "
        "qty: units received. cost: unit purchase rate before tax. mrp: printed MRP per unit, or null. "
        "category: exactly one of " + ", ".join(CATEGORIES) + ", or null. "
        "Skip tax, discount, freight and total lines. Use null for anything not printed. Do not guess."
    )
    try:
        raw = json.loads(_gemini([{"text": prompt}, upload]))
    except json.JSONDecodeError as exc:
        raise RuntimeError("model-bad-json") from exc
    return _clean_bill(raw)


def _cash(units, vel, price, rate):
    moved = min(float(units or 0), float(vel or 0) * (1 + rate * 3) * 30)
    return round(moved * float(price or 0) * (1 - rate)), moved


def _rows(sku, item):
    regime = _regime(item.get("regime"))
    mark = _markdown(item.get("markdown"))
    dead = _unit(item.get("dead"))
    regime_conf = _unit(item.get("regime_confidence"))
    mark_conf = _unit(item.get("markdown_confidence"))
    if not regime or not mark or dead is None or regime_conf is None or mark_conf is None:
        raise RuntimeError("model-bad-row")
    baseline = float(sku.get("baseline") or 0)
    rate = int(mark) / 100
    price = sku.get("price") or 0
    cash, moved = _cash(sku.get("units"), baseline, price, rate)
    vel = float(baseline or 0.05) or 0.05
    return (
        {
            "id": sku.get("id"),
            "source": SOURCE,
            "regime": regime,
            "confidence": round(regime_conf * 100, 1),
            "baseline": round(baseline, 2),
            "rate": round(baseline * MULT[regime], 2),
            "review": regime_conf < 0.8,
        },
        {
            "id": sku.get("id"),
            "source": SOURCE,
            "probability": round(dead * 100, 1),
            "markdown": rate,
            "confidence": round(mark_conf * 100, 1),
            "cash": cash,
            "days": int(round(moved / max(vel, 0.05))) if moved else 0,
            "review": mark_conf < 0.8 or min(dead, 1 - dead) > 0.2,
            "context": _context(sku),
        },
    )


def decide(body):
    skus = body.get("skus") if isinstance(body, dict) and body.get("skus") else [body]
    items = ask(skus)
    by_id = {}
    for item in items:
        if isinstance(item, dict) and item.get("id"):
            by_id[str(item.get("id"))] = item
    forecasts = []
    dead = []
    for index, sku in enumerate(skus):
        item = by_id.get(str(sku.get("id"))) or (items[index] if index < len(items) else None)
        if not isinstance(item, dict):
            continue
        try:
            forecast_row, dead_row = _rows(sku, item)
        except RuntimeError:
            continue
        forecasts.append(forecast_row)
        dead.append(dead_row)
    if not forecasts:
        raise RuntimeError("model-bad")
    return {"forecasts": forecasts, "dead": dead}


def forecast(sku):
    row = next((item for item in decide(sku)["forecasts"] if item["id"] == sku.get("id")), None)
    if not row:
        raise RuntimeError("model-bad-forecast")
    return row


def dead_stock(sku):
    row = next((item for item in decide(sku)["dead"] if item["id"] == sku.get("id")), None)
    if not row:
        raise RuntimeError("model-bad-dead")
    return row


if __name__ == "__main__":
    sample = _parse_items(
        '{"items":[{"id":"JKT-409","regime":"SLUMP","regime_confidence":0.91,'
        '"dead":0.96,"markdown":20,"markdown_confidence":0.88}]}'
    )
    forecast_row, dead_row = _rows(
        {"id": "JKT-409", "cat": "Jackets", "units": 47, "baseline": 0.34, "price": 1499},
        sample[0],
    )
    assert forecast_row["regime"] == "SLUMP"
    assert forecast_row["rate"] == round(0.34 * 0.6, 2)
    assert dead_row["markdown"] == 0.2 and dead_row["cash"] > 0
    assert dead_row["review"] is False
    bill = _clean_bill({"vendor": " Apex  Footwear ", "phone": "+91 98201-44821", "items": [
        {"name": "AirSprint Shoe", "sku": "SH 102", "qty": "25", "cost": "1,100", "mrp": None},
        {"name": "", "qty": 3},
    ]})
    assert bill["vendor"] == "Apex Footwear" and bill["phone"] == "+919820144821"
    assert bill["items"] == [{"name": "AirSprint Shoe", "sku": "SH102", "qty": 25, "cost": 1100.0, "price": 0, "category": None}]
    assert _first_json('Here you go:\n```json\n{"name": "Kurkure Masala Munch", "mrp": "20"}\n```') == {"name": "Kurkure Masala Munch", "mrp": "20"}
    who = _clean_identity({"name": "null", "image": "http://x"}, "123", "Google Search")
    assert who["name"] is None and who["image"] is None and who["source"] is None
    print("model_service ok", dead_row["cash"])
