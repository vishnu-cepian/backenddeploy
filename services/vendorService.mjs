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
import { VENDOR_STATUS, SHOP_TYPE, OWNERSHIP_TYPE, SERVICE_TYPE, ORDER_VENDOR_STATUS } from "../types/enums/index.mjs";
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
 * Save the vendor avatar url.
 * @param {Object} data - The data containing the s3 key and user id.
 * @returns {Promise<Object>} - The result of the save.
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
      throw sendError('Vendor not found',400);
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
 * Get the vendor avatar url.
 * @param {Object} data - The data containing the user id.
 * @returns {Promise<Object>} - The result of the get.
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
      throw sendError('Vendor not found',400);
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
 * Delete the vendor avatar url.
 * @param {Object} data - The data containing the user id.
 * @returns {Promise<Object>} - The result of the delete.
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
      throw sendError('Vendor not found',400);
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
 * Save the shop image url.
 * @param {Object} data - The data containing the s3 key and user id.
 * @returns {Promise<Object>} - The result of the save.
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
      throw sendError('Vendor not found',400);
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
 * Get the shop image url.
 * @param {Object} data - The data containing the user id.
 * @returns {Promise<Object>} - The result of the get.
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
      throw sendError('Vendor not found',400);
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
 * Delete the shop image url.
 * @param {Object} data - The data containing the user id.
 * @returns {Promise<Object>} - The result of the delete.
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
      throw sendError('Vendor not found',400);
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
 * Save the work image url.
 * @param {Object} data - The data containing the s3 key and user id.
 * @returns {Promise<Object>} - The result of the save.
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
    logger.error("saveWorkImageUrl error", error);
    throw error;
  }
}

/**
 * Get the vendor work images.
 * @param {Object} data - The data containing the user id.
 * @returns {Promise<Object>} - The result of the get.
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
    logger.error("getVendorWorkImages error", error);
    throw error;
  }
}

/**
 * Delete the vendor work image.
 * @param {Object} data - The data containing the s3 key and user id.
 * @returns {Promise<Object>} - The result of the delete.
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
    logger.error("deleteVendorWorkImage error", error);
    throw error;
  }
}

//=================== VENDOR ORDER MANAGEMENT ====================

/**
 * Get the vendor orders.
 * @param {Object} data - The data containing the user id, page, and limit.
 * @param {string} data.status - (query) The status of the orders to get.
 * @returns {Promise<Object>} - A paginated list of the vendor's orders.
 */
export const getVendorOrders = async (data) => {
  try {
    const { userId, page, limit, status } = getVendorOrdersSchema.parse(data);
    const offset = (page - 1) * limit;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});

    if (!vendor) throw sendError('Vendor Profile not found', 400);

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

    if (!orders) throw sendError('Orders not found', 400);

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
 * Get the vendor order by id.
 * @param {Object} data - The data containing the user id and order vendor id.
 * @returns {Promise<Object>} - The result of the get.
 */
export const getVendorOrderById = async (data) => {
  try {
    const { userId, orderVendorId } = data;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError('Vendor Profile not found', 400);

    const orderVendor = await orderVendorRepo.findOne({ where: { id: orderVendorId, vendorId: vendor.id }});
    if (!orderVendor) throw sendError('Order not found', 400);

    const order = await orderRepo.findOne({ where: { id: orderVendor.orderId }, 
      select: {id: true, customerId: true, orderName: true, orderType: true, serviceType: true, orderPreference: true, clothProvided: true, orderStatus: true, orderStatusTimestamp: true, requiredByDate: true, createdAt: true}
    });
    if (!order) throw sendError('Order not found', 400);

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

export const getVendorQuote = async (data) => {
  try {
    const { userId, orderVendorId } = data;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError('Vendor Profile not found', 400);

    const orderVendor = await orderVendorRepo.findOne({ where: { id: orderVendorId, vendorId: vendor.id, }, select: {id: true , status: true}});
    if (!orderVendor) throw sendError('Order not found', 400);

    if(orderVendor.status === ORDER_VENDOR_STATUS.PENDING) throw sendError('You have not accepted or rejected the order yet', 400);
    if(orderVendor.status === ORDER_VENDOR_STATUS.REJECTED) throw sendError('You have rejected the order', 400);
    if(orderVendor.status === ORDER_VENDOR_STATUS.EXPIRED) throw sendError('The order has expired', 400);
    if(orderVendor.status === ORDER_VENDOR_STATUS.FROZEN) throw sendError('The order has been frozen', 400);

    const quote = await quoteRepo.findOne({ where: { orderVendorId: orderVendorId }, select: {id: true, quotedDays: true, quotedPrice: true, vendorPayoutAfterCommission: true, deliveryCharge: true, finalPrice: true, createdAt: true}});
    if (!quote) throw sendError('Quote not found', 400);

    return {
      quote,
    };
  } catch (error) {
    logger.error("getVendorQuote error", error);
    throw error;
  }
}

export const getVendorStats = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError('Vendor Profile not found', 400);

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

export const getVendorPayouts = async (data) => {
  try {
    const { userId, page, limit, status } = data;

    const offset = (page - 1) * limit;

    const vendor = await vendorRepo.findOne({ where: { userId: userId }, select: {id: true}});
    if (!vendor) throw sendError("Vendor not found", 404);

    const payouts = await payoutRepo.find(
      {
        where: {
          vendorId: vendor.id,
          status: status ? 
                         status === "pending" ? 
                            In(["queued", "pending", "rejected"]) 
                                              : status === "cancelled" ? 
                                                  In(["rejected", "cancelled"]) 
                                                                       : In([status]) 
                        : In(["action_required", "queued", "pending", "rejected","processing", "processed", "cancelled"]),
        },
        select: {
          id: true,
          orderId: true,
          expected_amount: true,
          actual_paid_amount: true,
          status: true,
          payout_id: true,
          utr: true,
          payout_status_history: true,
        },
        order: {
          entry_created_at: "DESC",
        },
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