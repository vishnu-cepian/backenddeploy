import { z } from "zod";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { User } from "../entities/User.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { VendorAudit } from "../entities/VendorAudit.mjs";
import { OtpPhone } from "../entities/OtpPhone.mjs";
import { VendorImages } from "../entities/VendorImages.mjs";
import { getPresignedViewUrl, deleteFile } from "./s3service.mjs";
import { cacheOrFetch, delCache } from "../utils/cache.mjs";
import { VENDOR_STATUS, SHOP_TYPE, OWNERSHIP_TYPE, SERVICE_TYPE } from "../types/enums/index.mjs";
import { redis } from "../config/redis-config.mjs";

const userRepo = AppDataSource.getRepository(User);
const vendorRepo = AppDataSource.getRepository(Vendors);
const vendorAuditRepo = AppDataSource.getRepository(VendorAudit);
const vendorImagesRepo = AppDataSource.getRepository(VendorImages);

//============================ ZOD VALIDATION SCHEMAS ==============================================
/**
 * Zod schema for data validation.
 * Ensures that all incoming data is in the correct format.
 */

const checkProfileSchema = z.object({
  userId: z.string().uuid({ message: "Invalid User ID format" }),
});

const completeProfileSchema = z.object({
  userId: z.string().uuid(),
  phoneNumber: z.string().regex(/^(?:\+91|91)?[6789]\d{9}$/, { message: "Invalid Indian phone number format" }),
  otp: z.string().length(6, { message: "OTP must be 6 digits" }),
  latitude: z.string().min(1),
  longitude: z.string().min(1),
  aadhaarNumber: z.string().length(12, { message: "Aadhaar number must be 12 digits" }),
  aadhaarUrlPath: z.string().min(1),
  shopType: z.enum(Object.values(SHOP_TYPE)),
  serviceType: z.enum(Object.values(SERVICE_TYPE)),
  shopName: z.string().min(1),
  address: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().length(6, { message: "Pincode must be 6 digits" }),
  shopDescription: z.string().min(1),
  accountHolderName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifscCode: z.string().min(1),
  bankPassbookUrlPath: z.string().min(1),
  
  ownershipType: z.enum(Object.values(OWNERSHIP_TYPE)).optional().nullable().default(null),
  vendorServices: z.string().optional(),
  shopDocumentUrlPath: z.string().optional(),
});
//============================ CONSTANTS ==============================================

const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 300; // 5 minutes
const ATTEMPT_WINDOW_SECONDS = 300; // 5 minutes

//============================ VENDOR SERVICE FUNCTIONS ==============================================

/**
 * Check if the vendor profile exists and is complete.
 * @param {Object} data - The data containing the user ID.
 * @returns {Promise<Object>} - The result of the check.
 */
export const checkProfile = async (data) => {
  try {
    const { userId } = checkProfileSchema.parse(data);

    const vendor = await vendorRepo.createQueryBuilder("vendors")
    .select("vendors.status", "status")
    .where("vendors.userId = :userId", { userId })
    .getRawOne();

    if (!vendor) {
      return {
        exists: false,
        message: "Vendor profile not complete => redirect to vendor profile",
      };
    }

    if (vendor.status === VENDOR_STATUS.PENDING) {
      return {
        exists: true,
        status: "PENDING",
        message: "Vendor profile not verified => redirect to vendor verification pending status page",
      };
    }

    if (vendor.status === VENDOR_STATUS.REJECTED) {
      return {
        exists: true,
        status: "REJECTED",
        message: "Vendor profile rejected => redirect to vendor verification rejected status page",
      };
    }

    if (vendor.status === VENDOR_STATUS.BLOCKED) {
      return {
        exists: true,
        status: "BLOCKED",
        message: "Vendor profile blocked => redirect to vendor verification blocked status page",
      };
    }

    return {
      exists: true,
      status: VENDOR_STATUS.VERIFIED,
      message: "Vendor profile complete => redirect to vendor dashboard",
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("checkProfile validation failed", { errors: error.flatten().fieldErrors });
      throw sendError("Invalid data provided.", 400, error.flatten().fieldErrors);
    }
    logger.error("checkProfile error",  error );
    throw error;
  }
};

