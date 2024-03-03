import fs from 'fs';
import vm from 'vm';

import fetch from 'node-fetch';

export async function reverseImageSearch(imageUrl)
{
  try {
    // const resultPage = await getPageByUrl("https://lens.google.com/uploadbyurl?url=https://providi.nl/temp/20240222213933-3-image.jpg_thumb.jpg&safe=off");
    const resultPage = await getPageByUrl("https://lens.google.com/uploadbyurl?url=" + imageUrl + "&safe=off");
    // const resultPage = fs.readFileSync('../lens.html', 'utf8');
    const resultObject = parse(resultPage);

    // God knows what is in the parents leading up to the actual result list;
    // as can be seen, a nice nested array:
    const hits = resultObject["data"][1][0][1][8][8][0][12];
    const pageTitles = [];

    for(let i = 0; i < hits.length; i++) {
      /* Indices of a hit:
        0: google internal stuff (shopping), I think
        1: ??? confidence or so?
        2: null
        3: page title
        4: review rating
        5: url to page
        6: ???
        7: price * site name
        8: null
        9: null
        10: null
        11: another url to page
        12: some int
        13: null
        14: site name
        15: site's icon
        16: null
        17: null
        18: null
        19: page title (again?) this time with price baked in?
        20: array of numbers
        21: null or undefined
        22: null or undefined
        23: stock status
      */
      // console.log("Example", (i+1) + ":", JSON.stringify(hits[i][3]) );
      pageTitles.push(hits[i][3]);
    }

    return pageTitles;

  } catch(ex) {
    console.log(ex);
    return [];
  }
}

async function getPageByUrl(url)
{
  const headers = {
    "User-Agent":                 `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0`,
    "Accept":                     `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8`,
    "Accept-Language":            `en-GB,en;q=0.7,nl;q=0.3`,
    "Accept-Encoding":            `gzip, deflate, br`,
    "Referer":                    `https://consent.google.com/`,
    "DNT":                        `1`,
    "Sec-GPC":                    `1`,
    "Connection":                 `keep-alive`,
    "Cookie":                     `SOCS=CAISOAgQEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwMjI1LjA4X3AwGgVlbi1HQiACGgYIgPuOrwY; NID=512=sj7-85fWhTPYsYcMroBCh5FK-ogmiv6JWc9Viw2vkenKm5FgGkK-k0Wk2hxRbBVaBervax_reYFtbHZx9LDLGN2txY8xP41vzv3I80Hjlhh74VN-QLmbtXRbtAsVB5plIHSJ5XgM5ru5w7aSYKVcN0GlMgoaYQVV7KOWw3aVwxY`,
    "Upgrade-Insecure-Requests":  `1`,
    "Sec-Fetch-Dest":             `document`,
    "Sec-Fetch-Mode":             `navigate`,
    "Sec-Fetch-Site":             `same-site`,
    "Sec-Fetch-User":             `?1`,
    "Pragma":                     `no-cache`,
    "Cache-Control":              `no-cache`,
  };
  const response = await fetch(url, { headers });
  const page = await response.text();
  return page;
}


/*
 * Extract the javascript objects returned by the AF_initDataCallback functions
 * in the script tags of the app detail HTML.
 */
function parse(response)
{
  const scriptRegex = />AF_initDataCallback[\s\S]*?<\/script/g;
  const matches = response.match(scriptRegex);

  /*
    Slices this:
    Start: >AF_initDataCallback(
    End: );</script
  */
  const probablyJson = matches[1].slice(0, -10).slice(21)
  return parseBadJson(probablyJson);
}


function parseBadJson(badJson)
{
  try {
      const parsedJson = new vm.Script(`x=${badJson}`).runInNewContext(
          // { console: undefined }, // nuke console inside the vm
          { timeout: 1000, displayErrors: true }
      );
      if (typeof parsedJson !== 'object') { // in case you're expecting an object/array
          throw new Error(`Invalid JSON=${badJson}, parsed as: ${parsedJson}`);
      }
      // console.log(parsedJson);
      return parsedJson;
  } catch (err) {
      throw new Error(`Could not parse JSON: ${err}`);
  }
}
