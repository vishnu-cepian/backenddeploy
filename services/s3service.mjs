import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "../utils/logger-utils.mjs";

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

/**
 * @api {post} /api/s3/s3-presigned-url Generate Upload URL
 * @apiName GetPresignedUploadUrl
 * @apiGroup S3
 * @apiDescription Creates a temporary, secure URL that a client can use to upload a file directly to the S3 bucket, bypassing our server. This is ideal for large files. Expires in 3600.
 *
 * @apiBody {string} fileName The desired key (full path and name) for the object in the S3 bucket.
 * @apiBody {string} fileType The MIME type of the file to be uploaded (e.g., 'image/jpeg', 'application/pdf').
 *
 * @param {string} fileName
 * @param {string} fileType
 * 
 * @apiSuccess {string} presignedUrl The generated URL to which the client should send a PUT request with the file body.
 *
 * @apiError {Error} 500 - Internal Server Error if the AWS SDK fails to generate the URL (e.g., due to invalid credentials or bucket policies).
 */
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
    
/**
 * @api {post} /api/s3/s3-presigned-view-url Generate View URL
 * @apiName GetPresignedViewUrl
 * @apiGroup S3
 * @apiDescription Creates a temporary, secure URL to view or download a private object from the S3 bucket.
 *
 * @apiBody {string} fileName The key (full path and name) of the object in the S3 bucket.
 *
 * @param {string} fileName
 * 
 * @apiSuccess {string} presignedUrl The generated URL to which the client can send a GET request.
 *
 * @apiError {Error} 500 - Internal Server Error if the SDK fails, which could be due to invalid credentials or if the requested file key does not exist.
 */
export const getPresignedViewUrl = async (fileName) => {
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName
        });
        // The URL is valid for 1 hour.
        return getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (error) {
        logger.error(`Failed to generate presigned view URL for key: ${fileName}`, error);
        // Return null or a default URL to prevent breaking Promise.all in other services
        return null;
    }
};

/**
 * @api {delete} /api/s3/s3-delete-file/:fileName Delete S3 File
 * @apiName DeleteS3File
 * @apiGroup S3
 * @apiDescription Permanently deletes an object from the S3 bucket.
 *
 * @apiParam {string} fileName The key (full path and name) of the object to delete.
 *
 * @param {string} fileName
 * 
 * @apiSuccess {string} message A success confirmation message.
 *
 * @apiError {Error} 500 - Internal Server Error if the SDK fails to delete the object.
 */
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

/**
 * @api {post} /api/s3/s3-presigned-url-public-bucket Generate Upload URL
 * @apiName GetPresignedUploadUrlPublicBucket
 * @apiGroup S3
 * @apiDescription Creates a temporary, secure URL that a client can use to upload a file directly to the public S3 bucket, bypassing our server. This is ideal for large files. Expires in 3600.
 *
 * @apiBody {string} fileName The desired key (full path and name) for the object in the public S3 bucket.
 * @apiBody {string} fileType The MIME type of the file to be uploaded (e.g., 'image/jpeg', 'application/pdf').
 *
 * @param {string} fileName
 * @param {string} fileType
 * 
 * @apiSuccess {string} presignedUrl The generated URL to which the client should send a PUT request with the file body.
 *
 * @apiError {Error} 500 - Internal Server Error if the AWS SDK fails to generate the URL (e.g., due to invalid credentials or bucket policies).
 */
export const getPresignedUrlPublicBucket = async (fileName, fileType) => {
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_PUBLIC_BUCKET_NAME,
        Key: fileName,
        ContentType: fileType
    });
    const presignedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600 // 1 hour
    });
    return { presignedUrl, command };
};