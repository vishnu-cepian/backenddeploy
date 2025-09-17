import { z } from "zod";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { AppDataSource } from "../config/data-source.mjs";
import { Customers } from "../entities/Customers.mjs";
import { CustomerAddress } from "../entities/CustomerAddress.mjs";
import { Vendors } from "../entities/Vendors.mjs";
import { VendorImages } from "../entities/VendorImages.mjs";
import { getPresignedViewUrl } from "../services/s3service.mjs";
import { cacheOrFetch } from "../utils/cache.mjs";
import { Orders } from "../entities/Orders.mjs";
import { OrderItems } from "../entities/OrderItems.mjs";
import { SERVICE_TYPE, ORDER_STATUS, ORDER_VENDOR_STATUS, PAYMENT_STATUS } from "../types/enums/index.mjs";
import { OrderVendors } from "../entities/OrderVendors.mjs";
import { OrderQuotes } from "../entities/OrderQuote.mjs";
import { Complaints } from "../entities/Complaints.mjs";
import { Payments } from "../entities/Payments.mjs";
import { PaymentFailures } from "../entities/PaymentFailures.mjs";
import { Rating } from "../entities/Rating.mjs";
import { Settings } from "../entities/Settings.mjs";

const customerRepo = AppDataSource.getRepository(Customers);
const customerAddressRepo = AppDataSource.getRepository(CustomerAddress);
const orderRepo = AppDataSource.getRepository(Orders);
const orderVendorRepo = AppDataSource.getRepository(OrderVendors);
const orderQuoteRepo = AppDataSource.getRepository(OrderQuotes);
const paymentRepo = AppDataSource.getRepository(Payments);
const paymentFailureRepo = AppDataSource.getRepository(PaymentFailures);

//============================ ZOD VALIDATION SCHEMAS ==============================================

const addCustomerAddressSchema = z.object({
    userId: z.string().uuid(),
    fullName: z.string().min(1, { message: "Full name is required" }),
    phoneNumber: z.string().regex(/^(?:\+91|91)?[6789]\d{9}$/, { message: "Invalid phone number format" }), // 91XXXXXXXXX
    addressLine1: z.string().min(1, { message: "Address line 1 is required" }),
    addressLine2: z.string().optional().nullable(),
    addressType: z.string().optional().nullable(),
    street: z.string().min(1, { message: "Street is required" }),
    city: z.string().min(1, { message: "City is required" }),
    district: z.string().min(1, { message: "District is required" }),
    landmark: z.string().optional().nullable(),
    state: z.string().min(1, { message: "State is required" }),
    pincode: z.string().regex(/^\d{6}$/, { message: "Invalid pincode format" }), 
    isDefault: z.boolean().optional(),
})

const vendorIdSchema = z.object({
    vendorId: z.string().uuid().min(1, { message: "Vendor ID is required" }),
})

const getOrdersSchema = z.object({
    userId: z.string().uuid(),
    serviceType: z.enum(Object.values(SERVICE_TYPE)).optional(),
    orderStatus: z.enum(Object.values(ORDER_STATUS)).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10),
})

const addComplaintSchema = z.object({
    userId: z.string().uuid(),
    orderId: z.string().uuid().optional(),
    complaint: z.string().min(1, { message: "Complaint is required" }),
})

const getCustomerPaymentsSchema = z.object({
    userId: z.string().uuid(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10),
    status: z.string().optional(),
})

const getOrdersWithOrderRequestsSchema = z.object({
    userId: z.string().uuid(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10),
})

const getVendorReviewsSchema = z.object({
    userId: z.string().uuid(),
    vendorId: z.string().uuid(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(50).default(10),
})

//============================ CUSTOMER ADDRESS SERVICES ==============================================

/**
 * @api {post} /api/customer/addCustomerAddress Add Customer Address
 * @apiName AddCustomerAddress
 * @apiGroup Customer
 * @apiDescription Adds a new address for the logged-in customer.
 * 
 * @apiBody {string} fullName - The full name of the address.
 * @apiBody {string} phoneNumber - The phone number of the address.
 * @apiBody {string} addressLine1 - The first line of the address.
 * @apiBody {string} addressLine2 - The second line of the address.
 * @apiBody {string} addressType - The type of the address.
 * @apiBody {string} street - The street of the address.
 * @apiBody {string} city - The city of the address.
 * @apiBody {string} district - The district of the address.
 * @apiBody {string} landmark - The landmark of the address.
 * @apiBody {string} state - The state of the address.
 * @apiBody {string} pincode - The pincode of the address.
 * @apiBody {boolean} isDefault - Whether the address is the default address.
 * 
 * @param {object} data - The address data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.fullName - The full name of the address.
 * @param {string} data.phoneNumber - The phone number of the address.
 * @param {string} data.addressLine1 - The first line of the address.
 * @param {string} data.addressLine2 - The second line of the address.
 * @param {string} data.addressType - The type of the address.
 * @param {string} data.street - The street of the address.
 * @param {string} data.city - The city of the address.
 * @param {string} data.district - The district of the address.
 * @param {string} data.landmark - The landmark of the address.
 * @param {string} data.state - The state of the address.
 * @param {string} data.pincode - The pincode of the address.
 * @param {boolean} data.isDefault - Whether the address is the default address.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * @returns {Promise<void>}
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the customer is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 * @throws {Error} 404 - If the customer is not found.
 */
export const addCustomerAddress = async (data) => {
    try {
        const { userId, fullName, phoneNumber, addressLine1, addressLine2, addressType, street, city, district, landmark, state, pincode, isDefault } = addCustomerAddressSchema.parse(data);

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });

        if (!customer) throw sendError("Customer not found", 404);

        const address = customerAddressRepo.create({ customerId: customer.id, fullName, phoneNumber, addressLine1, addressLine2, addressType, street, city, district, landmark, state, pincode, isDefault });
        await customerAddressRepo.save(address);

        return {
            success: true,
            message: "Address added successfully",
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error("Add customer address validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Validation failed", 400, error.flatten().fieldErrors);
        }
        logger.error("Error adding customer address", error);
        throw error;
    }
}

