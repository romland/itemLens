#!/bin/bash

# Run on Ubuntu VM
sudo /etc/init.d/docker start
cd ~/singlefile-downloader/SingleFile-dockerized && sudo docker compose up -d
cd ~/PaddleOCRFastAPI && sudo docker compose up -d
sudo docker run -d -p 7000:7000 danielgatis/rembg s
