import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY } from '$env/static/private';
import fs from 'fs';
import path from 'path';
import { withRetry } from './retry';

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

export interface ImageAnalysisResult {
  photoType: 'product' | 'invoice' | 'information' | 'other';
  subCategory: string;
  isNewCategory: boolean;
  title: string;
  subtitle?: string;
  description?: string;
  extractedAttributes?: Record<string, string | null>;
  searchSynonyms?: string[];
}

export async function analyzePhoto(
  localFilePath: string,
  existingCategories: string[] = [],
  allowNewCategories: boolean = true,
  templateFields: any[] = []
): Promise<ImageAnalysisResult> {
  const fileBuffer = fs.readFileSync(localFilePath);
  const base64Data = fileBuffer.toString('base64');
  
  const ext = path.extname(localFilePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';

  // Convert DB fields to a schema description for Gemini
  let schemaPrompt = '';
  let schemaObj: any = {};
  
  const visibleFields = templateFields.filter(f => f.extractionMethod !== 'HUMAN_REQUIRED');
  const hasSchema = visibleFields.length > 0;

  let promptText = '';
  const properties: any = {
    photoType: { type: 'string', enum: ['product', 'invoice', 'information', 'other'], description: 'Type of photo' },
    title: { type: 'string', description: 'Concise product title' },
    subCategory: { type: 'string', description: 'Fine-grained sub-category' },
    isNewCategory: { type: 'boolean', description: 'True if subCategory was created new' },
    searchSynonyms: { type: 'array', items: { type: 'string' } },
    foregroundBox: { type: 'array', items: { type: 'number' }, description: 'Bounding box [ymin, xmin, ymax, xmax] normalized 0-1000 for the primary foreground object. Ignore background clutter.' }
  };
  const required = ['photoType', 'title', 'subCategory', 'isNewCategory', 'searchSynonyms', 'foregroundBox'];

  if (hasSchema) {
      schemaPrompt = `6. extractedAttributes: You MUST extract these exact fields. Use provided enums where applicable. If entirely hidden, missing, or unknown, output null (do NOT use "unknown", "n/a", or "none"). Comma-separate values if multiple apply (e.g., 50/50 striped shirts should be "Red, White").\n`;
      for (const field of visibleFields) {
          schemaObj[field.name] = { type: field.type === 'number' ? 'number' : 'string', nullable: true };
          if (field.options) schemaPrompt += `- ${field.name} (Enum: ${field.options.join(', ')} - Pick closest, or invent a new Title Case term ONLY if fundamentally different)\n`;
          else schemaPrompt += `- ${field.name} (${field.uiLabel})\n`;
      }

    promptText = `Analyze this image for a home inventory system.
    EXISTING SUB-CATEGORIES IN DATABASE: ${JSON.stringify(existingCategories)}
    
    CRITICAL GROUNDING RULES:
    - YOU ARE A STRICT VISUAL EXTRACTOR.
    - ISOLATE THE PRIMARY FOREGROUND OBJECT. Completely ignore background clutter (like workbenches, tables, soldering irons, hands, etc.).
    - IF YOU CANNOT SEE IT PRINTED OR PHYSICALLY PRESENT IN THE IMAGE, DO NOT INFER IT.
    - NEVER write plot summaries, historical context, or fun facts.

    TASKS:
    1. photoType: Identify if this photo is a 'product' (physical item), 'invoice' (receipt/bill), 'information' (pinout/diagram/spec sheet), or 'other'.
    2. title: Identify this product. Return a concise 'title' for it.
    3. subCategory: Assign a sub-category. ${allowNewCategories ? "Reuse from list or create a NEW STRICTLY SINGULAR noun (e.g. 'shirt', not 'shirts'). Use standard retail-level specificity (e.g. 't-shirt' or 'cardigan'). NEVER output a broad macro-category like 'clothing', 'electronics', or 'tools'." : "MUST pick exactly from list."}
    4. isNewCategory: Set to true ONLY if you created a subCategory not in the list.
    5. description: A brief visual physical description of the item.
    ${schemaPrompt}
    7. searchSynonyms: An array of 3-5 broad synonyms/hypernyms for the object.
    8. foregroundBox: Provide the bounding box of the isolated primary object.`;

    properties.description = { type: 'string', description: 'Brief visual description' };
    properties.extractedAttributes = { type: 'object', properties: schemaObj, required: visibleFields.map(f => f.name) };
    required.push('description', 'extractedAttributes');
  } else {
    promptText = `Analyze this image for a home inventory system.
    EXISTING SUB-CATEGORIES IN DATABASE: ${JSON.stringify(existingCategories)}
    
    CRITICAL GROUNDING RULES:
    - YOU ARE A STRICT VISUAL EXTRACTOR.
    - ISOLATE THE PRIMARY FOREGROUND OBJECT. Completely ignore background clutter (like workbenches, tables, soldering irons, hands, etc.).
    - IF YOU CANNOT SEE IT PRINTED OR PHYSICALLY PRESENT IN THE IMAGE, DO NOT INFER IT.
    - NEVER write plot summaries, historical context, or fun facts.

    TASKS:
    1. photoType: Identify if this photo is a 'product', 'invoice', 'information', or 'other'.
    2. title: Identify this product. Return the actual name of the work itself (Book Title, Album Name, Product Name) based strictly on visible text. NEVER put the creator here.
    3. subtitle: Identify the creator (Author, Band/Artist, Maker, Brand). NEVER put the main work title here. DO NOT write a description or plot summary. Just literal secondary text.
    4. subCategory: Assign a sub-category. ${allowNewCategories ? "Reuse from list or create a NEW STRICTLY SINGULAR noun (e.g. 'book', not 'books'). Use standard retail-level specificity. NEVER output a broad macro-category like 'media', 'clothing', or 'hardware'." : "MUST pick exactly from list."}
    5. isNewCategory: Set to true ONLY if you created a subCategory not in the list.
    6. searchSynonyms: An array of 3-5 broad synonyms/hypernyms for the object.
    7. foregroundBox: Provide the bounding box of the isolated primary object.`;

    properties.subtitle = { type: 'string', description: 'Author, maker, or secondary text' };
  }

  const response = await withRetry(() => ai.models.generateContent({
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
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object', properties, required
      }
    }
  }), 3, 2000, 'Gemini Classification', { prompt: promptText, path: localFilePath });

  return JSON.parse(response.text!);
}

