import { z } from "zod";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { VendorAudit } from "../entities/VendorAudit.mjs";
import { OtpPhone } from "../entities/OtpPhone.mjs";
import { VendorImages } from "../entities/VendorImages.mjs";
import { getPresignedViewUrl, deleteFile } from "./s3service.mjs";
import { cacheOrFetch, delCache } from "../utils/cache.mjs";
import { VENDOR_STATUS, SHOP_TYPE, SERVICE_TYPE, ORDER_VENDOR_STATUS } from "../types/enums/index.mjs";
import { redis } from "../config/redis-config.mjs";
import { emailQueue } from "../queues/notification/email/emailQueue.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderItems } from "../entities/OrderItems.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { VendorStats } from "../entities/VendorStats.mjs";
import { Complaints } from "../entities/Complaints.mjs";
import { Payouts } from "../entities/Payouts.mjs";
import { In } from "typeorm";
import { Rating } from "../entities/Rating.mjs";

const vendorRepo = AppDataSource.getRepository(Vendors);
const vendorImagesRepo = AppDataSource.getRepository(VendorImages);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const orderRepo = AppDataSource.getRepository(Orders);
const orderItemsRepo = AppDataSource.getRepository(OrderItems);
const quoteRepo = AppDataSource.getRepository(OrderQuotes);
const vendorStatsRepo = AppDataSource.getRepository(VendorStats);
const payoutRepo = AppDataSource.getRepository(Payouts);
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
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional().nullable(),
  street: z.string().min(1),
  district: z.string().min(1),
  landmark: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().length(6, { message: "Pincode must be 6 digits" }),
  shopDescription: z.string().min(1),
  accountHolderName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifscCode: z.string().min(1),
  bankPassbookUrlPath: z.string().min(1),
  
  ownershipType: z.string().optional(),
  vendorServices: z.string().optional(),
  shopDocumentUrlPath: z.string().optional(),
});

const getVendorOrdersSchema = z.object({
  userId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10),
  status: z.enum([...Object.values(ORDER_VENDOR_STATUS)]),
});

const addComplaintSchema = z.object({
  userId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  complaint: z.string().min(1, { message: "Complaint is required" }),
})

const getVendorReviewsSchema = z.object({
  userId: z.string().uuid(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10),
})

//============================ CONSTANTS ==============================================

const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 300; // 5 minutes
const ATTEMPT_WINDOW_SECONDS = 300; // 5 minutes

//============================ VENDOR SERVICE FUNCTIONS ==============================================

/**
 * @api {get} /api/vendor/checkProfile Check Vendor Profile Status
 * @apiName CheckProfile
 * @apiGroup Vendor
 * @apiDescription Checks if a vendor profile exists for the user and returns its current status.
 *
 * @param {Object} data - The data containing the user ID.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the check.
 * 
 * @apiSuccess {boolean} exists - Whether a vendor profile exists.
 * @apiSuccess {string} [status] - The current status of the profile ('PENDING', 'VERIFIED', 'REJECTED', 'BLOCKED').
 * @apiSuccess {string} message - A descriptive message about the profile status.
 *
 * @apiError {Error} 400 - If the user ID is invalid.
 * @apiError {Error} 500 - Internal Server Error.
 */
