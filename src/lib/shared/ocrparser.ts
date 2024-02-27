export function refineForLLM(data)
{
  const blocks = data.data[0];
  const [heights, smallest, biggest] = analyzeFontSizes(data);
  const normalizedHeights = getNormalized(0, biggest, heights);

  return minimizeBlocksForLLM(refineOCRdBlocks(blocks), normalizedHeights);
}

export function refine(data)
{
  const blocks = data.data[0];
  return refineOCRdBlocks(blocks);
}

function refineOCRdBlocks(blocks)
{
  // const blocks = data.data[0];
  const [heights, smallest, biggest] = analyzeFontSizes(blocks);
  const normalizedHeights = getNormalized(0, biggest, heights);

  const refinedBlocks = [];
  for(let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const b = {
      box: {
        leftTop : { 
          x: block[0][0][0],
          y: block[0][0][1]
        },
        rightTop : { 
          x: block[0][1][0],
          y: block[0][1][1]
        },
        rightBottom : { 
          x: block[0][2][0],
          y: block[0][2][1]
        },
        leftBottom : { 
          x: block[0][3][0],
          y: block[0][3][1]
        }
      },
      estimatedCell: {
        col: 0,
        line: 0
      },
      text: block[1][0],
      confidence: block[1][1],
      fontSize: normalizedHeights[i].toFixed(4)
    };

    b.box.width = b.box.rightTop.x - b.box.leftTop.x;
    b.avgCharWidth = (b.box.width / b.text.length).toFixed(2);
    
    refinedBlocks.push(b);    
  }

  // assignLineToBlocks(refinedBlocks);
  // assignColumnToBlocks(refinedBlocks);
  
  // console.log(refinedBlocks);
  // console.log("min", smallest, "max", biggest, "avg", getAverage(heights), "med", getMedian(heights), "mod", getMode(heights), "norm", normalized);
  // console.log("avg", getAverage(normalized), "med", getMedian(normalized), "mode", getMode(normalized));
  // console.log(JSON.stringify(refinedBlocks));

  // const pairs = extractPairs(refinedBlocks);
  // console.log(pairs);
  return refinedBlocks;
}

function analyzeFontSizes(blocks)
{
  let heights = [];
  let smallest = Infinity;
  let biggest = 0;

  for(let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const [leftTop, rightTop, rightBottom, leftBottom] = block[0];
    const blockAvgHeight = Math.round(((leftBottom[1] - leftTop[1]) + (rightBottom[1] - rightTop[1])) / 2);

    if(blockAvgHeight > biggest) {
      biggest = blockAvgHeight;
    }

    if(blockAvgHeight < smallest) {
      smallest = blockAvgHeight;
    }

    heights.push(blockAvgHeight);
  }
  return [ heights, smallest, biggest ];
}

function minimizeBlocksForLLM(refinedBlocks, normalizedHeights)
{
  const modeHeight = getMode(normalizedHeights);
  const keptBlocks = [];
  for(let i = 0; i < refinedBlocks.length; i++) {
    const block = refinedBlocks[i];
    // Remove blocks with small fontsize or low confidence
    if(block.fontSize < (modeHeight-0.2) || block.fontSize > (modeHeight+0.2) || block.confidence < 0.85) {
      continue
    }
    // delete block.estimatedCell;
    // delete block.confidence;
    delete block.fontSize;
    delete block.box.width;
    delete block.box.height;
    keptBlocks.push(block);
  }

  console.log("SEND TO LLM:", JSON.stringify(keptBlocks));
  return keptBlocks;
}

function extractPairs(blocks)
{
  // Sort data from left to right, top to bottom
  blocks.sort((a, b) => { 
    if(a.box.leftTop.y !== b.box.leftTop.y) {
      return a.box.leftTop.y - b.box.leftTop.y;
    } else {
      return a.box.leftTop.x - b.box.leftTop.x;
    }
  });

  let result = {};

  // Define range in which it's possible for a pair
  const range = 50;

  for(let i = 0; i < blocks.length; i++) {
    const box1 = blocks[i].box;
    if(box1.picked) {
      continue;
    }
    for(let j = i+1; j < blocks.length; j++) {
      const box2 = blocks[j].box;
      if(box2.picked) {
        continue;
      }
      
      // Check for horizontal pair
      if(Math.abs(box1.leftTop.y - box2.leftTop.y) <= range && Math.abs(box1.rightTop.x - box2.leftTop.x) <= range) {
        result[Symbol(blocks[i].text)] = blocks[j].text;
        box1.picked = true;
        box2.picked = true;
        continue;
      }
      
      // Check for vertical pair
      if(Math.abs(box1.leftTop.x - box2.leftTop.x) <= range && Math.abs(box1.leftBottom.y - box2.leftTop.y) <= range) {
        result[Symbol(blocks[i].text)] = blocks[j].text;
        box1.picked = true;
        box2.picked = true;
        continue;
      }
    }
  }

  return result;
}


