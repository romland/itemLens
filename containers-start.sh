#!/bin/bash

# OLD
# # Run on Ubuntu VM
# sudo /etc/init.d/docker start
# cd ~/singlefile-downloader/SingleFile-dockerized && sudo docker compose up -d
# cd ~/PaddleOCRFastAPI && sudo docker compose up -d
# #sudo docker run -d --network host danielgatis/rembg s --port 7000
# sudo docker run -d -p 7000:7000 danielgatis/rembg s

npm run services:up
