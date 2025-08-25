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
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs"
import { Payments } from "../entities/Payments.mjs"
import { In, Not } from 'typeorm';
import { ORDER_STATUS, SHOP_TYPE, SERVICE_TYPE, OWNERSHIP_TYPE, ORDER_VENDOR_STATUS } from "../types/enums/index.mjs";
import { DEFAULT_PLATFORM_FEE_PERCENT, DEFAULT_VENDOR_FEE_PERCENT } from "../config/constants.mjs";
import { z } from "zod";
import { UpdateLog } from "../entities/UpdateLog.mjs";
import { VendorStats } from "../entities/VendorStats.mjs";
import { OrderStatusTimeline } from "../entities/orderStatusTimeline.mjs";
import { DeliveryTracking } from "../entities/DeliveryTracking.mjs";
import { Settings } from "../entities/Settings.mjs";
import { delCache } from "../utils/cache.mjs";

const orderRepo = AppDataSource.getRepository(Orders);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const orderQuoteRepo = AppDataSource.getRepository(OrderQuotes);
const customerRepo = AppDataSource.getRepository(Customers);
const vendorRepo = AppDataSource.getRepository(Vendors);
const userRepo = AppDataSource.getRepository(User);
const paymentRepo = AppDataSource.getRepository(Payments);
const vendorStatsRepo = AppDataSource.getRepository(VendorStats);
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
      "vendors.addressLine1",
      "vendors.addressLine2",
      "vendors.district",
      "vendors.landmark",
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
   
    const stats = await vendorStatsRepo.findOne({ where: { vendorId: vendor.id }, 
      select: {id: true, totalInProgressOrders: true, totalCompletedOrders: true, totalEarnings: true, totalDeductions: true}});

    const totalPendingRequests = await orderVendorRepo.count({ where: { vendorId: vendor.id, status: ORDER_VENDOR_STATUS.PENDING }});

    return { ...vendor, ...stats, totalPendingRequests };
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
    if(!blockStatus.isBlocked) {
      const orderHistory = await orderRepo.exists({ where: { selectedVendorId: id, orderStatus: Not(ORDER_STATUS.COMPLETED, ORDER_STATUS.REFUNDED) } });
      if (orderHistory) {
        throw sendError('Vendor has Active orders. So blocking this vendor will cause issues with the orders. Ensure the status of the orders is COMPLETED or REFUNDED', 400);
      }
    }
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
    const orderHistory = await orderRepo.exists({ where: { selectedVendorId: id } });
    if (orderHistory) {
      throw sendError('Vendor has / had orders. So deleting this vendor will cause issues with the orders. SYSTEM does not encourage HARD DELETE, instead try blocking the vendor', 400);
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

const updateVendorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().regex(/^(?:\+91|91)?[6789]\d{9}$/, { message: "Invalid Indian phone number format" }),
  aadhaarNumber: z.string().length(12, { message: "Aadhaar number must be 12 digits" }),
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

  bankPassbookUrlPath: z.string().optional(),
  aadhaarUrlPath: z.string().optional(),
  ownershipType: z.enum(Object.values(OWNERSHIP_TYPE)).optional().nullable().default(null),
  vendorServices: z.string().optional(),
  shopDocumentUrlPath: z.string().optional(),
}).refine(data => {
  if (data.shopType === SHOP_TYPE.IN_HOME) {
    if(data.ownershipType) return false;
  } else {
    if(!data.ownershipType) return false;
  }
  return true;
}, {
  message: "if shop type is not IN_HOME then ownershipType required. or else vice versa",
});

