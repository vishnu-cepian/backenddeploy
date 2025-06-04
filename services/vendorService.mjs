import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { User } from "../entities/User.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { VendorAudit } from "../entities/vendorAudit.mjs";
import { OtpPhone } from "../entities/OtpPhone.mjs";

const userRepo = AppDataSource.getRepository(User);
const vendorRepo = AppDataSource.getRepository(Vendors);
const vendorAuditRepo = AppDataSource.getRepository(VendorAudit);


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

    if (vendor.isVerified === false) {
      return {
        exists: true,
        isVerified: false,
        message: "Vendor profile not verified => redirect to vendor verification pending status page",
      };
    }

    return {
      exists: true,
      isVerified: true,
      message: "Vendor profile complete => redirect to vendor dashboard",
    };

  } catch (error) {
    logger.error(error);
    throw error;
  }
};

export const completeProfile = async (data, deviceInfo) => {
  try {
    const {userId, phone, otp, latitude, longitude, ...profileData} = data
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
    const otpRecord = await otpPhoneRepository.findOne({ where: { phone } });
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
        await otpPhoneRepository.delete({ phone });
    }

    const newVendor = vendorRepo.create({
      userId: userId,
      ...profileData,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
      isVerified: false,
      isActive: true,
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
    const { vendorId } = data;

    const vendor = await vendorRepo.findOne({
      where: { id: vendorId },
    });

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