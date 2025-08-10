# TimeMachine

<div align="center">

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-brightgreen?logo=googlechrome)](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij)
[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/HarshDev625/TimeMachine)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/HarshDev625/TimeMachine/pulls)

</div>

<p align="center">
  <img src="extension/icon128.png" width="128" height="128" alt="TimeMachine Logo">
</p>

<h3 align="center">Track your online time and boost productivity</h3>

<p align="center">
  TimeMachine is a Chrome extension that helps you understand your browsing habits, visualize your online time, and increase productivity with actionable insights.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#setup-and-configuration">Setup & Configuration</a> •
  <a href="#development">Development</a> •
  <a href="#security">Security</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

## Features

- 📊 **Automatic Time Tracking**: See where your online time goes with automatic website tracking
- 🔍 **Insightful Categories**: Know if you're spending time on work, social media, entertainment, or other activities
- 📱 **Multi-Device Support**: Securely access your data across multiple devices
- 🔒 **Privacy-Focused**: Your data stays on your devices and our secure server
- 📄 **Detailed Reports**: Generate and schedule PDF reports of your browsing habits
- 🌓 **Multiple Themes**: Choose from 7 beautiful themes including Light, Dark, Cyberpunk, and more
- ⏱️ **Focus Timer**: Built-in Pomodoro timer to boost productivity
- 🔔 **Scheduled Reports**: Set up automatic email reports daily, weekly, or monthly

## Installation

### Chrome Web Store (Recommended)

1. Visit the [TimeMachine Chrome Web Store page](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij)
2. Click "Add to Chrome"
3. Follow the setup instructions after installation

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/HarshDev625/TimeMachine/releases)
2. Unzip the downloaded file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the unzipped folder
6. The extension should now be installed and active

## Screenshots

<div align="center">
  <img src="https://github.com/HarshDev625/TimeMachine/raw/main/screenshots/dashboard.png" width="600" alt="TimeMachine Dashboard">
  <p><em>Daily productivity dashboard with time breakdown</em></p>
  
  <img src="https://github.com/HarshDev625/TimeMachine/raw/main/screenshots/themes.png" width="600" alt="TimeMachine Themes">
  <p><em>Multiple themes to match your style</em></p>
  
  <img src="https://github.com/HarshDev625/TimeMachine/raw/main/screenshots/reports.png" width="600" alt="TimeMachine Reports">
  <p><em>Detailed productivity reports</em></p>
</div>

## Setup and Configuration

### First-Time Setup

1. After installing the extension, click on the TimeMachine icon in your browser toolbar
2. Enter your email address when prompted
3. Complete the device verification process by entering the verification code sent to your email
4. You're all set! TimeMachine will now track your browsing activity

### Email Reports Configuration

See [EMAIL_SETUP_GUIDE.md](EMAIL_SETUP_GUIDE.md) for detailed instructions on setting up email services for verification and reports.

### Report Scheduling

1. Open the TimeMachine extension
2. Go to Settings
3. Scroll to "Automated Reports"
4. Toggle "Enable" to turn on automated reports
5. Select your preferred frequency (Daily, Weekly, Monthly)
6. Set the time when you want to receive reports
7. Toggle "No Activity" if you want reports even on days with no tracking

## Development

### Backend Setup

1. Clone the repository
   ```
   git clone https://github.com/HarshDev625/TimeMachine.git
   cd TimeMachine/backend
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file with your configuration
   ```
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   EMAIL_SERVICE=gmail
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_app_password
   ```

4. Start the development server
   ```
   npm run dev
   ```

### Architecture

#### Frontend (Chrome Extension)

- **background.js**: Core tracking logic for monitoring browser activity
- **popup.js**: User interface and data visualization components
- **config.js**: Environment configuration and backend URL management
- **report-scheduler.js**: Scheduling logic for automated reports
- **device-authentication.js**: Device verification and security

#### Backend (Node.js)

- **Models**:
  - User.js: User account management
  - TimeData.js: Time tracking data storage
  - Feedback.js: User feedback collection

- **Routes**:
  - auth.js: Authentication endpoints
  - timeData.js: Time tracking data endpoints
  - report.js: Report generation endpoints
  - device-management.js: Device authentication endpoints

- **Utils**:
  - cronJobs.js: Scheduled maintenance tasks
  - dataCleanup.js: Data retention and cleanup

### Extension Development

1. Navigate to the extension directory
   ```
   cd TimeMachine/extension
   ```

2. Load the unpacked extension in Chrome
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the extension folder

3. Make your changes and reload the extension to see them

### API Documentation

For detailed API documentation, see the [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) file.

## Security

TimeMachine implements multiple security measures to protect your data:

### Device-Based Authentication

- Each device generates a unique device ID
- New devices require email verification
- Users can manage and revoke access for any device
- Prevents unauthorized access even if someone knows your email

### Email Authentication

- Verification codes sent via email
- JWT tokens for secure API requests
- Server-side verification of all requests

### Data Privacy

- Email addresses are hashed using SHA-256
- Only the first 3 characters and domain are displayed in the UI
- Data is only accessible to the verified user
- Option to delete all your data at any time

## Contributing

We welcome contributions from everyone! Please see our [contributing guidelines](CONTRIBUTING.md) for more information on how to get started.

### Areas We Need Help With

- Firefox extension port
- Improved data visualization
- Additional productivity features
- Test coverage
- Documentation improvements

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Chart.js](https://www.chartjs.org/) for data visualization
- [EmailJS](https://www.emailjs.com/) for email functionality
- All our open source contributors

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/HarshDev625">HarshDev625</a>
</p>

<p align="center">
  <a href="https://github.com/HarshDev625/TimeMachine/issues">Report Bug</a> •
  <a href="https://github.com/HarshDev625/TimeMachine/issues">Request Feature</a>
</p>
