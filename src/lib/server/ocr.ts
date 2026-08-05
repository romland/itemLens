import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

export async function getOCRdata(imageUrl : string, callback)
{
  let localPath = imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const parsedUrl = new URL(imageUrl);
      localPath = `static${parsedUrl.pathname}`;
    } catch (e) {}
  }

  if (fs.existsSync(localPath)) {
    const url = 'http://localhost:8000/ocr/predict-by-file';
    const form = new FormData();
    form.append('file', fs.createReadStream(localPath));
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        headers: form.getHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        console.log("OCR result", JSON.stringify(result));
        return callback(null, result);
      } else {
        console.log('OCR Error:', response.statusText, response);
        return callback(response.statusText, response);
      }
    } catch (error) {
      const err = error as Error;
      console.log('OCR Error:', err.message);
      return callback(err.message, null);
    }
  }
  
  const url = 'http://localhost:8000/ocr/predict-by-url';
  try {
    const response = await fetch(url + "?imageUrl=" + encodeURIComponent(imageUrl), {
      method: 'GET',
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log("OCR result", JSON.stringify(result));
      callback(null, result);
    } else {
      console.log('OCR Error:', response.statusText, response);
      callback(response.statusText, response);
    }
  } catch (error) {
    const err = error as Error;
    console.log('OCR Error:', err.message);
    callback(err.message, null);
  }
}
