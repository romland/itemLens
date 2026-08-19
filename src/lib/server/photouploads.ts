import fs from 'fs';
import { writeFileSync, promises as fsPromises } from "fs";
import fetch from 'node-fetch';
import FormData from 'form-data';

import { getOCRdata } from '$lib/server/ocr';
import { generatePhotoDerivatives } from '$lib/server/imageProcessor';
import { apiQueue, ioQueue } from '$lib/server/queue/index';
import { logActivity } from '$lib/server/logger';
import { db } from '$lib/server/database';
import { autoFill } from '$lib/server/autofill';
import { taskManager, type TaskContext } from '$lib/server/taskManager';
import sharp from 'sharp';

import type { Item, Photo } from '@prisma/client';
import slugify from 'slugify';
import QRUrlDownloader from "$lib/server/urldownloader";
// import { analyzePhoto } from '$lib/server/gemini-classification';
// import { getExistingCategoryNames, getOrCreateCategory } from '$lib/server/categories';

export async function enrichPhotoData(localPath: string, webPath: string, type: string, inventoryId: number, tracking?: TaskContext, skipLlm: boolean = false): Promise<any> {
	const tempPhoto = { id: -1, orgPath: webPath, type } as any;
	
	let exifDataJson: string | null = null;
	try {
		const vault = await db.inventory.findUnique({ where: { id: inventoryId }, select: { extractExif: true }});
		if (vault?.extractExif) {
			const metadata = await sharp(localPath).metadata();
			if (metadata.exif) {
				const exifReader = (await import('exif-reader')).default;
				const parsedExif = exifReader(metadata.exif);
				
				// Strip out thumbnails and huge proprietary binary blobs
				delete parsedExif.thumbnail;
				if (parsedExif.exif?.MakerNote) delete parsedExif.exif.MakerNote;
				if (parsedExif.exif?.UserComment) delete parsedExif.exif.UserComment;
				
				exifDataJson = JSON.stringify(parsedExif, (key, value) => {
					// Drop any remaining raw buffers or huge byte arrays
					if (Buffer.isBuffer(value) || (value && value.type === 'Buffer')) return undefined;
					if (Array.isArray(value) && value.length > 50 && typeof value[0] === 'number') return undefined;
					return value;
				});
			}
		}
	} catch(e) { console.error("[Background Task] EXIF extraction failed:", e); }
	
	const [ocrResult, imgUpdates] = await Promise.all([
		getOCRdata(localPath, tracking).catch(() => null),
		generatePhotoDerivatives(tempPhoto, localPath, true, tracking)
	]);
	
	let finalOrgPath = webPath;
	const isVideo = localPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i);
	if (!isVideo && !localPath.endsWith('.webp')) {
		const newLocalPath = localPath.replace(/\.[^/.]+$/, '.webp');
		const newWebPath = webPath.replace(/\.[^/.]+$/, '.webp');
		await sharp(localPath).webp({ quality: 85 }).toFile(newLocalPath);
		fs.unlinkSync(localPath);
		finalOrgPath = newWebPath;
		tempPhoto.orgPath = finalOrgPath;
	}
	
	let categoryName = null;
	let llmAnalysis = null;
	let extractedAttributes = null;
	
	if (!skipLlm && (type === 'product' || type === 'information' || type === 'other')) {
		try {
			const { analyzePhoto } = await import('$lib/server/gemini-classification');
			const { getExistingCategoryNames } = await import('$lib/server/categories');
			const { getActiveSchema } = await import('$lib/server/ontology');
			const existingCategories = await getExistingCategoryNames(inventoryId);
			const inv = await db.inventory.findUnique({ where: { id: inventoryId } });
			const allowNew = inv?.allowNewCategories ?? true;
			
			const activeSchema = await getActiveSchema(inventoryId, tempPhoto.categoryId);      
			const targetPath = imgUpdates.thumbPath ? `static${imgUpdates.thumbPath}` : tempPhoto.orgPath;
			const analysis = await apiQueue.add(
				() => analyzePhoto(targetPath, existingCategories, allowNew, activeSchema),
				tracking ? { ...tracking, description: 'Classifying image via ML' } : undefined
			);
			llmAnalysis = JSON.stringify(analysis);
			categoryName = analysis.subCategory;
			if (analysis.extractedAttributes) extractedAttributes = JSON.stringify(analysis.extractedAttributes);
			
			// Save the search synonyms instantly as tags
			if (analysis.searchSynonyms && tempPhoto.itemId) {
				const { getTagIds } = await import('$lib/server/services');
				const tagIds = await getTagIds(analysis.searchSynonyms.join(','), inventoryId);
				await db.item.update({ where: { id: tempPhoto.itemId }, data: { tags: { connect: tagIds } }});
			}
		} catch (e) { console.error("[Background Task] LLM classification failed:", e); }
	} else if (type === 'invoice or receipt') {
		try {
			const { extractInvoiceData } = await import('$lib/server/llm');
			if (ocrResult) llmAnalysis = await extractInvoiceData(ocrResult, tracking);
		} catch (e) { console.error("[Background Task] Invoice extraction failed:", e); }
	}
	
	return {
		ocr: ocrResult ? JSON.stringify(ocrResult) : null,
		colors: imgUpdates.colors,
		cropPath: imgUpdates.cropPath,
		thumbPath: imgUpdates.thumbPath,
		llmAnalysis,
		categoryName,
		orgPath: finalOrgPath,
		exifData: exifDataJson,
		extractedAttributes
	};
}

