// Helper function to flatten DynamoDB response
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

module.exports = {
    flattenDynamoDBItem,
    parseLengthRange,
};
