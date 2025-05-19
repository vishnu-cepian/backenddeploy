import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { User } from "../entities/User.mjs";
import { Vendor } from "../entities/Vendor.mjs";
import { AppDataSource } from "../config/data-source.mjs";


const userRepo = AppDataSource.getRepository(User);
const vendorRepo = AppDataSource.getRepository(Vendor);

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
    sendError(error);
  }
};

export const completeProfile = async (data) => {
  try {
    // const { userId, ...profileData } = data;

    // const user = await userRepo.findOne({
    //   where: { id: userId },
    //   select: ["email"],
    // });

    // if (!user || !user.email) {
    //   return {
    //     isProfileCompleted: false,
    //     message: "User not found",
    //   };
    // }

    // const vendor = await vendorRepo.findOne({
    //   where: { userId: userId },
    // });

    // if (vendor) {
    //   return {
    //     exists: true,
    //     message: "Vendor profile already exists",
    //   };
    // }

    // const newVendor = vendorRepo.create({
    //   userId: userId,
    //   ...profileData,
    //   email: user.email,
    //   isVerified: false,
    // });

    // await vendorRepo.save(newVendor);

    // if (!newVendor) {
    //   return {
    //     isProfileCompleted: false,
    //     message: "Vendor profile creation failed",
    //   };
    // }
    // return {data}
    // return {
    //   isProfileCompleted: true,
    //   message: "Vendor profile created successfully",
    // };

    const {userId, latitude, longitude, ...profileData} = data

    const newVendor = vendorRepo.create({
      userId: userId,
      ...profileData,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
    });

    await vendorRepo.save(newVendor);

    return {
      isProfileCompleted: true,
      message: "Vendor profile created successfully",
    };
  } catch (error) {
    logger.error(error);
    sendError(error);
  }
};
