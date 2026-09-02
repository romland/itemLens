FROM python:3.11-slim-bullseye

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "rembg[cpu]"

EXPOSE 7000

ENTRYPOINT ["rembg"]
CMD ["s", "--no-ui"]