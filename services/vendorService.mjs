import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { User } from "../entities/User.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { VendorAudit } from "../entities/VendorAudit.mjs";
import { OtpPhone } from "../entities/OtpPhone.mjs";
import { VendorImages } from "../entities/VendorImages.mjs";
import { getPresignedViewUrl, deleteFile } from "./s3service.mjs";

const userRepo = AppDataSource.getRepository(User);
const vendorRepo = AppDataSource.getRepository(Vendors);
const vendorAuditRepo = AppDataSource.getRepository(VendorAudit);
const vendorImagesRepo = AppDataSource.getRepository(VendorImages);


export const checkProfile = async (data) => {
  try {
    const { userId } = data;

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });
    if (!vendor) {
      return {
        exists: false,
        message: "Vendor profile not complete => redirect to vendor profile",
      };
    }

    if (vendor.status === "PENDING") {
      return {
        exists: true,
        status: "PENDING",
        message: "Vendor profile not verified => redirect to vendor verification pending status page",
      };
    }

    if (vendor.status === "REJECTED") {
      return {
        exists: true,
        status: "REJECTED",
        message: "Vendor profile rejected => redirect to vendor verification rejected status page",
      };
    }

    if (vendor.status === "BLOCKED") {
      return {
        exists: true,
        status: "BLOCKED",
        message: "Vendor profile blocked => redirect to vendor verification blocked status page",
      };
    }

    return {
      exists: true,
      status: "VERIFIED",
      message: "Vendor profile complete => redirect to vendor dashboard",
    };

  } catch (error) {
    logger.error(error);
    throw error;
  }
};

export const completeProfile = async (data, deviceInfo) => {
  try {
    const {userId, phoneNumber, otp, latitude, longitude, ...profileData} = data
    const { ip, ...deviceData } = deviceInfo;
    
    const user = await userRepo.findOne({
      where: { id: userId },
      select: ["email"],
    });

    if (!user || !user.email) {
      return {
        isProfileCompleted: false,
        message: "User not found",
      };
    }

    const vendor = await vendorRepo.findOne({
      where: { userId: userId },
    });

    if (vendor) {
      return {
        exists: true,
        message: "Vendor profile already exists",
      };
    }

    const otpPhoneRepository = AppDataSource.getRepository(OtpPhone);
    const otpRecord = await otpPhoneRepository.findOne({ where: { phone: phoneNumber } });
    if (!otpRecord) {
        throw sendError('OTP not found',400);
    }

    if (otpRecord.otp !== otp) {
        throw sendError('Invalid OTP',400);
    }

    if (new Date() > otpRecord.expiresAt) {
        throw sendError('OTP expired',400);
    }

    if(otpRecord.otp === otp) {
        await otpPhoneRepository.delete({ phone: phoneNumber });
    }

    const newVendor = vendorRepo.create({
      userId: userId,
      ...profileData,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
      status: "PENDING",
    });

    await vendorRepo.save(newVendor);

    if (!newVendor) {
      return {
        isProfileCompleted: false,
        message: "Vendor profile creation failed",
      };
    }

    const vendorAudit = vendorAuditRepo.create({
      vendorId: newVendor.id,
      otpVerifiedAt: new Date(),
      toc: true,
      ip: ip,
      deviceInfo: deviceData,
    });
    await vendorAuditRepo.save(vendorAudit);

    if (!vendorAudit) {
      throw sendError('Vendor audit creation failed',400);
    }
    
    return {
      isProfileCompleted: true,
      message: "Vendor profile created successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
};

export const getVendorDetails = async (data) => {
  try {
    const { userId } = data;

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

    return {
      message: "Vendor work image deleted successfully",
    };
  } catch (error) {
    logger.error(error);
    throw error;
  }
}