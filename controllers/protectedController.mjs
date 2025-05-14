export const getProtectedData = (req, res) => {
  console.log('User data:', req.user); // log user from JWT
  res.status(200).json({
    message: 'This is protected data!',
    user: req.user,
  });
};
