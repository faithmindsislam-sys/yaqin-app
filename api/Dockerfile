FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 ENV=prod
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/api

COPY api/pyproject.toml api/README.md ./
# Dependencies first: this layer is reused from the build cache until pyproject.toml changes.
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
 && pip install -r /tmp/requirements.txt && rm /tmp/requirements.txt && useradd --create-home --uid 10001 app
COPY api/app ./app
COPY api/scripts ./scripts
COPY docs /srv/docs
RUN pip install --no-deps .
COPY content /srv/content
RUN rm -rf /srv/content/quran

ENV CONTENT_DIR=/srv/content
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
