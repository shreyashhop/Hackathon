FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Create base data directory
RUN mkdir -p /data

EXPOSE 8000

# Use sh to expand the dynamic NODE_PORT env variable
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${NODE_PORT:-8000}"]
