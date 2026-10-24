"""Kev System-One adapter. The shop server calls this. The browser falls back if it errors."""
import json
import os
import urllib.error
import urllib.request

KEV_URL = os.environ.get("KEV_URL", "http://127.0.0.1:8009/v1/systemone")
KEV_TIMEOUT = 0.35
SOURCE = "Kev-AI (RLCD Calibrated Model)"
MULT = {"HIGH_SURGE": 2.2, "MODERATE_GROWTH": 1.35, "STABLE": 1.0, "SLUMP": 0.6}
MARKDOWNS = ("10", "15", "20")


def ask(state, questions):
    body = json.dumps({"state": state, "model": "kev-latest", "questions": questions}).encode()
    req = urllib.request.Request(KEV_URL, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=KEV_TIMEOUT) as res:
            return json.loads(res.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise RuntimeError("kev-unavailable") from exc


def _context(sku):
    cat = sku.get("cat") or ""
    if cat == "Jackets":
        return "Seasonal outerwear. A heavy winter jacket in tropical Bengaluru during October is a climate mismatch."
    if cat in ("Shirts", "Pants", "Shoes"):
        return "Staple category. Benchmark shelf life is longer than one festival season."
    return "Fashion category. Benchmark shelf life is a single season."


def _state(sku, extra):
    return {
        "sku": sku.get("id"),
        "name": sku.get("name"),
        "category": sku.get("cat"),
        "units": sku.get("units"),
        "age_days": sku.get("age"),
        "velocity_per_day": sku.get("baseline"),
        "lead_days": sku.get("lead"),
        "days_cover": sku.get("days"),
        "capital": sku.get("capital"),
        "events": sku.get("events") or [],
        "market": _context(sku),
        "note": extra,
    }


def forecast(sku):
    baseline = float(sku.get("baseline") or 0)
    raw = ask(_state(sku, "Predict the next 14 days of demand."), {
        "regime": {
            "type": "choice",
            "instructions": "Which demand regime fits the next 14 days?",
            "criteria": {
                "HIGH_SURGE": "More than twice the baseline velocity",
                "MODERATE_GROWTH": "About 1.2 to 1.5 times baseline velocity",
                "STABLE": "About the same as baseline velocity",
                "SLUMP": "Under 0.7 times baseline velocity",
            },
        }
    })
    ans = (raw.get("answers") or {}).get("regime") or {}
    choice = ans.get("choice")
    if choice not in MULT:
        raise RuntimeError("kev-bad-forecast")
    probs = ans.get("probabilities") or {}
    conf = float(probs.get(choice, ans.get("confidence") or 0))
    return {
        "source": SOURCE,
        "regime": choice,
        "confidence": round(conf * 100, 1),
        "baseline": round(baseline, 2),
        "rate": round(baseline * MULT[choice], 2),
        "review": conf < 0.8,
    }


def _cash(units, vel, price, rate):
    moved = min(float(units or 0), float(vel or 0) * (1 + rate * 3) * 30)
    return round(moved * float(price or 0) * (1 - rate)), moved


def dead_stock(sku):
    raw = ask(_state(sku, "Judge whether this pile is dead stock and which markdown frees the capital."), {
        "dead": {"type": "noul", "instructions": "Is this dead stock that should be marked down rather than reordered?"},
        "markdown": {
            "type": "choice",
            "instructions": "Which markdown should the merchant consider?",
            "criteria": {"10": "10 percent off", "15": "15 percent off", "20": "20 percent off"},
        },
    })
    answers = raw.get("answers") or {}
    dead = answers.get("dead") or {}
    mark = answers.get("markdown") or {}
    prob = dead.get("noul")
    if prob is None:
        raise RuntimeError("kev-bad-dead")
    prob = float(prob)
    choice = str(mark.get("choice") or "")
    if choice not in MARKDOWNS:
        raise RuntimeError("kev-bad-markdown")
    probs = mark.get("probabilities") or {}
    conf = float(probs.get(choice, mark.get("confidence") or 0))
    rate = int(choice) / 100
    price = sku.get("price") or 0
    cash, moved = _cash(sku.get("units"), sku.get("baseline"), price, rate)
    vel = float(sku.get("baseline") or 0.05) or 0.05
    return {
        "source": SOURCE,
        "probability": round(prob * 100, 1),
        "markdown": rate,
        "confidence": round(conf * 100, 1),
        "cash": cash,
        "days": int(round(moved / max(vel, 0.05))) if moved else 0,
        "review": conf < 0.8 or min(prob, 1 - prob) > 0.2,
        "context": _context(sku),
    }


if __name__ == "__main__":
    sample = {"choice": "MODERATE_GROWTH", "probabilities": {"MODERATE_GROWTH": 0.914, "STABLE": 0.05, "SLUMP": 0.02, "HIGH_SURGE": 0.016}, "confidence": 0.88}
    assert sample["choice"] in MULT
    assert round(1.0 * MULT["MODERATE_GROWTH"], 2) == 1.35
    cash, moved = _cash(47, 0.34, 1499, 0.15)
    assert cash > 0 and moved > 0
    print("model_service ok", cash)
