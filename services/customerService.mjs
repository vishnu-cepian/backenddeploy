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

const customerRepo = AppDataSource.getRepository(Customers);
const customerAddressRepo = AppDataSource.getRepository(CustomerAddress);

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
                "vendors.shopType",
                "vendors.shopDescription",
                "vendors.serviceType",
                "vendors.vendorServices",
                "vendors.city",
                "vendors.street",
                "vendors.location",
                "vendors.shopImageUrlPath",
                "vendors.vendorAvatarUrlPath",
                "vendors.allTimeRating",
                "vendors.allTimeReviewCount",
                "vendors.currentMonthRating",
                "vendors.currentMonthReviewCount",
                "vendors.currentMonthBayesianScore",
                "vendors.status",
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
                    shopType: vendor.shopType,
                    shopDescription: vendor.shopDescription,
                    serviceType: vendor.serviceType,
                    city: vendor.city,
                    street: vendor.street,
                    location: vendor.location,
                    shopImageUrl: shopImageUrl,
                    vendorAvatarUrl: avatarUrl,
                    allTimeRating: vendor.allTimeRating,
                    allTimeReviewCount: vendor.allTimeReviewCount,
                    currentMonthRating: vendor.currentMonthRating,
                    currentMonthReviewCount: vendor.currentMonthReviewCount,
                    currentMonthBayesianScore: vendor.currentMonthBayesianScore,
                    status: vendor.status,
                }
            };
        }, 300);
    } catch (error) {
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
        logger.error("Error getting vendor work images by vendor id", error);
        throw error;
    }
}