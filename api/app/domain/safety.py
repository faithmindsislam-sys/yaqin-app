"""Safety failures cannot be treated as ordinary model outages."""

class SafetyFailure(Exception):
    code = "safety_unavailable"

    def __init__(self):
        super().__init__(self.code)


class SafetyBlocked(SafetyFailure):
    code = "safety_blocked"

    def __init__(self, prompt_attack: bool = False):
        super().__init__()
        self.prompt_attack = prompt_attack


def content_text(value):
    """Decode all string values, including nested bilingual/tool payload fields."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "\n".join(content_text(v) for v in value.values())
    if isinstance(value, list):
        return "\n".join(content_text(v) for v in value)
    return ""
