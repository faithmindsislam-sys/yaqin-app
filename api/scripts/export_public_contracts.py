"""Export public HTTP/MCP schemas and the HTML guide; --check detects documentation drift."""

import argparse
import asyncio
import json
from types import SimpleNamespace

from app.configuration.settings import ROOT, Settings
from app.controllers.mcp_controller import create_mcp
from app.http.developer_docs import render_developer_docs
from app.main import create_app


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    application = create_app()
    public_api = next(route.app for route in application.routes if getattr(route, "path", None) == "/api/v1")
    server, _ = create_mcp(SimpleNamespace(), Settings(_env_file=None,
                          mcp_resource_url="https://public-api.yaqeenguide.com/api/v1/mcp/"))
    outputs = {
        "openapi-v1.json": public_api.openapi(),
        "mcp-tools-v1.json": {"version": "1.0.0", "tools": [tool.model_dump(mode="json", by_alias=True, exclude_none=True)
                                                              for tool in await server.list_tools()]},
    }
    failed = False
    for name, schema in outputs.items():
        path = ROOT / "docs" / name
        text = json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        if args.check:
            if not path.exists() or path.read_text() != text:
                print(f"Outdated public contract: {path.name}; run python -m scripts.export_public_contracts")
                failed = True
        else:
            path.write_text(text)
            print(f"Exported {path.name}")
    html_path = ROOT / "docs" / "public-api-v1.html"
    html = render_developer_docs(public_api.openapi())
    if args.check:
        if not html_path.exists() or html_path.read_text() != html:
            print(f"Outdated developer guide: {html_path.name}; run python -m scripts.export_public_contracts")
            failed = True
    else:
        html_path.write_text(html)
        print(f"Exported {html_path.name}")
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
