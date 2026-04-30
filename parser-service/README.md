# ClauseIQ Parser Service

Python microservice for document extraction:

- DOCX tracked changes path (placeholder implementation)
- PDF text extraction fallback

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `POST /extract/docx-tracked`
- `POST /extract/docx-diff`
- `POST /extract/pdf-diff`
