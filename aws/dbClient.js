const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

// Load environment variables from .env file
require('dotenv').config(); 

// Create DynamoDB client using environment variables
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

module.exports = client;
