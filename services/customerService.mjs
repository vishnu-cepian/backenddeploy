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
import { SERVICE_TYPE } from "../types/enums/index.mjs";

const customerRepo = AppDataSource.getRepository(Customers);
const customerAddressRepo = AppDataSource.getRepository(CustomerAddress);
const orderRepo = AppDataSource.getRepository(Orders);

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
})

//============================ CUSTOMER SERVICE FUNCTIONS ==============================================

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

export const getVendorWorkImagesByVendorId = async (data) => {
    try {
        const { vendorId } = vendorIdSchema.parse(data);

        return cacheOrFetch(`vendorWorkImagesByVendorId:${vendorId}`, async () => {
            const vendor = await AppDataSource.getRepository(Vendors).findOne({ where: { id: vendorId }, select: { id: true } });
            if (!vendor) throw sendError("Vendor profile not found", 404);

            const vendorImages = await AppDataSource.getRepository(VendorImages).find({
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

export const getOrders = async (data) => {
    try {
        const { userId, serviceType } = getOrdersSchema.parse(data);
        const customer = await customerRepo.findOne({ where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found");

        const orders = await orderRepo.find({ where: { customerId: customer.id, serviceType: serviceType }, select: { id: true, orderName: true, serviceType: true, orderStatus: true, requiredByDate: true, createdAt: true } });
        if (!orders) throw sendError("Orders not found");

        return orders;
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.warn("getOrders validation failed", { errors: error.flatten().fieldErrors });
            throw sendError("Invalid parameters provided.", 400, error.flatten().fieldErrors);
        }
        logger.error("getOrders error", error);
        throw error;
    }
}

export const getOrderById = async (data) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { userId, orderId } = data;

        const customer = await queryRunner.manager.findOne(Customers, { where: { userId: userId }, select: { id: true } });
        if (!customer) throw sendError("Customer not found", 404);

        const order = await queryRunner.manager.findOne(Orders, { where: { id: orderId } });
        if (!order) throw sendError("Order not found", 404);

        if (order.customerId !== customer.id) throw sendError("You are not authorized to view this order", 403);

        const orderItems = await queryRunner.manager.find(OrderItems, { where: { orderId: orderId } });
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

        await queryRunner.commitTransaction();
        
        return {
            order: orderDetailsWithoutAddress,
            address: {
                fullName,
                phoneNumber,
                addressLine1,
                addressLine2,
                district,
                state,
                street,
                city,
                pincode,
                landmark,
                addressType
            },
            orderItems: processedOrderItems
        };
    } catch (err) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        logger.error(err);
        throw err;
    } finally {
        await queryRunner.release();
    }
}