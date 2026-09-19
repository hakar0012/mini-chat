# Mini Group Chat

A real-time group chat application built with Firebase Realtime Database.

## Features

- 💬 Real-time messaging with multiple rooms
- 👥 User profiles with customizable avatars
- 🎨 Emoji picker with search functionality
- 📊 Interactive polls
- 🖼️ Image and GIF sharing
- 🔔 Desktop notifications
- 📱 Mobile-responsive design
- 👑 Admin dashboard for moderation

## Quick Start

1. Clone this repository
2. Configure Firebase credentials (see Configuration)
3. Open `login.html` in your browser

## Configuration

### Firebase Setup

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Enable Authentication (Email/Password)
3. Create a Realtime Database
4. Copy your config to `js/firebase-init.js`

### Security Rules

Deploy these rules to your Firebase Realtime Database:

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "$uid === auth.uid"
      }
    },
    "rooms": {
      "$roomId": {
        "messages": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

## Project Structure

```
├── index.html          # Main chat interface
├── login.html          # Authentication page
├── profile.html        # User profile editor
├── admin.html          # Admin dashboard
├── css/
│   ├── base.css        # Design tokens, shared styles
│   ├── chat.css        # Chat-specific styles
│   ├── auth.css        # Auth page styles
│   └── admin.css       # Admin panel styles
└── js/
    ├── firebase-init.js    # Firebase configuration
    ├── auth.js             # Login/signup logic
    ├── profile.js          # Profile management
    ├── chat.js             # Chat functionality
    └── admin.js            # Admin operations
```

## Documentation

- [Security Audit Report](SECURITY_AUDIT.md) - Security findings and recommendations
- [Refactoring Plan](REFACTORING_PLAN.md) - Code improvement roadmap

## Development Status

⚠️ **This project is under active development.** 

Please review the security audit and refactoring plan before deploying to production.

## License

MIT License
