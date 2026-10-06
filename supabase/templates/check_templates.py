"""Run with python3 check_templates.py; no network or email delivery required."""
import json
import re
from html.parser import HTMLParser
from pathlib import Path

root = Path(__file__).parent
templates = json.loads((root / "templates.json").read_text())["templates"]
variables = {
    "CONFIRMATION_URL": ".ConfirmationURL", "SITE_URL": ".SiteURL", "TOKEN": ".Token",
    "NEW_EMAIL": ".NewEmail", "OLD_EMAIL": ".OldEmail", "ACCOUNT_EMAIL": ".Email",
    "OLD_PHONE": ".OldPhone", "PHONE": ".Phone", "PROVIDER": ".Provider", "FACTOR_TYPE": ".FactorType",
}


class Email(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img":
            self.images.append(attrs)
        if tag == "a":
            self.links.append(attrs["href"])


for folder, payload in [(root, "supabase-auth-draft.json"), (root / "localized", "supabase-auth.json")]:
    config = json.loads((folder / payload).read_text())
    assert len(config) == 26
    for template in templates:
        slot = template["supabaseTemplate"]
        if folder != root and slot is None:
            continue
        path = folder / (template["file"] if folder == root else slot + ".html")
        source = path.read_text()
        expected = {variables[v["key"]] for v in template["variables"]}
        assert set(re.findall(r"{{ (\.\w+) }}", source)) == expected, path
        assert "#0b2450" in source and "#2563eb" in source and "#f3f7ff" in source, path
        assert not any(c in source for c in ["#173d3d", "#0d696b", "#fafaf7"]), path
        if slot:
            assert source == config[f"mailer_templates_{slot}_content"], path
        for lang in ["en", "ar"]:
            rendered = re.sub(r'{{ if eq \.Data.lang "ar" }}(.*?){{ else }}(.*?){{ end }}',
                              lambda m: m[1 if lang == "ar" else 2], source, flags=re.S)
            assert "{{ if" not in rendered and "{{ else" not in rendered and "{{ end" not in rendered, path
            email = Email()
            email.feed(rendered)
            assert len(email.images) == 1 and email.images[0]["src"] == "https://app.yaqeenguide.com/icon.png", path
            assert email.images[0]["alt"] and email.images[0]["width"] == "52", path
            if ".ConfirmationURL" in expected:
                assert email.links.count("{{ .ConfirmationURL }}") == (4 if folder == root else 2), path
            if folder != root:
                assert f'<html lang="{lang}" dir="{"rtl" if lang == "ar" else "ltr"}">' in rendered, path

preview = (root / "preview.html").read_text()
samples = json.loads(re.search(r'<script type="application/json" id="data">(.*?)</script>', preview, re.S)[1])
assert len(samples) == 40
for sample in samples:
    assert "{{" not in sample["html"]
    email = Email()
    email.feed(sample["html"])
    assert all(link == "#" for link in email.links)
print("PASS: 27 templates, 26 locale renders, payload consistency, auth variables, public icon, and 40 safe previews.")
