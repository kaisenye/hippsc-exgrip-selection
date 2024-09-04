const express = require('express');
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');  // AWS SDK v3
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path'); // Import path module

require('dotenv').config(); // Load environment variables from .env file

// Set up the Express app
const app = express();

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
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Define the table name
const tableName = 'exgrip-combinations';

// Default GET route ("/")
app.get('/', (req, res) => {
  res.send("Hello World");
});

// Function to flatten DynamoDB response
const flattenDynamoDBItem = (item) => {
  let flattened = {};
  for (const key in item) {
    flattened[key] = item[key].S || item[key].N || item[key].BOOL || item[key].NULL || item[key].M || item[key].L;
  }
  return flattened;
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

module.exports = app;
