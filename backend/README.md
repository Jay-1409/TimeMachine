# TimeMachine Backend

A simplified and robust backend service for the TimeMachine time tracking application. This backend provides secure authentication, time data synchronization, and feedback collection capabilities.

## Overview

The TimeMachine backend is built with Express.js and MongoDB, featuring:
- **Simple Authentication**: Email/password login with JWT tokens
- **Time Data Sync**: Synchronize time tracking data across devices
- **Feedback System**: Collect and manage user feedback
- **Chrome Extension Integration**: Optimized for Chrome extension communication

## Architecture

### Core Components

1. **Authentication System** (`routes/auth.js`)
   - Email/password registration and login
   - JWT token generation (30-day expiration)
   - Device tracking for multi-device support
   - Secure password hashing with PBKDF2

2. **Time Data Management** (`routes/timeData.js`)
   - Sync time tracking sessions across devices
   - Store and retrieve time data by date ranges
   - Support for categories and productivity tracking

3. **Feedback Collection** (`routes/feedback.js`)
   - Authenticated feedback submission
   - Feedback management and retrieval

### Database Models

#### User Model (`models/User.js`)
```javascript
{
  email: String (unique),
  password: String (hashed),
  devices: [String], // Device identifiers
  createdAt: Date,
  lastLoginAt: Date
}
```

#### TimeData Model (`models/TimeData.js`)
```javascript
{
  email: String,
  date: String (YYYY-MM-DD),
  sessions: [{
    startTime: Date,
    endTime: Date,
    category: String,
    isProductive: Boolean
  }],
  totalTime: Number,
  productiveTime: Number
}
```

#### Feedback Model (`models/Feedback.js`)
```javascript
{
  email: String,
  subject: String,
  message: String,
  timestamp: Date,
  resolved: Boolean
}
```

## API Endpoints

### Authentication Endpoints

#### POST `/auth/signup`
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "deviceId": "unique-device-id"
}
```

**Response:**
```json
{
  "message": "User created successfully",
  "token": "jwt-token-here",
  "user": {
    "email": "user@example.com",
    "devices": ["unique-device-id"]
  }
}
```

#### POST `/auth/login`
Authenticate user and get access token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "deviceId": "unique-device-id"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt-token-here",
  "user": {
    "email": "user@example.com",
    "devices": ["device1", "device2"]
  }
}
```

#### GET `/auth/verify`
Verify JWT token validity (requires Authorization header).

**Headers:**
```
Authorization: Bearer jwt-token-here
```

**Response:**
```json
{
  "message": "Token is valid",
  "user": {
    "email": "user@example.com",
    "devices": ["device1", "device2"]
  }
}
```

#### GET `/auth/profile`
Get user profile information (requires authentication).

### Time Data Endpoints

#### POST `/timeData/sync`
Sync time tracking data (requires authentication).

**Request Body:**
```json
{
  "date": "2024-01-15",
  "sessions": [
    {
      "startTime": "2024-01-15T09:00:00Z",
      "endTime": "2024-01-15T10:30:00Z",
      "category": "Work",
      "isProductive": true
    }
  ],
  "totalTime": 5400,
  "productiveTime": 5400
}
```

#### GET `/timeData/get?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
Retrieve time data for date range (requires authentication).

### Feedback Endpoints

#### POST `/feedback/submit`
Submit user feedback (requires authentication).

**Request Body:**
```json
{
  "subject": "Feature Request",
  "message": "Would love to see weekly reports feature"
}
```

#### GET `/feedback/list`
List all feedback submissions (requires authentication).

### System Endpoints

#### GET `/health`
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

#### GET `/status`
Detailed system status.

**Response:**
```json
{
  "status": "OK",
  "database": "Connected",
  "uptime": "2h 15m 30s",
  "timestamp": "2024-01-15T10:00:00Z"
}
```

## Security Features

### Password Security
- **PBKDF2 Hashing**: Passwords are hashed using PBKDF2 with 1000 iterations
- **Salt Generation**: Each password uses a unique salt
- **No Plain Text Storage**: Passwords are never stored in plain text

