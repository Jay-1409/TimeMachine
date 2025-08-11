# TimeMachine User Guide

This guide provides quick setup instructions for your TimeMachine browser extension.

## Getting Started

### Creating Your Account

1. Click the TimeMachine icon in your browser toolbar
2. Click "Create Account"
3. Enter your email address and password (minimum 6 characters)
4. Click "Sign Up"
5. You're all set! TimeMachine will automatically start tracking your browsing time

### Logging In

If you already have an account:

1. Click the TimeMachine icon in your browser toolbar
2. Enter your email address and password
3. Click "Log In"
4. Your time tracking data will sync across all your devices

### Email Reports Setup

To receive automated productivity reports by email:

1. Click the gear icon (⚙️) in the top-right corner
2. Under "Email Service", select "EmailJS (Free - Recommended)"
3. Create a free account at [EmailJS](https://www.emailjs.com/)
4. In EmailJS dashboard, create an Email Service and Email Template
5. Copy your Service ID, Template ID, and Public Key
6. Enter these details in the TimeMachine settings
7. Click "Save Email Config"
8. Click "Test Email" to verify your setup

### Report Scheduling

1. In settings, scroll down to "Automated Reports"
2. Toggle the switch to enable automated reports
3. Choose your preferred frequency (Daily, Weekly, Monthly)
4. Set the time when you want to receive reports
5. Toggle "No Activity" if you want reports even on days with no tracking

## Customizing Your Experience

### Change Theme

1. Click the palette icon (🎨) in the top-left corner
2. Choose from 7 beautiful themes:
   - Light (default)
   - Dark
   - Cyberpunk
   - Minimal
   - Ocean
   - Sunset
   - Forest

### Using Focus Timer

1. On the main dashboard, find the "Focus Timer" card
2. Click "Start Focus" to begin a 25-minute focus session
3. Work until the timer ends
4. Take a 5-minute break
5. Repeat as needed

## Device Security

Your account supports multiple devices with enhanced security:

- Your credentials are securely stored using strong encryption
- Each device is tracked with unique identifiers
- You can access your data across multiple devices
- If you suspect unauthorized access, you can change your password at any time

## Troubleshooting

### Email Reports Not Arriving

1. Check your spam folder
2. Verify your EmailJS configuration in settings
3. Make sure your template includes the required variables:
   - `{{to_email}}`, `{{subject}}`, `{{message}}`
4. Try sending a test email

### Password Issues

If you forgot your password:

1. Click "Forgot Password" on the login screen
2. Enter your email address
3. Check your email for password reset instructions
4. Follow the link to create a new password

### Other Issues

If you encounter any problems:

1. Click the gear icon (⚙️) to access settings
2. Scroll down to "Feedback"
3. Describe the issue and click "Send Feedback"

---

For more detailed information, visit our [GitHub repository](https://github.com/HarshDev625/TimeMachine).
