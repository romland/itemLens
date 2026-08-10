import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';
import { lightMlQueue } from './queue/index';

export async function getOCRdata(imageUrl : string): Promise<any>
{
  return lightMlQueue.add(async () => {
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
          return result;
        } else {
          console.log('OCR Error:', response.statusText, response);
          throw new Error(response.statusText);
        }
      } catch (error) {
        const err = error as Error;
        console.log('OCR Error:', err.message);
        throw err;
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
        return result;
      } else {
        console.log('OCR Error:', response.statusText, response);
        throw new Error(response.statusText);
      }
    } catch (error) {
      const err = error as Error;
      console.log('OCR Error:', err.message);
      throw err;
    }
  });
}