/**
 * @api {get} /api/customer/getCustomerAddresses Get Customer Addresses
 * @apiName GetCustomerAddresses
 * @apiGroup Customer
 * @apiDescription Retrieves all non-deleted addresses for the logged-in customer.
 * 
 * @param {string} data.userId - The UUID of the user.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * @apiSuccess {Object[]} response.addresses - The addresses of the customer.
 * @apiSuccess {string} response.addresses.id - The UUID of the address.
 * @apiSuccess {string} response.addresses.fullName - The full name of the address.
 * @apiSuccess {string} response.addresses.phoneNumber - The phone number of the address.
 * @apiSuccess {string} response.addresses.addressLine1 - The first line of the address.
 * @apiSuccess {string} response.addresses.addressLine2 - The second line of the address.
 * @apiSuccess {string} response.addresses.addressType - The type of the address.
 * @apiSuccess {string} response.addresses.street - The street of the address.
 * @apiSuccess {string} response.addresses.city - The city of the address.
 * @apiSuccess {string} response.addresses.district - The district of the address.
 * @apiSuccess {string} response.addresses.landmark - The landmark of the address.
 * @apiSuccess {string} response.addresses.state - The state of the address.
 * @apiSuccess {string} response.addresses.pincode - The pincode of the address.
 * @apiSuccess {boolean} response.addresses.isDefault - Whether the address is the default address.
 * 
 * @apiError {Error} 404 - If the customer is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getCustomerAddresses = async (data) => {
    try {
        const { userId } = data;
        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const addresses = await customerAddressRepo.find({ where: { customerId: customer.id, isDeleted: false } });

        return {
            success: true,
            message: "Addresses fetched successfully",
            addresses
        }
    } catch (error) {
        logger.error("Error fetching customer addresses", error);
        throw error;
    }
}

/**
 * @api {patch} /api/customer/updateCustomerAddress Update Customer Address
 * @apiName UpdateCustomerAddress
 * @apiGroup Customer
 * @apiDescription Updates an existing address for the logged-in customer.
 * 
 * @apiBody {string} addressId - The UUID of the address.
 * @apiBody {string} fullName - The full name of the address.
 * @apiBody {string} phoneNumber - The phone number of the address.
 * @apiBody {string} addressLine1 - The first line of the address.
 * @apiBody {string} addressLine2 - The second line of the address.
 * @apiBody {string} addressType - The type of the address.
 * @apiBody {string} street - The street of the address.
 * @apiBody {string} city - The city of the address.
 * @apiBody {string} district - The district of the address.
 * @apiBody {string} landmark - The landmark of the address.
 * @apiBody {string} state - The state of the address.
 * @apiBody {string} pincode - The pincode of the address.
 * @apiBody {boolean} isDefault - Whether the address is the default address.
 * 
 * @param {object} data - The address data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.addressId - The UUID of the address.
 * @param {string} data.fullName - The full name of the address.
 * @param {string} data.phoneNumber - The phone number of the address.
 * @param {string} data.addressLine1 - The first line of the address.
 * @param {string} data.addressLine2 - The second line of the address.
 * @param {string} data.addressType - The type of the address.
 * @param {string} data.street - The street of the address.
 * @param {string} data.city - The city of the address.
 * @param {string} data.district - The district of the address.
 * @param {string} data.landmark - The landmark of the address.
 * @param {string} data.state - The state of the address.
 * @param {string} data.pincode - The pincode of the address.
 * @param {boolean} data.isDefault - Whether the address is the default address.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the customer or address is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const updateCustomerAddress = async (data) => {
    try {
        const { addressId, ...newData } = data;
        const { userId, ...rest } = addCustomerAddressSchema.parse(newData);

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const address = await customerAddressRepo.findOne({ where: { id: addressId, customerId: customer.id,  isDeleted: false } });
        if (!address) throw sendError("Address not found", 404);

        await customerAddressRepo.update(address.id, { ...rest });

        return {
            success: true,
            message: "Address updated successfully",
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error("Update customer address validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Validation failed", 400, error.flatten().fieldErrors);
        }
        logger.error("Error updating customer address", error);
        throw error;
    }
}

/**
 * @api {patch} /api/customer/deleteCustomerAddress/:addressId Delete Customer Address
 * @apiName DeleteCustomerAddress
 * @apiGroup Customer
 * @apiDescription soft deletes an existing address for the logged-in customer.
 * 
 * @apiParam {string} addressId - The UUID of the address.
 * 
 * @param {object} data - The address data.
 * @param {string} data.addressId - The UUID of the address.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiError {Error} 404 - If the address is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const deleteCustomerAddress = async (data) => {
    try {
        const { addressId } = data;
        const address = await customerAddressRepo.findOne({ where: { id: addressId, isDeleted: false } });
        if (!address) throw sendError("Address not found", 404);

        await customerAddressRepo.update(address.id, { isDeleted: true, deletedAt: new Date() });

        return {
            success: true,
            message: "Address deleted successfully",
        }
    } catch (error) {
        logger.error("Error deleting customer address", error);
        throw error;
    }
}

/**
 * @api {patch} /api/customer/makeAddressDefault/:addressId Make Address Default
 * @apiName MakeAddressDefault
 * @apiGroup Customer
 * @apiDescription Makes an existing address the default address for the logged-in customer.
 * 
 * @apiParam {string} addressId - The UUID of the address.
 * 
 * @param {object} data - The address data.
 * @param {string} data.addressId - The UUID of the address.
 * @param {string} data.userId - The UUID of the user.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiError {Error} 404 - If the customer or address is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const makeAddressDefault = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
        const { addressId, userId } = data;

        const customer = await queryRunner.manager.findOne(Customers, { where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const existingDefaultAddress = await queryRunner.manager.findOne(CustomerAddress, { where: { customerId: customer.id, isDefault: true } });
        if (existingDefaultAddress) {
            await queryRunner.manager.update(CustomerAddress, existingDefaultAddress.id, { isDefault: false });
        }

        const address = await queryRunner.manager.findOne(CustomerAddress, { where: { id: addressId, customerId: customer.id, isDeleted: false } });
        if (!address) throw sendError("Address not found", 404);

        await queryRunner.manager.update(CustomerAddress, address.id, { isDefault: true });

        await queryRunner.commitTransaction();

        return {
            success: true,
            message: "Address made default successfully",
        }
    } catch (error) {
        await queryRunner.rollbackTransaction();
        logger.error("Error making address default", error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

//============================ VENDOR DETAIL SERVICES ==============================================

/**
 * @api {get} /api/customer/getVendorDetailsByVendorId/:vendorId Get Vendor Details By Vendor Id
 * @apiName GetVendorDetailsByVendorId
 * @apiGroup Customer
 * @apiDescription Fetches public-facing details for a specific vendor. Uses caching for performance (5 minutes).
 * 
 * @apiParam {string} vendorId - The UUID of the vendor.
 * 
 * @param {object} data - The vendor data.
 * @param {string} data.vendorId - The UUID of the vendor.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * @apiSuccess {Object} response.vendor - The details of the vendor.
 * 
 * @apiSuccess {string} response.vendor.id - The UUID of the vendor.
 * @apiSuccess {string} response.vendor.name - The name of the vendor.
 * @apiSuccess {string} response.vendor.shopName - The name of the vendor's shop.
 * @apiSuccess {string} response.vendor.shopDescription - The description of the vendor's shop.
 * @apiSuccess {string} response.vendor.serviceType - The type of service the vendor offers.
 * @apiSuccess {Object[]} response.vendor.vendorServices - The services offered by the vendor.
 * @apiSuccess {string} response.vendor.city - The city of the vendor.
 * @apiSuccess {string} response.vendor.state - The state of the vendor.
 * @apiSuccess {string} response.vendor.shopImageUrl - The URL of the vendor's shop image.
 * @apiSuccess {string} response.vendor.vendorAvatarUrl - The URL of the vendor's avatar image.
 * @apiSuccess {number} response.vendor.allTimeRating - The overall rating of the vendor.
 * @apiSuccess {number} response.vendor.allTimeReviewCount - The total number of reviews the vendor has received.
 * @apiSuccess {number} response.vendor.currentMonthRating - The rating of the vendor in the current month.
 * @apiSuccess {number} response.vendor.currentMonthReviewCount - The total number of reviews the vendor has received in the current month.
 * @apiSuccess {number} response.vendor.currentMonthBayesianScore - The Bayesian score of the vendor in the current month.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorDetailsByVendorId = async (data) => {
    try {
        const { vendorId } = vendorIdSchema.parse(data);
        return cacheOrFetch(`vendorDetailsByVendorId:${vendorId}`, async () => {
            const vendor = await AppDataSource.getRepository(Vendors).createQueryBuilder("vendors")
            .leftJoinAndSelect("vendors.user", "user")
            .select([
                "vendors.id",
                "user.name",
                "vendors.shopName",
                "vendors.shopDescription",
                "vendors.serviceType",
                "vendors.vendorServices",
                "vendors.city",
                "vendors.state",
                "vendors.shopImageUrlPath",
                "vendors.vendorAvatarUrlPath",
                "vendors.allTimeRating",
                "vendors.allTimeReviewCount",
                "vendors.currentMonthRating",
                "vendors.currentMonthReviewCount",
                "vendors.currentMonthBayesianScore",
            ])
            .where("vendors.id = :vendorId", { vendorId })
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
        if (error instanceof z.ZodError) {
            logger.error("Get vendor details by vendor id validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Validation failed", 400, error.flatten().fieldErrors);
        }
        logger.error("Error getting vendor details by vendor id", error);
        throw error;
    }
}

/**
 * @api {get} /api/customer/getVendorWorkImagesByVendorId/:vendorId Get Vendor Work Images By Vendor Id
 * @apiName GetVendorWorkImagesByVendorId
 * @apiGroup Customer
 * @apiDescription Fetches work images for a specific vendor with presigned urls. Uses caching for performance (5 minutes).
 * 
 * @apiParam {string} vendorId - The UUID of the vendor.
 * 
 * @param {object} data - The vendor data.
 * @param {string} data.vendorId - The UUID of the vendor.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * @apiSuccess {Object[]} response.workImages - The work images of the vendor.
 * 
 * @apiSuccess {string} response.workImages.id - The UUID of the work image.
 * @apiSuccess {string} response.workImages.vendorId - The UUID of the vendor.
 * @apiSuccess {string} response.workImages.s3Key - The S3 key of the work image.
 * @apiSuccess {string} response.workImages.uploadedAt - The timestamp of the work image.
 * @apiSuccess {string} response.workImages.presignedUrl - The presigned URL of the work image.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the vendor is not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getVendorWorkImagesByVendorId = async (data) => {
    try {
        const { vendorId } = vendorIdSchema.parse(data);

        return cacheOrFetch(`vendorWorkImagesByVendorId:${vendorId}`, async () => {
            const vendor = await AppDataSource.getRepository(Vendors).findOne({ where: { id: vendorId }, select: { id: true } });
            if (!vendor) throw sendError("Vendor profile not found", 404);

            const vendorImages = await AppDataSource.getRepository(VendorImages).find({
                where: { vendorId: vendor.id },
                order: { uploadedAt: "DESC", },
            });

            const workImages = await Promise.all(vendorImages.map(async (image) => {
                const presignedUrl = await getPresignedViewUrl(image.s3Key);
                return {
                  ...image,
                  presignedUrl,
                };
            }));

            return {
                success: true,
                message: "Vendor work images fetched successfully",
                workImages,
            }
        }, 300);
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error("Get vendor work images by vendor id validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Validation failed", 400, error.flatten().fieldErrors);
        }
        logger.error("Error getting vendor work images by vendor id", error);
        throw error;
    }
}

//============================ ORDER SERVICES ==============================================

/**
 * @api {get} /api/customer/getOrders/:page/:limit Get Orders
 * @apiName GetOrders
 * @apiGroup Customer
 * @apiDescription Fetches orders for the logged-in customer.
 * 
 * @apiQuery {string} serviceType - The type of service.(tailors, laundry)
 * @apiQuery {string} orderStatus - The status of the order.(PENDING, IN_PROGRESS,COMPLETED, CANCELLED)
 * @apiParam {number} page - The page number.
 * @apiParam {number} limit - The number of orders per page.
 * 
 * @param {object} data - The order data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.serviceType - The type of service.
 * @param {string} data.orderStatus - The status of the order.
 * @param {number} data.page - The page number.
 * @param {number} data.limit - The number of orders per page.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * @apiSuccess {Object[]} response.orders - The orders of the customer.
 * @apiSuccess {string} response.orders.id - The UUID of the order.
 * @apiSuccess {string} response.orders.orderName - The name of the order.
 * @apiSuccess {string} response.orders.serviceType - The type of service.
 * @apiSuccess {string} response.orders.orderStatus - The status of the order.
 * @apiSuccess {boolean} response.orders.isRated - Whether the order has been rated.
 * @apiSuccess {string} response.orders.finishByDate - The date by which the order must be finished.
 * @apiSuccess {string} response.orders.orderStatusTimestamp - The timestamp of the order status.
 * @apiSuccess {string} response.orders.requiredByDate - The date by which the order must be required.
 * @apiSuccess {string} response.orders.createdAt - The timestamp of the order creation.
 * 
 * @apiSuccess {Object} response.pagination - The pagination of the orders.
 * @apiSuccess {number} response.pagination.currentPage - The current page number.
 * @apiSuccess {number} response.pagination.hasMore - Whether there are more orders to fetch.
 * @apiSuccess {number} response.pagination.nextPage - The next page number.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the customer or orders are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getOrders = async (data) => {
    try {
        const { userId, serviceType, orderStatus, page, limit } = getOrdersSchema.parse(data);
        const offset = (page - 1) * limit;

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const orders = await orderRepo.find({ where: { customerId: customer.id, serviceType: serviceType, orderStatus: orderStatus }, 
            select: { id: true, orderName: true, serviceType: true, orderStatus: true, isRated: true, finishByDate: true, orderStatusTimestamp: true, requiredByDate: true, createdAt: true },
            skip: offset,
            take: limit
        });
        if (!orders) throw sendError("Orders not found", 404);

        const processedOrders = orders.map(order => ({
            ...order,
            orderStatusTimestamp: order.orderStatusTimestamp.completedAt ? order.orderStatusTimestamp.completedAt : null,
        }));

        return {
            orders: processedOrders,
            pagination: {
                currentPage: page,
                hasMore: orders.length === limit,
                nextPage: orders.length === limit ? page + 1 : null,
            },
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.warn("getOrders validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
        }
        logger.error("getOrders error", error);
        throw error;
    }
}

/**
 * @api {get} /api/customer/getOrderById/:orderId Get Order By Id
 * @apiName GetOrderById
 * @apiGroup Customer
 * @apiDescription  Retrieves full details for a single order, including items and quote/vendor info if applicable.
 * 
 * @apiParam {string} orderId - The ID of the order.
 * 
 * @param {object} data - The order data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderId - The ID of the order.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiSuccess {Object} response.order - The order details.
 * 
 * @apiSuccess {string} response.vendor.shopName - The name of the vendor.
 * @apiSuccess {string} response.vendor.shopImageUrl - The URL of the vendor's shop image.
 * 
 * @apiSuccess {string} response.quote.id - The UUID of the quote.
 * @apiSuccess {number} response.quote.quotedDays - The number of days quoted.
 * @apiSuccess {number} response.quote.priceAfterPlatformFee - The price after platform fee.
 * @apiSuccess {number} response.quote.deliveryCharge - The delivery charge.
 * @apiSuccess {number} response.quote.finalPrice - The final price.
 * @apiSuccess {string} response.quote.notes - The notes of the quote.
 * @apiSuccess {boolean} response.quote.isProcessed - Whether the quote has been processed.
 * 
 * @apiSuccess {string} response.address.fullName - The full name of the address.
 * @apiSuccess {string} response.address.phoneNumber - The phone number of the address.
 * @apiSuccess {string} response.address.addressLine1 - The first line of the address.
 * @apiSuccess {string} response.address.addressLine2 - The second line of the address.
 * @apiSuccess {string} response.address.district - The district of the address.
 * @apiSuccess {string} response.address.state - The state of the address.
 * @apiSuccess {string} response.address.street - The street of the address.
 * @apiSuccess {string} response.address.city - The city of the address.
 * @apiSuccess {string} response.address.pincode - The pincode of the address.
 * @apiSuccess {string} response.address.landmark - The landmark of the address.
 * @apiSuccess {string} response.address.addressType - The type of the address.
 * 
 * @apiSuccess {Object[]} response.orderItems - The order items.
 * 
 * @apiError {Error} 404 - If the customer, order, order items, vendor, quote or address is not found.
 * @apiError {Error} 403 - If the customer is not authorized to view the order.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getOrderById = async (data) => {
    try {
        const { userId, orderId } = data;

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const order = await orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw sendError("Order not found", 404);

        if (order.customerId !== customer.id) throw sendError("You are not authorized to view this order", 403);

        const orderItems = await AppDataSource.getRepository(OrderItems).find({ where: { orderId: orderId } });
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
        const {fullName, phoneNumber, addressLine1, addressLine2, district, state, street, city, pincode, landmark, addressType, ...orderDetailsWithoutAddress } = order;

        const responseBase = {
            order: orderDetailsWithoutAddress,
            address: { fullName, phoneNumber, addressLine1, addressLine2, district, state, street, city, pincode, landmark, addressType},
            orderItems: processedOrderItems
        }

        if (order.orderStatus === ORDER_STATUS.PENDING) {
            return { ...responseBase, vendor: null, quote: null }
        } else {
            const vendor = await AppDataSource.getRepository(Vendors).findOne({ where: { id: order.selectedVendorId }, select: { id: true, shopName: true, shopImageUrlPath: true } });
            const shopImageUrl =  vendor.shopImageUrlPath ? await getPresignedViewUrl(vendor.shopImageUrlPath) : null;

            const quote = await AppDataSource.getRepository(OrderQuotes).findOne({ where: { id: order.finalQuoteId }, select: { id: true, quotedDays: true, priceAfterPlatformFee: true, deliveryCharge: true, finalPrice: true, notes: true, isProcessed: true } });
            if (!quote) throw sendError("Quote not found for this order", 404);

            return {
                ...responseBase,
                vendor: {
                    shopName: vendor.shopName,
                    shopImageUrl: shopImageUrl,
                },
                quote: {
                    id: quote.id,
                    quotedDays: quote.quotedDays,
                    priceAfterPlatformFee: quote.priceAfterPlatformFee,
                    deliveryCharge: quote.deliveryCharge,
                    finalPrice: quote.finalPrice,
                    notes: quote.notes,
                    isProcessed: quote.isProcessed
                }
            }
        }
    } catch (err) {
        logger.error("Error getting order by id", err);
        throw err;
    }
}

/**
 * @api {get} /api/customer/getOrdersWithOrderRequests/:page/:limit Get Orders With Order Requests
 * @apiName GetOrdersWithOrderRequests
 * @apiGroup Customer
 * @apiDescription Fetches all orders with order status PENDING & orderVendor status PENDING, ACCEPTED, REJECTED.
 * 
 * @apiParam {number} page - The page number.
 * @apiParam {number} limit - The limit of the orders.
 * 
 * @param {object} data - The order request data.
 * @param {string} data.userId - The UUID of the user.
 * @param {number} data.page - The page number.
 * @param {number} data.limit - The limit of the orders.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiSuccess {Object[]} response.orders - The orders of the customer.
 * @apiSuccess {string} response.orders.id - The UUID of the order.
 * @apiSuccess {string} response.orders.orderName - The name of the order.
 * @apiSuccess {string} response.orders.serviceType - The type of service.
 * @apiSuccess {string} response.orders.createdAt - The timestamp of the order creation.
 * 
 * @apiSuccess {Object} response.pagination - The pagination of the orders.
 * @apiSuccess {number} response.pagination.currentPage - The current page number.
 * @apiSuccess {number} response.pagination.hasMore - Whether there are more orders to fetch.
 * @apiSuccess {number} response.pagination.nextPage - The next page number.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the customer or orders are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getOrdersWithOrderRequests = async (data) => {
    try {
        const { userId, page, limit } = getOrdersWithOrderRequestsSchema.parse(data);
        const offset = (page - 1) * limit;

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const orders = await orderRepo.createQueryBuilder("orders")
        .leftJoinAndSelect("orders.orderVendors", "orderVendors")
        .select([
            "orders.id",
            "orders.orderName",
            "orders.serviceType",
            "orders.createdAt",
        ])
        .where("orders.customerId = :customerId", { customerId: customer.id })
        .andWhere("orders.orderStatus = :orderStatus", { orderStatus: ORDER_STATUS.PENDING })
        .andWhere("orderVendors.status IN (:...status)", { status: [ORDER_VENDOR_STATUS.PENDING, ORDER_VENDOR_STATUS.ACCEPTED, ORDER_VENDOR_STATUS.REJECTED] })
        .orderBy("orders.createdAt", "DESC")
        .skip(offset)
        .take(limit)
        .getMany();

        if (!orders) throw sendError("Orders not found", 404);

        return {
            orders: orders.map(order => ({
                id: order.id,
                orderName: order.orderName,
                serviceType: order.serviceType,
                createdAt: order.createdAt,
            })),
            pagination: {
                currentPage: page,
                hasMore: orders.length === limit,
                nextPage: orders.length === limit ? page + 1 : null,
            },
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.warn("getOrdersWithOrderRequests validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
        }
        logger.error("Error getting orders with order requests", error);
        throw error;
    }
}

/**
 * @api {get} /api/customer/getOrderRequests/:orderId Get Order Requests
 * @apiName GetOrderRequests
 * @apiGroup Customer
 * @apiDescription Fetches the status of requests sent to various vendors for a single pending order.
 * 
 * @apiParam {string} orderId - The ID of the order.
 * 
 * @param {object} data - The order request data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderId - The ID of the order.
 * 
 * @apiSuccess {Object[]} response.orderRequests - The order requests.
 * 
 * @apiSuccess {string} response.orderRequests.id - The UUID of the order request.
 * @apiSuccess {string} response.orderRequests.status - The status of the order request (PENDING, ACCEPTED, REJECTED).
 * @apiSuccess {string} response.orderRequests.createdAt - The timestamp of the order request creation.
 * @apiSuccess {string} response.orderRequests.shopName - The name of the vendor.
 * @apiSuccess {string} response.orderRequests.shopImageUrl - The URL of the vendor's shop image.
 * @apiSuccess {string} response.orderRequests.notes - The notes of the order request.
 * 
 * @apiError {Error} 404 - If the customer or order are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */
