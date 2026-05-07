import os

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS


LAW_OPEN_API_BASE_URL = "https://www.law.go.kr/DRF/lawSearch.do"

app = Flask(__name__)
CORS(app)


def normalize_string(value):
    return value.strip() if isinstance(value, str) else ""


def normalize_boolean(value):
    return normalize_string(value).lower() in {"1", "true", "yes", "on"}


def mask_key(value):
    normalized = normalize_string(value)

    if not normalized:
        return ""

    if len(normalized) <= 4:
        return f"{normalized[:1]}***{normalized[-1:]}"

    return f"{normalized[:2]}***{normalized[-2:]}"


def mask_oc_in_url(prepared_url, api_key):
    return prepared_url.replace(api_key, mask_key(api_key))


def run_test_case(api_key, params):
    response = requests.get(
        LAW_OPEN_API_BASE_URL,
        params={
            "OC": api_key,
            **params,
        },
        timeout=20,
    )
    prepared = response.request.url if response.request else LAW_OPEN_API_BASE_URL
    body_preview = response.text[:300] if response.text else ""

    return {
        "status": response.status_code,
        "requestUrl": mask_oc_in_url(prepared, api_key),
        "bodyPreview": body_preview,
        "ok": response.ok,
        "params": params,
    }


@app.get("/api/law-test")
def law_test():
    query = normalize_string(request.args.get("query")) or "자동차관리법"
    target = normalize_string(request.args.get("target")) or "eflaw"
    debug = normalize_boolean(request.args.get("debug"))
    api_key = normalize_string(os.environ.get("LAW_OPEN_API_KEY"))

    if not api_key:
        return jsonify(
            {
                "status": 500,
                "message": "LAW_OPEN_API_KEY is not set",
                "bodyPreview": None,
            }
        ), 500

    test_cases = [
        {"target": target, "query": query},
        {"target": target, "type": "XML", "query": query},
        {"target": target, "type": "JSON", "query": query},
        {"target": target, "LM": query},
        {"target": target, "type": "JSON", "LM": query},
    ]

    try:
        results = [run_test_case(api_key, params) for params in test_cases]
        first_success = next((result for result in results if result["ok"]), None)

        if first_success:
            payload = {
                "status": first_success["status"],
                "query": query,
                "target": target,
                "bodyPreview": first_success["bodyPreview"],
            }

            if debug:
                payload["debug"] = [
                    {
                        "requestUrl": result["requestUrl"],
                        "httpStatus": result["status"],
                        "bodyPreview": result["bodyPreview"],
                    }
                    for result in results
                ]

            return jsonify(payload), first_success["status"]

        payload = {
            "status": 502,
            "message": "No law.go.kr parameter combination returned a successful response",
            "bodyPreview": results[-1]["bodyPreview"] if results else None,
        }

        if debug:
            payload["debug"] = [
                {
                    "requestUrl": result["requestUrl"],
                    "httpStatus": result["status"],
                    "bodyPreview": result["bodyPreview"],
                }
                for result in results
            ]

        return jsonify(payload), 502
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
