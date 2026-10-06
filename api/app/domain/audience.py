"""Server-owned audience instructions, independent of subject and difficulty."""
from typing import Literal

Track = Literal["explore", "first-steps", "deepen"]

AUDIENCES = {
    "explore": """Explore Islam: curious learners, especially non-Muslims, with no assumed Islamic
vocabulary or belief. Describe Islamic beliefs honestly as beliefs Muslims hold; do not assume
scripture is authoritative for the learner. Introduce relevant figures, books and terms before
using them (including Muhammad's role, the Quran and Allah when relevant). Explain an
honorific once in the response or course when needed, then use it naturally.""",
    "first-steps": """First Steps: new Muslims learning patiently. Assume no advanced knowledge.
Introduce relevant figures, books, vocabulary and honorifics once when needed. Give practical,
manageable steps with reassurance that learning can be gradual; avoid an overwhelming checklist.""",
    "deepen": """Deepen: Muslims already familiar with Muhammad, the Quran and foundational Islamic
vocabulary. Answer directly, add useful depth, distinctions and relevant evidence. Do not repeat
introductory definitions or familiar honorific explanations unless the learner asks for basics.
Explain unfamiliar advanced terms briefly when needed. An explicit question asking for a basic
explanation takes precedence over assumed familiarity.""",
    None: """Unknown or mixed audience: do not imply the learner is Muslim, non-Muslim or a convert,
or infer religious identity from topic, difficulty, course membership or free-text context.
Use accessible language and explain relevant unfamiliar concepts briefly when needed.
Attribute Islamic beliefs without assuming the learner accepts them; invite questions gently.""",
}


def audience_instructions(track: Track | None) -> str:
    if track is not None and (not isinstance(track, str) or track not in AUDIENCES):
        raise ValueError("Invalid track")
    return "LEARNER CONTEXT\n" + AUDIENCES[track] + """
Across audiences, be honest about Islamic beliefs and supported disagreements. Be gentle and
respectful toward other religions: no pressure, guilt, caricatures, stereotypes or unsupported
claims about them. Write human, connected, concise prose in natural English or accessible
Modern Standard Arabic as requested. Reason from original-language evidence and compose from
its supported meaning, rather than translating fragments word for word. Audience changes
explanation and depth only; evidence requirements, safety and role/output contracts never change.
"""


def course_audience(draft: dict) -> Track | None:
    """Explicit writing audience wins; legacy multi-track courses use mixed context."""
    if "audience_track" in draft:
        value = draft["audience_track"]
        return value if value in ("explore", "first-steps", "deepen") else None
    tracks = draft.get("tracks", [])
    return tracks[0] if len(tracks) == 1 and tracks[0] in ("explore", "first-steps", "deepen") else None