export const getOrderRequests = async (data) => {
    try {
       const { userId, orderId } = data;

       const customer = await customerRepo.exists({ where: { userId: userId } });
       if (!customer) throw sendError("Customer Profile not found", 404);

       const order = await orderRepo.exists({ where: { id: orderId } });
       if (!order) throw sendError("Order not found", 404);

       const orderRequests = await orderVendorRepo.createQueryBuilder("orderVendors")
       .leftJoinAndSelect("orderVendors.vendor", "vendors")
       .select([
        "orderVendors.id",
        "orderVendors.status",
        "orderVendors.createdAt",
        "vendors.shopName",
        "vendors.shopImageUrlPath",
        "orderVendors.notes"
       ])
       .where("orderVendors.orderId = :orderId", { orderId })
       .andWhere("orderVendors.status IN (:...status)", { status: [ORDER_VENDOR_STATUS.ACCEPTED, ORDER_VENDOR_STATUS.PENDING, ORDER_VENDOR_STATUS.REJECTED] })
       .getMany();

       if (orderRequests.length === 0) return [];

       const processedOrderRequests = await Promise.all(orderRequests.map(async (orderRequest) => ({
        id: orderRequest.id,
        status: orderRequest.status,
        createdAt: orderRequest.createdAt,
        shopName: orderRequest.vendor.shopName,
        shopImageUrl: orderRequest.vendor.shopImageUrlPath ? await getPresignedViewUrl(orderRequest.vendor.shopImageUrlPath) : null,
        notes: orderRequest.notes
       })));
 
       return {
        orderRequests: processedOrderRequests
       }
    } catch (error) {
        logger.error("Error getting pending or accepted quotes", error);
        throw error;
    }
}