export async function processDraftPhotoBackground(webPath: string, type: string, inventoryId: number, precomputedAi?: any) {
	const tracking = { targetType: 'global' as const, targetId: 0 };
	const localPath = `static${webPath}`;
	const data = await enrichPhotoData(localPath, webPath, type, inventoryId, tracking, !!precomputedAi);
	
	if (precomputedAi) {
		data.llmAnalysis = JSON.stringify(precomputedAi);
		data.categoryName = precomputedAi.subCategory;
		data.extractedAttributes = precomputedAi.extractedAttributes ? JSON.stringify(precomputedAi.extractedAttributes) : null;
        data.title = precomputedAi.title;
        data.description = precomputedAi.description || precomputedAi.subtitle || null;
	}
	
	fs.writeFileSync(`${localPath}.json`, JSON.stringify(data), 'utf8');
	console.log(`[Background Task] Finished heavy processing for draft image: ${webPath}`);
}

export async function processItemPhotosBackground(item: any) {
	const taskId = taskManager.start('item', item.id, 'Analyzing photos');
	try {
		let itemNeedsTitleUpdate = item.title === "New Item" || item.title === "";
		for (const photo of item.photos) {
			if (!photo.orgPath) continue;
			
			if (photo.orgPath.match(/\.(mp4|webm|mov|ogg|mkv)$/i)) continue; // Bypass ML processing for videos
			
			if (photo.thumbPath && photo.ocr && photo.llmAnalysis) {
				console.log(`[Background Task] Skipping post-save ML for Photo ${photo.id}, pre-processed via draft.`);
				continue;
			}
			
			console.log(`[Background Task] Running post-save ML for Photo ${photo.id}`);
			await logActivity(item.id, 'Image Processing', `Started ML pipeline for photo ID ${photo.id}`);
			const webPath = photo.orgPath;
			const localPath = `static${webPath}`;
			const tracking = { targetType: 'item' as const, targetId: item.id };
			const skipLlm = !!photo.llmAnalysis; // Skip LLM if we already analyzed it (e.g. Bulk Import)
			
			const enriched = await enrichPhotoData(localPath, webPath, photo.type, item.inventoryId, tracking, skipLlm);
			
			if (enriched.ocr) await logActivity(item.id, 'OCR', `Successfully extracted text from photo ID ${photo.id}`, 'success');
			photo.orgPath = enriched.orgPath || photo.orgPath;
			if (enriched.colors) await logActivity(item.id, 'Colors', `Extracted color palette for photo ID ${photo.id}`, 'success');
			if (enriched.llmAnalysis) await logActivity(item.id, 'Analysis', `Identified as: ${enriched.categoryName || 'Unknown'}`, 'success');
			
			photo.ocr = enriched.ocr || photo.ocr;
			photo.colors = enriched.colors || photo.colors;
			photo.cropPath = enriched.cropPath || photo.cropPath;
			photo.thumbPath = enriched.thumbPath || photo.thumbPath;
			photo.llmAnalysis = enriched.llmAnalysis || photo.llmAnalysis;
			photo.exifData = enriched.exifData || photo.exifData;
			
			// Secondary auto-fill fallback: if sidecar logic somehow failed and it's still "New Item"
			// (Though our sidecar pre-computation now catches 99% of fast workflows)
			if (itemNeedsTitleUpdate && photo.type === 'product' && (enriched.orgPath || photo.orgPath)) {
				try {
                    let aiTitle = null;
                    let aiDesc = null;
                    
                    if (photo.llmAnalysis) {
                        const parsedAi = JSON.parse(photo.llmAnalysis);
                        aiTitle = parsedAi.title;
                        aiDesc = parsedAi.description || parsedAi.subtitle;
                    }
                    
                    if (!aiTitle) {
                        await logActivity(item.id, 'Analysis', `Attempting to auto-generate missing Item title...`);
                        const currentLocalPath = `static${enriched.orgPath || photo.orgPath}`;
                        const { guessProductDetails } = await import('$lib/server/gemini-classification');
                        const details = await apiQueue.add(() => guessProductDetails(currentLocalPath));
                        aiTitle = details?.title;
                        aiDesc = details?.description;
                    }
                    
                    if (aiTitle) {
                        await db.item.update({
                            where: { id: item.id },
                            data: { 
                                title: aiTitle, 
                                slug: slugify(aiTitle.toLowerCase()),
                                ...(item.description === "" && aiDesc ? { description: aiDesc } : {})
                            }
                        });
                        await logActivity(item.id, 'Analysis', `Auto-assigned title and description`, 'success');
                        itemNeedsTitleUpdate = false; // Prevent running for subsequent photos
                    }
				} catch (e) { console.error("Auto-fill failed:", e); }
			}
			
			// Map extracted EAV attributes directly into structured DB KVPs
			if (enriched.extractedAttributes && photo.type === 'product') {
				const fpObj = JSON.parse(enriched.extractedAttributes);
				const kvps = Object.entries(fpObj).filter(([k, v]) => v !== null).map(([k, v]) => ({ key: k, value: String(v) }));
				if (kvps.length > 0) {
					const itemWithAttrs = await db.item.findUnique({ where: { id: item.id }, include: { attributes: true } });
					const existingKeys = new Set(itemWithAttrs?.attributes.map((a: any) => a.key) || []);
					const newKvps = kvps.filter(kvp => !existingKeys.has(kvp.key));
					
					if (newKvps.length > 0) {
						await db.item.update({ where: { id: item.id }, data: { attributes: { create: newKvps } }});
						await logActivity(item.id, 'Semantic Extraction', `Structured ${newKvps.length} attributes into Key-Value Pairs`, 'success');
					}
				}
			}
			
			if (enriched.categoryName) {
				const { getOrCreateCategory } = await import('$lib/server/categories');
				const cat = await getOrCreateCategory(enriched.categoryName, item.inventoryId);
				photo.categoryId = cat.id;
			}
			
			await updatePhoto(photo.id, photo);
			
			if (photo.type !== 'invoice or receipt') {
				await processQRcodeThenDownload(photo.orgPath!, photo, item);
			}
		}
	} finally {
		taskManager.end(taskId);
	}  
}


