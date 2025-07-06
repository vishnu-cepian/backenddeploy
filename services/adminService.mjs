import { logger } from "../utils/logger-utils.mjs";
import { hashPassword, comparePassword } from "../utils/auth-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import jwt from 'jsonwebtoken';
import { ADMIN_ACCESS_TOKEN_SECRET, ADMIN_REFRESH_TOKEN_SECRET } from '../config/auth-config.mjs';
import { AppDataSource } from "../config/data-source.mjs";
import { User } from "../entities/User.mjs";
import { Customers } from "../entities/Customers.mjs";
import { Orders } from "../entities/Orders.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { In } from 'typeorm';

const orderRepo = AppDataSource.getRepository(Orders);
// const orderItemRepo = AppDataSource.getRepository(OrderItems);
// const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
// const orderItemMeasurementByVendorRepo = AppDataSource.getRepository(OrderItemMeasurementByVendor);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const userRepo = AppDataSource.getRepository(User);
// const paymentRepo = AppDataSource.getRepository(Payments);

//===================JWT UTILS====================

export const generateAccessToken = (payload) => {
    return jwt.sign(payload, ADMIN_ACCESS_TOKEN_SECRET, { expiresIn: '1d' }); 
  };
  
  export const generateRefreshToken = (payload) => {
    return jwt.sign(payload, ADMIN_REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  };
  
  export const verifyAccessToken = (token) => {
    try {
      return jwt.verify(token, ADMIN_ACCESS_TOKEN_SECRET);
    } catch (err) {
      return null;
    }
  }
  
  export const verifyRefreshToken = (token) => {
    try {
      return jwt.verify(token, ADMIN_REFRESH_TOKEN_SECRET);
    } catch (err) {
      return null;
    }
  };
  
  export const refreshAccessToken = async (refreshToken) => {  //if token is expired, ie., 401, then refresh token will be used to get new access token
    /*
      input:- refreshToken saved in local storage
      output:- new access token, refresh token, message
      purpose:- to get new access token when current one is expired and to extend the validity of refresh token on each function call
  
      steps:- first verify the refresh token if valid then 
      - find the user with the id in the refresh token
      - if user not found then throw error
      - if user found then check if the refresh token is valid
      - if refresh token is not valid then throw error
      - if refresh token is valid then generate new access token and refresh token
      - update the refresh token in the database
      - return the new access token, refresh token, message
    */
      try {
      const decoded = verifyRefreshToken(refreshToken);
      if (!decoded) {
          throw sendError('Invalid refresh token', 401);
      }
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: decoded.id } });
      if (!user) {
          throw sendError('User not found', 404);
      }
      if (user.refreshToken !== refreshToken) {
          throw sendError('Refresh token mismatch', 403);
      }
      const newAccessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
      const newRefreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role });
      await userRepository.update(
          { id: user.id },
          { refreshToken: newRefreshToken }
      );
      
      return {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          message: "Token refreshed successfully",
      };
      } catch (err) {
          logger.error(err);
          throw err;
      }
  };

  export const login = async (data) => {
    /*
  input:- email,password
  ouput:- role, accessTokken, refreshToken, message

    - SIGNUP_TOKEN For added security
    - accessToken and refershToken will be generated and the app will save it in the local storage also the User table will be updated with new refreshToken
    - The user dashboard will be rendered by the ROLE

*/
try {
        const {email, password} = data;
    
        if (!email || !password) {
            throw sendError('Email and password are required',400);
        }

        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({ where: { email } });
        if (!user) {
            throw sendError('User not found', 404);
        }

        if(user.role.toUpperCase() !== 'ADMIN') {
            throw sendError('Unauthorized', 403);
        }
        // Check if password is correct
        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid) {
            //throw sendError('Invalid password', 401, { email });  can use data to send error
            throw sendError('Invalid password',403);
        }

        // Generate JWT token
        const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
        const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role });

        await userRepository.update(
            { id: user.id },
            { refreshToken } // add refreshToken field to User entity
        );
        return {
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            accessToken,
            refreshToken,
            message: "Login successful",
        };
  } catch (err) {
      logger.error(err);
      throw err;
  }
};

