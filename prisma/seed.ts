import { Item, User, Inventory, PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import slugify from 'slugify';
import bcrypt from 'bcrypt';
import crypto from "crypto";

const prisma = new PrismaClient();

async function addUser() {
    let user = await prisma.user.findUnique({
        where: {
            username: 'admin'
        }
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                username: 'admin',
                password: await bcrypt.hash('password', 10),
                token: crypto.randomUUID()
            }
        });
    }

    return user;
}


async function addInventories() {
    const names = ['Electronics', 'DIY', 'Clothes', 'Shoes'];
    const classes = [['o', 'r', '*'], ["*"], ["clothes"], ["shoes"]];

    const inventories: Inventory[] = [];

    for (let i = 0; i < names.length; i++) {
        const description = faker.lorem.paragraphs(3, '\n\n');

        const inventory = await prisma.inventory.create(
            {
                data: {
                    name: names[i],
                    description: description,
                    classes: JSON.stringify(classes[i]),
                }
            }
        );

        inventories.push(inventory);
    }

    return inventories;
}


async function addItems(user: User) {
    const tags = ['raspberry pi', 'jetson', 'esp32', 'pico', 'lg', 'samsung', 'nokia'];

    const items: Item[] = [];

    for (let i = 0; i < 20; i++) {
        const words = faker.lorem.words(5).split(' ');
        const title = words.map((word) => {
            return word[0].toUpperCase() + word.substring(1);
        }).join(" ");

        const slug = slugify(title.toLowerCase());
        const description = faker.lorem.paragraphs(3, '\n\n');

        const item = await prisma.item.create(
            {
                data: {
                    title,
                    slug,
                    description,
                    amount: 1,
                    inventoryId: 1,
                    authorId: user.id,
                    photos: {
                        create: [
                            {
                                type : "item",
                                orgPath: "/images/_seed_org.jpg",
                                cropPath: "/images/_seed_crop.jpg",
                                thumbPath: "/images/_seed_thumb.jpg",
                                // TODO ocr: Refine? Separate table? How will we use it after pre-processing?
                                ocr: '{"resultcode":200,"message":"Success","data":[[]]}',
                                // TODO colors: Refine? Separate table? How will we use it after pre-processing?
                                colors: "[ 'black', 'gray', 'midnight blue', 'manatee' ]",
                            },
                            {
                                type : "receipt",
                                orgPath: "/images/_seed_receipt.jpg",
                                cropPath: null,
                                thumbPath: null,
                                // TODO ocr: Refine? Separate table? How will we use it after pre-processing?
                                ocr: '{"resultcode":200,"message":"Success","data":[[]]}',
                                // TODO colors: Refine? Separate table? How will we use it after pre-processing?
                                colors: "[ 'white' ]",
                            },
                        ]
                    },
                    documents: {
                        create: [
                            {
                                type: "product-page",
                                title: "Reely Carbon Fighter III 1_ 6 RC model car, petrol-powered buggy, rear-wheel drive, RtR 2.4 GHz_ Amazon.de_ Toys",
                                source: "https://www.amazon.de/-/en/Reely-Carbon-Fighter-III-petrol-powered/dp/B00CSS1RF4",
                                path: "/images/_seed_document.html",
                                extracts: "blah blah"
                            }
                        ]
                    },
                    tags: {
                        connectOrCreate: tags.map((name) => {
                            return {
                                where: { slug: name },
                                create: {
                                    name,
                                    slug: name
                                }
                            }
                        })
                    },
                    locations: {
                        connectOrCreate: {
                            where: { name : "A" },
                            create: {
                                name: "A",
                                description: "A 001 - A 060, blue metal cabinet with 60 drawers",
                                location: "Study",
                                photoPath: "/images/_seed_container.jpg"

                            }
                        }
                    },
                    attributes: {
                        create: [
                            {
                                key: "Weight",
                                value: "0.2kg"
                            },
                            {
                                key: "Color",
                                value: "blue",
                            },
                            {
                                key: "Power connector",
                                value: "USB-C"
                            }
                        ]
                    },
                    usage: {
                        create: [
                            {
                                title: "On RP CM3 in shed",
                                description: "Because it's not a bad camera"
                            }
                        ]
                    }
                }
            }
        );

        items.push(item);
    }

    return items;
}

async function main() {
    const user = await addUser();
    const inventories = await addInventories();
    await addItems(user);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    })