// Update these in index.js to implement the secure authentication system

// Add these to the top where you import routes
const { router: authRoutes, authenticateToken } = require("./routes/auth");
const deviceManagementRoutes = require("./routes/device-management");

// Add these to your routes section, before other routes
app.use("/api/auth", authRoutes);
app.use("/api/device", deviceManagementRoutes);

// Update existing routes to use authentication middleware
app.use("/api/time-data", authenticateToken, timeDataRoutes);
app.use("/api/report", authenticateToken, reportRoutes);
app.use("/api/user", authenticateToken, userRoutes);
app.use("/api/admin", authenticateToken, adminRoutes);

// Don't forget to add JWT_SECRET to your .env file:
// JWT_SECRET=your_secure_random_string

// Also add email service credentials:
// EMAIL_SERVICE=gmail
// EMAIL_USER=your_email@gmail.com
// EMAIL_PASSWORD=your_app_password
