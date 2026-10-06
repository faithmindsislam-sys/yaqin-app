"""Run or debug the API directly from PyCharm or the terminal."""

import argparse

import uvicorn

from app.configuration.settings import API_DIR, get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Yaqin API")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--reload", action="store_true", help="Restart when backend code changes (local only)")
    args = parser.parse_args()
    if args.reload and get_settings().env != "local":
        parser.error("--reload is only available with ENV=local")
    uvicorn.run(
        "app.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(API_DIR / "app")] if args.reload else None,
    )


if __name__ == "__main__":
    main()
