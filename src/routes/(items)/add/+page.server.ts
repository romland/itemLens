import type { PageServerLoad, Actions } from './$types';

import slugify from 'slugify';
import fs from 'fs';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/database';

import type { Item, Photo, Prisma } from '@prisma/client';
  import { createItemEntity, formKVPsToDBrows, getTagIds, processFormDocuments } from "$lib/server/services";
import { uploadsDiskFolder, uploadsRemoteSite, uploadsWebFolder } from '$lib/server/constants';
import { downloadAndStoreDocuments } from "$lib/server/urldownloader";
  import { savePhotos, getSafeFilename } from '$lib/server/photouploads';
import { autoFill } from '$lib/server/autofill';
import { logActivity } from '$lib/server/logger';

export const actions = {
    default: async ({ locals, request }) => {
        const orgData = await request.formData();
        const data = Object.fromEntries(orgData);

		const containers = orgData.getAll("containers").map(String).filter(c => c.trim().length > 0 && c !== 'undefined');
        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        /*
        if (title.length == 0) {
            console.warn("Missing required field(s): title");
            return fail(400, {
                error: true,
                message: 'Field <strong>Title</strong> cannot be blank.'
            });
        }
        */

        /*
        if(containers.length === 0) {
          console.warn("Missing required field(s): containers");
          return fail(400, {
              error: true,
              message: 'You must have at least one <strong>Container</strong>.'
          });
        }
        */

        const { photos, extractedAttributes, extractedTitle, extractedDescription, extractedCategoryName } = await savePhotos(data, uploadsDiskFolder, uploadsWebFolder, "file.", data.downloadImages as string);
    		const kvps: Prisma.KVPCreateWithoutItemInput[] = formKVPsToDBrows(data);
        const ids = await getTagIds(tagcsv, locals.activeInventoryId);

        const safeTitle = (title.trim() || extractedTitle || "New Item").trim();
        const finalDesc = (description.trim() || extractedDescription || "").trim();

        if (extractedCategoryName && photos.length > 0) {
            const { getOrCreateCategory } = await import('$lib/server/categories');
            const cat = await getOrCreateCategory(extractedCategoryName, locals.activeInventoryId);
            const prodPhoto: any = photos.find((p: any) => p.type === 'product');
            if (prodPhoto) prodPhoto.categoryId = cat.id;
        }

/*
console.log("formData:", orgData);
console.log("photos:", photos);
console.log("NOT SAVING ANYTHING");
return fail(400, {
  error: true,
  message: '<strong>Debugging</strong>'
});
*/

    		const parsedAmount = parseInt(data.amount as string, 10);
        const item = await createItemEntity({
            title: safeTitle,
            description: finalDesc,
            reason: data.reason as string || "",
            amount: isNaN(parsedAmount) ? null : parsedAmount,
            inventoryId: locals.activeInventoryId,
            userId: locals.user.id,
            containers,
            tagIds: ids,
            duplicateDismissed: data.duplicateDismissed === 'true',
            photos,
            attributes: kvps,
            extractedAttributes
        });

        const pastedUrls = orgData.getAll("pasted_urls[]") as string[];
        if (pastedUrls.length > 0) {
            data.urls = (data.urls as string || "") + "\n" + pastedUrls.join("\n");
        }

        const preDocsRaw = orgData.getAll("preprocessed_docs[]");
        const preDocs = preDocsRaw.map(d => JSON.parse(d as string));
        const preprocessedSources = new Set(preDocs.map(d => d.source));

        if (data.urls) {
          data.urls = (data.urls as string)
            .split('\n')
            .filter(u => u.trim() && !preprocessedSources.has(u.trim()))
            .join('\n');
        }

        // Fire and forget heavy IO & ML tasks so the server returns "200 OK" to the outbox instantly
        processFormDocuments(orgData, { itemId: item.id }, uploadsDiskFolder, uploadsWebFolder).catch(e => console.error(e));
        downloadAndStoreDocuments({ itemId: item.id }, uploadsRemoteSite, data, uploadsDiskFolder, uploadsWebFolder, "qr.").catch(e => console.error(e));

        if (data.llm_attributes_used === 'true') {
          await logActivity(item.id, 'Attributes', 'Automatically structured messy attribute data using AI', 'success');
        }

        redirect(302, `/${item.id}/${item.slug}`);
    }
} satisfies Actions;


export const load = (async ({ locals, params }) => {
  // console.log("add/page.server.ts:", locals, params);
  // TODO: Security -- can be fetched without being logged in now
  // TODO: only get containers for current inventory type (not sure where to set this yet)
  const containers = await db.container.findMany({
      select : {
        name : true,
        parentId : true,
        photoPath : true,
        description : true,
        location : true,
        children : {
          select : {
            name : true,
            parentId : true,
            description : true,
          }
        },
      },
      where: {
          inventoryId: locals.activeInventoryId,
          parentId: null
      },
      orderBy: {
        name : "asc"
      }
  });

  const categories = await db.category.findMany({
      where: { inventoryId: locals.activeInventoryId },
      orderBy: { name: 'asc' }
  });

  const tags = await db.tag.findMany({
      where: { inventoryId: locals.activeInventoryId },
      orderBy: { name: 'asc' }
  });

  return {
    containers,
    categories,
    tags
  };
}) satisfies PageServerLoad;