async function processQRcodeThenDownload(webFilePath: string, photo: Photo, item: Item) {
	return ioQueue.add(async () => {
		const page = await QRUrlDownloader.fetchQRCodeDocument(`static${webFilePath.replace(/\.[^/.]+$/, '_thumb.webp')}`);
		if (page !== null) {
			const pageData = JSON.parse(page);
			await fsPromises.writeFile(`static${webFilePath}_thumb.html`, pageData.html, { encoding: "utf8" });
			try {
				await db.document.create({
					data: {
						itemId: item.id,
						type: "uncategorized",
						title: pageData.title,
						source: pageData.url,
						path: `${webFilePath}_thumb.html`,
						extracts: JSON.stringify(pageData.extracts)
					}
				});
				await logActivity(item.id, 'QR Scanner', `Found and downloaded linked document: ${pageData.title}`, 'success');
			} catch (ex) { console.error("Error creating document in DB:", ex); }
		}
	});
}


async function updatePhoto(id : number, data : Photo)
{
	try {
		await db.photo.update({
			where: { id: Number(id) },
			data : data
		});
	} catch(ex) {
		console.log(`Failed to update Photo ${id} - ${data}:`, ex);
	}
}



export async function downloadQRURLs(data: any, diskFolder: string, webFolder: string, formPrefix: string, remoteSite: string, item: any)
{
	const { photos: qrPhotos } = await savePhotos(data, diskFolder, webFolder, formPrefix);
	
	for (let i = 0; i < qrPhotos.length; i++) {
		const photo = qrPhotos[i];
		
		await generatePhotoDerivatives(photo, `${remoteSite}${photo.orgPath}`, false);
	}
}

