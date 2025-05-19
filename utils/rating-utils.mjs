import { AppDataSource } from "../config/data-source.mjs";
import { Vendor } from "../entities/Vendor.mjs";

export const updatePoplularityScore  = async (id) => {

    const vendorRepo = AppDataSource.getRepository(Vendor);
    const vendor = await vendorRepo.findOne({ where: { id } });

    const minRating = 3;
    const globalAvg = 3.5;
    const C = globalAvg / 5;
    const bayesianRating = (vendor.ratingCount * (vendor.rating/5) + minRating * C) / (vendor.ratingCount + minRating)
    const score = Math.round(bayesianRating * 100)
    vendor.popularityScore = score;
    
    await vendorRepo.save(vendor);
    return null;
}

export const updateRating = async (id, newValue) => {
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const vendor = await vendorRepo.findOne({ where: { id } });

    const totalRating = vendor.rating * vendor.ratingCount;
    const newRatingCount = vendor.ratingCount + 1;
    const newRating = (totalRating + newValue) / newRatingCount;

    vendor.rating = newRating;
    vendor.ratingCount = newRatingCount;

    await vendorRepo.save(vendor);
    return null;
}