export async function guessProductDetails(localFilePath: string, hint: string = ""): Promise<{title: string, description: string}> {
  const fileBuffer = fs.readFileSync(localFilePath);
  const ext = path.extname(localFilePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

  let promptText = "Identify this product. Return a concise 'title' and a 1-2 sentence 'description'.";
  if (hint.trim() !== "") {
    promptText += `\n\nUSER HINT: "${hint}". You MUST use this hint to identify the exact product model or brand, overriding your default guess.`;
  }

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText },
          { inlineData: { mimeType, data: fileBuffer.toString('base64') } }
        ]
      }
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['title', 'description']
      }
    }
  }), 3, 2000, 'Product Details Guess', { prompt: promptText, path: localFilePath });

  return JSON.parse(response.text!);
}

export async function extractKVPsFromText(text: string): Promise<{ rows: string[][] }> {
  const promptText = `Extract tabular data, specifications, or key-value structures from the following messy text. 
Return the data as a 2D array of strings ('rows'), where each row represents an item or property line, and columns represent distinct data fields (e.g., Attribute, Value, Units, etc.). 
If it is a simple list of attributes, structure each row with 2 columns: [Attribute, Value].

TEXT:
${text}`;

  const response = await withRetry(() => ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: [
      {
        role: 'user',
        parts: [
          { text: promptText }
        ]
      }
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        required: ['rows']
      }
    }
  }), 3, 2000, 'KVP Extraction', { prompt: promptText });

  return JSON.parse(response.text!);
}