const { S3Client, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Create S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const checkFileExistsInS3 = async (bucket, key) => {
  try {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
    await s3Client.send(command);
    return true; // File exists
  } catch (error) {
    if (error.name === 'NotFound') {
      return false; // File doesn't exist
    }
    throw error;
  }
};

const getPresignedUrl = async (bucket, key) => {
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
      return url;
    } catch (error) {
      console.error("Error generating pre-signed URL", error);
      throw error;
    }
};

module.exports = {
  s3Client,
  checkFileExistsInS3,
  getPresignedUrl
};