/**
 * @api {get} /api/customer/getAcceptedQuoteById/:orderVendorId Get Accepted Quote By Id
 * @apiName GetAcceptedQuoteById
 * @apiGroup Customer
 * @apiDescription Retrieves the details of a specific quote that a vendor has accepted, ready for payment.
 * 
 * @apiParam {string} orderVendorId - The ID of the order vendor.
 * 
 * @param {object} data - The accepted quote data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderVendorId - The ID of the order vendor.
 * 
 * @apiSuccess {Object} response.quote - The accepted quote.
 * 
 * @apiSuccess {string} response.quote.id - The UUID of the quote.
 * @apiSuccess {number} response.quote.quotedDays - The number of days quoted.
 * @apiSuccess {number} response.quote.priceAfterPlatformFee - The price after platform fee.
 * @apiSuccess {number} response.quote.deliveryCharge - The delivery charge.
 * @apiSuccess {number} response.quote.finalPrice - The final price.
 * @apiSuccess {string} response.quote.notes - The notes of the quote.
 * @apiSuccess {string} response.quote.orderId - The ID of the order.
 * 
 * @apiError {Error} 404 - If the customer, order vendor, or quote/quote timed out are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */ 
export const getAcceptedQuoteById = async(data) => {
    try {
        const { userId, orderVendorId } = data;

        const customer = await customerRepo.exists({ where: { userId: userId } });
        if (!customer) throw sendError("Customer Profile not found", 404);

        const orderVendor = await orderVendorRepo.findOne({ where: { id: orderVendorId }, select: { id: true, status: true, orderId: true } });
        if (orderVendor.status !== ORDER_VENDOR_STATUS.ACCEPTED) throw sendError("Order Request timed out or Order hasn't been accepted by vendor", 404);

        const quote = await orderQuoteRepo.findOne({ where: { orderVendorId: orderVendorId }, select: { id: true, quotedDays: true, priceAfterPlatformFee: true, deliveryCharge: true, finalPrice: true, notes: true } });
        if (!quote) throw sendError("Quote not found", 404);

        return {
            ...quote,
            orderId: orderVendor.orderId
        }
    } catch (error) {
        logger.error("Error getting accepted quote by id", error);
        throw error;
    }
}
//============================ COMPLAINT SERVICES ==============================================

