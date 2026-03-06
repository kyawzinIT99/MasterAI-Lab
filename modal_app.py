"""
Modal deployment for AIMastery Lab static website.
Modal v1.3.x API: static files baked into image, OpenAI proxied server-side.

Setup: add your OpenAI key as a Modal secret once:
  modal secret create openai-key OPENAI_API_KEY=sk-your-new-key-here
"""

import modal
from pathlib import Path

app = modal.App("main")

SITE_ROOT = Path(__file__).parent

image = (
    modal.Image.debian_slim()
    .pip_install("fastapi[standard]", "aiofiles", "httpx")
    .add_local_dir(str(SITE_ROOT / "css"),    remote_path="/site/css")
    .add_local_dir(str(SITE_ROOT / "js"),     remote_path="/site/js")
    .add_local_dir(str(SITE_ROOT / "frames"), remote_path="/site/frames")
    .add_local_dir(str(SITE_ROOT / "data"),   remote_path="/site/data")
    .add_local_file(str(SITE_ROOT / "index.html"), remote_path="/site/index.html")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("openai-key")],
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def web():
    import os
    import httpx
    from fastapi import FastAPI, Request
    from fastapi.responses import FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles

    api = FastAPI()

    # --- Static asset routes ---
    api.mount("/css",    StaticFiles(directory="/site/css"),    name="css")
    api.mount("/js",     StaticFiles(directory="/site/js"),     name="js")
    api.mount("/frames", StaticFiles(directory="/site/frames"), name="frames")
    api.mount("/data",   StaticFiles(directory="/site/data"),   name="data")

    # --- OpenAI proxy: keeps the key server-side, never exposed to browsers ---
    @api.post("/api/chat")
    async def chat_proxy(request: Request):
        body = await request.json()
        openai_key = os.environ.get("OPENAI_API_KEY", "")
        if not openai_key:
            return JSONResponse({"error": "API key not configured"}, status_code=500)

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openai_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        return JSONResponse(resp.json(), status_code=resp.status_code)

    # --- SPA fallback: serve index.html for all other routes ---
    @api.get("/")
    @api.get("/{full_path:path}")
    async def catch_all(full_path: str = ""):
        return FileResponse("/site/index.html")

    return api
