# WatchBuddy v0.5.1 Release Notes

## 🔒 Privacy & Analytics Improvements

### ✨ New Features
- **Anonymous Usage Analytics**: Optional analytics to help understand usage patterns and guide development
- **User-Controlled Privacy**: Complete control over data sharing in extension settings
- **Improved Privacy Policy**: Comprehensive privacy policy with detailed explanations

### 🛠️ Technical Improvements
- **Enhanced Error Handling**: Better handling of extension context invalidation errors
- **CORS Fix**: Analytics requests now properly routed through background script
- **Graceful Degradation**: Extension functions normally even when analytics fails

### 📊 Analytics Features (Optional)
- **Installation Tracking**: Count unique installs (not repeated launches)
- **Usage Statistics**: Track voice queries and subtitle loading patterns
- **Error Monitoring**: Anonymous error reporting for faster bug fixes
- **User Control**: Easily enable/disable in extension popup settings

### 🔧 Technical Details
- Fixed "Extension context invalidated" errors during extension reloads
- Improved subtitle loading statistics (API vs Manual, Cached vs Fresh)
- Enhanced background script message handling
- Better Chrome extension context validation

### 📝 Privacy Highlights
- **Zero Personal Data**: No personal information, conversation content, or video history collected
- **Anonymous Only**: All analytics use randomly generated identifiers
- **User Choice**: Analytics disabled by user preference respected immediately
- **Transparent**: Full privacy policy accessible in extension settings

### 🚀 Performance
- No impact on core functionality when analytics disabled
- Efficient background processing for analytics
- Minimal data transmission (only event counters)

---

## 📥 Installation
Download from Chrome Web Store or install manually from GitHub releases.

## 🔄 Upgrade Notes
- Existing users: Analytics is enabled by default but can be disabled in settings
- No breaking changes to existing functionality
- All previous features remain unchanged

## 🌟 What's Next
Based on usage analytics (if you opt in), we'll focus on the most-used features and fix the most common issues to make WatchBuddy even better!

---

**Download**: [Chrome Web Store](link) | [GitHub Release](https://github.com/skyjinxx/WatchBuddy/releases/tag/v0.5.1)  
**Privacy Policy**: [View Full Policy](https://skyjinxx.github.io/WatchBuddyPrivacyPolicy) 