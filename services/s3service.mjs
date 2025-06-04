import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

export const getPresignedUrl = async (fileName, fileType) => {
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        ContentType: fileType
    });
    const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600 // 1 hour
    });
    return { presignedUrl, command };
};
    
export const getPresignedViewUrl = async (fileName) => {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName
    });
    const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600 // 1 hour
    });
    return presignedUrl;
};

export const deleteFile = async (fileName) => {
    const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName
    });
    await s3Client.send(command);
    return {
        message: "File deleted successfully"
    };
};
