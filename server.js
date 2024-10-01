const express = require('express');
const cors = require('cors');
const path = require('path'); // Import path module

const client = require('./aws/dbClient');  // Import the DynamoDB client
const { parseLengthRange, performDynamoDBScan } = require('./utils/dynamoHelper');
const { checkFileExistsInS3, getPresignedUrl } = require('./aws/s3Client');

// Load environment variables from .env file
require('dotenv').config(); 

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

    if (item.boreDiameter) {
      filterExpression.push("boreDiameter = :boreDiameter");
      expressionAttributeValues[":boreDiameter"] = { S: item.boreDiameter };
    }

    if (item.edgeRadius) {
      filterExpression.push("edgeRadius = :edgeRadius");
      expressionAttributeValues[":edgeRadius"] = { S: item.edgeRadius };
    }

    if (item.cuttingDiameter) {
      filterExpression.push("cuttingDiameter = :cuttingDiameter");
      expressionAttributeValues[":cuttingDiameter"] = { S: item.cuttingDiameter };
    }

    // Join the filter expressions with AND
    const finalFilterExpression = filterExpression.join(' AND ');

    // Perform the DB scan operation
    const params = {
      TableName: process.env.AWS_DB_TABLE_NAME,
      FilterExpression: finalFilterExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: {
        "#len": "length"  // Map the reserved keyword 'length' to '#len'
      }
    };

    const result = await performDynamoDBScan(params); // Use await here

    if (result.length === 0) {
      return res.status(404).json({ message: "No items found matching the criteria." });
    }

    // Loop through each result and add the S3 file path
    const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
    await Promise.all(result.map(async (currentItem) => {
      const stlPath = "3d-files/" + currentItem.spindle + "/" + currentItem.id + ".STL";
      const stepPath = "3d-files/" + currentItem.spindle + "/" + currentItem.id + ".step";

      // Check if the STL file exists
      const [stlExists, stepExists] = await Promise.all([
          checkFileExistsInS3(BUCKET_NAME, stlPath),
          checkFileExistsInS3(BUCKET_NAME, stepPath)
      ]);
  
      // If STL exists, generate presigned URL
      currentItem.stlFilePath = stlExists
          ? await getPresignedUrl(BUCKET_NAME, stlPath)
          : 'NA';
  
      // If STEP exists, generate presigned URL
      currentItem.stepFilePath = stepExists
          ? await getPresignedUrl(BUCKET_NAME, stepPath)
          : 'NA';
    }));

    if (result.length === 0) {
      return res.status(404).json({ message: "No items found matching the criteria in S3." });
    }

    // return the final result
    return res.json(result);

  } catch (error) {
    console.error("Error processing data:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
  
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
