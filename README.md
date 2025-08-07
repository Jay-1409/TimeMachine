# ⏱️ TimeMachine - Productivity Time Tracker

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-brightgreen?logo=googlechrome)](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij) [![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/HarshDev625/TimeMachine) [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![Open Source](https://img.shields.io/badge/Open%20Source-❤️-red.svg)](https://github.com/HarshDev625/TimeMachine)

**TimeMachine** is a powerful, privacy-first Chrome extension that automatically tracks your browsing time across websites and provides detailed productivity insights. Take control of your digital habits with beautiful visualizations, comprehensive reports, and smart analytics.

## 🚀 Quick Start

**[📥 Install from Chrome Web Store](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij)** | **[🔧 Developer Installation](#developer-installation)**

---

## ✨ Key Features

| 🔍 **Auto Tracking** | 📱 **Modern UI** | 📈 **Analytics** | 📄 **Reports** |
|---------------------|-----------------|-----------------|----------------|
| Real-time monitoring | 7 Beautiful themes | Daily/Weekly/Monthly views | PDF generation |
| Session timestamps | Interactive charts | Productivity scoring | Email reports (optional) |
| Smart idle detection | Theme selector | Category breakdown | Session details |
| Domain categorization | Responsive design | Detailed logs | Visual charts |

## 🎨 Themes Gallery

<table>
<tr>
<td align="center"><img src="https://img.shields.io/badge/Light-Theme-blue" alt="Light"/><br/><b>Light</b></td>
<td align="center"><img src="https://img.shields.io/badge/Dark-Theme-purple" alt="Dark"/><br/><b>Dark</b></td>
<td align="center"><img src="https://img.shields.io/badge/Cyberpunk-Theme-magenta" alt="Cyberpunk"/><br/><b>Cyberpunk</b></td>
<td align="center"><img src="https://img.shields.io/badge/Minimal-Theme-gray" alt="Minimal"/><br/><b>Minimal</b></td>
</tr>
<tr>
<td align="center"><img src="https://img.shields.io/badge/Ocean-Theme-cyan" alt="Ocean"/><br/><b>Ocean</b></td>
<td align="center"><img src="https://img.shields.io/badge/Sunset-Theme-orange" alt="Sunset"/><br/><b>Sunset</b></td>
<td align="center"><img src="https://img.shields.io/badge/Forest-Theme-green" alt="Forest"/><br/><b>Forest</b></td>
<td align="center"><img src="https://img.shields.io/badge/More-Coming-lightgray" alt="More"/><br/><b>More Soon</b></td>
</tr>
</table>

---

## 🔒 Privacy-First Design & Setup

### 🛡️ **Your Data, Your Control**
- **Local Storage**: All data stays on your device by default
- **No Tracking**: Extension doesn't monitor or collect user data  
- **Optional Sync**: Choose to enable backend sync for advanced features
- **User-Controlled Email**: Configure your own email service (or skip entirely)

### ⚙️ **Easy Setup**
1. **Install** → Click the Chrome Web Store link above
2. **Enter Email** → Used as identifier (stored locally)
3. **Start Browsing** → Automatic tracking begins immediately  
4. **View Reports** → Check popup for real-time insights

### 📧 **Email Reports (100% Optional)**
- **PDF Only**: Download reports anytime (no setup needed)
- **Email Option**: Configure your own free EmailJS account
- **Complete Guide**: See [EMAILJS_SETUP.md](EMAILJS_SETUP.md) for details

---

## 🛠️ How It Works

**Background Tracking** → **Smart Categorization** → **Beautiful Insights** → **Actionable Reports**

```javascript
// Your data structure (stored locally)
{
  "2025-08-08": {
    "github.com": {
      "sessions": [{"startTime": 1691389200000, "endTime": 1691391000000, "duration": 1800000}],
      "category": "Work", "totalTime": 1800000
    }
  }
}
```

### 🎯 **Smart Categories**
- **Work**: GitHub, Stack Overflow, CodeChef, ChatGPT
- **Social**: Instagram, Reddit, Twitter
- **Professional**: LinkedIn  
- **Entertainment**: YouTube, Netflix
- **Other**: Everything else (customizable)

---

## 🚀 Roadmap & Contributing

### **📋 Next Features** ([View Full Roadmap](FEATURE_ROADMAP.md))
- ⏰ **Smart Break Reminders** with Pomodoro integration
- 📊 **Time Goals & Limits** with achievement badges
- ⚡ **Quick Actions** & keyboard shortcuts
- 🚫 **Focus Mode** with website blocking

### **🤝 Open Source Contributions Welcome!**
- 🐛 **Report Issues**: [GitHub Issues](https://github.com/HarshDev625/TimeMachine/issues)
- 💡 **Feature Requests**: Share your ideas
- 🔧 **Pull Requests**: Code contributions appreciated
- 📖 **Documentation**: Help improve guides and docs

---

## 📊 Technical Details

### **🔧 Tech Stack**
- **Frontend**: Manifest V3, Vanilla JS, Chart.js, CSS3
- **Backend**: Node.js, Express, MongoDB (optional)
- **Privacy**: Local-first with optional cloud sync
- **Email**: User-configured EmailJS (optional)

### **🔐 Permissions**
```json
{"permissions": ["tabs", "activeTab", "storage", "idle", "alarms", "windows"]}
```
**Why?** Monitor browsing, store data locally, detect idle time, handle background tasks

---

## 📄 Documentation & Support

| 📖 **Guides** | 🔗 **Links** |
|---------------|-------------|
| Complete Functionality | [FUNCTIONALITY_OVERVIEW.md](FUNCTIONALITY_OVERVIEW.md) |
| Email Setup (Optional) | [EMAILJS_SETUP.md](EMAILJS_SETUP.md) |
| Feature Roadmap | [FEATURE_ROADMAP.md](FEATURE_ROADMAP.md) |
| Report Issues | [GitHub Issues](https://github.com/HarshDev625/TimeMachine/issues) |
| Discussions | [GitHub Discussions](https://github.com/HarshDev625/TimeMachine/discussions) |

---

## Developer Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/HarshDev625/TimeMachine.git
   cd TimeMachine
   ```

2. **Load Extension**
   - Open Chrome → `chrome://extensions/`
   - Enable **Developer Mode**
   - Click **Load unpacked** → Select `extension` folder

3. **Optional Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env  # Configure MongoDB URI
   npm start
   ```

---

## � Project Stats

![GitHub stars](https://img.shields.io/github/stars/HarshDev625/TimeMachine?style=social) ![GitHub forks](https://img.shields.io/github/forks/HarshDev625/TimeMachine?style=social) ![GitHub issues](https://img.shields.io/github/issues/HarshDev625/TimeMachine) ![GitHub last commit](https://img.shields.io/github/last-commit/HarshDev625/TimeMachine)

---

## �📄 License

**MIT License © 2025 [Harsh Dev](https://github.com/HarshDev625)**

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

---

<div align="center">

**🌟 Star this repo if you find TimeMachine useful! 🌟**

**Made with ❤️ by [Harsh Dev](https://github.com/HarshDev625)**

**[📥 Install from Chrome Web Store](https://chromewebstore.google.com/detail/timemachine/hjkicompionnablkpkgnplnacnnchjij) | [📖 View Documentation](FUNCTIONALITY_OVERVIEW.md) | [🚀 Feature Roadmap](FEATURE_ROADMAP.md)**

</div>
