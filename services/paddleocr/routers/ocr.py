# -*- coding: utf-8 -*-

import os
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
os.environ["OMP_WAIT_POLICY"] = "PASSIVE"
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, status
from models.OCRModel import *
from models.RestfulModel import *
from paddleocr import PaddleOCR
from utils.ImageHelper import base64_to_ndarray, bytes_to_ndarray
import requests

router = APIRouter(prefix="/ocr", tags=["OCR"])

ocr = PaddleOCR(lang="ch", device="cpu", enable_mkldnn=False)


def format_ocr_result(result):
    """Extracts bounding boxes, text, and confidence scores into lightweight legacy tuples,

    stripping heavy raw image matrices (input_img, page_img) to prevent Node.js OOM crashes.
    """
    if not result:
        return []

    cleaned_pages = []
    pages = result if isinstance(result, list) else [result]

    for page in pages:
        if page is None:
            continue

        page_lines = []

        # Extract from PaddleOCR 3.x / PaddleX OCRResult object or dict
        dt_polys = getattr(page, "dt_polys", None) or (page.get("dt_polys") if isinstance(page, dict) else None)
        rec_text = getattr(page, "rec_text", None) or (page.get("rec_text") if isinstance(page, dict) else None)
        rec_score = getattr(page, "rec_score", None) or (page.get("rec_score") if isinstance(page, dict) else None)

        if dt_polys is not None and rec_text is not None:
            scores = rec_score if rec_score is not None else [1.0] * len(rec_text)
            for poly, text, score in zip(dt_polys, rec_text, scores):
                box = poly.tolist() if isinstance(poly, np.ndarray) else poly
                s = float(score) if isinstance(score, (np.floating, float)) else float(score)
                page_lines.append([box, (str(text), s)])
            cleaned_pages.append(page_lines)
            continue

        # Fallback for standard list-of-lines structure
        if isinstance(page, list):
            for line in page:
                if isinstance(line, (list, tuple)) and len(line) >= 2:
                    box, text_info = line[0], line[1]
                    box_clean = box.tolist() if isinstance(box, np.ndarray) else box
                    if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                        txt, score = text_info[0], text_info[1]
                        score_clean = float(score) if isinstance(score, (np.floating, float)) else score
                        page_lines.append([box_clean, (str(txt), score_clean)])
                    else:
                        page_lines.append([box_clean, str(text_info)])
            cleaned_pages.append(page_lines)

    return cleaned_pages


@router.get('/predict-by-path', response_model=RestfulModel, summary="识别本地图片")
def predict_by_path(image_path: str):
    result = ocr.ocr(image_path)
    restfulModel = RestfulModel(
        resultcode=200, message="Success", data=format_ocr_result(result), cls=OCRModel)
    return restfulModel


@router.post('/predict-by-base64', response_model=RestfulModel, summary="识别 Base64 数据")
def predict_by_base64(base64model: Base64PostModel):
    img = base64_to_ndarray(base64model.base64_str)
    result = ocr.ocr(img=img)
    restfulModel = RestfulModel(
        resultcode=200, message="Success", data=format_ocr_result(result), cls=OCRModel)
    return restfulModel


@router.post('/predict-by-file', response_model=RestfulModel, summary="识别上传文件")
async def predict_by_file(file: UploadFile):
    restfulModel: RestfulModel = RestfulModel()
    if file.filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        restfulModel.resultcode = 200
        restfulModel.message = file.filename
        file_data = file.file
        file_bytes = file_data.read()
        img = bytes_to_ndarray(file_bytes)
        result = ocr.ocr(img=img)
        restfulModel.data = format_ocr_result(result)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .jpg 或 .png 格式图片"
        )
    return restfulModel


@router.get('/predict-by-url', response_model=RestfulModel, summary="识别图片 URL")
async def predict_by_url(imageUrl: str):
    restfulModel: RestfulModel = RestfulModel()
    try:
        response = requests.get(imageUrl, verify=False, timeout=10)
        response.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    image_bytes = response.content
    if image_bytes.startswith(b"\xff\xd8\xff") or image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        restfulModel.resultcode = 200
        img = bytes_to_ndarray(image_bytes)
        result = ocr.ocr(img=img)
        restfulModel.data = format_ocr_result(result)
        restfulModel.message = "Success"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="请上传 .jpg 或 .png 格式图片"
        )
    return restfulModel