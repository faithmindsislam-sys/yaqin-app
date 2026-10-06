"""Self-contained developer guide, with field tables from the actual public contract."""

import json
import re
from html import escape

from app.configuration.settings import ROOT

FIELD_HELP = {
    "offset": "Number of courses to skip. Pagination can shift when publication changes.",
    "limit": "Maximum number of courses in this page.", "track": "Filter or contextualize by learning journey.",
    "course_id": "Course identifier. Course reads require a published course.",
    "source_id": "Approved canonical source identifier.", "question": "The learner's question.",
    "lang": "Answer language: English or Arabic.", "card_id": "Optional course-card context.",
    "history": "Previous user/assistant messages, in conversation order.",
    "practice": "Request temporary AI practice questions, or the returned questions. These are not approved course material.",
    "practice_avoid": "Previous practice prompts to avoid repeating.",
    "items": "Published courses in this page, ordered by course ID.", "total": "Total matching courses, before pagination.",
    "title": "English/Arabic title.", "summary": "English/Arabic summary.", "tracks": "Supported learning journeys.",
    "level": "Positive numeric learning level.", "minutes": "Estimated reading time in minutes.",
    "cards": "Course content cards. Preserve their order and source references.",
    "explain_back": "Optional explain-back prompt and key ideas.", "quiz": "Optional course quiz.",
    "sources_by_id": "Approved citations keyed by source ID.", "sources": "Citations keyed by source ID.",
    "review_status": "Keep this visible. HTTP tutoring can include eligible unreviewed passages.",
    "translation_status_en": "English translation review status; do not invent a missing translation.",
    "grading": "Source grading, when provided.", "ref_en": "English source attribution.", "ref_ar": "Arabic source attribution.",
    "text_en": "Stored English wording, if available.", "text_ar": "Stored Arabic wording, if available.",
    "answer": "Ordered tutor answer blocks. Source-block IDs resolve in the sources map.",
    "tier": "Answer tier. Handle unknown values safely.", "referral": "Optional referral rather than a direct answer.",
    "follow_ups": "Suggested follow-up questions.", "ai_generated": "Whether the response is AI-generated.",
    "safety_outcome": "Refusal, referral or other safety result; HTTP 200 alone does not mean a direct answer.",
    "practice_fallback": "Whether practice used fallback behavior.",
}

EXAMPLES = {
    "/courses": {"items": [], "total": 0, "offset": 0, "limit": 25},
    "/courses/{course_id}": {
        "id": "example-course", "title": {"en": "Example course", "ar": "دورة نموذجية"},
        "summary": {"en": "Illustrative response.", "ar": "استجابة توضيحية."},
        "subject": "belief", "tracks": ["explore"], "level": 1, "minutes": 4,
        "cover": None, "status": "published", "cards": [{"id": "example-card", "kind": "concept",
            "title": {"en": "Example card"}, "body": {"en": "Illustrative content."}}],
        "explain_back": None, "quiz": None, "sources_by_id": {},
    },
    "/sources/{source_id}": {
        "id": "example-source", "kind": "reference", "ref_en": "Example reference", "ref_ar": None,
        "text_en": "Canonical source wording appears here.", "text_ar": None, "translation": None,
        "translation_status_en": None, "origin": None, "url": None, "grading": None,
        "review_status": "approved", "eligibility": None,
    },
    "/tutor/ask": {"tier": "B", "answer": [{"type": "text", "text": "An illustrative tutor answer."}],
        "sources": {}, "referral": None, "follow_ups": [], "ai_generated": True,
        "safety_outcome": None, "practice": None, "practice_fallback": False},
}

# Keep the four examples connected so readers can follow a citation end to end.
EXAMPLES["/courses/{course_id}"]["cards"][0]["sources"] = ["example-source"]
EXAMPLES["/courses/{course_id}"]["sources_by_id"] = {"example-source": EXAMPLES["/sources/{source_id}"]}
EXAMPLES["/courses"]["items"] = [{key: value for key, value in EXAMPLES["/courses/{course_id}"].items()
                                  if key not in {"cards", "quiz", "explain_back", "sources_by_id"}}]
