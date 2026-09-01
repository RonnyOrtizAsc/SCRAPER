import os
from urllib.parse import urlparse, parse_qs

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Carga las variables definidas en un archivo .env (en la misma carpeta
# que este archivo) hacia el entorno, para no tener que escribir
# "set APIFY_API_TOKEN=..." cada vez que abres una terminal nueva.
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================
# CONFIG
# =========================================

# Crea una cuenta gratis en https://apify.com, genera un token en
# Settings > Integrations, y ponlo en un archivo ".env" (en esta misma
# carpeta, junto a main.py) con este contenido:
#
#   APIFY_API_TOKEN=tu_token_aqui
#
# El archivo .env NUNCA se sube a git (ya está en .gitignore).
# Usa .env.example como referencia de qué variable crear.
APIFY_API_TOKEN = os.environ.get("APIFY_API_TOKEN")

APIFY_BASE_URL = "https://api.apify.com/v2/acts"

# IDs de los actores (formato usuario~nombre-actor para la URL de la API)
TIKTOK_ACTOR_ID = "clockworks~tiktok-scraper"
INSTAGRAM_ACTOR_ID = "apify~instagram-search-scraper"

DEFAULT_RESULTS = 10
MAX_RESULTS_ALLOWED = 30


@app.get("/")
def home():
    return {
        "message": "ORBE Research Backend funcionando",
        "apify_token_configurado": bool(APIFY_API_TOKEN),
    }


# =========================================
# HELPERS
# =========================================

def detect_platform(url: str) -> str:
    if "tiktok.com" in url:
        return "tiktok"
    if "instagram.com" in url:
        return "instagram"
    raise HTTPException(
        status_code=400,
        detail="La URL debe ser de TikTok o Instagram."
    )


def extract_search_query(url: str) -> str:
    """
    Extrae la palabra clave de una URL de búsqueda,
    ej: tiktok.com/search?q=sketches -> "sketches"
    Si no encuentra un parámetro de búsqueda, usa la
    última parte del path como fallback (ej: hashtags).
    """
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)

    for key in ("q", "query", "search"):
        if key in query_params and query_params[key]:
            return query_params[key][0]

    # Fallback: usar el último segmento del path
    # (útil para URLs de hashtag tipo /tag/sketches)
    path_parts = [p for p in parsed.path.split("/") if p]
    if path_parts:
        return path_parts[-1].lstrip("#")

    raise HTTPException(
        status_code=400,
        detail="No se pudo extraer una palabra clave de esa URL."
    )


def call_apify_actor(actor_id: str, run_input: dict) -> list:
    """
    Llama a un actor de Apify de forma síncrona y devuelve
    directamente los items del dataset resultante.
    """
    if not APIFY_API_TOKEN:
        raise HTTPException(
            status_code=500,
            detail=(
                "Falta configurar APIFY_API_TOKEN en el servidor. "
                "Revisa el comentario en main.py sobre cómo setearlo."
            )
        )

    endpoint = f"{APIFY_BASE_URL}/{actor_id}/run-sync-get-dataset-items"

    try:
        response = requests.post(
            endpoint,
            params={"token": APIFY_API_TOKEN},
            json=run_input,
            timeout=120,  # el scraping puede tardar; ajusta si hace falta
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo conectar con Apify: {exc}"
        )

    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Apify respondió con error: {response.status_code} {response.text[:300]}"
        )

    return response.json()


# =========================================
# MAPEO A LA FORMA QUE ESPERA EL FRONTEND
# =========================================

def map_tiktok_item(item: dict) -> dict:
    """
    OJO: los nombres de campo de abajo (item.get("...")) son los
    típicos del actor clockworks/tiktok-scraper, pero confírmalos
    en Apify Console > tu actor > pestaña "API" > snippet de ejemplo,
    ya que pueden cambiar de versión a versión.
    """
    return {
        "id": item.get("id") or item.get("webVideoUrl"),
        "title": item.get("text") or "Sin título",
        "account": "@" + (item.get("authorMeta", {}).get("name") or "usuario"),
        "source": item.get("webVideoUrl", ""),
        "views": item.get("playCount", 0),
        "likes": item.get("diggCount", 0),
        "comments": item.get("commentCount", 0),
        "shares": item.get("shareCount", 0),
        "saves": item.get("collectCount", 0),
    }


def map_instagram_item(item: dict) -> dict:
    """
    OJO: igual que arriba, confirma los nombres de campo reales
    del actor apify/instagram-search-scraper (o el que elijas)
    en la pestaña "API" de Apify Console.
    """
    return {
        "id": item.get("id") or item.get("url"),
        "title": item.get("caption") or "Sin título",
        "account": "@" + (item.get("ownerUsername") or "usuario"),
        "source": item.get("url", ""),
        "views": item.get("videoViewCount", 0) or item.get("videoPlayCount", 0),
        "likes": item.get("likesCount", 0),
        "comments": item.get("commentsCount", 0),
        "shares": 0,  # Instagram no siempre expone shares públicamente
        "saves": 0,   # tampoco expone saves en la mayoría de scrapers públicos
    }


# =========================================
# SEARCH ENDPOINT
# =========================================

@app.get("/search")
def search(
    url: str,
    max_results: int = Query(DEFAULT_RESULTS, ge=1, le=MAX_RESULTS_ALLOWED),
):

    platform = detect_platform(url)
    query = extract_search_query(url)

    if platform == "tiktok":

        # Revisa el input schema real del actor en Apify Console
        # antes de confiar en estos nombres de campo.
        run_input = {
            "searchQueries": [query],
            "resultsPerPage": max_results,
            "searchSection": "/video",
        }

        raw_items = call_apify_actor(TIKTOK_ACTOR_ID, run_input)
        videos = [map_tiktok_item(item) for item in raw_items[:max_results]]

    else:  # instagram

        run_input = {
            "search": query,
            "searchType": "hashtag",
            "searchLimit": max_results,
        }

        raw_items = call_apify_actor(INSTAGRAM_ACTOR_ID, run_input)
        videos = [map_instagram_item(item) for item in raw_items[:max_results]]

    return {
        "success": True,
        "url_received": url,
        "query": query,
        "platform": platform,
        "videos": videos,
    }