/**
 * @api {post} /api/customer/addComplaint/:orderId Add Complaint
 * @apiName AddComplaint
 * @apiGroup Customer
 * @apiDescription Adds a complaint for a specific order.
 * 
 * @apiParam {string} orderId - The ID of the order.
 * @apiBody {string} complaint - The complaint.
 * 
 * @param {object} data - The complaint data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.orderId - The ID of the order.
 * @param {string} data.complaint - The complaint.
 * 
 * @apiSuccess {string} response.message - The message indicating the success of the operation.
 * @apiSuccess {boolean} response.success - Whether the operation was successful.
 * 
 * @apiError {Error} 400 - If the validation fails.
 * @apiError {Error} 404 - If the customer or order are not found.
 * @apiError {Error} 403 - If the customer is not authorized to add complaint for this order.
 * @apiError {Error} 500 - If an internal server error occurs.
 */ 
export const addComplaint = async (data) => {
    try {
        const { userId, orderId, complaint } = addComplaintSchema.parse(data);

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true }, relations: ["user"] });
        if (!customer) throw sendError("Customer not found", 404);

        const order = await orderRepo.exists({ where: { id: orderId, customerId: customer.id } });
        if (!order) throw sendError("Order ID is invalid or You are not authorized to add complaint for this order", 403);

        const complaintData = AppDataSource.getRepository(Complaints).create({ customerId: customer.id, email: customer.user.email, phoneNumber: customer.user.phoneNumber, name: customer.user.name, orderId, complaint });

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

