import { Router } from "express";
import *as searchController from '../controllers/searchController.mjs';
import { verifyAccessToken } from "../middlewares/auth.mjs";

const router = Router();

router.get('/searchByRating/:limit/:offset', verifyAccessToken, searchController.searchVendorsByRating);
router.get('/searchByRatingAndLocation/:lat/:lng/:radiusKm/:limit/:offset', verifyAccessToken, searchController.searchVendorsByRatingAndLocation);
router.get('/search/:query/:lat/:lng/:radiusKm/:limit/:offset', verifyAccessToken, searchController.searchVendorsByQuery); //GET: /search/query/city eg: /search/vendor1/kochi/100

export default router;