EXAMPLES["/courses"]["total"] = 1
EXAMPLES["/tutor/ask"]["answer"].append({"type": "source", "id": "example-source"})
EXAMPLES["/tutor/ask"]["sources"] = {"example-source": EXAMPLES["/sources/{source_id}"]}


def brand_technical_docs(html: str) -> str:
    """Add shared navigation while preserving the native Swagger/ReDoc interfaces."""
    style = """<style>
    body{margin:0} .docs-header{box-sizing:border-box;position:sticky;top:0;z-index:30;min-height:64px;display:flex;
      align-items:center;justify-content:space-between;gap:16px;padding:14px 28px;background:#fff;
      border-bottom:1px solid #e1e8f0;font:14px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}
    .docs-header a{color:#1264c0;text-decoration:none}.docs-header a:hover{text-decoration:underline}
    .docs-header a:focus-visible{outline:3px solid #7bb6f5;outline-offset:4px}
    .docs-header .docs-brand{font-size:18px;font-weight:750;color:#142c46}.docs-header nav{display:flex;gap:20px;flex-wrap:wrap}
    .swagger-ui .wrapper{max-width:1200px}.swagger-ui .info{margin:32px 0 24px}
    .swagger-ui .info .title{font-size:30px;color:#142c46}.swagger-ui .scheme-container{box-shadow:none;border-bottom:1px solid #e1e8f0}
    .swagger-ui .btn.authorize{color:#1264c0;border-color:#1264c0}.swagger-ui .btn.authorize svg{fill:#1264c0}
    .swagger-ui .opblock.opblock-get{border-color:#b5d3f0;background:#f4f8fd}
    .swagger-ui .opblock.opblock-get .opblock-summary-method{background:#1264c0}
    .swagger-ui .opblock.opblock-post{border-color:#c4c8ed;background:#f6f6fd}
    .swagger-ui .opblock.opblock-post .opblock-summary-method{background:#5b55a3}
    redoc .menu-content{top:64px!important;max-height:calc(100vh - 64px)}
    @media(max-width:600px){.docs-header{padding:12px 18px;align-items:flex-start}.docs-header nav{gap:6px 14px;font-size:12px}}
    </style>"""
    header = """<header class="docs-header"><a class="docs-brand" href="/api/v1/docs">Yaqeen Developers</a>
    <nav aria-label="Developer documentation"><a href="/api/v1/docs">Guide</a><a href="/api/v1/docs#mcp">MCP</a>
    <a href="/api/v1/reference">Reference</a><a href="/api/v1/swagger">Swagger</a></nav></header>"""
    return html.replace("</head>", style + "</head>").replace("<body>", "<body>" + header)


