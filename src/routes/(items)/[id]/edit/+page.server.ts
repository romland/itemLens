import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from "./$types";
import { writeFileSync } from "fs";
import slugify from 'slugify';
import { db } from '$lib/server/database';
import type { Tag } from "@prisma/client";

import type { Item, Photo, KVP } from '@prisma/client';
import { formKVPsToDBrows, getTagIds } from "$lib/server/services";
import { uploadsDiskFolder, uploadsRemoteSite, uploadsWebFolder } from '$lib/server/constants';
import { downloadAndStoreDocuments } from "$lib/server/urldownloader";
import { savePhotos, processInvoicePhotos, processOtherPhotos, processProductPhotos } from '$lib/server/photouploads';

export const load = (async ({ locals, params }) => {
    const item = await db.item.findFirst({
        where: {
            AND: [
                { author: { id: locals.user.id } },
                { id: Number(params.id) },
            ]
        },
        include: {
            inventory: true,
            photos: true,
            documents: true,
            tags: true,
            locations: {
                include: {  
                    container: true,
                }
            },
            attributes: true,
            usage: true,
        }
    });

    if (!item) {
        redirect(302, '/');
    }

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
            }
          },
        },
        where: {
            AND: [
                { parentId: null }
            ]
        },
        orderBy: {
          name : "asc"
        }
    });

    return {
        item: {
            ...item,
            tagcsv: item.tags.map((tag: Tag, i: number) => i == 0 ? tag.name : ' ' + tag.name)
        },
        containers
    };
}) satisfies PageServerLoad;

/*
TODO:
- take care of refresh_images = essentially delete it, but then re-add it (orgPath) by running everything over it again,
  this is when we get happy that we populate other 'tables' (think: attributes) on client-side
- take care of delete_images
  Make sure to delete on disk too (or at least move away)
- ditto with delete/refresh_documents
- delete all containers (to be re-inserted)
- delete all attributes (to be re-inserted)
*/
export const actions = {
    default: async ({ request, params }) => {
        const orgData = await request.formData();
        const data = Object.fromEntries(orgData);
        const containers = orgData.getAll("containers");

        const title = data.title as string;
        const description = data.description as string;
        const tagcsv = data.tagcsv as string;

        if (title.length == 0) {
            return fail(400, {
                error: true,
                message: 'Field <strong>Title</strong> cannot be blank.'
            });
        }

        if(containers.length === 0) {
            console.warn("Missing required field(s): containers");
            return fail(400, {
                error: true,
                message: 'You must have at least one <strong>Container</strong>.'
            });
          }
  
          let photos: Photo[] = await savePhotos(data, uploadsDiskFolder, uploadsWebFolder, "file.", data.downloadImages as string);
          const kvps: KVP[] = formKVPsToDBrows(data);
          const tagIds = await getTagIds(tagcsv);


console.log("formData:", orgData);
// DEBUG
// return fail(400, {
//     error: true,
//     message: 'Debugging.'
// });
// DEBUG

        let item = await db.item.findUnique({
            where: {
                id: Number(params.id)
            },
            include: {
                photos: true,
                documents: true,
            }
        });

        // Holds all image IDs that existed before this item (new photos to be created are not here)
        const preExistingPhotoIds = item.photos.map(p=>p.id);

        // TODO: Wrap this in a Prisma transaction so we don't delete stuff without filling things back in.
        await db.item.update({
          where: { id: Number(params.id) },
          data: {
            attributes: {
              deleteMany: {}
            },
            locations: {
              deleteMany: {}
            },
          },
        });

        // Note: We overwrite the initial version of item here so that we have the new ID's
        //       of images, etc.
        item = await db.item.update({
            where: { id: Number(params.id) },
            data: {
                title: title.trim(),
                reason: data.reason as string || "",
                amount: parseInt(data.amount as string, 10) || null,
                photos: {
                  create: photos
                },
                attributes: {
                  create: kvps,
                },
                // valid (motherfucker)
                locations: {
                  create: containers.map((cont) => {
                    return {
                      container : {
                          connect: { name : cont },     // CHECK: set? on add: connect
                      }
                    }
                  }),
                },
                slug: slugify(title.trim().toLowerCase()),
                description: description.trim(),
                // authorId: locals.user.id,
                tags: {
                    set: [...tagIds]        // CHECK: set? on add: connect
                }
            },
            include: {
              photos : true,
            }
        });

        // Store all image IDs belonging to this item, including ones just created.
        const allExistingPhotoIds = item.photos.map(p=>p.id);

        // Deal with refreshing and deleting documents and images
        try {
            let imagesToDelete = JSON.parse(data.delete_images as string);
            let imagesToRefresh = JSON.parse(data.refresh_images as string);
            
            console.log({imagesToDelete, imagesToRefresh });

            // Store the image IDs that were created this post (just now) (difference between before insert and now)
            const newPhotoIds = [ ...allExistingPhotoIds.filter(elem1 => preExistingPhotoIds.every(elem2 => elem2 != elem1)) ];

            // Remove all photos (from DB result array) that do not need a refresh.
            // The remaining array will be merged with local variable 'photos'.
            for(let i = item.photos?.length - 1; i >= 0; i--) {
                // Don't remove any photos we just created (they are still unprocessed)
                if(newPhotoIds.includes(item.photos[i].id) === false && imagesToRefresh.includes(item.photos[i].id) === false) {
                    item.photos.splice(i, 1);
                } else {
                    console.log("(Re)fresh photo:", item.photos[i].id);
                }
            }

            // Make sure the photos actually belong to this item.
            if(imagesToDelete.every(item => allExistingPhotoIds.includes(item))) {
                // Do not remove items that were flagged as both 'refresh' and 'delete'
                const toActuallyDelete = imagesToDelete.filter( (el) => !imagesToRefresh.includes( el ) );

                console.log("To Actually DELETE:", toActuallyDelete);
                await db.item.update({
                    where: {
                        id: item.id
                    },
                    data: {
                        photos: {
                            deleteMany: {
                                id : {
                                    in: toActuallyDelete
                                }
                            }
                        }
                    }
                });
                console.log("DELETED!");
            } else {
                throw "Illegal to delete one or more of images " + JSON.stringify(imagesToDelete);
            }

            // TODO?: delete files on disk for entities being refreshed

            console.log("Photos we will deal with going forward:", item.photos);

            let docsToDelete = JSON.parse(data.delete_documents as string);
            let docsToRefresh = JSON.parse(data.refresh_documents as string);

            console.log({docsToDelete, docsToRefresh});




        } catch(ex) {
            console.error("Failed to deal with deletion/refresh of docs/images", ex);
        }

        // downloadAndStoreDocuments(item, uploadsRemoteSite, data, uploadsDiskFolder, uploadsWebFolder, "qr.");

        processProductPhotos(item, uploadsRemoteSite);
        processInvoicePhotos(item, uploadsRemoteSite);
        processOtherPhotos(item, uploadsRemoteSite);        

/*
        await db.item.update({
            where: { id: Number(params.id) },
            data: {
                title: title.trim(),
                // TODO: This structure has changed
                // photo: filename,
                slug: slugify(title.toLowerCase()),
                description: description.trim(),
                tags: {
                    set: [...tagIds]
                }
            }
        });
        console.warn("NOTE: Photo structure changed, this needs to be redone");
*/

        console.log("=== Done updating ===");

        redirect(302, `/${item?.id}/${item?.slug}`);
    }
} satisfies Actions;