export const checkProfile = async (data) => {
  try {
    const { userId } = checkProfileSchema.parse(data);

    const vendor = await vendorRepo.findOne({ 
      where: { userId }, 
      select: { status: true } 
    });

    if (!vendor) {
      return { exists: false, message: "Vendor profile not found. Please complete your profile." };
    }

    const statusMessages = {
      [VENDOR_STATUS.PENDING]: "Your profile is under review. Please wait for admin approval.",
      [VENDOR_STATUS.REJECTED]: "Your profile has been rejected. Please check for communications from the admin.",
      [VENDOR_STATUS.BLOCKED]: "Your account has been blocked. Please contact support.",
      [VENDOR_STATUS.VERIFIED]: "Vendor profile is verified and active."
    };

    return {
        exists: true,
        status: vendor.status,
        message: statusMessages[vendor.status] || "Unknown profile status."
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
 * @api {post} /api/vendor/completeProfile Complete Vendor Profile
 * @apiName CompleteProfile
 * @apiGroup Vendor
 * @apiDescription Handles the full vendor onboarding process by verifying the OTP and saving the profile data within a single transaction. Sends notifications to admin and user.
 *
 * @apiParam {string} userId - The user's UUID.
 * @apiParam {string} phoneNumber - The phone number of the user.
 * @apiParam {string} otp - The OTP received by the user.
 * @apiParam {string} latitude - The latitude of the user.
 * @apiParam {string} longitude - The longitude of the user.
 * @apiParam {string} aadhaarNumber - The Aadhaar number of the user.
 * @apiParam {string} aadhaarUrlPath - The Aadhaar URL path of the user.
 * @apiParam {string} shopType - The type of shop the user has.
 * @apiParam {string} serviceType - The type of service the user provides.
 * @apiParam {string} shopName - The name of the shop.
 * @apiParam {string} addressLine1 - The first line of the address.
 * @apiParam {string} addressLine2 - The second line of the address(optional).
 * @apiParam {string} street - The street of the address.
 * @apiParam {string} district - The district of the address.
 * @apiParam {string} landmark - The landmark of the address(optional).
 * @apiParam {string} city - The city of the address.
 * @apiParam {string} state - The state of the address.
 * @apiParam {string} pincode - The pincode of the address.
 * @apiParam {string} shopDescription - The description of the shop.
 * @apiParam {string} accountHolderName - The name of the account holder.
 * @apiParam {string} accountNumber - The account number.
 * @apiParam {string} ifscCode - The IFSC code.
 * @apiParam {string} bankPassbookUrlPath - The bank passbook URL path.
 * @apiParam {string} ownershipType - The ownership type of the user(optional).
 * @apiParam {string} vendorServices - The services the user provides(optional).
 * @apiParam {string} shopDocumentUrlPath - The shop document URL path(optional).
 
 * @param {Object} data - The data containing the user ID, phone number, OTP, latitude, longitude, and profile data.
 * @param {string} data.userId - The user's UUID.
 * @param {string} data.phoneNumber - The phone number of the user.
 * @param {string} data.otp - The OTP received by the user.
 * @param {string} data.latitude - The latitude of the user.
 * @param {string} data.longitude - The longitude of the user.
 * @param {string} data.aadhaarNumber - The Aadhaar number of the user.
 * @param {string} data.aadhaarUrlPath - The Aadhaar URL path of the user.
 * @param {string} data.shopType - The type of shop the user has.
 * @param {string} data.serviceType - The type of service the user provides.
 * @param {string} data.shopName - The name of the shop.
 * @param {string} data.addressLine1 - The first line of the address.
 * @param {string} data.addressLine2 - The second line of the address(optional).
 * @param {string} data.street - The street of the address.
 * @param {string} data.district - The district of the address.
 * @param {string} data.landmark - The landmark of the address(optional).
 * @param {string} data.city - The city of the address.
 * @param {string} data.state - The state of the address.
 * @param {string} data.pincode - The pincode of the address.
 * @param {string} data.shopDescription - The description of the shop.
 * @param {string} data.accountHolderName - The name of the account holder.
 * @param {string} data.accountNumber - The account number.
 * @param {string} data.ifscCode - The IFSC code.
 * @param {string} data.bankPassbookUrlPath - The bank passbook URL path.
 * @param {string} data.ownershipType - The ownership type of the user(optional).
 * @param {string} data.vendorServices - The services the user provides(optional).
 * @param {string} data.shopDocumentUrlPath - The shop document URL path(optional).
 * @param {Object} deviceInfo - The device information.
 * @param {string} deviceInfo.ip - The IP address of the device.
 * @param {string} deviceInfo.device - The type of device.
 * @param {string} deviceInfo.browser - The name of the browser.
 * @param {string} deviceInfo.version - The version of the browser.
 * @param {string} deviceInfo.platform - The platform of the device.
 * @returns {Promise<Object>} - The result of the completion.
 * 
 * @apiSuccess {boolean} isProfileCompleted - Whether the profile is completed.
 * @apiSuccess {string} message - A descriptive message about the profile completion.
 * 
 * @apiError {Error} 400 - If the user ID is invalid or invalid data provided.
 * @apiError {Error} 409 - If a vendor profile already exists for the user.
 * @apiError {Error} 429 - If the user has been locked out due to too many incorrect attempts.
 * @apiError {Error} 500 - Internal Server Error.
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

    const otpPhoneRepo = AppDataSource.getRepository(OtpPhone);
    const otpRecord = await otpPhoneRepo.findOne({ where: { phoneNumber: phoneNumber } });
    if (!otpRecord) {
      throw sendError('Invalid or expired OTP. Please request a new one.', 400);
    }
    if (new Date() > otpRecord.expiresAt) {
      await otpPhoneRepo.delete({ phoneNumber: phoneNumber });
      throw sendError('This OTP has expired. Please request a new one.', 400);
    }
    if (otpRecord.otp !== otp) {
      const attempts = await redis.incr(attemptKey);

      if (attempts === 1) {
        await redis.expire(attemptKey, ATTEMPT_WINDOW_SECONDS);
      }

      if (attempts >= MAX_OTP_ATTEMPTS) {
        await redis.set(lockoutKey, 'locked', 'EX', LOCKOUT_DURATION_SECONDS);
        await otpPhoneRepo.delete({ phoneNumber: phoneNumber });
        await redis.del(attemptKey);
        logger.warn(`OTP verification locked for phone: ${phoneNumber}`);
        throw sendError(`Too many incorrect attempts. Please try again in ${LOCKOUT_DURATION_SECONDS / 60} minutes.`, 429);
      }
      throw sendError('Invalid OTP.', 400);
    }

    await otpPhoneRepo.delete({ phoneNumber: phoneNumber });
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

    const vendorStats = await queryRunner.manager.save(VendorStats, {
      vendorId: newVendor.id,
      totalInProgressOrders: 0,
      totalCompletedOrders: 0,
      totalEarnings: 0,
      totalDeductions: 0,
    });
    if (!vendorStats) throw sendError('Vendor stats creation failed',400);
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
    emailQueue.add('sendVendorApprovalEmail', {
      email: newVendor.email,
      name: newVendor.name,
      template_id: "vendor_approval",
      variables: { name: newVendor.name }
    });

    return {
      isProfileCompleted: true,
      message: "Vendor profile created successfully, please wait for admin approval",
    };
  } catch (error) {
    if (queryRunner.isTransactionActive) {  
      await queryRunner.rollbackTransaction();
    }

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

/**
 * @api {get} /api/vendor/getVendorDetails Get Vendor Details
 * @apiName GetVendorDetails
 * @apiGroup Vendor
 * @apiDescription Gets the vendor details by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {Object} vendor - The vendor details.
 * @apiSuccess {string} vendor.id - The vendor's id.
 * @apiSuccess {string} vendor.name - The vendor's name.
 * @apiSuccess {string} vendor.shopName - The vendor's shop name.
 * @apiSuccess {string} vendor.serviceType - The vendor's service type.
 * @apiSuccess {string} vendor.vendorServices - The vendor's services.
 * @apiSuccess {string} vendor.city - The vendor's city.
 * @apiSuccess {string} vendor.state - The vendor's state.
 * @apiSuccess {string} vendor.shopDescription - The vendor's shop description.
 * @apiSuccess {string} vendor.allTimeRating - The vendor's all time rating.
 * @apiSuccess {string} vendor.allTimeReviewCount - The vendor's all time review count.
 * @apiSuccess {string} vendor.currentMonthRating - The vendor's current month rating.
 * @apiSuccess {string} vendor.currentMonthReviewCount - The vendor's current month review count.
 * @apiSuccess {string} vendor.currentMonthBayesianScore - The vendor's current month bayesian score.
 * @apiSuccess {string} vendor.vendorAvatarUrlPath - The vendor's avatar url.
 * @apiSuccess {string} vendor.shopImageUrlPath - The vendor's shop image url.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorDetails = async (data) => {
  try {
    const { userId } = data;
    return cacheOrFetch(`vendorDetails:${userId}`, async () => {
      const vendor = await vendorRepo.createQueryBuilder("vendors")
      .leftJoinAndSelect("vendors.user", "user")
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
  
      if (!vendor) throw sendError("Vendor profile not found", 404);

            const [avatarUrl, shopImageUrl] = await Promise.all([
                vendor.vendorAvatarUrlPath ? getPresignedViewUrl(vendor.vendorAvatarUrlPath) : null,
                vendor.shopImageUrlPath ? getPresignedViewUrl(vendor.shopImageUrlPath) : null,
            ]);

            return {
                vendor: {
                    id: vendor.id,
                    name: vendor.user.name,
                    shopName: vendor.shopName,
                    shopDescription: vendor.shopDescription,
                    serviceType: vendor.serviceType,
                    vendorServices: vendor.vendorServices,
                    city: vendor.city,
                    state: vendor.state,
                    shopImageUrl: shopImageUrl,
                    vendorAvatarUrl: avatarUrl,
                    allTimeRating: vendor.allTimeRating,
                    allTimeReviewCount: vendor.allTimeReviewCount,
                    currentMonthRating: vendor.currentMonthRating,
                    currentMonthReviewCount: vendor.currentMonthReviewCount,
                    currentMonthBayesianScore: vendor.currentMonthBayesianScore,
                }
            };
    }, 300);
  } catch (error) {
    logger.error("getVendorDetails error", error);
    throw error;
  }
}

/**
 * @api {patch} /api/vendor/saveVendorAvatarUrl Save Vendor Avatar URL
 * @apiName SaveVendorAvatarUrl
 * @apiGroup Vendor
 * @apiDescription Saves the vendor avatar url by user id.
 *
 * @apiBody {string} s3Key - The s3 key of the vendor avatar url.
 * 
 * @param {Object} data - The data containing the s3 key and user id.
 * @param {string} data.s3Key - The s3 key of the vendor avatar url.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the save.
 * 
 * @apiSuccess {string} message - A descriptive message about the vendor avatar url save.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const saveVendorAvatarUrl = async (data) => {
  try {
    const { s3Key, userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }

    await vendorRepo.update(vendor.id, { vendorAvatarUrlPath: s3Key });
    await delCache(`vendorDetails:${userId}`);

    return {
      message: "Vendor avatar url saved successfully",
    };
  } catch (error) {
    logger.error("saveVendorAvatarUrl error", error);
    throw error;
  }
}

/**
 * @api {get} /api/vendor/getVendorAvatarUrl Get Vendor Avatar URL
 * @apiName GetVendorAvatarUrl
 * @apiGroup Vendor
 * @apiDescription Gets the vendor avatar url by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {string} message - A descriptive message about the vendor avatar url get.
 * @apiSuccess {string} presignedUrl - The presigned url of the vendor avatar url.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorAvatarUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
        vendorAvatarUrlPath: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }

    const presignedUrl = await getPresignedViewUrl(vendor.vendorAvatarUrlPath);

    return {
      message: "Vendor avatar url fetched successfully",
      presignedUrl,
    };
  } catch (error) {
    logger.error("getVendorAvatarUrl error", error);
    throw error;
  }
}

/**
 * @api {patch} /api/vendor/deleteVendorAvatarUrl Delete Vendor Avatar URL
 * @apiName DeleteVendorAvatarUrl
 * @apiGroup Vendor
 * @apiDescription Deletes the vendor avatar url by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the delete.
 * 
 * @apiSuccess {string} message - A descriptive message about the vendor avatar url delete.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const deleteVendorAvatarUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
        vendorAvatarUrlPath: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }
    await deleteFile(vendor.vendorAvatarUrlPath);
    await vendorRepo.update(vendor.id, { vendorAvatarUrlPath: null });
    await delCache(`vendorDetails:${userId}`);

    return {
      message: "Vendor avatar url deleted successfully",
    };
  } catch (error) {
    logger.error("deleteVendorAvatarUrl error", error);
    throw error;
  }
}

/**
 * @api {patch} /api/vendor/saveShopImageUrl Save Shop Image URL
 * @apiName SaveShopImageUrl
 * @apiGroup Vendor
 * @apiDescription Saves the shop image url by user id.
 *
 * @apiBody {string} s3Key - The s3 key of the shop image url.
 * 
 * @param {Object} data - The data containing the s3 key and user id.
 * @param {string} data.s3Key - The s3 key of the shop image url.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the save.
 * 
 * @apiSuccess {string} message - A descriptive message about the shop image url save.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const saveShopImageUrl = async (data) => {
  try {
    const { s3Key, userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }

    await vendorRepo.update(vendor.id, { shopImageUrlPath: s3Key });
    await delCache(`vendorDetails:${userId}`);

    return {
      message: "Shop image url saved successfully",
    };
  } catch (error) {
    logger.error("saveShopImageUrl error", error);
    throw error;
  }
}

/**
 * @api {get} /api/vendor/getShopImageUrl Get Shop Image URL
 * @apiName GetShopImageUrl
 * @apiGroup Vendor
 * @apiDescription Gets the shop image url by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {string} message - A descriptive message about the shop image url get.
 * @apiSuccess {string} presignedUrl - The presigned url of the shop image url.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getShopImageUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
        shopImageUrlPath: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }

    const presignedUrl = await getPresignedViewUrl(vendor.shopImageUrlPath);

    return {
      message: "Shop image url fetched successfully",
      presignedUrl,
    };
  } catch (error) {
    logger.error("getShopImageUrl error", error);
    throw error;
  }
}

/**
 * @api {patch} /api/vendor/deleteShopImageUrl Delete Shop Image URL
 * @apiName DeleteShopImageUrl
 * @apiGroup Vendor
 * @apiDescription Deletes the shop image url by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the delete.
 * 
 * @apiSuccess {string} message - A descriptive message about the shop image url delete.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const deleteShopImageUrl = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
        shopImageUrlPath: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }

    await deleteFile(vendor.shopImageUrlPath);
    await vendorRepo.update(vendor.id, { shopImageUrlPath: null });
    await delCache(`vendorDetails:${userId}`);

    return {
      message: "Shop image url deleted successfully",
    };
  } catch (error) {
    logger.error("deleteShopImageUrl error", error);
    throw error;
  }
}

/**
 * @api {post} /api/vendor/saveWorkImageUrl Save Work Image URL
 * @apiName SaveWorkImageUrl
 * @apiGroup Vendor
 * @apiDescription Saves the work image url by user id.
 *
 * @apiBody {string} s3Key - The s3 key of the work image url.
 * 
 * @param {Object} data - The data containing the s3 key and user id.
 * @param {string} data.s3Key - The s3 key of the work image url.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the save.
 * 
 * @apiSuccess {string} message - A descriptive message about the work image url save.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const saveWorkImageUrl = async (data) => {
  try {
    const { s3Key, userId } = data;
    
    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
      },
    });

    if (!vendor) {
      throw sendError('Vendor not found',404);
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
    logger.error("saveWorkImageUrl error", error);
    throw error;
  }
}

/**
 * @api {get} /api/vendor/getVendorWorkImages Get Vendor Work Images
 * @apiName GetVendorWorkImages
 * @apiGroup Vendor
 * @apiDescription Gets the vendor work images by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {string} message - A descriptive message about the vendor work images get.
 * @apiSuccess {Object[]} workImages - The vendor work images.
 * 
 * @apiSuccess {string} workImages.id - The UUID of the work image.
 * @apiSuccess {string} workImages.vendorId - The UUID of the vendor.
 * @apiSuccess {string} workImages.s3Key - The S3 key of the work image.
 * @apiSuccess {string} workImages.uploadedAt - The timestamp of the work image.
 * @apiSuccess {string} workImages.presignedUrl - The presigned URL of the work image.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorWorkImages = async (data) => {
  try {
    const { userId } = data;
    return cacheOrFetch(`vendorWorkImages:${userId}`, async () => {
      const vendor = await vendorRepo.findOne({
        where: { userId: userId },
        select: {
          id: true,
        },
      });

      if (!vendor) {
        throw sendError('Vendor not found',404);
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
    logger.error("getVendorWorkImages error", error);
    throw error;
  }
}

/**
 * @api {delete} /api/vendor/deleteVendorWorkImage/:s3Key Delete Vendor Work Image
 * @apiName DeleteVendorWorkImage
 * @apiGroup Vendor
 * @apiDescription Deletes the vendor work image by user id.
 *
 * @apiBody {string} s3Key - The s3 key of the work image url.
 * 
 * @param {Object} data - The data containing the s3 key and user id.
 * @param {string} data.s3Key - The s3 key of the work image url.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the delete.
 * 
 * @apiSuccess {string} message - A descriptive message about the vendor work image delete.
 * 
 * @apiError {Error} 404 - If the vendor or vendor work image is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const deleteVendorWorkImage = async (data) => {
  try {
    const { s3Key, userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
      select: {
        id: true,
      },
      });

    if (!vendor) {
      throw sendError('Vendor not found',404);
    }

    const vendorImage = await vendorImagesRepo.findOne({
      where: { vendorId: vendor.id, s3Key: s3Key },
    });

    if (!vendorImage) {
      throw sendError('Vendor work image not found',404);
    }

    await deleteFile(vendorImage.s3Key);
    await vendorImagesRepo.delete(vendorImage);

    await delCache(`vendorWorkImages:${userId}`);

    return {
      message: "Vendor work image deleted successfully",
    };
  } catch (error) {
    logger.error("deleteVendorWorkImage error", error);
    throw error;
  }
}

//=================== VENDOR ORDER MANAGEMENT ====================

/**
 * @api {get} /api/vendor/getVendorOrders/:page/:limit Get Vendor Orders
 * @apiName GetVendorOrders
 * @apiGroup Vendor
 * @apiDescription Gets the vendor orders by user id.
 *
 * @apiQuery {string} status - The status of the orders.
 * @apiParam {number} page - The page number.
 * @apiParam {number} limit - The limit of the orders.
 * 
 * @param {Object} data - The data containing the user id, page, and limit.
 * @param {string} data.userId - The user's UUID.
 * @param {number} data.page - The page number.
 * @param {number} data.limit - The limit of the orders.
 * @param {string} data.status - The status of the orders.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {Object[]} orders - The vendor orders.
 * @apiSuccess {string} orders.id - The UUID of the order.
 * @apiSuccess {string} orders.status - The status of the order.
 * @apiSuccess {string} orders.createdAt - The timestamp of the order.
 * @apiSuccess {string} orders.orderId - The UUID of the order.
 * @apiSuccess {string} orders.orderName - The name of the order.
 * @apiSuccess {string} orders.serviceType - The type of the order.
 * @apiSuccess {string} orders.finishByDate - The finish by date of the order.
 * @apiSuccess {string} orders.completedAt - The timestamp of the order.
 * 
 * @apiSuccess {Object} pagination - The pagination of the orders.
 * @apiSuccess {number} pagination.currentPage - The current page number.
 * @apiSuccess {boolean} pagination.hasMore - Whether there are more orders.
 * @apiSuccess {number} pagination.nextPage - The next page number.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the vendor or orders are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorOrders = async (data) => {
  try {
    const { userId, page, limit, status } = getVendorOrdersSchema.parse(data);
    const offset = (page - 1) * limit;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});

    if (!vendor) throw sendError('Vendor Profile not found', 404);

    const orders = await orderVendorRepo.createQueryBuilder("orderVendors")
    .leftJoinAndSelect("orderVendors.order", "orders")
    .select([
      "orderVendors.id",
      "orderVendors.status",
      "orderVendors.createdAt",
      "orders.id",
      "orders.orderName",
      "orders.serviceType",
      "orders.finishByDate",
      "orders.orderStatusTimestamp",
    ])
    .where("orderVendors.vendorId = :vendorId", { vendorId: vendor.id })
    .andWhere("orderVendors.status = :status", { status: status })
    .orderBy("orderVendors.createdAt", "DESC")
    .skip(offset)
    .take(limit)
    .getMany();

    if (!orders) throw sendError('Orders not found', 404);

    return {
      orders: orders.map(order => ({
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        orderId: order.order.id,
        orderName: order.order.orderName,
        serviceType: order.order.serviceType,
        finishByDate: order.order.finishByDate,
        completedAt: order.order.orderStatusTimestamp.completedAt,
      })),
      pagination: {
        currentPage: page,
        hasMore: orders.length === limit,
        nextPage: orders.length === limit ? page + 1 : null,
    },
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("getVendorOrders validation failed", { errors: error.flatten().fieldErrors });
      throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
    }
    logger.error("getVendorOrders error", error);
    throw error;
  }
}

/**
 * @api {get} /api/vendor/getVendorOrderById/:orderVendorId Get Vendor Order By Id
 * @apiName GetVendorOrderById
 * @apiGroup Vendor
 * @apiDescription Gets the vendor order by id.
 *
 * @apiParam {string} orderVendorId - The UUID of the order vendor.
 * 
 * @param {Object} data - The data containing the user id and order vendor id.
 * @param {string} data.userId - The user's UUID.
 * @param {string} data.orderVendorId - The UUID of the order vendor.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {Object} order - The vendor order.
 * @apiSuccess {string} order.id - The UUID of the order.
 * @apiSuccess {string} order.customerId - The UUID of the customer.
 * @apiSuccess {string} order.orderName - The name of the order.
 * @apiSuccess {string} order.orderType - The type of the order.
 * @apiSuccess {string} order.serviceType - The type of the order.
 * @apiSuccess {string} order.orderPreference - The preference of the order.
 * @apiSuccess {string} order.clothProvided - Whether the cloth is provided.
 * @apiSuccess {string} order.orderStatus - The status of the order.
 * @apiSuccess {string} order.orderStatusTimestamp - The timestamp of the order status.
 * @apiSuccess {string} order.requiredByDate - The date by which the order must be required.
 * @apiSuccess {string} order.createdAt - The timestamp of the order.
 * 
 * @apiSuccess {Object[]} orderItems - The order items.
 * @apiSuccess {string} orderItems.id - The UUID of the order item.
 * @apiSuccess {string} orderItems.orderId - The UUID of the order.
 * @apiSuccess {string} orderItems.designImage1 - The S3 key of the design image 1.
 * @apiSuccess {string} orderItems.designImage2 - The S3 key of the design image 2.
 * @apiSuccess {string} orderItems.designImage1Url - The presigned URL of the design image 1.
 * @apiSuccess {string} orderItems.designImage2Url - The presigned URL of the design image 2.
 * 
 * @apiError {Error} 404 - If the vendor, order or order vendor or order items are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorOrderById = async (data) => {
  try {
    const { userId, orderVendorId } = data;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError('Vendor Profile not found', 404);

    const orderVendor = await orderVendorRepo.findOne({ where: { id: orderVendorId, vendorId: vendor.id }});
    if (!orderVendor) throw sendError('Order vendor not found', 404);

    const order = await orderRepo.findOne({ where: { id: orderVendor.orderId }, 
      select: {id: true, customerId: true, orderName: true, orderType: true, serviceType: true, orderPreference: true, clothProvided: true, orderStatus: true, orderStatusTimestamp: true, requiredByDate: true, createdAt: true}
    });
    if (!order) throw sendError('Order not found', 404);

    const orderItems = await orderItemsRepo.find({ where: { orderId: order.id } });
    if (!orderItems) throw sendError("Order items not found", 404);

    const processedOrderItems = await Promise.all(orderItems.map(async item => {
        const [designImage1Url, designImage2Url] = await Promise.all([
            item.designImage1 ? getPresignedViewUrl(item.designImage1) : null,
            item.designImage2? getPresignedViewUrl(item.designImage2) : null,
        ]);
        return {
            ...item,
            designImage1Url,
            designImage2Url
        }
    }));
    return {
      order,
      orderItems: processedOrderItems
    };  
  } catch (error) {
    logger.error("getVendorOrderById error", error);
    throw error;
  }
}

/**
 * @api {get} /api/vendor/getVendorQuote/:orderVendorId Get Vendor Quote
 * @apiName GetVendorQuote
 * @apiGroup Vendor
 * @apiDescription Gets the vendor quote by order vendor id.
 *
 * @apiParam {string} orderVendorId - The UUID of the order vendor.
 * 
 * @param {Object} data - The data containing the user id and order vendor id.
 * @param {string} data.userId - The user's UUID.
 * @param {string} data.orderVendorId - The UUID of the order vendor.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {Object} quote - The vendor quote.
 * @apiSuccess {string} quote.id - The UUID of the quote.
 * @apiSuccess {string} quote.quotedDays - The quoted days of the quote.
 * @apiSuccess {string} quote.quotedPrice - The quoted price of the quote.
 * @apiSuccess {string} quote.vendorPayoutAfterCommission - The vendor payout after commission of the quote.
 * @apiSuccess {string} quote.deliveryCharge - The delivery charge of the quote.
 * @apiSuccess {string} quote.finalPrice - The final price of the quote.
 * @apiSuccess {string} quote.createdAt - The timestamp of the quote.
 * 
 * @apiError {Error} 404 - If the vendor, order vendor or quote is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorQuote = async (data) => {
  try {
    const { userId, orderVendorId } = data;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError('Vendor Profile not found', 404);

    const orderVendor = await orderVendorRepo.findOne({ where: { id: orderVendorId, vendorId: vendor.id, }, select: {id: true , status: true}});
    if (!orderVendor) throw sendError('Order not found', 404);

    if(orderVendor.status === ORDER_VENDOR_STATUS.PENDING) throw sendError('You have not accepted or rejected the order yet', 400);
    if(orderVendor.status === ORDER_VENDOR_STATUS.REJECTED) throw sendError('You have rejected the order', 400);
    if(orderVendor.status === ORDER_VENDOR_STATUS.EXPIRED) throw sendError('The order has expired', 400);
    if(orderVendor.status === ORDER_VENDOR_STATUS.FROZEN) throw sendError('The order has been frozen', 400);

    const quote = await quoteRepo.findOne({ where: { orderVendorId: orderVendorId }, select: {id: true, quotedDays: true, quotedPrice: true, vendorPayoutAfterCommission: true, deliveryCharge: true, finalPrice: true, createdAt: true}});
    if (!quote) throw sendError('Quote not found', 404);

    return {
      quote,
    };
  } catch (error) {
    logger.error("getVendorQuote error", error);
    throw error;
  }
}

/**
 * @api {get} /api/vendor/getVendorStats Get Vendor Stats
 * @apiName GetVendorStats
 * @apiGroup Vendor
 * @apiDescription Gets the vendor stats by user id.
 *
 * @param {Object} data - The data containing the user id.
 * @param {string} data.userId - The user's UUID.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {Object} stats - The vendor stats.
 * @apiSuccess {string} stats.id - The UUID of the stats.
 * @apiSuccess {string} stats.totalInProgressOrders - The total in progress orders of the vendor.
 * @apiSuccess {string} stats.totalCompletedOrders - The total completed orders of the vendor.
 * @apiSuccess {string} stats.totalEarnings - The total earnings of the vendor.
 * @apiSuccess {string} stats.totalDeductions - The total deductions of the vendor.
 * @apiSuccess {string} stats.totalPendingRequests - The total pending requests of the vendor.
 * 
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorStats = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError('Vendor Profile not found', 404);

    const stats = await vendorStatsRepo.findOne({ where: { vendorId: vendor.id }, 
      select: {id: true, totalInProgressOrders: true, totalCompletedOrders: true, totalEarnings: true, totalDeductions: true}});

    const totalPendingRequests = await orderVendorRepo.count({ where: { vendorId: vendor.id, status: ORDER_VENDOR_STATUS.PENDING }});

    return {
      ...stats,
      totalPendingRequests,
    };
  } catch (error) {
    logger.error("getVendorStats error", error);
    throw error;
  }
}

//======================================= COMPLAINT SERVICE ========================================

/**
 * @api {post} /api/vendor/addComplaint/:orderId Add Complaint
 * @apiName AddComplaint
 * @apiGroup Vendor
 * @apiDescription Adds a complaint by user id.
 *
 * @apiParam {string} orderId - The UUID of the order.
 * @apiBody {string} complaint - The complaint.
 * 
 * @param {Object} data - The data containing the user id, order id and complaint.
 * @param {string} data.userId - The user's UUID.
 * @param {string} data.orderId - The UUID of the order.
 * @param {string} data.complaint - The complaint.
 * @returns {Promise<Object>} - The result of the post.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the vendor or order are not found.
 * @apiError {Error} 403 - If the vendor is not authorized to add complaint for this order.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const addComplaint = async (data) => {
  try {
      const { userId, orderId, complaint } = addComplaintSchema.parse(data);

      const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: { id: true }, relations: ["user"] });
      if (!vendor) throw sendError("Vendor not found", 404);

      const order = await orderRepo.exists({ where: { id: orderId, selectedVendorId: vendor.id } });
      if (!order) throw sendError("Order ID is invalid or You are not authorized to add complaint for this order", 403);

      const complaintData = AppDataSource.getRepository(Complaints).create({ vendorId: vendor.id, email: vendor.user.email, phoneNumber: vendor.user.phoneNumber, name: vendor.user.name, orderId, complaint });

      await AppDataSource.getRepository(Complaints).save(complaintData);

      return {
          success: true,
          message: "Complaint added successfully",
      }
  } catch (error) {
      logger.error("Error adding complaint", error);
      if (error instanceof z.ZodError) {
          logger.warn("addComplaint validation failed", { errors: error.flatten().fieldErrors });
          throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
      }
      throw error;
  }
}

//======================================= PAYOUT SERVICE ========================================

/**
 * @api {get} /api/vendor/getVendorPayouts/:page/:limit Get Vendor Payouts
 * @apiName GetVendorPayouts
 * @apiGroup Vendor
 * @apiDescription Gets the vendor payouts by user id.
 *
 * @apiParam {string} page - The page number.
 * @apiParam {string} limit - The limit of the payouts.
 * @apiQuery {string} status - The status of the payouts(pending, cancelled, '').
 * 
 * @param {Object} data - The data containing the user id, page and limit.
 * @param {string} data.userId - The user's UUID.
 * @param {number} data.page - The page number.
 * @param {number} data.limit - The limit of the payouts.
 * @param {string} data.status - The status of the payouts.
 * @returns {Promise<Object>} - The result of the get.
 * 
 * @apiSuccess {Object[]} payouts - The vendor payouts.
 * @apiSuccess {string} payouts.id - The UUID of the payout.
 * @apiSuccess {string} payouts.orderId - The UUID of the order.
 * @apiSuccess {string} payouts.expected_amount - The expected amount of the payout.
 * @apiSuccess {string} payouts.actual_paid_amount - The actual paid amount of the payout.
 * @apiSuccess {string} payouts.status - The status of the payout.
 * @apiSuccess {string} payouts.payout_id - The payout ID of the payout.
 * @apiSuccess {string} payouts.utr - The UTR of the payout.
 * @apiSuccess {string} payouts.payout_status_history - The payout status history of the payout.
 * 
 * @apiSuccess {Object} pagination - The pagination of the payouts.
 * @apiSuccess {number} pagination.currentPage - The current page number.
 * @apiSuccess {boolean} pagination.hasMore - Whether there are more payouts.
 * @apiSuccess {number} pagination.nextPage - The next page number.
 * 
 * @apiError {Error} 404 - If the vendor or payouts are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorPayouts = async (data) => {
  try {
    const { userId, page, limit, status } = data;

    const offset = (page - 1) * limit;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError("Vendor not found", 404);

    const statusFilters = {
      pending: ["queued", "pending", "rejected"],
      cancelled: ["rejected", "cancelled"],
      all: ["action_required", "queued", "pending", "rejected","processing", "processed", "cancelled"],
    }

    const whereStatus = status
    ? In(statusFilters[status] || [status])
    : In(statusFilters.all);

    const payouts = await payoutRepo.find(
      {
        where: { vendorId: vendor.id, status: whereStatus },
        select: { id: true, orderId: true, expected_amount: true, actual_paid_amount: true,
          status: true, payout_id: true, utr: true, payout_status_history: true },
        order: { entry_created_at: "DESC" },
        skip: offset,
        take: limit,
      }
    )
    if (!payouts) throw sendError("Payouts not found", 404);

    return {
      payouts: payouts.map(payout => ({
        id: payout.id,
        orderId: payout.orderId,
        expected_amount: payout.expected_amount,
        actual_paid_amount: payout.actual_paid_amount,
        status: payout.status,
        payout_id: payout.payout_id,
        utr: payout.utr,
        payout_status_history: payout.payout_status_history.processed_at,
      })),
      pagination: {
        currentPage: page,
        hasMore: payouts.length === limit,
        nextPage: payouts.length === limit ? page + 1 : null,
      }
    }
  } catch (error) {
    logger.error("getVendorPayouts error", error);
    throw error;
  }
} 

//======================================= REVIEW SERVICE ========================================

/**
 * @api {get} /api/vendor/getReviews/:page/:limit Get Reviews
 * @apiName GetReviews
 * @apiGroup Vendor
 * @apiDescription Retrieves a paginated list of reviews of current logged in vendor.
 * 
 * @apiParam {string} page - The page number.
 * @apiParam {string} limit - The limit of reviews per page.
 * 
 * @param {object} data - The review data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.page - The page number.
 * @param {string} data.limit - The limit of reviews per page.
 * 
 * @apiSuccess {Object[]} response.reviews - The reviews.
 * @apiSuccess {Object} response.pagination - The pagination object.
 * 
 * @apiSuccess {string} response.reviews.id - The UUID of the review.
 * @apiSuccess {string} response.reviews.rating - The rating of the review.
 * @apiSuccess {string} response.reviews.review - The review.
 * @apiSuccess {string} response.reviews.createdAt - The timestamp of the review creation.
 * @apiSuccess {string} response.reviews.customerName - The name of the customer.
 * 
 * @apiSuccess {string} response.pagination.currentPage - The current page number.
 * @apiSuccess {string} response.pagination.hasMore - Whether there are more pages.
 * @apiSuccess {string} response.pagination.nextPage - The next page number.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the vendor or reviews are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */

export const getReviews = async (data) => {
  try {
      const { userId, page, limit } = getVendorReviewsSchema.parse(data);
      const offset = (page - 1) * limit;

      const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: { id: true } });
      if (!vendor) throw sendError("Vendor not found", 404);

      return cacheOrFetch(`vendorReviews:${vendor.id}`, async () => {
          const reviews = await AppDataSource.getRepository(Rating).find({
              where: { vendorId: vendor.id }, 
              select: { id: true, rating: true, review: true, createdAt: true }, 
              relations: { customer: { user: true } },
              skip: offset, 
              take: limit,
              order: { createdAt: "DESC" }
          });

          if (!reviews) throw sendError("Reviews not found", 404);

          const processedReviews = await Promise.all(reviews.map(async (review) => ({
              id: review.id,
              rating: review.rating,
              review: review.review,
              createdAt: review.createdAt,
              customerName: review.customer.user.name,
          })));

          return {
              reviews: processedReviews,
              pagination: {
                  currentPage: page,
                  hasMore: reviews.length === limit,
                  nextPage: reviews.length === limit ? page + 1 : null,
              },
          };
      }, 300);
  } catch (error) {
      if (error instanceof z.ZodError) {
          logger.warn("getReviews validation failed", { errors: error.flatten().fieldErrors });
          throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
      }
      logger.error("getReviews error", error);
      throw error;
  }
}