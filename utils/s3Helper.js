const constructS3FilePaths = (spindle, masterHolderSKU, extensionAdapterSKU, clampingExtensionSKU) => {
    // Remove 'EXGRIP-' prefix and skip 'NA' values
    const cleanSKU = (sku) => sku.replace('EXGRIP-', '');
    
    // Build the base file name by concatenating the SKUs
    let baseFileName = cleanSKU(masterHolderSKU);
    
    if (extensionAdapterSKU !== 'NA') {
      baseFileName += `+${cleanSKU(extensionAdapterSKU)}`;
    }
    
    baseFileName += `+${cleanSKU(clampingExtensionSKU)}`;
  
    // Construct the full paths for STL and STEP files
    const stlFilePath = `3d-files/${spindle}/${baseFileName}.STL`;
    const stepFilePath = `3d-files/${spindle}/${baseFileName}.step`;
  
    return { stlFilePath, stepFilePath };
  };
  
  module.exports = {
    constructS3FilePaths,
  };
  