export const stats = async () => {
  try {
    const userRepository = AppDataSource.getRepository(User);
    const customers = await customerRepo.find();

    const totalCustomers = customers.length;
    // const totalOrders = await orderRepo.count();
    // const totalRevenue = await orderRepository.sum('totalAmount');

    const totalVerifiedVendors = await vendorRepo.find({ where: { status: "VERIFIED" } });
    const totalUnverifiedVendors = await vendorRepo.find({ where: { status: "PENDING" } });
    const totalRejectedVendors = await vendorRepo.find({ where: { status: "REJECTED" } });
    const totalBlockedVendors = await vendorRepo.find({ where: { status: "BLOCKED" } });
    const totalVendors = totalVerifiedVendors.length + totalUnverifiedVendors.length + totalRejectedVendors.length + totalBlockedVendors.length;

    return {
      totalCustomers,
      totalVendors,
      totalUnverifiedVendors: totalUnverifiedVendors.length,
      totalRejectedVendors: totalRejectedVendors.length,
      totalBlockedVendors: totalBlockedVendors.length,
      totalOrders: 0
    }
  } catch (err) {
    logger.error(err);
    throw err;
  }
};


export const getAllVendors = async (pageNumber = 1, limitNumber = 10) => {
  try {
    // Validate inputs
    pageNumber = Math.max(1, parseInt(pageNumber));
    limitNumber = Math.max(1, Math.min(parseInt(limitNumber), 100)); // Enforce max limit of 100

    // Create query
    const query = vendorRepo
      .createQueryBuilder("vendors")
      .leftJoinAndSelect("vendors.user", "user")
      .select([
        "vendors.id",
        "vendors.status",
        "vendors.createdAt",
        "vendors.serviceType",
        "user.email",
        "user.name",
        "user.phoneNumber",
        "user.isBlocked"
      ])
      .orderBy("vendors.createdAt", "DESC");

    // Get both results and total count in single query
    const [vendors, totalCount] = await Promise.all([
      query
        .skip((pageNumber - 1) * limitNumber)
        .take(limitNumber)
        .getMany(),
      query.getCount()
    ]);

    return {
      data: vendors,
      pagination: {
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        hasMore: pageNumber * limitNumber < totalCount
      }
    };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const getAllVendorsByFilter = async (pageNumber = 1, limitNumber = 10,status,serviceType) => {
  try {
    // Input validation and normalization
    pageNumber = Math.max(1, parseInt(pageNumber));
    limitNumber = Math.max(1, Math.min(parseInt(limitNumber), 100)); // Max 100 items per page

    // Base query construction
    const query = vendorRepo
      .createQueryBuilder("vendors")
      .leftJoinAndSelect("vendors.user", "user")
      .select([
        "vendors.id",
        "vendors.status",
        "vendors.serviceType",
        "vendors.createdAt",
        "user.email",
        "user.name",
        "user.phoneNumber",
        "user.isBlocked"
      ])
      .orderBy("vendors.createdAt", "DESC");

    // Apply filters
    if (serviceType) {
      query.andWhere("vendors.serviceType = :serviceType", { serviceType });
    }

    if (status === "BLOCKED") {
      query.andWhere("user.isBlocked = :isBlocked", { isBlocked: true });
    } else if (status) {
      query.andWhere("vendors.status = :status", { status });
    }

    // Execute both queries in parallel
    const [vendors, totalCount] = await Promise.all([
      query
        .skip((pageNumber - 1) * limitNumber)
        .take(limitNumber)
        .getMany(),
      query.getCount()
    ]);

    return {
      data: vendors,
      pagination: {
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        hasMore: pageNumber * limitNumber < totalCount,
        filters: {
          status,
          serviceType
        }
      }
    };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const searchByEmailorPhoneNumber = async (email, phoneNumber) => {
  try {
    const query =  await vendorRepo.createQueryBuilder("vendors")
    .leftJoinAndSelect("vendors.user", "user")
    .select([
      "vendors.id",
      "vendors.status",
      "vendors.serviceType",
      "vendors.createdAt",
      "user.email",
      "user.name",
      "user.phoneNumber",
      "user.isBlocked"
    ])
    if (email && !phoneNumber) {
      query.where("user.email LIKE :email", { email: `%${email}%` })
      .getMany();
    } else if (!email && phoneNumber) {
      query.where("user.phoneNumber LIKE :phoneNumber", { phoneNumber: `%${phoneNumber}%` })
      .getMany();
    } else {
      query.where("user.email LIKE :email", { email: `%${email}%` })
      .andWhere("user.phoneNumber LIKE :phoneNumber", { phoneNumber: `%${phoneNumber}%` })
      .getMany();
    }
    const vendors = await query.getMany();
    return {vendors};
  } catch (err) {
    logger.error(err);
    throw err;
  } 
}

export const getVendorById = async (id) => {
  try {
    const vendor = await vendorRepo
    .createQueryBuilder("vendors")
    .leftJoinAndSelect("vendors.user", "user")
    .select([
      "vendors.id",
      "vendors.userId",
      "vendors.aadhaarNumber",
      "vendors.aadhaarUrlPath", 
      "vendors.shopType",
      "vendors.ownershipType",
      "vendors.serviceType",
      "vendors.vendorServices",
      "vendors.shopName",
      "vendors.address",
      "vendors.city",
      "vendors.street",
      "vendors.state",
      "vendors.pincode",
      "vendors.location",
      "vendors.shopImageUrlPath",
      "vendors.shopDocumentUrlPath",
      "vendors.accountNumber",
      "vendors.ifscCode",
      "vendors.accountHolderName",
      "vendors.bankPassbookUrlPath",
      "vendors.shopDescription",
      "vendors.status",
      "vendors.createdAt",
      "vendors.updatedAt",
      "vendors.allTimeRating",
      "vendors.allTimeReviewCount",
      "vendors.currentMonthRating",
      "vendors.currentMonthReviewCount",
      "user.email",
      "user.name",
      "user.phoneNumber",
      "user.isBlocked"
    ])
    .where("vendors.id = :id", { id })
    .getOne();
   
    return { vendor };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const blockOrUnblockVendor = async (id) => {
  try {
    const vendor = await vendorRepo.findOne({ where: { id } });
    if (!vendor) {
      throw sendError('Vendor not found', 404);
    }
    const blockStatus = await userRepo.findOne({ where: { id: vendor.userId }, select: ["isBlocked"] });
    await userRepo.update(vendor.userId, { isBlocked: !blockStatus.isBlocked });
    return { message: "Vendor blocked successfully" };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const unblockVendor = async (id) => {
  try {
    const vendor = await vendorRepo.findOne({ where: { id } });
    if (!vendor) {
      throw sendError('Vendor not found', 404);
    }
    await userRepo.update(vendor.userId, { isBlocked: false });
    return { message: "Vendor unblocked successfully" };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const verifyVendor = async (id) => {
  try {
    const vendor = await vendorRepo.findOne({ where: { id } });
    if (!vendor) {
      throw sendError('Vendor not found', 404);
    }
    await vendorRepo.update(id, { status: "VERIFIED" });
    return { message: "Vendor verified successfully" };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const rejectVendor = async (id) => { //DELETE VENDOR
  try {
    const vendor = await vendorRepo.findOne({ where: { id } });
    if (!vendor) {
      throw sendError('Vendor not found', 404);
    }
    await vendorRepo.delete(id);
    /**
     * 
     * 
     * 
     * log this 
     * 
     * 
     */
    return { message: "Vendor rejected successfully" };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}
