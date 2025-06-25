import https from 'https';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { Buffer } from 'buffer';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    };
    
    https.get(url, options, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      } else {
        reject(new Error(`Failed to download file: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
};


const geocodeIndividual = async (address, postcode) => {
  return new Promise((resolve) => {
    if (!MAPBOX_ACCESS_TOKEN) {
      resolve({ lat: null, lng: null });
      return;
    }

    // Build query - if no postcode, just use address + Edinburgh
    let queryText;
    if (postcode && postcode.trim()) {
      queryText = `${address}, ${postcode}, Edinburgh, UK`;
    } else {
      queryText = `${address}, Edinburgh, UK`;
    }
    
    const query = encodeURIComponent(queryText);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=GB&proximity=-3.1883,55.9533&limit=1`;
    
    https.get(url, (response) => {
      let data = '';
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.features && result.features.length > 0) {
            const [lng, lat] = result.features[0].center;
            resolve({ lat, lng });
          } else {
            resolve({ lat: null, lng: null });
          }
        } catch {
          resolve({ lat: null, lng: null });
        }
      });
    }).on('error', () => {
      resolve({ lat: null, lng: null });
    });
  });
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const convertXlsToCsv = async (xlsPath, csvPath) => {
  const workbook = XLSX.readFile(xlsPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to CSV using pipe delimiter to avoid comma conflicts
  const csvData = XLSX.utils.sheet_to_csv(worksheet, { FS: '|' });
  
  // Remove the first line (title) and keep everything from the second line onwards
  const lines = csvData.split('\n');
  
  // Parse the header to find address and postcode columns
  const headerLine = lines[1]; // Second line is the header
  let headers = headerLine.split('|').map(h => h.trim().replace(/"/g, ''));
  
  // Remove trailing empty headers
  while (headers.length > 0 && headers[headers.length - 1] === '') {
    headers.pop();
  }
  
  const addressIndex = headers.findIndex(h => h.toLowerCase().includes('premises address'));
  const postcodeIndex = headers.findIndex(h => h.toLowerCase().includes('postcode'));
  
  console.log('Headers found:', headers);
  console.log(`Found address column at index ${addressIndex} ("${headers[addressIndex]}")`);
  console.log(`Found postcode column at index ${postcodeIndex} ("${headers[postcodeIndex]}")`);
  
  // Create clean header line
  const cleanHeaderLine = headers.join('|') + '|Latitude|Longitude';
  const processedLines = [cleanHeaderLine];
  
  const dataLines = lines.slice(2).filter(line => line.trim() !== '');
  
  // Prepare addresses for batch geocoding
  const addressesToGeocode = [];
  const processedRows = [];
  
  dataLines.forEach((line, i) => {
    let columns = line.split('|').map(col => col.trim());
    
    // Ensure we have the same number of columns as headers (trim to match header count)
    if (columns.length > headers.length) {
      columns = columns.slice(0, headers.length);
    } else {
      // Pad with empty strings if we have fewer columns
      while (columns.length < headers.length) {
        columns.push('');
      }
    }
    
    let addressData = null;
    
    // Collect addresses for geocoding
    if (addressIndex >= 0 && columns[addressIndex]) {
      const address = columns[addressIndex].trim().replace(/"/g, '');
      const postcode = (postcodeIndex >= 0 && columns[postcodeIndex]) ? columns[postcodeIndex].trim().replace(/"/g, '') : '';
      
      if (address) {
        addressData = { address, postcode, rowIndex: i };
        addressesToGeocode.push(addressData);
        if (addressesToGeocode.length <= 3) {
          if (postcode) {
            console.log(`Sample address ${addressesToGeocode.length}: "${address}", "${postcode}"`);
          } else {
            console.log(`Sample address ${addressesToGeocode.length}: "${address}" (no postcode, will add Edinburgh)`);
          }
        }
      }
    }
    
    processedRows.push({ columns, addressData });
  });
  
  console.log(`Found ${addressesToGeocode.length} addresses to geocode`);
  
  // Geocode individually with rate limiting
  const allCoordinates = new Array(addressesToGeocode.length);
  
  console.log(`Starting individual geocoding of ${addressesToGeocode.length} addresses...`);
  console.log('This will take approximately', Math.ceil(addressesToGeocode.length * 0.2 / 60), 'minutes');
  
  for (let i = 0; i < addressesToGeocode.length; i++) {
    const addr = addressesToGeocode[i];
    
    if (i % 100 === 0) {
      console.log(`Progress: ${i + 1}/${addressesToGeocode.length} (${Math.round((i / addressesToGeocode.length) * 100)}%)`);
    }
    
    const coords = await geocodeIndividual(addr.address, addr.postcode);
    allCoordinates[i] = coords;
    
    // Rate limiting - 200ms between requests (5 requests per second, well within free tier limit)
    if (i < addressesToGeocode.length - 1) {
      await delay(200);
    }
  }
  
  console.log('Geocoding complete!');
  
  // Build final CSV with coordinates
  let coordIndex = 0;
  processedRows.forEach((row) => {
    let lat = '', lng = '';
    
    if (row.addressData) {
      const coords = allCoordinates[coordIndex];
      if (coords) {
        lat = coords.lat || '';
        lng = coords.lng || '';
      }
      coordIndex++;
    }
    
    const processedLine = row.columns.join('|') + `|${lat}|${lng}`;
    processedLines.push(processedLine);
  });
  
  const finalCsv = processedLines.join('\n');
  fs.writeFileSync(csvPath, finalCsv);
  
  console.log(`Geocoding complete! Added coordinates to ${processedLines.length - 1} rows.`);
};

async function main() {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    const xlsPath = path.join(dataDir, 'short_term_lets.xls');
    const csvPath = path.join(dataDir, 'short_term_lets.csv');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    console.log('Downloading XLS file...');
    await downloadFile('https://www.edinburgh.gov.uk/downloads/file/32198/short-term-lets', xlsPath);
    
    console.log('Converting XLS to CSV and geocoding addresses...');
    await convertXlsToCsv(xlsPath, csvPath);
    
    console.log('Data processing complete!');
    console.log(`CSV file saved to: ${csvPath}`);
    
  } catch (error) {
    console.error('Error processing data:', error);
    process.exit(1);
  }
}

main();