import { Router } from "express";
import *as searchController from '../controllers/searchController.mjs';
import { verifyAccessToken } from "../middlewares/auth.mjs";
import { controllerWrapper } from "../controllers/index.mjs";

const router = Router();

router.get('/searchByRating/:serviceType/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByRating, { logRequest: true, logResponse: true }));
router.get('/searchByNearestLocation/:serviceType/:lng/:lat/:radiusKm/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByNearestLocation, { logRequest: true, logResponse: true }));
router.get('/searchByRatingAndLocation/:serviceType/:lng/:lat/:radiusKm/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByRatingAndLocation, { logRequest: true, logResponse: true }));
router.get('/searchByShopName/:serviceType/:query/:lng/:lat/:radiusKm/:limit/:offset', verifyAccessToken, controllerWrapper(searchController.searchVendorsByShopName, { logRequest: true, logResponse: true })); //GET: /search/query/city eg: /search/vendor1/kochi/100

export default router;