//============================ PAYMENT SERVICES ==============================================

/**
 * @api {get} /api/customer/getCustomerPayments/:page/:limit Get Customer Payments
 * @apiName GetCustomerPayments
 * @apiGroup Customer
 * @apiDescription Retrieves a paginated list of a customer's payment history (both successful and failed).
 * 
 * @apiParam {string} page - The page number.
 * @apiParam {string} limit - The limit of payments per page.
 * @apiQuery {string} status - The status of the payments (captured, failed).
 * 
 * @param {object} data - The payment data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.page - The page number.
 * @param {string} data.limit - The limit of payments per page.
 * @param {string} data.status - The status of the payments (captured, failed).
 * 
 * @apiSuccess {Object[]} response.payments - The payments.
 * @apiSuccess {Object} response.pagination - The pagination object.
 * 
 * @apiSuccess {string} response.payments.id - The UUID of the payment.
 * @apiSuccess {string} response.payments.order_id - The ID of the order.
 * @apiSuccess {string} response.payments.razorpay_payment_id - The ID of the razorpay payment.
 * @apiSuccess {number} response.payments.payment_amount - The amount of the payment.
 * @apiSuccess {string} response.payments.payment_status - The status of the payment.
 * @apiSuccess {string} response.payments.payment_method - The method of the payment(if captured).
 * @apiSuccess {string} response.payments.reason - The reason of the payment failure(if failed).
 * @apiSuccess {string} response.payments.payment_date - The date of the payment.
 * 
 * @apiSuccess {string} response.pagination.currentPage - The current page number.
 * @apiSuccess {string} response.pagination.hasMore - Whether there are more pages.
 * @apiSuccess {string} response.pagination.nextPage - The next page number.
 * 
 * @apiError {Error} 400 - If the validation fails or invalid status.
 * @apiError {Error} 404 - If the customer or payments are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */ 
