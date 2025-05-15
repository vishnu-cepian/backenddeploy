import { logger } from "../utils/logger-utils.mjs";
import { prisma } from "../utils/prisma-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import e from "express";

export const checkProfile = async (data) => {
  try {
    const { userId } = data;
    
    const vendor = await prisma.vendor.findUnique({
      where: {
        userId: userId,
      },
    });
    if (!vendor) {
      return ({
        exists: false,
        message: "Vendor profile not complete => redirect to vendor profile",
      });
    }

    if(vendor.isVerified === false) {
      return ({
        exists: true,
        isVerified: false,
        message: "Vendor profile not verified => redirect to vendor verification pending status page",
      });
    }

    return ({
      exists: true,
      isVerified: true,
      message: "Vendor profile complete => redirect to vendor dashboard",
    });

  } catch (error) {
    logger.error(error);
    sendError(error);
  }
}

export const completeProfile = async (data) => {
  try {
    const { userId, ...profileData } = data;
    const { email } = await prisma.user.findUnique({
      where: {
      id: userId,
      },
      select: {
      email: true,
      },
    });
    if (!email) {
      return ({
        isProfileCompleted: false,
        message: "User not found",
      });
    }
    const vendor = await prisma.vendor.findUnique({
      where: {
        userId: userId,
      },
    });

    if (vendor) {
      return ({
        exists: true,
        message: "Vendor profile already exists",
      });
    }

    const newVendor = await prisma.vendor.create({
      data: {
        userId: userId,
        ...profileData,
        email: email,
        isVerified: false,
      },
    });
    if (!newVendor) {
      return ({
        isProfileCompleted: false,
        message: "Vendor profile creation failed",
      });
    }
    return ({
      isProfileCompleted: true,
      message: "Vendor profile created successfully",
    });

  } catch (error) {
    logger.error(error);
    sendError(error);
  }
}