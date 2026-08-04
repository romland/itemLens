import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import fs from 'fs';
import path from 'path';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface ImageAnalysisResult {
  photoType: 'product' | 'invoice' | 'information' | 'other';
  subCategory: string;
  isNewCategory: boolean;
  description: string;
}

export async function analyzePhoto(
  localFilePath: string,
  existingCategories: string[] = []
): Promise<ImageAnalysisResult> {
  const fileBuffer = fs.readFileSync(localFilePath);
  const base64Data = fileBuffer.toString('base64');
  
  const ext = path.extname(localFilePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';

  const promptText = `
    Analyze this image for a home inventory system.

    EXISTING SUB-CATEGORIES IN DATABASE:
    ${JSON.stringify(existingCategories)}

    TASKS:
    1. photoType: Identify if this photo is a 'product' (physical item), 'invoice' (receipt/bill), 'information' (pinout/diagram/spec sheet), or 'other'.
    2. subCategory: Assign a sub-category. 
       - CRITICAL: If the image fits ANY string in EXISTING SUB-CATEGORIES, you MUST reuse that exact string.
       - If none fit, create a new standardized short lowercase string (e.g., 'power_tool', 't_shirt', 'circuit_board').
    3. isNewCategory: Set to true ONLY if you created a subCategory not in the existing list.
    4. description: A brief visual summary of the image.
  `;

  const response = await ai.models.generateContent({
    // model: 'gemini-2.5-flash',
    model: 'gemini-3.1-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          photoType: { 
            type: 'string', 
            enum: ['product', 'invoice', 'information', 'other'],
            description: 'Type of photo' 
          },
          subCategory: { 
            type: 'string', 
            description: 'Fine-grained sub-category' 
          },
          isNewCategory: { 
            type: 'boolean', 
            description: 'True if subCategory was created new' 
          },
          description: { 
            type: 'string', 
            description: 'Brief visual summary' 
          }
        },
        required: ['photoType', 'subCategory', 'isNewCategory', 'description']
      }
    }
  });

  return JSON.parse(response.text!);
}