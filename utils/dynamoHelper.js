// Helper function to flatten DynamoDB response
const { ScanCommand } = require('@aws-sdk/client-dynamodb');  // AWS SDK v3
const client = require('../aws/dbClient'); // Ensure DynamoDB client is imported

const flattenDynamoDBItem = (item) => {
    let flattened = {};
    for (const key in item) {
      flattened[key] = item[key].S || item[key].N || item[key].BOOL || item[key].NULL || item[key].M || item[key].L;
    }
    return flattened;
  };
  
// Helper function to parse length range
const parseLengthRange = (length) => {
    const attributeName = "#len"; // Alias for reserved keyword 'length'

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

// Peform DB Scan to look for EXGRIP combinations
async function performDynamoDBScan(params) {
    let result = [];
    let lastEvaluatedKey = null;
    let attempts = 0;
    const maxAttempts = 5;

    do {
        try {
            if (lastEvaluatedKey) {
                params.ExclusiveStartKey = lastEvaluatedKey;
            }

            const scanCommand = new ScanCommand(params);
            const scanResult = await client.send(scanCommand);

            const flattenedItems = scanResult.Items.map(flattenDynamoDBItem);
            result = result.concat(flattenedItems);
            lastEvaluatedKey = scanResult.LastEvaluatedKey;

            // Reset attempts if successful
            attempts = 0;

        } catch (error) {
            if (error.name === 'ProvisionedThroughputExceededException' && attempts < maxAttempts) {
                const delay = Math.pow(2, attempts) * 100; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                attempts++;
            } else {
                throw error; // If not the expected error or too many retries, rethrow
            }
        }
    } while (lastEvaluatedKey && attempts < maxAttempts);

    return result;
}


module.exports = {
    flattenDynamoDBItem,
    parseLengthRange,
    performDynamoDBScan
};