export async function savePhotos(formData: any, diskPath: string, webPath: string, fieldPrefix: string, remoteURLlist: string = ""): Promise<{ photos: Photo[], extractedAttributes: Record<string, string>, extractedTitle: string | null, extractedDescription: string | null }>
{
	const photos: Photo[] = [];
	const extractedAttributes: Record<string, string> = {};
	let extractedTitle: string | null = null;
	let extractedDescription: string | null = null;
	
	const filePromises = [];
	let formFile, i = 0;
	while ((formFile = formData[`${fieldPrefix}${i}`] as File)) {
		if (formFile.size > 0) {
			const filename = getSafeFilename(formFile.name, String(i));
			
			// Start writing the file asynchronously and push the promise to the array
			filePromises.push(
				formFile.arrayBuffer().then(buffer => {
					const filePath = `${diskPath}/${filename}`;
					return fsPromises.writeFile(filePath, Buffer.from(buffer));
				})
			);
			
			let ocr = null, colors = null, llmAnalysis = null, cropPath = null, thumbPath = null;
			const draftPath = formData[`${fieldPrefix}draft.${i}`] as string;
			
			if (draftPath) {
				const jsonPath = `static${draftPath}.json`;
				if (fs.existsSync(jsonPath)) {
					try {
						const sidecar = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
						ocr = sidecar.ocr || null;
						colors = sidecar.colors || null;
						llmAnalysis = sidecar.llmAnalysis || null;
						
						if (sidecar.extractedAttributes) {
							Object.assign(extractedAttributes, JSON.parse(sidecar.extractedAttributes));
						}
						
						if (sidecar.title && !extractedTitle) extractedTitle = sidecar.title;
						if (sidecar.description && !extractedDescription) extractedDescription = sidecar.description;
						
						if (sidecar.cropPath) {
							cropPath = `${webPath}/${filename}_crop.webp`;
							fs.copyFileSync(`static${sidecar.cropPath}`, `static${cropPath}`);
						}
						if (sidecar.thumbPath) {
							thumbPath = `${webPath}/${filename}_thumb.webp`;
							fs.copyFileSync(`static${sidecar.thumbPath}`, `static${thumbPath}`);
						}
						
						const orgThumbDraft = `static${draftPath}_org_thumb.webp`;
						if (fs.existsSync(orgThumbDraft)) {
							fs.copyFileSync(orgThumbDraft, `static${webPath}/${filename}_org_thumb.webp`);
						}
						
						console.log(`[Background Task] Successfully merged pre-processed sidecar for image ${i}`);
					} catch (e) {
						console.error(`Error reading sidecar JSON for ${draftPath}:`, e);
					}
				}
			}
			
			// @ts-expect-error (missing DB fields that will be filled in)
			photos.push({
				type: formData[`${fieldPrefix}type.${i}`] as string,
				orgPath: `${webPath}/${filename}`,
				thumbPath,
				cropPath,
				llmAnalysis,
				ocr,
				colors,
			});
		}
		i++;
	}
	
	// separate logic to handle remote URL downloads
	let remoteFilesPromises: Promise<any>[] = [];
	if(remoteURLlist.trim().length > 0) {
		remoteURLlist = remoteURLlist.replace("\r\n", "\n");
		
		const externalUrls = remoteURLlist.trim().split('\n');
		remoteFilesPromises = externalUrls.map(async (urlWithType, index) => {
			const [type, url] = urlWithType.split(' ')
			try {
				const response = await fetch(url);
				const arrayBuffer = await response.arrayBuffer();
				
				if(!hasImageExtension(url)) {
					throw "Invalid file extension";
				}
				
				const filename = getSafeFilename(url.slice(-24), String(index));
				const filePath = `${diskPath}/${filename}`;
				
				// write file asynchronously 
				await fsPromises.writeFile(filePath, Buffer.from(arrayBuffer));
				
				// create the photo object and return 
				const photo =  {
					type,
					orgPath: `${webPath}/${filename}`,
					thumbPath: null,
					cropPath: null,
					llmAnalysis: null,
					ocr: null,
					colors: null,
				};
				
				return photo;
				
			} catch (error) {
				console.error(`Error fetching and saving file from URL: ${url}, Error: ${error}`);
			}
		});
	}
	
	try {
		const remotePhotos = await Promise.all(remoteFilesPromises);
		await Promise.all(filePromises);
		
		// merge local file photos and remote file photos and return 
		if((photos.length + remotePhotos.length) === 0 ) {
			return { photos: [], extractedAttributes, extractedTitle, extractedDescription };
		}
		return { photos: [...photos, ...remotePhotos], extractedAttributes, extractedTitle, extractedDescription };
	} catch (error) {
		console.error("Error saving files:", error);
		return { photos: [], extractedAttributes: {}, extractedTitle: null, extractedDescription: null };
	}
}

// This is _very_ basic, will fail if there are query parameters etc etc etc etc
function hasImageExtension(url: string)
{
	return url.toLowerCase().trim().endsWith(".jpg")
	|| url.toLowerCase().trim().endsWith(".jpeg")
	|| url.toLowerCase().trim().endsWith(".png")
	|| url.toLowerCase().trim().endsWith(".svg")
	|| url.toLowerCase().trim().endsWith(".webp")
	|| url.toLowerCase().trim().endsWith(".mp4")
	|| url.toLowerCase().trim().endsWith(".mov")
	|| url.toLowerCase().trim().endsWith(".webm");
}


export function getSafeFilename(filename: string, extra: string = ""): string
{
	const date = new Date().toISOString()
	.replaceAll('-', '')
	.replaceAll(':', '')
	.replace(/T/, '')
	.replace(/\..+/, '');
	
	return date + '-' + extra + "-" + slugify(filename.toLowerCase());
}
