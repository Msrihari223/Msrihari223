# utils.py
# ─────────────────────────────────────────────────────────────
# Shared helper functions used across all route files
# ─────────────────────────────────────────────────────────────


# ── Category detection ────────────────────────────────────────────
_CATEGORIES = {
    "Threats":        ["kill","die","find you","hurt","threaten","address","where you live","come for you"],
    "Harassment":     ["hate","nobody likes","loser","worthless","stupid","idiot","dumb","moron"],
    "Body Shaming":   ["ugly","fat","disgusting","gross","skinny","weight","body"],
    "Exclusion":      ["leave","get out","nobody wants","don't belong","go away","unwanted"],
    "Cyberstalking":  ["follow","watching","everywhere","stalking","tracking","found you"],
    "Hate Speech":    ["slur","racist","sexist","homophobic"],  # extend as needed
}

def detect_categories(text: str, label: str) -> list:
    t = text.lower()
    found = [cat for cat, words in _CATEGORIES.items() if any(w in t for w in words)]
    if not found:
        return ["Clean"] if label == "SAFE" else ["General Toxicity"]
    return found


# ── Action recommendation ─────────────────────────────────────────
def recommend_action(label: str, platform: str) -> str:
    msgs = {
        "DANGER": (
            f"🚨 IMMEDIATE ACTION REQUIRED on {platform}: "
            "Hide/remove the message, flag the account, alert a moderator, "
            "and notify the target's parent or guardian. "
            "Escalate to school counselor if the target is a student."
        ),
        "WARNING": (
            f"⚠️ REVIEW NEEDED on {platform}: "
            "Flag this message for moderator review. "
            "Consider issuing a community-guidelines warning to the sender."
        ),
        "SAFE": "✅ No action required. Message is within acceptable limits.",
    }
    return msgs.get(label, "Manual review recommended.")


# ── Severity score (0–100) ────────────────────────────────────────
def severity_score(label: str, confidence: float) -> int:
    base = {"DANGER": 70, "WARNING": 35, "SAFE": 0}
    return min(100, int(base.get(label, 0) + confidence * 30))


# ── Build full response dict ──────────────────────────────────────
def build_response(raw_text, platform, pred_result) -> dict:
    label      = pred_result["label"]
    confidence = pred_result["confidence"]
    categories = detect_categories(raw_text, label)
    action     = recommend_action(label, platform)

    return {
        "label":          label,
        "confidence":     round(confidence, 4),
        "confidence_pct": f"{int(confidence * 100)}%",
        "severity_score": severity_score(label, confidence),
        "categories":     categories,
        "action":         action,
        "platform":       platform,
        "source":         pred_result["source"],
    }