/**
 * Complete the vendor profile.
 * @param {Object} data - The data containing the user ID, phone number, OTP, latitude, longitude, and profile data.
 * @param {Object} deviceInfo - The device information.
 * @returns {Promise<Object>} - The result of the completion.
 */
export const completeProfile = async (data, deviceInfo) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const {userId, phoneNumber, otp, latitude, longitude, ...profileData} = completeProfileSchema.parse(data);
    
    const lockoutKey = `otp-lockout:${phoneNumber}`;
    const attemptKey = `otp-attempt:${phoneNumber}`;

    const { ip, ...deviceData } = deviceInfo;
    
    const isLockedOut = await redis.get(lockoutKey);
    if (isLockedOut) {
      throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);
    }

    const vendorExists = await queryRunner.manager.exists(Vendors, { where: { userId } });
    if (vendorExists) {
      throw sendError('A vendor profile for this user already exists.', 409);
    }

    const otpRecord = await queryRunner.manager.findOne(OtpPhone, { where: { phone: phoneNumber } });
    if (!otpRecord) {
      throw sendError('Invalid or expired OTP. Please request a new one.', 400);
    }
    if (new Date() > otpRecord.expiresAt) {
      await queryRunner.manager.delete(OtpPhone, { phone: phoneNumber });
      throw sendError('This OTP has expired. Please request a new one.', 400);
    }
    if (otpRecord.otp !== otp) {
      const attempts = await redis.incr(attemptKey);

      if (attempts === 1) {
        await redis.expire(attemptKey, ATTEMPT_WINDOW_SECONDS);
      }

      if (attempts >= MAX_OTP_ATTEMPTS) {
        await redis.set(lockoutKey, 'locked', 'EX', LOCKOUT_DURATION_SECONDS);
        await queryRunner.manager.delete(OtpPhone, { phone: phoneNumber });
        await redis.del(attemptKey);
        logger.warn(`OTP verification locked for phone: ${phoneNumber}`);
        throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);
      }
      throw sendError('Invalid OTP.', 400);
    }

    await queryRunner.manager.delete(OtpPhone, { phone: phoneNumber });
    await redis.del(attemptKey);

    const newVendor = queryRunner.manager.create(Vendors, {
      userId: userId,
      ...profileData,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
      status: VENDOR_STATUS.PENDING,
    });

    await queryRunner.manager.save(Vendors, newVendor);
    if (!newVendor) throw sendError('Vendor profile creation failed',400);
   

    const vendorAudit = queryRunner.manager.create(VendorAudit, {
      vendorId: newVendor.id,
      otpVerifiedAt: new Date(),
      toc: true,
      ip: ip,
      deviceInfo: deviceData,
    });
    await queryRunner.manager.save(VendorAudit, vendorAudit);

    if (!vendorAudit) throw sendError('Vendor audit creation failed',400);

    await queryRunner.commitTransaction();

    /**
     * 
     * 
     * 
     * 
     * 
     *  SEND NOTIFICATION TO ADMIN
     *  SEND NOTIFICATION/EMAIL TO USER
     * 
     * 
     * 
     * 
     * 
     */
    return {
      isProfileCompleted: true,
      message: "Vendor profile created successfully, please wait for admin approval",
    };
  } catch (error) {
    await queryRunner.rollbackTransaction();

    if (error instanceof z.ZodError) {
      logger.warn("completeProfile validation failed", { errors: error.flatten().fieldErrors });
      throw sendError("Invalid data provided.", 400, error.flatten().fieldErrors);
    }
    logger.error("completeProfile error", error);
    throw error;
  } finally {
    await queryRunner.release();
  }
};

