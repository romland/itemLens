import fetch from 'node-fetch';

export async function getOCRdata(imageUrl : string, callback)
{
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
    console.log('OCR Error:', error.message);
    callback(error.message, null);
  }
}