function assignLineToBlocks(blocks)
{
  // Sort blocks from top to bottom accepting minor deviations (tolerance)
  let sorted = blocks.sort((a, b) => a.box.leftTop.y - b.box.leftTop.y);        
  let lines = [];
  let lineNum = 1;
  let tolerance = 20; // Tolerance for y-coordinate variation in the same line

  for (let i = 0; i < sorted.length; i++) {
      let block = sorted[i];

      // If this is the first block or the block is sufficiently below the last block in the current line
      if (i === 0 || Math.abs(block.box.leftTop.y - lines[lineNum - 1].y) > tolerance) {
          lineNum++;
      }

      block.estimatedCell.row = lineNum;

      // Record the average vertical position of the current line (for comparison with following blocks)
      if (!lines[lineNum - 1]) {
          lines[lineNum - 1] = { y: 0, count: 0 };
      }
      lines[lineNum - 1].y = (lines[lineNum - 1].y * lines[lineNum - 1].count + block.box.leftTop.y) / (lines[lineNum - 1].count + 1);
      lines[lineNum - 1].count++;
  }

  return blocks;
}

function assignColumnToBlocks(blocks)
{
  // Sort blocks from left to right accepting minor deviations (tolerance)
  let sorted = blocks.sort((a, b) => a.box.leftTop.x - b.box.leftTop.x);        
  let columns = [];
  let columnNum = 0;
  let tolerance = 20; // Tolerance for x-coordinate variation in the same column

  for (let i = 0; i < sorted.length; i++) {
      let block = sorted[i];
      
      // If this is the first block or the block is sufficiently to the right of the last block in the current column
      if (i === 0 || Math.abs(block.box.leftTop.x - columns[columnNum - 1].x) > tolerance) {
          columnNum++;
      }

      block.estimatedCell.col = columnNum;

      // Record the average horizontal position of the current column (for comparison with following blocks)
      if (!columns[columnNum - 1]) {
          columns[columnNum - 1] = { x: 0, count: 0 };
      }
      columns[columnNum - 1].x = (columns[columnNum - 1].x * columns[columnNum - 1].count + block.box.leftTop.x) / (columns[columnNum - 1].count + 1);
      columns[columnNum - 1].count++;
  }

  return blocks;
}

function getNormalized(min: number, max: number, numbers: number[])
{
  return numbers.map(num => (num - min) / (max - min));
}

function getMedian(numbers: number[])
{
  const middle = Math.floor([...numbers].sort((a, b) => a - b).length / 2);
  return numbers.length % 2 === 0 ? (numbers[middle - 1] + numbers[middle]) / 2 : numbers[middle];
}

function getAverage(numbers: number[])
{
  const sum = numbers.reduce((acc, num) => acc + num, 0);
  return sum / numbers.length;
}

function getMode(numbers: number[])
{
  const frequencyMap = numbers.reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
  }, {});

  const maxFrequency = Math.max(...Object.values(frequencyMap));
  return Object.keys(frequencyMap).filter(num => frequencyMap[num] === maxFrequency).map(Number)[0];
}

export function toTextDocument(ocr)
{
  let boxes = refine(ocr);
  // We will assume that the 'boxes' array contains the box objects.
  boxes.sort((box1, box2) => box1.box.leftTop.y - box2.box.leftTop.y);  
  // Sort top to bottom.

  let linesCount = 60; // This is just an example. Adjust this number.
  let totalHeight = 2480; 
  let lineHeight = totalHeight / linesCount;  

  let lines = Array(linesCount).fill(" "); 

  boxes.forEach((box) => {  
    let line = Math.floor(box.box.leftTop.y / lineHeight);  
    // Calculate which line this box belongs to.
    let spaces = Math.floor(box.box.leftTop.x / 100);  
    // Creating spaces (horizontally moving the text).

    lines[line] += " ".repeat(spaces) + box.text;  
    // Add spaces and then the text to the line.
  });

  let result = lines.join("\n");

  console.log("Text invoice:", result);
  return result;
}
