import { AppDataSource } from "../config/data-source.mjs";
import { Vendor } from "../entities/Vendor.mjs";
import { User } from "../entities/User.mjs";
import { logger } from "../utils/logger-utils.mjs";
import { sendError } from "../utils/core-utils.mjs";
import { ILike } from "typeorm";
import { searchResults } from "../utils/searchHelpers.mjs";

export const searchVendorsByRating = async () => {
    try {
        const result = await searchResults(0, 0, 0, "rating","");
        if(result.length !== 0) 
            return result;
        return {"message": "no Vendors found"};
    } catch (err) {
        logger.error(err);
        sendError(err);
    }
};

export const searchVendorsByRatingAndLocation = async (params) => {
    try {
        const { lat, lng, radiusKm } = params;
        const result = await searchResults(parseFloat(lat), parseFloat(lng), parseFloat(radiusKm), "ratingAndLocation", "");
        if(result.length !== 0) 
            return result;
        return {"message": "no Vendors found"};
    } catch (err) {
        logger.error(err);
        sendError(err);
    }
};

export const searchVendorsByQuery = async (params) => {
    try {
        const { query, lat, lng, radiusKm } = params;

        const vendorRepo = AppDataSource.getRepository(Vendor);
        
        let vendors = await vendorRepo.find({       // Name wise search
            where: {
                fullName: ILike(`%${query}%`),      // ILIKE is case insensitive
            },
        });

        if(vendors.length !== 0) {
            console.log("name wise search")
            const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "fullName", query);
            return results;
        }
        else if(vendors.length === 0) {         // Shop name wise search
            vendors = await vendorRepo.find({
                where: {
                    shopName: ILike(`%${query}%`),
                },
            });
            if(vendors.length !== 0) {
                const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "shopName", query);
                return results;
            } else {
                vendors = await vendorRepo.find({   // serviceType wise search
                    where: {
                        serviceType: ILike(`%${query}%`),
                    },
                });

                if(vendors.length !== 0) {
                    const results = await searchResults(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm), "serviceType", query);
                    return results;
                }
            }
        }
        return {"message": "No vendors found"};
    } catch (err) {
        logger.error(err);
        sendError(err);
    }
};  