export const getVendorDetails = async (data) => {
  try {
    const { userId } = data;
    return cacheOrFetch(`vendorDetails:${userId}`, async () => {
      const vendor = await vendorRepo.createQueryBuilder("vendors")
      .leftJoin("vendors.user", "user")
      .select([
        "vendors.id",
        "user.name",
        "vendors.shopName",
        "vendors.serviceType",
        "vendors.vendorServices",
        "vendors.city",
        "vendors.state",
        "vendors.shopDescription",
        "vendors.allTimeRating",
        "vendors.allTimeReviewCount",
        "vendors.currentMonthRating",
        "vendors.currentMonthReviewCount",
        "vendors.currentMonthBayesianScore",
        "vendors.vendorAvatarUrlPath",
        "vendors.shopImageUrlPath",
      ])
      .where("vendors.userId = :userId", { userId })
      .getOne();
  
      if (!vendor) {
        return {
          message: "Vendor not found",
        };
      }
      return {
        message: "Vendor details fetched successfully",
        vendor,
      };
    }, 300);
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const saveVendorAvatarUrl = async (data) => {
  try {
    const { s3Key, userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    vendor.vendorAvatarUrlPath = s3Key;
    await vendorRepo.save(vendor);

    return {
      message: "Vendor avatar url saved successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const getVendorAvatarUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    const presignedUrl = await getPresignedViewUrl(vendor.vendorAvatarUrlPath);

    return {
      message: "Vendor avatar url fetched successfully",
      presignedUrl,
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const deleteVendorAvatarUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }
    await deleteFile(vendor.vendorAvatarUrlPath);
    vendor.vendorAvatarUrlPath = null;
    await vendorRepo.save(vendor);

    return {
      message: "Vendor avatar url deleted successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const saveShopImageUrl = async (data) => {
  try {
    const { s3Key, userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    vendor.shopImageUrlPath = s3Key;
    await vendorRepo.save(vendor);

    return {
      message: "Shop image url saved successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const getShopImageUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    const presignedUrl = await getPresignedViewUrl(vendor.shopImageUrlPath);

    return {
      message: "Shop image url fetched successfully",
      presignedUrl,
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const deleteShopImageUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    await deleteFile(vendor.shopImageUrlPath);
    vendor.shopImageUrlPath = null;
    await vendorRepo.save(vendor);

    return {
      message: "Shop image url deleted successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const saveWorkImageUrl = async (data) => {
  try {
    const { s3Key, userId } = data;
    
    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    const vendorImage = vendorImagesRepo.create({
      vendorId: vendor.id,
      s3Key: s3Key,
      uploadedAt: new Date(),
    });

    await vendorImagesRepo.save(vendorImage);

    await delCache(`vendorWorkImages:${userId}`);

    return {
      message: "Work image url saved successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const getVendorWorkImages = async (data) => {
  try {
    const { userId } = data;
    return cacheOrFetch(`vendorWorkImages:${userId}`, async () => {
      const vendor = await vendorRepo.findOne({
        where: { userId: userId },
      });

      if (!vendor) {
        throw sendError('Vendor not found',400);
      }

      const vendorImages = await vendorImagesRepo.find({
        where: { vendorId: vendor.id },
        order: {
          uploadedAt: "DESC",
        },
      });

      const workImages = await Promise.all(vendorImages.map(async (image) => {
        const presignedUrl = await getPresignedViewUrl(image.s3Key);
        return {
          ...image,
          presignedUrl,
        };
      }));

      return {
        message: "Vendor work images fetched successfully",
        workImages,
      };
    }, 300);
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

export const deleteVendorWorkImage = async (data) => {
  try {
    const { s3Key, userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (!vendor) {
      throw sendError('Vendor not found',400);
    }

    const vendorImage = await vendorImagesRepo.findOne({
      where: { vendorId: vendor.id, s3Key: s3Key },
    });

    if (!vendorImage) {
      throw sendError('Vendor work image not found',400);
    }

    await deleteFile(vendorImage.s3Key);
    await vendorImagesRepo.delete(vendorImage);

    await delCache(`vendorWorkImages:${userId}`);

    return {
      message: "Vendor work image deleted successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}