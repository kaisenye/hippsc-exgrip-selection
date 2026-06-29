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

// Fixed length buckets (contiguous, non-overlapping). Order = display order.
const LENGTH_BUCKETS = [
    { label: '<=200',   test: (n) => n <= 200 },
    { label: '201-250', test: (n) => n >= 201 && n <= 250 },
    { label: '251-300', test: (n) => n >= 251 && n <= 300 },
    { label: '301-400', test: (n) => n >= 301 && n <= 400 },
    { label: '401-450', test: (n) => n >= 401 && n <= 450 },
    { label: '451-500', test: (n) => n >= 451 && n <= 500 },
    { label: '501-600', test: (n) => n >= 501 && n <= 600 },
    { label: '>600',    test: (n) => n > 600 },
];

// Map a list of raw numeric lengths to the non-empty bucket labels, in fixed order
const bucketizeLengths = (rawLengths) => {
    const nums = rawLengths.map(Number).filter((n) => !Number.isNaN(n));
    return LENGTH_BUCKETS.filter((b) => nums.some((n) => b.test(n))).map((b) => b.label);
};

// toolType -> which sub-spec field that family uses
const TOOLTYPE_SUBSPEC = {
    'Standard End Mills': 'boreDiameter',
    'Exchangeable Head Mills': 'thread',
    'EXGRIP Ball Nose End Mills': 'cuttingDiameter',
    'EXGRIP Tapered Ball Nose End Mills': 'edgeRadius',
};

// Build a DynamoDB FilterExpression from a partial selections object.
// Returns { filterExpression, expressionAttributeValues, usesLength }.
const buildFilterFromSelections = (selections = {}) => {
    const filterExpression = [];
    const expressionAttributeValues = {};
    let usesLength = false;

    if (selections.spindle) {
        filterExpression.push('spindle = :spindle');
        expressionAttributeValues[':spindle'] = { S: selections.spindle };
    }

    if (selections.length) {
        const lengthFilter = parseLengthRange(selections.length);
        filterExpression.push(lengthFilter.expression);
        Object.assign(expressionAttributeValues, lengthFilter.values);
        usesLength = true;
    }

    if (selections.holderAngle) {
        filterExpression.push('holderAngle = :holderAngle');
        expressionAttributeValues[':holderAngle'] = { S: selections.holderAngle };
    }

    if (selections.extensionAngle) {
        filterExpression.push('extensionAngle = :extensionAngle');
        expressionAttributeValues[':extensionAngle'] = { S: selections.extensionAngle };
    }

    if (selections.toolType) {
        filterExpression.push('toolType = :toolType');
        expressionAttributeValues[':toolType'] = { S: selections.toolType };
    }

    if (selections.thread) {
        filterExpression.push('thread = :thread');
        expressionAttributeValues[':thread'] = { S: selections.thread };
    }

    if (selections.boreDiameter) {
        filterExpression.push('boreDiameter = :boreDiameter');
        expressionAttributeValues[':boreDiameter'] = { S: selections.boreDiameter };
    }

    if (selections.edgeRadius) {
        filterExpression.push('edgeRadius = :edgeRadius');
        expressionAttributeValues[':edgeRadius'] = { S: selections.edgeRadius };
    }

    if (selections.cuttingDiameter) {
        filterExpression.push('cuttingDiameter = :cuttingDiameter');
        expressionAttributeValues[':cuttingDiameter'] = { S: selections.cuttingDiameter };
    }

    return {
        filterExpression: filterExpression.join(' AND '),
        expressionAttributeValues,
        usesLength,
    };
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
    performDynamoDBScan,
    LENGTH_BUCKETS,
    bucketizeLengths,
    TOOLTYPE_SUBSPEC,
    buildFilterFromSelections
};
