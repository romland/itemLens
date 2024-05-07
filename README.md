# itemLens
Inventory management (for at home). There are many like it, but this one is mine.

The primary use is:
`Do I have that, where the heck is it?` and `Why did I buy it?`

I am no fan of data-entry, so, adding new products/items should be as automated as 
possible (using any device). Most of the effort went into this bit using machine learning
(LLMs, object classification, OCR, etc).

### How to use
To add a product, grab your phone and take a picture of the product and scan the
QR-code on the container to place it in. (Note: this is the goal. Need better reverse
image search next.)

That's it.

If feeling particularly ambitious on a day, you can also:
- take a picture of an invoice/receipt (itemLens will use image classification/OCR/LLM to get the juicy bits)
- add additional photos (using camera or just paste in links)
- scan QR-codes containing URLs to relevant documents
- paste in a list of attributes (weight/color/size/etc)
- add tags, amount, description, etc (but then you are obviously _very_ ambitious as it might require typing)

### Features
- Paste-parser for key-value-pairs
- QR-code reading (server and client)
- Optical Character Reading (OCR)
- Image classification (Blip)
- LLM Summaries (Llama3, Groq)
- Invoice/receipt data extraction
- Download-and-store documents (link-rot no more)
- Image processing (background removal, thumbnail, etc)
- Color extraction
- Multiple inventories (i.e. one for shoes, another for clothes, and yet another for electronics)
- ...and more

### Info how I use it
- TODO: 
    - Which label printer
    - Pictures of containers
    - Firefox QR-code generator for current link
    - Which fields I actually fill in
    - How I search for related links

# Third parties
I really dislike it when I have to register for some 3rd party services to try out some software,
therefore, that is all voluntary. Set the flag `NO_THIRD_PARTY_SERVICES` to `true` in `.env` 
and you can use it all -- but adding new products will be more work.

### About third party services and incurred costs
Goal is: No fixed cost / month -- only pay for use


# Development

## Stack
SvelteKit 2, PWA, Prisma, SQLite, Tailwind CSS, TypeScript, LLMs + various ML models.


## Installing

### Get it:
```bash
npx degit romland/itemLens itemLens
```

### Create some directories
```bash
mkdir `static/images`
mkdir `static/images/u`
```

### Fill in your details in .env
```bash
cp .env.example .env
```

### Run for development:
```bash
cd sveltekit-starter
npm install
npm run dev
```

### Database migration:
```bash
npx prisma migrate dev --name init
```

### Database seeding:
```bash
npx prisma db seed
```

### Use default user:
```
Username: admin
Password: password
```

### Build for production
```bash
npm run build
```

### External services
_Notes to self for now_:  
Start the docker containers in Ubuntu VM if they are not running with:
containers-start.sh

On the Jetson on my desktop:
    For object classification:
    ...

# Prototype-y
- Right now the code very JavaScripty while it should be TypeScripty. A lot of it is still very much a prototype.

# TODO / notes
- consider: Is it faster to do a quick pre-check on the Jetson to see if there is a QR code in image?
- Investigate how fast classification inference can run on a recent RasPi (using OpenCL)
- TODO fields when adding items:
    inventory   Inventory? @relation(fields: [inventoryId], references: [id])
    inventoryId Int?
    usage      InUse[] 
- Need some thinking about logic to take _valuable_ data from photos and apply it to items for searching,
  right now we search all.
- autostart containers if they are not running (if Windows, need to start in WSL)
- fetching interesting links (especially documentation/specs) for newly items should also be automatic

# TODO README:
Screenshot(s), logo, video(s)
