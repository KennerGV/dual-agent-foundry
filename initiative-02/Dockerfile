FROM python:3.12-slim

# Prevent Python from writing pyc files to disk and buffering stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Install project dependencies during docker build stage
RUN pip install --no-cache-dir \
    "pydantic>=2.0.0" \
    "fastapi>=0.100.0" \
    "uvicorn>=0.20.0" \
    "pytest>=8.0.0" \
    "pytest-asyncio>=0.23.0" \
    "httpx>=0.27.0"

# Copy initiative-02 project files
COPY . /app/

# Execute pytest without network access at container runtime
CMD ["pytest"]
