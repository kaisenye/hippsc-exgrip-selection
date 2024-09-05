import express from 'express';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';  // AWS SDK v3
import '@shopify/shopify-api/adapters/node';
import { shopifyApi } from '@shopify/shopify-api';
import cors from 'cors';
import path from 'path'; // Import path module
import dotenv from 'dotenv'; // Load environment variables

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Load environment variables from .env file
dotenv.config();

// Shopify Admin API configuration
const shopify = shopifyApi({
  // The next 4 values are typically read from environment variables for added security
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ['read_products'],
  hostName: 'ngrok-tunnel-address',
});

// Set up the Express app
const app = express();

// Shopify session
const session = {
  shop: process.env.SHOPIFY_SHOP,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
};

const shopifyClient = new shopify.clients.Graphql({session});

// Serve favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'));
});

// Middleware to handle CORS (Cross-Origin Resource Sharing)
app.use(cors({
    origin: '*', // Allow requests from any origin
    methods: ['GET', 'POST'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
    credentials: true
}));

// Middleware to parse JSON request body
app.use(express.json());

// AWS SDK v3 configuration for DynamoDB
const tableName = 'exgrip-combinations';
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Function to flatten DynamoDB response
const flattenDynamoDBItem = (item) => {
  let flattened = {};
  for (const key in item) {
    flattened[key] = item[key].S || item[key].N || item[key].BOOL || item[key].NULL || item[key].M || item[key].L;
  }
  return flattened;
};

// Function to get product handle by SKU using Shopify Admin API
const getProductHandleBySKU = async (sku) => {
  // Skip invalid SKUs like "NA"
  if (!sku || sku === "NA") {
    console.log(`Skipping invalid SKU: ${sku}`);
    return null;
  }

  // GraphQL query to fetch product handle by SKU
  const productByHandle = `
    query($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
        handle
      } 
    }
  `;

  // Send the query to Shopify Admin API
  try {
    console.log(`Sending query for SKU: ${sku}`);  // Log the SKU being queried

    const products = await shopifyClient.request(productByHandle, {
      variables: {first: 1, handle: "exgrip-system-master-tool-holder-bbt40"},
      // headers: {myHeader: '1'},
      retries: 1,
    });
    
    console.log(`Products for SKU: ${sku}`, products);

    return null;

  } catch (error) {
    if (error.response) {
      console.error(`Error fetching product handle for SKU: ${sku}`);
      console.error('Error Response:', error.response.data);
      console.error(`Status: ${error.response.status} | StatusText: ${error.response.statusText}`);
    } else {
      console.error('Error Message:', error.message);
    }
    return null;
  }
};

// POST route for processing data ("/process-data/")
app.post('/process-data', async (req, res) => {
  try {
    const item = req.body;

    // Initialize the filter expression and expression values
    let filterExpression = [];
    let expressionAttributeValues = {};

    // Build dynamic filter expression based on request body fields
    if (item.spindle) {
      filterExpression.push("spindle = :spindle");
      expressionAttributeValues[":spindle"] = { S: item.spindle };
    }

    // Handle length range
    if (item.length) {
      const lengthFilter = parseLengthRange(item.length);
      filterExpression.push(lengthFilter.expression);
      Object.assign(expressionAttributeValues, lengthFilter.values);
    }

    if (item.holderAngle) {
      filterExpression.push("holderAngle = :holderAngle");
      expressionAttributeValues[":holderAngle"] = { S: item.holderAngle };
    }

    if (item.extensionAngle) {
      filterExpression.push("extensionAngle = :extensionAngle");
      expressionAttributeValues[":extensionAngle"] = { S: item.extensionAngle };
    }

    if (item.toolType) {
      filterExpression.push("toolType = :toolType");
      expressionAttributeValues[":toolType"] = { S: item.toolType };
    }

    if (item.thread) {
      filterExpression.push("thread = :thread");
      expressionAttributeValues[":thread"] = { S: item.thread };
    }

    // Join the filter expressions with AND
    const finalFilterExpression = filterExpression.join(' AND ');

    // Perform the scan operation
    const params = {
      TableName: tableName,
      FilterExpression: finalFilterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: {
        "#len": "length"  // Map the reserved keyword 'length' to '#len'
      }
    };

    let result = [];
    let lastEvaluatedKey = null;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const scanCommand = new ScanCommand(params);
      const scanResult = await client.send(scanCommand);
      
      // Flatten each item in the result
      const flattenedItems = scanResult.Items.map(flattenDynamoDBItem);
      console.log(`Fetched ${flattenedItems.length} items from DynamoDB`);

      // For each item, fetch the product handle for each SKU
      console.log("Fetching product handles...");
      for (const item of flattenedItems) {
        // Skip invalid SKUs like "NA"
        item.productHandleMasterHolder = await getProductHandleBySKU(item.productSKUMasterHolder);
        item.productHandleExtensionAdapter = await getProductHandleBySKU(item.productSKUExtensionAdapter);
        item.productHandleClampingExtension = await getProductHandleBySKU(item.productSKUClampingExtension);
      }

      result = result.concat(flattenedItems);

      lastEvaluatedKey = scanResult.LastEvaluatedKey;

    } while (lastEvaluatedKey);

    if (result.length === 0) {
      return res.status(404).json({ message: "No items found matching the criteria." });
    }

    return res.json(result);

  } catch (error) {
    console.error("Error processing data:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
  
// Parse the length range filter from the frontend
const parseLengthRange = (length) => {
    const attributeName = "#len";  // Alias for the reserved keyword 'length'
  
    if (length.startsWith('<='))
      return { expression: `${attributeName} <= :length`, values: { ":length": { N: length.slice(2) } }, names: { "#len": "length" } };
  
    if (length.includes('-')) {
      const [start, end] = length.split('-');
      return {
        expression: `${attributeName} BETWEEN :start AND :end`,
        values: { ":start": { N: start }, ":end": { N: end } },
        names: { "#len": "length" }
      };
    }
  
    if (length.startsWith('>'))
      return { expression: `${attributeName} > :length`, values: { ":length": { N: length.slice(1) } }, names: { "#len": "length" } };
  
    return { expression: `${attributeName} = :length`, values: { ":length": { N: length } }, names: { "#len": "length" } };
  };
  
// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start the server locally
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;