### JWT Authentication
- **30-Day Expiration**: Tokens expire after 30 days for security
- **Bearer Token**: Standard Authorization header format
- **Device Tracking**: Multiple devices supported per user

### CORS Configuration
- **Chrome Extension Support**: Configured to work with Chrome extensions
- **Dynamic Origin Checking**: Supports various Chrome extension protocols
- **Secure Headers**: Proper CORS headers for security

## Chrome Extension Integration

The backend is specifically configured to work seamlessly with Chrome extensions:

### Token Storage Synchronization
- Extension uses both `localStorage` and `chrome.storage.local`
- Automatic token synchronization across extension components
- Fallback mechanisms for token retrieval

### CORS Configuration
Supports Chrome extension origins:
- `chrome-extension://`
- `moz-extension://`
- Development localhost origins

## Setup and Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn package manager

### Installation Steps

1. **Clone and Navigate**
   ```bash
   cd backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file with:
   ```env
   MONGODB_URI=mongodb://localhost:27017/timemachine
   JWT_SECRET=your-super-secure-jwt-secret-key
   PORT=3000
   ```

4. **Start the Server**
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

### Verification

After starting the server, verify it's working:

1. **Health Check**: Visit `http://localhost:3000/health`
2. **Status Check**: Visit `http://localhost:3000/status`

## Error Handling

The backend provides comprehensive error handling:

### Authentication Errors
- **401 Unauthorized**: Invalid or missing token
- **409 Conflict**: Email already exists during signup
- **404 Not Found**: User not found during login

### Validation Errors
- **400 Bad Request**: Missing required fields
- **422 Unprocessable Entity**: Invalid data format

### Server Errors
- **500 Internal Server Error**: Database or server issues
- **503 Service Unavailable**: MongoDB connection issues

## Development

### File Structure
```
backend/
├── index.js              # Main server configuration
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create this)
├── models/
│   ├── User.js           # User authentication model
│   ├── TimeData.js       # Time tracking data model
│   └── Feedback.js       # Feedback collection model
└── routes/
    ├── auth.js           # Authentication endpoints
    ├── timeData.js       # Time data sync endpoints
    └── feedback.js       # Feedback management endpoints
```

### Available Scripts
- `npm start`: Start production server
- `npm run dev`: Start development server with nodemon
- `npm run setup`: Install dependencies and show setup instructions

## Production Considerations

### Environment Variables
Ensure these are set in production:
- `MONGODB_URI`: Production MongoDB connection string
- `JWT_SECRET`: Strong, unique secret key
- `PORT`: Server port (default: 3000)

### Security Recommendations
1. Use HTTPS in production
2. Set strong JWT secret (minimum 32 characters)
3. Configure MongoDB with authentication
4. Use environment variables for sensitive data
5. Enable MongoDB connection encryption

### Performance Optimization
- Enable MongoDB indexing on frequently queried fields
- Consider connection pooling for high traffic
- Implement rate limiting for production use
- Add request logging and monitoring

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check MongoDB service is running
   - Verify MONGODB_URI in .env file
   - Ensure MongoDB port (27017) is accessible

2. **JWT Token Issues**
   - Verify JWT_SECRET is set in .env
   - Check token expiration (30 days)
   - Ensure proper Authorization header format

3. **CORS Errors**
   - Backend is configured for Chrome extensions
   - For web development, update CORS settings in index.js

### Logs and Debugging
The server logs important events:
- MongoDB connection status
- Server startup confirmation
- Authentication attempts
- Error details for troubleshooting

## Contributing

When making changes to the backend:

1. **Maintain Security**: Always hash passwords, validate inputs
2. **Error Handling**: Provide meaningful error messages
3. **Documentation**: Update API documentation for new endpoints
4. **Testing**: Test authentication flow and data sync
5. **Chrome Extension Compatibility**: Ensure CORS settings remain compatible

## License

This project is part of the TimeMachine time tracking application.