def render_developer_docs(schema: dict, technical_base: str | None = None) -> str:
    guide = (ROOT / "docs" / "PUBLIC_API.md").read_text()
    base = re.search(r"Base URL: `([^`]+)`", guide).group(1)
    auth_url = re.search(r"Supabase URL: (https://[^\s]+)", guide).group(1)
    public_key = re.search(r"Publishable key: (sb_publishable_[^\s]+)", guide).group(1)
    models = schema["components"]["schemas"]

    def resolve(field):
        return models[field["$ref"].rsplit("/", 1)[-1]] if "$ref" in field else field

    def type_name(field):
        if "$ref" in field:
            return field["$ref"].rsplit("/", 1)[-1]
        choices = field.get("anyOf", field.get("oneOf", []))
        if choices:
            return " | ".join(type_name(choice) for choice in choices)
        if field.get("type") == "array":
            item = type_name(field.get("items", {}))
            return (f"({item})" if " | " in item else item) + "[]"
        if isinstance(field.get("additionalProperties"), dict):
            return "map<string, " + type_name(field["additionalProperties"]) + ">"
        return field.get("type", "value")

    def constraints(field):
        out = []
        for key, label in (("minimum", "min"), ("maximum", "max"), ("minLength", "min characters"),
                           ("maxLength", "max characters"), ("minItems", "min items"), ("maxItems", "max items")):
            if key in field:
                out.append(f"{label}: {field[key]}")
        if "default" in field:
            out.append("default: " + json.dumps(field["default"], ensure_ascii=False))
        if "enum" in field:
            out.append("values: " + ", ".join(map(str, field["enum"])))
        if "const" in field:
            out.append("value: " + str(field["const"]))
        if "items" in field:
            detail = constraints(resolve(field["items"]))
            if detail:
                out.append("each item: " + detail)
        for choice in field.get("anyOf", field.get("oneOf", [])):
            detail = constraints(resolve(choice))
            if detail:
                out.append(detail)
        return "; ".join(out)

    def rows(fields, required):
        body = []
        for name, field in fields.items():
            detail = constraints(resolve(field))
            help_text = field.get("description") or FIELD_HELP.get(name, "")
            badge = '<span class="required">required</span>' if name in required else '<span class="optional">optional</span>'
            body.append(f'<tr><td><code>{escape(name)}</code>{badge}</td><td><span class="field-type">'
                        f'{escape(type_name(field))}</span><p>{escape(help_text)}</p>'
                        f'<small>{escape(detail)}</small></td></tr>')
        return '<div class="table-scroll"><table class="fields"><thead><tr><th>Field</th><th>Type & details</th></tr></thead><tbody>' + "".join(body) + '</tbody></table></div>'

    cards = []
    for path, operations in schema["paths"].items():
        method, operation = next(iter(operations.items()))
        anchor = operation["operationId"]
        parameters = operation.get("parameters", [])
        sections = []
        for location in ("path", "query"):
            fields = {p["name"]: p["schema"] for p in parameters if p["in"] == location}
            if fields:
                sections.append(f'<h4>{location.title()} parameters</h4>' + rows(fields, {p["name"] for p in parameters if p.get("required")}))
        request = operation.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
        if request:
            body = resolve(request)
            sections.append('<h4>JSON request body</h4>' + rows(body["properties"], body.get("required", [])))
            sections.append('<p class="mini-label">lesson_id is a legacy alias for course_id; send only one. Unknown top-level fields are rejected.</p>')
        response = resolve(operation["responses"]["200"]["content"]["application/json"]["schema"])
        sample = escape(json.dumps(EXAMPLES[path], ensure_ascii=False, indent=2))
        query = "?limit=25&offset=0" if path == "/courses" else ""
        example_path = path.replace("{course_id}", "YOUR_COURSE_ID").replace("{source_id}", "YOUR_SOURCE_ID")
        curl = f'curl "{base}{example_path}{query}" \\\n  -H "Authorization: Bearer $YAQIN_ACCESS_TOKEN"'
        if method == "post":
            curl += ' \\\n  -H "Content-Type: application/json" \\\n  -d \'{"question":"What is wudu?","lang":"en"}\''
        cards.append(f'<article class="endpoint" id="{escape(anchor)}"><div class="endpoint-title">'
                     f'<span class="method {method}">{method.upper()}</span><code>{escape(path)}</code></div>'
                     f'<h3>{escape(operation["summary"])}</h3><p class="endpoint-meta">Bearer token required · JSON · HTTP 200 on success</p>'
                     f'<div class="code-wrap"><pre><code>{escape(curl)}</code></pre><button class="copy" type="button" aria-live="polite">Copy</button></div>'
                     + "".join(sections) + '<details class="response-fields"><summary>Response fields · ' + escape(response["title"])
                     + '</summary>' + rows(response["properties"], response.get("required", [])) + '</details>'
                     + '<details><summary>Illustrative JSON response</summary><pre><code>' + sample + '</code></pre></details>'
                     + f'<a class="reference-link" href="{escape(technical_base or base)}/reference#tag/{escape(operation["tags"][0])}/operation/{escape(anchor)}">Full nested schemas & error responses ↗</a></article>')
    template = (ROOT / "docs" / "developer-guide-template.html").read_text()
    replacements = {"__ENDPOINTS__": "".join(cards), "__BASE__": escape(base),
                    "__AUTH_URL__": escape(auth_url), "__PUBLIC_KEY__": escape(public_key),
                    "__VERSION__": escape(schema["info"]["version"]), "__TECH_BASE__": escape(technical_base or base)}
    for name, value in replacements.items():
        template = template.replace(name, value)
    return template
