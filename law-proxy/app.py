import os

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS


LAW_OPEN_API_BASE_URL = "https://www.law.go.kr/DRF/lawSearch.do"

app = Flask(__name__)
CORS(app)


def normalize_string(value):
    return value.strip() if isinstance(value, str) else ""


@app.get("/api/law-test")
def law_test():
    query = normalize_string(request.args.get("query")) or "자동차관리법"
    target = normalize_string(request.args.get("target")) or "eflaw"
    api_key = normalize_string(os.environ.get("LAW_OPEN_API_KEY"))

    if not api_key:
        return jsonify(
            {
                "status": 500,
                "message": "LAW_OPEN_API_KEY is not set",
                "bodyPreview": None,
            }
        ), 500

    try:
        response = requests.get(
            LAW_OPEN_API_BASE_URL,
            params={
                "OC": api_key,
                "target": target,
                "query": query,
            },
            timeout=20,
        )
        body_preview = response.text[:500] if response.text else ""

        if response.ok:
            return jsonify(
                {
                    "status": response.status_code,
                    "query": query,
                    "target": target,
                    "bodyPreview": body_preview,
                }
            ), response.status_code

        return jsonify(
            {
                "status": response.status_code,
                "message": f"law.go.kr request failed: HTTP {response.status_code}",
                "bodyPreview": body_preview,
            }
        ), response.status_code
    except requests.RequestException as error:
        body_preview = ""

        if getattr(error, "response", None) is not None and error.response.text:
            body_preview = error.response.text[:500]

        return jsonify(
            {
                "status": 502,
                "message": f"law.go.kr request failed: {error}",
                "bodyPreview": body_preview or None,
            }
        ), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
