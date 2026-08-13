# itemLens
<img src="static/itemlens-512.webp" align="right" width="300" alt="itemLens Logo" />

Inventory management (for at home). There are many like it, but this one is mine.

The primary use is:
`Do I have that, where the heck is it?` and `Why did I buy it?`

I am no fan of data-entry, so, adding new products/items should be as automated as 
possible (using any device). Most of the effort went into this bit using machine learning
(LLMs, object classification, OCR, etc).

### How to use
To add a product, grab your phone and take a picture of the product. Then scan the
QR-code on the container to place it in. (Note: this is the goal. Getting there.)

That's it.

If feeling particularly ambitious on a day, you can also:
- take a picture of an invoice/receipt (itemLens will use image classification/OCR/LLM to get the juicy bits)
- add additional photos (using camera or just paste in links)
- scan QR-codes containing URLs to relevant documents
- paste in a list of attributes (weight/color/size/etc)
- **Just Paste Anything:** The global PasteHandler instantly detects images in your clipboard (uploading them to the current item), raw URLs (fetching the webpage/PDF), and text blocks (creating local Markdown notes analyzed by LLMs). Hit `Ctrl+V` anywhereitemLens!
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
- Collection (bulk) import of CDs, DVDs, books, what have you
- Multiple inventories (i.e. one for shoes, another for clothes, and yet another for electronics)
- ...and more

### Info how I use it
- TODO: 
    - Which label printer
    - Which cabinets
    - Pictures of containers
    - Firefox QR-code generator for current link
    - I use it for electronics/components
    - Which fields I actually fill in
    - How I search for related links

# Third parties
I really dislike it when I have to register for some 3rd party services to try out some software,
therefore, that is all voluntary. Set the flag `NO_THIRD_PARTY_SERVICES` to `true` in `.env` 
and you can use it all -- but adding new products will be more work.

### About third party services and incurred costs
Goal is: No fixed cost / month -- only pay for use

# ARRRGH's
You may need to do this after `npm install` if you get `Error: Cannot find module '../build/Release/canvas.node'`:
```
$ cd node_modules/canvas
$ npx node-gyp rebuild
```

Prisma error? Deleted node_modules?
```
$ npx prisma generate
```

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

### Safari Share Target
Apple limitation: **iOS Safari does not support the Web Share Target API.**
Apple only allows PWAs to *send* shares out, not *receive* them natively via the share sheet.

### The Workaround: iOS Shortcuts

If you want to share things directly into itemLens on an iPhone, the best workaround is to build a quick iOS Shortcut:
1. Open the **Shortcuts** app on your iPhone and create a new shortcut.
2. Tap the **(i)** icon at the bottom and turn on **Show in Share Sheet**.
3. Set it to accept **URLs, Text, and Images**.
4. Add an action to **URL Encode** the shortcut input.
5. Add an action to **Open URLs**, and construct the URL to point to your app's capture route with the encoded input attached as a query parameter (e.g., `[https://dev.providi.nl/timeline?pasteText=](https://dev.providi.nl/timeline?pasteText=)[Encoded Input]`).

It's a bit of a hack, but once you set it up, "Send to itemLens" will sit right there in your iOS share sheet.


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
- make a multi-"screen" wizard for adding new items on smaller devices (from desktop single screen is good)
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
