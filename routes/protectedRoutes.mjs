// server/routes/protectedRoute.mjs
import { Router } from 'express';
import { verifyAccessToken } from '../middlewares/auth.mjs';
import { getProtectedData } from '../controllers/protectedController.mjs'; 

// export const protectedRoute = (app) => {
//   app.get('/protected-data', verifyJwtToken, (req, res) => {
    
//     // If the request reached here, the token was verified
//     console.log('User data:', req.user); // Log the user data
//     res.status(200).json({
//       message: 'This is protected data!',
//       user: req.user, // The user data attached by the verifyJwtToken middleware
//     });
//   });
// };

const router = Router();

router.get('/protected-data', verifyAccessToken, getProtectedData); // Use the controller function to handle the request

export default router;