export const updateVendor = async (data, vendorId) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const {name, email, phoneNumber, bankPassbookUrlPath, aadhaarUrlPath, shopDocumentUrlPath, ...rest} = updateVendorSchema.parse(data);

    const vendor = await queryRunner.manager.findOne(Vendors, { where: { id: vendorId }, relations: ["user"] });
    if (!vendor) {
      throw sendError('Vendor not found', 404);
    }
    const oldData = vendor;
    const updateLog = queryRunner.manager.create(UpdateLog, {
      oldData,
      newData: data,
      reason: "Vendor updated by admin"
    });
    await queryRunner.manager.save(UpdateLog, updateLog);

    Object.assign(vendor, rest);
    Object.assign(vendor.user, {name, email, phoneNumber});

    if(bankPassbookUrlPath) {
      vendor.bankPassbookUrlPath = bankPassbookUrlPath;
    }
    if(aadhaarUrlPath) {
      vendor.aadhaarUrlPath = aadhaarUrlPath;
    }
    if(shopDocumentUrlPath) {
      vendor.shopDocumentUrlPath = shopDocumentUrlPath;
    }

    await queryRunner.manager.save(User, vendor.user);
    await queryRunner.manager.save(Vendors, vendor);

    await queryRunner.commitTransaction();
    return { message: "Vendor updated successfully" };
  } catch (error) {
    if (queryRunner.isTransactionActive) {  
      await queryRunner.rollbackTransaction();
    }

    if (error instanceof z.ZodError) {
      console.log(error.flatten())
      logger.warn("completeProfile validation failed", { errors: error.flatten().fieldErrors });
      throw sendError("Invalid data provided.", 400, error.flatten().fieldErrors);
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export const getOrders = async (pageNumber = 1, limitNumber = 10, sort = 'createdAt:desc', id, customerId, selectedVendorId, isPaid, isRefunded, orderStatus) => {
  try {
    const [sortField, sortOrder] = sort.split(':');

    const query = orderRepo.createQueryBuilder("orders")
    .select([
      "orders.id",
      "orders.customerId",
      "orders.selectedVendorId",
      "orders.isPaid",
      "orders.isRefunded",
      "orders.orderStatus",
      "orders.createdAt",
    ])
    if (id) query.andWhere("orders.id = :id", { id });
    if (customerId) query.andWhere("orders.customerId = :customerId", { customerId });
    if (selectedVendorId) query.andWhere("orders.selectedVendorId = :selectedVendorId", { selectedVendorId });
    if (isPaid) query.andWhere("orders.isPaid = :isPaid", { isPaid });
    if (isRefunded) query.andWhere("orders.isRefunded = :isRefunded", { isRefunded });
    if (orderStatus) query.andWhere("orders.orderStatus = :orderStatus", { orderStatus });

    if (sortField) {
      query.orderBy(`orders.${sortField}`, sortOrder === 'asc' ? 'ASC' : 'DESC');
    }

    const [data, total] = await query
    .skip((pageNumber - 1) * limitNumber)
    .take(limitNumber)
    .getManyAndCount();

    return {
      data,
      pagination: {
        totalItems: total,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
    }
  }
  } catch (error) {
    logger.error(error);
    throw error;
  }
}


export const getAllCustomers = async (pageNumber = 1, limitNumber = 10) => {
  try {
    // Validate inputs
    pageNumber = Math.max(1, parseInt(pageNumber));
    limitNumber = Math.max(1, Math.min(parseInt(limitNumber), 100)); // Enforce max limit of 100

    // Create query
    const query = customerRepo
      .createQueryBuilder("customers")
      .leftJoinAndSelect("customers.user", "user")
      .select([
        "customers.id",
        "customers.createdAt",
        "user.email",
        "user.name",
        "user.phoneNumber",
        "user.isBlocked"
      ])
      .orderBy("customers.createdAt", "DESC");

    // Get both results and total count in single query
    const [customers, totalCount] = await Promise.all([
      query
        .skip((pageNumber - 1) * limitNumber)
        .take(limitNumber)
        .getMany(),
      query.getCount()
    ]);

    return {
      data: customers,
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

export const getAllCustomersByFilter = async (pageNumber = 1, limitNumber = 10,status) => {
  try {
    // Input validation and normalization
    pageNumber = Math.max(1, parseInt(pageNumber));
    limitNumber = Math.max(1, Math.min(parseInt(limitNumber), 100)); // Max 100 items per page

    // Base query construction
    const query = customerRepo
      .createQueryBuilder("customers")
      .leftJoinAndSelect("customers.user", "user")
      .select([
        "customers.id",
        "customers.createdAt",
        "user.email",
        "user.name",
        "user.phoneNumber",
        "user.isBlocked"
      ])
      .orderBy("customers.createdAt", "DESC");

    // Apply filters
    if (status === "BLOCKED") {
      query.andWhere("user.isBlocked = :isBlocked", { isBlocked: true });
    } else if (status) {
      query.andWhere("customers.status = :status", { status });
    }

    // Execute both queries in parallel
    const [customers, totalCount] = await Promise.all([
      query
        .skip((pageNumber - 1) * limitNumber)
        .take(limitNumber)
        .getMany(),
      query.getCount()
    ]);

    return {
      data: customers,
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


export const searchCustomerByEmailorPhoneNumber = async (email, phoneNumber) => {
  try {
    const query =  await customerRepo.createQueryBuilder("customers")
    .leftJoinAndSelect("customers.user", "user")
    .select([
      "customers.id",
      "customers.createdAt",
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
    const customers = await query.getMany();
    return {customers};
  } catch (err) {
    logger.error(err);
    throw err;
  } 
}

export const getCustomerById = async (id) => {
  try {
    const customer = await customerRepo
    .createQueryBuilder("customers")
    .leftJoinAndSelect("customers.user", "user")
    .select([
      "customers.id",
      "customers.userId",
      "customers.createdAt",
      "user.email",
      "user.name",
      "user.phoneNumber",
      "user.isBlocked"
    ])
    .where("customers.id = :id", { id })
    .getOne();
    return { customer };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const updateCustomer = async (data) => {
  try {
    const {customerId, ...rest} = data;
    const customer = await customerRepo.findOne({ where: { id: customerId }, select: {userId : true} });
    const user = await userRepo.findOne({ where: { id: customer.userId } });
    if (!user) {
      throw sendError('User not found', 404);
    }
    await userRepo.update(user.id, rest);
    return { message: "Customer updated successfully" };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}
export const blockOrUnblockCustomer = async (id) => {
  try {
    const customer = await customerRepo.findOne({ where: { id } });
    if (!customer) {
      throw sendError('Customer not found', 404);
    }
    const blockStatus = await userRepo.findOne({ where: { id: customer.userId }, select: ["isBlocked"] });
    await userRepo.update(customer.userId, { isBlocked: !blockStatus.isBlocked });
    return { message: "Customer blocked successfully" };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const getOrderById = async (id) => {
  try {
    const order = await orderRepo
    .createQueryBuilder("orders")
    // .leftJoinAndSelect("orders.customer", "customer")
    // .leftJoinAndSelect("orders.selectedVendor", "vendor")
    .select([
      "orders.id",
      "orders.customerId",
      "orders.selectedVendorId",
      "orders.finalQuoteId",
      "orders.paymentId",
      "orders.finishByDate",
      "orders.orderName",
      "orders.orderType",
      "orders.orderPreference",
      "orders.requiredByDate",
      "orders.clothProvided",
      "orders.fullName",
      "orders.phoneNumber",
      "orders.addressLine1",
      "orders.addressLine2",
      "orders.district",
      "orders.state",
      "orders.pincode",
      "orders.addressType",
      "orders.landmark",
      "orders.city",
      "orders.street",
      "orders.isPaid",
      "orders.isRefunded",
      "orders.orderStatus",
      "orders.orderStatusTimestamp",
      "orders.createdAt",
    ])
    .where("orders.id = :id", { id })
    .getOne();
    return { order };
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const getVendorResponse = async (id) => {
  try{
    const orderVendor = await orderVendorRepo.find({ where: { orderId: id } });
    return orderVendor;
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const getQuotes = async (id) => {
  try{
    const quote = await orderQuoteRepo.findOne({ where: { orderVendorId: id } });
    if (!quote) throw sendError('Quote not found', 404);
    return quote;
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const getPayments = async (id) => {
  try{
    const payments = await paymentRepo.find({ where: { orderId: id } });
 
    return payments;
  } catch (err) {
    logger.error(err);
    throw err;
  }
}

export const getOrderTimeline = async (orderId) => {
  try {
      const order = await orderRepo.findOne({
           where: { id: orderId },
           select: {id: true }, 
          });
      if (!order) throw sendError("Order not found", 404);
 
      const orderStatusTimelineRepo = AppDataSource.getRepository(OrderStatusTimeline);
      const orderTimeline = await orderStatusTimelineRepo.find({ 
          where: { orderId: orderId },
          // select: { id: true, previousStatus: true, newStatus: true, changedAt: true },
      });
      if (!orderTimeline) throw sendError("Order timeline not found", 404);
 
      return orderTimeline;

  } catch (error) {
      logger.error("Error getting order timeline", error);
      throw error;
  }
}

export const getDeliveryDetails = async (orderId) => {
  try {
    const deliveryTrackingRepo = AppDataSource.getRepository(DeliveryTracking);
    const deliveryTracking = await deliveryTrackingRepo.find({ where: { orderId } });
    return deliveryTracking;
  } catch (error) {
    logger.error("Error getting delivery details", error);
    throw error;
  }
}

export const getOrSetSettings = async (key) => {
  try {
    const settings = await AppDataSource.getRepository(Settings).findOne({ where: { key } });
    let value;
    if (!settings) {
      if (key === "platform_fee_percent") {
        await delCache("platform_fee_percent");
        value = DEFAULT_PLATFORM_FEE_PERCENT;
      } else if (key === "vendor_fee_percent") {
        await delCache("vendor_fee_percent");
        value = DEFAULT_VENDOR_FEE_PERCENT;
      }
      await AppDataSource.getRepository(Settings).save({ key, value, type: "number" });
      logger.info(`Settings ${key} set to ${value}`);
      return value;
    }
    return settings.value;
  } catch (error) {
    logger.error("Error getting settings", error);
    throw error;
  }
}

export const updateSettings = async (key, value, userId) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    if (key === "platform_fee_percent" || key === "vendor_fee_percent") {
      if (value < 0 || value > 100) throw sendError("Invalid value", 400);
    }
    const settings = await queryRunner.manager.findOne(Settings, { where: { key } });
    if (!settings) throw sendError("Settings not found", 404);
    settings.value = value;
    settings.updatedBy = userId;
    await queryRunner.manager.save(Settings, settings);
    await delCache(key);
    await queryRunner.commitTransaction();
    return { message: "Settings updated successfully" };
  } catch (error) {
    logger.error("Error updating settings", error);
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw error;
  } finally {
    await queryRunner.release(); 
  }
}