export const getCustomerPayments = async (data) => {
    try {
        const { userId, page, limit, status } = getCustomerPaymentsSchema.parse(data);
        const offset = (page - 1) * limit;

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        if (status !== PAYMENT_STATUS.CAPTURED && status !== PAYMENT_STATUS.FAILED) throw sendError("Invalid status", 400);

        let payments;
        if (status === PAYMENT_STATUS.CAPTURED) {
            payments = await paymentRepo.createQueryBuilder("payments")
            .where("payments.customerId = :customerId", { customerId: customer.id })
            .andWhere("payments.paymentStatus = :status", { status: status })
            .select([
                "payments.id AS id", 
                "payments.orderId AS order_id",
                "payments.razorpayPaymentId AS razorpay_payment_id",
                "payments.paymentAmount AS payment_amount",
                "payments.paymentStatus AS payment_status",
                "payments.paymentMethod AS payment_method",
                "payments.paymentDate AS payment_date"
            ])
            .orderBy("payments.paymentDate", "DESC")
            .skip(offset)
            .take(limit)
            .getRawMany();
        } else if (status === PAYMENT_STATUS.FAILED) {
            payments = await paymentFailureRepo.createQueryBuilder("paymentFailures")
            .where("paymentFailures.customerId = :customerId", { customerId: customer.id })
            .andWhere("paymentFailures.status = :status", { status: status })
            .select([
                "paymentFailures.id AS id",
                "paymentFailures.orderId AS order_id",
                "paymentFailures.paymentId AS razorpay_payment_id",
                "paymentFailures.amount AS payment_amount",
                "paymentFailures.status AS payment_status",
                "paymentFailures.reason AS reason",
                "paymentFailures.timestamp AS payment_date"
            ])
            .orderBy("paymentFailures.timestamp", "DESC")
            .skip(offset)
            .take(limit)
            .getRawMany();
        }

        if (!payments) throw sendError("Payments not found", 404);

        return {
            payments,
            pagination: {
                currentPage: page,
                hasMore: payments.length === limit,
                nextPage: payments.length === limit ? page + 1 : null,
            },
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.warn("getCustomerPayments validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
        }
        logger.error("getCustomerPayments error", error);
        throw error;
    }
}

//============================ VENDOR REVIEW SERVICES ==============================================

/**
 * @api {get} /api/customer/getVendorReviews/:vendorId/:page/:limit Get Vendor Reviews
 * @apiName GetVendorReviews
 * @apiGroup Customer
 * @apiDescription Retrieves a paginated list of reviews for a specific vendor.
 * 
 * @apiParam {string} vendorId - The ID of the vendor.
 * @apiParam {string} page - The page number.
 * @apiParam {string} limit - The limit of reviews per page.
 * 
 * @param {object} data - The review data.
 * @param {string} data.userId - The UUID of the user.
 * @param {string} data.vendorId - The ID of the vendor.
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
 * @apiError {Error} 404 - If the customer or reviews are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 */

export const getVendorReviews = async (data) => {
    try {
        const { userId, vendorId, page, limit } = getVendorReviewsSchema.parse(data);
        const offset = (page - 1) * limit;

        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        return cacheOrFetch(`vendorReviews:${vendorId}`, async () => {
            const reviews = await AppDataSource.getRepository(Rating).find({
                where: { vendorId: vendorId }, 
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
            logger.warn("getVendorReviews validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
        }
        logger.error("getVendorReviews error", error);
        throw error;
    }
}

/**
 * @api {get} /api/customer/getAdBanner Get Ad Banner
 * @apiName GetAdBanner
 * @apiGroup Customer
 * @apiDescription Retrieves the ad banner for the customer.Caches for 1 day.
 * 
 * @param {object} data - The ad banner data.
 * @param {string} data.userId - The UUID of the user.
 * 
 * @apiSuccess {Object[]} response.adBanner - The ad banner.
 * 
 * @apiSuccess {string} response.adBanner.key - The key of the ad banner.
 * @apiSuccess {string} response.adBanner.value - The value of the ad banner.
 * 
 * @apiError {Error} 404 - If the customer or ad banner are not found.
 * @apiError {Error} 500 - If an internal server error occurs.
 * @throws {Error} 404 - If the customer is not found.
 */
export const getAdBanner = async (data) => {
    try {
        const { userId } = data;

        const customerExists = await customerRepo.exists({ where: { userId: userId } });
        if (!customerExists) throw sendError("Customer not found", 404);

        const adOptions = ["ad_banner_01", "ad_banner_02", "ad_banner_03", "ad_banner_04"];

        const result = [];

        for (const option of adOptions) {
            const adBanner = await cacheOrFetch(`${option}`, async () => {
                const adBanner = await AppDataSource.getRepository(Settings).findOne({ where: { key: option }, select: { key: true, value: true } });
                return {
                    key: adBanner.key,
                    value: adBanner.value
                };
            }, 60 * 60 * 24);
            result.push(adBanner);
        }

        return result;
    } catch (error) {
        logger.error("Error getting ad banner", error);
        throw error;
    }
}