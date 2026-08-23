FROM python:3.11-slim-bookworm

EXPOSE 8000
WORKDIR /app
COPY . /app

# Debian 12 uses debian.sources instead of sources.list
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources

# Install system dependencies for PaddleOCR
RUN apt-get update && apt-get install -y \
    libgl1 libgomp1 libglib2.0-0 libsm6 libxrender1 libxext6 patch gcc g++ make python3-dev swig \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

    
# pip換源并安装python依赖
RUN python3 -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple --upgrade pip
RUN pip3 config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip3 install -r requirements.txt

CMD ["uvicorn", "main:app", "--host", "0.0.0.0"]