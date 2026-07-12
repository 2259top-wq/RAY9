const http = require('http');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function getCsvFiles() {
  const dir = 'C:\\\\Users\\\\Admin\\\\Downloads';
  const csvFiles = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith('OptionsDaily_')) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          const subFiles = fs.readdirSync(fullPath);
          for (const subFile of subFiles) {
            if (subFile.endsWith('.csv')) {
              csvFiles.push(path.join(fullPath, subFile));
            }
          }
        } else if (file.endsWith('.csv')) {
          csvFiles.push(fullPath);
        }
      }
    }
  } catch (err) {
    console.error('Error reading Downloads directory:', err);
  }
  return csvFiles;
}
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 3000;

// In-memory data store
let optionsData = [];

// Extracted unique values for dropdowns
let uniqueValues = {
  dates: new Set(),
  contracts: new Set(),
  expiries: new Set(),
  types: new Set(),
  strikes: new Set()
};

async function loadCSV() {
  console.log('Loading CSV data...');
  const filesToLoad = getCsvFiles();
  console.log(`Found ${filesToLoad.length} CSV files to process.`);
  for (const file of filesToLoad) {
    if (!fs.existsSync(file)) {
      console.error(`Error: CSV file not found at ${file}`);
      continue;
    }

    console.log(`Processing ${file}...`);
    
    // Extract Trading Date from filename (e.g. OptionsDaily_2026_07_07.csv -> 20260707)
    const dateMatch = file.match(/OptionsDaily_(\d{4})_(\d{2})_(\d{2})/i);
    const tradingDate = dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : null;

    const fileStream = fs.createReadStream(file);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;
    for await (const line of rl) {
      lineCount++;
      if (lineCount <= 2) continue; // Skip headers (Big5 encoded strings)

    const parts = line.split(',');
    if (parts.length < 8) continue;

    // Use the parsed Trading Date, fallback to actual calendar date if parsing fails
    const date = tradingDate || parts[0].trim();
    const contract = parts[1].trim();
    
    // Load all contracts to allow user to select different commodities
    // if (contract !== 'TXO') continue;

    const strike = parts[2].trim();
    const expiry = parts[3].trim();
    const type = parts[4].trim();
    const time = parts[5].trim();
    const price = parseFloat(parts[6].trim());
    const qty = parseInt(parts[7].trim(), 10);

    const calendarDate = parts[0].trim();
    if (!date || !contract || isNaN(price)) continue;

    optionsData.push({ date, calendarDate, contract, strike, expiry, type, time, price, qty });
    
    uniqueValues.dates.add(date);
    uniqueValues.contracts.add(contract);
    uniqueValues.expiries.add(expiry);
    uniqueValues.types.add(type);
    uniqueValues.strikes.add(parseFloat(strike));
  } // end of for await
  } // end of for file
  
  console.log(`Loaded ${optionsData.length} records.`);
  
  // Convert Sets to sorted arrays for API
  uniqueValues.dates = Array.from(uniqueValues.dates).sort();
  uniqueValues.contracts = Array.from(uniqueValues.contracts).sort();
  uniqueValues.expiries = Array.from(uniqueValues.expiries).sort();
  uniqueValues.types = Array.from(uniqueValues.types).sort();
  uniqueValues.strikes = Array.from(uniqueValues.strikes).sort((a, b) => a - b);
  
  // Set default parameters to the first available valid row to avoid empty state
  if (optionsData.length > 0) {
    const defaultDate = optionsData[0].date;
    const defaultContract = optionsData[0].contract;

    // Filter data for the default date and contract
    const todayData = optionsData.filter(d => d.date === defaultDate && d.contract === defaultContract);

    if (todayData.length > 0) {
      // Find the most active expiry (highest volume)
      const expiryVols = {};
      todayData.forEach(d => { expiryVols[d.expiry] = (expiryVols[d.expiry] || 0) + d.qty; });
      const bestExpiry = Object.keys(expiryVols).reduce((a, b) => expiryVols[a] > expiryVols[b] ? a : b);

      // Find the most active type (Call or Put) in that expiry
      const typeVols = {};
      todayData.forEach(d => { 
        if (d.expiry === bestExpiry) typeVols[d.type] = (typeVols[d.type] || 0) + d.qty; 
      });
      const bestType = Object.keys(typeVols).reduce((a, b) => typeVols[a] > typeVols[b] ? a : b);

      // Find the most active strike (ATM) in that expiry and type
      const strikeVols = {};
      todayData.forEach(d => {
        if (d.expiry === bestExpiry && d.type === bestType) {
          strikeVols[d.strike] = (strikeVols[d.strike] || 0) + d.qty;
        }
      });
      const bestStrike = Object.keys(strikeVols).reduce((a, b) => strikeVols[a] > strikeVols[b] ? a : b);

      uniqueValues.defaultParams = {
        date: defaultDate,
        contract: defaultContract,
        expiry: bestExpiry,
        type: bestType,
        strike: bestStrike
      };
    } else {
      uniqueValues.defaultParams = {
        date: optionsData[0].date,
        contract: optionsData[0].contract,
        expiry: optionsData[0].expiry,
        type: optionsData[0].type,
        strike: optionsData[0].strike
      };
    }
  }
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // API Route: Get available filter options
  if (url.pathname === '/api/options') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(uniqueValues));
    return;
  }

    // API Route: Query data (Aggregated to 1-minute OHLCV)
  if (url.pathname === '/api/query') {
    const date = url.searchParams.get('date');
    const contract = url.searchParams.get('contract');
    const strike = url.searchParams.get('strike');
    const expiry = url.searchParams.get('expiry');
    const type = url.searchParams.get('type');

    let results = optionsData.filter(row => 
      row.date === date &&
      row.contract === contract &&
      row.expiry === expiry &&
      row.type === type &&
      row.strike === strike
    );

    // Aggregate into 1-minute OHLCV
    const ohlcvMap = new Map();

    for (const row of results) {
      // row.time is 'HHMMSS'. We want to group by minute 'HHMM'
      const hhmm = row.time.substring(0, 4);
      // Create a unique key for the bucket using calendar date to handle night session correctly
      const bucketKey = `${row.calendarDate}-${hhmm}`;

      if (!ohlcvMap.has(bucketKey)) {
        // Parse time to Unix timestamp in seconds (Taiwan Time UTC+8)
        const yyyy = row.calendarDate.substring(0, 4);
        const mm = row.calendarDate.substring(4, 6);
        const dd = row.calendarDate.substring(6, 8);
        const hour = hhmm.substring(0, 2);
        const min = hhmm.substring(2, 4);
        
        // Date.parse('2026-07-06T15:00:00+08:00') -> ms, then divide by 1000
        const isoString = `${yyyy}-${mm}-${dd}T${hour}:${min}:00+08:00`;
        const unixTimestamp = Math.floor(Date.parse(isoString) / 1000);

        ohlcvMap.set(bucketKey, {
          time: unixTimestamp,
          open: row.price,
          high: row.price,
          low: row.price,
          close: row.price,
          volume: row.qty,
          hhmm: parseInt(hhmm, 10)
        });
      } else {
        const candle = ohlcvMap.get(bucketKey);
        if (row.price > candle.high) candle.high = row.price;
        if (row.price < candle.low) candle.low = row.price;
        candle.close = row.price;
        candle.volume += row.qty;
      }
    }

    // Convert map to array and sort by time ascending
    let aggregatedResults = Array.from(ohlcvMap.values()).sort((a, b) => a.time - b.time);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(aggregatedResults));
    return;
  }

  // API Route: Valid combinations for cascading dropdowns
  if (url.pathname === '/api/valid_params') {
    const date = url.searchParams.get('date');
    const contract = url.searchParams.get('contract');
    const expiry = url.searchParams.get('expiry');
    const type = url.searchParams.get('type');
    
    let validExpiries = new Set();
    let validTypes = new Set();
    let validStrikes = new Set();

    for (const row of optionsData) {
      if (date && row.date !== date) continue;
      if (contract && row.contract !== contract) continue;
      
      validExpiries.add(row.expiry);
      
      if (expiry && row.expiry !== expiry) continue;
      
      validTypes.add(row.type);
      
      if (type && row.type !== type) continue;
      
      validStrikes.add(row.strike);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      expiries: Array.from(validExpiries).sort(),
      types: Array.from(validTypes).sort(),
      strikes: Array.from(validStrikes).sort((a,b) => a - b)
    }));
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (extname) {
    case '.js': contentType = 'text/javascript'; break;
    case '.css': contentType = 'text/css'; break;
    case '.json': contentType = 'application/json'; break;
    case '.png': contentType = 'image/png'; break;
    case '.jpg': contentType = 'image/jpg'; break;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

loadCSV().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
  });
});
