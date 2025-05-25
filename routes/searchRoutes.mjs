import { Router } from "express";
import *as searchController from '../controllers/searchController.mjs';
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.get('/searchByRating/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByRating, { logRequest: true, logResponse: true }));
router.get('/searchByRatingAndLocation/:lat/:lng/:radiusKm/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByRatingAndLocation, { logRequest: true, logResponse: true }));
router.get('/search/:query/:lat/:lng/:radiusKm/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByQuery, { logRequest: true, logResponse: true })); //GET: /search/query/city eg: /search/vendor1/kochi/100

export default router;