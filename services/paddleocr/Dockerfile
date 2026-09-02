FROM python:3.11-slim-bullseye

EXPOSE 8000
WORKDIR /app

# Install system dependencies for PaddleOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    patch \
    gcc \
    g++ \
    make \
    python3-dev \
    swig \
 && rm -rf /var/lib/apt/lists/*

# Install Python requirements (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . /app

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]